import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DBSchema, IDBPDatabase } from 'idb';
import { StudioUpgradeTransaction, openStudioDb } from './idb-open';
import {
  LocalGenerationJob,
  GenerationResultSelection,
  GenerationResultState,
  resultPlaceholderIndices,
  withGenerationResultState,
  LocalGenerationJobStatus,
  StoredJobImage,
  StoredPromptCheck,
  StoredSourceDraft,
} from '../types/generation-job';

const DB_NAME = 'ai-horde-frontpage';
const DB_VERSION = 4;
const JOBS_STORE = 'generationJobs';
const IMAGES_STORE = 'generationImages';
const SOURCE_DRAFTS_STORE = 'sourceDrafts';
const RESULT_STATE_STORE = 'generationResultState';

/** Statuses considered terminal for retention/pruning. */
const TERMINAL_STATUSES: readonly LocalGenerationJobStatus[] = [
  'done',
  'error',
  'cancelled',
];

const DEFAULT_RETENTION = 50;

interface GenerationDbSchema extends DBSchema {
  [RESULT_STATE_STORE]: { key: string; value: GenerationResultState };
  [JOBS_STORE]: {
    key: string;
    value: LocalGenerationJob;
    indexes: { status: LocalGenerationJobStatus; createdAt: number };
  };
  [IMAGES_STORE]: {
    key: [string, string];
    value: StoredJobImage;
    indexes: { localId: string };
  };
  [SOURCE_DRAFTS_STORE]: {
    key: string;
    value: StoredSourceDraft;
  };
}

type UpgradeTransaction = StudioUpgradeTransaction<GenerationDbSchema>;

/**
 * Create the object stores and indexes this service depends on, tolerating a
 * partially-provisioned database. Runs inside the version-change transaction so
 * an already-present store can still gain a missing index without being dropped.
 */
function ensureSchema(
  db: IDBPDatabase<GenerationDbSchema>,
  tx: UpgradeTransaction,
): void {
  if (!db.objectStoreNames.contains(RESULT_STATE_STORE)) {
    db.createObjectStore(RESULT_STATE_STORE, { keyPath: 'localId' });
  }
  if (!db.objectStoreNames.contains(JOBS_STORE)) {
    const jobs = db.createObjectStore(JOBS_STORE, { keyPath: 'localId' });
    jobs.createIndex('status', 'status');
    jobs.createIndex('createdAt', 'createdAt');
  } else {
    const jobs = tx.objectStore(JOBS_STORE);
    if (!jobs.indexNames.contains('status')) {
      jobs.createIndex('status', 'status');
    }
    if (!jobs.indexNames.contains('createdAt')) {
      jobs.createIndex('createdAt', 'createdAt');
    }
  }

  if (!db.objectStoreNames.contains(IMAGES_STORE)) {
    const images = db.createObjectStore(IMAGES_STORE, {
      keyPath: ['localId', 'imageId'],
    });
    images.createIndex('localId', 'localId');
  } else {
    const images = tx.objectStore(IMAGES_STORE);
    if (!images.indexNames.contains('localId')) {
      images.createIndex('localId', 'localId');
    }
  }

  if (!db.objectStoreNames.contains(SOURCE_DRAFTS_STORE)) {
    db.createObjectStore(SOURCE_DRAFTS_STORE, { keyPath: 'id' });
  }
}

/**
 * Pictures a finished job accounts for without a stored image: each one keeps
 * a placeholder tile in the results grid, so every count of pictures adds
 * them to the stored results.
 */
export function placeholderPictureCount(job: LocalGenerationJob): number {
  return (job.csamCensoredCount ?? 0) + (job.fetchFailedCount ?? 0);
}

/**
 * Whether an opened database carries the stores this service cannot work
 * without. The source-draft store is deliberately not among them: a database
 * adopted from another build can lack it, and an attachment the reader can put
 * back by hand is not worth discarding their generation history for.
 */
function hasRequiredStores(db: IDBPDatabase<GenerationDbSchema>): boolean {
  return (
    db.objectStoreNames.contains(JOBS_STORE) &&
    db.objectStoreNames.contains(IMAGES_STORE)
  );
}

