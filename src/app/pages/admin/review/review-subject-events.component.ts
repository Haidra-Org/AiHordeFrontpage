import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Params, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  EMPTY,
  Subject,
  catchError,
  distinctUntilChanged,
  filter,
  map,
  merge,
  switchMap,
  tap,
} from 'rxjs';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';
import { IconComponent } from '../../../components/icon/icon.component';
import { parseHordeTime } from '../../../helper/horde-time';
import { extractApiErrorField } from '../../../helper/extract-api-error';
import {
  PromptModerationEvent,
  PromptModerationEventQuery,
  PromptModerationReason,
} from '../../../types/moderation';
import {
  EVENT_NOTE_LIMIT,
  SubjectRef,
  caseParams,
  eventFilterOf,
  hordeInstant,
  pluralKey,
  refusalKey,
  workerParams,
} from './review-subjects';
import { PromptFilter, promptPivotParams } from './review-query';

/** The per-report forms, as their `data-form` and `data-opens` attributes name them. */
type EventForm = 'note' | 'hold' | 'release';

/** Events per page when the list reads on past what the detail brought. */
export const EVENT_PAGE_SIZE = 50;

/**
 * The first page of reports a detail brought: the newest overall, or the
 * newest in a brushed range, with the cursor to read on from.
 */
export interface ReportsPage {
  events: PromptModerationEvent[];
  cursor: number | null;
  /** The range the page is narrowed to; absent for the whole window. */
  since?: Date;
  until?: Date;
}

/**
 * One stage of an event's text as drawn. `sameKey` is set when the text is
 * the stage before it again, and says so in place of the text.
 */
export interface PromptStage {
  labelKey: string;
  text: string;
  sameKey: string | null;
}

const STAGE_SUBMITTED = 'admin.review.reports.events.stage_submitted';
const STAGE_AFTER_STYLES = 'admin.review.reports.events.stage_after_styles';

/** How a stage says it repeats the stage drawn before it, by that stage. */
const SAME_AS: Readonly<Record<string, string>> = {
  [STAGE_SUBMITTED]: 'admin.review.reports.events.stage_same_as_submitted',
  [STAGE_AFTER_STYLES]:
    'admin.review.reports.events.stage_same_as_after_styles',
};

/**
 * The stages an event has, in order. A prompt sent without a style reaches
 * the filter unchanged, so its second stage often repeats the first word for
 * word; a repeat keeps its heading, so the sequence still reads in full.
 */
export function promptStages(event: PromptModerationEvent): PromptStage[] {
  const stages: [string, string | null][] = [
    [STAGE_SUBMITTED, event.submitted_prompt],
    [STAGE_AFTER_STYLES, event.moderation_prompt],
    ['admin.review.reports.events.stage_effective', event.effective_prompt],
  ];
  const drawn: PromptStage[] = [];
  for (const [labelKey, text] of stages) {
    if (text === null) continue;
    const previous = drawn.at(-1);
    drawn.push({
      labelKey,
      text,
      sameKey:
        previous?.text === text ? (SAME_AS[previous.labelKey] ?? null) : null,
    });
  }
  return drawn;
}

interface EventList {
  events: PromptModerationEvent[];
  cursor: number | null;
  loading: boolean;
  failed: boolean;
}

/**
 * Reports from the prompt log, newest first. Inside a subject's or a
 * worker's detail the first page comes with the detail, so opening one or
 * settling a range reads nothing here, and a report the latest decision
 * covered is marked so. Given a `query` instead, the list reads its own
 * first page. Either way "Load more" reads on from the cursor with the same
 * filters and range; nothing pages on its own, since every read counts
 * against the moderators' per-minute budget.
 *
 * Prompt text stays hidden until the moderator asks for it, one event at a
 * time, or for every rejected prompt loaded at once. A worker report is only
 * ever shown one at a time. Opening another subject, range or query, or
 * closing the report, hides it again, and nothing about it is stored. Notes
 * are not hidden: moderators write them to be read.
 */
