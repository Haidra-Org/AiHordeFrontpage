import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import {
  BULK_PACE_MS,
  DEFAULT_PAUSED_FILTERS,
  PAUSED_LIMIT,
  ReviewPausedWorkersComponent,
  matchesOwner,
  pausedQueryOf,
} from './review-paused-workers.component';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { ModerationCountsService } from '../../../services/moderation-counts.service';
import { ToastService } from '../../../services/toast.service';
import {
  EndpointAvailability,
  ModerationOverview,
  PausedWorkerReview,
} from '../../../types/moderation';

function worker(
  id: string,
  overrides: Partial<PausedWorkerReview> = {},
): PausedWorkerReview {
  return {
    id,
    name: `worker-${id}`,
    type: 'image',
    owner_id: 7,
    owner: 'owner#7',
    last_check_in: '2026-09-26T10:00:00Z',
    online: true,
    maintenance_mode: false,
    maintenance_msg: null,
    suspicious: 3,
    suspicion_threshold: 3,
    suspicion_reasons: [],
    owner_suspicion: 0,
    owner_trusted: false,
    owner_flagged: false,
    requests_fulfilled: 10,
    aborted_jobs: 0,
    bridge_agent: 'reGen',
    models: [],
    contact: null,
    ...overrides,
  };
}

function overview(
  workers: PausedWorkerReview[],
  total?: number,
): ModerationOverview {
  return {
    promotion_blocked_users: [],
    promotion_eligible_users: [],
    paused_workers: workers,
    ...(total !== undefined ? { paused_workers_total: total } : {}),
  };
}

describe('paused worker filters', () => {
  it('sends the kinds, causes, status and order, and keeps owner states on the page', () => {
    expect(pausedQueryOf(DEFAULT_PAUSED_FILTERS)).toEqual({
      limit: PAUSED_LIMIT,
    });
    expect(
      pausedQueryOf({
        kinds: ['text'],
        causes: [3, 9],
        online: false,
        sort: 'last_check_in',
        owners: ['flagged'],
      }),
    ).toEqual({
      limit: PAUSED_LIMIT,
      worker_type: ['text'],
      suspicion_id: [3, 9],
      online: false,
      sort: 'last_check_in',
    });
  });

  it('matches an owner in any chosen state', () => {
    const flagged = worker('a', { owner_flagged: true });
    const over = worker('b', { owner_suspicion: 5, suspicion_threshold: 3 });
    expect(matchesOwner(flagged, [])).toBe(true);
    expect(matchesOwner(flagged, ['flagged'])).toBe(true);
    expect(matchesOwner(flagged, ['trusted'])).toBe(false);
    expect(matchesOwner(over, ['over'])).toBe(true);
    expect(matchesOwner(worker('c'), ['over', 'trusted'])).toBe(false);
  });
});

