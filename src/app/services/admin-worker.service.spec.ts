import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { of, Subject } from 'rxjs';
import { AdminWorkerService } from './admin-worker.service';
import { AuthService } from './auth.service';
import { HordeApiCacheService } from './horde-api-cache.service';
import { HordeWorker } from '../types/horde-worker';

describe('AdminWorkerService', () => {
  let service: AdminWorkerService;

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
    TestBed.configureTestingModule({
      providers: [
        AdminWorkerService,
        provideHttpClient(),
        {
          provide: AuthService,
          useValue: {
            getStoredApiKey: () => null,
          },
        },
        {
          provide: HordeApiCacheService,
          useValue: {
            cachedGet: () => of([]),
            invalidate: () => undefined,
          },
        },
      ],
    });

    service = TestBed.inject(AdminWorkerService);
  });

  it('should emit workers progressively as each worker lookup completes', fakeAsync(() => {
    const firstWorker$ = new Subject<HordeWorker | null>();
    const secondWorker$ = new Subject<HordeWorker | null>();
    const workerA = createWorker('worker-a');
    const workerB = createWorker('worker-b');

    spyOn(service, 'getWorker').and.callFake((id: string) => {
      if (id === 'worker-a') return firstWorker$.asObservable();
      return secondWorker$.asObservable();
    });

    const emissions: HordeWorker[][] = [];

    service
      .getWorkersByIds(['worker-a', 'worker-b'])
      .subscribe((workers) => emissions.push(workers));

    firstWorker$.next(workerA);
    firstWorker$.complete();
    tick();

    expect(emissions).toEqual([[workerA]]);

    secondWorker$.next(workerB);
    secondWorker$.complete();
    tick();

    expect(emissions).toEqual([[workerA], [workerA, workerB]]);
  }));

  it('should still emit successful workers when one worker lookup fails', fakeAsync(() => {
    const firstWorker$ = new Subject<HordeWorker | null>();
    const secondWorker$ = new Subject<HordeWorker | null>();
    const workerA = createWorker('worker-a');

    spyOn(service, 'getWorker').and.callFake((id: string) => {
      if (id === 'worker-a') return firstWorker$.asObservable();
      return secondWorker$.asObservable();
    });

    const emissions: HordeWorker[][] = [];

    service
      .getWorkersByIds(['worker-a', 'worker-b'])
      .subscribe((workers) => emissions.push(workers));

    firstWorker$.next(workerA);
    firstWorker$.complete();
    tick();

    secondWorker$.error(new Error('worker-b failed'));
    tick();

    expect(emissions).toEqual([[workerA]]);
  }));
});