@Component({
  selector: 'app-review-subject-events',
  imports: [
    TranslocoPipe,
    DatePipe,
    NgTemplateOutlet,
    RouterLink,
    IconComponent,
  ],
  templateUrl: './review-subject-events.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewSubjectEventsComponent {
  private readonly moderation = inject(AdminModerationService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** The subject whose reports these are; null on a worker's page. */
  public readonly ref = input<SubjectRef | null>(null);
  /** The worker whose reports these are, in place of a subject. */
  public readonly workerId = input<string | null>(null);
  /** The first page, from the detail; null while the detail is read. */
  public readonly page = input<ReportsPage | null>(null);
  /** The newest event the latest decision covers, or null without one. */
  public readonly watermark = input<number | null>(null);
  /** Worker names by id, from the detail, for the worker links. */
  public readonly workerNames = input<ReadonlyMap<string, string>>(new Map());
  /** Whether each report offers to pause its worker; a worker's own page does not. */
  public readonly canPause = input(true);
  /**
   * Filters for a list that reads its own first page, as the Prompts tab
   * mounts it; null inside a detail, which brings the page. The Prompts tab
   * also passes null until it knows its query, which shows the list loading.
   */
  public readonly query = input<PromptModerationEventQuery | null>(null);
  /** The reasons shown out of those loaded; null shows every one. */
  public readonly reasons = input<ReadonlySet<PromptModerationReason> | null>(
    null,
  );

  /** A moderator asked to pause the worker that made a report. */
  public readonly pauseWorker = output<string>();

  public readonly noteLimit = EVENT_NOTE_LIMIT;
  public readonly hordeTime = parseHordeTime;
  public readonly caseParams = caseParams;
  public readonly workerParams = workerParams;
  public readonly plural = pluralKey;

  /** The subject's kind, or null for a worker's reports. */
  public readonly kind = computed(() => this.ref()?.kind ?? null);
  /** Whether the list reads its own pages rather than a detail's. */
  public readonly standalone = computed(() => this.query() !== null);
  /**
   * Whether the collapsed row names the account. It is left out only where
   * every report belongs to one account, so a list spanning accounts can be
   * scanned for who sent what without opening each report.
   */
  public readonly accountInRow = computed(() => {
    const kind = this.kind();
    if (kind === 'account' || kind === 'proxied_account') return false;
    return this.query()?.user_id === undefined;
  });
  /** Whether a subject can be opened in Reports. */
  public readonly casesAvailable = computed(
    () => this.moderation.subjectsAvailability() === 'available',
  );
  /** Whether a worker's reports can be opened in Reports. */
  public readonly workerReportsAvailable = computed(
    () => this.moderation.reportingWorkersAvailability() === 'available',
  );
  /** Whether the list is narrowed to a brushed range. */
  public readonly inRange = computed(() => this.page()?.since !== undefined);

  /** The reports shown: the detail's page, and any read on from it. */
  public readonly list = linkedSignal<ReportsPage | null, EventList>({
    source: this.page,
    computation: (page) =>
      page
        ? {
            events: page.events,
            cursor: page.cursor,
            loading: false,
            failed: false,
          }
        : { events: [], cursor: null, loading: true, failed: false },
  });

  /**
   * The reports opened past their one-line row. Opening one never shows
   * its prompt text; that stays behind its own control inside.
   */
  public readonly expanded = signal<ReadonlySet<number>>(new Set());

  /** The one event whose prompt text is showing, if any. */
  public readonly revealedId = signal<number | null>(null);

  /**
   * Whether the text of every rejected prompt loaded is showing, including
   * those loaded while it stays on. Worker reports are left out.
   */
  public readonly rejectionsRevealed = signal(false);

  /** The loaded reports whose reason is shown. */
  public readonly shownEvents = computed(() => {
    const events = this.list().events;
    const reasons = this.reasons();
    return reasons
      ? events.filter((event) => reasons.has(event.reason))
      : events;
  });

  /**
   * Whether the loaded reports come from a horde that keeps evidence holds,
   * read from the rows the way each row's hold controls are.
   */
  public readonly holdsShown = computed(() =>
    this.list().events.some((event) => this.canHold(event)),
  );

  /** Whether the reason filter hides any loaded report. */
  public readonly narrowed = computed(
    () => this.shownEvents().length < this.list().events.length,
  );

  /** A first page asked for again after it failed. */
  private readonly retries = new Subject<void>();

  /** The event a note is being written for, and the note so far. */
  public readonly noteFor = signal<number | null>(null);
  public readonly noteDraft = signal('');
  public readonly savingNote = signal(false);
  /** An event offers hold controls only when the horde returned the hold field. */
  public canHold(event: PromptModerationEvent): boolean {
    return 'held_until' in event;
  }

  public readonly holdFor = signal<number | null>(null);
  public readonly holdDays = signal(30);
  public readonly holdNote = signal('');
  public readonly savingHold = signal(false);
  public readonly releaseFor = signal<number | null>(null);
  public readonly releaseNote = signal('');

  constructor() {
    const query$ = toObservable(this.query).pipe(
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    );
    merge(toObservable(this.page), query$)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.revealedId.set(null);
        this.rejectionsRevealed.set(false);
        this.expanded.set(new Set());
        this.noteFor.set(null);
        this.noteDraft.set('');
        this.holdFor.set(null);
        this.holdNote.set('');
        this.releaseFor.set(null);
        this.releaseNote.set('');
      });

    merge(query$, this.retries.pipe(map(() => this.query())))
      .pipe(
        filter((query): query is PromptModerationEventQuery => query !== null),
        tap(() =>
          this.list.set({
            events: [],
            cursor: null,
            loading: true,
            failed: false,
          }),
        ),
        switchMap((query) =>
          this.moderation
            .getPromptEvents({ ...query, limit: EVENT_PAGE_SIZE })
            .pipe(
              catchError((error: unknown) => {
                this.failRead(error);
                return EMPTY;
              }),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((first) =>
        this.list.set({
          events: first.events,
          cursor: first.next_cursor,
          loading: false,
          failed: false,
        }),
      );
  }

  /** The newest event on the page, to record a decision as covering what was seen. */
  public newestLoadedId(): number | null {
    const ids = this.list().events.map((event) => event.id);
    return ids.length ? Math.max(...ids) : null;
  }

  /** Whether a report is one the latest decision already covered. */
  public isCovered(event: PromptModerationEvent): boolean {
    const watermark = this.watermark();
    return watermark !== null && event.id <= watermark;
  }

  public workerName(id: string): string {
    return this.workerNames().get(id) ?? id;
  }

  public reasonKey(reason: PromptModerationReason): string {
    return `admin.review.reason.${reason}`;
  }

  public outcomeKey(outcome: PromptModerationEvent['outcome']): string {
    return `admin.review.event_outcome.${outcome}`;
  }

  public isExpanded(id: number): boolean {
    return this.expanded().has(id);
  }

  /** Open or close a report; closing one also hides its text. */
  public toggleExpanded(id: number): void {
    this.expanded.update((open) => {
      const next = new Set(open);
      if (!next.delete(id)) next.add(id);
      return next;
    });
    if (!this.isExpanded(id) && this.revealedId() === id) {
      this.revealedId.set(null);
    }
  }

  /** Whether an event's text shows only by its own control. */
  public revealsAlone(event: PromptModerationEvent): boolean {
    return event.reason === 'worker_csam' || !this.rejectionsRevealed();
  }

  public isRevealed(event: PromptModerationEvent): boolean {
    return this.revealsAlone(event) ? this.revealedId() === event.id : true;
  }

  public toggleReveal(id: number): void {
    this.revealedId.update((current) => (current === id ? null : id));
  }

  /** Show or hide the text of every rejected prompt loaded. */
  public toggleRejectionsRevealed(): void {
    this.rejectionsRevealed.update((on) => !on);
    this.revealedId.set(null);
  }

  public stagesOf(event: PromptModerationEvent): PromptStage[] {
    return promptStages(event);
  }

  /** Whether an event has any prompt text kept. */
  public hasText(event: PromptModerationEvent): boolean {
    return (
      event.submitted_prompt !== null ||
      event.moderation_prompt !== null ||
      event.effective_prompt !== null
    );
  }

  /** The address that opens the Prompts tab on one account, address or worker. */
  public pivot(filter: Partial<PromptFilter>): Params {
    return promptPivotParams(filter);
  }

  /**
   * Read the next page on from the cursor, with the page's filters and
   * range. A list that reads its own pages and has none yet asks for its
   * first page again.
   */
  public loadMore(): void {
    const list = this.list();
    const own = this.query();
    if (list.loading) return;
    if (own && list.events.length === 0) {
      this.retries.next();
      return;
    }
    const page = this.page();
    if ((!own && !page) || list.cursor === null) return;
    const query: PromptModerationEventQuery = {
      ...(own ?? this.baseFilter()),
      limit: EVENT_PAGE_SIZE,
      before_id: list.cursor,
      ...(!own && page?.since && page.until
        ? { since: hordeInstant(page.since), until: hordeInstant(page.until) }
        : {}),
    };
    this.list.update((current) => ({
      ...current,
      loading: true,
      failed: false,
    }));
    this.moderation
      .getPromptEvents(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (next) =>
          this.list.update((current) => ({
            events: [...current.events, ...next.events],
            cursor: next.next_cursor,
            loading: false,
            failed: false,
          })),
        error: (error: unknown) => this.failRead(error),
      });
  }

  public startNote(id: number): void {
    this.noteFor.set(id);
    this.noteDraft.set('');
    this.focusLater(id, 'note', true);
  }

  public cancelNote(): void {
    const id = this.noteFor();
    if (id === null || this.savingNote()) return;
    this.noteFor.set(null);
    this.noteDraft.set('');
    this.focusLater(id, 'note', false);
  }

  public setNoteDraft(value: string): void {
    this.noteDraft.set(value.slice(0, EVENT_NOTE_LIMIT));
  }

  public saveNote(): void {
    const id = this.noteFor();
    const note = this.noteDraft().trim();
    if (id === null || !note || this.savingNote()) return;
    this.savingNote.set(true);
    this.moderation
      .addPromptNote(id, note)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.savingNote.set(false);
          if (!saved) return;
          this.list.update((list) => ({
            ...list,
            events: list.events.map((event) =>
              event.id === id
                ? { ...event, notes: [...event.notes, saved] }
                : event,
            ),
          }));
          this.cancelNote();
          this.toast.success('admin.review.reports.events.note_saved', {
            transloco: true,
            messageParams: { id },
          });
        },
        error: (error: unknown) => {
          this.savingNote.set(false);
          this.toast.error(
            refusalKey(error, 'admin.review.reports.events.note_error'),
            {
              transloco: true,
              rawError: error,
            },
          );
        },
      });
  }

  public startHold(id: number): void {
    this.holdFor.set(id);
    this.holdDays.set(30);
    this.holdNote.set('');
    this.releaseFor.set(null);
    this.releaseNote.set('');
    this.focusLater(id, 'hold', true);
  }

  public cancelHold(): void {
    const id = this.holdFor();
    if (id === null || this.savingHold()) return;
    this.holdFor.set(null);
    this.holdNote.set('');
    this.focusLater(id, 'hold', false);
  }

  public startRelease(id: number): void {
    if (this.savingHold()) return;
    this.holdFor.set(null);
    this.holdNote.set('');
    this.releaseFor.set(id);
    this.releaseNote.set('');
    this.focusLater(id, 'release', true);
  }

  public cancelRelease(): void {
    const id = this.releaseFor();
    if (id === null || this.savingHold()) return;
    this.releaseFor.set(null);
    this.releaseNote.set('');
    this.focusLater(id, 'release', false);
  }

  public setReleaseNote(value: string): void {
    this.releaseNote.set(value.slice(0, EVENT_NOTE_LIMIT));
  }

  public setHoldDays(value: string): void {
    this.holdDays.set(Number(value));
  }

  public setHoldNote(value: string): void {
    this.holdNote.set(value.slice(0, EVENT_NOTE_LIMIT));
  }

  public saveHold(): void {
    const id = this.holdFor();
    const note = this.holdNote().trim();
    if (id === null || !note || this.savingHold()) return;
    this.savingHold.set(true);
    this.moderation
      .holdPromptEvent(id, this.holdDays(), note)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.savingHold.set(false);
          if (!saved) return;
          this.list.update((list) => ({
            ...list,
            events: list.events.map((event) =>
              event.id === id
                ? {
                    ...event,
                    held_until: saved.held_until,
                    notes: [...event.notes, saved.note],
                  }
                : event,
            ),
          }));
          this.cancelHold();
          this.toast.success('admin.review.reports.events.hold_saved', {
            transloco: true,
          });
        },
        error: (error: unknown) => this.failHold(id, error),
      });
  }

  public releaseHold(id: number): void {
    if (this.savingHold()) return;
    const note = this.releaseNote().trim();
    this.savingHold.set(true);
    this.moderation
      .releasePromptHold(id, note || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.savingHold.set(false);
          if (!saved) return;
          this.list.update((list) => ({
            ...list,
            events: list.events.map((event) =>
              event.id === id
                ? {
                    ...event,
                    held_until: null,
                    notes: [...event.notes, saved.note],
                  }
                : event,
            ),
          }));
          this.cancelRelease();
          this.toast.success('admin.review.reports.events.hold_released', {
            transloco: true,
          });
        },
        error: (error: unknown) => this.failHold(id, error),
      });
  }

  /**
   * Report a refused hold write. A report the horde has already pruned
   * would only refuse again, so it leaves the list.
   */
  private failHold(id: number, error: unknown): void {
    this.savingHold.set(false);
    if (extractApiErrorField(error, 'rc') === 'ModerationEventNotFound') {
      this.list.update((list) => ({
        ...list,
        events: list.events.filter((event) => event.id !== id),
      }));
      this.holdFor.set(null);
      this.releaseFor.set(null);
    }
    this.toast.error(
      refusalKey(error, 'admin.review.reports.events.hold_error'),
      { transloco: true, rawError: error },
    );
  }

  /**
   * Move focus once the next render has drawn it: into a report's form as it
   * opens, or back to the control that opened it as it closes. A control that
   * is gone, as "Release hold" is after a release, gives way to the report's
   * own toggle.
   */
  private focusLater(id: number, form: EventForm, opening: boolean): void {
    afterNextRender(
      () => {
        const row = this.host.nativeElement.querySelector(
          `[data-event="${id}"]`,
        );
        const target =
          row?.querySelector<HTMLElement>(
            opening
              ? `[data-form="${form}"] :is(input, select, textarea, button)`
              : `[data-opens="${form}"]`,
          ) ?? row?.querySelector<HTMLElement>('[data-event-toggle]');
        target?.focus();
      },
      { injector: this.injector },
    );
  }

  private failRead(error: unknown): void {
    this.list.update((current) => ({
      ...current,
      loading: false,
      failed: true,
    }));
    this.toast.error(
      refusalKey(error, 'admin.review.reports.events.load_error'),
      { transloco: true, rawError: error },
    );
  }

  /** What the reports are read by: the worker, else the subject. */
  private baseFilter(): PromptModerationEventQuery {
    const workerId = this.workerId();
    if (workerId !== null) return { worker_id: workerId };
    const ref = this.ref();
    return ref ? eventFilterOf(ref) : {};
  }
}
