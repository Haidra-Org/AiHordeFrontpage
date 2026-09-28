import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ReviewPromptsComponent } from './review-prompts.component';
import { DEFAULT_PROMPTS, PromptsState } from './review-query';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';
import {
  EndpointAvailability,
  PromptModerationEvent,
} from '../../../types/moderation';

describe('ReviewPromptsComponent', () => {
  let fixture: ComponentFixture<ReviewPromptsComponent>;
  let component: ReviewPromptsComponent;
  let emitted: PromptsState[];
  let getPromptEvents: ReturnType<typeof vi.fn>;
  let probe: ReturnType<typeof vi.fn>;
  /** What the prompt log's probe found; undefined until it has answered. */
  let promptReasonFilter: WritableSignal<boolean | undefined>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const render = async (
    state: PromptsState = DEFAULT_PROMPTS,
    /** Null for a probe that has not answered yet. */
    reasonFilter: boolean | null = false,
    events: PromptModerationEvent[] = [],
  ): Promise<void> => {
    promptReasonFilter = signal(reasonFilter ?? undefined);
    probe = vi.fn(() => of(undefined));
    getPromptEvents = vi.fn(() => of({ events, next_cursor: null }));
    await TestBed.configureTestingModule({
      imports: [
        ReviewPromptsComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: AdminModerationService,
          useValue: {
            subjectsAvailability: signal<EndpointAvailability>('absent'),
            reportingWorkersAvailability:
              signal<EndpointAvailability>('absent'),
            getPromptEvents,
            addPromptNote: vi.fn(),
            promptReasonFilter,
            probe,
          },
        },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: vi.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReviewPromptsComponent);
    component = fixture.componentInstance;
    emitted = [];
    component.stateChange.subscribe((value) => emitted.push(value));
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const oneReason: PromptsState = {
    ...DEFAULT_PROMPTS,
    reasons: ['worker_csam'],
  };

  it('reads the log with the filters and states how long reports are kept', async () => {
    await render({ ...DEFAULT_PROMPTS, user_id: 42 });

    expect(getPromptEvents).toHaveBeenCalledExactlyOnceWith({
      user_id: 42,
      limit: 50,
    });
    expect(host().querySelector('[data-retention]')?.textContent).toContain(
      'admin.review.prompts.retention',
    );
  });

  describe('reason filter', () => {
    it('filters over the loaded reports when the probe found no reason filter', async () => {
      await render(oneReason, false);

      expect(probe).toHaveBeenCalledWith('promptEvents');
      expect(component.query()).toEqual({});
      expect(component.clientReasons()).toEqual(new Set(['worker_csam']));
      expect(getPromptEvents).toHaveBeenCalledExactlyOnceWith({ limit: 50 });
    });

    it('sends the chosen reason to a horde whose probe row carries hold state', async () => {
      await render(oneReason, true);

      expect(component.query()).toEqual({ reason: ['worker_csam'] });
      expect(component.clientReasons()).toBeNull();
      expect(getPromptEvents).toHaveBeenCalledExactlyOnceWith({
        reason: ['worker_csam'],
        limit: 50,
      });
    });

    it('reads nothing until the probe answers, then reads once with the filter', async () => {
      await render({ ...oneReason, period: 'day' }, null);

      expect(component.query()).toBeNull();
      expect(getPromptEvents).not.toHaveBeenCalled();
      expect(host().querySelector('[data-events]')).not.toBeNull();

      promptReasonFilter.set(true);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(getPromptEvents).toHaveBeenCalledExactlyOnceWith({
        since: expect.any(String),
        reason: ['worker_csam'],
        limit: 50,
      });
    });

    it('sends two chosen reasons to a horde that supports the filter', async () => {
      await render(
        { ...DEFAULT_PROMPTS, reasons: ['filter_rejection', 'worker_csam'] },
        true,
      );

      expect(component.query()).toEqual({
        reason: ['filter_rejection', 'worker_csam'],
      });
      expect(component.clientReasons()).toBeNull();
    });

    it('states that reports can be held only when the loaded reports carry hold state', async () => {
      const report: PromptModerationEvent = {
        id: 1,
        created: '2026-09-26T10:00:00+00:00',
        user_id: 42,
        request_id: null,
        worker_id: null,
        proxied_account: null,
        ipaddr: null,
        models: null,
        reason: 'filter_rejection',
        outcome: 'rejected',
        submitted_prompt: null,
        moderation_prompt: null,
        effective_prompt: null,
        text_truncated: false,
        notes: [],
      };
      const holdsLine = (): boolean =>
        (host().textContent ?? '').includes(
          'admin.review.prompts.retention_with_holds',
        );

      await render(DEFAULT_PROMPTS, true, [report]);
      expect(component.holdsShown()).toBe(false);
      expect(holdsLine()).toBe(false);

      TestBed.resetTestingModule();
      await render(DEFAULT_PROMPTS, false, [{ ...report, held_until: null }]);
      expect(component.holdsShown()).toBe(true);
      expect(holdsLine()).toBe(true);
    });

    it('shows every loaded report while every reason is on', async () => {
      await render();
      expect(component.clientReasons()).toBeNull();
    });

    it('turns a reason off and on, and keeps the last one on', async () => {
      await render();
      component.toggleReason('model_rejection');
      expect(emitted.at(-1)?.reasons).toEqual([
        'filter_rejection',
        'worker_csam',
      ]);

      emitted = [];
      fixture.componentRef.setInput('state', oneReason);
      component.toggleReason('worker_csam');
      expect(emitted).toEqual([]);
      component.toggleReason('filter_rejection');
      expect(emitted.at(-1)?.reasons).toEqual([
        'filter_rejection',
        'worker_csam',
      ]);
    });
    it('marks the last reason on as not toggleable, and says why', async () => {
      await render(oneReason);
      const chips = Array.from(
        host().querySelectorAll<HTMLButtonElement>('.review-chip-row .hd-chip'),
      );
      const locked = chips.filter(
        (chip) => chip.getAttribute('aria-disabled') === 'true',
      );
      expect(locked).toHaveLength(1);
      expect(locked[0].getAttribute('aria-pressed')).toBe('true');
      expect(locked[0].getAttribute('aria-describedby')).toBe(
        'review-prompts-reason-kept',
      );
      expect(
        host().querySelector('#review-prompts-reason-kept')?.textContent,
      ).toContain('admin.review.prompts.reason_kept');
    });

    it('leaves every chip toggleable while more than one reason is on', async () => {
      await render();
      expect(
        host().querySelector('.review-chip-row [aria-disabled]'),
      ).toBeNull();
      expect(host().querySelector('#review-prompts-reason-kept')).toBeNull();
    });
  });

  describe('filters', () => {
    it('applies the typed filters, trimmed, and leaves blank ones off', async () => {
      await render();
      component.draftAccount.set(' 42 ');
      component.draftIp.set(' 10.0.0.1 ');
      component.draftWorker.set('  ');
      component.applyFilters();

      expect(emitted.at(-1)).toEqual({
        ...DEFAULT_PROMPTS,
        user_id: 42,
        ipaddr: '10.0.0.1',
      });
    });

    it('refuses an account that is not a number', async () => {
      await render();
      component.draftAccount.set('bob');
      fixture.detectChanges();
      component.applyFilters();

      expect(emitted).toEqual([]);
      expect(
        host().querySelector('#review-prompts-account-error'),
      ).not.toBeNull();
    });

    it('clears every filter at once and keeps the period and reasons', async () => {
      await render({
        ...oneReason,
        worker_id: 'w-1',
        ipaddr: '10.0.0.1',
        period: 'week',
      });
      component.clearFilters();

      expect(emitted.at(-1)).toEqual({ ...oneReason, period: 'week' });
    });

    it('lets a period replace a range a link named', async () => {
      const since = new Date('2026-09-20T00:00:00Z');
      await render({ ...DEFAULT_PROMPTS, since });
      expect(host().querySelector('[data-range]')).not.toBeNull();

      component.setPeriod('day');
      expect(emitted.at(-1)).toEqual({ ...DEFAULT_PROMPTS, period: 'day' });
    });
  });
});
