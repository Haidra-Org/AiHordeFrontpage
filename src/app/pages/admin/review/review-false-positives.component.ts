import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { EMPTY, catchError, forkJoin, switchMap, tap } from 'rxjs';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';
import {
  FalsePositiveReport,
  ReportingWorker,
} from '../../../types/moderation';
import { durationLabel, workerParams } from './review-subjects';

/** The windows the panel offers, in seconds; the horde keeps reports for 30 days. */
export const FALSE_POSITIVE_WINDOWS: readonly number[] = [
  86_400, 604_800, 2_592_000,
];

/** The window the panel opens on, the horde's own default. */
export const DEFAULT_FALSE_POSITIVE_WINDOW = 2_592_000;

/** How many workers the benign list shows, most cleared first. */
export const CLEARED_WORKERS_LIMIT = 50;

/**
 * Worker reports that a benign decision later covered, counted by model and
 * by worker over a chosen window. A model or worker high on these lists is
 * one whose reports moderators keep finding unfounded. The workers come
 * from the reporting-workers ranking, ordered by the reports cleared.
 */
@Component({
  selector: 'app-review-false-positives',
  imports: [TranslocoPipe, RouterLink],
  templateUrl: './review-false-positives.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewFalsePositivesComponent {
  private readonly moderation = inject(AdminModerationService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly windows = FALSE_POSITIVE_WINDOWS;
  public readonly duration = durationLabel;
  public readonly workerParams = workerParams;

  public readonly window = signal(DEFAULT_FALSE_POSITIVE_WINDOW);
  public readonly report = signal<FalsePositiveReport | null>(null);
  /** Workers with at least one report cleared, most first. */
  public readonly cleared = signal<ReportingWorker[]>([]);
  public readonly loading = signal(false);
  public readonly failed = signal(false);
  public readonly loadingMore = signal(false);

  private readonly reloads = signal(0);
  private moreRequest?: import('rxjs').Subscription;

  constructor() {
    const request = computed(() => ({
      window: this.window(),
      reload: this.reloads(),
    }));
    toObservable(request)
      .pipe(
        tap(() => {
          this.moreRequest?.unsubscribe();
          this.loadingMore.set(false);
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap(({ window }) =>
          forkJoin({
            report: this.moderation.getFalsePositives(window),
            workers: this.moderation.getReportingWorkers({
              window,
              sort: 'cleared',
              limit: CLEARED_WORKERS_LIMIT,
            }),
          }).pipe(
            catchError((error: unknown) => {
              this.loading.set(false);
              this.failed.set(true);
              this.toast.error('admin.review.false_positives.load_error', {
                transloco: true,
                rawError: error,
              });
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ report, workers }) => {
        this.report.set(report);
        this.cleared.set(workers.workers.filter((row) => row.cleared > 0));
        this.loading.set(false);
      });
  }

  public loadMoreModels(): void {
    const offset = this.report()?.next_offset;
    if (offset == null || this.loadingMore() || this.loading()) return;
    this.loadingMore.set(true);
    this.moreRequest = this.moderation
      .getFalsePositives(this.window(), offset)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.report.update((current) =>
            current
              ? { ...page, models: [...current.models, ...page.models] }
              : page,
          );
          this.loadingMore.set(false);
        },
        error: (error: unknown) => {
          this.loadingMore.set(false);
          this.toast.error('admin.review.false_positives.load_error', {
            transloco: true,
            rawError: error,
          });
        },
      });
  }

  public retry(): void {
    this.reloads.update((count) => count + 1);
  }
}
