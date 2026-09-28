import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { vi } from 'vitest';
import {
  ReviewThresholdsComponent,
  ruleOf,
  ruleRowOf,
} from './review-thresholds.component';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ModerationCountsService } from '../../../services/moderation-counts.service';
import { ToastService } from '../../../services/toast.service';
import { ModerationSettings } from '../../../types/moderation';

const SETTINGS: ModerationSettings = {
  rules: [
    { window_seconds: 3600, min_count: 50, reasons: ['worker_csam'] },
    {
      window_seconds: 86_400,
      min_count: 200,
      reasons: ['worker_csam', 'filter_rejection'],
    },
  ],
};

describe('rule rows', () => {
  it('shows a window in its largest whole unit and reads it back', () => {
    const row = ruleRowOf({
      window_seconds: 5400,
      min_count: 7,
      reasons: ['worker_csam', 'filter_rejection'],
    });
    expect(row).toEqual(
      expect.objectContaining({
        value: '90',
        unit: 'minute',
        count: '7',
        reasons: ['filter_rejection', 'worker_csam'],
      }),
    );
    expect(ruleOf(row)).toEqual({
      window_seconds: 5400,
      min_count: 7,
      reasons: ['filter_rejection', 'worker_csam'],
    });
    expect(
      ruleRowOf({
        window_seconds: 172_800,
        min_count: 1,
        reasons: ['worker_csam'],
      }),
    ).toEqual(expect.objectContaining({ value: '2', unit: 'day' }));
  });

  it('reads a blank field as no number at all', () => {
    const rule = ruleOf({
      id: 0,
      value: '',
      unit: 'hour',
      count: '',
      reasons: [],
    });
    expect(Number.isNaN(rule.window_seconds)).toBe(true);
    expect(Number.isNaN(rule.min_count)).toBe(true);
  });
});

describe('ReviewThresholdsComponent', () => {
  let fixture: ComponentFixture<ReviewThresholdsComponent>;
  let component: ReviewThresholdsComponent;
  let moderation: {
    getSettings: ReturnType<typeof vi.fn>;
    updateSettings: ReturnType<typeof vi.fn>;
  };
  let counts: { refreshReports: ReturnType<typeof vi.fn> };

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const render = async (): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [
        ReviewThresholdsComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        { provide: AdminModerationService, useValue: moderation },
        { provide: ModerationCountsService, useValue: counts },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: vi.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReviewThresholdsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    moderation = {
      getSettings: vi.fn(() => of(SETTINGS)),
      updateSettings: vi.fn((settings: ModerationSettings) => of(settings)),
    };
    counts = { refreshReports: vi.fn() };
  });

  it('shows the stored rules and nothing to save until one changes', async () => {
    await render();

    expect(host().querySelectorAll('.review-rule').length).toBe(2);
    expect(component.dirty()).toBe(false);
  });

  it('shows no problem before a save is tried, and each one after', async () => {
    await render();
    const first = component.rows()[0];
    component.updateRow(first.id, { count: '0' });
    fixture.detectChanges();
    expect(host().querySelector('.review-problems')).toBeNull();

    component.save();
    fixture.detectChanges();
    expect(moderation.updateSettings).not.toHaveBeenCalled();
    expect(
      host().querySelector('.review-rule .review-problems')?.textContent,
    ).toContain('admin.review.thresholds.error.count');
  });

  it('refuses a window over 30 days', async () => {
    await render();
    const first = component.rows()[0];
    component.updateRow(first.id, { value: '31', unit: 'day' });
    component.save();

    expect(component.problemsOf(0)).toEqual([
      'admin.review.thresholds.error.window',
    ]);
    expect(moderation.updateSettings).not.toHaveBeenCalled();
  });

  it('stops adding rules at six', async () => {
    await render();
    for (let index = 0; index < 10; index++) component.addRule();

    expect(component.rows().length).toBe(6);
  });

  it('needs at least one rule', async () => {
    await render();
    for (const row of component.rows()) component.removeRule(row.id);
    component.save();

    expect(component.setProblems()).toEqual([
      'admin.review.thresholds.error.too_few',
    ]);
    expect(moderation.updateSettings).not.toHaveBeenCalled();
  });

  it('needs a reason on each rule, chosen on that rule', async () => {
    await render();
    const first = component.rows()[0];
    component.toggleReason(first.id, 'worker_csam');
    component.save();
    fixture.detectChanges();

    expect(component.problemsOf(0)).toEqual([
      'admin.review.thresholds.error.reasons',
    ]);
    expect(component.problemsOf(1)).toEqual([]);
    expect(moderation.updateSettings).not.toHaveBeenCalled();
    const chips = host()
      .querySelectorAll('.review-rule')[1]
      .querySelectorAll('.hd-chip[aria-pressed="true"]');
    expect(chips.length).toBe(2);
  });

  it('saves the rules in seconds and refreshes the counts', async () => {
    await render();
    component.addRule();
    const added = component.rows().at(-1)!;
    component.updateRow(added.id, { value: '6', unit: 'hour', count: '90' });
    component.toggleReason(added.id, 'model_rejection');
    component.save();

    expect(moderation.updateSettings).toHaveBeenCalledWith({
      rules: [
        { window_seconds: 3600, min_count: 50, reasons: ['worker_csam'] },
        {
          window_seconds: 86_400,
          min_count: 200,
          reasons: ['filter_rejection', 'worker_csam'],
        },
        {
          window_seconds: 21_600,
          min_count: 90,
          reasons: ['model_rejection', 'worker_csam'],
        },
      ],
    });
    expect(counts.refreshReports).toHaveBeenCalled();
    expect(component.dirty()).toBe(false);
  });
});
