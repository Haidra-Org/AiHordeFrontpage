import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
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
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { AdminOperationsService } from '../../../services/admin-operations.service';
import { AdminUserService } from '../../../services/admin-user.service';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { ModerationCountsService } from '../../../services/moderation-counts.service';
import { ToastService } from '../../../services/toast.service';
import { IconComponent } from '../../../components/icon/icon.component';
import { AdminDialogComponent } from '../../../components/admin/admin-dialog/admin-dialog.component';
import { extractApiErrorField } from '../../../helper/extract-api-error';
import { parseHordeTime } from '../../../helper/horde-time';
import { retryOnRateLimit } from '../../../helper/rate-limit-retry';
import {
  ModerationSubject,
  ModerationSubjectDetail,
  PromptModerationReason,
  SubjectAction,
  SubjectDecision,
  SubjectDecisionInput,
  SubjectDecisionOutcome,
} from '../../../types/moderation';
import {
  BucketRange,
  DECISION_NOTE_LIMIT,
  DIALOG_OUTCOMES,
  DecisionForm,
  IP_TIMEOUT_HOURS,
  OUTCOME_ICONS,
  RuleMeter,
  SEVERITY_ORDER,
  SubjectDecided,
  SubjectRef,
  SubjectState,
  caseParams,
  workerParams,
  durationLabel,
  earliestWatchDate,
  eventFilterOf,
  findingOf,
  identityOf,
  isNetwork,
  isWatching,
  latestWatchDate,
  pluralKey,
  positiveInt,
  rangeInstants,
  reasonList,
  refusalKey,
  ruleMeter,
  rulesVerdict,
  subjectKey,
  subjectStateOf,
  timelineColumns,
  WATCH_MAX_DAYS,
  validateDecision,
  watchUntilInstant,
} from './review-subjects';
import {
  ReportsPage,
  ReviewSubjectEventsComponent,
} from './review-subject-events.component';
import { ReviewTimelineComponent } from './review-timeline.component';
import { RangeReader } from './review-range';
import { ReviewPivotsComponent } from './review-pivots.component';

/** Decisions per page of a subject's history. */
export const DECISION_PAGE_SIZE = 20;

/** The actions this page can take on a subject, each recorded as an `actioned` decision once it succeeds. */
export type ReviewAction = Extract<
  SubjectAction,
  'flag_account' | 'reset_suspicion' | 'ip_timeout' | 'pause_worker'
>;

/** An action waiting for the moderator to confirm it. */
export interface PendingAction {
  action: ReviewAction;
  /** The worker to pause, for `pause_worker`. */
  workerId?: string;
}

/** Which way the keyboard or the step buttons move through the list. */
export type SubjectStep = 'previous' | 'next';

/**
 * The keys that step through the list while focus is in the detail. The
 * review grid takes the arrow keys and Home and End, and the dialogs take
 * Escape and Tab, so the letters stay clear of both.
 */
export const STEP_KEYS: Readonly<Record<string, SubjectStep>> = {
  j: 'next',
  k: 'previous',
};

/** An action that succeeded but whose decision the horde did not store. */
interface UnrecordedAction {
  input: SubjectDecisionInput;
}

/** How far the detail's reading has come. */
type DetailState = 'loading' | 'ready' | 'failed' | 'missing';

const EMPTY_FORM: DecisionForm = {
  outcome: 'benign',
  note: '',
  watchUntil: '',
  watchMinCount: '',
};

/**
 * One account, proxied account or address, laid out for a verdict first
 * and evidence after: who it is and where it stands, its count against
 * each alert rule, the decision bar, then when its reports came, what they
 * name, and the reports one by one. The decision history and the rule
 * meters share a column beside the evidence on wide screens.
 *
 * `actioned` is never offered as a choice. It is recorded after an action
 * this page took has succeeded, naming the action, so the history says what
 * was done rather than what was meant.
 *
 * The moderator endpoints share a 30-per-minute budget. Opening a subject
 * reads its decisions, its detail and its reports once each. A brushed
 * range reads nothing while it is dragged; once released and settled it
 * reads the range's detail, and the range's reports too when the ones
 * already read do not reach back far enough, and a newer brush cancels
 * both.
 */
