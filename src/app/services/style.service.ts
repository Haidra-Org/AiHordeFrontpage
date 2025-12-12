import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import {
  ImageStyle,
  TextStyle,
  StyleApiError,
  StyleModifyResponse,
  StyleExample,
} from '../types/style';
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

@Injectable({
  providedIn: 'root',
})
export class StyleService {
  private readonly httpClient = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = 'https://aihorde.net/api/v2';
  private readonly clientAgent = 'AiHordeFrontpage:styles';

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private buildHeaders(apiKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Client-Agent': this.clientAgent,
    };
    if (apiKey) {
      headers['apikey'] = apiKey;
    }
    return headers;
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

  private handleError = (error: HttpErrorResponse): Observable<never> => {
    const apiError: StyleApiError = {
      status: error.status ?? 0,
      message:
        error.error?.message ?? 'Unexpected error while contacting the API.',
      rc: error.error?.rc,
    };
    return throwError(() => apiError);
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

  private buildCollectionQueryParams(params: CollectionQueryParams): HttpParams {
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
  public getImageStyles(params: StyleQueryParams = {}): Observable<ImageStyle[]> {
    const httpParams = this.buildQueryParams(params);
    return this.httpClient
      .get<ImageStyle[]>(`${this.baseUrl}/styles/image`, {
        params: httpParams,
        headers: this.buildHeaders(),
      })
      .pipe(catchError(this.handleError));
  }

  /**
   * Get a single image style by ID.
   */
  public getImageStyle(styleId: string): Observable<ImageStyle> {
    return this.httpClient
      .get<ImageStyle>(`${this.baseUrl}/styles/image/${styleId}`, {
        headers: this.buildHeaders(),
      })
      .pipe(catchError(this.handleError));
  }

  /**
   * Get an image style by name.
   */
  public getImageStyleByName(styleName: string): Observable<ImageStyle> {
    return this.httpClient
      .get<ImageStyle>(`${this.baseUrl}/styles/image_by_name/${encodeURIComponent(styleName)}`, {
        headers: this.buildHeaders(),
      })
      .pipe(catchError(this.handleError));
  }

  // ==========================================================================
  // Image Styles - Write Operations
  // ==========================================================================

  /**
   * Create a new image style.
   * Requires authentication.
   */
  public createImageStyle(payload: CreateImageStyleInput): Observable<StyleModifyResponse> {
    const apiKey = this.requireApiKey();
    return this.httpClient
      .post<StyleModifyResponse>(`${this.baseUrl}/styles/image`, payload, {
        headers: this.buildHeaders(apiKey),
      })
      .pipe(catchError(this.handleError));
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
      .patch<StyleModifyResponse>(`${this.baseUrl}/styles/image/${styleId}`, payload, {
        headers: this.buildHeaders(apiKey),
      })
      .pipe(catchError(this.handleError));
  }

  /**
   * Delete an image style.
   * Requires moderator authentication or ownership.
   */
  public deleteImageStyle(styleId: string): Observable<boolean> {
    const apiKey = this.requireApiKey();
    return this.httpClient
      .delete(`${this.baseUrl}/styles/image/${styleId}`, {
        headers: this.buildHeaders(apiKey),
      })
      .pipe(
        map(() => true),
        catchError(this.handleError),
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
        { headers: this.buildHeaders(apiKey) },
      )
      .pipe(catchError(this.handleError));
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
        { headers: this.buildHeaders(apiKey) },
      )
      .pipe(catchError(this.handleError));
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
        headers: this.buildHeaders(apiKey),
      })
      .pipe(
        map(() => true),
        catchError(this.handleError),
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
    return this.httpClient
      .get<TextStyle[]>(`${this.baseUrl}/styles/text`, {
        params: httpParams,
        headers: this.buildHeaders(),
      })
      .pipe(catchError(this.handleError));
  }

