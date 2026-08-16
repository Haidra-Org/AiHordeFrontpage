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
import { AlchemyDbService } from './alchemy-db.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import {
  AlchemyFormName,
  AlchemyStatusResponse,
  GENERATION_NOT_FOUND,
  InterrogationRequest,
} from '../types/generation';
import {
  AlchemySourceMode,
  StoredAlchemyImage,
  StoredAlchemyJob,
} from '../types/alchemy-job';
import {
  AlchemyJob,
  isJobSettled,
  toAlchemyJob,
} from '../helper/alchemy-job-view';
import { base64ToBlob } from '../helper/blob-base64';
import {
  inferImageMimeType,
  isLikelyImageFileLink,
} from '../helper/generation-image';
import {
  sourceToThumbnailDataUrl,
  stripDataUrlPrefix,
} from '../helper/image-encoding';

const ANONYMOUS_API_KEY = '0000000000';

const POLL_MS = 10_000;

/**
 * How many consecutive download failures a result image gets before it is
 * written off. A transient blip must not cost the user an image, but a link
 * that has genuinely gone should stop consuming requests.
 */
const MAX_IMAGE_ATTEMPTS = 3;

/**
 * How long the horde's presigned result links stay valid. Past this there is
 * nothing to fetch, so an old job's outstanding images are written off without
 * spending a request on them.
 */
const IMAGE_URL_LIFETIME_MS = 30 * 60_000;

/** Where alchemy jobs lived before they moved into IndexedDB. */
const LEGACY_STORAGE_KEY = 'aihorde.alchemy.recent_jobs';

/** The shape jobs were written in under {@link LEGACY_STORAGE_KEY}. */
interface LegacyStoredJob {
  id?: unknown;
  forms?: unknown;
  status?: unknown;
  done?: unknown;
  faulted?: unknown;
  cancelled?: unknown;
  notFound?: unknown;
  firstSeenAt?: unknown;
  sourceThumb?: unknown;
}

export interface AlchemySubmission {
  forms: AlchemyFormName[];
  slowWorkers: boolean;
  /** A public image URL or a bare base64-encoded image, as the API takes it. */
  source: string;
  /** The picker's own mime type; sniffed from the payload when absent. */
  sourceMimeType?: string;
}

/** A result image the horde has published but that is not yet held locally. */
interface UnresolvedImage {
  form: string;
  url: string;
}

function isUrlSource(source: string): AlchemySourceMode {
  return /^https?:\/\//i.test(source) ? 'url' : 'upload';
}

/**
 * Result images the horde has finished but that are neither stored nor written
 * off, so still worth fetching.
 */
function unresolvedImages(job: StoredAlchemyJob): UnresolvedImage[] {
  const settled = new Set([...job.storedResultForms, ...job.failedResultForms]);
  const out: UnresolvedImage[] = [];
  for (const form of job.status?.forms ?? []) {
    if (form.state !== 'done' || settled.has(form.form)) continue;
    const value = form.result?.[form.form];
    if (typeof value === 'string' && isLikelyImageFileLink(value)) {
      out.push({ form: form.form, url: value });
    }
  }
  return out;
}

/**
 * Tracks submitted alchemy requests for the life of the browser's storage.
 *
 * Root-provided rather than owned by the page, because the horde's result links
 * are presigned and stop working after about half an hour: the bytes have to be
 * captured while the user may well be looking at another part of the app. Every
 * status transition is written straight through to IndexedDB, and each result
 * image is downloaded as its own form completes rather than when the job as a
 * whole settles, so a slow form cannot cost a fast one its image.
 *
 * Nothing here deletes stored work on its own. Jobs go when the user deletes
 * them or clears the history.
 */
@Injectable({ providedIn: 'root' })
export class AlchemyQueueService {
  private readonly aiHorde = inject(AiHordeService);
  private readonly auth = inject(AuthService);
  private readonly db = inject(AlchemyDbService);
  private readonly toast = inject(ToastService);
  private readonly ngZone = inject(NgZone);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly stored = signal<StoredAlchemyJob[]>([]);

  /** Every tracked job, newest first. */
  public readonly jobs = computed<AlchemyJob[]>(() =>
    this.stored().map(toAlchemyJob),
  );

  /** Jobs still worth polling: unsettled, or settled with images outstanding. */
  public readonly pendingJobs = computed<AlchemyJob[]>(() =>
    this.stored().filter(this.needsVisit).map(toAlchemyJob),
  );