/**
 * IndexedDB persistence for locally-tracked generation jobs, their image blobs,
 * and the picture attached to the studio while nothing has been sent yet.
 * Browser-only: on the server every method is a no-op returning an empty
 * result, so callers can invoke it unconditionally during SSR.
 */
@Injectable({ providedIn: 'root' })
export class GenerationDbService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private dbPromise: Promise<IDBPDatabase<GenerationDbSchema>> | null = null;

  private db(): Promise<IDBPDatabase<GenerationDbSchema>> {
    // Memoizing the open promise makes recovery race-safe: concurrent callers
    // all await the single in-flight open, so a wipe-and-recreate happens once.
    this.dbPromise ??= this.openWithRecovery();
    return this.dbPromise;
  }

  private async openWithRecovery(): Promise<IDBPDatabase<GenerationDbSchema>> {
    const options = {
      name: DB_NAME,
      version: DB_VERSION,
      ensureSchema,
      hasRequiredStores,
      historyLabel: 'generation history',
    };
    let db = await openStudioDb<GenerationDbSchema>(options);
    if (!db.objectStoreNames.contains(RESULT_STATE_STORE)) {
      // A compatible database from another build must gain this store without
      // discarding its existing jobs, images or unfamiliar stores.
      const version = db.version + 1;
      db.close();
      db = await openStudioDb<GenerationDbSchema>({ ...options, version });
    }
    db.addEventListener('versionchange', () => {
      db.close();
      this.dbPromise = null;
    });
    return db;
  }

  public async putJob(
    job: LocalGenerationJob,
  ): Promise<LocalGenerationJob | undefined> {
    if (!this.isBrowser) return undefined;
    const db = await this.db();
    const tx = db.transaction([JOBS_STORE, RESULT_STATE_STORE], 'readwrite');
    const state = await tx.objectStore(RESULT_STATE_STORE).get(job.localId);
    if (state?.deleted) {
      await tx.done;
      return undefined;
    }
    const jobs = tx.objectStore(JOBS_STORE);
    const held = await jobs.get(job.localId);
    let updated = job;
    if (job.status === 'done' || held?.status === 'done') {
      updated = {
        ...job,
        completedAt:
          held?.completedAt ??
          (held?.status === 'done'
            ? held.updatedAt
            : (job.completedAt ?? job.updatedAt)),
      };
    }
    if (state) updated = withGenerationResultState(updated, state);
    await jobs.put(updated);
    await tx.done;
    return updated;
  }

  public async getJob(
    localId: string,
  ): Promise<LocalGenerationJob | undefined> {
    if (!this.isBrowser) {
      return undefined;
    }
    const db = await this.db();
    return db.get(JOBS_STORE, localId);
  }

  /** All jobs, newest first. */
  public async listJobs(): Promise<LocalGenerationJob[]> {
    if (!this.isBrowser) {
      return [];
    }
    const db = await this.db();
    const jobs = await db.getAll(JOBS_STORE);
    return jobs.sort((a, b) => b.createdAt - a.createdAt);
  }

  public async listJobsByStatus(
    status: LocalGenerationJobStatus,
  ): Promise<LocalGenerationJob[]> {
    if (!this.isBrowser) {
      return [];
    }
    const db = await this.db();
    const jobs = await db.getAllFromIndex(JOBS_STORE, 'status', status);
    return jobs.sort((a, b) => b.createdAt - a.createdAt);
  }

  /** The `limit` most recent jobs. */
  public async listJobsByRecency(limit: number): Promise<LocalGenerationJob[]> {
    const jobs = await this.listJobs();
    return jobs.slice(0, limit);
  }

  public async putImage(image: StoredJobImage): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const db = await this.db();
    const tx = db.transaction([IMAGES_STORE, RESULT_STATE_STORE], 'readwrite');
    const state = await tx.objectStore(RESULT_STATE_STORE).get(image.localId);
    if (
      !state?.deleted &&
      !(
        state &&
        image.kind === 'result' &&
        !state.resultImageIds.includes(image.imageId)
      )
    ) {
      await tx.objectStore(IMAGES_STORE).put(image);
    }
    await tx.done;
  }

  public async getImage(
    localId: string,
    imageId: string,
  ): Promise<StoredJobImage | undefined> {
    if (!this.isBrowser) {
      return undefined;
    }
    const db = await this.db();
    return db.get(IMAGES_STORE, [localId, imageId]);
  }

  /**
   * Write a reading onto one stored picture. The record is read and written in
   * one transaction because the bytes are the largest thing in the store and a
   * read-modify-write around them would otherwise be a chance to lose them.
   * Answers the record as it now stands, or undefined when there is none.
   */
  public async updateImagePromptCheck(
    localId: string,
    imageId: string,
    promptCheck: StoredPromptCheck,
  ): Promise<StoredJobImage | undefined> {
    if (!this.isBrowser) {
      return undefined;
    }
    const db = await this.db();
    const tx = db.transaction(IMAGES_STORE, 'readwrite');
    const store = tx.objectStore(IMAGES_STORE);
    const image = await store.get([localId, imageId]);
    if (!image) {
      await tx.done;
      return undefined;
    }
    const updated: StoredJobImage = { ...image, promptCheck };
    await store.put(updated);
    await tx.done;
    return updated;
  }

  public async getImagesForJob(localId: string): Promise<StoredJobImage[]> {
    if (!this.isBrowser) {
      return [];
    }
    const db = await this.db();
    return db.getAllFromIndex(IMAGES_STORE, 'localId', localId);
  }

  /**
   * Keep the picture currently attached to the studio under `draft.id`, so the
   * bench is found as it was left. One record per id, overwritten in place.
   */
  public async putSourceDraft(draft: StoredSourceDraft): Promise<void> {
    const db = await this.draftDb();
    await db?.put(SOURCE_DRAFTS_STORE, draft);
  }

  public async getSourceDraft(
    id: string,
  ): Promise<StoredSourceDraft | undefined> {
    const db = await this.draftDb();
    return db?.get(SOURCE_DRAFTS_STORE, id);
  }

  /** Forget a stored attachment. Called where the reader detaches one. */
  public async deleteSourceDraft(id: string): Promise<void> {
    const db = await this.draftDb();
    await db?.delete(SOURCE_DRAFTS_STORE, id);
  }

  /**
   * The database while it carries the draft store, else null. Also null where
   * there is no IndexedDB at all, so a caller keeping a draft can call
   * unconditionally.
   */
  private async draftDb(): Promise<IDBPDatabase<GenerationDbSchema> | null> {
    if (!this.isBrowser || typeof indexedDB === 'undefined') {
      return null;
    }
    const db = await this.db();
    return db.objectStoreNames.contains(SOURCE_DRAFTS_STORE) ? db : null;
  }

  /** Delete a job and every image blob attached to it in one transaction. */
  public async deleteJobCascade(localId: string): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const db = await this.db();
    const tx = db.transaction(
      [JOBS_STORE, IMAGES_STORE, RESULT_STATE_STORE],
      'readwrite',
    );
    const states = tx.objectStore(RESULT_STATE_STORE);
    const state = await states.get(localId);
    if (state) await states.put({ ...state, deleted: true });
    await tx.objectStore(JOBS_STORE).delete(localId);
    const imageStore = tx.objectStore(IMAGES_STORE);
    const imageKeys = await imageStore.index('localId').getAllKeys(localId);
    await Promise.all(imageKeys.map((key) => imageStore.delete(key)));
    await tx.done;
  }

  /** Null means the last result and its job were removed together. */
  public async deleteResults(
    localId: string,
    selection: GenerationResultSelection,
  ): Promise<LocalGenerationJob | null | undefined> {
    if (!this.isBrowser) return undefined;
    const db = await this.db();
    const tx = db.transaction(
      [JOBS_STORE, IMAGES_STORE, RESULT_STATE_STORE],
      'readwrite',
    );
    try {
      const jobs = tx.objectStore(JOBS_STORE);
      const images = tx.objectStore(IMAGES_STORE);
      const states = tx.objectStore(RESULT_STATE_STORE);
      const job = await jobs.get(localId);
      if (!job || job.status !== 'done') {
        await tx.done;
        return undefined;
      }
      const selected = new Set(selection.imageIds);
      const censored = resultPlaceholderIndices(job, 'censored');
      const failed = resultPlaceholderIndices(job, 'fetch-failed');
      const censoredSelection = new Set(selection.censoredIndices);
      const failedSelection = new Set(selection.fetchFailedIndices);
      if (
        !job.resultImageIds.some((id) => selected.has(id)) &&
        !censored.some((id) => censoredSelection.has(id)) &&
        !failed.some((id) => failedSelection.has(id))
      ) {
        await tx.done;
        return job;
      }
      const state: GenerationResultState = {
        localId,
        resultRevision: (job.resultRevision ?? 0) + 1,
        resultImageIds: job.resultImageIds.filter((id) => !selected.has(id)),
        censoredResultIndices: censored.filter(
          (id) => !censoredSelection.has(id),
        ),
        fetchFailedResultIndices: failed.filter(
          (id) => !failedSelection.has(id),
        ),
        completedAt: job.completedAt ?? job.updatedAt,
        updatedAt: Math.max(Date.now(), job.updatedAt + 1),
        deleted: false,
      };
      const updated = withGenerationResultState(job, state);
      const empty =
        updated.resultImageIds.length + placeholderPictureCount(updated) === 0;
      await states.put({ ...state, deleted: empty });
      if (empty) {
        await jobs.delete(localId);
        const keys = await images.index('localId').getAllKeys(localId);
        await Promise.all(keys.map((key) => images.delete(key)));
      } else {
        await jobs.put(updated);
        await Promise.all(
          job.resultImageIds
            .filter((id) => selected.has(id))
            .map((id) => images.delete([localId, id])),
        );
      }
      await tx.done;
      return empty ? null : updated;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* The transaction may already have aborted. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  }

  /** How many jobs are stored, for the storage management surface. */
  public async countJobs(): Promise<number> {
    if (!this.isBrowser) {
      return 0;
    }
    const db = await this.db();
    return db.count(JOBS_STORE);
  }

  /**
   * How many pictures the stored image generations hold, counted the way the
   * results grid lays out tiles: every saved result image, plus one for each
   * picture a finished job kept only as a placeholder (held back by the
   * filter, or finished by the horde but never downloaded). Read in one
   * transaction so a delete landing between the two stores cannot skew it.
   */
  public async countResultPictures(): Promise<number> {
    if (!this.isBrowser) {
      return 0;
    }
    const db = await this.db();
    const tx = db.transaction([JOBS_STORE, IMAGES_STORE], 'readonly');
    let count = 0;
    let cursor = await tx.objectStore(IMAGES_STORE).openCursor();
    while (cursor) {
      if (cursor.value.kind === 'result') {
        count++;
      }
      cursor = await cursor.continue();
    }
    const done = await tx
      .objectStore(JOBS_STORE)
      .index('status')
      .getAll('done');
    for (const job of done) {
      count += placeholderPictureCount(job);
    }
    await tx.done;
    return count;
  }

  /**
   * Drop every stored job and image blob. Reached only from the explicit
   * storage management surface; nothing in the app calls this on its own.
   */
  public async clearAll(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const db = await this.db();
    const tx = db.transaction(
      [JOBS_STORE, IMAGES_STORE, RESULT_STATE_STORE],
      'readwrite',
    );
    const states = tx.objectStore(RESULT_STATE_STORE);
    for (const state of await states.getAll()) {
      await states.put({ ...state, deleted: true });
    }
    await Promise.all([
      tx.objectStore(JOBS_STORE).clear(),
      tx.objectStore(IMAGES_STORE).clear(),
    ]);
    await tx.done;
  }

  /**
   * Keep at most `keep` terminal (done/error/cancelled) jobs, deleting the
   * oldest beyond that count together with their image blobs. In-flight jobs are
   * never pruned.
   *
   * Deliberately uncalled: stored results are only ever deleted by an explicit
   * user action, so nothing may wire this to a lifecycle hook or a threshold.
   */
  public async pruneFinishedJobs(keep = DEFAULT_RETENTION): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const jobs = await this.listJobs();
    const terminal = jobs
      .filter((job) => TERMINAL_STATUSES.includes(job.status))
      .sort((a, b) => a.createdAt - b.createdAt);
    const excess = terminal.length - keep;
    if (excess <= 0) {
      return;
    }
    const doomed = terminal.slice(0, excess);
    await Promise.all(doomed.map((job) => this.deleteJobCascade(job.localId)));
  }
}
