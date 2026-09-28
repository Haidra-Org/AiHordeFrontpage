import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, defer, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import {
  DEFAULT_RETRY_SECONDS,
  MAX_RETRY_SECONDS,
  retryAfterSeconds,
  retryOnRateLimit,
} from './rate-limit-retry';

const limited = (headers: Record<string, string> = {}) =>
  new HttpErrorResponse({ status: 429, headers: new HttpHeaders(headers) });

describe('retryAfterSeconds', () => {
  const now = Date.UTC(2026, 8, 27, 12, 0, 0);

  it('reads Retry-After as seconds or as a date', () => {
    expect(retryAfterSeconds(limited({ 'Retry-After': '17' }), now)).toBe(17);
    expect(
      retryAfterSeconds(
        limited({ 'Retry-After': new Date(now + 9_000).toUTCString() }),
        now,
      ),
    ).toBe(9);
  });

  it('falls back to X-RateLimit-Reset, then to the default', () => {
    expect(
      retryAfterSeconds(
        limited({ 'X-RateLimit-Reset': String(now / 1000 + 42) }),
        now,
      ),
    ).toBe(42);
    expect(retryAfterSeconds(limited(), now)).toBe(DEFAULT_RETRY_SECONDS);
  });

  it('is null for any other failure', () => {
    expect(
      retryAfterSeconds(new HttpErrorResponse({ status: 500 })),
    ).toBeNull();
    expect(retryAfterSeconds(new Error('x'))).toBeNull();
  });
});

describe('retryOnRateLimit', () => {
  afterEach(() => vi.useRealTimers());

  const reads = (answers: (() => Observable<string>)[]) => {
    let call = 0;
    const source = defer(() => answers[call++]());
    return { source, calls: () => call };
  };

  it('waits as asked, says so, and tries once more', () => {
    vi.useFakeTimers();
    const waits: number[] = [];
    const got: string[] = [];
    const { source, calls } = reads([
      () => throwError(() => limited({ 'Retry-After': '5' })),
      () => of('detail'),
    ]);
    source
      .pipe(retryOnRateLimit((seconds) => waits.push(seconds)))
      .subscribe((value) => got.push(value));

    expect(waits).toEqual([5]);
    vi.advanceTimersByTime(4_999);
    expect(calls()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(got).toEqual(['detail']);
  });

  it('gives up after the one retry', () => {
    vi.useFakeTimers();
    const errors: unknown[] = [];
    const { source, calls } = reads([
      () => throwError(() => limited({ 'Retry-After': '1' })),
      () => throwError(() => limited({ 'Retry-After': '1' })),
      () => of('never'),
    ]);
    source
      .pipe(retryOnRateLimit(() => undefined))
      .subscribe({ error: (error: unknown) => errors.push(error) });
    vi.advanceTimersByTime(10_000);

    expect(calls()).toBe(2);
    expect(errors).toHaveLength(1);
  });

  it('passes other failures and overlong waits straight on', () => {
    const errors: unknown[] = [];
    throwError(() => new HttpErrorResponse({ status: 500 }))
      .pipe(retryOnRateLimit(() => undefined))
      .subscribe({ error: (error: unknown) => errors.push(error) });
    throwError(() => limited({ 'Retry-After': String(MAX_RETRY_SECONDS + 1) }))
      .pipe(retryOnRateLimit(() => undefined))
      .subscribe({ error: (error: unknown) => errors.push(error) });

    expect(errors).toHaveLength(2);
  });
});
