import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Params, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  EMPTY,
  Observable,
  catchError,
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';
import { SuspicionHistoryComponent } from '../../../components/admin/suspicion-history/suspicion-history.component';
import { ModerationCountComponent } from '../../../components/admin/moderation-count/moderation-count.component';
import { listCount } from '../../../helper/list-count';
import { parseHordeTime } from '../../../helper/horde-time';
import {
  ListCount,
  PromptModerationEvent,
  PromptModerationReason,
  SubjectDecision,
} from '../../../types/moderation';
import {
  DEFAULT_PROMPTS,
  DEFAULT_REPORTS,
  promptsParams,
  reportsParams,
} from '../review/review-query';
import {
  PROMPT_REASONS,
  durationLabel,
  hordeInstant,
  isWatching,
} from '../review/review-subjects';

/** The most reports one request may return, and so what the counts can cover. */
export const ACCOUNT_REPORT_LIMIT = 100;

/**
 * How far back the counts reach when no alert rule gives a window. This is a
 * choice of the summary: the horde keeps reports for longer.
 */
export const REPORT_SUMMARY_SECONDS = 2_592_000;

export interface AccountReportSummary {
  /**
   * Seconds the counts reach back: the longest alert rule's window where the
   * rules can be read, else `REPORT_SUMMARY_SECONDS`.
   */
  window: number;
  total: ListCount;
  byReason: { reason: PromptModerationReason; count: number }[];
}

/** Count reports by reason. The text of each prompt is dropped here. */
export function summariseReports(
  events: readonly PromptModerationEvent[],
  limit: number,
  window: number,
): AccountReportSummary {
  return {
    window,
    total: listCount(events.length, limit),
    byReason: PROMPT_REASONS.map((reason) => ({
      reason,
      count: events.filter((event) => event.reason === reason).length,
    })),
  };
}

/**
 * The moderation record of one account on the user management page: how many
 * reports it collected, by reason, with a link to them in the Prompts tab,
 * and the suspicion history of its workers, read when opened. Where the horde
 * serves the report listings, the record also carries the account's standing
 * in Reports (its latest decision), counts over the longest alert window
 * rather than the default summary window, and links to its case. Prompt text is
 * never shown here; reading it is left to the review page, where it stays
 * hidden until asked for.
 */
@Component({
  selector: 'app-user-moderation-record',
  imports: [
    TranslocoPipe,
    DatePipe,
    RouterLink,
    SuspicionHistoryComponent,
    ModerationCountComponent,
  ],
  templateUrl: './user-moderation-record.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserModerationRecordComponent {
  private readonly moderation = inject(AdminModerationService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly userId = input.required<number>();

  public readonly hordeTime = parseHordeTime;
  public readonly duration = durationLabel;

  /** Undefined until the history answers; null when there is no decision. */
  public readonly latest = signal<SubjectDecision | null | undefined>(
    undefined,
  );
  public readonly summary = signal<AccountReportSummary | null>(null);

  /** Shown once the prompt log answers; it needs nothing else. */
  public readonly shown = computed(
    () => this.moderation.promptEventsAvailability() === 'available',
  );

  /** Whether the account's standing and case in Reports can be shown. */
  public readonly casesAvailable = computed(
    () => this.moderation.subjectsAvailability() === 'available',
  );
  public readonly watching = computed(() =>
    isWatching(this.latest() ?? null, new Date()),
  );

  public readonly promptsQuery = computed<Params>(() =>
    promptsParams({ ...DEFAULT_PROMPTS, user_id: this.userId() }),
  );

  public readonly reviewQuery = computed<Params>(() =>
    reportsParams({
      ...DEFAULT_REPORTS,
      open: {
        kind: 'account',
        user_id: this.userId(),
        proxied_account: null,
        ipaddr: null,
      },
    }),
  );

  constructor() {
    const userId$ = toObservable(this.userId).pipe(distinctUntilChanged());
    const casesAvailable$ = toObservable(this.casesAvailable).pipe(
      distinctUntilChanged(),
    );

    combineLatest([userId$, casesAvailable$])
      .pipe(
        tap(() => this.latest.set(undefined)),
        filter(([, casesAvailable]) => casesAvailable),
        switchMap(([userId]) =>
          this.moderation
            .getSubjectDecisions({ kind: 'account', user_id: userId, limit: 1 })
            .pipe(
              catchError((error: unknown) => {
                this.reportError(error, 'subjects');
                return EMPTY;
              }),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => this.latest.set(page.decisions.at(0) ?? null));

    // The account's read waits for the log's one-event probe, so a horde
    // without the log is asked once, by the probe, and never for an account.
    this.moderation
      .probe('promptEvents')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
    combineLatest([userId$, casesAvailable$, toObservable(this.shown)])
      .pipe(
        tap(() => this.summary.set(null)),
        filter(([, , shown]) => shown),
        switchMap(([userId, casesAvailable]) =>
          this.ruleWindow(casesAvailable).pipe(
            map((window) => window ?? REPORT_SUMMARY_SECONDS),
            switchMap((window) =>
              this.moderation
                .getPromptEvents({
                  user_id: userId,
                  since: hordeInstant(new Date(Date.now() - window * 1000)),
                  limit: ACCOUNT_REPORT_LIMIT,
                })
                .pipe(
                  map((page) =>
                    summariseReports(page.events, ACCOUNT_REPORT_LIMIT, window),
                  ),
                ),
            ),
            catchError((error: unknown) => {
              this.reportError(error, 'prompts');
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((summary) => this.summary.set(summary));
  }

  /**
   * The longest alert rule's window, read only where Reports is served;
   * null where no rule gives one.
   */
  private ruleWindow(casesAvailable: boolean): Observable<number | null> {
    if (
      !casesAvailable ||
      this.moderation.settingsAvailability() === 'absent'
    ) {
      return of(null);
    }
    return this.moderation.getSettings().pipe(
      map((settings) => {
        const longest = Math.max(
          ...settings.rules.map((rule) => rule.window_seconds),
        );
        return Number.isFinite(longest) ? longest : null;
      }),
      catchError(() => of(null)),
    );
  }

  /**
   * A browser that never reached the horde, or a horde without the endpoint,
   * says nothing; the record simply does not show.
   */
  private reportError(error: unknown, which: 'subjects' | 'prompts'): void {
    if (error instanceof HttpErrorResponse && error.status === 0) return;
    const availability =
      which === 'subjects'
        ? this.moderation.subjectsAvailability()
        : this.moderation.promptEventsAvailability();
    if (availability !== 'available') return;
    this.toast.error('admin.user_moderation.load_error', {
      transloco: true,
      rawError: error,
    });
  }
}