describe('ReviewPausedWorkersComponent', () => {
  let fixture: ComponentFixture<ReviewPausedWorkersComponent>;
  let component: ReviewPausedWorkersComponent;
  let answer: ModerationOverview;
  let moderation: {
    workerSuspicionEventsAvailability: ReturnType<
      typeof signal<EndpointAvailability>
    >;
    getOverview: ReturnType<typeof vi.fn>;
    getWorkerSuspicionEvents: ReturnType<typeof vi.fn>;
    invalidate: ReturnType<typeof vi.fn>;
  };
  let workers: {
    setPaused: ReturnType<typeof vi.fn>;
    setMaintenance: ReturnType<typeof vi.fn>;
  };
  let counts: {
    refreshOverview: ReturnType<typeof vi.fn>;
    promptsAvailable: WritableSignal<boolean>;
  };

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const render = async (): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [
        ReviewPausedWorkersComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: AdminModerationService, useValue: moderation },
        { provide: AdminWorkerService, useValue: workers },
        { provide: ModerationCountsService, useValue: counts },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: vi.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReviewPausedWorkersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const settle = (): void => {
    TestBed.tick();
    fixture.detectChanges();
  };

  beforeEach(() => {
    answer = overview(
      [
        worker('a'),
        worker('b', { owner_flagged: true, type: 'text' }),
        worker('c'),
      ],
      1840,
    );
    moderation = {
      workerSuspicionEventsAvailability:
        signal<EndpointAvailability>('unknown'),
      getOverview: vi.fn(() => of(answer)),
      getWorkerSuspicionEvents: vi.fn(() =>
        of({ events: [], next_cursor: null }),
      ),
      invalidate: vi.fn(),
    };
    workers = {
      setPaused: vi.fn(() => of({ paused: false })),
      setMaintenance: vi.fn(() => of({ maintenance: true })),
    };
    counts = { refreshOverview: vi.fn(), promptsAvailable: signal(false) };
  });

  it('offers no filters to a horde that states no total, and sends none', async () => {
    answer = overview([worker('a')]);
    await render();

    expect(moderation.getOverview).toHaveBeenCalledTimes(1);
    expect(moderation.getOverview).toHaveBeenCalledWith({
      limit: PAUSED_LIMIT,
    });
    expect(host().querySelector('.review-criteria')).toBeNull();
  });

  it('states how many are shown of the total', async () => {
    await render();

    expect(host().querySelector('.review-criteria')).not.toBeNull();
    expect(host().querySelector('[data-paused-shown]')?.textContent).toContain(
      'admin.review.paused.showing',
    );
    expect(component.total()).toBe(1840);
  });

  it('asks the horde again when a kind, cause, status or order is chosen', async () => {
    await render();
    component.toggleKind('text');
    component.toggleCause(3);
    component.setOnline(false);
    component.setSort('name');
    settle();

    expect(moderation.getOverview).toHaveBeenLastCalledWith({
      limit: PAUSED_LIMIT,
      worker_type: ['text'],
      suspicion_id: [3],
      online: false,
      sort: 'name',
    });
  });

  it('offers the orders besides the horde default, which sends no sort', async () => {
    await render();
    expect(component.sorts).not.toContain('last_check_in');
    component.setSort('');
    settle();
    expect(moderation.getOverview).toHaveBeenLastCalledWith({
      limit: PAUSED_LIMIT,
    });
  });

  it('narrows by owner state on the page, without asking again', async () => {
    await render();
    const calls = moderation.getOverview.mock.calls.length;
    component.toggleOwner('flagged');
    settle();

    expect(component.paused().map((each) => each.id)).toEqual(['b']);
    expect(moderation.getOverview.mock.calls.length).toBe(calls);
  });

  it('runs a bulk unpause one worker at a time, lists refusals and keeps them chosen', async () => {
    vi.useFakeTimers();
    workers.setPaused.mockImplementation((id: string) =>
      id === 'b'
        ? throwError(
            () =>
              new HttpErrorResponse({
                status: 400,
                error: { message: 'Worker is not paused' },
              }),
          )
        : of({ paused: false }),
    );
    await render();
    component.toggleAll();
    component.askBulk('unpause');
    component.confirmBulk();
    vi.advanceTimersByTime(0);

    expect(workers.setPaused).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(BULK_PACE_MS - 1);
    expect(workers.setPaused).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(workers.setPaused).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(BULK_PACE_MS);
    expect(workers.setPaused).toHaveBeenCalledTimes(3);
    vi.useRealTimers();

    expect(component.bulkSummary()).toEqual({
      action: 'unpause',
      succeeded: 2,
      failed: [
        {
          id: 'b',
          name: 'worker-b',
          ok: false,
          message: 'Worker is not paused',
        },
      ],
      skipped: 0,
    });
    expect([...component.checked()]).toEqual(['b']);
    expect(counts.refreshOverview).toHaveBeenCalledWith(true);
    fixture.detectChanges();
    expect(host().querySelector('[data-bulk-failed]')?.textContent).toContain(
      'Worker is not paused',
    );
  });

  it('stops between workers when asked, and counts the rest as not reached', async () => {
    vi.useFakeTimers();
    await render();
    component.toggleAll();
    component.askBulk('maintenance_on');
    component.maintenanceMessage.set('driver update');
    component.confirmBulk();
    vi.advanceTimersByTime(0);
    component.cancelBulk();
    vi.advanceTimersByTime(BULK_PACE_MS * 3);
    vi.useRealTimers();

    expect(workers.setMaintenance).toHaveBeenCalledTimes(1);
    expect(workers.setMaintenance).toHaveBeenCalledWith(
      'a',
      true,
      'driver update',
    );
    expect(component.bulkSummary()).toEqual(
      expect.objectContaining({ succeeded: 1, skipped: 2 }),
    );
    expect(component.bulkRunning()).toBe(false);
  });

  it('acts only on the chosen workers still shown', async () => {
    await render();
    component.toggleChecked('a');
    component.toggleChecked('b');
    component.toggleOwner('flagged');
    settle();

    expect(component.checkedShown().map((each) => each.id)).toEqual(['b']);
  });

  it('still unpauses the open worker on its own', async () => {
    await render();
    component.open('c');
    component.ask('unpause');
    component.confirm();

    expect(workers.setPaused).toHaveBeenCalledWith('c', false);
    expect(moderation.invalidate).toHaveBeenCalled();
  });

  it('links the open worker to the reports it made once the prompt log answers', async () => {
    await render();
    component.open('c');
    fixture.detectChanges();
    expect(host().querySelector('[data-prompts-link]')).toBeNull();

    counts.promptsAvailable.set(true);
    fixture.detectChanges();
    const href = host()
      .querySelector('[data-prompts-link]')
      ?.getAttribute('href');
    expect(href).toContain('tab=prompts');
    expect(href).toContain('worker_id=c');
  });
});
