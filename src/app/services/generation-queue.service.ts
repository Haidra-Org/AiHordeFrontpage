import {
  Injectable,
  NgZone,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AiHordeService } from './ai-horde.service';
import { AuthService } from './auth.service';
import { GenerationDbService } from './generation-db.service';
import {
  GENERATION_NOT_FOUND,
  GenerationOutput,
  ImageExtraSourceImage,
  ImageGenerationRequest,
} from '../types/generation';
import {
  EnqueueSourceImage,
  LocalGenerationJob,
  LocalGenerationJobStatus,
  MAX_EXTRA_SOURCE_IMAGES,
  StoredJobImage,
  extraSourceImageId,
} from '../types/generation-job';
import { base64ToBlob, blobToBase64 } from '../helper/blob-base64';
import { randomUuid } from '../helper/random-uuid';
import { GenerationWaitInsightsService } from './generation-wait-insights.service';

const ANONYMOUS_API_KEY = '0000000000';

const MAX_CONCURRENT = 5;
const SUBMIT_WINDOW_MS = 60_000;
const SUBMIT_WINDOW_LIMIT = 9;
const SUBMIT_BACKOFF_MS = 15_000;
const CHECK_BACKOFF_MS = 15_000;
const POLL_MIN_INTERVAL_MS = 2_000;
const DISPATCH_TICK_MS = 1_000;
const POLL_TICK_MS = 2_000;

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
 * The service is browser-only. During SSR the constructor starts nothing and
 * the persistence layer no-ops, so injecting it on the server is inert.
 */
@Injectable({ providedIn: 'root' })
export class GenerationQueueService {
  private readonly db = inject(GenerationDbService);
  private readonly aiHorde = inject(AiHordeService);
  private readonly auth = inject(AuthService);
  private readonly waitInsights = inject(GenerationWaitInsightsService);
  private readonly ngZone = inject(NgZone);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _jobs = signal<LocalGenerationJob[]>([]);

  /** All jobs, newest first. */
  public readonly jobs = this._jobs.asReadonly();
  public readonly pendingJobs = computed(() =>
    this._jobs().filter(
      (job) => job.status === 'waiting' || ACTIVE_STATUSES.has(job.status),
    ),
  );
  public readonly finishedJobs = computed(() =>
    this._jobs().filter((job) => FINISHED_STATUSES.has(job.status)),
  );

  private submitTimestamps: number[] = [];
  private submitBackoffUntil = 0;
  private readonly checkBackoffUntil = new Map<string, number>();

