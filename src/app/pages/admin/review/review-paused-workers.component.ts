import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT, DatePipe, DecimalPipe } from '@angular/common';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Params, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  EMPTY,
  Observable,
  catchError,
  concatMap,
  defer,
  distinctUntilChanged,
  from,
  map,
  of,
  switchMap,
  tap,
  timer,
  toArray,
} from 'rxjs';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { ModerationCountsService } from '../../../services/moderation-counts.service';
import { ToastService } from '../../../services/toast.service';
import { IconComponent } from '../../../components/icon/icon.component';
import { AdminDialogComponent } from '../../../components/admin/admin-dialog/admin-dialog.component';
import { SuspicionHistoryComponent } from '../../../components/admin/suspicion-history/suspicion-history.component';
import { extractApiErrorField } from '../../../helper/extract-api-error';
import { parseHordeTime } from '../../../helper/horde-time';
import { WorkerType } from '../../../types/horde-worker';
import {
  ModerationOverview,
  ModerationOverviewQuery,
  PausedWorkerReview,
  PausedWorkerSort,
} from '../../../types/moderation';
import { ReviewGridDirective } from './review-grid.directive';
import { isSplitView, nextAfter } from './review-layout';
import { refusalKey } from './review-subjects';
import { DEFAULT_PROMPTS, promptsParams } from './review-query';

export type WorkerAction = 'unpause' | 'maintenance_on' | 'maintenance_off';

/** The most paused workers one read returns; the horde allows up to 500. */
export const PAUSED_LIMIT = 500;

/**
 * The pause between the per-worker calls of a bulk action. Each call is its
 * own PUT on the worker, under the worker endpoints' own rate limit, so the
 * run is spaced rather than sent at once.
 */
export const BULK_PACE_MS = 400;

export const WORKER_KINDS: readonly WorkerType[] = [
  'image',
  'text',
  'interrogation',
];

export const PAUSED_SORTS: readonly PausedWorkerSort[] = [
  'suspicion',
  'last_check_in',
  'name',
  'owner',
];

/**
 * The orders offered besides the horde's default, which is latest check-in
 * first and is what no `sort` asks for.
 */
export const PAUSED_SORT_CHOICES: readonly PausedWorkerSort[] =
  PAUSED_SORTS.filter((sort) => sort !== 'last_check_in');

/**
 * The horde's worker suspicion causes, by the id its `Suspicions` enum gives
 * them. The account-level causes (username length and profanity, corrupt
 * prompts) never mark a worker, so they are not offered as filters.
 */
export const WORKER_SUSPICION_CAUSES: readonly { id: number; key: string }[] = [
  { id: 0, key: 'worker_name_long' },
  { id: 1, key: 'worker_name_extreme' },
  { id: 2, key: 'worker_profanity' },
  { id: 3, key: 'unsafe_ip' },
  { id: 4, key: 'extreme_max_pixels' },
  { id: 5, key: 'unreasonably_fast' },
  { id: 9, key: 'too_many_jobs_aborted' },
];

/** Owner states the page filters by on the list it already holds. */
export type OwnerState = 'trusted' | 'flagged' | 'over';

export const OWNER_STATES: readonly OwnerState[] = [
  'trusted',
  'flagged',
  'over',
];

export interface PausedFilters {
  kinds: WorkerType[];
  causes: number[];
  /** Null for online and offline alike. */
  online: boolean | null;
  /** Null for the horde's own order. */
  sort: PausedWorkerSort | null;
  owners: OwnerState[];
}

export const DEFAULT_PAUSED_FILTERS: PausedFilters = {
  kinds: [],
  causes: [],
  online: null,
  sort: null,
  owners: [],
};

/** The overview request for a set of filters. Owner states stay on the page. */
export function pausedQueryOf(filters: PausedFilters): ModerationOverviewQuery {
  return {
    limit: PAUSED_LIMIT,
    ...(filters.kinds.length ? { worker_type: filters.kinds } : {}),
    ...(filters.causes.length ? { suspicion_id: filters.causes } : {}),
    ...(filters.online !== null ? { online: filters.online } : {}),
    ...(filters.sort !== null ? { sort: filters.sort } : {}),
  };
}

/**
 * Whether a worker's owner is in any of the chosen states; any owner when none
 * is chosen. `suspicionThreshold` is the overview's account threshold, which
 * the owner's suspicion is held against.
 */
