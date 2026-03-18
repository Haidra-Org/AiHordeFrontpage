import {
  TestBed,
  fakeAsync,
  tick,
  discardPeriodicTasks,
} from '@angular/core/testing';
import { Component, PLATFORM_ID } from '@angular/core';
import { Subject } from 'rxjs';
import { NetworkStatusService } from './network-status.service';
import { AiHordeService } from './ai-horde.service';
import { HordePerformance } from '../types/horde-performance';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePerformance(
  overrides: Partial<HordePerformance> = {},
): HordePerformance {
  return {
    queued_requests: 10,
    queued_text_requests: 5,
    worker_count: 50,
    text_worker_count: 20,
    thread_count: 100,
    text_thread_count: 40,
    queued_megapixelsteps: 500,
    past_minute_megapixelsteps: 1000,
    queued_forms: 10,
    interrogator_count: 10,
    interrogator_thread_count: 20,
    queued_tokens: 2000,
    past_minute_tokens: 5000,
    ...overrides,
  };
}

/**
 * Mock AiHordeService that exposes a controllable Subject
 * so tests can push performance values on demand.
 */
class MockAiHordeService {
  private readonly _performance$ = new Subject<HordePerformance>();

  get performance() {
    return this._performance$.asObservable();
  }

  /** Push a value into the performance observable. */
  emit(perf: HordePerformance): void {
    this._performance$.next(perf);
  }
}

/**
 * Host component to trigger afterNextRender.
 * Angular's afterNextRender only fires during a real component render.
 */
@Component({ template: '' })
class TestHostComponent {
  readonly ns = TestBed.inject(NetworkStatusService);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NetworkStatusService', () => {
  let service: NetworkStatusService;
  let aiHordeMock: MockAiHordeService;

