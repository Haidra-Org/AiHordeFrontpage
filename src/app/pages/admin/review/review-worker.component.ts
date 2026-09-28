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
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { EMPTY, catchError, distinctUntilChanged, switchMap, tap } from 'rxjs';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';
import { IconComponent } from '../../../components/icon/icon.component';
import { extractApiErrorField } from '../../../helper/extract-api-error';
import { parseHordeTime } from '../../../helper/horde-time';
import { retryOnRateLimit } from '../../../helper/rate-limit-retry';
import {
  ModerationWorkerDetail,
  PromptModerationReason,
  ReportingWorker,
} from '../../../types/moderation';
import {
  BucketRange,
  SEVERITY_ORDER,
  durationLabel,
  pluralKey,
  rangeInstants,
  timelineColumns,
} from './review-subjects';
import { RangeReader } from './review-range';
import { ReviewPivotsComponent } from './review-pivots.component';
import {
  ReportsPage,
  ReviewSubjectEventsComponent,
} from './review-subject-events.component';
import { ReviewTimelineComponent } from './review-timeline.component';

/**
 * One reporting worker, laid out with the pieces of a subject's page: when
 * its reports came, with a range that narrows the page, the accounts it
 * reported and the models asked for, and its reports one by one. A worker
 * carries no decisions or rules, and pausing it stays on its worker card.
 *
 * Opening a worker reads its detail and its first page of reports; a
 * brushed range reads as on a subject's page, through `RangeReader`.
 */
@Component({
  selector: 'app-review-worker',
  imports: [
    TranslocoPipe,
    DatePipe,
    RouterLink,
    IconComponent,
    ReviewTimelineComponent,
    ReviewPivotsComponent,
    ReviewSubjectEventsComponent,
  ],
  templateUrl: './review-worker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewWorkerComponent {
  private readonly moderation = inject(AdminModerationService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly workerId = input.required<string>();
  /** What the ranking knows about the worker; null when it is not listed. */
  public readonly row = input<ReportingWorker | null>(null);

  public readonly back = output<void>();

  public readonly plural = pluralKey;

  public readonly detail = signal<ModerationWorkerDetail | null>(null);
  public readonly detailState = signal<
    'loading' | 'ready' | 'failed' | 'missing'
  >('loading');
  private readonly reloads = signal(0);
  /** Seconds the rate limiter asked the detail read to wait, while it waits. */
  public readonly limitWait = signal<number | null>(null);

  public readonly name = computed(
    () =>
      this.detail()?.worker_name ?? this.row()?.worker_name ?? this.workerId(),
  );
  public readonly paused = computed(
    () => this.detail()?.paused ?? this.row()?.paused ?? null,
  );

  public readonly reasonCounts = computed(() => {
    const detail = this.detail();
    if (!detail) return [];
    return SEVERITY_ORDER.map((reason) => ({
      reason,
      count: detail.counts_by_reason[reason] ?? 0,
    })).filter((entry) => entry.count > 0);
  });

  public readonly windowLength = computed(() => {
    const since = parseHordeTime(this.detail()?.since);
    const until = parseHordeTime(this.detail()?.until);
    if (!since || !until) return null;
    return durationLabel(
      Math.max(1, Math.round((until.getTime() - since.getTime()) / 1000)),
    );
  });

  public readonly ranged = new RangeReader<ModerationWorkerDetail>({
    read: (since, until) =>
      this.moderation.getWorkerDetail({
        worker_id: this.workerId(),
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

  /** The first page of reports: the brushed range's, else the window's. */
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

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  constructor() {
    const request = computed(() => ({
      id: this.workerId(),
      reload: this.reloads(),
    }));
    let shownId: string | null = null;
    toObservable(request)
      .pipe(
        distinctUntilChanged((a, b) => a.id === b.id && a.reload === b.reload),
        tap(({ id }) => {
          if (id !== shownId) {
            this.detail.set(null);
            this.ranged.clear();
          }
          shownId = id;
          this.detailState.set('loading');
        }),
        switchMap(({ id }) =>
          this.moderation.getWorkerDetail({ worker_id: id }).pipe(
            retryOnRateLimit((seconds) => this.limitWait.set(seconds)),
            catchError((error: unknown) => {
              this.limitWait.set(null);
              if (extractApiErrorField(error, 'rc') === 'WorkerNotFound') {
                this.detailState.set('missing');
                return EMPTY;
              }
              this.detailState.set('failed');
              this.toast.error('admin.review.workers.detail_load_error', {
                transloco: true,
                rawError: error,
              });
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
      });
  }

  public reasonKey(reason: PromptModerationReason): string {
    return `admin.review.reason.${reason}`;
  }

  public focusHeading(): void {
    this.heading()?.nativeElement.focus();
  }

  public reload(): void {
    this.reloads.update((count) => count + 1);
  }

  /** Narrow the page to a run of buckets, or to the whole window with null. */
  public selectRange(range: BucketRange | null): void {
    const detail = this.detail();
    if (!detail || range === null) {
      this.ranged.select(null);
      return;
    }
    const columns = timelineColumns(detail.timeline);
    const instants = rangeInstants(detail, columns, range);
    const whole = range.from <= 0 && range.to >= columns.length - 1;
    this.ranged.select(whole || !instants ? null : { range, ...instants });
  }
}
