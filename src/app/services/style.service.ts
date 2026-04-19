import { Injectable, inject } from '@angular/core';
import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  HttpParams,
} from '@angular/common/http';
import { Observable, catchError, map, tap, throwError } from 'rxjs';
import { extractApiErrorField } from '../helper/extract-api-error';
import { AuthService } from './auth.service';
import {
  ImageStyle,
  TextStyle,
  StyleModifyResponse,
  StyleExample,
} from '../types/style';
import { ApiError } from '../types/api-error';
import { StyleCollection } from '../types/style-collection';
import {
  StyleQueryParams,
  CollectionQueryParams,
  CreateImageStyleInput,
  UpdateImageStyleInput,
  CreateTextStyleInput,
  UpdateTextStyleInput,
  AddStyleExampleInput,
  UpdateStyleExampleInput,
  AddStyleExampleResponse,
} from '../types/style-api';
import { HordeApiCacheService, CacheTTL } from './horde-api-cache.service';
import { CLIENT_AGENT } from './interceptors/client-agent.interceptor';
import { API_BASE_URL } from './api-config';

@Injectable({
  providedIn: 'root',
})
export class StyleService {
  private readonly httpClient = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly cache = inject(HordeApiCacheService);
  private readonly baseUrl = inject(API_BASE_URL);

  private readonly styleContext = new HttpContext().set(
    CLIENT_AGENT,
    'AiHordeFrontpage:styles',
  );

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private buildAuthHeaders(): Record<string, string> {
    const apiKey = this.ensureApiKey();
    return apiKey ? { apikey: apiKey } : {};
  }

  private ensureApiKey(): string | null {
    return this.auth.getStoredApiKey();
  }

  private requireApiKey(): string {
    const apiKey = this.ensureApiKey();
    if (!apiKey) {
      throw new Error('API key required for this operation');
    }
    return apiKey;
  }

  private handleError = (error: unknown): Observable<never> => {
    if (error instanceof HttpErrorResponse) {
      return throwError(
        () =>
          new ApiError(
            extractApiErrorField(error, 'message') ??
              'Unexpected error while contacting the API.',
            error.status ?? 0,
            extractApiErrorField(error, 'rc'),
          ),
      );
    }
    return throwError(() =>
      error instanceof Error ? error : new ApiError('Unexpected error', 0),
    );
  };

