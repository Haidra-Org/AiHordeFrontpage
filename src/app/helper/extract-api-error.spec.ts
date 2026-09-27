import { HttpErrorResponse } from '@angular/common/http';
import {
  extractApiErrorField,
  extractApiError,
  isMissingRoute,
  serializeErrorDetails,
} from './extract-api-error';

describe('extractApiErrorField', () => {
  it('returns the named string field from an HttpErrorResponse body', () => {
    const err = new HttpErrorResponse({
      error: { message: 'rate limited' },
      status: 429,
    });
    expect(extractApiErrorField(err, 'message')).toBe('rate limited');
  });

  it('returns undefined when the field is missing', () => {
    const err = new HttpErrorResponse({
      error: { code: 'NOPE' },
      status: 400,
    });
    expect(extractApiErrorField(err, 'message')).toBeUndefined();
  });

  it('returns undefined when the field value is not a string', () => {
    const err = new HttpErrorResponse({
      error: { message: 42 },
      status: 400,
    });
    expect(extractApiErrorField(err, 'message')).toBeUndefined();
  });

  it('returns undefined when the body is not an object', () => {
    const err = new HttpErrorResponse({
      error: 'plain text body',
      status: 500,
    });
    expect(extractApiErrorField(err, 'message')).toBeUndefined();
  });

  it('returns undefined when the body is null', () => {
    const err = new HttpErrorResponse({ error: null, status: 500 });
    expect(extractApiErrorField(err, 'message')).toBeUndefined();
  });

  it('returns undefined for a non-HttpErrorResponse value', () => {
    expect(extractApiErrorField(new Error('oops'), 'message')).toBeUndefined();
  });

  it('returns undefined for null / undefined', () => {
    expect(extractApiErrorField(null, 'message')).toBeUndefined();
    expect(extractApiErrorField(undefined, 'message')).toBeUndefined();
  });
});

describe('extractApiError', () => {
  it('extracts the API message from a well-formed response body', () => {
    const err = new HttpErrorResponse({
      error: { message: 'Validation failed' },
      status: 422,
      statusText: 'Unprocessable Entity',
    });
    expect(extractApiError(err, 'Something went wrong')).toBe(
      'Validation failed',
    );
  });

  it('falls back to HttpErrorResponse.message when body has no message field', () => {
    const err = new HttpErrorResponse({
      error: {},
      status: 503,
      statusText: 'Service Unavailable',
      url: 'https://example.com/api',
    });
    const result = extractApiError(err, 'fallback');
    // Angular's HttpErrorResponse constructs a message from status + url
    expect(result).toContain('503');
  });

  it('returns fallback for non-HttpErrorResponse errors', () => {
    expect(extractApiError(new TypeError('fail'), 'default msg')).toBe(
      'default msg',
    );
  });

  it('returns fallback for primitive values', () => {
    expect(extractApiError('random string', 'fallback')).toBe('fallback');
    expect(extractApiError(42, 'fallback')).toBe('fallback');
    expect(extractApiError(null, 'fallback')).toBe('fallback');
  });
});

describe('serializeErrorDetails', () => {
  it('serializes a JSON body to a pretty-printed string', () => {
    const err = new HttpErrorResponse({
      error: { code: 'ERR_RATE', detail: 'Try later' },
      status: 429,
    });
    const result = serializeErrorDetails(err);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed).toEqual({ code: 'ERR_RATE', detail: 'Try later' });
  });

  it('returns a non-empty string body as-is', () => {
    const err = new HttpErrorResponse({
      error: 'plain error text',
      status: 500,
    });
    expect(serializeErrorDetails(err)).toBe('plain error text');
  });

  it('returns null for an empty string body', () => {
    const err = new HttpErrorResponse({ error: '', status: 500 });
    expect(serializeErrorDetails(err)).toBeNull();
  });

  it('returns null when body is null', () => {
    const err = new HttpErrorResponse({ error: null, status: 500 });
    expect(serializeErrorDetails(err)).toBeNull();
  });

  it('returns null for non-HttpErrorResponse inputs', () => {
    expect(serializeErrorDetails(new Error('boom'))).toBeNull();
    expect(serializeErrorDetails(null)).toBeNull();
    expect(serializeErrorDetails(undefined)).toBeNull();
  });

  it('returns null when JSON.stringify throws (circular reference)', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    const err = new HttpErrorResponse({ error: circular, status: 500 });
    expect(serializeErrorDetails(err)).toBeNull();
  });
});

describe('isMissingRoute', () => {
  it('reads a bare 404 as a route the server does not have', () => {
    const err = new HttpErrorResponse({
      error: { message: 'The requested URL was not found on the server.' },
      status: 404,
    });
    expect(isMissingRoute(err)).toBe(true);
  });

  it('reads a bare 405 as a method the route does not have', () => {
    const err = new HttpErrorResponse({ error: null, status: 405 });
    expect(isMissingRoute(err)).toBe(true);
  });

  it('reads a non-JSON 404 body as a missing route', () => {
    const err = new HttpErrorResponse({
      error: '<html>Not Found</html>',
      status: 404,
    });
    expect(isMissingRoute(err)).toBe(true);
  });

  it('keeps a 404 that carries an rc as a real answer from the route', () => {
    const err = new HttpErrorResponse({
      error: { message: 'Request not found', rc: 'RequestNotFound' },
      status: 404,
    });
    expect(isMissingRoute(err)).toBe(false);
  });

  it('keeps other statuses and non-HTTP errors out', () => {
    expect(
      isMissingRoute(new HttpErrorResponse({ error: null, status: 403 })),
    ).toBe(false);
    expect(
      isMissingRoute(new HttpErrorResponse({ error: null, status: 0 })),
    ).toBe(false);
    expect(isMissingRoute(new Error('boom'))).toBe(false);
  });
});
