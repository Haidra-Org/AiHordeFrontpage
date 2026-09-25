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
import { AlchemyDbService } from './alchemy-db.service';
import { AuthService } from './auth.service';
import { SyncedJobDeletion, TabSyncService } from './tab-sync.service';
import { ToastService } from './toast.service';
import {
  ALCHEMY_ANNOTATION_FORMS,
  ALCHEMY_DATA_FORMS,
  ALCHEMY_POST_PROCESSOR_FORMS,
  AlchemyFormName,
  AlchemyStatusResponse,
  AnnotationControlType,
  GENERATION_NOT_FOUND,
  HordeApiError,
  InterrogationForm,
  InterrogationRequest,
} from '../types/generation';
import {
  AlchemySourceMode,
  StoredAlchemyImage,
  StoredAlchemyJob,
  resultThumbImageId,
} from '../types/alchemy-job';
import {
  AlchemyJob,
  formViews,
  isJobSettled,
  storedAnnotationDetectors,
  toAlchemyJob,
} from '../helper/alchemy-job-view';
import { randomUuid } from '../helper/random-uuid';
import { base64ToBlob } from '../helper/blob-base64';
import {
  inferImageMimeType,
  isLikelyImageFileLink,
} from '../helper/generation-image';
import {
  blobToThumbnailDataUrl,
  sourceToThumbnailDataUrl,
  stripDataUrlPrefix,
} from '../helper/image-encoding';

const ANONYMOUS_API_KEY = '0000000000';

/**
 * How often a tracked request is asked about. Exported because the account's
 * list of active generations is read on the same cadence rather than on a timer
 * of its own.
 */
export const ALCHEMY_POLL_INTERVAL_MS = 10_000;

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

/**
 * How long a deleted job's id keeps refusing writes. A visit or download
 * already in flight when the job was deleted finishes within this, and the
 * account's list of active generations stops naming a cancelled request well
 * within it too.
 */
const DELETED_GUARD_MS = 60_000;

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
  /** Detectors for the control-map operation, one form submitted per detector. */
  annotationControlTypes?: readonly AnnotationControlType[];
  slowWorkers: boolean;
  /** A public image URL or a bare base64-encoded image, as the API takes it. */
  source: string;
  /** The picker's own mime type; sniffed from the payload when absent. */
  sourceMimeType?: string;
}

/**
 * What came of a submission: the horde's job id, or the refusal as the horde
 * worded it, with its return code where it sent one.
 */
export type AlchemySubmitOutcome =
  | { kind: 'submitted'; id: string }
  | { kind: 'refused'; error: HordeApiError };

/** A result image the horde has published but that is not yet held locally. */
interface UnresolvedImage {
  /** The form's result key, which carries the detector for a control map. */
  key: string;
  url: string;
}

/**
 * Whether a job was stopped for good: cancelled, or let go by the horde. No
 * later status answer can bring either back.
 */
function isStopped(job: StoredAlchemyJob): boolean {
  return job.cancelled || job.notFound;
}

function isUrlSource(source: string): AlchemySourceMode {
  return /^https?:\/\//i.test(source) ? 'url' : 'upload';
}

/** Every operation the studio knows how to name and render a result for. */
const KNOWN_FORM_NAMES: ReadonlySet<string> = new Set<string>([
  ...ALCHEMY_DATA_FORMS,
  ...ALCHEMY_POST_PROCESSOR_FORMS,
  ...ALCHEMY_ANNOTATION_FORMS,
]);

function isKnownFormName(name: string): name is AlchemyFormName {
  return KNOWN_FORM_NAMES.has(name);
}

/**
 * What an adopted job turned out to have asked for, read off the first status
 * answer. The request itself was made elsewhere, so the horde's own list of
 * forms is the only record of it this browser can have; an operation this
 * version does not know is left out rather than shown as a raw name.
 */
