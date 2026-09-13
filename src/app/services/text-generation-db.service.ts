import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DBSchema, IDBPDatabase } from 'idb';
import { StudioUpgradeTransaction, openStudioDb } from './idb-open';
import type {
  PromptDraftChange,
  PromptDraftInput,
  PromptDraftModelPick,
  PromptDraftOrigin,
} from './prompt-draft.service';
import type {
  HordeApiError,
  TextGenerationRequest,
  TextGenerationStatusResponse,
} from '../types/generation';

/**
 * Text requests keep a database of their own, apart from the drafts they land
 * in: the queue is pruned a day after a request finishes, and the drafts are
 * never pruned, so the two cannot share a store without one rule breaking the
 * other.
 */
const DB_NAME = 'ai-horde-frontpage-text-requests';
/**
 * Version two adds fields to the record and none to the layout: the body a
 * request came back with, the text each take arrived as, and why a take is
 * empty. They are all optional, so a record written by version one is read as
 * it stands and the upgrade provisions nothing new.
 */
const DB_VERSION = 2;
const REQUESTS_STORE = 'requests';

/**
 * Where a request was asked from, so the card that asked can find it again. An
 * alchemy card is one per job; the studio has one card. `awaited` is a caller
 * that waits for the answer in code and draws no progress of its own.
 */
export type TextRequestContext =
  | { kind: 'studio' }
  | { kind: 'alchemy'; jobId: string }
  | { kind: 'awaited' };

/** The one string two equal contexts share. */
export function textRequestContextKey(context: TextRequestContext): string {
  return context.kind === 'alchemy' ? `alchemy:${context.jobId}` : context.kind;
}

/**
 * Where a request stands. `sending`, `queued` and `writing` are live: the horde
 * may still change them. The rest are final.
 *
 * `empty` and `faulted` part along the line of whose trouble it was. The horde
 * raises its own fault flag, and that is `faulted`; a request that came back
 * with nothing to read, whether the worker wrote blank text or a filter held it
 * back, is `empty`, and the reader is told which worker answered so the retry
 * can go elsewhere.
 */
export type TextRequestState =
  | 'sending'
  | 'refused'
  | 'queued'
  | 'writing'
  | 'done'
  | 'cancelled'
  | 'expired'
  | 'empty'
  | 'faulted';

/** The horde's latest numbers for a request, as the status last reported them. */
export interface TextRequestFigures {
  finished: number;
  processing: number;
  waiting: number;
  restarted: number;
  /** Horde-wide, ordered by kudos; not a place in any one worker's line. */
  queuePosition: number;
  /** Horde-wide estimate in seconds, not specific to the workers that can run it. */
  waitTime: number;
  isPossible: boolean;
  eligibleWorkers?: number;
  eligibleWorkerThreads?: number;
  mightStall?: boolean;
}

/** One answer a request came back with, as it was cleaned and kept. */
export interface TextRequestTake {
  /**
   * The id the take's draft record carries. A take that cleaned to nothing is
   * not written to the drafts store, and nothing answers to its id.
   */
  draftId: string;
  text: string;
  /** Empty where the model wrote no negative line. */
  negative: string;
  /**
   * The answer as the worker wrote it. Every edit made on the way to `text` is
   * listed in `changes`, and this is what putting one back reads from.
   */
  rawText: string;
  /** What cleaning altered or removed; absent where it changed nothing. */
  changes?: PromptDraftChange[];
  /** Why a take carries no text: the worker wrote none, or a filter held it back. */
  reason?: 'blank' | 'censored';
  model: string;
  seed: number | null;
  /** The worker that wrote the take, where the horde reported one. */
  workerId?: string;
  workerName?: string;
}