  private buildQueryParams(params: StyleQueryParams): HttpParams {
    let httpParams = new HttpParams();
    if (params.sort) {
      httpParams = httpParams.set('sort', params.sort);
    }
    if (params.page !== undefined) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params.tag) {
      httpParams = httpParams.set('tag', params.tag);
    }
    if (params.model) {
      httpParams = httpParams.set('model', params.model);
    }
    return httpParams;
  }

  private buildCollectionQueryParams(
    params: CollectionQueryParams,
  ): HttpParams {
    let httpParams = new HttpParams();
    if (params.sort) {
      httpParams = httpParams.set('sort', params.sort);
    }
    if (params.page !== undefined) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params.type && params.type !== 'all') {
      httpParams = httpParams.set('type', params.type);
    }
    return httpParams;
  }

  // ==========================================================================
  // Image Styles - Read Operations
  // ==========================================================================

  /**
   * Get a paginated list of public image styles.
   */
  public getImageStyles(
    params: StyleQueryParams = {},
  ): Observable<ImageStyle[]> {
    const httpParams = this.buildQueryParams(params);
    return this.cache
      .cachedGet<
        ImageStyle[]
      >(`${this.baseUrl}/styles/image`, { params: httpParams, context: this.styleContext }, { ttl: CacheTTL.LONG, category: 'styles' })
      .pipe(catchError((err: unknown) => this.handleError(err)));
  }

  /**
   * Get a single image style by ID.
   */
  public getImageStyle(styleId: string): Observable<ImageStyle> {
    return this.cache
      .cachedGet<ImageStyle>(
        `${this.baseUrl}/styles/image/${styleId}`,
        { context: this.styleContext },
        { ttl: CacheTTL.LONG, category: 'styles' },
      )
      .pipe(catchError((err: unknown) => this.handleError(err)));
  }

  /**
   * Get an image style by name.
   */
  public getImageStyleByName(styleName: string): Observable<ImageStyle> {
    return this.cache
      .cachedGet<ImageStyle>(
        `${this.baseUrl}/styles/image_by_name/${encodeURIComponent(styleName)}`,
        { context: this.styleContext },
        { ttl: CacheTTL.LONG, category: 'styles' },
      )
      .pipe(catchError((err: unknown) => this.handleError(err)));
  }

  // ==========================================================================
  // Image Styles - Write Operations
  // ==========================================================================

  /**
   * Create a new image style.
   * Requires authentication.
   */
  public createImageStyle(
    payload: CreateImageStyleInput,
  ): Observable<StyleModifyResponse> {
    const apiKey = this.requireApiKey();
    return this.httpClient
      .post<StyleModifyResponse>(`${this.baseUrl}/styles/image`, payload, {
        headers: { apikey: apiKey },
        context: this.styleContext,
      })
      .pipe(
        tap(() => this.cache.invalidate({ category: 'styles' })),
        catchError((err: unknown) => this.handleError(err)),
      );
  }

  /**
   * Update an existing image style.
   * Requires authentication and ownership.
   */
  public updateImageStyle(
    styleId: string,
    payload: UpdateImageStyleInput,
  ): Observable<StyleModifyResponse> {
    const apiKey = this.requireApiKey();
    return this.httpClient
      .patch<StyleModifyResponse>(
        `${this.baseUrl}/styles/image/${styleId}`,
        payload,
        {
          headers: { apikey: apiKey },
          context: this.styleContext,
        },
      )
      .pipe(
        tap(() => this.cache.invalidate({ category: 'styles' })),
        catchError((err: unknown) => this.handleError(err)),
      );
  }

  /**
   * Delete an image style.
   * Requires moderator authentication or ownership.
   */
  public deleteImageStyle(styleId: string): Observable<boolean> {
    const apiKey = this.requireApiKey();
    return this.httpClient
      .delete(`${this.baseUrl}/styles/image/${styleId}`, {
        headers: { apikey: apiKey },
        context: this.styleContext,
      })
      .pipe(
        map(() => true),
        tap(() => this.cache.invalidate({ category: 'styles' })),
        catchError((err: unknown) => this.handleError(err)),
      );
  }

  // ==========================================================================
  // Image Style Examples
  // ==========================================================================

  /**
   * Add an example image to an image style.
   */
  public addImageStyleExample(
    styleId: string,
    payload: AddStyleExampleInput,
  ): Observable<AddStyleExampleResponse> {
    const apiKey = this.requireApiKey();
    return this.httpClient
      .post<AddStyleExampleResponse>(
        `${this.baseUrl}/styles/image/${styleId}/example`,
        payload,
        {
          headers: { apikey: apiKey },
          context: this.styleContext,
        },
      )
      .pipe(
        tap(() => this.cache.invalidate({ category: 'styles' })),
        catchError((err: unknown) => this.handleError(err)),
      );
  }

  /**
   * Update an example image.
   */
  public updateImageStyleExample(
    styleId: string,
    exampleId: string,
    payload: UpdateStyleExampleInput,
  ): Observable<StyleExample> {
    const apiKey = this.requireApiKey();
    return this.httpClient
      .patch<StyleExample>(
        `${this.baseUrl}/styles/image/${styleId}/example/${exampleId}`,
        payload,
        {
          headers: { apikey: apiKey },
          context: this.styleContext,
        },
      )
      .pipe(
        tap(() => this.cache.invalidate({ category: 'styles' })),
        catchError((err: unknown) => this.handleError(err)),
      );
  }

  /**
   * Delete an example image.
   */
  public deleteImageStyleExample(
    styleId: string,
    exampleId: string,
  ): Observable<boolean> {
    const apiKey = this.requireApiKey();
    return this.httpClient
      .delete(`${this.baseUrl}/styles/image/${styleId}/example/${exampleId}`, {
        headers: { apikey: apiKey },
        context: this.styleContext,
      })
      .pipe(
        map(() => true),
        tap(() => this.cache.invalidate({ category: 'styles' })),
        catchError((err: unknown) => this.handleError(err)),
      );
  }

  // ==========================================================================
  // Text Styles - Read Operations
  // ==========================================================================

  /**
   * Get a paginated list of public text styles.
   */
  public getTextStyles(params: StyleQueryParams = {}): Observable<TextStyle[]> {
    const httpParams = this.buildQueryParams(params);
    return this.cache
      .cachedGet<
        TextStyle[]
      >(`${this.baseUrl}/styles/text`, { params: httpParams, context: this.styleContext }, { ttl: CacheTTL.LONG, category: 'styles' })
      .pipe(catchError((err: unknown) => this.handleError(err)));
  }

  /**
   * Get a single text style by ID.
   */
  public getTextStyle(styleId: string): Observable<TextStyle> {
    return this.cache
      .cachedGet<TextStyle>(
        `${this.baseUrl}/styles/text/${styleId}`,
        { context: this.styleContext },
        { ttl: CacheTTL.LONG, category: 'styles' },
      )
      .pipe(catchError((err: unknown) => this.handleError(err)));
  }

  /**
   * Get a text style by name.
   */
  public getTextStyleByName(styleName: string): Observable<TextStyle> {
    return this.cache
      .cachedGet<TextStyle>(
        `${this.baseUrl}/styles/text_by_name/${encodeURIComponent(styleName)}`,
        { context: this.styleContext },
        { ttl: CacheTTL.LONG, category: 'styles' },
      )
      .pipe(catchError((err: unknown) => this.handleError(err)));
  }

  // ==========================================================================
  // Text Styles - Write Operations
  // ==========================================================================

  /**
   * Create a new text style.
   * Requires authentication.
   */
  public createTextStyle(
    payload: CreateTextStyleInput,
  ): Observable<StyleModifyResponse> {
    const apiKey = this.requireApiKey();
    return this.httpClient
      .post<StyleModifyResponse>(`${this.baseUrl}/styles/text`, payload, {
        headers: { apikey: apiKey },
        context: this.styleContext,
      })
      .pipe(
        tap(() => this.cache.invalidate({ category: 'styles' })),
        catchError((err: unknown) => this.handleError(err)),
      );
  }

  /**
   * Update an existing text style.
   * Requires authentication and ownership.
   */
  public updateTextStyle(
    styleId: string,
    payload: UpdateTextStyleInput,
  ): Observable<StyleModifyResponse> {
    const apiKey = this.requireApiKey();
    return this.httpClient
      .patch<StyleModifyResponse>(
        `${this.baseUrl}/styles/text/${styleId}`,
        payload,
        {
          headers: { apikey: apiKey },
          context: this.styleContext,
        },
      )
      .pipe(
        tap(() => this.cache.invalidate({ category: 'styles' })),
        catchError((err: unknown) => this.handleError(err)),
      );
  }

  /**
   * Delete a text style.
   * Requires moderator authentication or ownership.
   */
  public deleteTextStyle(styleId: string): Observable<boolean> {
    const apiKey = this.requireApiKey();
    return this.httpClient
      .delete(`${this.baseUrl}/styles/text/${styleId}`, {
        headers: { apikey: apiKey },
        context: this.styleContext,
      })
      .pipe(
        map(() => true),
        tap(() => this.cache.invalidate({ category: 'styles' })),
        catchError((err: unknown) => this.handleError(err)),
      );
  }

  // ==========================================================================
  // Collections - Read Operations (Phase 1)
  // ==========================================================================

  /**
   * Get a paginated list of public collections.
   */
  public getCollections(
    params: CollectionQueryParams = {},
  ): Observable<StyleCollection[]> {
    const httpParams = this.buildCollectionQueryParams(params);
    return this.cache
      .cachedGet<
        StyleCollection[]
      >(`${this.baseUrl}/collections`, { params: httpParams, context: this.styleContext }, { ttl: CacheTTL.LONG, category: 'collections' })
      .pipe(catchError((err: unknown) => this.handleError(err)));
  }

  /**
   * Get a single collection by ID.
   */
  public getCollection(collectionId: string): Observable<StyleCollection> {
    return this.cache
      .cachedGet<StyleCollection>(
        `${this.baseUrl}/collections/${collectionId}`,
        { context: this.styleContext },
        { ttl: CacheTTL.LONG, category: 'collections' },
      )
      .pipe(catchError((err: unknown) => this.handleError(err)));
  }

  /**
   * Get a collection by name.
   */
  public getCollectionByName(
    collectionName: string,
  ): Observable<StyleCollection> {
    return this.cache
      .cachedGet<StyleCollection>(
        `${this.baseUrl}/collection_by_name/${encodeURIComponent(collectionName)}`,
        { context: this.styleContext },
        { ttl: CacheTTL.LONG, category: 'collections' },
      )
      .pipe(catchError((err: unknown) => this.handleError(err)));
  }

  // ==========================================================================
  // Collections - Write Operations (Phase 2 - Stubbed)
  // ==========================================================================

  /**
   * Create a new collection.
   * @deprecated Phase 2 - not yet implemented
   */
  public createCollection(): Observable<never> {
    // TODO: Phase 2 - Implement collection CRUD
    return throwError(
      () =>
        new ApiError('Collection creation not yet implemented (Phase 2)', 501),
    );
  }

  /**
   * Update an existing collection.
   * @deprecated Phase 2 - not yet implemented
   */
  public updateCollection(): Observable<never> {
    // TODO: Phase 2 - Implement collection CRUD
    return throwError(
      () =>
        new ApiError('Collection update not yet implemented (Phase 2)', 501),
    );
  }

  /**
   * Delete a collection.
   * @deprecated Phase 2 - not yet implemented
   */
  public deleteCollection(): Observable<never> {
    // TODO: Phase 2 - Implement collection CRUD
    return throwError(
      () =>
        new ApiError('Collection deletion not yet implemented (Phase 2)', 501),
    );
  }
}