function reportedForms(status: AlchemyStatusResponse): {
  forms: AlchemyFormName[];
  detectors: AnnotationControlType[];
} {
  const forms: AlchemyFormName[] = [];
  const detectors: AnnotationControlType[] = [];
  for (const form of status.forms ?? []) {
    if (!isKnownFormName(form.form)) {
      continue;
    }
    if (!forms.includes(form.form)) {
      forms.push(form.form);
    }
    const detector = form.payload?.control_type;
    if (detector && !detectors.includes(detector)) {
      detectors.push(detector);
    }
  }
  return { forms, detectors };
}

/**
 * Result images the horde has finished but that are neither stored nor written
 * off, so still worth fetching.
 */
function unresolvedImages(job: StoredAlchemyJob): UnresolvedImage[] {
  const settled = new Set([...job.storedResultForms, ...job.failedResultForms]);
  const out: UnresolvedImage[] = [];
  const views = formViews(
    job.status?.forms ?? [],
    storedAnnotationDetectors(job),
  );
  for (const { form, key } of views) {
    if (form.state !== 'done' || settled.has(key)) continue;
    const value = form.result?.[form.form];
    if (typeof value === 'string' && isLikelyImageFileLink(value)) {
      out.push({ key, url: value });
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
 *
 * Every tab runs its own copy of this service over the one shared store. Each
 * local write is announced through {@link TabSyncService} and peers fold it
 * into their state without writing it again. A job's visit runs under a
 * cross-tab lock, so two tabs never both download the same result.
 */
@Injectable({ providedIn: 'root' })
export class AlchemyQueueService {
  private readonly aiHorde = inject(AiHordeService);
  private readonly auth = inject(AuthService);
  private readonly db = inject(AlchemyDbService);
  private readonly toast = inject(ToastService);
  private readonly tabSync = inject(TabSyncService);
  private readonly ngZone = inject(NgZone);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly stored = signal<StoredAlchemyJob[]>([]);
  private readonly imageWrites = signal(0);

  /** Every tracked job, newest first. */
  public readonly jobs = computed<AlchemyJob[]>(() =>
    this.stored().map(toAlchemyJob),
  );

  /**
   * Bumped whenever an image blob is written. The blobs for a submission land
   * just after the job itself does, so a page resolving them needs a signal to
   * retry on rather than a single attempt at first sight.
   */
  public readonly imagesVersion = computed(() => this.imageWrites());

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
  /**
   * Jobs deleted within {@link DELETED_GUARD_MS}, with when. Work already in
   * flight for such a job must not write it back into the store.
   */
  private readonly recentlyDeleted = new Map<string, number>();
  /**
   * Horde ids of deleted jobs, with when. The account goes on listing a request
   * for a while after it was cancelled, and a failed cancel would otherwise
   * bring the deleted job straight back as an adoption.
   */
  private readonly droppedJobIds = new Map<string, number>();

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    // Listening starts before the stored jobs load, so nothing a peer writes
    // while the load is under way is missed.
    this.listenToPeers();
    this.ready = this.initialize();
  }

  /** Resolves once the stored jobs have been loaded into the signal. */
  public whenReady(): Promise<void> {
    return this.ready;
  }

  private async initialize(): Promise<void> {
    try {
      this.mergeLoaded(await this.db.listJobs());
      await this.migrateLegacyJobs();
      this.mergeLoaded(await this.db.listJobs());
      await this.reopenRecoverableImages();
    } catch (error) {
      console.warn('Could not restore stored alchemy jobs.', error);
    }
    // Started regardless: a restore failure should not also stop whatever the
    // user submits next from being followed.
    this.startPolling();
  }

  /**
   * Offer another attempt to result images written off while their link was
   * still alive. A download fails for reasons that have nothing to do with the
   * link (a dropped connection, a reload part-way through the read), and the
   * attempts that exhausted its budget belong to a session that is over. An
   * image with no recorded sighting was written off before that was tracked and
   * stays written off.
   */
  private async reopenRecoverableImages(): Promise<void> {
    const now = Date.now();
    for (const job of this.stored()) {
      if (job.failedResultForms.length === 0) {
        continue;
      }
      const seenAt = job.resultLinkFirstSeenAt ?? {};
      const stillFailed = job.failedResultForms.filter((key) => {
        const firstSeen = seenAt[key];
        return (
          firstSeen === undefined || now - firstSeen > IMAGE_URL_LIFETIME_MS
        );
      });
      if (stillFailed.length === job.failedResultForms.length) {
        continue;
      }
      await this.patch(job.localId, { failedResultForms: stillFailed });
    }
  }

  // --- Submission ----------------------------------------------------------

  /** Submit a request and, when the horde takes it, begin tracking it. */
  public async submit(input: AlchemySubmission): Promise<AlchemySubmitOutcome> {
    const apiKey = this.auth.getStoredApiKey() ?? ANONYMOUS_API_KEY;
    const detectors = input.annotationControlTypes ?? [];
    const request: InterrogationRequest = {
      // A control map is one form per detector: the horde reads each entry on
      // its own and returns a separate result for it.
      forms: input.forms.flatMap((name): InterrogationForm[] =>
        name === 'annotation'
          ? detectors.map((control_type) => ({
              name,
              payload: { control_type },
            }))
          : [{ name }],
      ),
      source_image: input.source,
      slow_workers: input.slowWorkers,
    };

    const result = await firstValueFrom(
      this.aiHorde.submitInterrogation(apiKey, request),
    );
    if (result.kind === 'error') {
      return { kind: 'refused', error: result.error };
    }
    const response = result.response;

    const now = Date.now();
    const sourceMode = isUrlSource(input.source);
    const job: StoredAlchemyJob = {
      localId: randomUuid(),
      jobId: response.id,
      createdAt: now,
      updatedAt: now,
      forms: input.forms,
      annotationControlTypes: input.forms.includes('annotation')
        ? detectors
        : undefined,
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
    this.tabSync.publish('alchemy-job.added', job);
    // Off the submit path: a URL source needs no work, and a canvas encode of a
    // multi-megabyte upload should not hold up the job appearing on screen.
    void this.storeSourceImages(job, input);
    return { kind: 'submitted', id: response.id };
  }

  /**
   * Take over alchemy requests the account reports as running that this browser
   * holds no record of: one submitted from another device, or one whose submit
   * landed after a reload took the page away. An adopted job starts with no
   * operations recorded and no source image, and the poll loop visits it like
   * any other. Ids already held are skipped, so this is safe to run on every
   * read of the account record. So are ids of jobs deleted here a moment ago.
   */
  public async adoptActive(ids: readonly string[]): Promise<void> {
    this.pruneDeleted();
    const known = new Set(this.stored().map((job) => job.jobId));
    for (const jobId of ids) {
      if (known.has(jobId) || this.droppedJobIds.has(jobId)) {
        continue;
      }
      // A peer tab may have taken this id over while an earlier adoption here
      // was being written.
      if (this.stored().some((job) => job.jobId === jobId)) {
        continue;
      }
      known.add(jobId);
      const now = Date.now();
      const job: StoredAlchemyJob = {
        localId: randomUuid(),
        jobId,
        createdAt: now,
        updatedAt: now,
        adopted: true,
        // Neither the operations nor the source image are knowable from an id;
        // the first status answer fills the operations in.
        forms: [],
        slowWorkers: false,
        sourceMode: 'none',
        status: null,
        done: false,
        faulted: false,
        cancelled: false,
        notFound: false,
        storedResultForms: [],
        failedResultForms: [],
      };
      await this.db.putJob(job);
      this.ngZone.run(() => this.stored.update((jobs) => [job, ...jobs]));
      this.tabSync.publish('alchemy-job.added', job);
    }
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
    } catch (error) {
      console.warn('Could not store the alchemy source image.', error);
    }
  }

  // --- Polling -------------------------------------------------------------

  private startPolling(): void {
    this.ngZone.runOutsideAngular(() => {
      this.pollTimer = setInterval(() => {
        void this.pollTick();
      }, ALCHEMY_POLL_INTERVAL_MS);
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

  private readonly needsVisit = (job: StoredAlchemyJob): boolean =>
    !isJobSettled(toAlchemyJob(job)) || unresolvedImages(job).length > 0;

  private async pollTick(): Promise<void> {
    if (this.pollRunning) {
      return;
    }
    // A tab nobody is looking at cannot act on what a status answer says, and a
    // phone that backgrounded the page may hold the timer for minutes before
    // firing it. Visits wait for the tab to come back, where one runs at once.
    if (this.document.visibilityState === 'hidden') {
      return;
    }
    this.pollRunning = true;
    try {
      for (const job of this.stored().filter(this.needsVisit)) {
        await this.tabSync.exclusive(`alchemy-visit:${job.localId}`, () =>
          this.visitIfStillDue(job.localId),
        );
      }
    } finally {
      this.pollRunning = false;
    }
  }

  /**
   * Visit a job unless the store says there is nothing left to do. The tick
   * walks a snapshot, and a peer tab may have deleted the job, or settled it
   * and taken its images, since then.
   */
  private async visitIfStillDue(localId: string): Promise<void> {
    const job = await this.freshRow(localId);
    if (job && this.needsVisit(job)) {
      await this.visit(job);
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
      const patched = await this.patch(job.localId, {
        lastPolledAt: Date.now(),
        ...(status
          ? {
              status,
              done: status.state === 'done',
              faulted: status.state === 'faulted',
              ...this.adoptedFormsPatch(job, status),
            }
          : {}),
      });
      if (!patched) {
        return;
      }
      current = patched;
    }
    await this.harvestResultImages(current);
  }

  /**
   * Record what an adopted job asked for, once the horde has said. The
   * checklist and the progress count are built from `forms`, so until this
   * lands such a job reads as having no operations at all.
   */
  private adoptedFormsPatch(
    job: StoredAlchemyJob,
    status: AlchemyStatusResponse,
  ): Partial<StoredAlchemyJob> {
    if (!job.adopted || job.forms.length > 0) {
      return {};
    }
    const { forms, detectors } = reportedForms(status);
    if (forms.length === 0) {
      return {};
    }
    return {
      forms,
      ...(detectors.length > 0 ? { annotationControlTypes: detectors } : {}),
    };
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

    const now = Date.now();
    const seenAt: Record<string, number> = {
      ...(job.resultLinkFirstSeenAt ?? {}),
    };
    const live: UnresolvedImage[] = [];
    const expired: string[] = [];
    for (const image of outstanding) {
      const firstSeenAt = (seenAt[image.key] ??= now);
      // Past the link's own lifetime there is nothing left to fetch, so the
      // form is written off rather than spending a request to discover that.
      // Measured from the link, not the request: a job can wait in the queue
      // for longer than its results will stay reachable.
      if (now - firstSeenAt > IMAGE_URL_LIFETIME_MS) {
        expired.push(image.key);
      } else {
        live.push(image);
      }
    }

    // Recorded before anything is fetched, so a reload part-way through goes on
    // measuring each link from when it was published rather than restarting the
    // clock.
    const recorded = await this.patch(job.localId, {
      resultLinkFirstSeenAt: seenAt,
      ...(expired.length
        ? { failedResultForms: [...job.failedResultForms, ...expired] }
        : {}),
    });
    if (!recorded || live.length === 0) {
      return;
    }

    const stored: string[] = [];
    const failed: string[] = [];
    await Promise.all(
      live.map(async (image) => {
        const attemptKey = `${job.localId}::${image.key}`;
        try {
          // The result card shows the link in an <img> before the bytes are
          // stored, and that load caches a response without CORS headers; a
          // fetch served from that entry is refused, so it bypasses the cache.
          const response = await fetch(image.url, { cache: 'no-store' });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const blob = await response.blob();
          await this.putImage({
            localId: job.localId,
            imageId: image.key,
            kind: 'result',
            blob,
            mimeType: blob.type || 'image/webp',
            sourceUrl: image.url,
            fetchedAt: Date.now(),
          });
          this.imageAttempts.delete(attemptKey);
          // The small copy is a convenience, so it never holds the result's
          // own bookkeeping up and its absence is never a failure.
          void this.storeResultThumb(job.localId, image.key, blob);
          stored.push(image.key);
        } catch (error) {
          if (this.isQuotaError(error)) {
            this.reportQuotaExhausted();
            failed.push(image.key);
            return;
          }
          const attempts = (this.imageAttempts.get(attemptKey) ?? 0) + 1;
          this.imageAttempts.set(attemptKey, attempts);
          // A silently dropped image is hard to account for later, and the
          // reason (an expired link, a blocked read, a failed write) decides
          // whether anything can be done about it.
          console.warn(
            `Alchemy result image for ${image.key} could not be saved (attempt ${attempts}).`,
            error,
          );
          if (attempts >= MAX_IMAGE_ATTEMPTS) {
            this.imageAttempts.delete(attemptKey);
            failed.push(image.key);
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
    if (patched) {
      await this.harvestResultImages(patched);
    }
  }

  /**
   * Delete jobs and their stored images. A job the horde is still working on
   * is cancelled there first, so it stops spending kudos and does not come
   * back through the account's list of active generations.
   */
  public async deleteJobs(localIds: readonly string[]): Promise<void> {
    const doomed = new Set(localIds);
    if (doomed.size === 0) {
      return;
    }
    const jobs = this.stored().filter((job) => doomed.has(job.localId));
    // Marked before anything is awaited, so a visit that lands during the
    // cancel or the delete cannot write a row back.
    for (const localId of doomed) {
      this.markDeleted(localId, this.find(localId)?.jobId);
    }
    await Promise.all(jobs.map((job) => this.cancelOnHorde(job)));
    this.ngZone.run(() =>
      this.stored.update((held) => held.filter((j) => !doomed.has(j.localId))),
    );
    await Promise.all([...doomed].map((id) => this.db.deleteJobCascade(id)));
    for (const localId of doomed) {
      this.forgetAttempts(localId);
      const jobId = jobs.find((job) => job.localId === localId)?.jobId;
      this.tabSync.publish('alchemy-job.deleted', {
        localId,
        ...(jobId ? { hordeId: jobId } : {}),
      });
    }
  }

  /**
   * Drop every tracked job, cancelling on the horde any that are still
   * running. Reached only from the storage management surface.
   */
  public async clearHistory(): Promise<void> {
    const jobs = this.stored();
    for (const job of jobs) {
      this.markDeleted(job.localId, job.jobId);
    }
    await Promise.all(jobs.map((job) => this.cancelOnHorde(job)));
    await this.db.clearAll();
    this.ngZone.run(() => this.stored.set([]));
    this.imageAttempts.clear();
    this.tabSync.publish('alchemy-job.cleared', { clearedAt: Date.now() });
  }

  /**
   * Cancel an unsettled job's request on the way to deleting it. A failure is
   * only logged: the delete goes ahead, and the deleted-id guard keeps the
   * request from being adopted back while the account lists it.
   */
  private async cancelOnHorde(job: StoredAlchemyJob): Promise<void> {
    if (isJobSettled(toAlchemyJob(job))) {
      return;
    }
    try {
      await firstValueFrom(this.aiHorde.cancelInterrogation(job.jobId));
    } catch (error) {
      console.warn('Could not cancel a deleted alchemy request:', error);
    }
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

  /**
   * The small copies of a request's results, after making any that are
   * missing: results captured before small copies were kept get theirs the
   * first time a surface asks. A result that cannot be drawn is left out.
   */
  public async getResultThumbs(localId: string): Promise<StoredAlchemyImage[]> {
    if (!this.isBrowser) {
      return [];
    }
    const images = await this.db.getImagesForJob(localId);
    const thumbs = new Map(
      images
        .filter((image) => image.kind === 'result-thumb')
        .map((image) => [image.imageId, image]),
    );
    for (const result of images) {
      if (result.kind !== 'result') continue;
      const thumbId = resultThumbImageId(result.imageId);
      if (thumbs.has(thumbId)) continue;
      const thumb = await this.storeResultThumb(
        localId,
        result.imageId,
        result.blob,
      );
      if (thumb) thumbs.set(thumbId, thumb);
    }
    return [...thumbs.values()];
  }

  private async storeResultThumb(
    localId: string,
    resultKey: string,
    blob: Blob,
  ): Promise<StoredAlchemyImage | null> {
    try {
      const dataUrl = await blobToThumbnailDataUrl(blob);
      if (!dataUrl?.startsWith('data:')) return null;
      const thumb: StoredAlchemyImage = {
        localId,
        imageId: resultThumbImageId(resultKey),
        kind: 'result-thumb',
        blob: base64ToBlob(stripDataUrlPrefix(dataUrl), 'image/webp'),
        mimeType: 'image/webp',
      };
      await this.putImage(thumb);
      return thumb;
    } catch (error) {
      console.warn('Could not keep a small copy of an alchemy result.', error);
      return null;
    }
  }

  // --- State ---------------------------------------------------------------

  private find(localId: string): StoredAlchemyJob | undefined {
    return this.stored().find((job) => job.localId === localId);
  }

  /**
   * Apply a change to a job in memory and on disk, tell the other tabs, and
   * return the result. Returns null without writing for a job that is gone or
   * was deleted, since the caller is work that was already in flight when it
   * went.
   */
  private async patch(
    localId: string,
    update: Partial<StoredAlchemyJob>,
  ): Promise<StoredAlchemyJob | null> {
    if (this.isDeleted(localId)) {
      return null;
    }
    const current = this.find(localId);
    if (!current) {
      return null;
    }
    const next: StoredAlchemyJob = {
      ...current,
      ...update,
      updatedAt: Date.now(),
    };
    this.ngZone.run(() =>
      this.stored.update((jobs) =>
        jobs.map((job) => (job.localId === localId ? next : job)),
      ),
    );
    await this.db.putJob(next);
    if (this.isDeleted(localId)) {
      return null;
    }
    this.tabSync.publish(
      next.cancelled && !current.cancelled
        ? 'alchemy-job.cancelled'
        : 'alchemy-job.changed',
      next,
    );
    return next;
  }

  private async putImage(image: StoredAlchemyImage): Promise<void> {
    if (this.isDeleted(image.localId)) {
      return;
    }
    await this.db.putImage(image);
    if (this.isDeleted(image.localId)) {
      // Deleted while the bytes were being written, so the delete may have
      // run before they landed.
      await this.db.deleteJobCascade(image.localId);
      return;
    }
    this.ngZone.run(() => this.imageWrites.update((n) => n + 1));
  }

  // --- Other tabs ----------------------------------------------------------

  private listenToPeers(): void {
    const onRow = (job: StoredAlchemyJob): void => this.acceptRow(job);
    for (const topic of [
      'alchemy-job.added',
      'alchemy-job.changed',
      'alchemy-job.cancelled',
    ] as const) {
      this.tabSync
        .on(topic)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(onRow);
    }
    this.tabSync
      .on('alchemy-job.deleted')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((deletion) => this.acceptDeletion(deletion));
    this.tabSync
      .on('alchemy-job.cleared')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        for (const job of this.stored()) {
          this.markDeleted(job.localId, job.jobId);
        }
        this.imageAttempts.clear();
        this.ngZone.run(() => this.stored.set([]));
      });
  }

  /**
   * Fold a row another tab wrote, or the stored copy of one, into this tab's
   * state. The store already holds it, so nothing is written back, with one
   * exception: a row that would reopen a job this tab holds as stopped is
   * refused, and the stopped row is written again so the store ends on it.
   * That is a peer's status answer overtaking a cancel it had not yet heard of.
   */
  private acceptRow(incoming: StoredAlchemyJob): void {
    if (this.isDeleted(incoming.localId)) {
      return;
    }
    const held = this.find(incoming.localId);
    if (held === undefined) {
      if (this.yieldsToHeldAdoption(incoming)) {
        return;
      }
      this.insertInState(incoming);
      return;
    }
    const heldStopped = isStopped(held);
    const incomingStopped = isStopped(incoming);
    if (heldStopped && !incomingStopped) {
      if (incoming.updatedAt >= held.updatedAt) {
        void this.patch(held.localId, {});
      }
      return;
    }
    if (
      incoming !== held &&
      ((incomingStopped && !heldStopped) ||
        incoming.updatedAt >= held.updatedAt)
    ) {
      this.ngZone.run(() =>
        this.stored.update((jobs) =>
          jobs.map((job) =>
            job.localId === incoming.localId ? incoming : job,
          ),
        ),
      );
    }
  }

  /**
   * Two tabs reading the account at once can each adopt the same request under
   * a different local id. Every tab keeps the same one of the pair (a job
   * submitted here over an adopted one, otherwise the lower id) and the store
   * loses the other. Returns whether the incoming row is the one dropped.
   */
  private yieldsToHeldAdoption(incoming: StoredAlchemyJob): boolean {
    const twin = this.stored().find(
      (job) => job.jobId === incoming.jobId && job.localId !== incoming.localId,
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

  /**
   * The stored copy of a job, folded into this tab's state. Falls back to the
   * in-memory copy when the store cannot be read, and reports a job gone from
   * the store as deleted.
   */
  private async freshRow(
    localId: string,
  ): Promise<StoredAlchemyJob | undefined> {
    let stored: StoredAlchemyJob | undefined;
    try {
      stored = await this.db.getJob(localId);
    } catch {
      return this.find(localId);
    }
    if (!stored) {
      this.markDeleted(localId, this.find(localId)?.jobId);
      this.forgetLocally(localId);
      return undefined;
    }
    this.acceptRow(stored);
    return this.find(localId);
  }

  /** Merge the stored jobs into whatever peers announced during the load. */
  private mergeLoaded(jobs: StoredAlchemyJob[]): void {
    if (this.stored().length === 0) {
      this.stored.set(jobs.filter((job) => !this.isDeleted(job.localId)));
      return;
    }
    for (const job of jobs) {
      this.acceptRow(job);
    }
  }

  private markDeleted(localId: string, jobId?: string): void {
    this.pruneDeleted();
    const now = Date.now();
    this.recentlyDeleted.set(localId, now);
    if (jobId) {
      this.droppedJobIds.set(jobId, now);
    }
  }

  private isDeleted(localId: string): boolean {
    this.pruneDeleted();
    return this.recentlyDeleted.has(localId);
  }

  private pruneDeleted(): void {
    const cutoff = Date.now() - DELETED_GUARD_MS;
    for (const guard of [this.recentlyDeleted, this.droppedJobIds]) {
      for (const [key, at] of guard) {
        if (at <= cutoff) {
          guard.delete(key);
        }
      }
    }
  }

  /** Drop a job from memory along with the download attempts kept for it. */
  private forgetLocally(localId: string): void {
    this.forgetAttempts(localId);
    this.ngZone.run(() =>
      this.stored.update((jobs) => jobs.filter((j) => j.localId !== localId)),
    );
  }

  private forgetAttempts(localId: string): void {
    const prefix = `${localId}::`;
    for (const key of this.imageAttempts.keys()) {
      if (key.startsWith(prefix)) {
        this.imageAttempts.delete(key);
      }
    }
  }

  /** Place a job among the others, which are held newest first. */
  private insertInState(job: StoredAlchemyJob): void {
    this.ngZone.run(() =>
      this.stored.update((jobs) => {
        const at = jobs.findIndex((other) => other.createdAt < job.createdAt);
        return at === -1
          ? [...jobs, job]
          : [...jobs.slice(0, at), job, ...jobs.slice(at)];
      }),
    );
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
    const localId = randomUuid();
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
