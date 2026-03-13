import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable, finalize, of, shareReplay, tap } from 'rxjs';
import { CLIENT_AGENT } from './interceptors/client-agent.interceptor';

/** Per-call cache configuration. */
export interface CacheConfig {
  /** Time-to-live in milliseconds. 0 = never cache. */
  ttl: number;
  /**
   * Category tag used for bulk invalidation.
   * e.g. 'styles', 'stats', 'models', 'admin'
   */
  category?: string;
}

/** Pre-defined TTL constants (milliseconds). */
export const CacheTTL = {
  NEVER: 0,
  SHORT: 30_000, // 30 s — admin data
  MEDIUM: 120_000, // 2 min — performance, user
  LONG: 300_000, // 5 min — stats, styles, models
  VERY_LONG: 600_000, // 10 min — news, local JSON data
} as const;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  category?: string;
}

@Injectable({ providedIn: 'root' })
export class HordeApiCacheService {
  private readonly httpClient = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Observable<unknown>>();

  /**
   * Perform a cached GET request. Serves from cache if fresh,
   * deduplicates in-flight requests to the same key, and stores
   * the result for future callers.
   *
   * @param url       Full URL
   * @param options   Optional headers, params, HttpContext
   * @param config    Cache TTL and category
   */
  public cachedGet<T>(
    url: string,
    options?: {
      params?: HttpParams;
      headers?: Record<string, string>;
      context?: HttpContext;
    },
    config: CacheConfig = { ttl: CacheTTL.LONG },
  ): Observable<T> {
    // Skip caching entirely during SSR
    if (!isPlatformBrowser(this.platformId)) {
      return this.rawGet<T>(url, options);
    }

    if (config.ttl === CacheTTL.NEVER) {
      return this.rawGet<T>(url, options);
    }

    const key = this.buildKey(
      url,
      options?.params,
      options?.headers,
      options?.context,
    );

    // 1. Fresh cache hit
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return of(cached.data);
    }

    // 2. In-flight deduplication
    const existing = this.inFlight.get(key) as Observable<T> | undefined;
    if (existing) {
      return existing;
    }

    // 3. New request
    const request$ = this.rawGet<T>(url, options).pipe(
      tap((data) => {
        this.cache.set(key, {
          data,
          timestamp: Date.now(),
          ttl: config.ttl,
          category: config.category,
        });
      }),
      finalize(() => this.inFlight.delete(key)),
      shareReplay(1),
    );

    this.inFlight.set(key, request$);
    return request$;
  }

  /**
   * Invalidate cached entries. Supports exact key or category-based
   * invalidation.
   *
   * @param target  A cache key prefix, or a `{ category: '...' }` object.
   */
  public invalidate(target: string | { category: string }): void {
    if (typeof target === 'string') {
      for (const key of this.cache.keys()) {
        if (key.startsWith(target)) {
          this.cache.delete(key);
          this.inFlight.delete(key);
        }
      }
    } else {
      for (const [key, entry] of this.cache.entries()) {
        if (entry.category === target.category) {
          this.cache.delete(key);
          this.inFlight.delete(key);
        }
      }
    }
  }

  /** Drop everything. */
  public clear(): void {
    this.cache.clear();
    this.inFlight.clear();
  }

  // ────────────────────────────────────────────────────────────────────────

  private rawGet<T>(
    url: string,
    options?: {
      params?: HttpParams;
      headers?: Record<string, string>;
      context?: HttpContext;
    },
  ): Observable<T> {
    return this.httpClient.get<T>(url, {
      params: options?.params,
      headers: options?.headers,
      context: options?.context,
    });
  }

  private buildKey(
    url: string,
    params?: HttpParams,
    headers?: Record<string, string>,
    context?: HttpContext,
  ): string {
    const paramStr = params ? params.toString() : '';
    const headerKey = this.buildHeaderKey(headers);
    const agentKey = context?.get(CLIENT_AGENT) ?? '';
    const base = paramStr ? `${url}?${paramStr}` : url;
    return `${base}::h=${headerKey}::a=${agentKey}`;
  }

  private buildHeaderKey(headers?: Record<string, string>): string {
    if (!headers) return '';

    return Object.entries(headers)
      .map(([k, v]) => [k.toLowerCase(), v] as const)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('|');
  }
}
