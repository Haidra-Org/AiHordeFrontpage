import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of, tap, throwError } from 'rxjs';
import {
  SharedKeyApiError,
  SharedKeyDetails,
  SharedKeyInput,
} from '../types/shared-key';
import { AuthService } from './auth.service';
import { HordeApiCacheService, CacheTTL } from './horde-api-cache.service';
import { CLIENT_AGENT } from './interceptors/client-agent.interceptor';

@Injectable({
  providedIn: 'root',
})
export class SharedKeyService {
  private readonly httpClient = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly cache = inject(HordeApiCacheService);
  private readonly baseUrl = 'https://aihorde.net/api/v2/sharedkeys';

  private readonly sharedKeyContext = new HttpContext().set(
    CLIENT_AGENT,
    'AiHordeFrontpage:login',
  );

  private ensureApiKey(): string | null {
    return this.auth.getStoredApiKey();
  }

  private handleError = (error: HttpErrorResponse) => {
    const apiError: SharedKeyApiError = {
      status: error.status ?? 0,
      message:
        error.error?.message ?? 'Unexpected error while contacting the API.',
      rc: error.error?.rc,
    };
    return throwError(() => apiError);
  };

  public getSharedKey(sharedKeyId: string): Observable<SharedKeyDetails> {
    const apiKey = this.ensureApiKey();
    const headers: Record<string, string> = apiKey ? { apikey: apiKey } : {};
    return this.cache
      .cachedGet<SharedKeyDetails>(
        `${this.baseUrl}/${sharedKeyId}`,
        { headers, context: this.sharedKeyContext },
        { ttl: CacheTTL.MEDIUM, category: 'sharedkeys' },
      )
      .pipe(catchError(this.handleError));
  }

  public getSharedKeysByIds(
    sharedKeyIds: string[],
  ): Observable<SharedKeyDetails[]> {
    if (sharedKeyIds.length === 0) {
      return of([]);
    }

    return forkJoin(sharedKeyIds.map((id) => this.getSharedKey(id))).pipe(
      map((keys) =>
        keys.filter((key): key is SharedKeyDetails => Boolean(key)),
      ),
    );
  }

  public createSharedKey(
    payload: SharedKeyInput,
  ): Observable<SharedKeyDetails> {
    const apiKey = this.ensureApiKey();
    if (!apiKey) {
      return throwError(
        () =>
          ({
            status: 401,
            message:
              'Missing API key. Please log in again to manage shared keys.',
          }) satisfies SharedKeyApiError,
      );
    }

    return this.httpClient
      .put<SharedKeyDetails>(`${this.baseUrl}`, payload, {
        headers: { apikey: apiKey },
        context: this.sharedKeyContext,
      })
      .pipe(
        tap(() => this.cache.invalidate({ category: 'sharedkeys' })),
        catchError(this.handleError),
      );
  }

  public updateSharedKey(
    sharedKeyId: string,
    payload: SharedKeyInput,
  ): Observable<SharedKeyDetails> {
    const apiKey = this.ensureApiKey();
    if (!apiKey) {
      return throwError(
        () =>
          ({
            status: 401,
            message:
              'Missing API key. Please log in again to manage shared keys.',
          }) satisfies SharedKeyApiError,
      );
    }

    return this.httpClient
      .patch<SharedKeyDetails>(`${this.baseUrl}/${sharedKeyId}`, payload, {
        headers: { apikey: apiKey },
        context: this.sharedKeyContext,
      })
      .pipe(
        tap(() => this.cache.invalidate({ category: 'sharedkeys' })),
        catchError(this.handleError),
      );
  }

  public deleteSharedKey(sharedKeyId: string): Observable<boolean> {
    const apiKey = this.ensureApiKey();
    if (!apiKey) {
      return throwError(
        () =>
          ({
            status: 401,
            message:
              'Missing API key. Please log in again to manage shared keys.',
          }) satisfies SharedKeyApiError,
      );
    }

    return this.httpClient
      .delete(`${this.baseUrl}/${sharedKeyId}`, {
        headers: { apikey: apiKey },
        context: this.sharedKeyContext,
      })
      .pipe(
        map(() => true),
        tap(() => this.cache.invalidate({ category: 'sharedkeys' })),
        catchError(this.handleError),
      );
  }
}
