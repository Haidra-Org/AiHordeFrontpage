import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ReviewWorkerComponent } from './review-worker.component';
import { RANGE_SETTLE_MS } from './review-subjects';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';
import {
  EndpointAvailability,
  ModerationWorkerDetail,
  ModerationWorkerDetailQuery,
  PromptModerationEvent,
  PromptModerationEventQuery,
  PromptModerationEventsPage,
} from '../../../types/moderation';

const SINCE = Date.UTC(2026, 8, 25, 22);
const iso = (ms: number): string =>
  new Date(ms).toISOString().replace('.000Z', '+00:00');

function detailOf(
  overrides: Partial<ModerationWorkerDetail> = {},
): ModerationWorkerDetail {
  return {
    worker_name: 'seedmod-image-misfire',
    paused: false,
    since: iso(SINCE),
    until: iso(SINCE + 86_400_000),
    bucket_seconds: 900,
    count: 40,
    counts_by_reason: { worker_csam: 40 },
    timeline: Array.from({ length: 96 }, (_, index) => ({
      start: iso(SINCE + index * 900_000),
      counts_by_reason: { worker_csam: index % 12 === 0 ? 5 : 0 },
    })),
    related: {
      accounts: {
        items: [
          { user_id: 1996, username: 'seedmod_misfire_0000#1996', count: 2 },
          { user_id: 1997, username: 'seedmod_misfire_0001#1997', count: 2 },
        ],
        total: 20,
      },
      proxied_accounts: null,
      ips: { items: [{ ipaddr: '198.18.187.129', count: 2 }], total: 1 },
    },
    models: {
      items: [
        {
          model: 'AlbedoBase XL (SDXL)',
          count: 12,
          counts_by_reason: { worker_csam: 12 },
        },
      ],
      total: 1,
    },
    events: [event(9), event(8)],
    events_next_cursor: 7,
    ...overrides,
  };
}

function event(id: number): PromptModerationEvent {
  return {
    id,
    created: '2026-09-26T10:00:00+00:00',
    user_id: 1996,
    request_id: null,
    worker_id: 'w-misfire',
    proxied_account: null,
    ipaddr: '198.18.187.129',
    models: ['AlbedoBase XL (SDXL)'],
    reason: 'worker_csam',
    outcome: 'censored',
    submitted_prompt: 'text',
    moderation_prompt: null,
    effective_prompt: null,
    text_truncated: false,
    notes: [],
  };
}

describe('ReviewWorkerComponent', () => {
  let fixture: ComponentFixture<ReviewWorkerComponent>;
  let component: ReviewWorkerComponent;
  let rangeDetail: Subject<ModerationWorkerDetail>;
  let moderation: {
    subjectsAvailability: () => EndpointAvailability;
    reportingWorkersAvailability: () => EndpointAvailability;
    getWorkerDetail: ReturnType<
      typeof vi.fn<
        (
          query: ModerationWorkerDetailQuery,
        ) => Observable<ModerationWorkerDetail>
      >
    >;
    getPromptEvents: ReturnType<
      typeof vi.fn<
        (
          query: PromptModerationEventQuery,
        ) => Observable<PromptModerationEventsPage>
      >
    >;
  };

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    rangeDetail = new Subject();
    moderation = {
      subjectsAvailability: () => 'absent',
      reportingWorkersAvailability: () => 'available',
      getWorkerDetail: vi.fn((query) =>
        query.since ? rangeDetail : of(detailOf()),
      ),
      getPromptEvents: vi.fn(() => of({ events: [], next_cursor: null })),
    };
    await TestBed.configureTestingModule({
      imports: [
        ReviewWorkerComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: AdminModerationService, useValue: moderation },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: vi.fn() },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ReviewWorkerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('workerId', 'w-misfire');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('opens a worker with one read, its reports included', () => {
    expect(moderation.getWorkerDetail).toHaveBeenCalledExactlyOnceWith({
      worker_id: 'w-misfire',
    });
    expect(moderation.getPromptEvents).not.toHaveBeenCalled();
    expect(host().querySelectorAll('[data-event]')).toHaveLength(2);
    expect(host().querySelector('[data-timeline]')).not.toBeNull();
    expect(host().querySelector('[data-connected]')?.textContent).toContain(
      'seedmod_misfire_0000#1996',
    );
  });

  it('offers no pause and no decisions on the page', () => {
    (host().querySelector('[data-event-toggle]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(host().textContent).not.toContain(
      'admin.review.reports.action.pause_worker',
    );
    expect(host().querySelector('[data-decision-bar]')).toBeNull();
    expect(host().querySelector('[data-meter]')).toBeNull();
  });

  it('links to the worker card, where pausing lives', () => {
    const link = Array.from(host().querySelectorAll('a')).find((a) =>
      a.textContent?.includes('admin.review.workers.open_card'),
    );
    expect(link?.getAttribute('href')).toBe('/admin/workers?worker=w-misfire');
  });

  it('reads a range by worker once, and cancels it when superseded', () => {
    vi.useFakeTimers();
    component.selectRange({ from: 0, to: 7 });
    vi.advanceTimersByTime(RANGE_SETTLE_MS);

    expect(moderation.getWorkerDetail).toHaveBeenLastCalledWith({
      worker_id: 'w-misfire',
      since: '2026-09-25T22:00:00+00:00',
      until: '2026-09-26T00:00:00+00:00',
    });
    expect(moderation.getPromptEvents).not.toHaveBeenCalled();
    expect(rangeDetail.observed).toBe(true);

    component.selectRange({ from: 8, to: 15 });
    expect(rangeDetail.observed).toBe(false);
  });

  it('says so when the worker is gone and none of its reports are kept', async () => {
    moderation.getWorkerDetail.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { message: 'gone', rc: 'WorkerNotFound' },
          }),
      ),
    );
    fixture.componentRef.setInput('workerId', 'w-gone');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.detailState()).toBe('missing');
    expect(host().querySelector('[data-worker-missing]')).not.toBeNull();
  });
});
