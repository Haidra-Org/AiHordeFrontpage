import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DBSchema, IDBPDatabase } from 'idb';
import { StudioUpgradeTransaction, openStudioDb } from './idb-open';
import type {
  PromptDraftInput,
  PromptDraftModelPick,
  PromptDraftOrigin,
} from './prompt-draft.service';

/**
 * Drafts keep their own database for the same reason alchemy does: opening the
 * generation database at a higher version would make an older bundle that later
 * met it fail, and a reader's pictures are not worth risking for a list of
 * sentences.
 */
const DB_NAME = 'ai-horde-frontpage-prompt-drafts';
const DB_VERSION = 1;
const DRAFTS_STORE = 'drafts';

/** A prompt a text model wrote, as it is kept between visits. */
export interface StoredPromptDraft {
  id: string;
  createdAt: number;
  origin: PromptDraftOrigin;
  input: PromptDraftInput;
  pick: PromptDraftModelPick;
  model: string;
  seed: number | null;
  kudos: number;
  anonymous: boolean;
  text: string;
  /**
   * The horde request the draft came out of. Several takes of one request each
   * keep their own record, and this is what says they are the same ask.
   */
  requestId?: string;
  /** Which take of that request this is, from zero. */
  takeIndex?: number;
  /** The style the horde applied, by id; absent for the built-in instruction. */
  style?: string;
}

interface PromptDraftDbSchema extends DBSchema {
  [DRAFTS_STORE]: {
    key: string;
    value: StoredPromptDraft;
    indexes: { createdAt: number };
  };
}

type UpgradeTransaction = StudioUpgradeTransaction<PromptDraftDbSchema>;

/**
 * Provision the store and its index, tolerating a partly-provisioned database:
 * an existing store can still gain the index without being dropped.
 */
function ensureSchema(
  db: IDBPDatabase<PromptDraftDbSchema>,
  tx: UpgradeTransaction,
): void {
  if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
    const drafts = db.createObjectStore(DRAFTS_STORE, { keyPath: 'id' });
    drafts.createIndex('createdAt', 'createdAt');
    return;
  }
  const drafts = tx.objectStore(DRAFTS_STORE);
  if (!drafts.indexNames.contains('createdAt')) {
    drafts.createIndex('createdAt', 'createdAt');
  }
}

function hasRequiredStores(db: IDBPDatabase<PromptDraftDbSchema>): boolean {
  return db.objectStoreNames.contains(DRAFTS_STORE);
}

/**
 * The drafts a text model has written for this browser. Browser-only: every
 * method is a no-op returning an empty result on the server, so callers need no
 * platform check of their own.
 *
 * Nothing is pruned. A draft leaves the store when the reader deletes it or
 * clears the history.
 */
@Injectable({ providedIn: 'root' })
export class PromptDraftDbService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private dbPromise: Promise<IDBPDatabase<PromptDraftDbSchema>> | null = null;

  private db(): Promise<IDBPDatabase<PromptDraftDbSchema>> {
    // Memoizing the open promise keeps a wipe-and-recreate to one attempt when
    // several callers reach for the store at once.
    this.dbPromise ??= openStudioDb<PromptDraftDbSchema>({
      name: DB_NAME,
      version: DB_VERSION,
      ensureSchema,
      hasRequiredStores,
      historyLabel: 'prompt drafts',
    });
    return this.dbPromise;
  }

  public async put(draft: StoredPromptDraft): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const db = await this.db();
    await db.put(DRAFTS_STORE, draft);
  }

  /** The most recent drafts, newest first. */
  public async list(limit: number): Promise<StoredPromptDraft[]> {
    if (!this.isBrowser || limit <= 0) {
      return [];
    }
    const db = await this.db();
    const drafts = await db.getAllFromIndex(DRAFTS_STORE, 'createdAt');
    return drafts.reverse().slice(0, limit);
  }

  public async remove(id: string): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const db = await this.db();
    await db.delete(DRAFTS_STORE, id);
  }

  public async clear(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const db = await this.db();
    await db.clear(DRAFTS_STORE);
  }
}
