import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { PublicHistoryDay } from '../../types/status';

/** Coordinate space the sparkline is authored in; CSS scales it responsively. */
export const SPARK_WIDTH = 100;
export const SPARK_HEIGHT = 28;

/** Trailing days of history charted in the sparkline. */
export const SPARK_DAYS = 30;

/** Pre-computed SVG point strings for one service's uptime sparkline. */
export interface SparkPoints {
  /** `points` for the trend `<polyline>`. */
  line: string;
  /** `points` for the filled `<polygon>` beneath the trend. */
  area: string;
}

/**
 * A single day's operational fraction (0-100). Matches the backend definition:
 * uptime = operational / (operational + degraded + down). Unknown and
 * maintenance seconds are excluded so pre-monitoring gaps do not count as
 * downtime. Days with no tracked time read as fully up.
 */
export function dailyUptimePercent(day: PublicHistoryDay): number {
  const active =
    day.operational_seconds + day.degraded_seconds + day.down_seconds;
  if (active <= 0) return 100;
  return (day.operational_seconds / active) * 100;
}

/**
 * Project an uptime series onto the sparkline coordinate space. The visible
 * range is padded by 0.1% on each side so a flat 100% line still renders with a
 * little headroom. Returns null when there are too few points to draw a line.
 */
export function buildSparkline(series: number[]): SparkPoints | null {
  if (series.length < 2) return null;
  const min = Math.min(...series) - 0.1;
  const max = Math.max(...series) + 0.1;
  const range = Math.max(0.1, max - min);
  const points = series.map((value, index) => {
    const x = (index / (series.length - 1)) * SPARK_WIDTH;
    const y = SPARK_HEIGHT - ((value - min) / range) * (SPARK_HEIGHT - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = points.join(' ');
  return {
    line,
    area: `0,${SPARK_HEIGHT} ${line} ${SPARK_WIDTH},${SPARK_HEIGHT}`,
  };
}

/**
 * The trailing uptime trend for one service, drawn from its daily buckets.
 *
 * The figure is supporting detail wherever it appears: it says whether a
 * service has been steady without asking anybody to read a value off it, which
 * is why it carries no axis and no label of its own. It renders nothing at all
 * when there is too little history for a line to mean anything.
 */
@Component({
  selector: 'app-uptime-sparkline',
  template: `
    @if (points(); as spark) {
      <svg
        class="status-sparkline status-sparkline--{{ tone() }}"
        viewBox="0 0 100 28"
        width="100"
        height="28"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polygon
          class="status-sparkline__area"
          [attr.points]="spark.area"
        ></polygon>
        <polyline
          class="status-sparkline__line"
          [attr.points]="spark.line"
        ></polyline>
      </svg>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UptimeSparklineComponent {
  /** The service's daily buckets, oldest first; the trailing days are charted. */
  public readonly days = input<readonly PublicHistoryDay[]>([]);

  /**
   * The service's state, which the line takes its colour from, so the trend
   * tracks the dot and the pill beside it.
   */
  public readonly tone = input('operational');

  public readonly points = computed<SparkPoints | null>(() =>
    buildSparkline(this.days().slice(-SPARK_DAYS).map(dailyUptimePercent)),
  );
}
