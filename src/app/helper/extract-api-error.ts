import { HttpErrorResponse } from '@angular/common/http';

/**
 * Safely narrows `HttpErrorResponse.error` (typed as `any` by Angular)
 * to `unknown` so downstream access goes through proper type guards.
 */
function getResponseBody(error: HttpErrorResponse): unknown {
  return error.error as unknown;
}

/**
 * Type guard: checks if a value is a non-null object.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Safely extracts a string field from the body of an HttpErrorResponse.
 * Accepts `unknown` so callers don't need to narrow first.
 * Returns `undefined` if the error is not an HttpErrorResponse,
 * the field is missing, or the field is not a string.
 */
export function extractApiErrorField(
  error: unknown,
  field: string,
): string | undefined {
  if (!(error instanceof HttpErrorResponse)) {
    return undefined;
  }
  const body = getResponseBody(error);
  if (isObject(body)) {
    const value = body[field];
    if (typeof value === 'string') {
      return value;
    }
  }
  return undefined;
}

/**
 * Extracts a human-readable error message from an HTTP error response.
 * The AI Horde API returns `{ message: string }` on errors.
 */
export function extractApiError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    return (
      extractApiErrorField(error, 'message') ??
      error.message ??
      fallback
    );
  }
  return fallback;
}

/**
 * Serializes an HTTP error response body to a JSON string for display.
 * Returns null if there is no meaningful body to show.
 */
export function serializeErrorDetails(error: unknown): string | null {
  if (error instanceof HttpErrorResponse) {
    const body = getResponseBody(error);
    if (isObject(body)) {
      try {
        return JSON.stringify(body, null, 2);
      } catch {
        return null;
      }
    }
    if (typeof body === 'string' && body.length > 0) {
      return body;
    }
  }
  return null;
}
