import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Observable, Subject, of } from 'rxjs';
import { Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveGenerationsService } from './active-generations.service';
import { AuthService, UserRead } from './auth.service';
import { HordeApiCacheService } from './horde-api-cache.service';
import { GenerationQueueService } from './generation-queue.service';
import { AlchemyQueueService } from './alchemy-queue.service';
import { ActiveGenerations, HordeUser } from '../types/horde-user';

const READ_INTERVAL_MS = 10_000;
const IDLE_READ_INTERVAL_MS = 60_000;

function user(active?: ActiveGenerations): HordeUser {
  return {
    username: 'reader',
    id: 1,
    kudos: 0,
    ...(active ? { active_generations: active } : {}),
  };
}

describe('ActiveGenerationsService', () => {
  let loggedIn: ReturnType<typeof signal<boolean>>;
  let current: ReturnType<typeof signal<HordeUser | null>>;
  let readUser: Mock<() => Observable<UserRead>>;
  let invalidate: ReturnType<typeof vi.fn>;
  let imageQueue: {
    adoptActive: ReturnType<typeof vi.fn>;
    pendingJobs: ReturnType<typeof signal<unknown[]>>;
  };
  let alchemyQueue: {
    adoptActive: ReturnType<typeof vi.fn>;
    pendingJobs: ReturnType<typeof signal<unknown[]>>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    loggedIn = signal(true);
    current = signal<HordeUser | null>(user());
    readUser = vi.fn<() => Observable<UserRead>>(() => of({ user: user() }));
    invalidate = vi.fn();
    imageQueue = {
      adoptActive: vi.fn(() => Promise.resolve()),
      pendingJobs: signal<unknown[]>([]),
    };
    alchemyQueue = {
      adoptActive: vi.fn(() => Promise.resolve()),
      pendingJobs: signal<unknown[]>([]),
    };

    TestBed.configureTestingModule({
      providers: [
        ActiveGenerationsService,
        {
          provide: AuthService,
          useValue: {
            isLoggedIn: loggedIn,
            currentUser: current,
            readUser: () => readUser(),
          },
        },
        { provide: HordeApiCacheService, useValue: { invalidate } },
        { provide: GenerationQueueService, useValue: imageQueue },
        { provide: AlchemyQueueService, useValue: alchemyQueue },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  /** Stand in for the tab being hidden, which jsdom has no other way to say. */
  function setVisibility(state: DocumentVisibilityState): void {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    });
  }

  function start(): ActiveGenerationsService {
    const service = TestBed.inject(ActiveGenerationsService);
    service.start();
    return service;
  }

  it('reads nothing while logged out', async () => {
    loggedIn.set(false);

    start();
    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS * 2);

    expect(readUser).not.toHaveBeenCalled();
    expect(imageQueue.adoptActive).not.toHaveBeenCalled();
  });

  it('hands each queue the ids the record reports', async () => {
    readUser.mockReturnValue(
      of({
        user: user({ image: ['i1', 'i2'], alchemy: ['a1'], text: ['t1'] }),
      }),
    );

    start();
    await vi.advanceTimersByTimeAsync(0);

    expect(imageQueue.adoptActive).toHaveBeenCalledWith(['i1', 'i2']);
    expect(alchemyQueue.adoptActive).toHaveBeenCalledWith(['a1']);
  });

  it('drops the cached account record before every read', async () => {
    start();
    await vi.runOnlyPendingTimersAsync();
    expect(invalidate).toHaveBeenCalledWith({ category: 'user' });
    expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(
      readUser.mock.invocationCallOrder[0],
    );
  });

  it('passes empty lists when the record names nothing', async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);

    expect(imageQueue.adoptActive).toHaveBeenCalledWith([]);
    expect(alchemyQueue.adoptActive).toHaveBeenCalledWith([]);
  });

  it('reads no faster than the idle period once nothing is running', async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(readUser).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS);
    expect(readUser).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(IDLE_READ_INTERVAL_MS - READ_INTERVAL_MS);
    expect(readUser).toHaveBeenCalledTimes(2);
  });

  it('keeps re-reading while the account reports something active', async () => {
    current.set(user({ image: ['i1'] }));

    start();
    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS * 2);

    expect(readUser).toHaveBeenCalledTimes(3);
  });

  it('keeps re-reading while a local job is still in flight', async () => {
    imageQueue.pendingJobs.set([{ localId: 'j1' }]);

    start();
    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS);

    expect(readUser).toHaveBeenCalledTimes(2);
  });

  it('holds one read at a time', async () => {
    const pending = new Subject<UserRead>();
    readUser.mockReturnValue(pending.asObservable());
    current.set(user({ image: ['i1'] }));

    start();
    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS * 3);

    expect(readUser).toHaveBeenCalledTimes(1);
    pending.next({ user: user() });
    pending.complete();
  });

  it('starts once however many studios ask', async () => {
    const service = start();
    service.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(readUser).toHaveBeenCalledTimes(1);
  });

  it('stops with the last studio and starts again with the next', async () => {
    current.set(user({ image: ['i1'] }));
    const service = TestBed.inject(ActiveGenerationsService);
    const releaseFirst = service.start();
    const releaseSecond = service.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(readUser).toHaveBeenCalledTimes(1);

    releaseFirst();
    releaseFirst();
    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS);
    expect(readUser).toHaveBeenCalledTimes(2);

    releaseSecond();
    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS * 3);
    expect(readUser).toHaveBeenCalledTimes(2);

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(readUser).toHaveBeenCalledTimes(3);
  });

  it('stops reading while the tab is hidden', async () => {
    current.set(user({ image: ['i1'] }));

    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(readUser).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS * 3);

    expect(readUser).toHaveBeenCalledTimes(1);
  });

  it('reads at once when the tab comes back', async () => {
    current.set(user({ image: ['i1'] }));
    setVisibility('hidden');

    start();
    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS * 2);
    expect(readUser).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    expect(readUser).toHaveBeenCalledTimes(2);
  });

  it('reads when the tab comes back even with nothing running', async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(readUser).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS);
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    expect(readUser).toHaveBeenCalledTimes(2);
  });

  it('waits before reading again after a read the horde would not answer', async () => {
    readUser.mockReturnValue(of({ error: 'network' }));
    current.set(user({ image: ['i1'] }));

    start();
    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS);

    expect(readUser).toHaveBeenCalledTimes(1);
    expect(imageQueue.adoptActive).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS);
    expect(readUser).toHaveBeenCalledTimes(2);
  });

  it('waits a minute after a rate-limited read and keeps the user', async () => {
    readUser.mockReturnValue(of({ error: 'rate_limited' }));
    const signedIn = user({ image: ['i1'] });
    current.set(signedIn);

    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(readUser).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(50_000);
    expect(readUser).toHaveBeenCalledTimes(1);
    expect(current()).toBe(signedIn);

    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS);
    expect(readUser).toHaveBeenCalledTimes(2);
  });

  it('stops reading once the key is refused', async () => {
    readUser.mockReturnValue(of({ error: 'unauthorized' }));
    current.set(user({ image: ['i1'] }));

    start();
    await vi.advanceTimersByTimeAsync(IDLE_READ_INTERVAL_MS * 2);
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    expect(readUser).toHaveBeenCalledTimes(1);
  });
});
