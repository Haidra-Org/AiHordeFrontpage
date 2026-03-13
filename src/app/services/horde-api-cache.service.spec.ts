import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { HttpContext, HttpParams } from '@angular/common/http';
import {
  HordeApiCacheService,
  CacheTTL,
} from './horde-api-cache.service';
import { CLIENT_AGENT } from './interceptors/client-agent.interceptor';

describe('HordeApiCacheService', () => {
  let service: HordeApiCacheService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    service = TestBed.inject(HordeApiCacheService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    service.clear();
  });

  // ========================================================================
  // Basic caching
  // ========================================================================

  describe('cachedGet basics', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should make an HTTP request on first call', () => {
      service
        .cachedGet('https://aihorde.net/api/v2/status/performance')
        .subscribe();

      const req = httpTesting.expectOne(
        'https://aihorde.net/api/v2/status/performance',
      );
      expect(req.request.method).toBe('GET');
      req.flush({ worker_count: 42 });
    });

    it('should return cached data on second call within TTL', fakeAsync(() => {
      let firstResult: unknown;
      let secondResult: unknown;

      // First call
      service
        .cachedGet('https://aihorde.net/api/v2/status/performance', {}, {
          ttl: CacheTTL.LONG,
        })
        .subscribe((r) => (firstResult = r));

      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/performance')
        .flush({ worker_count: 42 });

      tick(1000); // 1s later — well within 300s TTL

      // Second call — should be served from cache
      service
        .cachedGet('https://aihorde.net/api/v2/status/performance', {}, {
          ttl: CacheTTL.LONG,
        })
        .subscribe((r) => (secondResult = r));

      // No new HTTP request should be made
      httpTesting.expectNone(
        'https://aihorde.net/api/v2/status/performance',
      );

      expect(firstResult).toEqual({ worker_count: 42 });
      expect(secondResult).toEqual({ worker_count: 42 });
    }));

    it('should refetch after TTL expires', fakeAsync(() => {
      let result: unknown;

      // First call
      service
        .cachedGet('https://aihorde.net/api/v2/status/performance', {}, {
          ttl: CacheTTL.SHORT, // 30s
        })
        .subscribe();

      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/performance')
        .flush({ worker_count: 42 });

      tick(31_000); // Past the 30s TTL

      // Second call — cache is stale, should make a new request
      service
        .cachedGet('https://aihorde.net/api/v2/status/performance', {}, {
          ttl: CacheTTL.SHORT,
        })
        .subscribe((r) => (result = r));

      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/performance')
        .flush({ worker_count: 99 });

      expect(result).toEqual({ worker_count: 99 });
    }));

    it('should not cache when TTL is NEVER (0)', fakeAsync(() => {
      let result1: unknown;
      let result2: unknown;

      // First call
      service
        .cachedGet<{worker_count: number}>('https://aihorde.net/api/v2/status/performance', {}, {
          ttl: CacheTTL.NEVER,
        })
        .subscribe((r) => (result1 = r));

      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/performance')
        .flush({ worker_count: 42 });

      // Second call — should make a new request
      service
        .cachedGet<{worker_count: number}>('https://aihorde.net/api/v2/status/performance', {}, {
          ttl: CacheTTL.NEVER,
        })
        .subscribe((r) => (result2 = r));

      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/performance')
        .flush({ worker_count: 43 });

      expect(result1).toEqual({ worker_count: 42 });
      expect(result2).toEqual({ worker_count: 43 });
    }));
  });

  // ========================================================================
  // In-flight deduplication
  // ========================================================================

  describe('in-flight deduplication', () => {
    it('should deduplicate concurrent requests to the same URL', () => {
      let result1: unknown;
      let result2: unknown;

      // Two concurrent subscriptions to the same URL
      service
        .cachedGet('https://aihorde.net/api/v2/status/performance')
        .subscribe((r) => (result1 = r));
      service
        .cachedGet('https://aihorde.net/api/v2/status/performance')
        .subscribe((r) => (result2 = r));

      // Only ONE HTTP request should be made
      const requests = httpTesting.match(
        'https://aihorde.net/api/v2/status/performance',
      );
      expect(requests.length).toBe(1);

      requests[0].flush({ worker_count: 42 });

      expect(result1).toEqual({ worker_count: 42 });
      expect(result2).toEqual({ worker_count: 42 });
    });

    it('should NOT deduplicate requests to different URLs', () => {
      let result1: unknown;
      let result2: unknown;

      service
        .cachedGet('https://aihorde.net/api/v2/status/performance')
        .subscribe((r) => (result1 = r));
      service
        .cachedGet('https://aihorde.net/api/v2/status/models')
        .subscribe((r) => (result2 = r));

      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/performance')
        .flush({ perf: true });
      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/models')
        .flush([{ model: true }]);

      expect(result1).toEqual({ perf: true });
      expect(result2).toEqual([{ model: true }]);
    });
  });

  // ========================================================================
  // Cache key differentiation with query params
  // ========================================================================

  describe('cache key with params', () => {
    it('should cache different params as separate entries', fakeAsync(() => {
      const paramsImage = new HttpParams().set('type', 'image');
      const paramsText = new HttpParams().set('type', 'text');
      let resultImage: unknown;
      let resultText: unknown;

      service
        .cachedGet('https://aihorde.net/api/v2/status/models', {
          params: paramsImage,
        })
        .subscribe((r) => (resultImage = r));

      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/models?type=image')
        .flush([{ name: 'SD' }]);

      service
        .cachedGet('https://aihorde.net/api/v2/status/models', {
          params: paramsText,
        })
        .subscribe((r) => (resultText = r));

      // Different params → different cache key → new request
      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/models?type=text')
        .flush([{ name: 'LLaMA' }]);

      expect(resultImage).toEqual([{ name: 'SD' }]);
      expect(resultText).toEqual([{ name: 'LLaMA' }]);
    }));

    it('should serve from cache for same URL + same params', fakeAsync(() => {
      const params = new HttpParams().set('type', 'image');
      let result1: unknown;
      let result2: unknown;

      service
        .cachedGet(
          'https://aihorde.net/api/v2/status/models',
          { params },
          { ttl: CacheTTL.LONG },
        )
        .subscribe((r) => (result1 = r));

      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/models?type=image')
        .flush([{ name: 'SD' }]);

      tick(1000);

      // Same URL + same params → should be cached
      service
        .cachedGet(
          'https://aihorde.net/api/v2/status/models',
          { params },
          { ttl: CacheTTL.LONG },
        )
        .subscribe((r) => (result2 = r));

      httpTesting.expectNone(
        'https://aihorde.net/api/v2/status/models?type=image',
      );

      expect(result1).toEqual([{ name: 'SD' }]);
      expect(result2).toEqual([{ name: 'SD' }]);
    }));

    it('should treat different headers as different cache keys', fakeAsync(() => {
      let keyAResult: unknown;
      let keyBResult: unknown;

      service
        .cachedGet(
          'https://aihorde.net/api/v2/find_user',
          { headers: { apikey: 'key-a' } },
          { ttl: CacheTTL.LONG },
        )
        .subscribe((r) => (keyAResult = r));

      httpTesting.expectOne('https://aihorde.net/api/v2/find_user').flush({
        username: 'A',
      });

      service
        .cachedGet(
          'https://aihorde.net/api/v2/find_user',
          { headers: { apikey: 'key-b' } },
          { ttl: CacheTTL.LONG },
        )
        .subscribe((r) => (keyBResult = r));

      httpTesting.expectOne('https://aihorde.net/api/v2/find_user').flush({
        username: 'B',
      });

      expect(keyAResult).toEqual({ username: 'A' });
      expect(keyBResult).toEqual({ username: 'B' });
    }));
  });

  // ========================================================================
  // Headers & context forwarding
  // ========================================================================

  describe('options forwarding', () => {
    it('should forward custom headers to the HTTP request', () => {
      service
        .cachedGet('https://aihorde.net/api/v2/find_user', {
          headers: { apikey: 'my-key' },
        })
        .subscribe();

      const req = httpTesting.expectOne(
        'https://aihorde.net/api/v2/find_user',
      );
      expect(req.request.headers.get('apikey')).toBe('my-key');
      req.flush({});
    });

    it('should forward HttpContext to the HTTP request', () => {
      const ctx = new HttpContext().set(
        CLIENT_AGENT,
        'AiHordeFrontpage:test',
      );

      service
        .cachedGet('https://aihorde.net/api/v2/status/performance', {
          context: ctx,
        })
        .subscribe();

      const req = httpTesting.expectOne(
        'https://aihorde.net/api/v2/status/performance',
      );
      expect(req.request.context.get(CLIENT_AGENT)).toBe(
        'AiHordeFrontpage:test',
      );
      req.flush({});
    });
  });

  // ========================================================================
  // Invalidation
  // ========================================================================

  describe('invalidate', () => {
    it('should invalidate by category', fakeAsync(() => {
      let result: unknown;

      // Populate cache
      service
        .cachedGet(
          'https://aihorde.net/api/v2/styles/image',
          {},
          { ttl: CacheTTL.LONG, category: 'styles' },
        )
        .subscribe();

      httpTesting
        .expectOne('https://aihorde.net/api/v2/styles/image')
        .flush([]);

      tick(100);

      // Invalidate entire 'styles' category
      service.invalidate({ category: 'styles' });

      // Next request should go to the network again
      service
        .cachedGet(
          'https://aihorde.net/api/v2/styles/image',
          {},
          { ttl: CacheTTL.LONG, category: 'styles' },
        )
        .subscribe((r) => (result = r));

      httpTesting
        .expectOne('https://aihorde.net/api/v2/styles/image')
        .flush([{ id: 'new' }]);

      expect(result).toEqual([{ id: 'new' }]);
    }));

    it('should invalidate by URL prefix', fakeAsync(() => {
      let result: unknown;

      // Populate cache
      service
        .cachedGet(
          'https://aihorde.net/api/v2/users/42',
          {},
          { ttl: CacheTTL.LONG },
        )
        .subscribe();

      httpTesting
        .expectOne('https://aihorde.net/api/v2/users/42')
        .flush({ id: 42 });

      tick(100);

      // Invalidate by prefix
      service.invalidate('https://aihorde.net/api/v2/users');

      // Should refetch after invalidation
      service
        .cachedGet(
          'https://aihorde.net/api/v2/users/42',
          {},
          { ttl: CacheTTL.LONG },
        )
        .subscribe((r) => (result = r));

      httpTesting
        .expectOne('https://aihorde.net/api/v2/users/42')
        .flush({ id: 42, updated: true });

      expect(result).toEqual({ id: 42, updated: true });
    }));

    it('should only invalidate matching category (not all entries)', fakeAsync(() => {
      let perfResult: unknown;

      // Populate two categories
      service
        .cachedGet(
          'https://aihorde.net/api/v2/styles/image',
          {},
          { ttl: CacheTTL.LONG, category: 'styles' },
        )
        .subscribe();
      httpTesting
        .expectOne('https://aihorde.net/api/v2/styles/image')
        .flush([]);

      service
        .cachedGet(
          'https://aihorde.net/api/v2/status/performance',
          {},
          { ttl: CacheTTL.LONG, category: 'performance' },
        )
        .subscribe();
      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/performance')
        .flush({ cached: true });

      tick(100);

      // Invalidate only styles
      service.invalidate({ category: 'styles' });

      // Styles → should refetch
      service
        .cachedGet(
          'https://aihorde.net/api/v2/styles/image',
          {},
          { ttl: CacheTTL.LONG, category: 'styles' },
        )
        .subscribe();
      httpTesting
        .expectOne('https://aihorde.net/api/v2/styles/image')
        .flush([]);

      // Performance → still cached
      service
        .cachedGet(
          'https://aihorde.net/api/v2/status/performance',
          {},
          { ttl: CacheTTL.LONG, category: 'performance' },
        )
        .subscribe((r) => (perfResult = r));
      httpTesting.expectNone(
        'https://aihorde.net/api/v2/status/performance',
      );

      expect(perfResult).toEqual({ cached: true });
    }));
  });

  // ========================================================================
  // clear()
  // ========================================================================

  describe('clear', () => {
    it('should clear all cached entries', fakeAsync(() => {
      let result: unknown;

      service
        .cachedGet(
          'https://aihorde.net/api/v2/status/performance',
          {},
          { ttl: CacheTTL.LONG },
        )
        .subscribe();
      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/performance')
        .flush({});

      tick(100);

      service.clear();

      service
        .cachedGet(
          'https://aihorde.net/api/v2/status/performance',
          {},
          { ttl: CacheTTL.LONG },
        )
        .subscribe((r) => (result = r));
      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/performance')
        .flush({ refreshed: true });

      expect(result).toEqual({ refreshed: true });
    }));
  });

  // ========================================================================
  // SSR behavior
  // ========================================================================

  describe('SSR (server platform)', () => {
    let ssrService: HordeApiCacheService;
    let ssrHttpTesting: HttpTestingController;

    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: PLATFORM_ID, useValue: 'server' },
        ],
      });
      ssrService = TestBed.inject(HordeApiCacheService);
      ssrHttpTesting = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
      ssrHttpTesting.verify();
    });

    it('should NOT cache during SSR', () => {
      let result1: unknown;
      let result2: unknown;

      // First call
      ssrService
        .cachedGet(
          'https://aihorde.net/api/v2/status/performance',
          {},
          { ttl: CacheTTL.LONG },
        )
        .subscribe((r) => (result1 = r));
      ssrHttpTesting
        .expectOne('https://aihorde.net/api/v2/status/performance')
        .flush({ call: 1 });

      // Second call — should still make a network request (no caching on server)
      ssrService
        .cachedGet(
          'https://aihorde.net/api/v2/status/performance',
          {},
          { ttl: CacheTTL.LONG },
        )
        .subscribe((r) => (result2 = r));
      ssrHttpTesting
        .expectOne('https://aihorde.net/api/v2/status/performance')
        .flush({ call: 2 });

      expect(result1).toEqual({ call: 1 });
      expect(result2).toEqual({ call: 2 });
    });
  });

  // ========================================================================
  // CacheTTL constants
  // ========================================================================

  describe('CacheTTL constants', () => {
    it('should have correct values', () => {
      expect(CacheTTL.NEVER).toBe(0);
      expect(CacheTTL.SHORT).toBe(30_000);
      expect(CacheTTL.MEDIUM).toBe(120_000);
      expect(CacheTTL.LONG).toBe(300_000);
      expect(CacheTTL.VERY_LONG).toBe(600_000);
    });

    it('each TTL should be longer than the previous', () => {
      expect(CacheTTL.SHORT).toBeGreaterThan(CacheTTL.NEVER);
      expect(CacheTTL.MEDIUM).toBeGreaterThan(CacheTTL.SHORT);
      expect(CacheTTL.LONG).toBeGreaterThan(CacheTTL.MEDIUM);
      expect(CacheTTL.VERY_LONG).toBeGreaterThan(CacheTTL.LONG);
    });
  });

  // ========================================================================
  // Error handling
  // ========================================================================

  describe('error handling', () => {
    it('should NOT cache failed responses', fakeAsync(() => {
      let error: unknown;

      service
        .cachedGet(
          'https://aihorde.net/api/v2/status/performance',
          {},
          { ttl: CacheTTL.LONG },
        )
        .subscribe({ error: (e) => (error = e) });

      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/performance')
        .flush('Server error', {
          status: 500,
          statusText: 'Internal Server Error',
        });

      expect(error).toBeTruthy();

      // Next call should attempt a fresh request (error wasn't cached)
      service
        .cachedGet(
          'https://aihorde.net/api/v2/status/performance',
          {},
          { ttl: CacheTTL.LONG },
        )
        .subscribe();

      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/performance')
        .flush({ worker_count: 42 });
    }));

    it('should clear in-flight entry after failure', () => {
      let firstError: unknown;
      let secondResult: unknown;

      service
        .cachedGet(
          'https://aihorde.net/api/v2/status/performance',
          {},
          { ttl: CacheTTL.LONG },
        )
        .subscribe({ error: (e) => (firstError = e) });

      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/performance')
        .flush('Server error', {
          status: 500,
          statusText: 'Internal Server Error',
        });

      expect(firstError).toBeTruthy();

      service
        .cachedGet(
          'https://aihorde.net/api/v2/status/performance',
          {},
          { ttl: CacheTTL.LONG },
        )
        .subscribe((r) => (secondResult = r));

      httpTesting
        .expectOne('https://aihorde.net/api/v2/status/performance')
        .flush({ worker_count: 99 });

      expect(secondResult).toEqual({ worker_count: 99 });
    });
  });
});
