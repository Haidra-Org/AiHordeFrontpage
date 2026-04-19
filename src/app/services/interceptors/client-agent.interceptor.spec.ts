import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
  withInterceptors,
  HttpClient,
  HttpContext,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  clientAgentInterceptor,
  CLIENT_AGENT,
} from './client-agent.interceptor';
import { API_BASE } from '../../testing/api-test-helpers';

describe('clientAgentInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([clientAgentInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should add the default Client-Agent header to API requests', () => {
    http.get(`${API_BASE}/status/performance`).subscribe();

    const req = httpTesting.expectOne(`${API_BASE}/status/performance`);
    expect(req.request.headers.get('Client-Agent')).toBe(
      'AiHordeFrontpage:web',
    );
    req.flush({});
  });

  it('should NOT add Client-Agent to non-aihorde requests', () => {
    http.get('https://example.com/api/data').subscribe();

    const req = httpTesting.expectOne('https://example.com/api/data');
    expect(req.request.headers.has('Client-Agent')).toBe(false);
    req.flush({});
  });

  it('should NOT add Client-Agent to relative (local asset) requests', () => {
    http.get('/assets/data/faq.en.json').subscribe();

    const req = httpTesting.expectOne('/assets/data/faq.en.json');
    expect(req.request.headers.has('Client-Agent')).toBe(false);
    req.flush([]);
  });

  it('should use a custom Client-Agent when overridden via HttpContext', () => {
    const ctx = new HttpContext().set(
      CLIENT_AGENT,
      'AiHordeFrontpage:generate',
    );

    http.get(`${API_BASE}/generate/async`, { context: ctx }).subscribe();

    const req = httpTesting.expectOne(`${API_BASE}/generate/async`);
    expect(req.request.headers.get('Client-Agent')).toBe(
      'AiHordeFrontpage:generate',
    );
    req.flush({});
  });

  it('should preserve existing headers on the request', () => {
    http
      .get(`${API_BASE}/find_user`, {
        headers: { apikey: 'test-key-123' },
      })
      .subscribe();

    const req = httpTesting.expectOne(`${API_BASE}/find_user`);
    expect(req.request.headers.get('apikey')).toBe('test-key-123');
    expect(req.request.headers.get('Client-Agent')).toBe(
      'AiHordeFrontpage:web',
    );
    req.flush({});
  });

  it('should default CLIENT_AGENT token to AiHordeFrontpage:web', () => {
    const ctx = new HttpContext();
    expect(ctx.get(CLIENT_AGENT)).toBe('AiHordeFrontpage:web');
  });
});
