import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, Subject, filter, map } from 'rxjs';
import { LocalGenerationJob } from '../types/generation-job';
import { StoredAlchemyJob } from '../types/alchemy-job';
import { randomUuid } from '../helper/random-uuid';

/** The one channel every tab of the app talks on; topics keep concerns apart. */
const TAB_SYNC_CHANNEL = 'aihorde-frontpage.tab-sync';

/** Namespace for the cross-tab locks taken through {@link TabSyncService.exclusive}. */
const LOCK_PREFIX = 'aihorde-frontpage.';

/** A job row that is gone, with the horde id it carried when it had one. */
export interface SyncedJobDeletion {
  localId: string;
  hordeId?: string;
}

/** Every job of a kind was dropped at once. */
export interface SyncedJobsCleared {
  clearedAt: number;
}

/**
 * Every topic the tabs exchange, mapped to the payload it carries. A payload
 * crosses a structured clone, so it holds plain data only: no functions, class
 * instances or signals. Job rows qualify because their blobs live in the image
 * stores rather than on the row.
 */
export interface TabSyncTopics {
  'generation-job.added': LocalGenerationJob;
  'generation-job.changed': LocalGenerationJob;
  'generation-job.cancelled': LocalGenerationJob;
  'generation-job.deleted': SyncedJobDeletion;
  'generation-job.cleared': SyncedJobsCleared;
  'alchemy-job.added': StoredAlchemyJob;
  'alchemy-job.changed': StoredAlchemyJob;
  'alchemy-job.cancelled': StoredAlchemyJob;
  'alchemy-job.deleted': SyncedJobDeletion;
  'alchemy-job.cleared': SyncedJobsCleared;
}

export type TabSyncTopic = keyof TabSyncTopics;

/** What travels on the channel. */
interface TabSyncEnvelope<T extends TabSyncTopic = TabSyncTopic> {
  topic: T;
  payload: TabSyncTopics[T];
  /** The sending tab's id, so a tab can tell its own messages apart. */
  sender: string;
  sentAt: number;
}

function isEnvelope(data: unknown): data is TabSyncEnvelope {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const candidate = data as Partial<TabSyncEnvelope>;
  return (
    typeof candidate.topic === 'string' && typeof candidate.sender === 'string'
  );
}

/**
 * Message bus between the tabs of this app in one browser profile.
 *
 * The tabs share IndexedDB but each holds its own in-memory copy of what is
 * stored, so a write made in one tab is invisible to the others until they
 * hear about it. This service carries those notices over a single
 * `BroadcastChannel`. Each concern that needs to stay in step across tabs
 * claims topics in {@link TabSyncTopics}; adding a concern means adding its
 * topics and payload types there, with no change to the service itself.
 *
 * A tab never receives its own messages. Outside a browser, or where
 * `BroadcastChannel` does not exist, publishing does nothing and no messages
 * arrive, so callers need no platform checks of their own.
 */
@Injectable({ providedIn: 'root' })
export class TabSyncService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly incoming = new Subject<TabSyncEnvelope>();
  private readonly channel: BroadcastChannel | null;

  /** This tab's id, stamped on every message it sends. */
  public readonly tabId = randomUuid();

  constructor() {
    this.channel = this.openChannel();
    inject(DestroyRef).onDestroy(() => {
      this.channel?.close();
      this.incoming.complete();
    });
  }

  private openChannel(): BroadcastChannel | null {
    if (!this.isBrowser || typeof BroadcastChannel === 'undefined') {
      return null;
    }
    try {
      const channel = new BroadcastChannel(TAB_SYNC_CHANNEL);
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const data = event.data;
        // The platform does not echo a channel's own posts, but another
        // instance in the same tab would; the sender id settles it either way.
        if (isEnvelope(data) && data.sender !== this.tabId) {
          this.incoming.next(data);
        }
      };
      return channel;
    } catch (error) {
      console.warn('Cross-tab sync is unavailable:', error);
      return null;
    }
  }

  /** Tell every other tab about a change this tab made. */
  public publish<T extends TabSyncTopic>(
    topic: T,
    payload: TabSyncTopics[T],
  ): void {
    if (!this.channel) {
      return;
    }
    const envelope: TabSyncEnvelope<T> = {
      topic,
      payload,
      sender: this.tabId,
      sentAt: Date.now(),
    };
    try {
      this.channel.postMessage(envelope);
    } catch (error) {
      // A payload that cannot be cloned is a programming error, but losing one
      // notice must not break the write that prompted it.
      console.warn(`Could not share ${topic} with other tabs:`, error);
    }
  }

  /** Payloads other tabs publish on `topic`. */
  public on<T extends TabSyncTopic>(topic: T): Observable<TabSyncTopics[T]> {
    return this.incoming.pipe(
      filter((envelope): envelope is TabSyncEnvelope<T> => {
        return envelope.topic === topic;
      }),
      map((envelope) => envelope.payload),
    );
  }

  /**
   * Run `task` only while no other tab runs a task under the same `name`.
   * Resolves to the task's result, or to `undefined` without running it when
   * another tab holds the name. Two tabs following the same job would
   * otherwise both submit it or both download its results.
   *
   * Where the Web Locks API is missing the task always runs, which is what
   * every tab did before tabs coordinated at all.
   */
  public async exclusive<R>(
    name: string,
    task: () => Promise<R>,
  ): Promise<R | undefined> {
    if (
      !this.isBrowser ||
      typeof navigator === 'undefined' ||
      !('locks' in navigator)
    ) {
      return task();
    }
    return navigator.locks.request(
      `${LOCK_PREFIX}${name}`,
      { ifAvailable: true },
      async (lock) => (lock ? task() : undefined),
    );
  }
}