  /**
   * Get a single text style by ID.
   */
  public getTextStyle(styleId: string): Observable<TextStyle> {
    return this.httpClient
      .get<TextStyle>(`${this.baseUrl}/styles/text/${styleId}`, {
        headers: this.buildHeaders(),
      })
      .pipe(catchError(this.handleError));
  }

  /**
   * Get a text style by name.
   */
  public getTextStyleByName(styleName: string): Observable<TextStyle> {
    return this.httpClient
      .get<TextStyle>(`${this.baseUrl}/styles/text_by_name/${encodeURIComponent(styleName)}`, {
        headers: this.buildHeaders(),
      })
      .pipe(catchError(this.handleError));
  }

  // ==========================================================================
  // Text Styles - Write Operations
  // ==========================================================================

  /**
   * Create a new text style.
   * Requires authentication.
   */
  public createTextStyle(payload: CreateTextStyleInput): Observable<StyleModifyResponse> {
    const apiKey = this.requireApiKey();
    return this.httpClient
      .post<StyleModifyResponse>(`${this.baseUrl}/styles/text`, payload, {
        headers: this.buildHeaders(apiKey),
      })
      .pipe(catchError(this.handleError));
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
      .patch<StyleModifyResponse>(`${this.baseUrl}/styles/text/${styleId}`, payload, {
        headers: this.buildHeaders(apiKey),
      })
      .pipe(catchError(this.handleError));
  }

  /**
   * Delete a text style.
   * Requires moderator authentication or ownership.
   */
  public deleteTextStyle(styleId: string): Observable<boolean> {
    const apiKey = this.requireApiKey();
    return this.httpClient
      .delete(`${this.baseUrl}/styles/text/${styleId}`, {
        headers: this.buildHeaders(apiKey),
      })
      .pipe(
        map(() => true),
        catchError(this.handleError),
      );
  }

  // ==========================================================================
  // Collections - Read Operations (Phase 1)
  // ==========================================================================

  /**
   * Get a paginated list of public collections.
   */
  public getCollections(params: CollectionQueryParams = {}): Observable<StyleCollection[]> {
    const httpParams = this.buildCollectionQueryParams(params);
    return this.httpClient
      .get<StyleCollection[]>(`${this.baseUrl}/collections`, {
        params: httpParams,
        headers: this.buildHeaders(),
      })
      .pipe(catchError(this.handleError));
  }

  /**
   * Get a single collection by ID.
   */
  public getCollection(collectionId: string): Observable<StyleCollection> {
    return this.httpClient
      .get<StyleCollection>(`${this.baseUrl}/collections/${collectionId}`, {
        headers: this.buildHeaders(),
      })
      .pipe(catchError(this.handleError));
  }

  /**
   * Get a collection by name.
   */
  public getCollectionByName(collectionName: string): Observable<StyleCollection> {
    return this.httpClient
      .get<StyleCollection>(
        `${this.baseUrl}/collection_by_name/${encodeURIComponent(collectionName)}`,
        { headers: this.buildHeaders() },
      )
      .pipe(catchError(this.handleError));
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
    return throwError(() => ({
      status: 501,
      message: 'Collection creation not yet implemented (Phase 2)',
    } satisfies StyleApiError));
  }

  /**
   * Update an existing collection.
   * @deprecated Phase 2 - not yet implemented
   */
  public updateCollection(): Observable<never> {
    // TODO: Phase 2 - Implement collection CRUD
    return throwError(() => ({
      status: 501,
      message: 'Collection update not yet implemented (Phase 2)',
    } satisfies StyleApiError));
  }

  /**
   * Delete a collection.
   * @deprecated Phase 2 - not yet implemented
   */
  public deleteCollection(): Observable<never> {
    // TODO: Phase 2 - Implement collection CRUD
    return throwError(() => ({
      status: 501,
      message: 'Collection deletion not yet implemented (Phase 2)',
    } satisfies StyleApiError));
  }
}
