import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { StatusAdminService } from './status-admin.service';
import { AuthService } from './auth.service';
import { HordeApiCacheService } from './horde-api-cache.service';
import { clientAgentInterceptor } from './interceptors/client-agent.interceptor';
import { STATUS_API_BASE } from '../testing/api-test-helpers';
import {
  AdminComponent,
  AdminIncident,
  AdminMaintenance,
} from '../types/status';

const TEST_KEY = 'test-moderator-key';
const INTERNAL = `${STATUS_API_BASE}/internal`;

function adminComponent(): AdminComponent {
  return {
    id: 'api',
    name: 'AI Horde API',
    description: 'Public REST API',
    audience: 'public',
    status: 'operational',
    last_change_at: null,
    override_status: null,
    override_reason: null,
    override_expires_at: null,
    override_id: null,
  };
}

describe('StatusAdminService', () => {
  let service: StatusAdminService;
  let http: HttpTestingController;
  let cache: HordeApiCacheService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([clientAgentInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { getStoredApiKey: () => TEST_KEY },
        },
      ],
    });
    service = TestBed.inject(StatusAdminService);
    http = TestBed.inject(HttpTestingController);
    cache = TestBed.inject(HordeApiCacheService);
  });

  afterEach(() => {
    http.verify();
  });

  it('sends the moderator apikey header on reads', async () => {
    const promise = firstValueFrom(service.getComponents());
    const req = http.expectOne(`${INTERNAL}/components`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('apikey')).toBe(TEST_KEY);
    req.flush([adminComponent()]);
    expect(await promise).toHaveLength(1);
  });

  it('builds the incidents query with include_resolved and limit', async () => {
    const promise = firstValueFrom(service.getIncidents(true, 5));
    const req = http.expectOne(
      `${INTERNAL}/incidents?include_resolved=true&limit=5`,
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
    expect(await promise).toEqual([]);
  });

  it('posts a component override and invalidates the caches', async () => {
    const spy = vi.spyOn(cache, 'invalidate');
    const promise = firstValueFrom(
      service.setComponentOverride('api', {
        target_status: 'down',
        reason: 'planned',
        expires_at: null,
      }),
    );
    const req = http.expectOne(`${INTERNAL}/components/api/override`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('apikey')).toBe(TEST_KEY);
    expect(req.request.body).toEqual({
      target_status: 'down',
      reason: 'planned',
      expires_at: null,
    });
    req.flush(adminComponent());
    await promise;

    expect(spy).toHaveBeenCalledWith({ category: 'status-admin' });
    expect(spy).toHaveBeenCalledWith({ category: 'status' });
  });

  it('clears a component override', async () => {
    const promise = firstValueFrom(service.clearComponentOverride('api'));
    const req = http.expectOne(`${INTERNAL}/components/api/override/clear`);
    expect(req.request.method).toBe('POST');
    req.flush(adminComponent());
    await promise;
  });

  it('creates an incident', async () => {
    const incident = { id: 'inc-1' } as AdminIncident;
    const promise = firstValueFrom(
      service.createIncident({
        title: 'Outage',
        severity: 'major',
        affected_components: ['api'],
        body: 'investigating',
      }),
    );
    const req = http.expectOne(`${INTERNAL}/incidents`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.title).toBe('Outage');
    req.flush(incident);
    expect((await promise).id).toBe('inc-1');
  });

  it('patches an incident', async () => {
    const promise = firstValueFrom(
      service.patchIncident('inc-1', { title: 'Renamed' }),
    );
    const req = http.expectOne(`${INTERNAL}/incidents/inc-1`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ id: 'inc-1' } as AdminIncident);
    await promise;
  });

  it('posts an incident timeline update', async () => {
    const promise = firstValueFrom(
      service.postIncidentUpdate('inc-1', {
        body: 'still working',
        new_status: 'identified',
      }),
    );
    const req = http.expectOne(`${INTERNAL}/incidents/inc-1/updates`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'inc-1' } as AdminIncident);
    await promise;
  });

  it('resolves an incident', async () => {
    const promise = firstValueFrom(
      service.resolveIncident('inc-1', { body: 'fixed' }),
    );
    const req = http.expectOne(`${INTERNAL}/incidents/inc-1/resolve`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'inc-1' } as AdminIncident);
    await promise;
  });

  it('creates and cancels maintenance windows', async () => {
    const window = { id: 'm-1' } as AdminMaintenance;

    const createPromise = firstValueFrom(
      service.createMaintenance({
        title: 'DB migration',
        starts_at: '2026-06-21T00:00:00Z',
        ends_at: '2026-06-21T01:00:00Z',
        affected_components: [],
      }),
    );
    http.expectOne(`${INTERNAL}/maintenance`).flush(window);
    await createPromise;

    const cancelPromise = firstValueFrom(service.cancelMaintenance('m-1'));
    const cancelReq = http.expectOne(`${INTERNAL}/maintenance/m-1/cancel`);
    expect(cancelReq.request.method).toBe('POST');
    cancelReq.flush(window);
    await cancelPromise;
  });

  it('reads the alert summary and promotes an alert', async () => {
    const summaryPromise = firstValueFrom(service.getAlertSummary());
    http.expectOne(`${INTERNAL}/alerts/summary`).flush([]);
    expect(await summaryPromise).toEqual([]);

    const promotePromise = firstValueFrom(
      service.promoteAlert('fp-1', {
        title: 'Promoted',
        severity: 'major',
        affected_components: ['api'],
        body: 'auto',
      }),
    );
    const req = http.expectOne(`${INTERNAL}/alerts/fp-1/promote`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'inc-9' } as AdminIncident);
    await promotePromise;
  });
});
