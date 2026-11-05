import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  EMPTY,
  Observable,
  catchError,
  distinctUntilChanged,
  switchMap,
  tap,
} from 'rxjs';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';
import { IconComponent } from '../../icon/icon.component';
import {
  WorkerSuspicionEvent,
  WorkerSuspicionEventsPage,
} from '../../../types/moderation';
import { parseHordeTime } from '../../../helper/horde-time';

/** Suspicion events per page of a history. */
export const SUSPICION_HISTORY_PAGE_SIZE = 20;

/**
 * Whose history to read: one worker's, or every worker an account owns.
 */
export type SuspicionHistoryFilter =
  { worker_id: string } | { user_id: number };

/**
 * `section` reads the history as soon as it is shown, under its own heading.
 * `disclosure` stays folded and reads nothing until it is opened, for places
 * that show many at once: the moderator endpoints share one rate limit, so a
 * list of workers must not ask for every worker's history on arrival.
 */
export type SuspicionHistoryMode = 'section' | 'disclosure';

let nextId = 0;

function filterKey(filter: SuspicionHistoryFilter | null): string {
  if (filter === null) return '';
  return 'user_id' in filter
    ? `user:${filter.user_id}`
    : `worker:${filter.worker_id}`;
}

/**
 * The worker suspicion log for one worker or one account's workers, newest
 * first, a page at a time.
 */
@Component({
  selector: 'app-suspicion-history',
  imports: [TranslocoPipe, DatePipe, NgTemplateOutlet, IconComponent],
  templateUrl: './suspicion-history.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuspicionHistoryComponent {
  private readonly moderation = inject(AdminModerationService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly filter = input.required<SuspicionHistoryFilter>();
  public readonly mode = input<SuspicionHistoryMode>('section');
  public readonly hordeTime = parseHordeTime;

  public readonly headingId = `suspicion-history-${nextId}`;
  public readonly bodyId = `suspicion-history-body-${nextId++}`;

  public readonly byAccount = computed(() => 'user_id' in this.filter());

  public readonly history = signal<WorkerSuspicionEvent[]>([]);
  public readonly cursor = signal<number | null>(null);
  public readonly loading = signal(false);
  public readonly loadingMore = signal(false);
  /**
   * The first page was refused. Said in place of the empty state, which would
   * otherwise claim that nothing is recorded.
   */
  public readonly failed = signal(false);

  /** Disclosure mode: whether the reader has it open now. */
  public readonly open = signal(false);
  /** Disclosure mode: set on the first opening and kept, so closing it keeps what was read. */
  private readonly requested = signal(false);
  /** A request the browser never got through to the horde. */
  private readonly unreachable = signal(false);

  /**
   * The history shows once its endpoint has answered, and while a first
   * request is on its way; a failure the horde never saw leaves nothing.
   */
  public readonly contentShown = computed(
    () =>
      this.loading() ||
      this.moderation.workerSuspicionEventsAvailability() === 'available',
  );

  /**
   * A folded disclosure is offered until the endpoint is known to be missing
   * or out of reach. It cannot wait for `available`, since opening it is what
   * asks first.
   */
  public readonly disclosureShown = computed(
    () =>
      !this.unreachable() &&
      this.moderation.workerSuspicionEventsAvailability() !== 'absent',
  );

  private readonly active = computed<SuspicionHistoryFilter | null>(() =>
    this.mode() === 'section' || this.requested() ? this.filter() : null,
  );

  constructor() {
    toObservable(this.active)
      .pipe(
        distinctUntilChanged((a, b) => filterKey(a) === filterKey(b)),
        tap(() => {
          this.history.set([]);
          this.cursor.set(null);
          this.loading.set(false);
          this.loadingMore.set(false);
          this.failed.set(false);
        }),
        switchMap((filter) => {
          if (filter === null) return EMPTY;
          this.loading.set(true);
          return this.fetch(filter).pipe(
            catchError((error: unknown) => {
              this.loading.set(false);
              this.failed.set(true);
              this.reportError(error);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => {
        this.history.set(page.events);
        this.cursor.set(page.next_cursor);
        this.loading.set(false);
      });
  }

  public toggle(): void {
    this.requested.set(true);
    this.open.update((open) => !open);
  }

  public loadMore(): void {
    const filter = this.active();
    const cursor = this.cursor();
    if (filter === null || cursor === null || this.loadingMore()) return;
    const key = filterKey(filter);
    this.loadingMore.set(true);
    this.fetch(filter, cursor)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          if (filterKey(this.active()) !== key) return;
          this.history.update((events) => [...events, ...page.events]);
          this.cursor.set(page.next_cursor);
          this.loadingMore.set(false);
        },
        error: (error: unknown) => {
          this.loadingMore.set(false);
          this.reportError(error);
        },
      });
  }

  private fetch(
    filter: SuspicionHistoryFilter,
    beforeId?: number,
  ): Observable<WorkerSuspicionEventsPage> {
    return this.moderation.getWorkerSuspicionEvents({
      ...filter,
      limit: SUSPICION_HISTORY_PAGE_SIZE,
      ...(beforeId !== undefined ? { before_id: beforeId } : {}),
    });
  }

  /**
   * A refusal from the horde is worth saying; a request the browser never
   * got through to it only means the history is not on offer here.
   */
  private reportError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 0) {
      this.unreachable.set(true);
      return;
    }
    if (this.moderation.workerSuspicionEventsAvailability() !== 'available') {
      return;
    }
    this.toast.error('admin.suspicion_history.error', {
      transloco: true,
      rawError: error,
    });
  }
}