  private dispatchRunning = false;
  private pollRunning = false;
  private dispatchTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    if (this.isBrowser) {
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
      this.setState(jobs);
    } catch (error) {
      // A persistence failure must not wedge startup: the loops still run and
      // new work can be enqueued against empty in-memory state. The DB layer's
      // self-healing recovery should make this path rare.
      console.warn('Failed to load persisted generation jobs:', error);
    }
    this.startLoops();
  }

  private startLoops(): void {
    this.ngZone.runOutsideAngular(() => {
      this.dispatchTimer = setInterval(
        () => void this.dispatchTick(),
        DISPATCH_TICK_MS,
      );
      this.pollTimer = setInterval(() => void this.pollTick(), POLL_TICK_MS);
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
    return localId;
  }

  /**
   * Take over image generations the account reports as running that this
   * browser holds no record of: one submitted from another device, or one whose
   * submit landed after a reload took the page away. The horde answers for them
   * under the same key, so an adopted job joins the poll loop as a `queued` job
   * with an id and is driven to done and downloaded like any other. Ids already
   * held are skipped, so this is safe to run on every read of the account
   * record.
   */
  public async adoptActive(ids: readonly string[]): Promise<void> {
    const known = new Set(
      this._jobs()
        .map((job) => job.hordeId)
        .filter((hordeId): hordeId is string => hordeId !== undefined),
    );
    for (const hordeId of ids) {
      if (known.has(hordeId)) {
        continue;
      }
      known.add(hordeId);
      const now = this.now();
      const job: LocalGenerationJob = {
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
      await this.db.putJob(job);
      this.addToState(job);
    }
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

  /** Delete a job and its stored images. */
  public async deleteJob(localId: string): Promise<void> {
    await this.db.deleteJobCascade(localId);
    this.checkBackoffUntil.delete(localId);
    this.waitInsights.clear(localId);
    this.removeFromState(localId);
  }

  /**
   * Drop every tracked job and its stored images. Reached only from the storage
   * management surface; nothing in the app calls this on its own.
   */
  public async clearHistory(): Promise<void> {
    await this.db.clearAll();
    this.checkBackoffUntil.clear();
    this.waitInsights.clearAll();
    this.setState([]);
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
      // An adopted job's request was never here, so there is nothing to send
      // again; the surfaces that offer Retry withhold it for these.
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
    this.setState(jobs);
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
      if (this.submitBackoffUntil > this.now()) {
        return;
      }
      let active = this.countActive();
      const waiting = this._jobs()
        .filter((job) => job.status === 'waiting')
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
        const outcome = await this.submitJob(job);
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
      if (!stillWaiting) {
        await this.reconcileOrphanedSubmit(job.localId, result.response.id);
        return 'transient';
      }
      await this.patchJob(job.localId, {
        status: 'requested',
        hordeId: result.response.id,
        kudos: result.response.kudos,
        // The same figure, kept where nothing later overwrites it, so the
        // finished job can be shown against what it was quoted.
        quotedKudos: result.response.kudos,
        errorMessage: undefined,
        errorKey: undefined,
        errorRc: undefined,
      });
      return 'submitted';
    }

    const { status, message, rc } = result.error;
    if (status === 429) {
      // A 429 is a global submit-rate signal, so back off regardless of whether
      // this particular job is still waiting.
      this.submitBackoffUntil = this.now() + SUBMIT_BACKOFF_MS;
      return 'backoff';
    }
    if (status >= 400 && status < 500) {
      if (!stillWaiting) {
        return 'transient';
      }
      await this.patchJob(job.localId, {
        status: 'error',
        errorMessage: message,
        errorRc: rc,
      });
      return 'error';
    }
    // 5xx / network: keep the job waiting and retry on a later tick.
    return 'transient';
  }

  /**
   * A submit succeeded for a job the user cancelled mid-flight. Record the id so
   * the horde generation is traceable, keep the local status 'cancelled', and
   * cancel the now-orphaned generation so it does not run to completion.
   */
  private async reconcileOrphanedSubmit(
    localId: string,
    hordeId: string,
  ): Promise<void> {
    if (this.findJob(localId)?.status !== 'cancelled') {
      return;
    }
    await this.patchJob(localId, { hordeId });
    await firstValueFrom(this.aiHorde.cancelImageGeneration(hordeId));
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

  private async pollJob(job: LocalGenerationJob): Promise<void> {
    const hordeId = job.hordeId;
    if (!hordeId) {
      return;
    }
    const result = await firstValueFrom(
      this.aiHorde.checkImageGenerationResult(hordeId),
    );
    const now = this.now();

    if (result.kind === 'not_found') {
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
      await this.finishJob(job, now);
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

  private async finishJob(job: LocalGenerationJob, now: number): Promise<void> {
    const hordeId = job.hordeId;
    if (!hordeId) {
      return;
    }
    const status = await firstValueFrom(
      this.aiHorde.getImageGenerationStatus(hordeId),
    );
    if (status === GENERATION_NOT_FOUND || status === null) {
      // Transient status fetch failure; retry on a later tick.
      await this.patchJob(job.localId, { lastCheckedAt: now });
      return;
    }

    const resultImageIds: string[] = [];
    let csamCensoredCount = 0;
    for (const generation of status.generations) {
      if (this.isCsamCensored(generation)) {
        csamCensoredCount++;
        continue;
      }
      const stored = await this.downloadGeneration(job.localId, generation);
      if (stored) {
        resultImageIds.push(stored.imageId);
      }
    }

    this.checkBackoffUntil.delete(job.localId);
    await this.patchJob(job.localId, {
      status: 'done',
      kudos: status.kudos,
      queuePosition: 0,
      waitTime: 0,
      resultImageIds,
      csamCensoredCount,
      lastCheckedAt: now,
    });
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
    await this.db.putImage(image);
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

  private async patchJob(
    localId: string,
    patch: Partial<LocalGenerationJob>,
  ): Promise<void> {
    const current = this.findJob(localId);
    if (!current) {
      return;
    }
    const updated: LocalGenerationJob = {
      ...current,
      ...patch,
      updatedAt: this.now(),
    };
    await this.db.putJob(updated);
    this.replaceInState(updated);
    if (FINISHED_STATUSES.has(updated.status)) {
      this.waitInsights.clear(localId);
    }
  }

  private setState(jobs: LocalGenerationJob[]): void {
    this.ngZone.run(() => this._jobs.set(jobs));
  }

  private addToState(job: LocalGenerationJob): void {
    this.ngZone.run(() => this._jobs.update((jobs) => [job, ...jobs]));
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
