import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { StyleService } from './style.service';
import { AuthService } from './auth.service';
import { HordeApiCacheService } from './horde-api-cache.service';
import { ApiError } from '../types/api-error';
import { API_BASE } from '../testing/api-test-helpers';

describe('StyleService', () => {
  let service: StyleService;
  let httpTesting: HttpTestingController;
  let mockAuth: { getStoredApiKey: ReturnType<typeof vi.fn> };
  let mockCache: {
    cachedGet: ReturnType<typeof vi.fn>;
    invalidate: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockAuth = { getStoredApiKey: vi.fn().mockReturnValue('test-key') };
    mockCache = {
      cachedGet: vi.fn().mockReturnValue(of([])),
      invalidate: vi.fn(),
      clear: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuth },
        { provide: HordeApiCacheService, useValue: mockCache },
      ],
    });

    service = TestBed.inject(StyleService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  // ===========================================================================
  // Read operations use cache
  // ===========================================================================

  describe('image style reads', () => {
    it('getImageStyles delegates to the cache', () => {
      const styles = [{ id: 's1' }];
      mockCache.cachedGet.mockReturnValue(of(styles));

      let result: unknown;
      service.getImageStyles().subscribe((r) => (result = r));

      expect(result).toEqual(styles);
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.stringContaining('/styles/image'),
        expect.anything(),
        expect.objectContaining({ category: 'styles' }),
      );
    });

    it('getImageStyles passes query params', () => {
      mockCache.cachedGet.mockReturnValue(of([]));
      service
        .getImageStyles({ sort: 'popular', page: 2, tag: 'anime' })
        .subscribe();

      const opts = mockCache.cachedGet.mock.calls[0][1];
      const params = opts.params;
      expect(params.get('sort')).toBe('popular');
      expect(params.get('page')).toBe('2');
      expect(params.get('tag')).toBe('anime');
    });

    it('getImageStyle fetches by ID', () => {
      mockCache.cachedGet.mockReturnValue(of({ id: 'abc' }));
      service.getImageStyle('abc').subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.stringContaining('/styles/image/abc'),
        expect.anything(),
        expect.anything(),
      );
    });

    it('getImageStyleByName URL-encodes the name', () => {
      mockCache.cachedGet.mockReturnValue(of({ id: 'x' }));
      service.getImageStyleByName('My Cool Style').subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.stringContaining('/image_by_name/My%20Cool%20Style'),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('text style reads', () => {
    it('getTextStyles delegates to the cache', () => {
      mockCache.cachedGet.mockReturnValue(of([]));
      service.getTextStyles().subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.stringContaining('/styles/text'),
        expect.anything(),
        expect.objectContaining({ category: 'styles' }),
      );
    });

    it('getTextStyleByName URL-encodes the name', () => {
      mockCache.cachedGet.mockReturnValue(of({ id: 'x' }));
      service.getTextStyleByName('Name & Special').subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.stringContaining('/text_by_name/Name%20%26%20Special'),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('collection reads', () => {
    it('getCollections delegates to cache with category=collections', () => {
      mockCache.cachedGet.mockReturnValue(of([]));
      service.getCollections().subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.stringContaining('/collections'),
        expect.anything(),
        expect.objectContaining({ category: 'collections' }),
      );
    });

    it('getCollections passes type filter', () => {
      mockCache.cachedGet.mockReturnValue(of([]));
      service.getCollections({ type: 'image' }).subscribe();
      const params = mockCache.cachedGet.mock.calls[0][1].params;
      expect(params.get('type')).toBe('image');
    });

    it('getCollections omits type param when type is "all"', () => {
      mockCache.cachedGet.mockReturnValue(of([]));
      service.getCollections({ type: 'all' }).subscribe();
      const params = mockCache.cachedGet.mock.calls[0][1].params;
      expect(params.has('type')).toBe(false);
    });
  });

  // ===========================================================================
  // Write operations require auth and invalidate cache
  // ===========================================================================

  describe('write operations', () => {
    it('createImageStyle sends POST with apikey header', () => {
      const payload = { name: 'New Style', prompt: 'test {p}' };
      service.createImageStyle(payload as never).subscribe();

      const req = httpTesting.expectOne(`${API_BASE}/styles/image`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('apikey')).toBe('test-key');
      req.flush({ id: 'new-id' });

      expect(mockCache.invalidate).toHaveBeenCalledWith({
        category: 'styles',
      });
    });

    it('updateImageStyle sends PATCH to correct URL', () => {
      service.updateImageStyle('s1', { name: 'Updated' } as never).subscribe();
      const req = httpTesting.expectOne(`${API_BASE}/styles/image/s1`);
      expect(req.request.method).toBe('PATCH');
      req.flush({ id: 's1' });
    });

    it('deleteImageStyle sends DELETE and returns true', () => {
      let result: unknown;
      service.deleteImageStyle('s1').subscribe((r) => (result = r));
      const req = httpTesting.expectOne(`${API_BASE}/styles/image/s1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
      expect(result).toBe(true);
    });

    it('createTextStyle sends POST', () => {
      service.createTextStyle({ name: 'TS' } as never).subscribe();
      const req = httpTesting.expectOne(`${API_BASE}/styles/text`);
      expect(req.request.method).toBe('POST');
      req.flush({ id: 'ts1' });
    });

    it('deleteTextStyle sends DELETE', () => {
      service.deleteTextStyle('ts1').subscribe();
      const req = httpTesting.expectOne(`${API_BASE}/styles/text/ts1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  // ===========================================================================
  // Auth guard: throw when no API key
  // ===========================================================================

  describe('auth guard', () => {
    it('throws an error when API key is missing for write operations', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);

      expect(() =>
        service.createImageStyle({ name: 'x' } as never).subscribe(),
      ).toThrow('API key required');
    });
  });

  // ===========================================================================
  // Example operations
  // ===========================================================================

  describe('image style examples', () => {
    it('addImageStyleExample sends POST to the example endpoint', () => {
      service
        .addImageStyleExample('s1', { url: 'https://img.example.com' } as never)
        .subscribe();
      const req = httpTesting.expectOne(`${API_BASE}/styles/image/s1/example`);
      expect(req.request.method).toBe('POST');
      req.flush({ id: 'ex1' });
    });

    it('updateImageStyleExample sends PATCH', () => {
      service
        .updateImageStyleExample('s1', 'ex1', { primary: true } as never)
        .subscribe();
      const req = httpTesting.expectOne(
        `${API_BASE}/styles/image/s1/example/ex1`,
      );
      expect(req.request.method).toBe('PATCH');
      req.flush({ id: 'ex1' });
    });

    it('deleteImageStyleExample sends DELETE', () => {
      let result: unknown;
      service
        .deleteImageStyleExample('s1', 'ex1')
        .subscribe((r) => (result = r));
      const req = httpTesting.expectOne(
        `${API_BASE}/styles/image/s1/example/ex1`,
      );
      req.flush(null);
      expect(result).toBe(true);
    });
  });

  // ===========================================================================
  // Stubbed collection write operations
  // ===========================================================================

  describe('stubbed collection writes', () => {
    it('createCollection returns an error with status 501', () => {
      let error: ApiError | undefined;
      service.createCollection().subscribe({
        error: (e: unknown) => (error = e as ApiError),
      });
      expect(error).toBeInstanceOf(ApiError);
      expect(error!.status).toBe(501);
    });

    it('updateCollection returns an error with status 501', () => {
      let error: ApiError | undefined;
      service.updateCollection().subscribe({
        error: (e: unknown) => (error = e as ApiError),
      });
      expect(error).toBeInstanceOf(ApiError);
    });

    it('deleteCollection returns an error with status 501', () => {
      let error: ApiError | undefined;
      service.deleteCollection().subscribe({
        error: (e: unknown) => (error = e as ApiError),
      });
      expect(error).toBeInstanceOf(ApiError);
    });
  });

  // ===========================================================================
  // Error handling
  // ===========================================================================

  describe('error handling', () => {
    it('wraps HTTP errors into ApiError with message and status', () => {
      let error: ApiError | undefined;
      service.createImageStyle({ name: 'fail' } as never).subscribe({
        error: (e: unknown) => (error = e as ApiError),
      });

      const req = httpTesting.expectOne(`${API_BASE}/styles/image`);
      req.flush(
        { message: 'Forbidden', rc: 'StyleOwnerOnly' },
        { status: 403, statusText: 'Forbidden' },
      );

      expect(error).toBeInstanceOf(ApiError);
      expect(error!.message).toBe('Forbidden');
      expect(error!.status).toBe(403);
      expect(error!.rc).toBe('StyleOwnerOnly');
    });
  });
});
