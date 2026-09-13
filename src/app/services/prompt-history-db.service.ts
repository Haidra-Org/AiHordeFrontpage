import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DBSchema, IDBPDatabase } from 'idb';
import { StudioUpgradeTransaction, openStudioDb } from './idb-open';
import type { LocalGenerationJob } from '../types/generation-job';
import {
  promptHistoryFromJobs,
  splitCombinedPrompt,
} from '../pages/generate/generate-form.model';

/**
 * Sent prompts keep a database of their own rather than living beside the jobs:
 * clearing the results is a common tidy-up, and it must not take the reader's
 * record of what they asked for with it.
 */
const DB_NAME = 'ai-horde-frontpage-prompt-history';
const DB_VERSION = 1;
const SENT_STORE = 'sent';
const META_STORE = 'meta';
const SEEDED_KEY = 'seeded';

/** One distinct prompt sent to image generation, however many times. */
export interface StoredSentPrompt {
  /** {@link sentPromptKey} of the prompt and negative. */
  key: string;
  prompt: string;
  /** Empty when the prompt went out without one. */
  negative: string;
  /** The model of the latest send. */
  model: string;
  firstSentAt: number;
  lastSentAt: number;
  count: number;
  /** Present only while the reader keeps the prompt starred. */
  starred?: true;
}

interface SeedMarker {
  key: string;
  at: number;
}

interface PromptHistoryDbSchema extends DBSchema {
  [SENT_STORE]: {
    key: string;
    value: StoredSentPrompt;
    indexes: { lastSentAt: number };
  };
  [META_STORE]: {
    key: string;
    value: SeedMarker;
  };
}

type UpgradeTransaction = StudioUpgradeTransaction<PromptHistoryDbSchema>;

function ensureSchema(
  db: IDBPDatabase<PromptHistoryDbSchema>,
  tx: UpgradeTransaction,
): void {
  if (!db.objectStoreNames.contains(SENT_STORE)) {
    const sent = db.createObjectStore(SENT_STORE, { keyPath: 'key' });
    sent.createIndex('lastSentAt', 'lastSentAt');
  } else {
    const sent = tx.objectStore(SENT_STORE);
    if (!sent.indexNames.contains('lastSentAt')) {
      sent.createIndex('lastSentAt', 'lastSentAt');
    }
  }
  if (!db.objectStoreNames.contains(META_STORE)) {
    db.createObjectStore(META_STORE, { keyPath: 'key' });
  }
}

function hasRequiredStores(db: IDBPDatabase<PromptHistoryDbSchema>): boolean {
  return (
    db.objectStoreNames.contains(SENT_STORE) &&
    db.objectStoreNames.contains(META_STORE)
  );
}

/**
 * A stable key for a prompt and its negative. A 53-bit string hash (cyrb53):
 * the prompt itself would make a key as long as the prompt, and a collision
 * between two real prompts in one browser's history is far too unlikely to
 * design around.
 */
