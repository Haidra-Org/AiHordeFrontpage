import { DestroyRef, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { retryOnRateLimit } from '../../../helper/rate-limit-retry';
import {
  EMPTY,
  Observable,
  Subject,
  catchError,
  of,
  switchMap,
  tap,
  timer,
} from 'rxjs';
import {
  BucketRange,
  RANGE_SETTLE_MS,
  SettledRange,
  hordeInstant,
} from './review-subjects';

/** How far a brushed range's detail has come. */
export type RangeState = 'idle' | 'loading' | 'ready' | 'failed';

/** A released run of buckets with the instants it covers. */
export interface RangeSelection {
  range: BucketRange;
  since: Date;
  until: Date;
}

export interface RangeReaderOptions<D> {
  /** Read the page's detail over `[since, until)`, reports included. */
  read: (since: string, until: string) => Observable<D>;
  failed: (error: unknown) => void;
  destroyRef: DestroyRef;
}

/**
 * A brushed range and its reading, shared by every page with a timeline.
 *
 * Nothing is read while a range is dragged. A released range settles for
 * `RANGE_SETTLE_MS`, then reads the page's detail over the range once; the
 * detail carries the range's reports, so the report list needs no reading
 * of its own. Every release goes through one `switchMap`, so a newer
 * release, or a clear, cancels the pending settle and the reading before it.
 */
export class RangeReader<D> {
  /** The released range, or null for the whole window. */
  public readonly range = signal<BucketRange | null>(null);
  /** The released range once it has settled and its reading has begun. */
  public readonly settled = signal<SettledRange | null>(null);
  public readonly detail = signal<D | null>(null);
  public readonly state = signal<RangeState>('idle');
  /** Seconds the rate limiter asked the range read to wait, while it waits. */
  public readonly limitWait = signal<number | null>(null);

  private readonly selections = new Subject<RangeSelection | null>();
  private last: RangeSelection | null = null;

  constructor(private readonly options: RangeReaderOptions<D>) {
    this.selections
      .pipe(
        switchMap((selection) =>
          selection === null
            ? of(null).pipe(tap(() => this.apply(null)))
            : timer(RANGE_SETTLE_MS).pipe(
                switchMap(() => this.readSelection(selection)),
              ),
        ),
        takeUntilDestroyed(options.destroyRef),
      )
      .subscribe();
  }

  public select(selection: RangeSelection | null): void {
    this.range.set(selection?.range ?? null);
    this.last = selection;
    this.selections.next(selection);
  }

  public retry(): void {
    if (this.last) this.selections.next(this.last);
  }

  public clear(): void {
    this.select(null);
  }

  private readSelection(selection: RangeSelection): Observable<unknown> {
    this.apply({ since: selection.since, until: selection.until });
    this.state.set('loading');
    return this.options
      .read(hordeInstant(selection.since), hordeInstant(selection.until))
      .pipe(
        retryOnRateLimit((seconds) => this.limitWait.set(seconds)),
        tap((answer) => {
          this.limitWait.set(null);
          this.detail.set(answer);
          this.state.set('ready');
        }),
        catchError((error: unknown) => {
          this.limitWait.set(null);
          this.state.set('failed');
          this.options.failed(error);
          return EMPTY;
        }),
      );
  }

  private apply(settled: SettledRange | null): void {
    this.settled.set(settled);
    this.detail.set(null);
    this.state.set('idle');
    this.limitWait.set(null);
  }
}
