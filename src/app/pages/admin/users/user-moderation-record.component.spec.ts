import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of } from 'rxjs';
import { vi } from 'vitest';
import {
  ACCOUNT_REPORT_LIMIT,
  REPORT_SUMMARY_SECONDS,
  UserModerationRecordComponent,
} from './user-moderation-record.component';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { ToastService } from '../../../services/toast.service';
import {
  EndpointAvailability,
  PromptModerationEvent,
  PromptModerationReason,
  SubjectDecision,
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
    ip_subject_key: null,
    origin_text: null,
    models: null,
    reason,
    outcome: 'rejected',
    submitted_prompt: `submitted text ${id}`,
    moderation_prompt: `styled text ${id}`,
    effective_prompt: `effective text ${id}`,
    text_state: 'pending',
    text_url: null,
    text_sha256: null,
    text_chars: null,
    text_truncated: false,
    text_redacted: false,
    ipaddr_redacted: false,
    anonymized: false,
    notes: [],
  };
}

function decision(overrides: Partial<SubjectDecision> = {}): SubjectDecision {
  return {
    id: 1,
    subject_kind: 'account',
    user_id: 42,
    proxied_account: null,
    ipaddr: null,
    outcome: 'benign',
    note: null,
    reviewer_id: 9,
    reviewer: 'mod',
    created: '2026-09-20T10:00:00+00:00',
    watermark_event_id: 3,
    watch_until: null,
    watch_min_count: null,
    action: null,
    action_detail: null,
    ...overrides,
  };
}

describe('UserModerationRecordComponent', () => {
  let fixture: ComponentFixture<UserModerationRecordComponent>;
  let subjectsAvailability: WritableSignal<EndpointAvailability>;
  let promptEventsAvailability: WritableSignal<EndpointAvailability>;
  let events: PromptModerationEvent[];
  let decisions: SubjectDecision[];
  let moderation: {
    subjectsAvailability: WritableSignal<EndpointAvailability>;
    promptEventsAvailability: WritableSignal<EndpointAvailability>;
    settingsAvailability: WritableSignal<EndpointAvailability>;
    workerSuspicionEventsAvailability: WritableSignal<EndpointAvailability>;
    getSubjectDecisions: ReturnType<typeof vi.fn>;
    getSettings: ReturnType<typeof vi.fn>;
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
    subjectsAvailability = signal<EndpointAvailability>('absent');
    promptEventsAvailability = signal<EndpointAvailability>('available');
    events = [
      event(1, 'worker_csam'),
      event(2, 'worker_csam'),
      event(3, 'filter_rejection'),
    ];
    decisions = [decision()];
    moderation = {
      subjectsAvailability,
      promptEventsAvailability,
      settingsAvailability: signal<EndpointAvailability>('available'),
      workerSuspicionEventsAvailability:
        signal<EndpointAvailability>('unknown'),
      getSubjectDecisions: vi.fn(() => of({ decisions, next_cursor: null })),
      getSettings: vi.fn(() =>
        of({
          rules: [
            { window_seconds: 3600, min_count: 50, reasons: ['worker_csam'] },
            {
              window_seconds: 86_400,
              min_count: 200,
              reasons: ['worker_csam'],
            },
          ],
        }),
      ),
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
    it('counts the reports of the summary window by reason from one read, and asks nothing else', async () => {
      await render();

      expect(moderation.getPromptEvents).toHaveBeenCalledExactlyOnceWith({
        user_id: 42,
        since: '2026-08-27T12:00:00+00:00',
        limit: ACCOUNT_REPORT_LIMIT,
      });
      expect(moderation.getSubjectDecisions).not.toHaveBeenCalled();
      expect(moderation.getSettings).not.toHaveBeenCalled();
      expect(count('all')).toBe('3');
      expect(count('worker_csam')).toBe('2');
      expect(count('filter_rejection')).toBe('1');
      expect(count('model_rejection')).toBe('0');
      expect(fixture.componentInstance.summary()?.window).toBe(
        REPORT_SUMMARY_SECONDS,
      );
    });

    it('shows no standing in Reports and no link to it', async () => {
      await render();

      expect(host().querySelector('[data-account-state]')).toBeNull();
      expect(host().querySelector('[data-case-link]')).toBeNull();
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
        since: '2026-08-27T12:00:00+00:00',
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

  describe('with the report listings', () => {
    beforeEach(() => subjectsAvailability.set('available'));

    it("asks for the account's latest decision", async () => {
      await render();

      expect(moderation.getSubjectDecisions).toHaveBeenCalledWith({
        kind: 'account',
        user_id: 42,
        limit: 1,
      });
      expect(
        host().querySelector('[data-account-state]')?.textContent,
      ).toContain('admin.review.reports.outcome.benign');
    });

    it('counts reports over the longest alert window, by reason', async () => {
      await render();

      expect(moderation.getPromptEvents).toHaveBeenCalledWith({
        user_id: 42,
        since: '2026-09-25T12:00:00+00:00',
        limit: ACCOUNT_REPORT_LIMIT,
      });
      expect(count('all')).toBe('3');
    });

    it('counts over the summary window when the alert rules cannot be read', async () => {
      moderation.settingsAvailability.set('absent');
      await render();

      expect(moderation.getSettings).not.toHaveBeenCalled();
      expect(moderation.getPromptEvents).toHaveBeenCalledWith({
        user_id: 42,
        since: '2026-08-27T12:00:00+00:00',
        limit: ACCOUNT_REPORT_LIMIT,
      });
    });

    it('says a watch is running until its date', async () => {
      decisions = [
        decision({
          outcome: 'watching',
          watch_until: '2026-10-10T00:00:00+00:00',
        }),
      ];
      await render();

      expect(
        host().querySelector('[data-account-state]')?.textContent,
      ).toContain('admin.review.reports.watch_until');
    });

    it('links to this account in Reports', async () => {
      await render();

      const url = hrefOf('[data-case-link]');
      expect(url?.pathname).toBe('/admin/review');
      expect(Object.fromEntries(url?.searchParams ?? [])).toEqual({
        tab: 'reports',
        open: 'account:42',
      });
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
