import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { AdminFilterService } from './admin-filter.service';
import { AuthService } from './auth.service';
import { HordeApiCacheService } from './horde-api-cache.service';

describe('AdminFilterService', () => {
  let service: AdminFilterService;
  let httpTesting: HttpTestingController;
  let mockAuth: { getStoredApiKey: ReturnType<typeof vi.fn> };
  let mockCache: {
    cachedGet: ReturnType<typeof vi.fn>;
    invalidate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockAuth = { getStoredApiKey: vi.fn().mockReturnValue('mod-key') };
    mockCache = {
      cachedGet: vi.fn().mockReturnValue(of([])),
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

    service = TestBed.inject(AdminFilterService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  // ===========================================================================
  // getFilters
  // ===========================================================================

  describe('getFilters()', () => {
    it('fetches all filters via cache', () => {
      const filters = [{ id: 'f1' }];
      mockCache.cachedGet.mockReturnValue(of(filters));

      let result: unknown;
      service.getFilters().subscribe((r) => (result = r));

      expect(result).toEqual(filters);
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.stringContaining('/filters'),
        expect.objectContaining({ headers: { apikey: 'mod-key' } }),
        expect.objectContaining({ category: 'admin-filters' }),
      );
    });

    it('passes filterType as query param', () => {
      mockCache.cachedGet.mockReturnValue(of([]));
      service.getFilters(15).subscribe();
      const params = mockCache.cachedGet.mock.calls[0][1].params;
      expect(params.get('filter_type')).toBe('15');
    });

    it('passes contains as query param', () => {
      mockCache.cachedGet.mockReturnValue(of([]));
      service.getFilters(undefined, 'badword').subscribe();
      const params = mockCache.cachedGet.mock.calls[0][1].params;
      expect(params.get('contains')).toBe('badword');
      expect(params.has('filter_type')).toBe(false);
    });

    it('sends empty headers when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);
      mockCache.cachedGet.mockReturnValue(of([]));
      service.getFilters().subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ headers: {} }),
        expect.anything(),
      );
    });
  });

  // ===========================================================================
  // getFilter
  // ===========================================================================

  describe('getFilter()', () => {
    it('fetches single filter by ID', () => {
      const filter = { id: 'abc-123', filter_type: 10 };
      mockCache.cachedGet.mockReturnValue(of(filter));

      let result: unknown;
      service.getFilter('abc-123').subscribe((r) => (result = r));
      expect(result).toEqual(filter);
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.stringContaining('/filters/abc-123'),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // ===========================================================================
  // createFilter
  // ===========================================================================

  describe('createFilter()', () => {
    it('sends PUT with apikey and invalidates cache', () => {
      const payload = { regex: 'bad.*word', filter_type: 10 };
      service.createFilter(payload as never).subscribe();

      const req = httpTesting.expectOne('https://aihorde.net/api/v2/filters');
      expect(req.request.method).toBe('PUT');
      expect(req.request.headers.get('apikey')).toBe('mod-key');
      req.flush({ id: 'new-id' });

      expect(mockCache.invalidate).toHaveBeenCalledWith({
        category: 'admin-filters',
      });
    });

    it('returns null when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);
      let result: unknown = 'not-null';
      service.createFilter({} as never).subscribe((r) => (result = r));
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // updateFilter
  // ===========================================================================

  describe('updateFilter()', () => {
    it('sends PATCH to correct URL', () => {
      service
        .updateFilter('f1', { description: 'updated' } as never)
        .subscribe();
      const req = httpTesting.expectOne(
        'https://aihorde.net/api/v2/filters/f1',
      );
      expect(req.request.method).toBe('PATCH');
      req.flush({ id: 'f1' });
      expect(mockCache.invalidate).toHaveBeenCalled();
    });

    it('returns null when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);
      let result: unknown = 'not-null';
      service.updateFilter('f1', {} as never).subscribe((r) => (result = r));
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // deleteFilter
  // ===========================================================================

  describe('deleteFilter()', () => {
    it('sends DELETE and returns true on success', () => {
      let result: unknown;
      service.deleteFilter('f1').subscribe((r) => (result = r));
      const req = httpTesting.expectOne(
        'https://aihorde.net/api/v2/filters/f1',
      );
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
      expect(result).toBe(true);
      expect(mockCache.invalidate).toHaveBeenCalled();
    });

    it('returns false when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);
      let result: unknown;
      service.deleteFilter('f1').subscribe((r) => (result = r));
      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // testPrompt
  // ===========================================================================

  describe('testPrompt()', () => {
    it('sends POST with prompt data', () => {
      service.testPrompt({ prompt: 'hello world' } as never).subscribe();
      const req = httpTesting.expectOne('https://aihorde.net/api/v2/filters');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ prompt: 'hello world' });
      req.flush({ suspicion: 0 });
    });

    it('returns null when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);
      let result: unknown = 'not-null';
      service.testPrompt({} as never).subscribe((r) => (result = r));
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // getCompiledRegex
  // ===========================================================================

  describe('getCompiledRegex()', () => {
    it('fetches regex patterns via cache', () => {
      mockCache.cachedGet.mockReturnValue(of([{ filter_type: 10 }]));
      service.getCompiledRegex().subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.stringContaining('/filters/regex'),
        expect.anything(),
        expect.anything(),
      );
    });

    it('passes filter_type when provided', () => {
      mockCache.cachedGet.mockReturnValue(of([]));
      service.getCompiledRegex(20).subscribe();
      const params = mockCache.cachedGet.mock.calls[0][1].params;
      expect(params.get('filter_type')).toBe('20');
    });
  });
});
