import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of } from 'rxjs';
import { vi } from 'vitest';
import {
  ACCOUNT_REPORT_LIMIT,
  REPORT_RETENTION_SECONDS,
  UserModerationRecordComponent,
} from './user-moderation-record.component';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';
import {
  EndpointAvailability,
  PromptModerationEvent,
  PromptModerationReason,
} from '../../../types/moderation';

function event(
  id: number,
  reason: PromptModerationReason,
): PromptModerationEvent {
  return {
    id,
    created: '2026-09-20T10:00:00+00:00',
    user_id: 42,
    request_id: null,
    worker_id: null,
    proxied_account: null,
    ipaddr: null,
    models: null,
    reason,
    outcome: 'rejected',
    submitted_prompt: `submitted text ${id}`,
    moderation_prompt: `styled text ${id}`,
    effective_prompt: `effective text ${id}`,
    text_truncated: false,
    notes: [],
  };
}

describe('UserModerationRecordComponent', () => {
  let fixture: ComponentFixture<UserModerationRecordComponent>;
  let promptEventsAvailability: WritableSignal<EndpointAvailability>;
  let events: PromptModerationEvent[];
  let moderation: {
    promptEventsAvailability: WritableSignal<EndpointAvailability>;
    workerSuspicionEventsAvailability: WritableSignal<EndpointAvailability>;
    getPromptEvents: ReturnType<typeof vi.fn>;
    getWorkerSuspicionEvents: ReturnType<typeof vi.fn>;
    probe: ReturnType<typeof vi.fn>;
  };
  /** The prompt log's probe, which answers only when a test says so. */
  let probeAnswer: Subject<void>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const count = (key: string): string =>
    host().querySelector(`[data-report-count="${key}"]`)?.textContent?.trim() ??
    '';

  const render = async (): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [
        UserModerationRecordComponent,
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

    fixture = TestBed.createComponent(UserModerationRecordComponent);
    fixture.componentRef.setInput('userId', 42);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-26T12:00:00Z'));
    promptEventsAvailability = signal<EndpointAvailability>('available');
    events = [
      event(1, 'worker_csam'),
      event(2, 'worker_csam'),
      event(3, 'filter_rejection'),
    ];
    moderation = {
      promptEventsAvailability,
      workerSuspicionEventsAvailability:
        signal<EndpointAvailability>('unknown'),
      getPromptEvents: vi.fn(() => {
        promptEventsAvailability.set('available');
        return of({ events, next_cursor: null });
      }),
      getWorkerSuspicionEvents: vi.fn(),
      probe: vi.fn(() =>
        promptEventsAvailability() === 'unknown' ? probeAnswer : of(undefined),
      ),
    };
    probeAnswer = new Subject<void>();
  });

  afterEach(() => vi.useRealTimers());

  const hrefOf = (selector: string): URL | null => {
    const href = host().querySelector(selector)?.getAttribute('href');
    return href ? new URL(href, 'http://x') : null;
  };

  describe('without the report listings', () => {
    it('counts the kept reports by reason from one read, and asks nothing else', async () => {
      await render();

      expect(moderation.getPromptEvents).toHaveBeenCalledExactlyOnceWith({
        user_id: 42,
        limit: ACCOUNT_REPORT_LIMIT,
      });
      expect(count('all')).toBe('3');
      expect(count('worker_csam')).toBe('2');
      expect(count('filter_rejection')).toBe('1');
      expect(count('model_rejection')).toBe('0');
      expect(fixture.componentInstance.summary()?.window).toBe(
        REPORT_RETENTION_SECONDS,
      );
    });

    it("links to the account's reports in the Prompts tab", async () => {
      await render();

      const url = hrefOf('[data-prompts-link]');
      expect(url?.pathname).toBe('/admin/review');
      expect(Object.fromEntries(url?.searchParams ?? [])).toEqual({
        tab: 'prompts',
        user_id: '42',
      });
    });

    it("probes the log first, and reads the account's reports once it answers", async () => {
      promptEventsAvailability.set('unknown');
      await render();

      expect(moderation.probe).toHaveBeenCalledWith('promptEvents');
      expect(moderation.getPromptEvents).not.toHaveBeenCalled();

      promptEventsAvailability.set('available');
      probeAnswer.next();
      probeAnswer.complete();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(moderation.getPromptEvents).toHaveBeenCalledExactlyOnceWith({
        user_id: 42,
        limit: ACCOUNT_REPORT_LIMIT,
      });
      expect(host().querySelector('.user-moderation-reports')).not.toBeNull();
    });

    it('shows no record and asks nothing for the account while the probe is out', async () => {
      promptEventsAvailability.set('unknown');
      await render();

      expect(moderation.getPromptEvents).not.toHaveBeenCalled();
      expect(host().querySelector('.user-moderation-reports')).toBeNull();
    });

    it('never asks for the account when the probe finds no log', async () => {
      promptEventsAvailability.set('unknown');
      await render();
      promptEventsAvailability.set('absent');
      probeAnswer.next();
      probeAnswer.complete();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(moderation.getPromptEvents).not.toHaveBeenCalled();
      expect(host().querySelector('.user-moderation-reports')).toBeNull();
    });

    it('asks nothing of a log that is absent', async () => {
      promptEventsAvailability.set('absent');
      await render();

      expect(moderation.getPromptEvents).not.toHaveBeenCalled();
      expect(host().querySelector('.user-moderation-reports')).toBeNull();
    });
  });

  it('states a full page as a floor', async () => {
    events = Array.from({ length: ACCOUNT_REPORT_LIMIT }, (_, index) =>
      event(index + 1, 'worker_csam'),
    );
    await render();

    expect(count('all')).toContain('admin.moderation.count_at_least');
    expect(host().textContent).toContain(
      'admin.user_moderation.reports_sample',
    );
  });

  it('never shows prompt text', async () => {
    await render();

    expect(host().textContent).not.toMatch(/(submitted|styled|effective) text/);
  });

  it("offers the account's suspicion history folded, without reading it", async () => {
    await render();

    expect(host().querySelector('.suspicion-disclosure')).not.toBeNull();
    expect(moderation.getWorkerSuspicionEvents).not.toHaveBeenCalled();
  });
});
