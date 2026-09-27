import {
  DestroyRef,
  Injectable,
  NgZone,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AiHordeService } from './ai-horde.service';
import { AuthService } from './auth.service';
import { GenerationDbService } from './generation-db.service';
import {
  GENERATION_NOT_FOUND,
  GenerationOutput,
  SubmittedImageRequestResult,
  ImageExtraSourceImage,
  ImageGenerationRequest,
  hordeRejectionKey,
} from '../types/generation';
import {
  AdoptedRequestRecovery,
  EnqueueSourceImage,
  LocalGenerationJob,
  LocalGenerationJobStatus,
  MAX_EXTRA_SOURCE_IMAGES,
  StoredJobImage,
  SubmitBlockReason,
  extraSourceImageId,
  isJobHidden,
} from '../types/generation-job';
import { base64ToBlob, blobToBase64 } from '../helper/blob-base64';
import { randomUuid } from '../helper/random-uuid';
import { studioRequestFromSubmitted } from '../helper/submitted-request';
import { GenerationWaitInsightsService } from './generation-wait-insights.service';
import { SyncedJobDeletion, TabSyncService } from './tab-sync.service';

const ANONYMOUS_API_KEY = '0000000000';

/**
 * Where this browser keeps the moment it first saw the horde read a request
 * back (see {@link isJobHidden}). Local storage rather than the generation
 * database: the database has no store for a single value, and one would need
 * a schema version of its own. Local storage is shared by every tab, and its
 * change event carries the value to the others.
 */
const READ_BACK_SINCE_KEY = 'aihorde.generate.read-back-since';

const MAX_CONCURRENT = 5;
const SUBMIT_WINDOW_MS = 60_000;
const SUBMIT_WINDOW_LIMIT = 9;
const SUBMIT_BACKOFF_MS = 15_000;
const CHECK_BACKOFF_MS = 15_000;
/**
 * How long a job waits after the horde failed to answer its submit, doubling
 * with each further failure up to {@link SUBMIT_RETRY_MAX_MS}. Without a delay
 * of its own a job retries on every dispatch tick and spends the whole submit
 * window in a few seconds, which is what a horde that is briefly down would
 * cost every job at once.
 */
const SUBMIT_RETRY_BASE_MS = 5_000;
const SUBMIT_RETRY_MAX_MS = 60_000;
/**
 * How many refused submits a job gets before it is turned into an error the
 * reader can act on. With the backoff above, five attempts span more than a
 * minute of the horde declining to take the request, which is long enough that
 * it is no longer a blip and short enough that the page has not been left for
 * dead.
 */
const MAX_SUBMIT_ATTEMPTS = 5;
const POLL_MIN_INTERVAL_MS = 2_000;
const DISPATCH_TICK_MS = 1_000;
const POLL_TICK_MS = 2_000;

/**
 * How long a finished job keeps asking for pictures it could not fetch before
 * it is marked done with those pictures counted as lost. It must sit well
 * inside the time the horde keeps a finished request's results retrievable,
 * or the later attempts ask for results that are already gone.
 */
const FETCH_RETRY_WINDOW_MS = 5 * 60_000;
/**
 * Spacing between attempts at a finished job's missing pictures. Each attempt
 * reads the full status endpoint, which the horde rate-limits far harder than
 * the check endpoint the ordinary poll cadence is sized for.
 */
const FETCH_RETRY_INTERVAL_MS = 15_000;
/**
 * How long a deleted job's id keeps refusing writes. A poll, submit or download
 * already in flight when the job was deleted finishes within this, and the
 * account's list of active generations stops naming a cancelled one well
 * within it too.
 */
const DELETED_GUARD_MS = 60_000;

const DEFAULT_RESULT_MIME = 'image/webp';

const ACTIVE_STATUSES: ReadonlySet<LocalGenerationJobStatus> = new Set([
  'requested',
  'queued',
  'processing',
]);

const FINISHED_STATUSES: ReadonlySet<LocalGenerationJobStatus> = new Set([
  'done',
  'error',
  'cancelled',
]);

type DispatchOutcome = 'submitted' | 'error' | 'backoff' | 'transient';

/**
 * Client-side generation queue. Persists jobs and their image blobs to
 * IndexedDB and runs two cooperative loops on the browser:
 *
 * - a dispatch loop that submits `waiting` jobs while respecting a concurrency
 *   cap and a sliding-window submit rate limit,
 * - a poll loop that advances in-flight jobs and downloads finished results.
 *
 * Every tab runs its own copy of this service over the one shared store. Each
 * local write is announced through {@link TabSyncService} and peers fold it
 * into their state without writing it again, so all tabs show the same jobs.
 * Submitting a job and collecting its results run under a cross-tab lock, so
 * two tabs following the same job never both do either.
 *
 * The service is browser-only. During SSR the constructor starts nothing and
 * the persistence layer no-ops, so injecting it on the server is inert.
 */
@Injectable({ providedIn: 'root' })
export class GenerationQueueService {
  private readonly db = inject(GenerationDbService);
  private readonly aiHorde = inject(AiHordeService);
  private readonly auth = inject(AuthService);
  private readonly waitInsights = inject(GenerationWaitInsightsService);
  private readonly tabSync = inject(TabSyncService);
  private readonly ngZone = inject(NgZone);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _jobs = signal<LocalGenerationJob[]>([]);
  private readonly _clock = signal(0);
  private readonly _lastAccepted = signal<{
    localId: string;
    at: number;
  } | null>(null);

  private readonly _readBackSince = signal<number | null>(null);

  /**
   * When this browser first saw the horde read a request back, or null. Jobs
   * taken from the account before then may be held back; see
   * {@link isJobHidden}.
   */
  public readonly readBackSince = this._readBackSince.asReadonly();
  /**
   * Every job the reader's lists show, newest first. Jobs {@link isJobHidden}
   * holds back are left out here and everywhere derived from it, while the
   * engine itself still polls, downloads and counts them.
   */
  public readonly jobs = computed(() => {
    const since = this._readBackSince();
    return this._jobs().filter((job) => !isJobHidden(job, since));
  });
  /** The jobs held back until the reader decides to keep or remove them. */
  public readonly hiddenJobs = computed(() => {
    const since = this._readBackSince();
    return this._jobs().filter((job) => isJobHidden(job, since));
  });
  public readonly pendingJobs = computed(() =>
    this.jobs().filter(
      (job) => job.status === 'waiting' || ACTIVE_STATUSES.has(job.status),
    ),
  );
  public readonly finishedJobs = computed(() =>
    this.jobs().filter((job) => FINISHED_STATUSES.has(job.status)),
  );
  /**
   * Wall clock, advanced by the dispatch loop while a job is waiting on a retry
   * so a countdown drawn against it stays live. It stands still the rest of the
   * time: nothing reads it then, and a signal ticking every second would redraw
   * the results grid for nothing.
   */
  public readonly clock = this._clock.asReadonly();
  /**
   * The most recent submit the horde accepted. A fresh object every time, so a
   * page watching it hears about each acceptance rather than only the first.
   */
  public readonly lastAccepted = this._lastAccepted.asReadonly();

