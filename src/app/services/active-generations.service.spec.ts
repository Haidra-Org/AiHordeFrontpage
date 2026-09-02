import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveGenerationsService } from './active-generations.service';
import { AuthService } from './auth.service';
import { GenerationQueueService } from './generation-queue.service';
import { AlchemyQueueService } from './alchemy-queue.service';
import { ActiveGenerations, HordeUser } from '../types/horde-user';

const READ_INTERVAL_MS = 10_000;

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
  let refreshUser: ReturnType<typeof vi.fn>;
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
    refreshUser = vi.fn(() => of(user()));
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
            refreshUser: () => refreshUser(),
          },
        },
        { provide: GenerationQueueService, useValue: imageQueue },
        { provide: AlchemyQueueService, useValue: alchemyQueue },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function start(): ActiveGenerationsService {
    const service = TestBed.inject(ActiveGenerationsService);
    service.start();
    return service;
  }

  it('reads nothing while logged out', async () => {
    loggedIn.set(false);

    start();
    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS * 2);

    expect(refreshUser).not.toHaveBeenCalled();
    expect(imageQueue.adoptActive).not.toHaveBeenCalled();
  });

  it('hands each queue the ids the record reports', async () => {
    refreshUser.mockReturnValue(
      of(user({ image: ['i1', 'i2'], alchemy: ['a1'], text: ['t1'] })),
    );

    start();
    await vi.advanceTimersByTimeAsync(0);

    expect(imageQueue.adoptActive).toHaveBeenCalledWith(['i1', 'i2']);
    expect(alchemyQueue.adoptActive).toHaveBeenCalledWith(['a1']);
  });

  it('passes empty lists when the record names nothing', async () => {
    start();
    await vi.advanceTimersByTimeAsync(0);

    expect(imageQueue.adoptActive).toHaveBeenCalledWith([]);
    expect(alchemyQueue.adoptActive).toHaveBeenCalledWith([]);
  });

  it('stops re-reading once nothing is running', async () => {
    start();
    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS * 3);

    expect(refreshUser).toHaveBeenCalledTimes(1);
  });

  it('keeps re-reading while the account reports something active', async () => {
    current.set(user({ image: ['i1'] }));

    start();
    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS * 2);

    expect(refreshUser).toHaveBeenCalledTimes(3);
  });

  it('keeps re-reading while a local job is still in flight', async () => {
    imageQueue.pendingJobs.set([{ localId: 'j1' }]);

    start();
    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS);

    expect(refreshUser).toHaveBeenCalledTimes(2);
  });

  it('holds one read at a time', async () => {
    const pending = new Subject<HordeUser | null>();
    refreshUser.mockReturnValue(pending.asObservable());
    current.set(user({ image: ['i1'] }));

    start();
    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS * 3);

    expect(refreshUser).toHaveBeenCalledTimes(1);
    pending.next(user());
    pending.complete();
  });

  it('starts once however many studios ask', async () => {
    const service = start();
    service.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshUser).toHaveBeenCalledTimes(1);
  });

  it('waits before reading again after a read the horde would not answer', async () => {
    refreshUser.mockReturnValue(of(null));
    current.set(user({ image: ['i1'] }));

    start();
    await vi.advanceTimersByTimeAsync(READ_INTERVAL_MS);

    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(imageQueue.adoptActive).not.toHaveBeenCalled();
  });
});
