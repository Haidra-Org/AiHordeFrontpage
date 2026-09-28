import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { EMPTY, catchError, switchMap, tap } from 'rxjs';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';
import { IconComponent } from '../../../components/icon/icon.component';
import {
  ReportingWorker,
  ReportingWorkerSort,
} from '../../../types/moderation';
import { durationLabel, pluralKey } from './review-subjects';
import { ReviewGridDirective } from './review-grid.directive';
import { isSplitView } from './review-layout';
import { ReviewWorkerComponent } from './review-worker.component';

/** Workers per page of the ranking. */
export const WORKER_PAGE_SIZE = 50;

/** The windows the ranking offers, in seconds; the horde keeps reports for 30 days. */
export const WORKER_WINDOWS: readonly number[] = [86_400, 604_800, 2_592_000];

/** The window the ranking opens on. */
export const DEFAULT_WORKER_WINDOW = 604_800;

export const WORKER_SORTS: readonly ReportingWorkerSort[] = [
  'reports',
  'accounts',
  'cleared',
];

/**
 * Workers ranked by the reports they made, beside the page of the open one.
 * The view reads only: pausing a worker stays on its worker card. Which
 * worker is open lives in the address, through `worker` and `workerChange`.
 */
@Component({
  selector: 'app-review-workers',
  imports: [
    TranslocoPipe,
    IconComponent,
    ReviewGridDirective,
    ReviewWorkerComponent,
  ],
  templateUrl: './review-workers.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewWorkersComponent {
  private readonly moderation = inject(AdminModerationService);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  /** The open worker's id, or null. */
  public readonly worker = input<string | null>(null);
  public readonly workerChange = output<string | null>();

  public readonly windows = WORKER_WINDOWS;
  public readonly sorts = WORKER_SORTS;
  public readonly duration = durationLabel;
  public readonly plural = pluralKey;

  public readonly window = signal(DEFAULT_WORKER_WINDOW);
  public readonly sort = signal<ReportingWorkerSort>('reports');

  public readonly workers = signal<ReportingWorker[]>([]);
  public readonly total = signal<number | null>(null);
  public readonly nextOffset = signal<number | null>(null);
  public readonly loading = signal(false);
  public readonly loadingMore = signal(false);
  public readonly failed = signal(false);
  private readonly reloads = signal(0);

  /** On a narrow screen, whether the open worker's page replaces the list. */
  public readonly detailShown = linkedSignal({
    source: this.worker,
    computation: (worker) => worker !== null,
  });

  public readonly openRow = computed(
    () => this.workers().find((row) => row.worker_id === this.worker()) ?? null,
  );

  private readonly detail = viewChild(ReviewWorkerComponent);

  constructor() {
    const request = computed(() => ({
      window: this.window(),
      sort: this.sort(),
      reload: this.reloads(),
    }));
    toObservable(request)
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap(({ window, sort }) =>
          this.moderation
            .getReportingWorkers({ window, sort, limit: WORKER_PAGE_SIZE })
            .pipe(
              catchError((error: unknown) => {
                this.loading.set(false);
                this.failed.set(true);
                this.toast.error('admin.review.workers.load_error', {
                  transloco: true,
                  rawError: error,
                });
                return EMPTY;
              }),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => {
        this.workers.set(page.workers);
        this.total.set(page.total);
        this.nextOffset.set(page.next_offset);
        this.loading.set(false);
      });
  }

  public sortKey(sort: ReportingWorkerSort): string {
    return `admin.review.workers.sort.${sort}`;
  }

  /** The row the list's single tab stop sits on: the open worker, else the first. */
  public tabStop(): string | undefined {
    return this.worker() ?? this.workers().at(0)?.worker_id;
  }

  public retry(): void {
    this.reloads.update((count) => count + 1);
  }

  public loadMore(): void {
    const offset = this.nextOffset();
    if (offset === null || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.moderation
      .getReportingWorkers({
        window: this.window(),
        sort: this.sort(),
        limit: WORKER_PAGE_SIZE,
        offset,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.workers.update((rows) => [...rows, ...page.workers]);
          this.nextOffset.set(page.next_offset);
          this.loadingMore.set(false);
        },
        error: (error: unknown) => {
          this.loadingMore.set(false);
          this.toast.error('admin.review.workers.load_error', {
            transloco: true,
            rawError: error,
          });
        },
      });
  }

  public open(row: ReportingWorker): void {
    this.workerChange.emit(row.worker_id);
    this.detailShown.set(true);
    if (!isSplitView(this.document)) {
      setTimeout(() => this.detail()?.focusHeading());
    }
  }

  /** Leave the page on a narrow screen, returning to the worker's row. */
  public back(): void {
    const id = this.worker();
    this.detailShown.set(false);
    setTimeout(() =>
      this.document
        .querySelector<HTMLElement>(`[data-worker="${CSS.escape(id ?? '')}"]`)
        ?.focus(),
    );
  }
}
