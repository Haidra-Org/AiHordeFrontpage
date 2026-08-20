import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DBSchema, IDBPDatabase } from 'idb';
import { StudioUpgradeTransaction, openStudioDb } from './idb-open';
import { CivitaiModel, CivitaiModelVersion } from './civitai.service';

/**
 * CivitAI metadata lives in its own database rather than alongside generation
 * or alchemy history, for the reason spelled out in the alchemy service: adding
 * stores to an existing database means opening it at a higher version, and an
 * older bundle meeting it later would fail with a VersionError.
 */
const DB_NAME = 'ai-horde-frontpage-civitai';
const DB_VERSION = 1;
const MODELS_STORE = 'civitaiModels';
const VERSIONS_STORE = 'civitaiVersions';

/**
 * The shape of the cached payloads. Bumping this retires every stored record
 * without touching `DB_VERSION`: an older record simply reads as a miss and is
 * overwritten on the next fetch, which keeps the additive-schema contract clean
 * and avoids the VersionError blast radius a version bump carries.
 */
const CIVITAI_RECORD_SCHEMA = 1;

/**
 * How long a record is served without a refetch. Version metadata is
 * effectively immutable once published, so this window exists to notice a
 * rename or a takedown, not to track a moving value.
 */
export const CIVITAI_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedRecord<T> {
  id: number;
  schema: number;
  fetchedAt: number;
  data: T;
}

/** A cached read. `stale` asks the caller to refresh, never to discard. */
export interface CachedRead<T> {
  data: T;
  stale: boolean;
}

interface CivitaiCacheSchema extends DBSchema {
  [MODELS_STORE]: {
    key: number;
    value: CachedRecord<CivitaiModel>;
    indexes: { fetchedAt: number };
  };
  [VERSIONS_STORE]: {
    key: number;
    value: CachedRecord<CivitaiModelVersion>;
    indexes: { fetchedAt: number; modelId: number };
  };
}

type UpgradeTransaction = StudioUpgradeTransaction<CivitaiCacheSchema>;

function ensureSchema(
  db: IDBPDatabase<CivitaiCacheSchema>,
  tx: UpgradeTransaction,
): void {
  if (!db.objectStoreNames.contains(MODELS_STORE)) {
    const models = db.createObjectStore(MODELS_STORE, { keyPath: 'id' });
    models.createIndex('fetchedAt', 'fetchedAt');
  } else {
    const models = tx.objectStore(MODELS_STORE);
    if (!models.indexNames.contains('fetchedAt')) {
      models.createIndex('fetchedAt', 'fetchedAt');
    }
  }

  if (!db.objectStoreNames.contains(VERSIONS_STORE)) {
    const versions = db.createObjectStore(VERSIONS_STORE, { keyPath: 'id' });
    versions.createIndex('fetchedAt', 'fetchedAt');
    versions.createIndex('modelId', 'data.modelId');
  } else {
    const versions = tx.objectStore(VERSIONS_STORE);
    if (!versions.indexNames.contains('fetchedAt')) {
      versions.createIndex('fetchedAt', 'fetchedAt');
    }
    if (!versions.indexNames.contains('modelId')) {
      versions.createIndex('modelId', 'data.modelId');
    }
  }
}

function hasRequiredStores(db: IDBPDatabase<CivitaiCacheSchema>): boolean {
  return (
    db.objectStoreNames.contains(MODELS_STORE) &&
    db.objectStoreNames.contains(VERSIONS_STORE)
  );
}

/**
 * Durable CivitAI metadata, so a rehydrated generation can name the assets it
 * used without asking the catalogue again.
 *
 * A stored request carries only the identifier it was given, so without this a
 * past generation reads as a bare number until a network round trip completes,
 * and reads as a bare number forever while offline.
 *
 * There is no prune method, by design and for a specific reason: the records
 * worth keeping longest belong to the oldest generations, which are exactly the
 * least recently touched. An eviction policy keyed on recency would make the
 * deepest history the least readable. Records are small, and the storage
 * management surface can clear them outright.
 */
