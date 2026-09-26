import {
  DestroyRef,
  Injectable,
  NgZone,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AuthService, UserReadError } from './auth.service';
import { HordeApiCacheService } from './horde-api-cache.service';
import { GenerationQueueService } from './generation-queue.service';
import {
  ALCHEMY_POLL_INTERVAL_MS,
  AlchemyQueueService,
} from './alchemy-queue.service';

/**
 * How often the account record is re-read while work is outstanding. One read
 * answers for both studios, so it runs on the slower of the two queue cadences
 * rather than on a period of its own.
 */
const READ_INTERVAL_MS = ALCHEMY_POLL_INTERVAL_MS;

/**
 * How often the record is re-read with nothing outstanding. A generation
 * started on another device leaves no trace in this browser, so an idle reader
 * still looks now and then, at a cost of one request a minute.
 */
const IDLE_READ_INTERVAL_MS = 60_000;

/** How long to wait after a read that failed for want of an answer. */
const BACKOFF_MS = 15_000;

/**
 * How long to wait after the horde rate-limited the read. Its limit counts
 * every request under the key, so reading again soon would spend the budget
 * the studios need for their own polling.
 */
const RATE_LIMITED_BACKOFF_MS = 60_000;

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
  private readonly onVisibility = (): void => {
    // Whatever changed while the tab was away, including a generation started
    // on another device, is only visible in the record, so the return reads it
    // whether or not this browser knows of work outstanding.
    if (this.document.visibilityState === 'visible') {
      void this.reconcile();
    }
  };
  /** Guards against a second read starting while one is still outstanding. */
  private reading = false;
  private backoffUntil = 0;
  private lastReadAt = 0;
  /** Studios open right now; the timer runs while there is at least one. */
  private holders = 0;

  constructor() {
    this.destroyRef.onDestroy(() => this.stop());
  }

  /**
   * Read the record once, then every {@link READ_INTERVAL_MS} while anything is
   * running and every {@link IDLE_READ_INTERVAL_MS} otherwise. Called by each
   * studio as it opens; the returned release is called as it closes, and the
   * reads stop with the last studio, so a reader elsewhere on the site costs no
   * requests. Both studios can ask without either of them owning the timer.
   */
  public start(): () => void {
    if (!this.isBrowser) {
      return () => undefined;
    }
    this.holders += 1;
    let released = false;
    const release = (): void => {
      if (released) {
        return;
      }
      released = true;
      this.holders -= 1;
      if (this.holders === 0) {
        this.stop();
      }
    };
    if (this.timer !== null) {
      return release;
    }
    this.ngZone.runOutsideAngular(() => {
      this.timer = setInterval(() => void this.tick(), READ_INTERVAL_MS);
      this.document.addEventListener('visibilitychange', this.onVisibility);
    });
    void this.reconcile();
    return release;
  }

  private stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private async tick(): Promise<void> {
    // A tab nobody is looking at cannot act on what the record says, and a
    // phone that backgrounded the page may hold the timer for minutes before
    // firing it. Reads wait for the tab to come back, where one runs at once.
    if (this.document.visibilityState === 'hidden') {
      return;
    }
    if (
      !this.hasWorkOutstanding() &&
      Date.now() - this.lastReadAt < IDLE_READ_INTERVAL_MS
    ) {
      return;
    }
    await this.reconcile();
  }

  /**
   * Whether the record is worth re-reading at the faster cadence: the account
   * reports something running, or a local job is still in flight.
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
    this.lastReadAt = Date.now();
    try {
      // The account read is served from a cache that outlives the cadence by
      // an order of magnitude, so a job started elsewhere would sit unseen
      // until that copy aged out. Dropping the cached user first makes every
      // tick a real read, and hands the fresh record to every other reader.
      this.cache.invalidate({ category: 'user' });
      const read = await firstValueFrom(this.auth.readUser());
      if ('error' in read) {
        this.onReadFailed(read.error);
        return;
      }
      const active = read.user.active_generations;
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

  /**
   * A failed read is never shown to the reader: the studios keep polling their
   * own jobs, and the record only adds jobs this browser did not start.
   */
  private onReadFailed(error: UserReadError): void {
    switch (error) {
      case 'rate_limited':
        this.backoffUntil = Date.now() + RATE_LIMITED_BACKOFF_MS;
        return;
      case 'unauthorized':
        // The key no longer names an account, so no later read can succeed. A
        // studio opening after a new sign-in starts the loop again.
        this.stop();
        return;
      case 'network':
        this.backoffUntil = Date.now() + BACKOFF_MS;
        return;
    }
  }
}
