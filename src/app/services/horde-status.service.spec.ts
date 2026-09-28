import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { HordeStatusService } from './horde-status.service';
import { HordeApiCacheService } from './horde-api-cache.service';

describe('HordeStatusService', () => {
  let svc: HordeStatusService;
  let mockCache: {
    cachedGet: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockCache = { cachedGet: vi.fn() };

    TestBed.configureTestingModule({
      providers: [{ provide: HordeApiCacheService, useValue: mockCache }],
    });

    svc = TestBed.inject(HordeStatusService);
  });

  it('returns status modes from the API', () => {
    const modes = {
      maintenance_mode: false,
      invite_only_mode: false,
      raid_mode: false,
    };
    mockCache.cachedGet.mockReturnValue(of(modes));

    svc.getStatusModes().subscribe((result) => expect(result).toEqual(modes));
    expect(mockCache.cachedGet).toHaveBeenCalledWith(
      expect.stringContaining('/status/modes'),
      expect.anything(),
      expect.objectContaining({ category: 'status' }),
    );
  });

  it('returns null on error', () => {
    mockCache.cachedGet.mockReturnValue(throwError(() => new Error('down')));

    svc.getStatusModes().subscribe((result) => expect(result).toBeNull());
  });
});

describe('HordeStatusService.checkReachable', () => {
  let svc: HordeStatusService;
  let mockCache: { cachedGet: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockCache = { cachedGet: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: HordeApiCacheService, useValue: mockCache }],
    });
    svc = TestBed.inject(HordeStatusService);
  });

  it('reads the heartbeat once for every caller', () => {
    mockCache.cachedGet.mockReturnValue(
      of({ message: 'OK', version: '4.46.0' }),
    );
    const seen: boolean[] = [];
    svc.checkReachable().subscribe((reachable) => seen.push(reachable));
    svc.checkReachable().subscribe((reachable) => seen.push(reachable));

    expect(seen).toEqual([true, true]);
    expect(svc.reachable()).toBe(true);
    expect(mockCache.cachedGet).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('/status/heartbeat'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('answers false when the heartbeat cannot be read', () => {
    mockCache.cachedGet.mockReturnValue(throwError(() => new Error('down')));
    svc
      .checkReachable()
      .subscribe((reachable) => expect(reachable).toBe(false));
    expect(svc.reachable()).toBe(false);
  });

  it('reads a failed heartbeat again on the next call, and a good one never again', () => {
    mockCache.cachedGet.mockReturnValue(throwError(() => new Error('down')));
    const seen: boolean[] = [];
    svc.checkReachable().subscribe((reachable) => seen.push(reachable));
    expect(svc.reachable()).toBe(false);

    mockCache.cachedGet.mockReturnValue(
      of({ message: 'OK', version: '5.1.11' }),
    );
    svc.checkReachable().subscribe((reachable) => seen.push(reachable));
    svc.checkReachable().subscribe((reachable) => seen.push(reachable));

    expect(seen).toEqual([false, true, true]);
    expect(svc.reachable()).toBe(true);
    expect(mockCache.cachedGet).toHaveBeenCalledTimes(2);
  });
});