export function matchesOwner(
  worker: PausedWorkerReview,
  owners: readonly OwnerState[],
  suspicionThreshold: number,
): boolean {
  if (owners.length === 0) return true;
  return owners.some((state) => {
    switch (state) {
      case 'trusted':
        return worker.owner_trusted;
      case 'flagged':
        return worker.owner_flagged;
      case 'over':
        return worker.owner_suspicion >= suspicionThreshold;
    }
  });
}

interface BulkResult {
  id: string;
  name: string;
  ok: boolean;
  /** The horde's own message for a refusal, when it sent one. */
  message: string | null;
}

/** What a finished bulk run did, kept on screen until dismissed. */
export interface BulkSummary {
  action: WorkerAction;
  succeeded: number;
  failed: BulkResult[];
  /** Workers not reached because the run was stopped. */
  skipped: number;
}

/**
 * Workers a moderator paused, filtered and sorted by the horde, with each
 * worker's suspicion history read on opening it, and bulk unpause and
 * maintenance over the chosen ones.
 *
 * The filters are sent only once the horde has shown it serves them, by
 * stating `paused_workers_total`; an older horde gets the plain list.
 */
@Component({
  selector: 'app-review-paused-workers',
  imports: [
    TranslocoPipe,
    RouterLink,
    DatePipe,
    DecimalPipe,
    IconComponent,
    AdminDialogComponent,
    SuspicionHistoryComponent,
    ReviewGridDirective,
  ],
  templateUrl: './review-paused-workers.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewPausedWorkersComponent {
  private readonly moderation = inject(AdminModerationService);
  private readonly workers = inject(AdminWorkerService);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  public readonly counts = inject(ModerationCountsService);

  /** The Prompts tab filtered to one worker. */
  public promptsQuery(workerId: string): Params {
    return promptsParams({ ...DEFAULT_PROMPTS, worker_id: workerId });
  }
  public readonly hordeTime = parseHordeTime;

  public readonly kinds = WORKER_KINDS;
  public readonly causes = WORKER_SUSPICION_CAUSES;
  public readonly ownerStates = OWNER_STATES;
  public readonly sorts = PAUSED_SORT_CHOICES;

  public readonly filters = signal<PausedFilters>(DEFAULT_PAUSED_FILTERS);
  private readonly reloads = signal(0);

  public readonly overview = signal<ModerationOverview | null>(null);
  public readonly loading = signal(true);
  public readonly loadFailed = signal(false);

  /** Whether the horde serves the filters, as its stated total shows. */
  public readonly filtersSupported = computed(
    () => this.overview()?.paused_workers_total !== undefined,
  );

  /** The workers the horde returned, before the owner filter. */
  public readonly loaded = computed(
    () => this.overview()?.paused_workers ?? [],
  );

  /** The workers shown: those returned, narrowed by the owner states. */
  public readonly paused = computed(() => {
    const owners = this.filters().owners;
    const threshold = this.overview()?.suspicion_threshold ?? 0;
    return this.loaded().filter((worker) =>
      matchesOwner(worker, owners, threshold),
    );
  });

  /** The report count at which a worker counts as suspicious. */
  public readonly workerThreshold = computed(
    () => this.overview()?.worker_suspicion_threshold ?? null,
  );

  /** How many match the horde's filters, however many it returned. */
  public readonly total = computed(
    () => this.overview()?.paused_workers_total ?? null,
  );

  public readonly anyFilter = computed(() => {
    const filters = this.filters();
    return (
      filters.kinds.length > 0 ||
      filters.causes.length > 0 ||
      filters.online !== null ||
      filters.owners.length > 0
    );
  });

  private readonly selectedId = signal<string | null>(null);
  /** The open worker; the first one until the moderator opens another. */
  public readonly selected = computed<PausedWorkerReview | null>(() => {
    const paused = this.paused();
    const id = this.selectedId();
    return paused.find((worker) => worker.id === id) ?? paused.at(0) ?? null;
  });
  public readonly detailShown = signal(false);

  public readonly pendingAction = signal<WorkerAction | null>(null);
  public readonly acting = signal(false);
  public readonly maintenanceMessage = signal('');

  /** Chosen for a bulk action, by worker id. */
  public readonly checked = signal<ReadonlySet<string>>(new Set());
  /** The chosen workers still shown; a filter can hide some of them. */
  public readonly checkedShown = computed(() =>
    this.paused().filter((worker) => this.checked().has(worker.id)),
  );
  public readonly allChecked = computed(() => {
    const shown = this.paused();
    return (
      shown.length > 0 && shown.every((worker) => this.checked().has(worker.id))
    );
  });
  public readonly someChecked = computed(
    () => this.checkedShown().length > 0 && !this.allChecked(),
  );

  public readonly bulkAction = signal<WorkerAction | null>(null);
  public readonly bulkRunning = signal(false);
  public readonly bulkProgress = signal({ done: 0, total: 0 });
  public readonly bulkSummary = signal<BulkSummary | null>(null);
  /** Set by Stop; the run ends before the next worker. */
  public readonly bulkStopping = signal(false);

  private readonly detailHeading =
    viewChild<ElementRef<HTMLElement>>('detailHeading');
  private readonly detailPane =
    viewChild<ElementRef<HTMLElement>>('detailPane');

  constructor() {
    const request = computed(() => ({
      query: this.filtersSupported()
        ? pausedQueryOf(this.filters())
        : { limit: PAUSED_LIMIT },
      reload: this.reloads(),
    }));
    toObservable(request)
      .pipe(
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        tap(() => {
          this.loading.set(true);
          this.loadFailed.set(false);
        }),
        switchMap(({ query }) =>
          this.moderation.getOverview(query).pipe(
            catchError((error: unknown) => {
              this.loading.set(false);
              this.loadFailed.set(true);
              this.toast.error(
                refusalKey(error, 'admin.review.paused.load_error'),
                { transloco: true, rawError: error },
              );
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((overview) => {
        this.overview.set(overview);
        this.loading.set(false);
      });
  }

  public kindKey(kind: WorkerType): string {
    return `admin.review.paused.kind.${kind}`;
  }

  public causeKey(key: string): string {
    return `admin.review.paused.cause.${key}`;
  }

  public ownerKey(state: OwnerState): string {
    return `admin.review.paused.owner_state.${state}`;
  }

  public sortKey(sort: PausedWorkerSort | 'default'): string {
    return `admin.review.paused.sort.${sort}`;
  }

  public toggleKind(kind: WorkerType): void {
    this.filters.update((filters) => ({
      ...filters,
      kinds: toggled(filters.kinds, kind, WORKER_KINDS),
    }));
  }

  public toggleCause(id: number): void {
    this.filters.update((filters) => ({
      ...filters,
      causes: toggled(
        filters.causes,
        id,
        WORKER_SUSPICION_CAUSES.map((cause) => cause.id),
      ),
    }));
  }

  public toggleOwner(state: OwnerState): void {
    this.filters.update((filters) => ({
      ...filters,
      owners: toggled(filters.owners, state, OWNER_STATES),
    }));
  }

  public setOnline(online: boolean | null): void {
    this.filters.update((filters) => ({ ...filters, online }));
  }

  public setSort(value: string): void {
    const sort = PAUSED_SORTS.find((item) => item === value) ?? null;
    this.filters.update((filters) => ({ ...filters, sort }));
  }

  public clearFilters(): void {
    this.filters.update((filters) => ({
      ...DEFAULT_PAUSED_FILTERS,
      sort: filters.sort,
    }));
  }

  /** The row the list's single tab stop sits on: the open worker, else the first. */
  public tabStop(): string | undefined {
    return this.selected()?.id ?? this.paused().at(0)?.id;
  }

  public open(id: string): void {
    this.select(id);
    this.detailShown.set(true);
    if (!isSplitView(this.document)) {
      setTimeout(() => this.detailHeading()?.nativeElement.focus());
    }
  }

  /** The pane keeps its scroll position across items, so each one opens at its top. */
  private select(id: string | null): void {
    this.selectedId.set(id);
    const pane = this.detailPane()?.nativeElement;
    if (pane) pane.scrollTop = 0;
  }

  public back(): void {
    const id = this.selected()?.id;
    this.detailShown.set(false);
    setTimeout(() =>
      this.document
        .querySelector<HTMLElement>(`[data-paused-worker="${id}"]`)
        ?.focus(),
    );
  }

  public toggleChecked(id: string): void {
    this.checked.update((checked) => {
      const next = new Set(checked);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  public toggleAll(): void {
    const shown = this.paused().map((worker) => worker.id);
    const all = this.allChecked();
    this.checked.update((checked) => {
      const next = new Set(checked);
      for (const id of shown) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  public ask(action: WorkerAction): void {
    this.maintenanceMessage.set('');
    this.pendingAction.set(action);
  }

  public cancel(): void {
    if (!this.acting()) this.pendingAction.set(null);
  }

  public confirm(): void {
    const worker = this.selected();
    const action = this.pendingAction();
    if (!worker || !action || this.acting()) return;
    // Unpausing takes the worker off this list; a maintenance change leaves
    // it where it is.
    const next =
      action === 'unpause'
        ? nextAfter(
            this.paused().map((each) => each.id),
            worker.id,
          )
        : worker.id;

    this.acting.set(true);
    this.request(worker.id, action)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.acting.set(false);
          this.pendingAction.set(null);
          if (!result) return;
          this.toast.success(`admin.review.paused.done.${action}`, {
            transloco: true,
            messageParams: { name: worker.name },
          });
          this.select(next);
          this.refresh();
        },
        error: (error: unknown) => {
          this.acting.set(false);
          this.pendingAction.set(null);
          this.toast.error('admin.review.paused.error', {
            transloco: true,
            rawError: error,
          });
        },
      });
  }

  public askBulk(action: WorkerAction): void {
    if (this.checkedShown().length === 0 || this.bulkRunning()) return;
    this.maintenanceMessage.set('');
    this.bulkAction.set(action);
  }

  /** Close the dialog, or while a run is going, stop it after the current worker. */
  public cancelBulk(): void {
    if (this.bulkRunning()) {
      this.bulkStopping.set(true);
      return;
    }
    this.bulkAction.set(null);
  }

  /**
   * Act on each chosen worker in turn, spaced by `BULK_PACE_MS`. A refusal
   * does not stop the run; stopping it leaves the rest untouched. The
   * summary counts what was done and lists each worker that was refused.
   */
  public confirmBulk(): void {
    const action = this.bulkAction();
    if (!action || this.bulkRunning()) return;
    const targets = this.checkedShown().map((worker) => ({
      id: worker.id,
      name: worker.name,
    }));
    if (targets.length === 0) return;
    this.bulkRunning.set(true);
    this.bulkStopping.set(false);
    this.bulkSummary.set(null);
    this.bulkProgress.set({ done: 0, total: targets.length });

    from(targets)
      .pipe(
        concatMap((target, index) =>
          defer(() =>
            this.bulkStopping() ? EMPTY : timer(index === 0 ? 0 : BULK_PACE_MS),
          ).pipe(
            switchMap(() =>
              this.bulkStopping()
                ? EMPTY
                : this.request(target.id, action).pipe(
                    map(
                      (answer): BulkResult => ({
                        ...target,
                        ok: answer !== null,
                        message: null,
                      }),
                    ),
                    catchError((error: unknown) =>
                      of<BulkResult>({
                        ...target,
                        ok: false,
                        message: extractApiErrorField(error, 'message') ?? null,
                      }),
                    ),
                  ),
            ),
          ),
        ),
        tap(() =>
          this.bulkProgress.update((progress) => ({
            ...progress,
            done: progress.done + 1,
          })),
        ),
        toArray(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => this.finishBulk(action, targets.length, results));
  }

  public dismissSummary(): void {
    this.bulkSummary.set(null);
  }

  private finishBulk(
    action: WorkerAction,
    total: number,
    results: BulkResult[],
  ): void {
    const succeeded = results.filter((result) => result.ok);
    this.bulkRunning.set(false);
    this.bulkStopping.set(false);
    this.bulkAction.set(null);
    this.bulkSummary.set({
      action,
      succeeded: succeeded.length,
      failed: results.filter((result) => !result.ok),
      skipped: total - results.length,
    });
    const done = new Set(succeeded.map((result) => result.id));
    this.checked.update(
      (checked) => new Set([...checked].filter((id) => !done.has(id))),
    );
    if (succeeded.length > 0) this.refresh();
  }

  private request(id: string, action: WorkerAction): Observable<unknown> {
    const message = this.maintenanceMessage().trim();
    return action === 'unpause'
      ? this.workers.setPaused(id, false)
      : this.workers.setMaintenance(
          id,
          action === 'maintenance_on',
          message || undefined,
        );
  }

  /** Read the list again, and the shared counts with it. */
  private refresh(): void {
    this.moderation.invalidate();
    this.reloads.update((count) => count + 1);
    this.counts.refreshOverview(true);
  }
}

/** A list with `value` added or taken out, kept in the order of `order`. */
function toggled<T>(list: readonly T[], value: T, order: readonly T[]): T[] {
  const next = list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
  return order.filter((item) => next.includes(item));
}
