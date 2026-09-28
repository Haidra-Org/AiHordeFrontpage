import {
  DestroyRef,
  Injectable,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Subscription } from 'rxjs';
import { AdminModerationService } from './admin-moderation.service';
import { AuthService } from './auth.service';
import { listCount } from '../helper/list-count';
import { ListCount, ModerationOverview } from '../types/moderation';

/**
 * The overview is read at the horde's default page size, which is what its
 * lists are capped at.
 */
export const OVERVIEW_LIMIT = 100;

/**
 * Every moderator endpoint shares a 30-a-minute budget with the pages that
 * review from it, so the background count is read rarely.
 */
export const MODERATION_POLL_MS = 300_000;

/** How old the counts may be before a page that shows them asks again. */
const FRESH_ENOUGH_MS = 30_000;

/**
 * The one source of the moderator queue counts: the dashboard, the admin tabs
 * and the account menu all read them here, so the horde is asked once.
 *
 * A count is null while its endpoint has not answered, and anything drawn
 * from a count shows only once its endpoint has answered. Which endpoints a
 * horde lacks is settled by `AdminModerationService`, and nothing here asks an
 * endpoint found absent, the overview included, so a horde without them is
 * asked at most once per endpoint in a page load.
 * The prompt log is not counted: it is probed once so its tab and menu entry
 * can show.
 *
 * Polling runs only in the browser, only for a moderator, and skips its turn
 * while the page is hidden.
 */
@Injectable({ providedIn: 'root' })
export class ModerationCountsService {
  private readonly moderation = inject(AdminModerationService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);

  private readonly _overview = signal<ModerationOverview | null>(null);
  private readonly _overviewLoading = signal(false);
  private readonly _promptsLoading = signal(false);

  private overviewRequest: Subscription | null = null;
  private promptsProbe: Subscription | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastRefresh = 0;
  private readonly onVisibilityChange = (): void => {
    if (
      !this.isHidden() &&
      Date.now() - this.lastRefresh >= MODERATION_POLL_MS
    ) {
      this.refresh();
    }
  };

  public readonly isModerator = computed(
    () => this.auth.currentUser()?.moderator === true,
  );

  /** Whether the overview (promotions and paused workers) can be shown. */
  public readonly overviewAvailable = computed(
    () =>
      this.isModerator() &&
      this.moderation.overviewAvailability() === 'available',
  );

  /** Whether the prompt log can be browsed. */
  public readonly promptsAvailable = computed(
    () =>
      this.isModerator() &&
      this.moderation.promptEventsAvailability() === 'available',
  );

  /** Whether any review queue can be shown. */
  public readonly anyAvailable = computed(
    () => this.overviewAvailable() || this.promptsAvailable(),
  );

  /**
   * Whether this horde has none of the review queues: every one of their
   * endpoints is known to be absent.
   */
  public readonly noneAvailable = computed(
    () =>
      this.isModerator() &&
      this.moderation.overviewAvailability() === 'absent' &&
      this.moderation.promptEventsAvailability() === 'absent',
  );

  /** True while a first answer is still on its way. */
  public readonly loading = computed(
    () => this._overviewLoading() || this._promptsLoading(),
  );

  /** The last overview the horde returned, while it can be shown. */
  public readonly overview = computed(() =>
    this.overviewAvailable() ? this._overview() : null,
  );

  public readonly eligible = computed(() =>
    countOf(this.overview()?.promotion_eligible_users),
  );

  public readonly blocked = computed(() =>
    countOf(this.overview()?.promotion_blocked_users),
  );

  /** Exact when the horde states its total, else read off the capped list. */
  public readonly paused = computed(() => {
    const overview = this.overview();
    if (overview?.paused_workers_total !== undefined) {
      return { count: overview.paused_workers_total, atLeast: false };
    }
    return countOf(overview?.paused_workers);
  });

  /**
   * Everything waiting on a moderator. When any part is a floor, so is the
   * sum. Null when no queue can be shown.
   */
  public readonly total = computed<ListCount | null>(() => {
    const parts = [this.eligible(), this.blocked(), this.paused()].filter(
      (part): part is ListCount => part !== null,
    );
    return parts.length === 0 ? null : sumCounts(parts);
  });

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    effect(() => {
      const moderator = this.isModerator();
      untracked(() => (moderator ? this.startPolling() : this.stopPolling()));
    });

    inject(DestroyRef).onDestroy(() => this.stopPolling());
  }

  /** Ask for every count now, and probe the prompt log if it is not known yet. */
  public refresh(): void {
    this.refreshOverview();
    this.probePrompts();
  }

  /** Ask again unless the counts were read moments ago. */
  public refreshIfStale(): void {
    if (Date.now() - this.lastRefresh >= FRESH_ENOUGH_MS) {
      this.refresh();
    }
  }

  /**
   * Read the overview again. A decision made elsewhere passes `fresh` so the
   * cached answer from before it is not reused.
   */
  public refreshOverview(fresh = false): void {
    if (!this.isModerator()) return;
    if (this.moderation.overviewAvailability() === 'absent') return;
    if (fresh) this.moderation.invalidate();
    this.lastRefresh = Date.now();
    this.overviewRequest?.unsubscribe();
    this._overviewLoading.set(true);
    this.overviewRequest = this.moderation.getOverview().subscribe({
      next: (overview) => {
        this._overview.set(overview);
        this._overviewLoading.set(false);
      },
      // The count keeps its last value; the page that shows it has no
      // action to offer for a failed background read.
      error: () => this._overviewLoading.set(false),
    });
  }

  /** Probe the prompt log once, so its tab and menu entry can show. */
  private probePrompts(): void {
    if (!this.isModerator()) return;
    if (this.moderation.promptEventsAvailability() !== 'unknown') return;
    if (this.promptsProbe && !this.promptsProbe.closed) return;
    this._promptsLoading.set(true);
    this.promptsProbe = this.moderation
      .probe('promptEvents')
      .subscribe({ complete: () => this._promptsLoading.set(false) });
  }

  private startPolling(): void {
    if (this.pollTimer !== null) return;
    this.refresh();
    this.pollTimer = setInterval(() => {
      if (!this.isHidden()) this.refresh();
    }, MODERATION_POLL_MS);
    this.document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.document.removeEventListener(
      'visibilitychange',
      this.onVisibilityChange,
    );
    this.overviewRequest?.unsubscribe();
    this.promptsProbe?.unsubscribe();
    this._overviewLoading.set(false);
    this._promptsLoading.set(false);
    this._overview.set(null);
    this.lastRefresh = 0;
  }

  private isHidden(): boolean {
    return this.document.visibilityState === 'hidden';
  }
}

function countOf(list: readonly unknown[] | undefined): ListCount | null {
  return list ? listCount(list.length, OVERVIEW_LIMIT) : null;
}

/** A sum of counts, which is a floor when any part is. */
export function sumCounts(parts: readonly ListCount[]): ListCount {
  return {
    count: parts.reduce((sum, part) => sum + part.count, 0),
    atLeast: parts.some((part) => part.atLeast),
  };
}