  beforeEach(() => {
    aiHordeMock = new MockAiHordeService();

    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AiHordeService, useValue: aiHordeMock },
        NetworkStatusService,
      ],
    });

    service = TestBed.inject(NetworkStatusService);
  });

  /** Create the host component to fire afterNextRender callbacks. */
  function renderHost(): void {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  }

  // ========================================================================
  // Initial state
  // ========================================================================

  describe('initial state', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should start with null performance', () => {
      expect(service.performance()).toBeNull();
    });

    it('should start with null lastUpdated', () => {
      expect(service.lastUpdated()).toBeNull();
    });

    it('should start with isStale = false', () => {
      expect(service.isStale()).toBe(false);
    });

    it('should start with all needsHelp signals as false', () => {
      expect(service.imageNeedsHelp()).toBe(false);
      expect(service.textNeedsHelp()).toBe(false);
      expect(service.alchemyNeedsHelp()).toBe(false);
      expect(service.anyNeedsHelp()).toBe(false);
    });
  });

  // ========================================================================
  // refresh()
  // ========================================================================

  describe('refresh', () => {
    it('should update performance signal when data arrives', () => {
      const perf = makePerformance();
      service.refresh();
      aiHordeMock.emit(perf);

      expect(service.performance()).toEqual(perf);
    });

    it('should set lastUpdated to a Date', () => {
      service.refresh();
      aiHordeMock.emit(makePerformance());

      expect(service.lastUpdated()).toBeInstanceOf(Date);
    });

    it('should update performance on subsequent refreshes', () => {
      service.refresh();
      aiHordeMock.emit(makePerformance({ worker_count: 10 }));
      expect(service.performance()!.worker_count).toBe(10);

      service.refresh();
      aiHordeMock.emit(makePerformance({ worker_count: 99 }));
      expect(service.performance()!.worker_count).toBe(99);
    });
  });

  // ========================================================================
  // afterNextRender auto-fetch
  // ========================================================================

  describe('afterNextRender auto-fetch', () => {
    it('should call refresh after first render', fakeAsync(() => {
      renderHost();
      aiHordeMock.emit(makePerformance({ worker_count: 42 }));
      tick();

      expect(service.performance()!.worker_count).toBe(42);
      discardPeriodicTasks();
    }));
  });

  // ========================================================================
  // isStale
  // ========================================================================

  describe('isStale', () => {
    it('should be false right after a refresh', fakeAsync(() => {
      renderHost();
      aiHordeMock.emit(makePerformance());
      tick();

      expect(service.isStale()).toBe(false);
      discardPeriodicTasks();
    }));

    it('should become true after the stale threshold', fakeAsync(() => {
      renderHost();
      aiHordeMock.emit(makePerformance());
      tick();

      // The stale ticker fires every STALE_THRESHOLD_MS (120,000ms).
      // At the first tick (120,000ms), diff equals the threshold exactly
      // (not strictly greater). Stale flips on the second tick (240,000ms).
      tick(240_001);

      expect(service.isStale()).toBe(true);
      discardPeriodicTasks();
    }));

    it('should reset to false after a new refresh', fakeAsync(() => {
      renderHost();
      aiHordeMock.emit(makePerformance());
      tick();

      tick(240_001);
      expect(service.isStale()).toBe(true);

      // Refresh again
      service.refresh();
      aiHordeMock.emit(makePerformance());

      expect(service.isStale()).toBe(false);
      discardPeriodicTasks();
    }));
  });

  // ========================================================================
  // Needs-help thresholds
  // ========================================================================

  describe('imageNeedsHelp', () => {
    it('should be true when worker_count < 20', () => {
      service.refresh();
      aiHordeMock.emit(makePerformance({ worker_count: 15 }));
      expect(service.imageNeedsHelp()).toBe(true);
    });

    it('should be true when queued_requests > 200', () => {
      service.refresh();
      aiHordeMock.emit(makePerformance({ queued_requests: 201 }));
      expect(service.imageNeedsHelp()).toBe(true);
    });

    it('should be false when workers >= 20 and queue <= 200', () => {
      service.refresh();
      aiHordeMock.emit(
        makePerformance({ worker_count: 20, queued_requests: 200 }),
      );
      expect(service.imageNeedsHelp()).toBe(false);
    });
  });

  describe('textNeedsHelp', () => {
    it('should be true when text_worker_count < 10', () => {
      service.refresh();
      aiHordeMock.emit(makePerformance({ text_worker_count: 5 }));
      expect(service.textNeedsHelp()).toBe(true);
    });

    it('should be true when queued_text_requests > 100', () => {
      service.refresh();
      aiHordeMock.emit(makePerformance({ queued_text_requests: 101 }));
      expect(service.textNeedsHelp()).toBe(true);
    });

    it('should be false when text workers >= 10 and queue <= 100', () => {
      service.refresh();
      aiHordeMock.emit(
        makePerformance({ text_worker_count: 10, queued_text_requests: 100 }),
      );
      expect(service.textNeedsHelp()).toBe(false);
    });
  });

  describe('alchemyNeedsHelp', () => {
    it('should be true when interrogator_count < 5', () => {
      service.refresh();
      aiHordeMock.emit(makePerformance({ interrogator_count: 3 }));
      expect(service.alchemyNeedsHelp()).toBe(true);
    });

    it('should be true when queued_forms > 50', () => {
      service.refresh();
      aiHordeMock.emit(makePerformance({ queued_forms: 51 }));
      expect(service.alchemyNeedsHelp()).toBe(true);
    });

    it('should be false when interrogators >= 5 and queue <= 50', () => {
      service.refresh();
      aiHordeMock.emit(
        makePerformance({ interrogator_count: 5, queued_forms: 50 }),
      );
      expect(service.alchemyNeedsHelp()).toBe(false);
    });
  });

  describe('anyNeedsHelp', () => {
    it('should be false when no type needs help', () => {
      service.refresh();
      aiHordeMock.emit(makePerformance());
      expect(service.anyNeedsHelp()).toBe(false);
    });

    it('should be true when only image needs help', () => {
      service.refresh();
      aiHordeMock.emit(makePerformance({ worker_count: 5 }));
      expect(service.anyNeedsHelp()).toBe(true);
    });

    it('should be true when only text needs help', () => {
      service.refresh();
      aiHordeMock.emit(makePerformance({ text_worker_count: 2 }));
      expect(service.anyNeedsHelp()).toBe(true);
    });

    it('should be true when only alchemy needs help', () => {
      service.refresh();
      aiHordeMock.emit(makePerformance({ interrogator_count: 1 }));
      expect(service.anyNeedsHelp()).toBe(true);
    });
  });

  // ========================================================================
  // SSR behavior
  // ========================================================================

  describe('SSR (server platform)', () => {
    let ssrService: NetworkStatusService;

    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: PLATFORM_ID, useValue: 'server' },
          { provide: AiHordeService, useValue: aiHordeMock },
          NetworkStatusService,
        ],
      });

      ssrService = TestBed.inject(NetworkStatusService);
    });

    it('should not fetch on refresh during SSR', () => {
      ssrService.refresh();

      // performance should remain null — no subscription was created
      expect(ssrService.performance()).toBeNull();
    });
  });
});