  private submitTimestamps: number[] = [];
  private submitBackoffUntil = 0;
  private readonly checkBackoffUntil = new Map<string, number>();
  /**
   * Jobs deleted within {@link DELETED_GUARD_MS}, with when. Work already in
   * flight for such a job must not write it back into the store, and its horde
   * id must not be adopted again while the account still lists it.
   */
  private readonly recentlyDeleted = new Map<string, number>();
  /** Horde ids of deleted or orphaned generations, with when they were dropped. */
  private readonly droppedHordeIds = new Map<string, number>();
  /**
   * Horde ids whose submit has returned but whose local job does not carry the
   * id yet. The account record can list such an id before the patch lands, and
   * `adoptActive` would otherwise take it for a generation started elsewhere.
   */
  private readonly inFlightIds = new Set<string>();
  /** The tail of each job's queue of pending patches; see `patchJob`. */
  private readonly patchChains = new Map<string, Promise<void>>();

  private dispatchRunning = false;
  private pollRunning = false;
  private dispatchTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    if (this.isBrowser) {
      this._readBackSince.set(readStoredReadBackSince());
      this.listenForReadBackSince();
      // Listening starts before the stored jobs load, so nothing a peer writes
      // while the load is under way is missed.
      this.listenToPeers();
      this.initPromise = this.initialize();
    }
  }

  /** Resolves once persisted jobs are loaded and the loops are running. */
  public whenReady(): Promise<void> {
    return this.initPromise ?? Promise.resolve();
  }

  private async initialize(): Promise<void> {
    try {
      const jobs = await this.db.listJobs();
      this.mergeLoaded(jobs);
    } catch (error) {
      // A persistence failure must not wedge startup: the loops still run and
      // new work can be enqueued against empty in-memory state. The DB layer's
      // self-healing recovery should make this path rare.
      console.warn('Failed to load persisted generation jobs:', error);
    }
    this.startLoops();
    void this.probeReadBack();
  }

  /**
   * Ask the horde once per page load whether it reads requests back, when
   * that decides something: this browser has not seen it yet and holds jobs
   * taken from the account. The id is made up, so a horde with the endpoint
   * answers that no such request exists; one without it gives no answer the
   * page can read.
   */
  private async probeReadBack(): Promise<void> {
    if (
      this._readBackSince() !== null ||
      !this._jobs().some((job) => job.adopted)
    ) {
      return;
    }
    try {
      const result = await firstValueFrom(
        this.aiHorde.getSubmittedImageRequestResult(
          this.apiKey(),
          randomUuid(),
        ),
      );
      this.noteReadBack(result);
    } catch (error) {
      console.warn('Could not ask whether requests can be read back:', error);
    }
  }

  /**
   * Record, once, the first answer that came from the read-back endpoint
   * itself: a request, or a refusal carrying the horde's return code. A missing
   * route, and a browser that could not reach the endpoint at all (which is how
   * a horde without it looks from a page, since its preflight fails), leave
   * the moment unset.
   */
  private noteReadBack(result: SubmittedImageRequestResult): void {
    if (!answeredByReadBack(result) || this._readBackSince() !== null) {
      return;
    }
    const now = this.now();
    this._readBackSince.set(now);
    try {
      localStorage.setItem(READ_BACK_SINCE_KEY, String(now));
    } catch {
      // Storage can be unavailable; the moment then holds for this page only.
    }
  }

  private listenForReadBackSince(): void {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === READ_BACK_SINCE_KEY && this._readBackSince() === null) {
        this.ngZone.run(() =>
          this._readBackSince.set(readStoredReadBackSince()),
        );
      }
    };
    window.addEventListener('storage', onStorage);
    this.destroyRef.onDestroy(() =>
      window.removeEventListener('storage', onStorage),
    );
  }

  /**
   * Keep every held-back job: each is marked on its record, which reaches the
   * other tabs like any other change.
   */
  public async keepHiddenJobs(): Promise<void> {
    await Promise.all(
      this.hiddenJobs().map((job) =>
        this.patchJob(job.localId, { keptByReader: true }),
      ),
    );
  }

  private startLoops(): void {
    this.ngZone.runOutsideAngular(() => {
      this.dispatchTimer = setInterval(
        () => void this.dispatchTick(),
        DISPATCH_TICK_MS,
      );
      this.pollTimer = setInterval(() => void this.pollTick(), POLL_TICK_MS);
      const onVisibility = (): void => {
        if (this.document.visibilityState === 'visible') {
          void this.pollTick();
        }
      };
      this.document.addEventListener('visibilitychange', onVisibility);
      this.destroyRef.onDestroy(() =>
        this.document.removeEventListener('visibilitychange', onVisibility),
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Persist a job as `waiting` along with any source/mask/remix-extra blobs. The
   * request is stored without its base64 `source_image` / `source_mask` /
   * `extra_source_images`; those are rehydrated from the stored blobs when the
   * job is submitted.
   */
  public async enqueue(
    request: ImageGenerationRequest,
    sourceImages?: EnqueueSourceImage[],
    opts?: { retryCount?: number; styleName?: string; styleKey?: string },
  ): Promise<string> {
    const localId = randomUuid();
    const now = this.now();
    const storedRequest: ImageGenerationRequest = { ...request };
    delete storedRequest.source_image;
    delete storedRequest.source_mask;
    delete storedRequest.extra_source_images;

    const job: LocalGenerationJob = {
      localId,
      status: 'waiting',
      createdAt: now,
      updatedAt: now,
      request: storedRequest,
      resultImageIds: [],
      ...(opts?.retryCount ? { retryCount: opts.retryCount } : {}),
      ...(opts?.styleName ? { styleName: opts.styleName } : {}),
      ...(opts?.styleKey ? { styleKey: opts.styleKey } : {}),
    };

    await this.db.putJob(job);
    let extraIndex = 0;
    for (const source of sourceImages ?? []) {
      const isExtra = source.kind === 'extra_source';
      if (isExtra && extraIndex >= MAX_EXTRA_SOURCE_IMAGES) {
        continue;
      }
      await this.db.putImage({
        localId,
        // Extras are slotted in the order they arrive unless the caller pinned
        // an index; the slot is what buildSubmitRequest walks to rebuild them.
        imageId: isExtra
          ? extraSourceImageId(source.index ?? extraIndex)
          : source.kind,
        kind: source.kind,
        blob: source.blob,
        mimeType: source.mimeType,
        ...(isExtra && source.strength !== undefined
          ? { strength: source.strength }
          : {}),
      });
      if (isExtra) {
        extraIndex++;
      }
    }
    this.addToState(job);
    this.tabSync.publish('generation-job.added', job);
    return localId;
  }

  /**
   * Take over image generations the account reports as running that this
   * browser holds no record of: one submitted from another device, or one whose
   * submit landed after a reload took the page away. The horde answers for them
   * under the same key, so an adopted job joins the poll loop as a `queued` job
   * with an id and is driven to done and downloaded like any other. Ids already
   * held are skipped, so this is safe to run on every read of the account
   * record. So are ids of jobs deleted here a moment ago: the account goes on
   * listing a generation for a while after it was cancelled, and a failed
   * cancel would otherwise bring the deleted job straight back.
   *
   * Each newly adopted job gets one attempt at reading its request back from
   * the horde, made here and nowhere else: a job already in the store is never
   * read back later, whatever it holds.
   */
  public async adoptActive(ids: readonly string[]): Promise<void> {
    this.pruneDeleted();
    const known = new Set(
      this._jobs()
        .map((job) => job.hordeId)
        .filter((hordeId): hordeId is string => hordeId !== undefined),
    );
    for (const hordeId of ids) {
      if (
        known.has(hordeId) ||
        this.droppedHordeIds.has(hordeId) ||
        this.inFlightIds.has(hordeId)
      ) {
        continue;
      }
      // A peer tab may have taken this id over while an earlier adoption here
      // was being written.
      if (this._jobs().some((job) => job.hordeId === hordeId)) {
        continue;
      }
      known.add(hordeId);
      const now = this.now();
      const draft: LocalGenerationJob = {
        localId: randomUuid(),
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        // The check and status endpoints answer by id alone, so the poll loop
        // needs nothing of the request the job was actually made with.
        request: { prompt: '' },
        adopted: true,
        hordeId,
        resultImageIds: [],
      };
      const apiKey = this.apiKey();
      const job: LocalGenerationJob = {
        ...draft,
        // Written with the row, so a reload during the attempt finds it spent
        // rather than owed.
        requestRecovery: this.mayRecoverRequest(draft, apiKey)
          ? 'pending'
          : 'failed',
      };
      await this.db.putJob(job);
      this.addToState(job);
      this.tabSync.publish('generation-job.added', job);
      if (job.requestRecovery === 'pending') {
        void this.recoverRequest(job.localId, hordeId, apiKey);
      }
    }
  }

  /**
   * Whether a job just adopted may have its request read back. The horde
   * answers only the key that submitted the request, and the anonymous key is
   * refused outright, so asking with it is a request certain to fail.
   */
  private mayRecoverRequest(job: LocalGenerationJob, apiKey: string): boolean {
    return (
      job.adopted === true &&
      job.hordeId !== undefined &&
      apiKey !== ANONYMOUS_API_KEY
    );
  }

  /**
   * Read an adopted job's request back and store it in place of the
   * placeholder. The outcome is stored whatever it is, a failure included, so
   * the attempt is made once: a horde without the endpoint, a refusal or a
   * network failure all leave the job as it was adopted.
   */
  private async recoverRequest(
    localId: string,
    hordeId: string,
    apiKey: string,
  ): Promise<void> {
    let patch: Partial<LocalGenerationJob> = { requestRecovery: 'failed' };
    try {
      const result = await firstValueFrom(
        this.aiHorde.getSubmittedImageRequestResult(apiKey, hordeId),
      );
      this.noteReadBack(result);
      if (result.kind === 'success') {
        const request = studioRequestFromSubmitted(result.request);
        const recovery: AdoptedRequestRecovery = request.prompt
          ? 'full'
          : 'settings';
        patch = { request, requestRecovery: recovery };
      } else if (answeredByReadBack(result)) {
        patch = { requestRecovery: 'refused' };
      }
    } catch (error) {
      console.warn('Could not read back an adopted request:', error);
    }
    await this.patchJob(localId, patch);
  }

  /**
   * Cancel a job. Waiting jobs are marked cancelled locally; in-flight jobs are
   * also cancelled on the horde. Terminal jobs are left untouched.
   */
  public async cancel(localId: string): Promise<void> {
    const job = this.findJob(localId);
    if (!job || FINISHED_STATUSES.has(job.status)) {
      return;
    }
    if (ACTIVE_STATUSES.has(job.status) && job.hordeId) {
      await firstValueFrom(this.aiHorde.cancelImageGeneration(job.hordeId));
    }
    await this.patchJob(localId, { status: 'cancelled' });
  }

  /**
   * Delete a job and its stored images. A job the horde is still working on is
   * cancelled there first, so it stops spending kudos and does not come back
   * through the account's list of active generations.
   */
  public async deleteJob(localId: string): Promise<void> {
    const job = this.findJob(localId);
    // Marked before anything is awaited, so a poll or submit that lands during
    // the cancel or the delete cannot write the row back.
    this.markDeleted(localId, job?.hordeId);
    if (job) {
      await this.cancelOnHorde(job);
    }
    await this.db.deleteJobCascade(localId);
    this.forgetLocally(localId);
    this.tabSync.publish('generation-job.deleted', {
      localId,
      ...(job?.hordeId ? { hordeId: job.hordeId } : {}),
    });
  }

  /**
   * Drop every tracked job and its stored images, cancelling on the horde any
   * that are still running. Reached only from the storage management surface;
   * nothing in the app calls this on its own.
   */
  public async clearHistory(): Promise<void> {
    const jobs = this._jobs();
    for (const job of jobs) {
      this.markDeleted(job.localId, job.hordeId);
    }
    await Promise.all(jobs.map((job) => this.cancelOnHorde(job)));
    await this.db.clearAll();
    this.checkBackoffUntil.clear();
    this.waitInsights.clearAll();
    this.setState([]);
    this.tabSync.publish('generation-job.cleared', { clearedAt: this.now() });
  }

  /**
   * Cancel a running job's horde generation on the way to deleting it. A
   * failure is only logged: the delete goes ahead, and the deleted-id guard
   * keeps the generation from being adopted back while the account lists it.
   */
  private async cancelOnHorde(job: LocalGenerationJob): Promise<void> {
    if (!ACTIVE_STATUSES.has(job.status) || !job.hordeId) {
      return;
    }
    try {
      await firstValueFrom(this.aiHorde.cancelImageGeneration(job.hordeId));
    } catch (error) {
      console.warn(
        'Could not cancel a deleted generation on the horde:',
        error,
      );
    }
  }

  public getJobImages(localId: string): Promise<StoredJobImage[]> {
    return this.db.getImagesForJob(localId);
  }

  /**
   * Re-enqueue a job's stored request and source images as a fresh waiting job.
   * The original job record is left in place as history.
   */
  public async retry(localId: string): Promise<string> {
    const job = this.findJob(localId);
    if (!job) {
      throw new Error(`Cannot retry unknown job ${localId}`);
    }
    if (job.adopted) {
      // An adopted job's source pictures were never stored here, and a request
      // read back from the horde carries its prompt from before any style the
      // horde applied, so there is no exact request to send again; the
      // surfaces that offer Retry withhold it for these.
      throw new Error(`Cannot retry adopted job ${localId}`);
    }
    const images = await this.db.getImagesForJob(localId);
    const sourceImages: EnqueueSourceImage[] = images
      .filter(
        (image): image is StoredJobImage & { kind: 'source' | 'mask' } =>
          image.kind === 'source' || image.kind === 'mask',
      )
      .map((image) => ({
        kind: image.kind,
        blob: image.blob,
        mimeType: image.mimeType,
      }));
    return this.enqueue(job.request, sourceImages, {
      retryCount: (job.retryCount ?? 0) + 1,
      // A retry is the same generation again, style provenance included.
      ...(job.styleName ? { styleName: job.styleName } : {}),
      ...(job.styleKey ? { styleKey: job.styleKey } : {}),
    });
  }

  /**
   * Estimate the kudos cost of a request via the async endpoint's `dry_run`
   * mode, which returns `{ kudos }` without generating anything. Returns the
   * estimated kudos on success, preserving a genuine `0`, or `null` when the
   * dry run fails (for example a 429 or a validation rejection). Callers must
   * treat `null` as "estimate unavailable", distinct from a real zero cost.
   *
   * Uses the status-surfacing `*Result` variant rather than the
   * `null`-collapsing `submitImageGeneration`, so a failed estimate is never
   * mistaken for a zero-kudos success.
   */
  public async estimateKudos(
    request: ImageGenerationRequest,
  ): Promise<number | null> {
    const apiKey = this.apiKey();
    const result = await firstValueFrom(
      this.aiHorde.submitImageGenerationResult(apiKey, {
        ...request,
        dry_run: true,
      }),
    );
    return result.kind === 'success' ? result.response.kudos : null;
  }

  /** Prune terminal history down to `keep`, reconciling in-memory state. */
  public async pruneFinished(keep?: number): Promise<void> {
    await this.db.pruneFinishedJobs(keep);
    const jobs = await this.db.listJobs();
    const kept = new Set(jobs.map((job) => job.localId));
    const pruned = this._jobs().filter((job) => !kept.has(job.localId));
    this.setState(jobs);
    for (const job of pruned) {
      this.tabSync.publish('generation-job.deleted', { localId: job.localId });
    }
  }

  // ---------------------------------------------------------------------------
  // Dispatch loop
  // ---------------------------------------------------------------------------

  private async dispatchTick(): Promise<void> {
    if (this.dispatchRunning) {
      return;
    }
    this.dispatchRunning = true;
    try {
      this.advanceClock();
      if (this.submitBackoffUntil > this.now()) {
        return;
      }
      let active = this.countActive();
      const waiting = this._jobs()
        .filter(
          (job) =>
            job.status === 'waiting' && (job.submitRetryAt ?? 0) <= this.now(),
        )
        .sort((a, b) => a.createdAt - b.createdAt);

      for (const job of waiting) {
        if (active >= MAX_CONCURRENT) {
          break;
        }
        if (
          this.submitBackoffUntil > this.now() ||
          !this.submitWindowAllows()
        ) {
          break;
        }
        const outcome =
          (await this.tabSync.exclusive(
            `generation-submit:${job.localId}`,
            () => this.submitIfStillWaiting(job),
          )) ?? 'transient';
        if (outcome === 'submitted') {
          active++;
        } else if (outcome === 'backoff') {
          break;
        }
      }
    } finally {
      this.dispatchRunning = false;
    }
  }

  /**
   * Submit a waiting job unless the store says otherwise. Every tab holds the
   * waiting jobs of every other tab, so the stored row, read under the submit
   * lock, is the only reliable word on whether a peer already sent it.
   */
  private async submitIfStillWaiting(
    job: LocalGenerationJob,
  ): Promise<DispatchOutcome> {
    const current = await this.freshRow(job.localId);
    if (current?.status !== 'waiting') {
      return 'transient';
    }
    return this.submitJob(current);
  }

  private async submitJob(job: LocalGenerationJob): Promise<DispatchOutcome> {
    const request = await this.buildSubmitRequest(job);
    this.recordSubmitAttempt();
    const result = await firstValueFrom(
      this.aiHorde.submitImageGenerationResult(this.apiKey(), request),
    );

    // The job may have been cancelled (or otherwise moved off 'waiting') while
    // the submit request was in flight. Re-read its current state and never
    // overwrite a non-'waiting' status, which would resurrect a cancelled job.
    const stillWaiting = this.findJob(job.localId)?.status === 'waiting';

    if (result.kind === 'success') {
      const hordeId = result.response.id;
      this.inFlightIds.add(hordeId);
      try {
        if (!stillWaiting) {
          await this.reconcileOrphanedSubmit(job.localId, hordeId);
          return 'transient';
        }
        await this.patchJob(job.localId, {
          status: 'requested',
          hordeId,
          kudos: result.response.kudos,
          // The same figure, kept where nothing later overwrites it, so the
          // finished job can be shown against what it was quoted.
          quotedKudos: result.response.kudos,
          errorMessage: undefined,
          errorKey: undefined,
          errorRc: undefined,
          submitBlocked: undefined,
          submitRetryAt: undefined,
        });
      } finally {
        this.inFlightIds.delete(hordeId);
      }
      this.ngZone.run(() =>
        this._lastAccepted.set({ localId: job.localId, at: this.now() }),
      );
      return 'submitted';
    }

    const { status, message, rc } = result.error;
    const attempts = (this.findJob(job.localId)?.submitAttempts ?? 0) + 1;
    if (status === 429) {
      // A 429 is a global submit-rate signal, so back off regardless of whether
      // this particular job is still waiting.
      this.submitBackoffUntil = this.now() + SUBMIT_BACKOFF_MS;
      if (stillWaiting) {
        await this.recordSubmitFailure(
          job.localId,
          'rate_limited',
          attempts,
          this.submitBackoffUntil,
        );
      }
      return 'backoff';
    }
    if (status >= 400 && status < 500) {
      if (!stillWaiting) {
        return 'transient';
      }
      await this.patchJob(job.localId, {
        status: 'error',
        errorMessage: message,
        // The studio's own sentence where it has one for this code; the horde's
        // is kept either way and is what shows when it has none.
        errorKey: hordeRejectionKey(rc),
        errorRc: rc,
        submitBlocked: undefined,
        submitRetryAt: undefined,
      });
      return 'error';
    }
    // 5xx or no answer at all: the horde is not refusing the request, it is not
    // taking it. The job stays waiting and says so until the bound runs out.
    if (!stillWaiting) {
      return 'transient';
    }
    await this.recordSubmitFailure(
      job.localId,
      'unanswered',
      attempts,
      this.now() + this.retryDelay(attempts),
    );
    return 'transient';
  }

  /**
   * Record a submit the horde would not take. Below the attempt bound the job
   * keeps waiting and carries why, so the card can say what is happening and
   * when the next attempt is; at the bound it becomes an error with the same
   * Retry every other failure offers.
   */
  private async recordSubmitFailure(
    localId: string,
    reason: SubmitBlockReason,
    attempts: number,
    retryAt: number,
  ): Promise<void> {
    if (attempts >= MAX_SUBMIT_ATTEMPTS) {
      await this.patchJob(localId, {
        status: 'error',
        errorKey:
          reason === 'rate_limited'
            ? 'generate.results.error_submit_rate_limited'
            : 'generate.results.error_submit_unanswered',
        submitAttempts: attempts,
        submitBlocked: undefined,
        submitRetryAt: undefined,
      });
      return;
    }
    await this.patchJob(localId, {
      submitAttempts: attempts,
      submitBlocked: reason,
      submitRetryAt: retryAt,
    });
    this.ngZone.run(() => this._clock.set(this.now()));
  }

  /** Doubling wait, capped, so a long outage is not asked about every second. */
  private retryDelay(attempts: number): number {
    return Math.min(
      SUBMIT_RETRY_BASE_MS * 2 ** (attempts - 1),
      SUBMIT_RETRY_MAX_MS,
    );
  }

  /** Keep the countdown moving while any job is waiting on a retry. */
  private advanceClock(): void {
    const blocked = this._jobs().some(
      (job) => job.status === 'waiting' && job.submitRetryAt !== undefined,
    );
    if (blocked) {
      this.ngZone.run(() => this._clock.set(this.now()));
    }
  }

  /**
   * A submit succeeded for a job that stopped waiting while it was in flight:
   * the user cancelled or deleted it, or it moved on some other way. Nothing
   * will follow the generation the horde just accepted, so it is cancelled
   * before it runs to completion and spends kudos. A cancelled job that still
   * exists records the id so the horde generation stays traceable.
   */
  private async reconcileOrphanedSubmit(
    localId: string,
    hordeId: string,
  ): Promise<void> {
    this.droppedHordeIds.set(hordeId, this.now());
    const job = this.findJob(localId);
    if (job?.status === 'cancelled' && !job.hordeId) {
      await this.patchJob(localId, { hordeId });
    }
    try {
      await firstValueFrom(this.aiHorde.cancelImageGeneration(hordeId));
    } catch (error) {
      console.warn('Could not cancel an orphaned generation:', error);
    }
  }

  private async buildSubmitRequest(
    job: LocalGenerationJob,
  ): Promise<ImageGenerationRequest> {
    const request: ImageGenerationRequest = { ...job.request };
    const source = await this.db.getImage(job.localId, 'source');
    if (source) {
      request.source_image = await blobToBase64(source.blob);
    }
    const mask = await this.db.getImage(job.localId, 'mask');
    if (mask) {
      request.source_mask = await blobToBase64(mask.blob);
    }
    const extras = await this.readExtraSourceImages(job.localId);
    if (extras.length > 0) {
      request.extra_source_images = extras;
    }
    return request;
  }

  /**
   * Rebuild a remix job's `extra_source_images` from its stored blobs. Slots are
   * walked in order and the first gap ends the list, so the array the horde
   * receives matches the order the user attached the images in.
   */
  private async readExtraSourceImages(
    localId: string,
  ): Promise<ImageExtraSourceImage[]> {
    const extras: ImageExtraSourceImage[] = [];
    for (let index = 0; index < MAX_EXTRA_SOURCE_IMAGES; index++) {
      const stored = await this.db.getImage(localId, extraSourceImageId(index));
      if (!stored) {
        break;
      }
      extras.push({
        image: await blobToBase64(stored.blob),
        ...(stored.strength !== undefined ? { strength: stored.strength } : {}),
      });
    }
    return extras;
  }

  // ---------------------------------------------------------------------------
  // Poll loop
  // ---------------------------------------------------------------------------

  private async pollTick(): Promise<void> {
    if (this.pollRunning) {
      return;
    }
    // A tab nobody is looking at cannot act on what a check says, and the answer
    // is the same when it comes back. Checks wait for the tab to return, where
    // the visibility listener runs one straight away so a generation that
    // finished meanwhile is picked up at once.
    if (this.document.visibilityState === 'hidden') {
      return;
    }
    this.pollRunning = true;
    try {
      const now = this.now();
      const active = this._jobs().filter(
        (job) => ACTIVE_STATUSES.has(job.status) && job.hordeId !== undefined,
      );
      for (const job of active) {
        const backoff = this.checkBackoffUntil.get(job.localId) ?? 0;
        if (backoff > now) {
          continue;
        }
        if (
          job.lastCheckedAt !== undefined &&
          now - job.lastCheckedAt < POLL_MIN_INTERVAL_MS
        ) {
          continue;
        }
        await this.pollJob(job);
      }
    } finally {
      this.pollRunning = false;
    }
  }

  private async pollJob(snapshot: LocalGenerationJob): Promise<void> {
    // The tick walks a snapshot, and a peer tab may have deleted or finished
    // the job since it was taken.
    const job = this.findJob(snapshot.localId);
    if (!job || !ACTIVE_STATUSES.has(job.status)) {
      return;
    }
    const hordeId = job.hordeId;
    if (!hordeId) {
      return;
    }
    const result = await firstValueFrom(
      this.aiHorde.checkImageGenerationResult(hordeId),
    );
    const now = this.now();

    if (result.kind === 'not_found') {
      if (job.fetchRetryFrom !== undefined) {
        // The horde has let the request go while pictures were still being
        // fetched again; whatever is missing now stays missing.
        await this.markDone(job.localId, now, {
          missing: this.expectedMissing(job, job.finishedCount ?? 0),
        });
        return;
      }
      await this.patchJob(job.localId, {
        status: 'error',
        errorKey: 'generate.results.error_expired',
        lastCheckedAt: now,
      });
      return;
    }
    if (result.kind === 'error') {
      if (result.error.status === 429) {
        this.checkBackoffUntil.set(job.localId, now + CHECK_BACKOFF_MS);
      }
      await this.patchJob(job.localId, { lastCheckedAt: now });
      return;
    }

    const check = result.check;
    this.waitInsights.recordCheck(job.localId, check, now);
    if (check.faulted) {
      await this.patchJob(job.localId, {
        status: 'error',
        errorKey: 'generate.results.error_faulted',
        lastCheckedAt: now,
      });
      return;
    }
    if (check.done) {
      await this.tabSync.exclusive(`generation-finish:${job.localId}`, () =>
        this.finishJob(job.localId, now, check.finished),
      );
      return;
    }

    await this.patchJob(job.localId, {
      status: check.processing > 0 ? 'processing' : 'queued',
      finishedCount: check.finished,
      processingCount: check.processing,
      waitingCount: check.waiting,
      restartedCount: check.restarted,
      queuePosition: check.queue_position,
      waitTime: check.wait_time,
      kudos: check.kudos,
      isPossible: check.is_possible,
      eligibleWorkers: check.eligible_workers,
      eligibleWorkerThreads: check.eligible_worker_threads,
      mightStall: check.might_stall,
      lastCheckedAt: now,
    });
  }

  /**
   * Collect a finished job's pictures and mark it done. A picture that cannot
   * be fetched keeps the job in its active status with
   * {@link LocalGenerationJob.fetchRetryFrom} set, and later ticks fetch only
   * what is still missing. Once {@link FETCH_RETRY_WINDOW_MS} has passed the
   * job is marked done with the shortfall recorded.
   *
   * Runs under the job's finish lock. The stored row is read first because a
   * peer tab may have finished the job, or fetched some of its pictures, since
   * this tab last heard about it.
   */
  private async finishJob(
    localId: string,
    now: number,
    finished: number,
  ): Promise<void> {
    const job = await this.freshRow(localId);
    if (!job || !ACTIVE_STATUSES.has(job.status) || !job.hordeId) {
      return;
    }
    const status = await firstValueFrom(
      this.aiHorde.getImageGenerationStatus(job.hordeId),
    );
    if (status === GENERATION_NOT_FOUND || status === null) {
      if (
        job.fetchRetryFrom !== undefined &&
        now - job.fetchRetryFrom >= FETCH_RETRY_WINDOW_MS
      ) {
        await this.markDone(localId, now, {
          missing: this.expectedMissing(job, finished),
        });
        return;
      }
      // Transient status fetch failure; retry on a later tick.
      await this.patchJob(localId, { lastCheckedAt: now });
      return;
    }

    const held = new Set(job.resultImageIds);
    let csamCensoredCount = 0;
    let missing = 0;
    for (const generation of status.generations) {
      if (this.isCsamCensored(generation)) {
        csamCensoredCount++;
        continue;
      }
      if (held.has(generation.id)) {
        continue;
      }
      if (this.isDeleted(localId)) {
        return;
      }
      // Stored already by an earlier attempt whose row update was lost, or by
      // a peer tab: fetching it again would only cost a request.
      const existing = await this.db.getImage(localId, generation.id);
      const stored =
        existing ?? (await this.downloadGeneration(localId, generation));
      if (stored) {
        held.add(generation.id);
      } else {
        missing++;
      }
    }
    const resultImageIds = status.generations
      .map((generation) => generation.id)
      .filter((id) => held.has(id));

    if (missing > 0) {
      const fetchRetryFrom = job.fetchRetryFrom ?? now;
      if (now - fetchRetryFrom < FETCH_RETRY_WINDOW_MS) {
        this.checkBackoffUntil.set(localId, now + FETCH_RETRY_INTERVAL_MS);
        await this.patchJob(localId, {
          kudos: status.kudos,
          finishedCount: finished,
          resultImageIds,
          csamCensoredCount,
          fetchRetryFrom,
          lastCheckedAt: now,
        });
        return;
      }
    }

    await this.markDone(localId, now, {
      missing,
      kudos: status.kudos,
      resultImageIds,
      csamCensoredCount,
    });
  }

  private async markDone(
    localId: string,
    now: number,
    outcome: {
      missing: number;
      kudos?: number;
      resultImageIds?: string[];
      csamCensoredCount?: number;
    },
  ): Promise<void> {
    this.checkBackoffUntil.delete(localId);
    await this.patchJob(localId, {
      status: 'done',
      ...(outcome.kudos !== undefined ? { kudos: outcome.kudos } : {}),
      ...(outcome.resultImageIds
        ? { resultImageIds: outcome.resultImageIds }
        : {}),
      ...(outcome.csamCensoredCount !== undefined
        ? { csamCensoredCount: outcome.csamCensoredCount }
        : {}),
      queuePosition: 0,
      waitTime: 0,
      fetchFailedCount: outcome.missing > 0 ? outcome.missing : undefined,
      fetchRetryFrom: undefined,
      lastCheckedAt: now,
    });
  }

  /**
   * Pictures the horde finished for a job that it holds neither as a result
   * nor as a filtered one, for when the status answer listing them is gone.
   */
  private expectedMissing(job: LocalGenerationJob, finished: number): number {
    return Math.max(
      0,
      finished - job.resultImageIds.length - (job.csamCensoredCount ?? 0),
    );
  }

  /**
   * The stored copy of a job, folded into this tab's state. Falls back to the
   * in-memory copy when the store cannot be read, and reports a job gone from
   * the store as deleted.
   */
  private async freshRow(
    localId: string,
  ): Promise<LocalGenerationJob | undefined> {
    let stored: LocalGenerationJob | undefined;
    try {
      stored = await this.db.getJob(localId);
    } catch {
      return this.findJob(localId);
    }
    if (!stored) {
      this.markDeleted(localId, this.findJob(localId)?.hordeId);
      this.forgetLocally(localId);
      return undefined;
    }
    this.acceptRow(stored);
    return this.findJob(localId);
  }

  /**
   * The horde can report the filter in either the generation state or its
   * metadata. Checking both keeps the filter image out of local storage across
   * worker versions.
   */
  private isCsamCensored(generation: GenerationOutput): boolean {
    return (
      generation.state === 'csam' ||
      generation.gen_metadata?.some(
        (entry) => entry.type === 'censorship' && entry.value === 'csam',
      ) === true
    );
  }

  private async downloadGeneration(
    localId: string,
    generation: GenerationOutput,
  ): Promise<StoredJobImage | null> {
    const { blob, mimeType } = await this.fetchImage(generation.img);
    if (!blob) {
      return null;
    }
    const image: StoredJobImage = {
      localId,
      imageId: generation.id,
      kind: 'result',
      blob,
      mimeType,
      metadata: {
        seed: generation.seed,
        model: generation.model,
        workerId: generation.worker_id,
        workerName: generation.worker_name,
        censored: generation.censored,
        state: generation.state,
        genMetadata: generation.gen_metadata,
      },
    };
    if (this.isDeleted(localId)) {
      return null;
    }
    await this.db.putImage(image);
    if (this.isDeleted(localId)) {
      // Deleted while the bytes were being written, so the delete may have
      // run before they landed.
      await this.db.deleteJobCascade(localId);
      return null;
    }
    return image;
  }

  private async fetchImage(
    img: string,
  ): Promise<{ blob: Blob | null; mimeType: string }> {
    if (/^https?:\/\//i.test(img)) {
      try {
        // Bypass the HTTP cache: a prior <img> load of the same link stores a
        // response without CORS headers, which a fetch cannot read back.
        const response = await fetch(img, { cache: 'no-store' });
        if (!response.ok) {
          return { blob: null, mimeType: DEFAULT_RESULT_MIME };
        }
        const blob = await response.blob();
        return { blob, mimeType: blob.type || DEFAULT_RESULT_MIME };
      } catch {
        return { blob: null, mimeType: DEFAULT_RESULT_MIME };
      }
    }
    try {
      return {
        blob: base64ToBlob(img, DEFAULT_RESULT_MIME),
        mimeType: DEFAULT_RESULT_MIME,
      };
    } catch {
      return { blob: null, mimeType: DEFAULT_RESULT_MIME };
    }
  }

  // ---------------------------------------------------------------------------
  // Rate limiting and state helpers
  // ---------------------------------------------------------------------------

  private submitWindowAllows(): boolean {
    const cutoff = this.now() - SUBMIT_WINDOW_MS;
    this.submitTimestamps = this.submitTimestamps.filter((ts) => ts > cutoff);
    return this.submitTimestamps.length < SUBMIT_WINDOW_LIMIT;
  }

  private recordSubmitAttempt(): void {
    this.submitTimestamps.push(this.now());
  }

  private countActive(): number {
    return this._jobs().filter((job) => ACTIVE_STATUSES.has(job.status)).length;
  }

  private apiKey(): string {
    return this.auth.getStoredApiKey() || ANONYMOUS_API_KEY;
  }

  private now(): number {
    return Date.now();
  }

  private findJob(localId: string): LocalGenerationJob | undefined {
    return this._jobs().find((job) => job.localId === localId);
  }

  /**
   * Apply a change to a held job, in the store and in memory, and tell the
   * other tabs. Refused for a job that is gone or deleted, since the caller is
   * work that was already in flight when it went, and for a change that would
   * move a finished job back to another status, which is a poll answer
   * arriving after a cancel.
   */
  private patchJob(
    localId: string,
    patch: Partial<LocalGenerationJob>,
  ): Promise<void> {
    // Patches to one job run one after another. Each builds its row from the
    // job as the previous one left it, so a poll answer that started before
    // an adopted job's request was read back cannot land after it and write
    // the placeholder back over it. The first patch starts at once, as a lone
    // patch always did.
    const previous = this.patchChains.get(localId);
    const run = previous
      ? previous.then(() => this.applyPatch(localId, patch))
      : this.applyPatch(localId, patch);
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.patchChains.set(localId, settled);
    void settled.then(() => {
      if (this.patchChains.get(localId) === settled) {
        this.patchChains.delete(localId);
      }
    });
    return run;
  }

  private async applyPatch(
    localId: string,
    patch: Partial<LocalGenerationJob>,
  ): Promise<void> {
    if (this.isDeleted(localId)) {
      return;
    }
    const current = this.findJob(localId);
    if (!current) {
      return;
    }
    if (
      FINISHED_STATUSES.has(current.status) &&
      patch.status !== undefined &&
      patch.status !== current.status
    ) {
      return;
    }
    const updated: LocalGenerationJob = {
      ...current,
      ...patch,
      updatedAt: this.now(),
    };
    await this.db.putJob(updated);
    if (this.isDeleted(localId)) {
      return;
    }
    this.replaceInState(updated);
    if (FINISHED_STATUSES.has(updated.status)) {
      this.waitInsights.clear(localId);
    }
    this.tabSync.publish(
      updated.status === 'cancelled' && current.status !== 'cancelled'
        ? 'generation-job.cancelled'
        : 'generation-job.changed',
      updated,
    );
  }

  // ---------------------------------------------------------------------------
  // Other tabs
  // ---------------------------------------------------------------------------

  private listenToPeers(): void {
    const onRow = (job: LocalGenerationJob): void => this.acceptRow(job);
    for (const topic of [
      'generation-job.added',
      'generation-job.changed',
      'generation-job.cancelled',
    ] as const) {
      this.tabSync
        .on(topic)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(onRow);
    }
    this.tabSync
      .on('generation-job.deleted')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((deletion) => this.acceptDeletion(deletion));
    this.tabSync
      .on('generation-job.cleared')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        for (const job of this._jobs()) {
          this.markDeleted(job.localId, job.hordeId);
        }
        this.checkBackoffUntil.clear();
        this.waitInsights.clearAll();
        this.setState([]);
      });
  }

  /**
   * Fold a row another tab wrote, or the stored copy of one, into this tab's
   * state. The store already holds it, so nothing is written back, with one
   * exception: a row that would reopen a job this tab holds as finished is
   * refused, and the finished row is written again so the store ends on it.
   * That is a peer's poll answer overtaking a cancel it had not yet heard of.
   */
  private acceptRow(incoming: LocalGenerationJob): void {
    if (this.isDeleted(incoming.localId)) {
      return;
    }
    const held = this.findJob(incoming.localId);
    if (held === undefined) {
      if (this.yieldsToHeldAdoption(incoming)) {
        return;
      }
      this.insertInState(incoming);
      return;
    }
    const heldFinished = FINISHED_STATUSES.has(held.status);
    const incomingFinished = FINISHED_STATUSES.has(incoming.status);
    if (heldFinished && !incomingFinished) {
      if (incoming.updatedAt >= held.updatedAt) {
        void this.patchJob(held.localId, {});
      }
      return;
    }
    if (
      (incomingFinished && !heldFinished) ||
      incoming.updatedAt >= held.updatedAt
    ) {
      if (incoming !== held) {
        this.replaceInState(incoming);
      }
      if (incomingFinished) {
        this.checkBackoffUntil.delete(incoming.localId);
        this.waitInsights.clear(incoming.localId);
      }
    }
  }

  /**
   * Two tabs reading the account at once can each adopt the same generation
   * under a different local id. Every tab keeps the same one of the pair (a
   * job submitted here over an adopted one, otherwise the lower id) and the
   * store loses the other, so the tabs agree without talking it over. Returns
   * whether the incoming row is the one dropped.
   */
  private yieldsToHeldAdoption(incoming: LocalGenerationJob): boolean {
    if (!incoming.hordeId) {
      return false;
    }
    const twin = this._jobs().find(
      (job) =>
        job.hordeId === incoming.hordeId && job.localId !== incoming.localId,
    );
    if (!twin || (!twin.adopted && !incoming.adopted)) {
      return false;
    }
    const incomingLoses =
      incoming.adopted === true &&
      (!twin.adopted || incoming.localId > twin.localId);
    const loser = incomingLoses ? incoming : twin;
    this.markDeleted(loser.localId);
    this.forgetLocally(loser.localId);
    void this.db.deleteJobCascade(loser.localId);
    return incomingLoses;
  }

  private acceptDeletion(deletion: SyncedJobDeletion): void {
    this.markDeleted(deletion.localId, deletion.hordeId);
    this.forgetLocally(deletion.localId);
  }

  /** Merge the stored jobs into whatever peers announced during the load. */
  private mergeLoaded(jobs: LocalGenerationJob[]): void {
    if (this._jobs().length === 0) {
      this.setState(jobs.filter((job) => !this.isDeleted(job.localId)));
      return;
    }
    for (const job of jobs) {
      this.acceptRow(job);
    }
  }

  private markDeleted(localId: string, hordeId?: string): void {
    this.pruneDeleted();
    const now = this.now();
    this.recentlyDeleted.set(localId, now);
    if (hordeId) {
      this.droppedHordeIds.set(hordeId, now);
    }
  }

  private isDeleted(localId: string): boolean {
    this.pruneDeleted();
    return this.recentlyDeleted.has(localId);
  }

  private pruneDeleted(): void {
    const cutoff = this.now() - DELETED_GUARD_MS;
    for (const guard of [this.recentlyDeleted, this.droppedHordeIds]) {
      for (const [key, at] of guard) {
        if (at <= cutoff) {
          guard.delete(key);
        }
      }
    }
  }

  /** Drop a job from memory along with every timer and note kept for it. */
  private forgetLocally(localId: string): void {
    this.checkBackoffUntil.delete(localId);
    this.waitInsights.clear(localId);
    this.removeFromState(localId);
  }

  private setState(jobs: LocalGenerationJob[]): void {
    this.ngZone.run(() => this._jobs.set(jobs));
  }

  private addToState(job: LocalGenerationJob): void {
    this.ngZone.run(() => this._jobs.update((jobs) => [job, ...jobs]));
  }

  /** Place a job among the others, which are held newest first. */
  private insertInState(job: LocalGenerationJob): void {
    this.ngZone.run(() =>
      this._jobs.update((jobs) => {
        const at = jobs.findIndex((other) => other.createdAt < job.createdAt);
        return at === -1
          ? [...jobs, job]
          : [...jobs.slice(0, at), job, ...jobs.slice(at)];
      }),
    );
  }

  private removeFromState(localId: string): void {
    this.ngZone.run(() =>
      this._jobs.update((jobs) =>
        jobs.filter((job) => job.localId !== localId),
      ),
    );
  }

  private replaceInState(updated: LocalGenerationJob): void {
    this.ngZone.run(() =>
      this._jobs.update((jobs) =>
        jobs.map((job) => (job.localId === updated.localId ? updated : job)),
      ),
    );
  }
}

/** Whether an answer came from the read-back endpoint itself. */
function answeredByReadBack(result: SubmittedImageRequestResult): boolean {
  return (
    result.kind === 'success' ||
    (result.kind === 'error' && result.error.rc !== undefined)
  );
}

function readStoredReadBackSince(): number | null {
  try {
    const stored = Number(localStorage.getItem(READ_BACK_SINCE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}
