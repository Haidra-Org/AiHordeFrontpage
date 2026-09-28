import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { NEVER, of } from 'rxjs';
import { vi } from 'vitest';
import {
  DEFAULT_WORKER_WINDOW,
  ReviewWorkersComponent,
  WORKER_PAGE_SIZE,
} from './review-workers.component';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';
import { ReportingWorker } from '../../../types/moderation';

function row(id: string, overrides: Partial<ReportingWorker> = {}) {
  return {
    worker_id: id,
    worker_name: `worker ${id}`,
    reports: 40,
    accounts: 20,
    cleared: 12,
    paused: false,
    ...overrides,
  };
}

describe('ReviewWorkersComponent', () => {
  let fixture: ComponentFixture<ReviewWorkersComponent>;
  let component: ReviewWorkersComponent;
  let moderation: Record<string, ReturnType<typeof vi.fn>>;
  let opened: (string | null)[];

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    moderation = {
      getReportingWorkers: vi.fn(() =>
        of({
          since: '2026-09-20T00:00:00+00:00',
          until: '2026-09-27T00:00:00+00:00',
          workers: [row('a', { paused: true }), row('b')],
          total: 7,
          next_offset: 2,
        }),
      ),
      getWorkerDetail: vi.fn(() => NEVER),
      getPromptEvents: vi.fn(() => NEVER),
    };
    await TestBed.configureTestingModule({
      imports: [
        ReviewWorkersComponent,
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
    fixture = TestBed.createComponent(ReviewWorkersComponent);
    component = fixture.componentInstance;
    opened = [];
    component.workerChange.subscribe((id) => opened.push(id));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('ranks the workers by reports in the default window', () => {
    expect(moderation['getReportingWorkers']).toHaveBeenCalledWith({
      window: DEFAULT_WORKER_WINDOW,
      sort: 'reports',
      limit: WORKER_PAGE_SIZE,
    });
    expect(host().querySelectorAll('[data-worker]').length).toBe(2);
    expect(host().querySelector('[data-worker="a"]')?.textContent).toContain(
      'admin.review.workers.paused_short',
    );
  });

  it('asks again in the chosen order, and pages on from the offset', () => {
    component.sort.set('cleared');
    fixture.detectChanges();
    expect(moderation['getReportingWorkers']).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'cleared' }),
    );

    component.loadMore();
    expect(moderation['getReportingWorkers']).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 2 }),
    );
  });

  it('opens a worker into the address and shows its page', () => {
    (host().querySelector('[data-worker="b"]') as HTMLButtonElement).click();
    expect(opened).toEqual(['b']);

    fixture.componentRef.setInput('worker', 'b');
    fixture.detectChanges();
    expect(host().querySelector('app-review-worker')).not.toBeNull();
    expect(moderation['getWorkerDetail']).toHaveBeenCalledWith({
      worker_id: 'b',
    });
  });
});