@Injectable({ providedIn: 'root' })
export class CivitaiCacheService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private dbPromise: Promise<IDBPDatabase<CivitaiCacheSchema>> | null = null;

  private db(): Promise<IDBPDatabase<CivitaiCacheSchema>> {
    this.dbPromise ??= openStudioDb<CivitaiCacheSchema>({
      name: DB_NAME,
      version: DB_VERSION,
      ensureSchema,
      hasRequiredStores,
      historyLabel: 'CivitAI metadata',
    });
    return this.dbPromise;
  }

  /**
   * Run a database operation, answering `fallback` if the store cannot be
   * reached at all.
   *
   * Everything here is a convenience: without it an asset reads as its bare
   * identifier, which is worse but not broken. A browser with storage disabled,
   * or a private window that refuses to open a database, must therefore lose
   * the names rather than the page that was going to show them.
   */
  private async attempt<T>(
    operation: (db: IDBPDatabase<CivitaiCacheSchema>) => Promise<T>,
    fallback: T,
  ): Promise<T> {
    if (!this.isBrowser) {
      return fallback;
    }
    try {
      return await operation(await this.db());
    } catch {
      // A failed open poisons the memoised promise; drop it so a later call can
      // try again rather than inheriting the failure for the whole session.
      this.dbPromise = null;
      return fallback;
    }
  }

  private read<T>(record: CachedRecord<T> | undefined): CachedRead<T> | null {
    if (!record || record.schema !== CIVITAI_RECORD_SCHEMA) {
      return null;
    }
    return {
      data: record.data,
      stale: Date.now() - record.fetchedAt >= CIVITAI_CACHE_TTL_MS,
    };
  }

  public async getModel(id: number): Promise<CachedRead<CivitaiModel> | null> {
    return this.attempt(
      async (db) => this.read(await db.get(MODELS_STORE, id)),
      null,
    );
  }

  public async getVersion(
    id: number,
  ): Promise<CachedRead<CivitaiModelVersion> | null> {
    return this.attempt(
      async (db) => this.read(await db.get(VERSIONS_STORE, id)),
      null,
    );
  }

  public async putModel(model: CivitaiModel): Promise<void> {
    if (!model.id) {
      return;
    }
    await this.attempt(async (db) => {
      await db.put(MODELS_STORE, {
        id: model.id,
        schema: CIVITAI_RECORD_SCHEMA,
        fetchedAt: Date.now(),
        data: model,
      });
    }, undefined);
  }

  public async putVersion(version: CivitaiModelVersion): Promise<void> {
    if (!version.id) {
      return;
    }
    await this.attempt(async (db) => {
      await db.put(VERSIONS_STORE, {
        id: version.id,
        schema: CIVITAI_RECORD_SCHEMA,
        fetchedAt: Date.now(),
        data: version,
      });
    }, undefined);
  }

  /**
   * Store a search result whole: the model page and every version it carries.
   *
   * This runs when an asset is picked, not only when one is looked up. A newly
   * picked entry already knows its own name, so nothing would ever ask the
   * resolver about it, and nothing would write it down; the first time it
   * mattered would be a rehydrated request with no network, which is precisely
   * when a fetch cannot save it.
   */
  public async putSearchResult(model: CivitaiModel): Promise<void> {
    await this.putModel(model);
    await Promise.all(
      model.versions.map((version) =>
        this.putVersion(
          // A version inside a search result does not name its own model, and
          // the detail panel and the resolver both want that pairing.
          version.modelId === null || version.modelName === null
            ? { ...version, modelId: model.id, modelName: model.name }
            : version,
        ),
      ),
    );
  }

  /** Every cached version belonging to one model page, newest first. */
  public async versionsOfModel(
    modelId: number,
  ): Promise<CivitaiModelVersion[]> {
    return this.attempt(async (db) => {
      const records = await db.getAllFromIndex(
        VERSIONS_STORE,
        'modelId',
        modelId,
      );
      return records
        .filter((record) => record.schema === CIVITAI_RECORD_SCHEMA)
        .map((record) => record.data);
    }, []);
  }

  public async countModels(): Promise<number> {
    return this.attempt((db) => db.count(MODELS_STORE), 0);
  }

  public async countVersions(): Promise<number> {
    return this.attempt((db) => db.count(VERSIONS_STORE), 0);
  }

  /** Drop every cached record. Nothing else removes one. */
  public async clear(): Promise<void> {
    await this.attempt(async (db) => {
      await db.clear(MODELS_STORE);
      await db.clear(VERSIONS_STORE);
    }, undefined);
  }
}