@Component({
  selector: 'app-review-subject',
  imports: [
    TranslocoPipe,
    DatePipe,
    NgTemplateOutlet,
    RouterLink,
    IconComponent,
    AdminDialogComponent,
    ReviewSubjectEventsComponent,
    ReviewTimelineComponent,
    ReviewPivotsComponent,
  ],
  templateUrl: './review-subject.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown)': 'onKeydown($event)',
  },
})
export class ReviewSubjectComponent {
  private readonly moderation = inject(AdminModerationService);
  private readonly counts = inject(ModerationCountsService);
  private readonly users = inject(AdminUserService);
  private readonly operations = inject(AdminOperationsService);
  private readonly workers = inject(AdminWorkerService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  public readonly ref = input.required<SubjectRef>();
  /** What the list knows about the subject; null when it is not in the list. */
  public readonly subject = input<ModerationSubject | null>(null);
  public readonly hasPrevious = input(false);
  public readonly hasNext = input(false);

  public readonly back = output<void>();
  public readonly decided = output<SubjectDecided>();
  /** Open the subject before or after this one in the list. */
  public readonly step = output<SubjectStep>();

  public readonly outcomes = DIALOG_OUTCOMES;
  public readonly noteLimit = DECISION_NOTE_LIMIT;
  public readonly ipHoursRange = IP_TIMEOUT_HOURS;
  public readonly watchMaxDays = WATCH_MAX_DAYS;
  public readonly hordeTime = parseHordeTime;
  public readonly duration = durationLabel;
  public readonly plural = pluralKey;
  public readonly caseParams = caseParams;
  public readonly workerParams = workerParams;

  public readonly decisions = signal<SubjectDecision[]>([]);
  public readonly decisionsCursor = signal<number | null>(null);
  public readonly decisionsLoaded = signal(false);
  public readonly decisionsFailed = signal(false);
  public readonly decisionsLoadingMore = signal(false);

  /** The subject's detail over the largest rule window. */
  public readonly detail = signal<ModerationSubjectDetail | null>(null);
  public readonly detailState = signal<DetailState>('loading');
  private readonly detailReloads = signal(0);
  /** Seconds the rate limiter asked the detail read to wait, while it waits. */
  public readonly limitWait = signal<number | null>(null);
  private detailKey: string | null = null;

  /** The subject's state: its latest decision, once the history has answered. */
  public readonly latest = computed<SubjectDecision | null>(() =>
    this.decisionsLoaded()
      ? (this.decisions().at(0) ?? null)
      : (this.detail()?.decisions.at(0) ?? this.subject()?.decision ?? null),
  );
  public readonly watermark = computed(
    () => this.latest()?.watermark_event_id ?? null,
  );
  public readonly watchRunning = computed(() =>
    isWatching(this.latest(), new Date()),
  );
  /**
   * The first page of reports the list shows: the brushed range's, once
   * its detail has answered, else the window's. Null while either is read.
   */
  public readonly eventsPage = computed<ReportsPage | null>(() => {
    const settled = this.ranged.settled();
    if (settled) {
      const inRange = this.ranged.detail();
      return inRange
        ? {
            events: inRange.events,
            cursor: inRange.events_next_cursor,
            since: settled.since,
            until: settled.until,
          }
        : null;
    }
    const detail = this.detail();
    return detail
      ? { events: detail.events, cursor: detail.events_next_cursor }
      : null;
  });

  public readonly state = computed(() =>
    subjectStateOf(this.latest(), new Date()),
  );

  /** The subject's name as the detail, else the list, knows it. */
  public readonly username = computed(
    () => this.detail()?.username ?? this.subject()?.username ?? null,
  );

  /** The window's reports by reason, most severe first. */
  public readonly reasonCounts = computed(() => {
    const detail = this.detail();
    if (!detail) return [];
    return SEVERITY_ORDER.map((reason) => ({
      reason,
      count: detail.counts_by_reason[reason] ?? 0,
    })).filter((entry) => entry.count > 0);
  });

  /** The window's length, as a duration to put in words. */
  public readonly windowLength = computed(() => {
    const detail = this.detail();
    const since = parseHordeTime(detail?.since);
    const until = parseHordeTime(detail?.until);
    if (!detail || !since || !until) return null;
    return durationLabel(
      Math.max(1, Math.round((until.getTime() - since.getTime()) / 1000)),
    );
  });

  public readonly meters = computed(() =>
    (this.detail()?.rules ?? []).map(ruleMeter),
  );
  /** The rules with reports against them, drawn as meters. */
  public readonly activeMeters = computed(() =>
    this.meters().filter(
      (meter) => meter.rule.count > 0 || meter.rule.exceeded,
    ),
  );
  /** The rules with no reports against them, folded into one line. */
  public readonly quietMeters = computed(() =>
    this.meters().filter(
      (meter) => meter.rule.count === 0 && !meter.rule.exceeded,
    ),
  );
  public readonly quietOpen = signal(false);
  public readonly verdict = computed(() =>
    rulesVerdict(this.detail()?.rules ?? []),
  );
  /** Whether any rule counts the subject over it, for the head's edge. */
  public readonly anyOver = computed(() =>
    this.meters().some((meter) => meter.state === 'over'),
  );
  public readonly finding = computed(() => {
    const detail = this.detail();
    return detail ? findingOf(detail) : null;
  });
  public readonly workerNames = computed<ReadonlyMap<string, string>>(
    () =>
      new Map(
        (this.detail()?.workers.items ?? []).map((worker) => [
          worker.worker_id,
          worker.worker_name ?? worker.worker_id,
        ]),
      ),
  );

  /**
   * The brushed range and its readings. Nothing is read while the range is
   * dragged; see `RangeReader` for how a release settles and supersedes.
   */
  public readonly ranged = new RangeReader<ModerationSubjectDetail>({
    read: (since, until) =>
      this.moderation.getSubjectDetail({
        kind: this.ref().kind,
        ...this.identity(),
        since,
        until,
      }),
    failed: (error) =>
      this.toast.error('admin.review.reports.range.load_error', {
        transloco: true,
        rawError: error,
      }),
    destroyRef: this.destroyRef,
  });

  public readonly actions = computed<ReviewAction[]>(() => {
    switch (this.ref().kind) {
      case 'account':
        return ['flag_account', 'reset_suspicion'];
      case 'ip':
        return ['ip_timeout'];
      default:
        return [];
    }
  });

  public readonly decisionOpen = signal(false);
  public readonly form = signal<DecisionForm>(EMPTY_FORM);
  /** Problems show once the moderator has tried to save. */
  public readonly attempted = signal(false);
  public readonly problems = computed(() =>
    validateDecision(this.form(), new Date()),
  );
  public readonly shownProblems = computed(() =>
    this.attempted() ? this.problems() : [],
  );
  public readonly noteRemaining = computed(
    () => DECISION_NOTE_LIMIT - this.form().note.length,
  );
  public readonly watchMin = computed(() => earliestWatchDate(new Date()));
  public readonly watchMax = computed(() => latestWatchDate(new Date()));
  public readonly pendingAction = signal<PendingAction | null>(null);
  public readonly actionNote = signal('');
  public readonly ipHours = signal(String(24));
  public readonly ipHoursInvalid = computed(() => {
    const hours = positiveInt(this.ipHours());
    return (
      hours === null ||
      hours < IP_TIMEOUT_HOURS.min ||
      hours > IP_TIMEOUT_HOURS.max
    );
  });

  public readonly saving = signal(false);
  public readonly unrecorded = signal<UnrecordedAction | null>(null);

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly events = viewChild(ReviewSubjectEventsComponent);

  constructor() {
    toObservable(computed(() => subjectKey(this.ref())))
      .pipe(
        distinctUntilChanged(),
        tap(() => {
          this.decisions.set([]);
          this.decisionsCursor.set(null);
          this.decisionsLoaded.set(false);
          this.decisionsFailed.set(false);
          this.decisionOpen.set(false);
          this.pendingAction.set(null);
          this.unrecorded.set(null);
          this.quietOpen.set(false);
          this.ranged.clear();
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    const detailRequest = computed(() => ({
      key: subjectKey(this.ref()),
      reload: this.detailReloads(),
    }));
    toObservable(detailRequest)
      .pipe(
        distinctUntilChanged(
          (a, b) => a.key === b.key && a.reload === b.reload,
        ),
        tap(({ key }) => {
          // A reload of the same subject keeps the page drawn while it reads.
          if (key !== this.detailKey) this.detail.set(null);
          this.detailKey = key;
          this.detailState.set('loading');
        }),
        switchMap(() =>
          this.moderation
            .getSubjectDetail({ kind: this.ref().kind, ...this.identity() })
            .pipe(
              retryOnRateLimit((seconds) => this.limitWait.set(seconds)),
              catchError((error: unknown) => {
                this.limitWait.set(null);
                this.decisionsFailed.set(true);
                this.failDetail(error);
                return EMPTY;
              }),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((detail) => {
        this.limitWait.set(null);
        this.detail.set(detail);
        this.detailState.set('ready');
        // The history's first page comes with the detail; older pages come
        // from the decision listing, from its cursor.
        this.decisions.set(detail.decisions);
        this.decisionsCursor.set(detail.decisions_next_cursor);
        this.decisionsLoaded.set(true);
      });
  }

  /** Whether the open subject is an IPv6 /64 network rather than one address. */
  public readonly network = computed(() => isNetwork(this.ref().ipaddr));

  /** The reasons a rule counts, joined for a sentence. */
  public reasonsOf(reasons: readonly PromptModerationReason[]): string {
    return reasonList(
      reasons,
      (key) => this.transloco.translate(key),
      this.transloco.getActiveLang(),
    );
  }

  public focusHeading(): void {
    this.heading()?.nativeElement.focus();
  }

  public reasonKey(reason: PromptModerationReason): string {
    return `admin.review.reason.${reason}`;
  }

  public outcomeKey(outcome: SubjectDecisionOutcome): string {
    return `admin.review.reports.outcome.${outcome}`;
  }

  /**
   * Whether a rule's threshold in force is the running watch's. Upstream
   * applies the lower of the rule's and the watch's, so a rule whose own
   * threshold is lower keeps it.
   */
  public isWatchThreshold(minCount: number): boolean {
    return this.watchRunning() && this.latest()?.watch_min_count === minCount;
  }

  public meterIcon(state: RuleMeter['state']): string {
    switch (state) {
      case 'over':
        return 'exclamation-circle';
      case 'near':
        return 'warning-triangle';
      case 'under':
        return 'info-circle';
    }
  }

  public stateIcon(state: SubjectState): string {
    return OUTCOME_ICONS[state.outcome];
  }

  public stateKey(state: SubjectState): string {
    return `admin.review.reports.state_label.${state.label}`;
  }

  /** A decision in the history, as the state it left the subject in when it was made. */
  public historyState(decision: SubjectDecision): SubjectState | null {
    const state = subjectStateOf(
      decision,
      parseHordeTime(decision.created) ?? new Date(),
    );
    return state?.label === 'watch_ended'
      ? { ...state, label: 'watching' }
      : state;
  }

  public actionKey(action: SubjectAction): string {
    return `admin.review.reports.action.${action}`;
  }

  /** Step through the list from the keyboard, while focus is in the detail. */
  public onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
    if (event.altKey || event.shiftKey) return;
    if (this.decisionOpen() || this.pendingAction() !== null) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
    ) {
      return;
    }
    const direction = STEP_KEYS[event.key];
    if (!direction) return;
    if (direction === 'next' ? !this.hasNext() : !this.hasPrevious()) return;
    event.preventDefault();
    this.step.emit(direction);
    // The control that had focus may belong to the subject left behind.
    setTimeout(() => this.focusHeading());
  }

  // ---------------------------------------------------------------- brush

  /**
   * Narrow the page to a run of buckets, or to the whole window with null.
   * The whole window is the same as no range.
   */
  public selectRange(range: BucketRange | null): void {
    const detail = this.detail();
    if (!detail || range === null) {
      this.ranged.select(null);
      return;
    }
    const columns = timelineColumns(detail.timeline);
    const last = columns.length - 1;
    const instants = rangeInstants(detail, columns, range);
    this.ranged.select(
      (range.from <= 0 && range.to >= last) || !instants
        ? null
        : { range, ...instants },
    );
  }

  // ---------------------------------------------------------------- decisions

  public loadMoreDecisions(): void {
    const cursor = this.decisionsCursor();
    if (cursor === null || this.decisionsLoadingMore()) return;
    this.decisionsLoadingMore.set(true);
    this.fetchDecisions(cursor)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.decisions.update((decisions) => [
            ...decisions,
            ...page.decisions,
          ]);
          this.decisionsCursor.set(page.next_cursor);
          this.decisionsLoadingMore.set(false);
        },
        error: (error: unknown) => {
          this.decisionsLoadingMore.set(false);
          this.toast.error('admin.review.reports.history.load_error', {
            transloco: true,
            rawError: error,
          });
        },
      });
  }

  public reloadDetail(): void {
    this.detailReloads.update((count) => count + 1);
  }

  public openDecision(): void {
    this.form.set(EMPTY_FORM);
    this.attempted.set(false);
    this.decisionOpen.set(true);
  }

  public cancelDecision(): void {
    if (!this.saving()) this.decisionOpen.set(false);
  }

  public updateForm(patch: Partial<DecisionForm>): void {
    this.form.update((form) => ({ ...form, ...patch }));
  }

  public setOutcome(value: string): void {
    const outcome = DIALOG_OUTCOMES.find((item) => item === value);
    if (outcome) this.updateForm({ outcome });
  }

  public confirmDecision(): void {
    if (this.saving()) return;
    this.attempted.set(true);
    if (this.problems().length > 0) return;
    const form = this.form();
    const note = form.note.trim();
    const minCount = positiveInt(form.watchMinCount);
    this.record(
      {
        ...this.base(),
        outcome: form.outcome,
        ...(note ? { note } : {}),
        ...(form.outcome === 'watching'
          ? {
              watch_until: watchUntilInstant(form.watchUntil, new Date()),
              ...(minCount !== null ? { watch_min_count: minCount } : {}),
            }
          : {}),
      },
      true,
    );
  }

  public askAction(action: ReviewAction, workerId?: string): void {
    this.actionNote.set('');
    this.pendingAction.set({ action, ...(workerId ? { workerId } : {}) });
  }

  public cancelAction(): void {
    if (!this.saving()) this.pendingAction.set(null);
  }

  public setActionNote(value: string): void {
    this.actionNote.set(value.slice(0, DECISION_NOTE_LIMIT));
  }

  /**
   * Take the action, and only once it has succeeded record it. A failed
   * action records nothing, so the history never claims what did not happen.
   */
  public confirmAction(): void {
    const pending = this.pendingAction();
    if (!pending || this.saving()) return;
    if (pending.action === 'ip_timeout' && this.ipHoursInvalid()) return;
    const run = this.runAction(pending);
    if (!run) return;
    this.saving.set(true);
    run.operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (done) => {
        if (!done) {
          this.saving.set(false);
          return;
        }
        this.toast.success(
          `admin.review.reports.action_done.${pending.action}`,
          {
            transloco: true,
          },
        );
        const note = this.actionNote().trim();
        this.record(
          {
            ...this.base(),
            outcome: 'actioned',
            action: pending.action,
            ...(run.detail ? { action_detail: run.detail } : {}),
            ...(note ? { note } : {}),
          },
          false,
        );
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.toast.error('admin.review.reports.action_error', {
          transloco: true,
          rawError: error,
        });
      },
    });
  }

