import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { StatusService } from './status.service';
import { clientAgentInterceptor } from './interceptors/client-agent.interceptor';
import { STATUS_API_BASE } from '../testing/api-test-helpers';
import { PublicComponentsResponse } from '../types/status';

describe('StatusService', () => {
  let service: StatusService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([clientAgentInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(StatusService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('fetches public components from the status API', async () => {
    const response: PublicComponentsResponse = {
      components: [
        {
          id: 'api',
          name: 'AI Horde API',
          description: 'Public REST API',
          status: 'operational',
          uptime_90d: 99.94,
          last_change_at: null,
        },
      ],
      overall: 'operational',
      generated_at: '2026-06-20T00:00:00Z',
    };

    const promise = firstValueFrom(service.getComponents());
    http.expectOne(`${STATUS_API_BASE}/public/components`).flush(response);

    expect(await promise).toEqual(response);
  });

  it('resolves to null when the components endpoint errors', async () => {
    const promise = firstValueFrom(service.getComponents());
    http
      .expectOne(`${STATUS_API_BASE}/public/components`)
      .flush('boom', { status: 503, statusText: 'Service Unavailable' });

    expect(await promise).toBeNull();
  });

  it('requests history for a single component with day count', async () => {
    const promise = firstValueFrom(service.getHistory('image', 90));
    const req = http.expectOne(
      `${STATUS_API_BASE}/public/history?component=image&days=90`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      component_id: 'image',
      days: 90,
      buckets: [],
      uptime_percent: 99.5,
    });

    expect(await promise).toEqual({
      component_id: 'image',
      days: 90,
      buckets: [],
      uptime_percent: 99.5,
    });
  });
});