/** A text request as it is kept between visits. */
export interface StoredTextRequest {
  localId: string;
  /** Absent until the horde has accepted the request. */
  hordeId?: string;
  createdAt: number;
  updatedAt: number;
  context: TextRequestContext;
  origin: PromptDraftOrigin;
  input: PromptDraftInput;
  pick: PromptDraftModelPick;
  /** The style the horde applies, by id; absent for the built-in instruction. */
  styleId?: string;
  /** How many answers were asked for. */
  takes: number;
  anonymous: boolean;
  /** The model the pick named when the request went out, where it named one. */
  modelLabel: string | null;
  /** The body as sent. The key it went out on is never kept. */
  request: TextGenerationRequest;
  state: TextRequestState;
  figures?: TextRequestFigures;
  /** What the dry run quoted before the request was sent. */
  quotedKudos?: number;
  /** What the horde's status says the request has cost so far. */
  chargedKudos?: number;
  lastCheckedAt?: number;
  /** A translation key for a final state that needs more than its own line. */
  errorKey?: string;
  /** Why the horde would not take the request, as it worded it. */
  refusal?: HordeApiError;
  /** The takes that came back, once the request is done, cancelled or empty. */
  results?: TextRequestTake[];
  /**
   * The last status body the horde answered with, word for word, kept on every
   * request that ended with one. A reader who wants to see what came back gets
   * the answer itself rather than this client's reading of it.
   */
  response?: TextGenerationStatusResponse;
  /** Set once every take has been written to the drafts store. */
  acknowledged: boolean;
}

interface TextRequestDbSchema extends DBSchema {
  [REQUESTS_STORE]: {
    key: string;
    value: StoredTextRequest;
    indexes: { createdAt: number };
  };
}

type UpgradeTransaction = StudioUpgradeTransaction<TextRequestDbSchema>;

/**
 * Provision the store and its index, tolerating a partly-provisioned database:
 * an existing store can still gain the index without being dropped.
 */
function ensureSchema(
  db: IDBPDatabase<TextRequestDbSchema>,
  tx: UpgradeTransaction,
): void {
  if (!db.objectStoreNames.contains(REQUESTS_STORE)) {
    const requests = db.createObjectStore(REQUESTS_STORE, {
      keyPath: 'localId',
    });
    requests.createIndex('createdAt', 'createdAt');
    return;
  }
  const requests = tx.objectStore(REQUESTS_STORE);
  if (!requests.indexNames.contains('createdAt')) {
    requests.createIndex('createdAt', 'createdAt');
  }
}

function hasRequiredStores(db: IDBPDatabase<TextRequestDbSchema>): boolean {
  return db.objectStoreNames.contains(REQUESTS_STORE);
}

/**
 * The text requests this browser has sent. Browser-only: every method is a
 * no-op returning an empty result on the server, so callers need no platform
 * check of their own.
 */
@Injectable({ providedIn: 'root' })
export class TextGenerationDbService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private dbPromise: Promise<IDBPDatabase<TextRequestDbSchema>> | null = null;

  private db(): Promise<IDBPDatabase<TextRequestDbSchema>> {
    // Memoizing the open promise keeps a wipe-and-recreate to one attempt when
    // several callers reach for the store at once.
    this.dbPromise ??= openStudioDb<TextRequestDbSchema>({
      name: DB_NAME,
      version: DB_VERSION,
      ensureSchema,
      hasRequiredStores,
      historyLabel: 'text requests',
    });
    return this.dbPromise;
  }

  public async put(request: StoredTextRequest): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const db = await this.db();
    await db.put(REQUESTS_STORE, request);
  }

  public async get(localId: string): Promise<StoredTextRequest | undefined> {
    if (!this.isBrowser) {
      return undefined;
    }
    const db = await this.db();
    return db.get(REQUESTS_STORE, localId);
  }

  /** Every kept request, newest first. */
  public async list(): Promise<StoredTextRequest[]> {
    if (!this.isBrowser) {
      return [];
    }
    const db = await this.db();
    const requests = await db.getAllFromIndex(REQUESTS_STORE, 'createdAt');
    return requests.reverse();
  }

  public async remove(localId: string): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const db = await this.db();
    await db.delete(REQUESTS_STORE, localId);
  }
}