  private ready: Promise<void> = Promise.resolve();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollRunning = false;
  /** Consecutive download failures, keyed `${localId}::${form}`. */
  private readonly imageAttempts = new Map<string, number>();
  private quotaWarned = false;

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    this.ready = this.initialize();
  }

  /** Resolves once the stored jobs have been loaded into the signal. */
  public whenReady(): Promise<void> {
    return this.ready;
  }

  private async initialize(): Promise<void> {
    try {
      this.stored.set(await this.db.listJobs());
      await this.migrateLegacyJobs();
      this.stored.set(await this.db.listJobs());
    } catch (error) {
      console.warn('Could not restore stored alchemy jobs.', error);
    }
    // Started regardless: a restore failure should not also stop whatever the
    // user submits next from being followed.
    this.startPolling();
  }

  // --- Submission ----------------------------------------------------------

  /** Submit a request and begin tracking it. Returns the horde's job id. */
  public async submit(input: AlchemySubmission): Promise<string | null> {
    const apiKey = this.auth.getStoredApiKey() ?? ANONYMOUS_API_KEY;
    const request: InterrogationRequest = {
      forms: input.forms.map((name) => ({ name })),
      source_image: input.source,
      slow_workers: input.slowWorkers,
    };

    const response = await firstValueFrom(
      this.aiHorde.submitInterrogation(apiKey, request),
    );
    if (!response) {
      return null;
    }

    const now = Date.now();
    const sourceMode = isUrlSource(input.source);
    const job: StoredAlchemyJob = {
      localId: crypto.randomUUID(),
      jobId: response.id,
      createdAt: now,
      updatedAt: now,
      forms: input.forms,
      slowWorkers: input.slowWorkers,
      sourceMode,
      sourceUrl: sourceMode === 'url' ? input.source : undefined,
      kudos: response.kudos,
      status: null,
      done: false,
      faulted: false,
      cancelled: false,
      notFound: false,
      storedResultForms: [],
      failedResultForms: [],
    };

    await this.db.putJob(job);
    this.stored.update((jobs) => [job, ...jobs]);
    // Off the submit path: a URL source needs no work, and a canvas encode of a
    // multi-megabyte upload should not hold up the job appearing on screen.
    void this.storeSourceImages(job, input);
    return response.id;
  }

  /**
   * Keep the request's own image. A URL source is left alone: it is durable,
   * renders straight into an `<img>`, and fetching it would run into CORS.
   */
  private async storeSourceImages(
    job: StoredAlchemyJob,
    input: AlchemySubmission,
  ): Promise<void> {
    if (job.sourceMode === 'url') {
      return;
    }
    try {
      const payload = stripDataUrlPrefix(input.source);
      const mimeType = input.sourceMimeType ?? inferImageMimeType(payload);
      await this.putImage({
        localId: job.localId,
        imageId: 'source',
        kind: 'source',
        blob: base64ToBlob(payload, mimeType),
        mimeType,
      });

      const thumb = await sourceToThumbnailDataUrl(input.source);
      if (thumb?.startsWith('data:')) {
        await this.putImage({
          localId: job.localId,
          imageId: 'thumb',
          kind: 'thumb',
          blob: base64ToBlob(stripDataUrlPrefix(thumb), 'image/webp'),
          mimeType: 'image/webp',
        });
      }
      // Nudge subscribers so the page resolves the new thumbnail.
      this.touch(job.localId);
    } catch (error) {
      console.warn('Could not store the alchemy source image.', error);
    }
  }

  // --- Polling -------------------------------------------------------------

  private startPolling(): void {
    this.ngZone.runOutsideAngular(() => {
      this.pollTimer = setInterval(() => {
        void this.pollTick();
      }, POLL_MS);
    });
  }

  private readonly needsVisit = (job: StoredAlchemyJob): boolean =>
    !isJobSettled(toAlchemyJob(job)) || unresolvedImages(job).length > 0;

  private async pollTick(): Promise<void> {
    if (this.pollRunning) {
      return;
    }
    this.pollRunning = true;
    try {
      for (const job of this.stored().filter(this.needsVisit)) {
        await this.visit(job);
      }
    } finally {
      this.pollRunning = false;
    }
  }

  private async visit(job: StoredAlchemyJob): Promise<void> {
    let current = job;
    // A settled job is only revisited for images it has yet to hand over, and
    // asking for its status again would tell us nothing new.
    if (!isJobSettled(toAlchemyJob(job))) {
      const status = await firstValueFrom(
        this.aiHorde.getAlchemyStatus(job.jobId),
      );
      if (status === GENERATION_NOT_FOUND) {
        await this.patch(job.localId, {
          notFound: true,
          lastPolledAt: Date.now(),
        });
        return;
      }
      current = await this.patch(job.localId, {
        lastPolledAt: Date.now(),
        ...(status
          ? {
              status,
              done: status.state === 'done',
              faulted: status.state === 'faulted',
            }
          : {}),
      });
    }
    await this.harvestResultImages(current);
  }

  /**
   * Pull down every result image the job has published but not yet handed over.
   * Done per form as that form completes, rather than once the whole job
   * settles, so the fastest form's link is captured while it is freshest.
   */
  private async harvestResultImages(job: StoredAlchemyJob): Promise<void> {
    const outstanding = unresolvedImages(job);
    if (outstanding.length === 0) {
      return;
    }

    // Past the link lifetime there is nothing left to fetch, so write the whole
    // remainder off rather than spending a request per form discovering that.
    if (Date.now() - job.createdAt > IMAGE_URL_LIFETIME_MS) {
      await this.patch(job.localId, {
        failedResultForms: [
          ...job.failedResultForms,
          ...outstanding.map((image) => image.form),
        ],
      });
      return;
    }

    const stored: string[] = [];
    const failed: string[] = [];
    await Promise.all(
      outstanding.map(async (image) => {
        const key = `${job.localId}::${image.form}`;
        try {
          const response = await fetch(image.url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const blob = await response.blob();
          await this.putImage({
            localId: job.localId,
            imageId: image.form,
            kind: 'result',
            blob,
            mimeType: blob.type || 'image/webp',
            sourceUrl: image.url,
            fetchedAt: Date.now(),
          });
          this.imageAttempts.delete(key);
          stored.push(image.form);
        } catch (error) {
          if (this.isQuotaError(error)) {
            this.reportQuotaExhausted();
            failed.push(image.form);
            return;
          }
          const attempts = (this.imageAttempts.get(key) ?? 0) + 1;
          this.imageAttempts.set(key, attempts);
          if (attempts >= MAX_IMAGE_ATTEMPTS) {
            this.imageAttempts.delete(key);
            failed.push(image.form);
          }
        }
      }),
    );

    if (stored.length === 0 && failed.length === 0) {
      return;
    }
    const latest = this.find(job.localId) ?? job;
    await this.patch(job.localId, {
      storedResultForms: [...latest.storedResultForms, ...stored],
      failedResultForms: [...latest.failedResultForms, ...failed],
    });
  }

  private isQuotaError(error: unknown): boolean {
    return (
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    );
  }

  /**
   * Nothing is pruned to make room, so a full store is the user's to resolve.
   * Said once: the poll loop would otherwise repeat it every tick.
   */
  private reportQuotaExhausted(): void {
    if (this.quotaWarned) {
      return;
    }
    this.quotaWarned = true;
    this.ngZone.run(() =>
      this.toast.error('studio.storage.quota_exhausted', { transloco: true }),
    );
  }

  // --- Job lifecycle -------------------------------------------------------

  /** Ask the horde to stop a job, keeping whatever it has already produced. */
  public async cancel(localId: string): Promise<void> {
    const job = this.find(localId);
    if (!job) {
      return;
    }
    const status = await firstValueFrom(
      this.aiHorde.cancelInterrogation(job.jobId),
    );
    if (status === GENERATION_NOT_FOUND) {
      await this.patch(localId, { notFound: true, cancelled: true });
      return;
    }
    const patched = await this.patch(localId, {
      cancelled: true,
      ...(status ? { status } : {}),
    });
    // The cancel response carries the forms that did finish, so their images
    // are collected here rather than lost with the job.
    await this.harvestResultImages(patched);
  }

  public async deleteJobs(localIds: readonly string[]): Promise<void> {
    const doomed = new Set(localIds);
    if (doomed.size === 0) {
      return;
    }
    this.stored.update((jobs) => jobs.filter((j) => !doomed.has(j.localId)));
    await Promise.all([...doomed].map((id) => this.db.deleteJobCascade(id)));
  }

  /** Drop every tracked job. Reached only from the storage management surface. */
  public async clearHistory(): Promise<void> {
    await this.db.clearAll();
    this.stored.set([]);
    this.imageAttempts.clear();
  }

  // --- Stored images -------------------------------------------------------

  public getSourceImage(
    localId: string,
  ): Promise<StoredAlchemyImage | undefined> {
    return this.db.getImage(localId, 'source');
  }

  public getThumbnail(
    localId: string,
  ): Promise<StoredAlchemyImage | undefined> {
    return this.db.getImage(localId, 'thumb');
  }

  public async getResultImages(localId: string): Promise<StoredAlchemyImage[]> {
    const images = await this.db.getImagesForJob(localId);
    return images.filter((image) => image.kind === 'result');
  }

  // --- State ---------------------------------------------------------------

  private find(localId: string): StoredAlchemyJob | undefined {
    return this.stored().find((job) => job.localId === localId);
  }

  /** Apply a change to a job in memory and on disk, and return the result. */
  private async patch(
    localId: string,
    update: Partial<StoredAlchemyJob>,
  ): Promise<StoredAlchemyJob> {
    const current = this.find(localId);
    const next: StoredAlchemyJob = {
      ...(current as StoredAlchemyJob),
      ...update,
      updatedAt: Date.now(),
    };
    this.ngZone.run(() =>
      this.stored.update((jobs) =>
        jobs.map((job) => (job.localId === localId ? next : job)),
      ),
    );
    await this.db.putJob(next);
    return next;
  }

  /** Re-emit a job unchanged so subscribers re-resolve its stored images. */
  private touch(localId: string): void {
    this.ngZone.run(() =>
      this.stored.update((jobs) =>
        jobs.map((job) => (job.localId === localId ? { ...job } : job)),
      ),
    );
  }

  private async putImage(image: StoredAlchemyImage): Promise<void> {
    await this.db.putImage(image);
  }

  // --- Migration -----------------------------------------------------------

  /**
   * Bring across the jobs the page used to keep in localStorage. Their written
   * results survive; their result images do not, because the links were all the
   * old format kept and those have long since expired.
   */
  private async migrateLegacyJobs(): Promise<void> {
    let raw: string | null;
    try {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return;
    }
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return;
    }

    for (const entry of parsed as LegacyStoredJob[]) {
      if (typeof entry?.id !== 'string' || entry.id.length === 0) continue;
      if (await this.db.getJobByHordeId(entry.id)) continue;
      await this.importLegacyJob(entry);
    }
    // Only once the imports are through: leaving the key in place on a failure
    // means the next load retries rather than dropping the jobs on the floor.
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }

  private async importLegacyJob(entry: LegacyStoredJob): Promise<void> {
    const localId = crypto.randomUUID();
    const thumb =
      typeof entry.sourceThumb === 'string' ? entry.sourceThumb : null;
    const sourceMode: AlchemySourceMode =
      thumb && /^https?:\/\//i.test(thumb) ? 'url' : 'upload';
    const createdAt =
      typeof entry.firstSeenAt === 'number' ? entry.firstSeenAt : Date.now();

    await this.db.putJob({
      localId,
      jobId: entry.id as string,
      createdAt,
      updatedAt: Date.now(),
      forms: Array.isArray(entry.forms)
        ? (entry.forms as AlchemyFormName[])
        : [],
      // The old record never stored this; it matters only to a resubmit, and the
      // studio has always submitted with slow workers allowed.
      slowWorkers: true,
      sourceMode,
      sourceUrl: sourceMode === 'url' && thumb ? thumb : undefined,
      status: (entry.status as AlchemyStatusResponse | null) ?? null,
      done: entry.done === true,
      faulted: entry.faulted === true,
      cancelled: entry.cancelled === true,
      notFound: entry.notFound === true,
      storedResultForms: [],
      failedResultForms: [],
    });

    if (sourceMode === 'upload' && thumb?.startsWith('data:')) {
      try {
        await this.putImage({
          localId,
          imageId: 'thumb',
          kind: 'thumb',
          blob: base64ToBlob(stripDataUrlPrefix(thumb), 'image/webp'),
          mimeType: 'image/webp',
        });
      } catch {
        // A thumbnail that will not decode is not worth failing the import for.
      }
    }
  }
}