  /** Try again to store the decision for an action that already succeeded. */
  public retryUnrecorded(): void {
    const unrecorded = this.unrecorded();
    if (unrecorded && !this.saving()) this.record(unrecorded.input, false);
  }

  private runAction(
    pending: PendingAction,
  ): { operation: Observable<boolean>; detail?: string } | null {
    const ref = this.ref();
    const done = map((result: unknown) => result !== null);
    switch (pending.action) {
      case 'flag_account':
        return ref.user_id === null
          ? null
          : { operation: this.users.setFlagged(ref.user_id, true).pipe(done) };
      case 'reset_suspicion':
        return ref.user_id === null
          ? null
          : { operation: this.users.resetSuspicion(ref.user_id).pipe(done) };
      case 'ip_timeout': {
        const hours = positiveInt(this.ipHours());
        return ref.ipaddr === null || hours === null
          ? null
          : {
              operation: this.operations
                .addIPTimeout({ ipaddr: ref.ipaddr, hours })
                .pipe(done),
              detail: `${hours}h`,
            };
      }
      case 'pause_worker':
        return pending.workerId
          ? {
              operation: this.workers
                .setPaused(pending.workerId, true)
                .pipe(done),
              detail: pending.workerId,
            }
          : null;
    }
  }

  /** The kind, the identity, and the newest report on the page as the watermark. */
  private base(): Pick<
    SubjectDecisionInput,
    'kind' | 'user_id' | 'proxied_account' | 'ipaddr' | 'watermark_event_id'
  > {
    const seen = this.events()?.newestLoadedId() ?? null;
    return {
      kind: this.ref().kind,
      ...identityOf(this.ref()),
      ...(seen !== null ? { watermark_event_id: seen } : {}),
    };
  }

