import { HttpErrorResponse } from '@angular/common/http';
import { MonoTypeOperatorFunction, retry, throwError, timer } from 'rxjs';

/**
 * The wait used when a refusal names none, or names one the browser cannot
 * read: a cross-origin answer shows only the headers the horde exposes.
 */
export const DEFAULT_RETRY_SECONDS = 30;

/** The longest wait honoured before the one retry; a longer one is shown and not retried. */
export const MAX_RETRY_SECONDS = 120;

/**
 * How long a 429 asks the client to wait, in whole seconds: `Retry-After`
 * as seconds or as a date, else `X-RateLimit-Reset` as a Unix time, else
 * `DEFAULT_RETRY_SECONDS`. Null for any other failure.
 */
export function retryAfterSeconds(
  error: unknown,
  now: number = Date.now(),
): number | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 429) {
    return null;
  }
  const retryAfter = error.headers?.get('Retry-After');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(1, Math.ceil(seconds));
    const at = Date.parse(retryAfter);
    if (!Number.isNaN(at)) return Math.max(1, Math.ceil((at - now) / 1000));
  }
  const reset = Number(error.headers?.get('X-RateLimit-Reset'));
  if (reset > 0) {
    return Math.max(1, Math.ceil(reset - now / 1000));
  }
  return DEFAULT_RETRY_SECONDS;
}

/**
 * Retry a read once after the horde's rate limiter refuses it, waiting as
 * long as the limiter asks. `waiting` is told the wait when it starts, so
 * the page can say so; a second refusal, a wait past `MAX_RETRY_SECONDS`
 * or any other failure reaches the subscriber as an error. There is never
 * more than one retry, so a page cannot fall into a loop against the limit.
 */
export function retryOnRateLimit<T>(
  waiting: (seconds: number) => void,
): MonoTypeOperatorFunction<T> {
  return retry({
    count: 1,
    delay: (error: unknown) => {
      const seconds = retryAfterSeconds(error);
      if (seconds === null || seconds > MAX_RETRY_SECONDS) {
        return throwError(() => error);
      }
      waiting(seconds);
      return timer(seconds * 1000);
    },
  });
}