export function sentPromptKey(prompt: string, negative: string): string {
  const text = `${prompt}\u0000${negative}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * The sent records the saved jobs stand for: one per distinct prompt, counted
 * over every job that asked for it. The distinct prompts are the ones the old
 * quick-pick offered, so what the reader could reach before is what carries
 * over.
 */
export function sentPromptsFromJobs(
  jobs: readonly LocalGenerationJob[],
): StoredSentPrompt[] {
  const byKey = new Map<string, StoredSentPrompt>();
  for (const entry of promptHistoryFromJobs(jobs, Number.POSITIVE_INFINITY)) {
    const key = sentPromptKey(entry.prompt, entry.negativePrompt);
    byKey.set(key, {
      key,
      prompt: entry.prompt,
      negative: entry.negativePrompt,
      model: '',
      firstSentAt: Number.POSITIVE_INFINITY,
      lastSentAt: 0,
      count: 0,
    });
  }
  for (const job of jobs) {
    const [prompt, negative] = splitCombinedPrompt(job.request.prompt.trim());
    const record = byKey.get(sentPromptKey(prompt, negative));
    if (!record) {
      continue;
    }
    record.count++;
    record.firstSentAt = Math.min(record.firstSentAt, job.createdAt);
    if (job.createdAt >= record.lastSentAt) {
      record.lastSentAt = job.createdAt;
      record.model = job.request.models?.[0] ?? '';
    }
  }
  return [...byKey.values()];
}

/**
 * The prompts this browser has sent to image generation. Browser-only: every
 * method is a no-op on the server.
 *
 * Nothing is pruned. An entry leaves when the reader deletes it.
 */
@Injectable({ providedIn: 'root' })
export class PromptHistoryDbService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private dbPromise: Promise<IDBPDatabase<PromptHistoryDbSchema>> | null = null;
  private seedPromise: Promise<void> | null = null;

  private readonly sizeSignal = signal(0);
  /** How many distinct prompts are kept, as last read from the store. */
  public readonly size = this.sizeSignal.asReadonly();

  private db(): Promise<IDBPDatabase<PromptHistoryDbSchema>> {
    this.dbPromise ??= openStudioDb<PromptHistoryDbSchema>({
      name: DB_NAME,
      version: DB_VERSION,
      ensureSchema,
      hasRequiredStores,
      historyLabel: 'sent prompts',
    });
    return this.dbPromise;
  }

  private async refreshSize(
    db: IDBPDatabase<PromptHistoryDbSchema>,
  ): Promise<void> {
    this.sizeSignal.set(await db.count(SENT_STORE));
  }

  /** Every sent prompt, most recently sent first. */
  public async listAll(): Promise<StoredSentPrompt[]> {
    if (!this.isBrowser) {
      return [];
    }
    const db = await this.db();
    const sent = await db.getAllFromIndex(SENT_STORE, 'lastSentAt');
    this.sizeSignal.set(sent.length);
    return sent.reverse();
  }

  /**
   * Count one send. Never throws: a send has already gone to the horde by the
   * time this runs, and failing to remember it is no reason to report the send
   * as failed.
   */
  public async record(
    prompt: string,
    negative: string,
    model: string,
    at: number = Date.now(),
  ): Promise<void> {
    if (!this.isBrowser || prompt.trim() === '') {
      return;
    }
    try {
      // A send that lands while the first seeding is running would otherwise
      // be counted once here and again from the job list.
      await this.seedPromise;
      const db = await this.db();
      const key = sentPromptKey(prompt, negative);
      const tx = db.transaction(SENT_STORE, 'readwrite');
      const existing = await tx.store.get(key);
      await tx.store.put(
        existing
          ? {
              ...existing,
              model,
              lastSentAt: at,
              count: existing.count + 1,
            }
          : {
              key,
              prompt,
              negative,
              model,
              firstSentAt: at,
              lastSentAt: at,
              count: 1,
            },
      );
      await tx.done;
      await this.refreshSize(db);
    } catch (error) {
      console.warn('Failed to record a sent prompt:', error);
    }
  }

  /**
   * Carry the prompts of the saved jobs over, once per browser. The marker is
   * written in the same transaction as the records, so two tabs opening at once
   * cannot both seed. A prompt the store already holds is left as it is: it was
   * recorded as it was sent, which is the better figure.
   */
  public seedOnce(jobs: readonly LocalGenerationJob[]): Promise<void> {
    if (!this.isBrowser) {
      return Promise.resolve();
    }
    this.seedPromise ??= this.seed(jobs);
    return this.seedPromise;
  }

  private async seed(jobs: readonly LocalGenerationJob[]): Promise<void> {
    try {
      const db = await this.db();
      const tx = db.transaction([SENT_STORE, META_STORE], 'readwrite');
      const meta = tx.objectStore(META_STORE);
      if (!(await meta.get(SEEDED_KEY))) {
        const sent = tx.objectStore(SENT_STORE);
        for (const record of sentPromptsFromJobs(jobs)) {
          if ((await sent.getKey(record.key)) === undefined) {
            await sent.put(record);
          }
        }
        await meta.put({ key: SEEDED_KEY, at: Date.now() });
      }
      await tx.done;
      await this.refreshSize(db);
    } catch (error) {
      console.warn('Failed to carry sent prompts over from saved jobs:', error);
    }
  }

  /**
   * Write several records in one transaction, so putting back what a delete
   * took away lands whole or not at all.
   */
  public async putMany(records: readonly StoredSentPrompt[]): Promise<void> {
    if (!this.isBrowser || records.length === 0) {
      return;
    }
    const db = await this.db();
    const tx = db.transaction(SENT_STORE, 'readwrite');
    await Promise.all([
      ...records.map((record) => tx.store.put(record)),
      tx.done,
    ]);
    await this.refreshSize(db);
  }

  /**
   * Star or unstar a sent prompt. The record is read inside the write, so a
   * send counted in the meantime is kept. A prompt no longer held is left
   * absent.
   */
  public async setStarred(key: string, starred: boolean): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    const db = await this.db();
    const tx = db.transaction(SENT_STORE, 'readwrite');
    const existing = await tx.store.get(key);
    if (existing) {
      const next: StoredSentPrompt = { ...existing };
      if (starred) {
        next.starred = true;
      } else {
        delete next.starred;
      }
      await tx.store.put(next);
    }
    await tx.done;
  }

  /** Remove several records in one transaction. */
  public async removeMany(keys: readonly string[]): Promise<void> {
    if (!this.isBrowser || keys.length === 0) {
      return;
    }
    const db = await this.db();
    const tx = db.transaction(SENT_STORE, 'readwrite');
    await Promise.all([...keys.map((key) => tx.store.delete(key)), tx.done]);
    await this.refreshSize(db);
  }
}
