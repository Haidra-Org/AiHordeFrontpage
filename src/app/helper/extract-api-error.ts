import { HttpErrorResponse } from '@angular/common/http';

/**
 * Extracts a human-readable error message from an HTTP error response.
 * The AI Horde API returns `{ message: string }` on errors.
 */
export function extractApiError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error;
    if (body && typeof body === 'object' && typeof body.message === 'string') {
      return body.message;
    }
    if (error.message) {
      return error.message;
    }
  }
  return fallback;
}

/**
 * Serializes an HTTP error response body to a JSON string for display.
 * Returns null if there is no meaningful body to show.
 */
export function serializeErrorDetails(error: unknown): string | null {
  if (error instanceof HttpErrorResponse) {
    const body = error.error;
    if (body && typeof body === 'object') {
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
