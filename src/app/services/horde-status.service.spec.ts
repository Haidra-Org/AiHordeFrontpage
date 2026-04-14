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
