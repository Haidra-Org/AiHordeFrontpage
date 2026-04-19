import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, tap, map } from 'rxjs';
import { AuthService } from './auth.service';
import {
  FilterDetails,
  FilterRegex,
  CreateFilterRequest,
  UpdateFilterRequest,
  FilterPromptSuspicion,
  TestPromptRequest,
} from '../types/filter';
import { HordeApiCacheService, CacheTTL } from './horde-api-cache.service';
import { API_BASE_URL } from './api-config';

/**
 * Service for managing AI Horde filters.
 * Provides methods for all filter-related API endpoints.
 * Requires moderator permissions for all operations.
 */
@Injectable({
  providedIn: 'root',
})
export class AdminFilterService {
  private readonly httpClient = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly cache = inject(HordeApiCacheService);
  private readonly baseUrl = inject(API_BASE_URL);

  /**
   * Get authorization headers for API requests.
   */
  private getHeaders(): Record<string, string> {
    const apiKey = this.auth.getStoredApiKey();
    return apiKey ? { apikey: apiKey } : {};
  }

  /**
   * Get all filters, optionally filtered by type or containing word.
   * GET /v2/filters
   *
   * @param filterType Optional filter type to filter by (10-29)
   * @param contains Optional word to search for in filters
   * @returns Observable of filter array, or empty array on error
   */
  public getFilters(
    filterType?: number,
    contains?: string,
  ): Observable<FilterDetails[]> {
    let params = new HttpParams();
    if (filterType !== undefined) {
      params = params.set('filter_type', filterType.toString());
    }
    if (contains) {
      params = params.set('contains', contains);
    }

    return this.cache.cachedGet<FilterDetails[]>(
      `${this.baseUrl}/filters`,
      { headers: this.getHeaders(), params },
      { ttl: CacheTTL.SHORT, category: 'admin-filters' },
    );
  }

  /**
   * Get a single filter by ID.
   * GET /v2/filters/{filter_id}
   *
   * @param id The UUID of the filter
   * @returns Observable of filter details, or null on error
   */
  public getFilter(id: string): Observable<FilterDetails | null> {
    return this.cache.cachedGet<FilterDetails>(
      `${this.baseUrl}/filters/${id}`,
      { headers: this.getHeaders() },
      { ttl: CacheTTL.SHORT, category: 'admin-filters' },
    );
  }

  /**
   * Create a new filter.
   * PUT /v2/filters
   *
   * @param data The filter data to create
   * @returns Observable of created filter details, or null on error
   */
  public createFilter(
    data: CreateFilterRequest,
  ): Observable<FilterDetails | null> {
    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) {
      return of(null);
    }

    return this.httpClient
      .put<FilterDetails>(`${this.baseUrl}/filters`, data, {
        headers: { apikey: apiKey },
      })
      .pipe(tap(() => this.cache.invalidate({ category: 'admin-filters' })));
  }

  /**
   * Update an existing filter.
   * PATCH /v2/filters/{filter_id}
   *
   * @param id The UUID of the filter to update
   * @param data The fields to update
   * @returns Observable of updated filter details, or null on error
   */
  public updateFilter(
    id: string,
    data: UpdateFilterRequest,
  ): Observable<FilterDetails | null> {
    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) {
      return of(null);
    }

    return this.httpClient
      .patch<FilterDetails>(`${this.baseUrl}/filters/${id}`, data, {
        headers: { apikey: apiKey },
      })
      .pipe(tap(() => this.cache.invalidate({ category: 'admin-filters' })));
  }

  /**
   * Delete a filter.
   * DELETE /v2/filters/{filter_id}
   *
   * @param id The UUID of the filter to delete
   * @returns Observable of true if successful, false on error
   */
  public deleteFilter(id: string): Observable<boolean> {
    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) {
      return of(false);
    }

    return this.httpClient
      .delete(`${this.baseUrl}/filters/${id}`, {
        headers: { apikey: apiKey },
        observe: 'response',
      })
      .pipe(
        tap(() => this.cache.invalidate({ category: 'admin-filters' })),
        map(() => true),
      );
  }

  /**
   * Test a prompt against filters.
   * POST /v2/filters
   *
   * @param data The prompt to test
   * @returns Observable of suspicion result, or null on error
   */
  public testPrompt(
    data: TestPromptRequest,
  ): Observable<FilterPromptSuspicion | null> {
    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) {
      return of(null);
    }

    return this.httpClient.post<FilterPromptSuspicion>(
      `${this.baseUrl}/filters`,
      data,
      {
        headers: { apikey: apiKey },
      },
    );
  }

  /**
   * Get compiled regex patterns for filter types.
   * GET /v2/filters/regex
   *
   * @param filterType Optional filter type to get regex for (10-29)
   * @returns Observable of compiled regex array, or empty array on error
   */
  public getCompiledRegex(filterType?: number): Observable<FilterRegex[]> {
    let params = new HttpParams();
    if (filterType !== undefined) {
      params = params.set('filter_type', filterType.toString());
    }

    return this.cache.cachedGet<FilterRegex[]>(
      `${this.baseUrl}/filters/regex`,
      { headers: this.getHeaders(), params },
      { ttl: CacheTTL.SHORT, category: 'admin-filters' },
    );
  }
}
