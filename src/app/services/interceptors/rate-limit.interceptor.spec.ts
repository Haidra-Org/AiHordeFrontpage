import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import {
  provideHttpClient,
  withInterceptors,
  HttpClient,
  HttpErrorResponse,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  rateLimitInterceptor,
  RateLimitState,
} from './rate-limit.interceptor';

describe('rateLimitInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let state: RateLimitState;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([rateLimitInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    state = TestBed.inject(RateLimitState);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should pass through successful responses unchanged', () => {
    let result: unknown;
    http
      .get('https://aihorde.net/api/v2/status/performance')
      .subscribe((r) => (result = r));

    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush({ worker_count: 50 });

    expect(result).toEqual({ worker_count: 50 });
    expect(state.limited()).toBe(false);
  });

  it('should pass through non-aihorde requests without rate-limit logic', () => {
    let result: unknown;
    http
      .get('https://example.com/api/test')
      .subscribe((r) => (result = r));

    httpTesting
      .expectOne('https://example.com/api/test')
      .flush({ ok: true });

    expect(result).toEqual({ ok: true });
  });

  it('should retry on 429 with Retry-After header (seconds)', fakeAsync(() => {
    let result: unknown;
    http
      .get('https://aihorde.net/api/v2/status/performance')
      .subscribe((r) => (result = r));

    // First request returns 429 with Retry-After: 1
    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '1' },
      });

    expect(state.limited()).toBe(true);
    expect(state.retryAfterMs()).toBeGreaterThan(0);

    // Advance past the 1-second retry delay
    tick(1000);

    // Retry request succeeds
    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush({ worker_count: 50 });

    expect(result).toEqual({ worker_count: 50 });
    expect(state.limited()).toBe(false);
    expect(state.retryAfterMs()).toBe(-1);
  }));

  it('should use exponential backoff when no Retry-After header', fakeAsync(() => {
    let result: unknown;
    http
      .get('https://aihorde.net/api/v2/status/performance')
      .subscribe((r) => (result = r));

    // First 429 - no Retry-After header, default backoff = 2000 * 2^0 = 2000ms
    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
      });

    expect(state.limited()).toBe(true);

    tick(2000);

    // Retry succeeds
    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush({ ok: true });

    expect(result).toEqual({ ok: true });
    expect(state.limited()).toBe(false);
  }));

  it('should retry up to MAX_RETRIES (2) times', fakeAsync(() => {
    let error: unknown;
    http
      .get('https://aihorde.net/api/v2/status/performance')
      .subscribe({ error: (e) => (error = e) });

    // 1st attempt → 429
    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '1' },
      });

    tick(1000);

    // 2nd attempt (retry 1) → 429
    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '1' },
      });

    tick(1000);

    // 3rd attempt (retry 2) → 429 again
    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '1' },
      });

    // No more retries — error should propagate
    expect(error).toBeTruthy();
    expect((error as any).status).toBe(429);
  }));

  it('should NOT retry on non-429 errors', () => {
    let error: unknown;
    http
      .get('https://aihorde.net/api/v2/status/performance')
      .subscribe({ error: (e) => (error = e) });

    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Server error', {
        status: 500,
        statusText: 'Internal Server Error',
      });

    expect(error).toBeTruthy();
    expect((error as any).status).toBe(500);
    expect(state.limited()).toBe(false);
  });

  it('should clear rate-limit state on non-429 errors', fakeAsync(() => {
    let error: unknown;
    http
      .get('https://aihorde.net/api/v2/status/performance')
      .subscribe({ error: (e) => (error = e) });

    // Return a 400 error
    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Bad request', {
        status: 400,
        statusText: 'Bad Request',
      });

    expect(state.limited()).toBe(false);
    expect(state.retryAfterMs()).toBe(-1);
  }));

  it('should recover after retries succeed', fakeAsync(() => {
    let result: unknown;
    http
      .get('https://aihorde.net/api/v2/status/performance')
      .subscribe((r) => (result = r));

    // First: 429
    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '1' },
      });

    expect(state.limited()).toBe(true);
    tick(1000);

    // Second: success
    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush({ recovered: true });

    expect(result).toEqual({ recovered: true });
    expect(state.limited()).toBe(false);
    expect(state.retryAfterMs()).toBe(-1);
  }));

  it('should NOT retry POST requests', () => {
    let error: unknown;

    http
      .post('https://aihorde.net/api/v2/generate/async', { prompt: 'x' })
      .subscribe({ error: (e) => (error = e) });

    httpTesting
      .expectOne('https://aihorde.net/api/v2/generate/async')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
      });

    // No retry request should be made for POST.
    httpTesting.expectNone('https://aihorde.net/api/v2/generate/async');
    expect((error as HttpErrorResponse).status).toBe(429);
  });

  it('should clear state after terminal 429 failure', fakeAsync(() => {
    let error: unknown;

    http
      .get('https://aihorde.net/api/v2/status/performance')
      .subscribe({ error: (e) => (error = e) });

    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '1' },
      });

    tick(1000);

    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '1' },
      });

    tick(1000);

    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '1' },
      });

    expect((error as HttpErrorResponse).status).toBe(429);
    expect(state.limited()).toBe(false);
    expect(state.retryAfterMs()).toBe(-1);
  }));
});

// Separate describe for RateLimitState service
describe('RateLimitState', () => {
  let state: RateLimitState;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    state = TestBed.inject(RateLimitState);
  });

  it('should be created', () => {
    expect(state).toBeTruthy();
  });

  it('should default to not limited', () => {
    expect(state.limited()).toBe(false);
    expect(state.retryAfterMs()).toBe(-1);
  });

  it('should be a singleton across injections', () => {
    const state2 = TestBed.inject(RateLimitState);
    expect(state).toBe(state2);
  });
});
