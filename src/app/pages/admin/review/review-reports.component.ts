import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  output,
  Signal,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe, DOCUMENT } from '@angular/common';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  EMPTY,
  Observable,
  catchError,
  distinctUntilChanged,
  map,
  switchMap,
  tap,
} from 'rxjs';
import {
  AdminModerationService,
  ProbedEndpoint,
} from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';
import { IconComponent } from '../../../components/icon/icon.component';
import { parseHordeTime } from '../../../helper/horde-time';
import {
  EndpointAvailability,
  ModerationSubject,
  ModerationRule,
  ModerationSubjectKind,
  PromptModerationReason,
} from '../../../types/moderation';
import {
  CUSTOM_DEFAULTS,
  DEFAULT_CRITERIA,
  DEFAULT_REPORTS,
  LIST_VIEWS,
  REPORTS_VIEWS,
  ReportCriteria,
  ReportsState,
  ReportsView,
  WINDOW_CHOICES,
  subjectQueryOf,
} from './review-query';
import {
  PROMPT_REASONS,
  SUBJECT_KINDS,
  SubjectDecided,
  SubjectRef,
  durationLabel,
  pluralKey,
  positiveInt,
  reasonList,
  refusalKey,
  OUTCOME_ICONS,
  SubjectState,
  subjectKey,
  subjectRefOf,
  subjectStateOf,
} from './review-subjects';
import { ReviewGridDirective } from './review-grid.directive';
import { isSplitView, nextAfter } from './review-layout';
import {
  ReviewSubjectComponent,
  SubjectStep,
} from './review-subject.component';
import { ReviewFalsePositivesComponent } from './review-false-positives.component';
import { ReviewThresholdsComponent } from './review-thresholds.component';
import { ReviewWorkersComponent } from './review-workers.component';

/** The endpoint each view reads beyond the listings; null for the lists. */
const VIEW_ENDPOINTS: Readonly<Record<ReportsView, ProbedEndpoint | null>> = {
  over: null,
  watching: null,
  escalated: null,
  workers: 'reportingWorkers',
  false_positives: 'falsePositives',
  thresholds: 'settings',
};

const PROBED_VIEW_ENDPOINTS: readonly ProbedEndpoint[] = [
  'reportingWorkers',
  'falsePositives',
  'settings',
];

/** Rows per page of the subject list. */
export const SUBJECT_PAGE_SIZE = 50;

interface SubjectPage {
  subjects: ModerationSubject[];
  nextOffset: number | null;
  /** The alert rules the horde listed by, for the alert view. */
  rules?: ModerationRule[];
}

/**
 * The Reports tab: accounts, proxied accounts or addresses ranked by the
 * reports they collected, beside the detail of the open one; the watching and
 * escalated lists; the worker reports later marked benign; and the alert
 * settings. What is shown, the criteria and the open subject all live in the
 * address, through `state` and `stateChange`.
 */
