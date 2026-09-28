import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Params, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  EMPTY,
  catchError,
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  switchMap,
  tap,
} from 'rxjs';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';
import { SuspicionHistoryComponent } from '../../../components/admin/suspicion-history/suspicion-history.component';
import { ModerationCountComponent } from '../../../components/admin/moderation-count/moderation-count.component';
import { listCount } from '../../../helper/list-count';
import {
  ListCount,
  PromptModerationEvent,
  PromptModerationReason,
} from '../../../types/moderation';
import { DEFAULT_PROMPTS, promptsParams } from '../review/review-query';
import { PROMPT_REASONS, durationLabel } from '../review/review-subjects';

/** The most reports one request may return, and so what the counts can cover. */
export const ACCOUNT_REPORT_LIMIT = 100;

/**
 * How long the horde keeps reports. A read without a start reaches back
 * this far and no further.
 */
export const REPORT_RETENTION_SECONDS = 2_592_000;

export interface AccountReportSummary {
  /** Seconds the counts reach back: the retention. */
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
 * and the suspicion history of its workers, read when opened. Prompt text is
 * never shown here; reading it is left to the review page, where it stays
 * hidden until asked for.
 */
@Component({
  selector: 'app-user-moderation-record',
  imports: [
    TranslocoPipe,
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

  public readonly duration = durationLabel;

  public readonly summary = signal<AccountReportSummary | null>(null);

  /** Shown once the prompt log answers; it needs nothing else. */
  public readonly shown = computed(
    () => this.moderation.promptEventsAvailability() === 'available',
  );

  public readonly promptsQuery = computed<Params>(() =>
    promptsParams({ ...DEFAULT_PROMPTS, user_id: this.userId() }),
  );

  constructor() {
    const userId$ = toObservable(this.userId).pipe(distinctUntilChanged());
    // The account's read waits for the log's one-event probe, so a horde
    // without the log is asked once, by the probe, and never for an account.
    this.moderation
      .probe('promptEvents')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
    combineLatest([userId$, toObservable(this.shown)])
      .pipe(
        tap(() => this.summary.set(null)),
        filter(([, shown]) => shown),
        switchMap(([userId]) =>
          this.moderation
            .getPromptEvents({ user_id: userId, limit: ACCOUNT_REPORT_LIMIT })
            .pipe(
              map((page) =>
                summariseReports(
                  page.events,
                  ACCOUNT_REPORT_LIMIT,
                  REPORT_RETENTION_SECONDS,
                ),
              ),
              catchError((error: unknown) => {
                this.reportError(error);
                return EMPTY;
              }),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((summary) => this.summary.set(summary));
  }

  /**
   * A browser that never reached the horde, or a horde without the endpoint,
   * says nothing; the record simply does not show.
   */
  private reportError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 0) return;
    if (this.moderation.promptEventsAvailability() !== 'available') return;
    this.toast.error('admin.user_moderation.load_error', {
      transloco: true,
      rawError: error,
    });
  }
}
