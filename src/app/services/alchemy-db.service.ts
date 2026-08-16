import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DBSchema, IDBPDatabase } from 'idb';
import { StudioUpgradeTransaction, openStudioDb } from './idb-open';
import { StoredAlchemyImage, StoredAlchemyJob } from '../types/alchemy-job';

/**
 * Alchemy lives in its own database rather than alongside generation history.
 * Adding stores to the generation database would mean opening it at a higher
 * version, and any older bundle that later met it would fail with a VersionError
 * and, on builds predating the adopt-don't-delete recovery, destroy every stored
 * image. A separate database keeps that history out of the blast radius.
 */
const DB_NAME = 'ai-horde-frontpage-alchemy';
const DB_VERSION = 1;
const JOBS_STORE = 'alchemyJobs';
const IMAGES_STORE = 'alchemyImages';

interface AlchemyDbSchema extends DBSchema {
  [JOBS_STORE]: {
    key: string;
    value: StoredAlchemyJob;
    indexes: { createdAt: number; jobId: string };
  };
  [IMAGES_STORE]: {
    key: [string, string];
    value: StoredAlchemyImage;
    indexes: { localId: string };
  };
}

type UpgradeTransaction = StudioUpgradeTransaction<AlchemyDbSchema>;

/**
 * Create the object stores and indexes this service depends on, tolerating a
 * partially-provisioned database. Runs inside the version-change transaction so
 * an already-present store can still gain a missing index without being dropped.
 */
function ensureSchema(
  db: IDBPDatabase<AlchemyDbSchema>,
  tx: UpgradeTransaction,
): void {
  if (!db.objectStoreNames.contains(JOBS_STORE)) {
    const jobs = db.createObjectStore(JOBS_STORE, { keyPath: 'localId' });
    jobs.createIndex('createdAt', 'createdAt');
    jobs.createIndex('jobId', 'jobId');
  } else {
    const jobs = tx.objectStore(JOBS_STORE);
    if (!jobs.indexNames.contains('createdAt')) {
      jobs.createIndex('createdAt', 'createdAt');
    }
    if (!jobs.indexNames.contains('jobId')) {
      jobs.createIndex('jobId', 'jobId');
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
function hasRequiredStores(db: IDBPDatabase<AlchemyDbSchema>): boolean {
  return (
    db.objectStoreNames.contains(JOBS_STORE) &&
    db.objectStoreNames.contains(IMAGES_STORE)
  );
}

/**
 * IndexedDB persistence for submitted alchemy requests, their results and the
 * image blobs on both sides of them. Browser-only: on the server every method is
 * a no-op returning an empty result, so callers can invoke it unconditionally
 * during SSR.
 *
 * There is no prune method by design. Stored results are removed only by
 * deleting a job or by clearing the history from the storage management surface.
 */
@Injectable({ providedIn: 'root' })
export class AlchemyDbService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private dbPromise: Promise<IDBPDatabase<AlchemyDbSchema>> | null = null;

  private db(): Promise<IDBPDatabase<AlchemyDbSchema>> {
    // Memoizing the open promise makes recovery race-safe: concurrent callers
    // all await the single in-flight open, so a wipe-and-recreate happens once.
    this.dbPromise ??= openStudioDb<AlchemyDbSchema>({
      name: DB_NAME,
      version: DB_VERSION,
      ensureSchema,
      hasRequiredStores,
      historyLabel: 'alchemy history',
    });
    return this.dbPromise;
  }

  public async putJob(job: StoredAlchemyJob): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const db = await this.db();
    await db.put(JOBS_STORE, job);
  }

  public async getJob(localId: string): Promise<StoredAlchemyJob | undefined> {
    if (!this.isBrowser) {
      return undefined;
    }
    const db = await this.db();
    return db.get(JOBS_STORE, localId);
  }

  /** All jobs, newest first. */
  public async listJobs(): Promise<StoredAlchemyJob[]> {
    if (!this.isBrowser) {
      return [];
    }
    const db = await this.db();
    const jobs = await db.getAll(JOBS_STORE);
    return jobs.sort((a, b) => b.createdAt - a.createdAt);
  }

  /** The stored job carrying a given horde interrogation id, if any. */
  public async getJobByHordeId(
    jobId: string,
  ): Promise<StoredAlchemyJob | undefined> {
    if (!this.isBrowser) {
      return undefined;
    }
    const db = await this.db();
    return db.getFromIndex(JOBS_STORE, 'jobId', jobId);
  }

  public async putImage(image: StoredAlchemyImage): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const db = await this.db();
    await db.put(IMAGES_STORE, image);
  }

  public async getImage(
    localId: string,
    imageId: string,
  ): Promise<StoredAlchemyImage | undefined> {
    if (!this.isBrowser) {
      return undefined;
    }
    const db = await this.db();
    return db.get(IMAGES_STORE, [localId, imageId]);
  }

  public async getImagesForJob(localId: string): Promise<StoredAlchemyImage[]> {
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
    // Both handles are taken before the first await: a transaction commits as
    // soon as it goes idle, so reaching for a store after one would be too late.
    const jobStore = tx.objectStore(JOBS_STORE);
    const imageStore = tx.objectStore(IMAGES_STORE);
    const imageKeys = await imageStore.index('localId').getAllKeys(localId);
    await Promise.all([
      jobStore.delete(localId),
      ...imageKeys.map((key) => imageStore.delete(key)),
    ]);
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
}
