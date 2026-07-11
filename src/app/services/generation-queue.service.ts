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
  ImageGenerationRequest,
} from '../types/generation';
import {
  EnqueueSourceImage,
  LocalGenerationJob,
  LocalGenerationJobStatus,
  StoredJobImage,
} from '../types/generation-job';
import { base64ToBlob, blobToBase64 } from '../helper/blob-base64';
import { randomUuid } from '../helper/random-uuid';

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
   * Persist a job as `waiting` along with any source/mask blobs. The request is
   * stored without its base64 `source_image` / `source_mask`; those are
   * rehydrated from the stored blobs when the job is submitted.
   */
  public async enqueue(
    request: ImageGenerationRequest,
    sourceImages?: EnqueueSourceImage[],
  ): Promise<string> {
    const localId = randomUuid();
    const now = this.now();
    const storedRequest: ImageGenerationRequest = { ...request };
    delete storedRequest.source_image;
    delete storedRequest.source_mask;

    const job: LocalGenerationJob = {
      localId,
      status: 'waiting',
      createdAt: now,
      updatedAt: now,
      request: storedRequest,
      resultImageIds: [],
    };

    await this.db.putJob(job);
    for (const source of sourceImages ?? []) {
      await this.db.putImage({
        localId,
        imageId: source.kind,
        kind: source.kind,
        blob: source.blob,
        mimeType: source.mimeType,
      });
    }
    this.addToState(job);
    return localId;
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
    this.removeFromState(localId);
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
    return this.enqueue(job.request, sourceImages);
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
        errorMessage: undefined,
      });
      return 'submitted';
    }

    const { status, message } = result.error;
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
    return request;
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
        errorMessage: 'Generation expired or was not found.',
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
    if (check.faulted) {
      await this.patchJob(job.localId, {
        status: 'error',
        errorMessage: 'Generation faulted on the horde.',
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
      queuePosition: check.queue_position,
      waitTime: check.wait_time,
      kudos: check.kudos,
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
    for (const generation of status.generations) {
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
      lastCheckedAt: now,
    });
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
        const response = await fetch(img);
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