@Component({
  selector: 'app-review-reports',
  imports: [
    TranslocoPipe,
    DatePipe,
    IconComponent,
    ReviewGridDirective,
    ReviewSubjectComponent,
    ReviewFalsePositivesComponent,
    ReviewThresholdsComponent,
    ReviewWorkersComponent,
  ],
  templateUrl: './review-reports.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewReportsComponent {
  private readonly moderation = inject(AdminModerationService);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  public readonly state = input.required<ReportsState>();
  public readonly stateChange = output<ReportsState>();

  /**
   * The views whose endpoint has answered. The lists share the tab's own
   * endpoint; the other three each have their own and are probed once.
   */
  public readonly views = computed<readonly ReportsView[]>(() =>
    REPORTS_VIEWS.filter((view) => {
      const endpoint = VIEW_ENDPOINTS[view];
      return (
        endpoint === null || this.availabilityOf(endpoint)() === 'available'
      );
    }),
  );

  /** The view the address names once it can be shown, else the first list. */
  public readonly view = computed<ReportsView>(() => {
    const wanted = this.state().view;
    return this.views().includes(wanted) ? wanted : DEFAULT_REPORTS.view;
  });
  public readonly kinds = SUBJECT_KINDS;
  public readonly reasons = PROMPT_REASONS;
  public readonly windowChoices = WINDOW_CHOICES;
  public readonly hordeTime = parseHordeTime;
  public readonly duration = durationLabel;
  public readonly plural = pluralKey;
  public readonly outcomeIcons = OUTCOME_ICONS;

  public readonly isListView = computed(() => LIST_VIEWS.includes(this.view()));

  /** The criteria form, as edited before it is applied. */
  public readonly draftCustom = linkedSignal(
    () => this.state().criteria.window !== null,
  );
  public readonly draftWindow = linkedSignal(
    () => this.state().criteria.window ?? CUSTOM_DEFAULTS.window,
  );
  public readonly draftMinCount = linkedSignal(() =>
    String(this.state().criteria.minCount ?? CUSTOM_DEFAULTS.minCount),
  );
  public readonly draftReasons = linkedSignal<ReadonlySet<string>>(
    () => new Set(this.state().criteria.reasons),
  );
  /** Whether the preset's criteria are open for change; closed they read as one line. */
  public readonly criteriaOpen = signal(false);
  public readonly minCountInvalid = computed(
    () => this.draftCustom() && positiveInt(this.draftMinCount()) === null,
  );

  public readonly subjects = signal<ModerationSubject[]>([]);
  public readonly nextOffset = signal<number | null>(null);
  /** The alert rules the last alert-view answer listed by. */
  public readonly rules = signal<ModerationRule[]>([]);
  public readonly loading = signal(false);
  public readonly loadingMore = signal(false);
  public readonly loadFailed = signal(false);
  /** Bumped to read the list again with the same criteria. */
  private readonly reloads = signal(0);

  /** The subject last opened from a row, kept when a refresh drops it from the list. */
  private readonly lastOpened = signal<ModerationSubject | null>(null);

  public readonly openKey = computed(() => {
    const open = this.state().open;
    return open ? subjectKey(open) : null;
  });

  /** What the list knows about the open subject, or null when it is not in the list. */
  public readonly openSubject = computed<ModerationSubject | null>(() => {
    const key = this.openKey();
    if (key === null) return null;
    const listed = this.subjects().find(
      (subject) => this.keyOf(subject) === key,
    );
    if (listed) return listed;
    const last = this.lastOpened();
    return last && this.keyOf(last) === key ? last : null;
  });

  /**
   * Whether a narrow screen shows the detail in place of the list. A subject
   * named in the address, as a link from the account page names one, opens
   * shown.
   */
  public readonly detailShown = linkedSignal({
    source: this.openKey,
    computation: (key) => key !== null,
  });

  /** Where the open subject sits in the list, or -1 when it is not in it. */
  public readonly openIndex = computed(() => {
    const key = this.openKey();
    return key === null
      ? -1
      : this.subjects().findIndex((subject) => this.keyOf(subject) === key);
  });
  public readonly hasPrevious = computed(() => this.openIndex() > 0);
  public readonly hasNext = computed(() => {
    const index = this.openIndex();
    return index >= 0 && index < this.subjects().length - 1;
  });

  private readonly detail = viewChild(ReviewSubjectComponent);

  constructor() {
    for (const endpoint of PROBED_VIEW_ENDPOINTS) {
      this.moderation
        .probe(endpoint)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe();
    }

    const listRequest = computed(() => {
      const { kind, criteria } = this.state();
      return { view: this.view(), kind, criteria, reload: this.reloads() };
    });
    toObservable(listRequest)
      .pipe(
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        tap(({ view }) => {
          this.subjects.set([]);
          this.nextOffset.set(null);
          this.loadFailed.set(false);
          this.loading.set(LIST_VIEWS.includes(view));
        }),
        switchMap(({ view, kind, criteria }) =>
          LIST_VIEWS.includes(view)
            ? this.fetch(view, kind, criteria).pipe(
                catchError((error: unknown) => {
                  this.failLoad(error);
                  return EMPTY;
                }),
              )
            : EMPTY,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => {
        this.subjects.set(page.subjects);
        this.nextOffset.set(page.nextOffset);
        if (page.rules) this.rules.set(page.rules);
        this.loading.set(false);
      });
  }

  /** A subject's state for its chip, worded against the configured rules. */
  public stateOf(subject: ModerationSubject): SubjectState | null {
    return subjectStateOf(subject.decision, new Date());
  }

  public stateKey(state: SubjectState): string {
    return `admin.review.reports.state_label.${state.label}`;
  }

  /** Open a worker's page in the reporting-workers view, or close it with null. */
  public openWorker(worker: string | null): void {
    this.stateChange.emit({ ...this.state(), open: null, worker });
  }

  /** Open the subject before or after the open one. */
  public onStep(direction: SubjectStep): void {
    const index = this.openIndex();
    if (index < 0) return;
    const subject =
      this.subjects()[direction === 'next' ? index + 1 : index - 1];
    if (subject) this.open(subject);
  }

  public keyOf(subject: ModerationSubject): string {
    return subjectKey(subjectRefOf(subject));
  }

  /** The row the list's single tab stop sits on: the open subject, else the first. */
  public tabStop(): string | undefined {
    const first = this.subjects().at(0);
    return this.openKey() ?? (first ? this.keyOf(first) : undefined);
  }

  private availabilityOf(
    endpoint: ProbedEndpoint,
  ): Signal<EndpointAvailability> {
    switch (endpoint) {
      case 'reportingWorkers':
        return this.moderation.reportingWorkersAvailability;
      case 'falsePositives':
        return this.moderation.falsePositivesAvailability;
      case 'settings':
        return this.moderation.settingsAvailability;
      case 'promptEvents':
        return this.moderation.promptEventsAvailability;
    }
  }

  public viewKey(view: ReportsView): string {
    return `admin.review.reports.view.${view}`;
  }

  public kindKey(kind: ModerationSubjectKind): string {
    return `admin.review.reports.kind.${kind}`;
  }

  public reasonKey(reason: PromptModerationReason): string {
    return `admin.review.reason.${reason}`;
  }

  /** The reasons a subject was reported for, with their counts, in a fixed order. */
  /** The reasons a rule counts, joined for a sentence. */
  public reasonsOf(reasons: readonly PromptModerationReason[]): string {
    return reasonList(
      reasons,
      (key) => this.transloco.translate(key),
      this.transloco.getActiveLang(),
    );
  }

  public reasonCounts(
    subject: ModerationSubject,
  ): { reason: PromptModerationReason; count: number }[] {
    return PROMPT_REASONS.map((reason) => ({
      reason,
      count: subject.counts_by_reason[reason] ?? 0,
    })).filter((entry) => entry.count > 0);
  }

  public setView(view: ReportsView): void {
    if (view === this.view()) return;
    this.detailShown.set(false);
    this.stateChange.emit({ ...this.state(), view, open: null, worker: null });
  }

  public setKind(kind: ModerationSubjectKind): void {
    if (kind === this.state().kind) return;
    this.detailShown.set(false);
    this.stateChange.emit({ ...this.state(), kind, open: null });
  }

  /** The alert preset applies at once; a custom search waits for Apply. */
  public setCustom(custom: boolean): void {
    // Chosen from inside the criteria, which stay open around the choice.
    this.criteriaOpen.set(true);
    this.draftCustom.set(custom);
    if (!custom && this.state().criteria.window !== null) {
      this.emitCriteria({
        ...DEFAULT_CRITERIA,
        sinceReview: this.state().criteria.sinceReview,
      });
    }
  }

  public setSinceReview(sinceReview: boolean): void {
    this.emitCriteria({ ...this.state().criteria, sinceReview });
  }

  public toggleReason(reason: PromptModerationReason): void {
    this.draftReasons.update((reasons) => {
      const next = new Set(reasons);
      if (!next.delete(reason)) next.add(reason);
      return next;
    });
  }

  public applyCustom(): void {
    const minCount = positiveInt(this.draftMinCount());
    if (minCount === null) return;
    const chosen = PROMPT_REASONS.filter((reason) =>
      this.draftReasons().has(reason),
    );
    this.emitCriteria({
      window: this.draftWindow(),
      minCount,
      reasons: chosen.length === PROMPT_REASONS.length ? [] : chosen,
      sinceReview: this.state().criteria.sinceReview,
    });
  }

  public loadMore(): void {
    const offset = this.nextOffset();
    const { kind, criteria } = this.state();
    const view = this.view();
    if (offset === null || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.fetch(view, kind, criteria, offset)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.subjects.update((subjects) => [...subjects, ...page.subjects]);
          this.nextOffset.set(page.nextOffset);
          this.loadingMore.set(false);
        },
        error: (error: unknown) => {
          this.loadingMore.set(false);
          this.toast.error(
            refusalKey(error, 'admin.review.reports.load_error'),
            {
              transloco: true,
              rawError: error,
            },
          );
        },
      });
  }

  /** Open a subject, from a press on its row. */
  public open(subject: ModerationSubject): void {
    this.lastOpened.set(subject);
    this.openRef(subjectRefOf(subject));
  }

  /** Leave the detail on a narrow screen, returning to the subject's row. */
  public back(): void {
    const key = this.openKey();
    this.detailShown.set(false);
    setTimeout(() =>
      this.document
        .querySelector<HTMLElement>(`[data-subject="${CSS.escape(key ?? '')}"]`)
        ?.focus(),
    );
  }

  /**
   * After a decision the list is read again. A decision that closes the
   * review moves on to the next subject, since the decided one leaves a list
   * counted from the latest decision.
   */
  public onDecided(event: SubjectDecided): void {
    const key = this.openKey();
    const keys = this.subjects().map((subject) => this.keyOf(subject));
    const next =
      event.advance && key !== null && keys.includes(key)
        ? nextAfter(keys, key)
        : null;
    this.reloads.update((count) => count + 1);
    if (next !== null) {
      const subject = this.subjects().find((item) => this.keyOf(item) === next);
      if (subject) this.open(subject);
    }
  }

  private openRef(ref: SubjectRef): void {
    this.stateChange.emit({ ...this.state(), open: ref });
    this.detailShown.set(true);
    if (!isSplitView(this.document)) {
      setTimeout(() => this.detail()?.focusHeading());
    }
  }

  private emitCriteria(criteria: ReportCriteria): void {
    this.detailShown.set(false);
    this.stateChange.emit({ ...this.state(), criteria, open: null });
  }

  private fetch(
    view: ReportsView,
    kind: ModerationSubjectKind,
    criteria: ReportCriteria,
    offset?: number,
  ): Observable<SubjectPage> {
    if (view === 'watching' || view === 'escalated') {
      return this.moderation
        .getSubjects({ state: view, limit: SUBJECT_PAGE_SIZE, offset })
        .pipe(
          map((answer) => ({
            subjects: answer.subjects,
            nextOffset: answer.next_offset,
          })),
        );
    }
    return this.moderation
      .getSubjects(subjectQueryOf(kind, criteria, SUBJECT_PAGE_SIZE, offset))
      .pipe(
        map((page) => ({
          subjects: page.subjects,
          nextOffset: page.next_offset,
          ...(page.criteria.rules ? { rules: page.criteria.rules } : {}),
        })),
      );
  }

  private failLoad(error: unknown): void {
    this.loading.set(false);
    this.loadFailed.set(true);
    this.toast.error(refusalKey(error, 'admin.review.reports.load_error'), {
      transloco: true,
      rawError: error,
    });
  }
}
