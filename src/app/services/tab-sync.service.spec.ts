import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TabSyncService } from './tab-sync.service';
import {
  FakeBroadcastChannel,
  openPeerChannel,
  postFromPeer,
} from '../testing/fake-broadcast-channel';
import { LocalGenerationJob } from '../types/generation-job';

function job(localId: string): LocalGenerationJob {
  return {
    localId,
    status: 'waiting',
    createdAt: 1,
    updatedAt: 1,
    request: { prompt: 'a cat' },
    resultImageIds: [],
  };
}

describe('TabSyncService', () => {
  beforeEach(() => {
    FakeBroadcastChannel.reset();
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('carries a published payload to another tab', () => {
    const sync = TestBed.inject(TabSyncService);
    const peer = openPeerChannel();
    const received: unknown[] = [];
    peer.onmessage = (event) => received.push(event.data);

    sync.publish('generation-job.added', job('a'));

    expect(received).toEqual([
      expect.objectContaining({
        topic: 'generation-job.added',
        payload: job('a'),
        sender: sync.tabId,
      }),
    ]);
  });

  it('hands a peer message to subscribers of its topic only', () => {
    const sync = TestBed.inject(TabSyncService);
    const peer = openPeerChannel();
    const added: LocalGenerationJob[] = [];
    const deleted: string[] = [];
    sync.on('generation-job.added').subscribe((payload) => added.push(payload));
    sync
      .on('generation-job.deleted')
      .subscribe((payload) => deleted.push(payload.localId));

    postFromPeer(peer, 'generation-job.added', job('a'));

    expect(added.map((row) => row.localId)).toEqual(['a']);
    expect(deleted).toEqual([]);
  });

  it('drops a message stamped with its own tab id', () => {
    const sync = TestBed.inject(TabSyncService);
    const peer = openPeerChannel();
    const added: LocalGenerationJob[] = [];
    sync.on('generation-job.added').subscribe((payload) => added.push(payload));

    peer.postMessage({
      topic: 'generation-job.added',
      payload: job('echo'),
      sender: sync.tabId,
      sentAt: Date.now(),
    });

    expect(added).toEqual([]);
  });

  it('ignores a message that is not an envelope', () => {
    const sync = TestBed.inject(TabSyncService);
    const peer = openPeerChannel();
    const added: LocalGenerationJob[] = [];
    sync.on('generation-job.added').subscribe((payload) => added.push(payload));

    peer.postMessage('hello');
    peer.postMessage({ payload: job('a') });

    expect(added).toEqual([]);
  });

  it('closes its channel when the app is torn down', () => {
    TestBed.inject(TabSyncService);
    const channel = FakeBroadcastChannel.instances[0];

    TestBed.resetTestingModule();

    expect(channel.closed).toBe(true);
  });

  it('does nothing where BroadcastChannel does not exist', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const sync = TestBed.inject(TabSyncService);

    expect(() => sync.publish('generation-job.added', job('a'))).not.toThrow();
    expect(FakeBroadcastChannel.instances).toEqual([]);
  });

  it('opens no channel on the server', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });
    const sync = TestBed.inject(TabSyncService);

    sync.publish('generation-job.added', job('a'));

    expect(FakeBroadcastChannel.instances).toEqual([]);
  });

  it('runs an exclusive task where the Web Locks API is missing', async () => {
    const sync = TestBed.inject(TabSyncService);

    await expect(sync.exclusive('x', () => Promise.resolve(7))).resolves.toBe(
      7,
    );
  });

  it('skips an exclusive task while another tab holds its name', async () => {
    const request = vi.fn(
      (
        _name: string,
        _options: LockOptions,
        callback: (lock: Lock | null) => Promise<unknown>,
      ) => callback(null),
    );
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    const sync = TestBed.inject(TabSyncService);
    const task = vi.fn(() => Promise.resolve(7));

    await expect(sync.exclusive('x', task)).resolves.toBeUndefined();
    expect(task).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('x'),
      { ifAvailable: true },
      expect.any(Function),
    );
  });
});
