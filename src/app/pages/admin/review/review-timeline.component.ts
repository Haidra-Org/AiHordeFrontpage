import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { parseHordeTime } from '../../../helper/horde-time';
import {
  ModerationSubjectDetail,
  PromptModerationReason,
} from '../../../types/moderation';
import {
  BucketRange,
  SEVERITY_ORDER,
  bucketRange,
  busiestRange,
  durationLabel,
  pluralKey,
  rangeInstants,
  timelineColumns,
} from './review-subjects';

/** What a timeline is drawn from: a detail's window, buckets and totals. */
export type TimelineSource = Pick<
  ModerationSubjectDetail,
  'since' | 'until' | 'bucket_seconds' | 'timeline' | 'counts_by_reason'
>;

/** One stacked segment of a timeline column, in the chart's own units. */
interface ChartSegment {
  reason: PromptModerationReason;
  y: number;
  height: number;
}

interface ChartColumn {
  index: number;
  x: number;
  start: Date;
  total: number;
  segments: ChartSegment[];
}

/** Each bucket is this many chart units wide, with a gap either side of its bar. */
const CHART_BAND = 10;
const CHART_BAR = 8;
/** The chart's height in its own units; the drawing stretches to the box. */
const CHART_HEIGHT = 100;
/** About this many time labels run under the chart, whatever its bucket count. */
const CHART_LABELS = 6;

/**
 * When a window's reports came, stacked by reason, most severe at the base,
 * with a range that narrows the page to part of the window. The range is
 * dragged across the chart, or chosen with the buttons for a keyboard or a
 * touch screen. Dragging only draws; the range goes to the page when it is
 * released, and the page decides what to read for it.
 */
@Component({
  selector: 'app-review-timeline',
  imports: [TranslocoPipe, DatePipe],
  templateUrl: './review-timeline.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewTimelineComponent {
  public readonly source = input.required<TimelineSource>();
  /** The released range, or null for the whole window. */
  public readonly range = input<BucketRange | null>(null);
  /** A range was released, or the whole window chosen with null. */
  public readonly rangeChange = output<BucketRange | null>();

  public readonly plural = pluralKey;
  public readonly chartBand = CHART_BAND;
  public readonly chartBar = CHART_BAR;
  public readonly chartHeight = CHART_HEIGHT;

  /** The range while it is being dragged. */
  public readonly dragRange = signal<BucketRange | null>(null);
  public readonly shownRange = computed(() => this.dragRange() ?? this.range());
  private anchor: number | null = null;

  public readonly columns = computed(() =>
    timelineColumns(this.source().timeline),
  );

  /** The window's reasons, most severe first, for the legend. */
  public readonly reasons = computed(() =>
    SEVERITY_ORDER.filter(
      (reason) => (this.source().counts_by_reason[reason] ?? 0) > 0,
    ),
  );

  public readonly windowLength = computed(() => {
    const since = parseHordeTime(this.source().since);
    const until = parseHordeTime(this.source().until);
    if (!since || !until) return durationLabel(60);
    return durationLabel(
      Math.max(1, Math.round((until.getTime() - since.getTime()) / 1000)),
    );
  });

  /** The busiest bucket's count, and the round number the chart scales to. */
  public readonly chartTop = computed(() => {
    const max = Math.max(0, ...this.columns().map((column) => column.total));
    // Even steps, so the midline label is a whole number.
    const step = max > 10 ? 10 : 2;
    return { max, top: Math.max(step, Math.ceil(max / step) * step) };
  });
  public readonly chartWidth = computed(
    () => Math.max(1, this.columns().length) * CHART_BAND,
  );
  public readonly chartColumns = computed<ChartColumn[]>(() => {
    const { top } = this.chartTop();
    return this.columns().map((column) => {
      let base = 0;
      const segments = column.segments.map((segment) => {
        const height = (segment.count / top) * CHART_HEIGHT;
        base += height;
        return { reason: segment.reason, y: CHART_HEIGHT - base, height };
      });
      return {
        index: column.index,
        x: column.index * CHART_BAND + (CHART_BAND - CHART_BAR) / 2,
        start: column.start,
        total: column.total,
        segments,
      };
    });
  });
  /** The time labels under the chart, as positions along it in percent. */
  public readonly chartLabels = computed(() => {
    const columns = this.columns();
    const every = Math.max(1, Math.ceil(columns.length / CHART_LABELS));
    return columns
      .filter((column) => column.index % every === 0)
      .map((column) => ({
        start: column.start,
        left: ((column.index + 0.5) / columns.length) * 100,
      }));
  });
  /** Windows longer than a day label the chart by date rather than time. */
  public readonly chartLabelFormat = computed(() => {
    const since = parseHordeTime(this.source().since)?.getTime() ?? 0;
    const until = parseHordeTime(this.source().until)?.getTime() ?? 0;
    return until - since > 86_400_000 ? 'MMM d' : 'shortTime';
  });
  public readonly bucketLength = computed(() =>
    durationLabel(this.source().bucket_seconds),
  );
  public readonly busiest = computed(() =>
    busiestRange(this.columns(), this.source().bucket_seconds),
  );
  public readonly busiestLength = computed(() => {
    const busiest = this.busiest();
    return busiest
      ? durationLabel(
          (busiest.to - busiest.from + 1) * this.source().bucket_seconds,
        )
      : null;
  });
  /** The shown range's instants and how many reports its buckets hold. */
  public readonly shownSpan = computed(() => {
    const range = this.shownRange();
    if (!range) return null;
    const instants = rangeInstants(this.source(), this.columns(), range);
    if (!instants) return null;
    const count = this.columns()
      .slice(range.from, range.to + 1)
      .reduce((sum, column) => sum + column.total, 0);
    return { ...instants, count };
  });

  public reasonKey(reason: PromptModerationReason): string {
    return `admin.review.reason.${reason}`;
  }

  public isInRange(index: number): boolean {
    const range = this.shownRange();
    return range === null || (index >= range.from && index <= range.to);
  }

  public onChartPointerDown(event: PointerEvent, chart: Element): void {
    if (event.button !== 0 || !this.columns().length) return;
    const index = this.indexAt(event, chart);
    this.anchor = index;
    this.dragRange.set({ from: index, to: index });
    chart.setPointerCapture?.(event.pointerId);
  }

  public onChartPointerMove(event: PointerEvent, chart: Element): void {
    if (this.anchor === null) return;
    this.dragRange.set(bucketRange(this.anchor, this.indexAt(event, chart)));
  }

  public onChartPointerUp(event: PointerEvent, chart: Element): void {
    if (this.anchor === null) return;
    const range = bucketRange(this.anchor, this.indexAt(event, chart));
    this.anchor = null;
    this.dragRange.set(null);
    this.release(range);
  }

  public onChartPointerCancel(): void {
    this.anchor = null;
    this.dragRange.set(null);
  }

  public selectBusiest(): void {
    const busiest = this.busiest();
    if (busiest) this.release(busiest);
  }

  public selectAll(): void {
    this.release(null);
  }

  /** The whole window is the same as no range. */
  private release(range: BucketRange | null): void {
    const last = this.columns().length - 1;
    const whole = range === null || (range.from <= 0 && range.to >= last);
    this.rangeChange.emit(whole ? null : range);
  }

  private indexAt(event: PointerEvent, chart: Element): number {
    const count = this.columns().length;
    const box = chart.getBoundingClientRect();
    const share = box.width > 0 ? (event.clientX - box.left) / box.width : 0;
    return Math.max(0, Math.min(count - 1, Math.floor(share * count)));
  }
}
