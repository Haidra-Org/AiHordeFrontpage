import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { of, Subject } from 'rxjs';
import { AdminWorkerService } from './admin-worker.service';
import { AuthService } from './auth.service';
import { HordeApiCacheService } from './horde-api-cache.service';
import { HordeWorker } from '../types/horde-worker';
import { API_BASE } from '../testing/api-test-helpers';

const BASE = API_BASE;

describe('AdminWorkerService', () => {
  let service: AdminWorkerService;
  let httpTesting: HttpTestingController;
  let mockAuth: { getStoredApiKey: ReturnType<typeof vi.fn> };
  let mockCache: {
    cachedGet: ReturnType<typeof vi.fn>;
    invalidate: ReturnType<typeof vi.fn>;
  };

  const createWorker = (id: string): HordeWorker => ({
    type: 'image',
    name: `Worker ${id}`,
    id,
    online: true,
    requests_fulfilled: 0,
    kudos_rewards: 0,
    performance: '1',
    threads: 1,
    uptime: 1,
    maintenance_mode: false,
    paused: false,
    nsfw: false,
    trusted: false,
    flagged: false,
    suspicious: 0,
    uncompleted_jobs: 0,
    bridge_agent: 'agent:1.0:https://example.com',
  });

  beforeEach(() => {
    mockAuth = { getStoredApiKey: vi.fn().mockReturnValue('admin-key') };
    mockCache = {
      cachedGet: vi.fn().mockReturnValue(of([])),
      invalidate: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        AdminWorkerService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuth },
        { provide: HordeApiCacheService, useValue: mockCache },
      ],
    });

    service = TestBed.inject(AdminWorkerService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  // ===========================================================================
  // getWorkers
  // ===========================================================================

  describe('getWorkers()', () => {
    it('fetches workers via cache with apikey', () => {
      const workers = [createWorker('w1')];
      mockCache.cachedGet.mockReturnValue(of(workers));

      let result: unknown;
      service.getWorkers().subscribe((r) => (result = r));
      expect(result).toEqual(workers);
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.stringContaining('/workers'),
        expect.objectContaining({ headers: { apikey: 'admin-key' } }),
        expect.objectContaining({ category: 'admin-workers' }),
      );
    });

    it('omits apikey when no key stored', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);
      mockCache.cachedGet.mockReturnValue(of([]));
      service.getWorkers().subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.anything(),
        {},
        expect.anything(),
      );
    });
  });

  // ===========================================================================
  // getWorker
  // ===========================================================================

  describe('getWorker()', () => {
    it('fetches a single worker by ID', () => {
      const worker = createWorker('w1');
      mockCache.cachedGet.mockReturnValue(of(worker));

      let result: unknown;
      service.getWorker('w1').subscribe((r) => (result = r));
      expect(result).toEqual(worker);
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.stringContaining('/workers/w1'),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // ===========================================================================
  // getWorkersByIds (progressive loading)
  // ===========================================================================

  describe('getWorkersByIds()', () => {
    it('returns empty array for empty input', () => {
      let result: unknown[] = [];
      service.getWorkersByIds([]).subscribe((r) => (result = r));
      expect(result).toEqual([]);
    });

    it('emits workers progressively as lookups complete', () => {
      const firstWorker$ = new Subject<HordeWorker | null>();
      const secondWorker$ = new Subject<HordeWorker | null>();
      const workerA = createWorker('worker-a');
      const workerB = createWorker('worker-b');

      vi.spyOn(service, 'getWorker').mockImplementation((id: string) => {
        if (id === 'worker-a') return firstWorker$.asObservable();
        return secondWorker$.asObservable();
      });

      const emissions: HordeWorker[][] = [];
      service
        .getWorkersByIds(['worker-a', 'worker-b'])
        .subscribe((workers) => emissions.push(workers));

      firstWorker$.next(workerA);
      firstWorker$.complete();
      expect(emissions).toEqual([[workerA]]);

      secondWorker$.next(workerB);
      secondWorker$.complete();
      expect(emissions).toEqual([[workerA], [workerA, workerB]]);
    });

    it('still emits successful workers when one lookup fails', () => {
      const firstWorker$ = new Subject<HordeWorker | null>();
      const secondWorker$ = new Subject<HordeWorker | null>();
      const workerA = createWorker('worker-a');

      vi.spyOn(service, 'getWorker').mockImplementation((id: string) => {
        if (id === 'worker-a') return firstWorker$.asObservable();
        return secondWorker$.asObservable();
      });

      const emissions: HordeWorker[][] = [];
      service
        .getWorkersByIds(['worker-a', 'worker-b'])
        .subscribe((workers) => emissions.push(workers));

      firstWorker$.next(workerA);
      firstWorker$.complete();
      secondWorker$.error(new Error('worker-b failed'));

      expect(emissions).toEqual([[workerA]]);
    });
  });

  // ===========================================================================
  // updateWorker
  // ===========================================================================

  describe('updateWorker()', () => {
    it('sends PUT with apikey and invalidates cache', () => {
      service.updateWorker('w1', { paused: true }).subscribe();

      const req = httpTesting.expectOne(`${BASE}/workers/w1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.headers.get('apikey')).toBe('admin-key');
      req.flush({ paused: true });

      expect(mockCache.invalidate).toHaveBeenCalledWith({
        category: 'admin-workers',
      });
    });

    it('returns null when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);
      let result: unknown = 'not-null';
      service.updateWorker('w1', {}).subscribe((r) => (result = r));
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // Convenience methods
  // ===========================================================================

  describe('setMaintenance()', () => {
    it('sends maintenance flag with message', () => {
      service.setMaintenance('w1', true, 'GPU update').subscribe();

      const req = httpTesting.expectOne(`${BASE}/workers/w1`);
      expect(req.request.body).toEqual({
        maintenance: true,
        maintenance_msg: 'GPU update',
      });
      req.flush({});
    });

    it('clears message when disabling maintenance', () => {
      service.setMaintenance('w1', false).subscribe();

      const req = httpTesting.expectOne(`${BASE}/workers/w1`);
      expect(req.request.body.maintenance).toBe(false);
      expect(req.request.body.maintenance_msg).toBe('');
      req.flush({});
    });
  });

  describe('setPaused()', () => {
    it('sends paused payload', () => {
      service.setPaused('w1', true).subscribe();

      const req = httpTesting.expectOne(`${BASE}/workers/w1`);
      expect(req.request.body).toEqual({ paused: true });
      req.flush({});
    });
  });

  // ===========================================================================
  // deleteWorker
  // ===========================================================================

  describe('deleteWorker()', () => {
    it('sends DELETE and returns deletion info', () => {
      let result: unknown;
      service.deleteWorker('w1').subscribe((r) => (result = r));

      const req = httpTesting.expectOne(`${BASE}/workers/w1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ deleted_id: 'w1', deleted_name: 'test' });

      expect(result).toEqual({ deleted_id: 'w1', deleted_name: 'test' });
      expect(mockCache.invalidate).toHaveBeenCalled();
    });

    it('returns null when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);
      let result: unknown = 'not-null';
      service.deleteWorker('w1').subscribe((r) => (result = r));
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // getWorkerByName
  // ===========================================================================

  describe('getWorkerByName()', () => {
    it('URL-encodes the worker name', () => {
      mockCache.cachedGet.mockReturnValue(of({ id: 'w1' }));
      service.getWorkerByName('My Worker').subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.stringContaining('/workers/name/My%20Worker'),
        expect.anything(),
        expect.anything(),
      );
    });
  });
});
