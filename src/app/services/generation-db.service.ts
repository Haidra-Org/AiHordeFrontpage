import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DBSchema, IDBPDatabase } from 'idb';
import { StudioUpgradeTransaction, openStudioDb } from './idb-open';
import {
  LocalGenerationJob,
  LocalGenerationJobStatus,
  StoredJobImage,
} from '../types/generation-job';

const DB_NAME = 'ai-horde-frontpage';
const DB_VERSION = 2;
const JOBS_STORE = 'generationJobs';
const IMAGES_STORE = 'generationImages';

/** Statuses considered terminal for retention/pruning. */
const TERMINAL_STATUSES: readonly LocalGenerationJobStatus[] = [
  'done',
  'error',
  'cancelled',
];

const DEFAULT_RETENTION = 50;

interface GenerationDbSchema extends DBSchema {
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
}

/** Whether an opened database carries both stores this service requires. */
function hasRequiredStores(db: IDBPDatabase<GenerationDbSchema>): boolean {
  return (
    db.objectStoreNames.contains(JOBS_STORE) &&
    db.objectStoreNames.contains(IMAGES_STORE)
  );
}

/**
 * IndexedDB persistence for locally-tracked generation jobs and their image
 * blobs. Browser-only: on the server every method is a no-op returning an empty
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

  private openWithRecovery(): Promise<IDBPDatabase<GenerationDbSchema>> {
    return openStudioDb<GenerationDbSchema>({
      name: DB_NAME,
      version: DB_VERSION,
      ensureSchema,
      hasRequiredStores,
      historyLabel: 'generation history',
    });
  }

  public async putJob(job: LocalGenerationJob): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const db = await this.db();
    await db.put(JOBS_STORE, job);
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
    await db.put(IMAGES_STORE, image);
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

  public async getImagesForJob(localId: string): Promise<StoredJobImage[]> {
    if (!this.isBrowser) {
      return [];
    }
    const db = await this.db();
    return db.getAllFromIndex(IMAGES_STORE, 'localId', localId);
  }

  /** Delete a job and every image blob attached to it in one transaction. */
  public async deleteJobCascade(localId: string): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const db = await this.db();
    const tx = db.transaction([JOBS_STORE, IMAGES_STORE], 'readwrite');
    await tx.objectStore(JOBS_STORE).delete(localId);
    const imageStore = tx.objectStore(IMAGES_STORE);
    const imageKeys = await imageStore.index('localId').getAllKeys(localId);
    await Promise.all(imageKeys.map((key) => imageStore.delete(key)));
    await tx.done;
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
   * Drop every stored job and image blob. Reached only from the explicit
   * storage management surface; nothing in the app calls this on its own.
   */
  public async clearAll(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const db = await this.db();
    const tx = db.transaction([JOBS_STORE, IMAGES_STORE], 'readwrite');
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
