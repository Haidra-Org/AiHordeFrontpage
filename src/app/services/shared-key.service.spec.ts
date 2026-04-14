import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { SharedKeyService } from './shared-key.service';
import { AuthService } from './auth.service';
import { HordeApiCacheService } from './horde-api-cache.service';
import { ApiError } from '../types/api-error';

describe('SharedKeyService', () => {
  let service: SharedKeyService;
  let httpTesting: HttpTestingController;
  let mockAuth: { getStoredApiKey: ReturnType<typeof vi.fn> };
  let mockCache: {
    cachedGet: ReturnType<typeof vi.fn>;
    invalidate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockAuth = { getStoredApiKey: vi.fn().mockReturnValue('user-key') };
    mockCache = {
      cachedGet: vi.fn().mockReturnValue(of({ id: 'sk1' })),
      invalidate: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuth },
        { provide: HordeApiCacheService, useValue: mockCache },
      ],
    });

    service = TestBed.inject(SharedKeyService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  describe('getSharedKey()', () => {
    it('fetches via cache with stored API key', () => {
      service.getSharedKey('sk1').subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.stringContaining('/sharedkeys/sk1'),
        expect.objectContaining({ headers: { apikey: 'user-key' } }),
        expect.objectContaining({ category: 'sharedkeys' }),
      );
    });

    it('allows overriding the API key', () => {
      service.getSharedKey('sk1', 'override-key').subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ headers: { apikey: 'override-key' } }),
        expect.anything(),
      );
    });

    it('sends empty headers when no key is available', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);
      service.getSharedKey('sk1').subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ headers: {} }),
        expect.anything(),
      );
    });
  });

  describe('getSharedKeysByIds()', () => {
    it('returns empty array for empty input', () => {
      let result: unknown[] = [];
      service.getSharedKeysByIds([]).subscribe((r) => (result = r));
      expect(result).toEqual([]);
    });
  });

  describe('createSharedKey()', () => {
    it('sends PUT with apikey and invalidates cache', () => {
      const payload = { name: 'Test Key' };
      service.createSharedKey(payload as never).subscribe();

      const req = httpTesting.expectOne(
        'https://aihorde.net/api/v2/sharedkeys',
      );
      expect(req.request.method).toBe('PUT');
      expect(req.request.headers.get('apikey')).toBe('user-key');
      req.flush({ id: 'new-sk' });

      expect(mockCache.invalidate).toHaveBeenCalledWith({
        category: 'sharedkeys',
      });
    });

    it('returns ApiError when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);
      let error: ApiError | undefined;
      service.createSharedKey({} as never).subscribe({
        error: (e: unknown) => (error = e as ApiError),
      });
      expect(error).toBeInstanceOf(ApiError);
      expect(error!.status).toBe(401);
    });
  });

  describe('updateSharedKey()', () => {
    it('sends PATCH to the correct URL', () => {
      service.updateSharedKey('sk1', { name: 'Updated' } as never).subscribe();

      const req = httpTesting.expectOne(
        'https://aihorde.net/api/v2/sharedkeys/sk1',
      );
      expect(req.request.method).toBe('PATCH');
      req.flush({ id: 'sk1' });
    });

    it('returns ApiError when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);
      let error: ApiError | undefined;
      service.updateSharedKey('sk1', {} as never).subscribe({
        error: (e: unknown) => (error = e as ApiError),
      });
      expect(error).toBeInstanceOf(ApiError);
      expect(error!.status).toBe(401);
    });
  });

  describe('deleteSharedKey()', () => {
    it('sends DELETE and returns true', () => {
      let result: unknown;
      service.deleteSharedKey('sk1').subscribe((r) => (result = r));

      const req = httpTesting.expectOne(
        'https://aihorde.net/api/v2/sharedkeys/sk1',
      );
      expect(req.request.method).toBe('DELETE');
      req.flush(null);

      expect(result).toBe(true);
      expect(mockCache.invalidate).toHaveBeenCalled();
    });

    it('returns ApiError when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);
      let error: ApiError | undefined;
      service.deleteSharedKey('sk1').subscribe({
        error: (e: unknown) => (error = e as ApiError),
      });
      expect(error).toBeInstanceOf(ApiError);
    });
  });

  describe('error handling', () => {
    it('wraps HTTP errors into ApiError', () => {
      let error: ApiError | undefined;
      service.createSharedKey({ name: 'x' } as never).subscribe({
        error: (e: unknown) => (error = e as ApiError),
      });

      const req = httpTesting.expectOne(
        'https://aihorde.net/api/v2/sharedkeys',
      );
      req.flush(
        { message: 'Forbidden' },
        { status: 403, statusText: 'Forbidden' },
      );

      expect(error).toBeInstanceOf(ApiError);
      expect(error!.status).toBe(403);
    });
  });
});
