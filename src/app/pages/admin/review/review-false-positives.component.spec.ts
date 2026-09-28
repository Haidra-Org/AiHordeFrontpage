import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { vi } from 'vitest';
import {
  CLEARED_WORKERS_LIMIT,
  DEFAULT_FALSE_POSITIVE_WINDOW,
  ReviewFalsePositivesComponent,
} from './review-false-positives.component';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';

describe('ReviewFalsePositivesComponent', () => {
  it('lists the workers from the ranking, most reports marked benign first', async () => {
    const moderation = {
      getFalsePositives: vi.fn(() =>
        of({
          since: '2026-09-01T00:00:00Z',
          until: '2026-09-27T00:00:00Z',
          models: [],
          total: 0,
          next_offset: null,
        }),
      ),
      getReportingWorkers: vi.fn(() =>
        of({
          window_seconds: 2_592_000,
          workers: [
            {
              worker_id: 'w1',
              worker_name: 'misfire',
              reports: 40,
              accounts: 20,
              cleared: 30,
              paused: false,
            },
            {
              worker_id: 'w2',
              worker_name: 'quiet',
              reports: 3,
              accounts: 3,
              cleared: 0,
              paused: false,
            },
          ],
          total: 2,
          next_offset: null,
        }),
      ),
    };
    await TestBed.configureTestingModule({
      imports: [
        ReviewFalsePositivesComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: AdminModerationService, useValue: moderation },
        { provide: ToastService, useValue: { error: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ReviewFalsePositivesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(moderation.getReportingWorkers).toHaveBeenCalledWith({
      window: DEFAULT_FALSE_POSITIVE_WINDOW,
      sort: 'cleared',
      limit: CLEARED_WORKERS_LIMIT,
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('misfire');
    expect(text).not.toContain('quiet');
  });
});