  /** The subject's identity with the fields its kind does not use left off. */
  private identity() {
    return eventFilterOf(this.ref());
  }

  private record(input: SubjectDecisionInput, advance: boolean): void {
    this.saving.set(true);
    this.moderation
      .recordSubjectDecision(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (decision) => {
          this.saving.set(false);
          if (!decision) return;
          this.decisions.update((decisions) => [decision, ...decisions]);
          this.decisionsLoaded.set(true);
          this.decisionOpen.set(false);
          this.pendingAction.set(null);
          this.unrecorded.set(null);
          this.toast.success('admin.review.reports.decision.saved', {
            transloco: true,
          });
          this.counts.refreshReports();
          this.decided.emit({ decision, advance });
          // The counts since the decision and the rules' counts start over.
          this.ranged.clear();
          this.reloadDetail();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          if (input.outcome === 'actioned') {
            this.pendingAction.set(null);
            this.unrecorded.set({ input });
          }
          this.toast.error(
            refusalKey(error, 'admin.review.reports.decision.error'),
            {
              transloco: true,
              rawError: error,
            },
          );
        },
      });
  }

  private failDetail(error: unknown): void {
    if (extractApiErrorField(error, 'rc') === 'ModerationSubjectNotFound') {
      this.detailState.set('missing');
      return;
    }
    this.detailState.set('failed');
    this.toast.error('admin.review.reports.detail_load_error', {
      transloco: true,
      rawError: error,
    });
  }

  private fetchDecisions(beforeId?: number) {
    return this.moderation.getSubjectDecisions({
      kind: this.ref().kind,
      ...identityOf(this.ref()),
      limit: DECISION_PAGE_SIZE,
      ...(beforeId !== undefined ? { before_id: beforeId } : {}),
    });
  }
}
