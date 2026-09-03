import {
  DestroyRef,
  Injectable,
  NgZone,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { HordeApiCacheService } from './horde-api-cache.service';
import { GenerationQueueService } from './generation-queue.service';
import {
  ALCHEMY_POLL_INTERVAL_MS,
  AlchemyQueueService,
} from './alchemy-queue.service';

/**
 * How often the account record is re-read. One read answers for both studios,
 * so it runs on the slower of the two queue cadences rather than on a period of
 * its own.
 */
const READ_INTERVAL_MS = ALCHEMY_POLL_INTERVAL_MS;

/**
 * How long to wait after a read the horde would not answer. `AuthService`
 * reports every failure as an absent user, so this covers the rate limit along
 * with everything else that can go wrong with the call.
 */
const BACKOFF_MS = 15_000;

/**
 * Reconciles what the horde says is running under the reader's key with what
 * the two studios are tracking locally.
 *
 * A generation started on another device, or one whose submit landed after a
 * reload took the page away, runs under the same key but leaves no local
 * record. The account record names them, so each studio's queue is handed the
 * ids it does not hold and takes them over.
 *
 * Only for a signed-in reader: the anonymous key's requests belong to everyone
 * using it, and adopting those would fill one person's results with another's
 * pictures.
 */
@Injectable({ providedIn: 'root' })
export class ActiveGenerationsService {
  private readonly auth = inject(AuthService);
  private readonly cache = inject(HordeApiCacheService);
  private readonly imageQueue = inject(GenerationQueueService);
  private readonly alchemyQueue = inject(AlchemyQueueService);
  private readonly ngZone = inject(NgZone);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private timer: ReturnType<typeof setInterval> | null = null;
  /** Guards against a second read starting while one is still outstanding. */
  private reading = false;
  private backoffUntil = 0;

  /**
   * Read the record once and keep reading it while anything is running. Called
   * by each studio as it opens; the second call is a no-op, so both studios can
   * ask without either of them owning the timer.
   */
  public start(): void {
    if (!this.isBrowser || this.timer !== null) {
      return;
    }
    this.ngZone.runOutsideAngular(() => {
      this.timer = setInterval(() => void this.tick(), READ_INTERVAL_MS);
      const onVisibility = (): void => {
        if (this.document.visibilityState === 'visible') {
          void this.tick();
        }
      };
      this.document.addEventListener('visibilitychange', onVisibility);
      this.destroyRef.onDestroy(() =>
        this.document.removeEventListener('visibilitychange', onVisibility),
      );
    });
    void this.reconcile();
  }

  private async tick(): Promise<void> {
    // A tab nobody is looking at cannot act on what the record says, and a
    // phone that backgrounded the page may hold the timer for minutes before
    // firing it. Reads wait for the tab to come back, where one runs at once.
    if (this.document.visibilityState === 'hidden') {
      return;
    }
    if (!this.hasWorkOutstanding()) {
      return;
    }
    await this.reconcile();
  }

  /**
   * Whether the record is worth re-reading. An account with nothing running and
   * no local job in flight cannot gain one without this browser knowing, so an
   * idle reader costs no requests at all.
   */
  private hasWorkOutstanding(): boolean {
    const active = this.auth.currentUser()?.active_generations;
    if (
      (active?.image?.length ?? 0) > 0 ||
      (active?.alchemy?.length ?? 0) > 0
    ) {
      return true;
    }
    return (
      this.imageQueue.pendingJobs().length > 0 ||
      this.alchemyQueue.pendingJobs().length > 0
    );
  }

  private async reconcile(): Promise<void> {
    if (this.reading || !this.auth.isLoggedIn()) {
      return;
    }
    if (this.backoffUntil > Date.now()) {
      return;
    }
    this.reading = true;
    try {
      // The account read is served from a cache that outlives the cadence by
      // an order of magnitude, so a job started elsewhere would sit unseen
      // until that copy aged out. Dropping the cached user first makes every
      // tick a real read, and hands the fresh record to every other reader.
      this.cache.invalidate({ category: 'user' });
      const user = await firstValueFrom(this.auth.refreshUser());
      if (!user) {
        this.backoffUntil = Date.now() + BACKOFF_MS;
        return;
      }
      const active = user.active_generations;
      await this.imageQueue.adoptActive(active?.image ?? []);
      await this.alchemyQueue.adoptActive(active?.alchemy ?? []);
    } catch {
      // Nothing here may leave a rejection behind: the tick that called this
      // runs on a timer with nobody waiting on its result.
      this.backoffUntil = Date.now() + BACKOFF_MS;
    } finally {
      this.reading = false;
    }
  }
}
