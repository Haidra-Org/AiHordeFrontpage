import { TestBed } from '@angular/core/testing';
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
import { rateLimitInterceptor, RateLimitState } from './rate-limit.interceptor';

describe('rateLimitInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let state: RateLimitState;

  beforeEach(() => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
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
    http.get('https://example.com/api/test').subscribe((r) => (result = r));

    httpTesting.expectOne('https://example.com/api/test').flush({ ok: true });

    expect(result).toEqual({ ok: true });
  });

  it('should retry on 429 with Retry-After header (seconds)', () => {
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
    vi.advanceTimersByTime(1000);

    // Retry request succeeds
    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush({ worker_count: 50 });

    expect(result).toEqual({ worker_count: 50 });
    expect(state.limited()).toBe(false);
    expect(state.retryAfterMs()).toBe(-1);
  });

  it('should use exponential backoff when no Retry-After header', () => {
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

    vi.advanceTimersByTime(2000);

    // Retry succeeds
    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush({ ok: true });

    expect(result).toEqual({ ok: true });
    expect(state.limited()).toBe(false);
  });

  it('should retry up to MAX_RETRIES (2) times', () => {
    let error: unknown;
    http
      .get('https://aihorde.net/api/v2/status/performance')
      .subscribe({ error: (e: unknown) => (error = e) });

    // 1st attempt → 429
    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '1' },
      });

    vi.advanceTimersByTime(1000);

    // 2nd attempt (retry 1) → 429
    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '1' },
      });

    vi.advanceTimersByTime(1000);

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
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(429);
  });

  it('should NOT retry on non-429 errors', () => {
    let error: unknown;
    http
      .get('https://aihorde.net/api/v2/status/performance')
      .subscribe({ error: (e: unknown) => (error = e) });

    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Server error', {
        status: 500,
        statusText: 'Internal Server Error',
      });

    expect(error).toBeTruthy();
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(500);
    expect(state.limited()).toBe(false);
  });

  it('should clear rate-limit state on non-429 errors', () => {
    http
      .get('https://aihorde.net/api/v2/status/performance')
      .subscribe({ error: () => undefined });

    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Bad request', {
        status: 400,
        statusText: 'Bad Request',
      });

    expect(state.limited()).toBe(false);
    expect(state.retryAfterMs()).toBe(-1);
  });

  it('should recover after retries succeed', () => {
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
    vi.advanceTimersByTime(1000);

    // Second: success
    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush({ recovered: true });

    expect(result).toEqual({ recovered: true });
    expect(state.limited()).toBe(false);
    expect(state.retryAfterMs()).toBe(-1);
  });

  it('should NOT retry POST requests', () => {
    let error: unknown;

    http
      .post('https://aihorde.net/api/v2/generate/async', { prompt: 'x' })
      .subscribe({ error: (e: unknown) => (error = e) });

    httpTesting
      .expectOne('https://aihorde.net/api/v2/generate/async')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
      });

    // No retry request should be made for POST.
    httpTesting.expectNone('https://aihorde.net/api/v2/generate/async');
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(429);
  });

  it('should clear state after terminal 429 failure', () => {
    let error: unknown;

    http
      .get('https://aihorde.net/api/v2/status/performance')
      .subscribe({ error: (e: unknown) => (error = e) });

    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '1' },
      });

    vi.advanceTimersByTime(1000);

    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '1' },
      });

    vi.advanceTimersByTime(1000);

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
  });

  it('should parse Retry-After as an HTTP-date', () => {
    let result: unknown;
    http
      .get('https://aihorde.net/api/v2/status/performance')
      .subscribe((r) => (result = r));

    // Use a date ~2 seconds in the future
    const futureDate = new Date(Date.now() + 2000);
    const httpDate = futureDate.toUTCString();

    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': httpDate },
      });

    expect(state.limited()).toBe(true);
    const delayMs = state.retryAfterMs() - Date.now();
    expect(delayMs).toBeGreaterThan(0);

    // Advance by the derived delay, not a hardcoded guess.
    vi.advanceTimersByTime(delayMs);

    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush({ ok: true });

    expect(result).toEqual({ ok: true });
    expect(state.limited()).toBe(false);
  });

  it('should fall back to exponential backoff for non-parseable Retry-After', () => {
    let result: unknown;
    http
      .get('https://aihorde.net/api/v2/status/performance')
      .subscribe((r) => (result = r));

    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': 'garbage-value' },
      });

    expect(state.limited()).toBe(true);

    // Default backoff for first retry: 2000 * 2^0 = 2000ms
    vi.advanceTimersByTime(2000);

    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush({ ok: true });

    expect(result).toEqual({ ok: true });
    expect(state.limited()).toBe(false);
  });

  it('should clamp Retry-After HTTP-date in the past to 0ms delay', () => {
    let result: unknown;
    http
      .get('https://aihorde.net/api/v2/status/performance')
      .subscribe((r) => (result = r));

    // A date in the past
    const pastDate = new Date(Date.now() - 5000).toUTCString();

    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': pastDate },
      });

    // timer(0) still needs to fire
    vi.advanceTimersByTime(0);

    httpTesting
      .expectOne('https://aihorde.net/api/v2/status/performance')
      .flush({ ok: true });

    expect(result).toEqual({ ok: true });
  });
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
