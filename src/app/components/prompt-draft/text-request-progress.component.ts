import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';
import type { StoredTextRequest } from '../../services/text-generation-db.service';
import type { QueueTrend } from '../../services/generation-wait-insights.service';

/** The two model choices a stuck request can be sent again with. */
export type TextRequestRepick = 'auto' | 'any';

/** Past this many seconds a duration is said in minutes. */
const MINUTE_THRESHOLD_SECONDS = 60;

/**
 * The worker that answered, where the horde named one. An answer with nothing
 * in it is the one failure a reader can act on: the worker is named so they
 * know which one it was, and the retry goes to another.
 */
export function answeringWorker(request: StoredTextRequest): string | null {
  for (const take of request.results ?? []) {
    const name = take.workerName ?? take.workerId;
    if (name) return name;
  }
  return null;
}

/**
 * Whether a later request will keep this one's worker off. The queue avoids
 * workers by id, so an answer the horde attached a name to but no id leaves
 * nobody avoided, and the retry may go back to the same worker.
 */
export function avoidsWorker(request: StoredTextRequest): boolean {
  return (request.results ?? []).some((take) => !!take.workerId);
}

/**
 * Why an answer had nothing in it, where every take gives the same reason.
 * Takes that disagree leave the line off rather than picking one of them.
 */
export function emptyReasonKey(request: StoredTextRequest): string | null {
  const reasons = new Set(
    (request.results ?? []).flatMap((take) =>
      take.reason ? [take.reason] : [],
    ),
  );
  if (reasons.size !== 1) return null;
  return reasons.has('censored')
    ? 'prompt_draft.empty_censored'
    : 'prompt_draft.empty_blank';
}

/** What became of a request that ended without an answer to show. */
export function settledStateKey(request: StoredTextRequest): string | null {
  switch (request.state) {
    case 'empty':
      return answeringWorker(request)
        ? 'prompt_draft.empty'
        : 'prompt_draft.empty_unknown';
    case 'faulted':
      return request.errorKey ?? 'prompt_draft.faulted';
    case 'expired':
      return 'prompt_draft.queue.expired';
    case 'cancelled':
      return request.anonymous
        ? 'prompt_draft.queue.cancelled_anonymous'
        : 'prompt_draft.queue.cancelled';
    default:
      return null;
  }
}

/**
 * Where a text request stands, in a line or two, with the presses that apply
 * to it. The request's own words (the takes) are drawn by the card; this is
 * only what happened on the way to them.
 *
 * The line that changes with the state is a polite live region. The time
 * waited sits outside it, since a figure that moves every second would be read
 * out every second.
 */
@Component({
  selector: 'app-text-request-progress',
  imports: [TranslocoPipe, IconComponent],
  templateUrl: './text-request-progress.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'alchemy-draft__progress' },
})
export class TextRequestProgressComponent {
  private readonly transloco = inject(TranslocoService);

  public readonly request = input.required<StoredTextRequest>();
  /** The clock the time waited is drawn against. */
  public readonly now = input.required<number>();
  /** How the horde-wide position has moved, where it has. */
  public readonly trend = input<QueueTrend | null>(null);
  /** Whether a cancel has been sent and not yet answered. */
  public readonly cancelling = input(false);
  /** Whether a press elsewhere on the card is still sending. */
  public readonly busy = input(false);

  public readonly cancelRequest = output();
  public readonly repick = output<TextRequestRepick>();
  public readonly retry = output();
  /** Show everything that was sent and everything that came back. */
  public readonly details = output();

  /** The worker that wrote the empty answer, where the horde named one. */
  public readonly worker = computed(() => answeringWorker(this.request()));

  /** Whether the next try goes to a different worker. */
  public readonly avoided = computed(() => avoidsWorker(this.request()));

  /** The second sentence of an empty answer's line, where there is one. */
  public readonly emptyReason = computed(() => emptyReasonKey(this.request()));

  public readonly live = computed(() => {
    const state = this.request().state;
    return state === 'sending' || state === 'queued' || state === 'writing';
  });

  /**
   * No worker online can take the request. The horde keeps it all the same, and
   * it runs if one appears, so this is said as a reason to wait or repick, not
   * as a failure.
   */
  public readonly noWorker = computed(() => {
    const request = this.request();
    const figures = request.figures;
    return (
      request.state === 'queued' &&
      figures !== undefined &&
      (!figures.isPossible || figures.eligibleWorkers === 0)
    );
  });

  /** Other model choices are offered while nothing can run it, and after it expired. */
  public readonly offerRepick = computed(
    () => this.noWorker() || this.request().state === 'expired',
  );

  public readonly trendKey = computed(() => {
    const trend = this.trend();
    return trend ? `generate.results.queue_trend_${trend}` : null;
  });

  /** How long the request has been waiting, in the reader's words. */
  public readonly waited = computed(() =>
    this.duration(
      Math.max(0, Math.round((this.now() - this.request().createdAt) / 1000)),
    ),
  );

  /** A number of seconds, said in seconds under a minute and minutes above. */
  public duration(seconds: number): string {
    if (seconds < MINUTE_THRESHOLD_SECONDS) {
      return this.transloco.translate(
        seconds === 1
          ? 'prompt_draft.queue.seconds_one'
          : 'prompt_draft.queue.seconds_other',
        { count: seconds },
      );
    }
    const minutes = Math.round(seconds / MINUTE_THRESHOLD_SECONDS);
    return this.transloco.translate(
      minutes === 1
        ? 'prompt_draft.queue.minutes_one'
        : 'prompt_draft.queue.minutes_other',
      { count: minutes },
    );
  }
}
