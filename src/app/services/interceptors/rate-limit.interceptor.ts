import { Injectable, signal } from '@angular/core';
import {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

const MAX_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 2_000;

const HORDE_API_HOST = 'aihorde.net';
const RETRYABLE_METHODS = new Set(['GET', 'HEAD']);

/**
 * Shared singleton so UI components can query current rate-limit state.
 */
@Injectable({ providedIn: 'root' })
export class RateLimitState {
  /** Whether the app is currently being rate-limited by the API. */
  public readonly limited = signal(false);

  /** Epoch ms when the current rate-limit window expires (-1 = not limited). */
  public readonly retryAfterMs = signal(-1);
}

function parseRetryAfterMs(response: HttpErrorResponse): number | null {
  const header =
    response.headers?.get('Retry-After') ??
    response.headers?.get('retry-after');
  if (!header) return null;

  const seconds = Number(header);
  if (!Number.isNaN(seconds)) {
    return seconds * 1_000;
  }

  // RFC 7231 HTTP-date format
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return null;
}

export const rateLimitInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes(HORDE_API_HOST)) {
    return next(req);
  }

  if (!RETRYABLE_METHODS.has(req.method.toUpperCase())) {
    return next(req);
  }

  const state = inject(RateLimitState);

  const attempt = (remaining: number): Observable<any> =>
    next(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status !== 429 || remaining <= 0) {
          state.limited.set(false);
          state.retryAfterMs.set(-1);
          return throwError(() => error);
        }

        const delayMs =
          parseRetryAfterMs(error) ??
          DEFAULT_BACKOFF_MS * Math.pow(2, MAX_RETRIES - remaining);

        state.limited.set(true);
        state.retryAfterMs.set(Date.now() + delayMs);

        return timer(delayMs).pipe(
          switchMap(() => {
            state.limited.set(false);
            state.retryAfterMs.set(-1);
            return attempt(remaining - 1);
          }),
        );
      }),
    );

  return attempt(MAX_RETRIES);
};
