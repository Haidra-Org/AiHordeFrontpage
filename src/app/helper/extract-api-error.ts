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
    return extractApiErrorField(error, 'message') ?? error.message ?? fallback;
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

/**
 * Whether a failed request reached a server that has no such route, as opposed
 * to a route that exists and refused. The horde tags every refusal it raises
 * itself with an `rc` (a missing record answers 404 with `RequestNotFound`, for
 * instance), while the framework's own answer for an unknown path or method is
 * a bare 404 or 405 without one. That difference is how a surface built ahead
 * of a horde release can tell an endpoint that is not deployed yet from one
 * that is deployed and said no.
 *
 * In a browser this only covers requests that pass CORS preflight. A request
 * carrying an `apikey` header is preflighted, and the horde answers the
 * preflight for an unknown path with a 404, which the browser rejects as a
 * status 0 failure that never reaches this check. Callers therefore show a
 * surface only once an endpoint has answered, rather than hiding it only
 * after this returns true.
 */
export function isMissingRoute(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) {
    return false;
  }
  if (error.status !== 404 && error.status !== 405) {
    return false;
  }
  return extractApiErrorField(error, 'rc') === undefined;
}
