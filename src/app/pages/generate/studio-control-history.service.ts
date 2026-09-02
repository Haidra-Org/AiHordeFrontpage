import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { DBSchema, IDBPDatabase } from 'idb';
import { openStudioDb } from '../../services/idb-open';
import type { GenerateFormValue } from './generate-form.model';
import type { GenerateSourceState } from './generate-source-image/generate-source-image.component';
import type { ResultControlAction } from './result-control-action';

const DB_NAME = 'ai-horde-frontpage-studio-control-history';
const DB_VERSION = 1;
const STORE = 'checkpoints';
const HISTORY_LIMIT = 10;

export interface StudioControlCheckpoint {
  id: string;
  createdAt: number;
  action: ResultControlAction;
  form: GenerateFormValue;
  source: GenerateSourceState;
}

interface StudioControlHistorySchema extends DBSchema {
  [STORE]: {
    key: string;
    value: StudioControlCheckpoint;
    indexes: { createdAt: number };
  };
}

/** Durable checkpoints for undoing result actions, including attached blobs. */
@Injectable({ providedIn: 'root' })
export class StudioControlHistoryService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private dbPromise: Promise<IDBPDatabase<StudioControlHistorySchema>> | null =
    null;

  private db(): Promise<IDBPDatabase<StudioControlHistorySchema>> {
    this.dbPromise ??= openStudioDb<StudioControlHistorySchema>({
      name: DB_NAME,
      version: DB_VERSION,
      ensureSchema: (db) => {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      },
      hasRequiredStores: (db) => db.objectStoreNames.contains(STORE),
      historyLabel: 'studio control undo history',
    });
    return this.dbPromise;
  }

  public async list(): Promise<StudioControlCheckpoint[]> {
    if (!this.isBrowser || typeof indexedDB === 'undefined') {
      return [];
    }
    const db = await this.db();
    const checkpoints = await db.getAll(STORE);
    return checkpoints.sort((a, b) => b.createdAt - a.createdAt);
  }

  public async push(checkpoint: StudioControlCheckpoint): Promise<void> {
    if (!this.isBrowser || typeof indexedDB === 'undefined') {
      return;
    }
    const db = await this.db();
    await db.put(STORE, checkpoint);
    const checkpoints = await this.list();
    await Promise.all(
      checkpoints
        .slice(HISTORY_LIMIT)
        .map((stale) => db.delete(STORE, stale.id)),
    );
  }

  public async remove(id: string): Promise<void> {
    if (!this.isBrowser || typeof indexedDB === 'undefined') {
      return;
    }
    const db = await this.db();
    await db.delete(STORE, id);
  }
}
