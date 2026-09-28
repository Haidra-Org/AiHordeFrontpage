import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, Subject, defer, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import {
  ReviewSubjectComponent,
  SubjectStep,
} from './review-subject.component';
import { PIVOT_LIMIT } from './review-pivots.component';
import { ReviewTimelineComponent } from './review-timeline.component';
import {
  FINDING_MIN_REPORTS,
  RANGE_SETTLE_MS,
  SubjectDecided,
  SubjectRef,
} from './review-subjects';
import { AdminModerationService } from '../../../services/admin-moderation.service';
import { AdminOperationsService } from '../../../services/admin-operations.service';
import { AdminUserService } from '../../../services/admin-user.service';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { ModerationCountsService } from '../../../services/moderation-counts.service';
import { ToastService } from '../../../services/toast.service';
import {
  EndpointAvailability,
  ModerationSubjectDetail,
  ModerationSubjectDetailQuery,
  PromptModerationEvent,
  PromptModerationEventQuery,
  PromptModerationEventsPage,
  SubjectDecision,
  SubjectDecisionInput,
} from '../../../types/moderation';

const ACCOUNT: SubjectRef = {
  kind: 'account',
  user_id: 42,
  proxied_account: null,
  ipaddr: null,
};

const IP: SubjectRef = {
  kind: 'ip',
  user_id: null,
  proxied_account: null,
  ipaddr: '10.0.0.9',
};

function event(id: number): PromptModerationEvent {
  return {
    id,
    created: '2026-09-26T10:00:00+00:00',
    user_id: 42,
    request_id: null,
    worker_id: 'worker-7',
    proxied_account: null,
    ipaddr: '10.0.0.9',
    models: ['model a'],
    reason: 'worker_csam',
    outcome: 'censored',
    submitted_prompt: `submitted text ${id}`,
    moderation_prompt: null,
    effective_prompt: null,
    text_truncated: false,
    notes: [],
  };
}

function stored(input: SubjectDecisionInput): SubjectDecision {
  return {
    id: 99,
    subject_kind: input.kind,
    user_id: input.user_id ?? null,
    proxied_account: input.proxied_account ?? null,
    ipaddr: input.ipaddr ?? null,
    outcome: input.outcome,
    note: input.note ?? null,
    reviewer_id: 1,
    reviewer: 'mod',
    created: '2026-09-26T12:00:00+00:00',
    watermark_event_id: input.watermark_event_id ?? null,
    watch_until: input.watch_until ?? null,
    watch_min_count: input.watch_min_count ?? null,
    action: input.action ?? null,
    action_detail: input.action_detail ?? null,
  };
}

const SINCE = Date.UTC(2026, 8, 25, 22);
const BUCKET_SECONDS = 900;
const iso = (ms: number): string =>
  new Date(ms).toISOString().replace('.000Z', '+00:00');

/**
 * The detail endpoint's answer for a 24-hour window in quarter-hour
 * buckets, shaped like the investigation prototype's stub: a burst of
 * worker reports from 02:00, most of them from one worker.
 */
function detailOf(
  overrides: Partial<ModerationSubjectDetail> = {},
): ModerationSubjectDetail {
  const timeline = Array.from({ length: 96 }, (_, index) => ({
    start: iso(SINCE + index * BUCKET_SECONDS * 1000),
    counts_by_reason: {
      worker_csam: index >= 16 && index < 24 ? 20 : 1,
      filter_rejection: index % 8 === 0 ? 1 : 0,
    },
  }));
  return {
    username: 'lumen#42',
    since: iso(SINCE),
    until: iso(SINCE + 86_400_000),
    bucket_seconds: BUCKET_SECONDS,
    count: 260,
    counts_by_reason: { worker_csam: 248, filter_rejection: 12 },
    since_review_count: 240,
    rules: [
      {
        window_seconds: 3600,
        reasons: ['worker_csam'],
        min_count: 50,
        count: 80,
        exceeded: true,
      },
      {
        window_seconds: 86400,
        reasons: ['worker_csam'],
        min_count: 200,
        count: 170,
        exceeded: false,
      },
      {
        window_seconds: 3600,
        reasons: ['filter_rejection'],
        min_count: 40,
        count: 2,
        exceeded: false,
      },
    ],
    timeline,
    related: {
      accounts: null,
      proxied_accounts: {
        items: [
          {
            user_id: 42,
            proxied_account: 'discord:1',
            count: 20,
          },
        ],
        total: 1,
      },
      ips: { items: [{ ipaddr: '203.0.113.7', count: 180 }], total: 1 },
    },
    workers: {
      items: [
        { worker_id: 'worker-7', worker_name: 'garage-3090', count: 150 },
        { worker_id: 'worker-8', worker_name: 'lab-4090', count: 98 },
      ],
      total: 2,
    },
    models: {
      items: [
        { model: 'model a', count: 90, counts_by_reason: { worker_csam: 90 } },
      ],
      total: 1,
    },
    events: [event(14), event(12)],
    events_next_cursor: null,
    decisions: [
      stored({
        kind: 'account',
        user_id: 42,
        outcome: 'benign',
        watermark_event_id: 10,
      }),
    ],
    decisions_next_cursor: null,
    ...overrides,
  };
}

describe('ReviewSubjectComponent', () => {
  let fixture: ComponentFixture<ReviewSubjectComponent>;
  let component: ReviewSubjectComponent;
  let decided: SubjectDecided[];
  let moderation: {
    subjectsAvailability: () => EndpointAvailability;
    reportingWorkersAvailability: () => EndpointAvailability;
    getSubjectDecisions: ReturnType<typeof vi.fn>;
    getPromptEvents: ReturnType<
      typeof vi.fn<
        (
          query: PromptModerationEventQuery,
        ) => Observable<PromptModerationEventsPage>
      >
    >;
    getSubjectDetail: ReturnType<
      typeof vi.fn<
        (
          query: ModerationSubjectDetailQuery,
        ) => Observable<ModerationSubjectDetail>
      >
    >;
    recordSubjectDecision: ReturnType<
      typeof vi.fn<(input: SubjectDecisionInput) => Observable<SubjectDecision>>
    >;
    addPromptNote: ReturnType<typeof vi.fn>;
  };
  let users: {
    setFlagged: ReturnType<typeof vi.fn>;
    resetSuspicion: ReturnType<typeof vi.fn>;
  };
  let operations: { addIPTimeout: ReturnType<typeof vi.fn> };
  let workers: { setPaused: ReturnType<typeof vi.fn> };
  let counts: { refreshReports: ReturnType<typeof vi.fn> };
  let toast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const render = async (ref: SubjectRef = ACCOUNT): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [
        ReviewSubjectComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: AdminModerationService, useValue: moderation },
        { provide: AdminUserService, useValue: users },
        { provide: AdminOperationsService, useValue: operations },
        { provide: AdminWorkerService, useValue: workers },
        { provide: ModerationCountsService, useValue: counts },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReviewSubjectComponent);
    component = fixture.componentInstance;
    decided = [];
    component.decided.subscribe((value) => decided.push(value));
    fixture.componentRef.setInput('ref', ref);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    moderation = {
      subjectsAvailability: () => 'available',
      reportingWorkersAvailability: () => 'absent',
      getSubjectDecisions: vi.fn(() =>
        of({
          decisions: [
            stored({
              kind: 'account',
              user_id: 42,
              outcome: 'benign',
              watermark_event_id: 10,
            }),
          ],
          next_cursor: null,
        }),
      ),
      getPromptEvents: vi.fn((_query: PromptModerationEventQuery) =>
        of({ events: [event(14), event(12)], next_cursor: null }),
      ),
      getSubjectDetail: vi.fn((_query: ModerationSubjectDetailQuery) =>
        of(detailOf()),
      ),
      recordSubjectDecision: vi.fn((input: SubjectDecisionInput) =>
        of(stored(input)),
      ),
      addPromptNote: vi.fn(),
    };
    users = {
      setFlagged: vi.fn(() => of({ flagged: true })),
      resetSuspicion: vi.fn(() => of({ reset_suspicion: true })),
    };
    operations = { addIPTimeout: vi.fn(() => of({ message: 'OK' })) };
    workers = { setPaused: vi.fn(() => of({ paused: true })) };
    counts = { refreshReports: vi.fn() };
    toast = { success: vi.fn(), error: vi.fn() };
  });

  it('opens a subject with one read: its detail, reports and decisions', async () => {
    await render();

    expect(moderation.getSubjectDetail).toHaveBeenCalledExactlyOnceWith({
      kind: 'account',
      user_id: 42,
    });
    expect(moderation.getSubjectDecisions).not.toHaveBeenCalled();
    expect(moderation.getPromptEvents).not.toHaveBeenCalled();
    expect(host().querySelectorAll('[data-events] [data-event]')).toHaveLength(
      2,
    );
    expect(component.latest()?.watermark_event_id).toBe(10);
  });

  it('pages the history and the reports on from the detail cursors', async () => {
    moderation.getSubjectDetail.mockReturnValue(
      of(detailOf({ decisions_next_cursor: 97, events_next_cursor: 12 })),
    );
    await render();
    component.loadMoreDecisions();
    expect(moderation.getSubjectDecisions).toHaveBeenCalledWith({
      kind: 'account',
      user_id: 42,
      limit: 20,
      before_id: 97,
    });

    (
      host().querySelector(
        '[data-events] .review-load-more',
      ) as HTMLButtonElement
    ).click();
    expect(moderation.getPromptEvents).toHaveBeenCalledWith({
      user_id: 42,
      limit: 50,
      before_id: 12,
    });
  });

  it('never offers actioned as a choice in the decision dialog', async () => {
    await render();
    component.openDecision();
    fixture.detectChanges();

    const values = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input[name="review-decision-outcome"]',
      ),
    ).map((input) => input.value);
    expect(values).toEqual(['benign', 'watching', 'escalated']);
  });

  it('records a benign decision up to the newest report shown, then moves on', async () => {
    await render();
    component.openDecision();
    component.updateForm({ note: '  blurry photos  ' });
    component.confirmDecision();

    expect(moderation.recordSubjectDecision).toHaveBeenCalledWith({
      kind: 'account',
      user_id: 42,
      watermark_event_id: 14,
      outcome: 'benign',
      note: 'blurry photos',
    });
    expect(decided).toEqual([expect.objectContaining({ advance: true })]);
    expect(counts.refreshReports).toHaveBeenCalled();
    expect(component.latest()?.id).toBe(99);
  });

  it('holds a watch without a valid end date and says why', async () => {
    await render();
    component.openDecision();
    component.setOutcome('watching');
    component.confirmDecision();
    fixture.detectChanges();

    expect(moderation.recordSubjectDecision).not.toHaveBeenCalled();
    expect(component.shownProblems()).toEqual([
      'admin.review.reports.decision.error.watch_until_missing',
    ]);
    expect(document.querySelector('.review-problems')?.textContent).toContain(
      'watch_until_missing',
    );
  });

  it('sends a valid watch with its end and lowered threshold', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 26, 12));
    await render();
    component.openDecision();
    component.setOutcome('watching');
    component.updateForm({ watchUntil: '2026-10-03', watchMinCount: '5' });
    component.confirmDecision();
    vi.useRealTimers();

    expect(moderation.recordSubjectDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'watching',
        watch_until: new Date(2026, 9, 3, 23, 59, 59).toISOString(),
        watch_min_count: 5,
      }),
    );
  });

  it('records a flag as actioned only after the flag went through', async () => {
    await render();
    component.askAction('flag_account');
    component.confirmAction();

    expect(users.setFlagged).toHaveBeenCalledWith(42, true);
    expect(moderation.recordSubjectDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'account',
        user_id: 42,
        outcome: 'actioned',
        action: 'flag_account',
      }),
    );
    expect(decided).toEqual([expect.objectContaining({ advance: false })]);
  });

  it('records nothing when the action fails', async () => {
    users.setFlagged.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    await render();
    component.askAction('flag_account');
    component.confirmAction();

    expect(moderation.recordSubjectDecision).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'admin.review.reports.action_error',
      expect.anything(),
    );
  });

  it('records nothing without a key to act with', async () => {
    users.resetSuspicion.mockReturnValue(of(null));
    await render();
    component.askAction('reset_suspicion');
    component.confirmAction();

    expect(moderation.recordSubjectDecision).not.toHaveBeenCalled();
  });

  it('times out an address for the chosen hours and records it', async () => {
    await render(IP);
    expect(component.actions()).toEqual(['ip_timeout']);
    component.askAction('ip_timeout');
    component.ipHours.set('0');
    component.confirmAction();
    expect(operations.addIPTimeout).not.toHaveBeenCalled();

    component.ipHours.set('48');
    component.confirmAction();
    expect(operations.addIPTimeout).toHaveBeenCalledWith({
      ipaddr: '10.0.0.9',
      hours: 48,
    });
    expect(moderation.recordSubjectDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'ip',
        ipaddr: '10.0.0.9',
        outcome: 'actioned',
        action: 'ip_timeout',
        action_detail: '48h',
      }),
    );
  });

  it('pauses the worker behind a report and records it on this subject', async () => {
    await render();
    (
      host().querySelector(
        '[data-event="14"] [data-event-toggle]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const pause = Array.from(
      host().querySelectorAll<HTMLButtonElement>(
        '.review-event-actions button',
      ),
    ).find((button) =>
      button.textContent?.includes('admin.review.reports.action.pause_worker'),
    );
    pause?.click();
    component.confirmAction();

    expect(workers.setPaused).toHaveBeenCalledWith('worker-7', true);
    expect(moderation.recordSubjectDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'account',
        action: 'pause_worker',
        action_detail: 'worker-7',
      }),
    );
  });

  it('keeps an action whose decision was not stored, to save again', async () => {
    moderation.recordSubjectDecision.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    await render();
    component.askAction('flag_account');
    component.confirmAction();
    fixture.detectChanges();

    expect(component.unrecorded()?.input.action).toBe('flag_account');
    expect(host().textContent).toContain('admin.review.reports.unrecorded');

    component.retryUnrecorded();
    expect(users.setFlagged).toHaveBeenCalledTimes(1);
    expect(moderation.recordSubjectDecision).toHaveBeenCalledTimes(2);
    expect(component.unrecorded()).toBeNull();
  });

  it('times out an IPv6 /64 network whole and says so', async () => {
    await render({ ...IP, ipaddr: '2001:db8:1:2::/64' });
    expect(host().querySelector('[data-ip-network]')).not.toBeNull();
    component.askAction('ip_timeout');
    component.ipHours.set('24');
    component.confirmAction();

    expect(operations.addIPTimeout).toHaveBeenCalledWith({
      ipaddr: '2001:db8:1:2::/64',
      hours: 24,
    });
    expect(moderation.recordSubjectDecision).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ip', ipaddr: '2001:db8:1:2::/64' }),
    );
  });

  it('says plainly when the horde refuses a decision', async () => {
    moderation.recordSubjectDecision.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { message: 'no events', rc: 'ModerationSubjectNotFound' },
          }),
      ),
    );
    await render();
    component.openDecision();
    component.confirmDecision();

    expect(toast.error).toHaveBeenCalledWith(
      'admin.review.refusal.subject_not_found',
      expect.anything(),
    );
    expect(component.decisionOpen()).toBe(true);
  });

  it('offers no account actions for a proxied account', async () => {
    await render({
      kind: 'proxied_account',
      user_id: 42,
      proxied_account: 'bot:1',
      ipaddr: null,
    });

    expect(component.actions()).toEqual([]);
  });

  describe('verdict', () => {
    it('draws one meter per configured rule from the detail', async () => {
      await render();
      const meters = Array.from(
        host().querySelectorAll<HTMLElement>('[data-meter]'),
      );

      expect(meters.map((meter) => meter.dataset['meter'])).toEqual([
        'over',
        'near',
        'under',
      ]);
      expect(meters[0]?.textContent).toContain(
        'admin.review.reports.meter.over',
      );
      expect(meters[1]?.textContent).toContain(
        'admin.review.reports.meter.under',
      );
      expect(component.meters().map((meter) => meter.gap)).toEqual([
        30, 30, 38,
      ]);
      expect(
        host().querySelector('[data-verdict]')?.getAttribute('data-over'),
      ).toBe('true');
    });

    it('names the rule furthest past its threshold in the head', async () => {
      await render();
      const line = host().querySelector('[data-rules-verdict]');
      expect(line?.getAttribute('data-rules-verdict')).toBe('over');
      expect(line?.textContent).toContain('admin.review.reports.verdict_over');
      expect(component.verdict()).toEqual(
        expect.objectContaining({ exceeded: 1, total: 3 }),
      );

      moderation.getSubjectDetail.mockReturnValue(
        of(
          detailOf({
            rules: detailOf().rules.map((rule) => ({
              ...rule,
              count: 1,
              exceeded: false,
            })),
          }),
        ),
      );
      component.reloadDetail();
      fixture.detectChanges();
      expect(
        host()
          .querySelector('[data-rules-verdict]')
          ?.getAttribute('data-rules-verdict'),
      ).toBe('under');
    });

    it('folds the rules with no reports into one line that opens', async () => {
      moderation.getSubjectDetail.mockReturnValue(
        of(
          detailOf({
            rules: [
              ...detailOf().rules.slice(0, 1),
              {
                window_seconds: 86400,
                reasons: ['model_rejection'],
                min_count: 20,
                count: 0,
                exceeded: false,
              },
            ],
          }),
        ),
      );
      await render();
      expect(host().querySelectorAll('[data-meter]').length).toBe(1);
      const quiet = host().querySelector(
        '[data-quiet-rules]',
      ) as HTMLButtonElement;
      expect(quiet.textContent).toContain(
        'admin.review.reports.meters_quiet_one',
      );

      quiet.click();
      fixture.detectChanges();
      expect(host().querySelectorAll('[data-meter]').length).toBe(2);
    });

    it('reads a running watch as watching until its date, with the watch threshold on the meters', async () => {
      const watch = stored({
        kind: 'account',
        user_id: 42,
        outcome: 'watching',
        watch_until: '2099-10-10T23:59:59+00:00',
        watch_min_count: 40,
        watermark_event_id: 10,
      });
      moderation.getSubjectDetail.mockReturnValue(
        of(
          detailOf({
            decisions: [watch],
            rules: [
              {
                window_seconds: 3600,
                reasons: ['worker_csam'],
                min_count: 40,
                count: 45,
                exceeded: true,
              },
              {
                window_seconds: 3600,
                reasons: ['filter_rejection'],
                min_count: 30,
                count: 2,
                exceeded: false,
              },
            ],
          }),
        ),
      );
      await render();

      expect(component.state()?.label).toBe('watching');
      expect(
        host().querySelector('[data-subject-state]')?.textContent,
      ).toContain('admin.review.reports.state_label.watching');
      const meters = host().querySelectorAll('[data-meter]');
      expect(meters[0]?.textContent).toContain(
        'admin.review.reports.meter_rule_watch',
      );
      expect(meters[1]?.textContent).not.toContain('meter_rule_watch');
    });

    it('states a finding only when one worker holds enough of the worker reports', async () => {
      await render();
      expect(component.finding()).toEqual(
        expect.objectContaining({ kind: 'worker', name: 'garage-3090' }),
      );
      expect(host().querySelector('[data-finding]')?.textContent).toContain(
        'garage-3090',
      );

      moderation.getSubjectDetail.mockReturnValue(
        of(
          detailOf({
            workers: {
              items: [{ worker_id: 'w', worker_name: 'w', count: 140 }],
              total: 2,
            },
            models: {
              items: [
                {
                  model: 'model a',
                  count: 100,
                  counts_by_reason: { worker_csam: 100 },
                },
              ],
              total: 3,
            },
          }),
        ),
      );
      component.reloadDetail();
      fixture.detectChanges();
      expect(component.finding()).toBeNull();
      expect(host().querySelector('[data-finding]')).toBeNull();

      const few = FINDING_MIN_REPORTS - 1;
      moderation.getSubjectDetail.mockReturnValue(
        of(
          detailOf({
            count: few,
            counts_by_reason: { worker_csam: few },
            workers: {
              items: [{ worker_id: 'w', worker_name: 'w', count: few }],
              total: 1,
            },
            models: { items: [], total: 0 },
          }),
        ),
      );
      component.reloadDetail();
      fixture.detectChanges();
      expect(component.finding()).toBeNull();
    });
  });

  describe('brushed range', () => {
    let rangeDetail: Subject<ModerationSubjectDetail>;

    beforeEach(() => {
      rangeDetail = new Subject();
      moderation.getSubjectDetail.mockImplementation((query) =>
        query.since ? rangeDetail : of(detailOf()),
      );
    });

    afterEach(() => vi.useRealTimers());

    const rangeCalls = () =>
      moderation.getSubjectDetail.mock.calls.filter(([query]) => query.since);

    it('reads nothing until a released range has settled, then reads it once', async () => {
      await render();
      vi.useFakeTimers();
      component.selectRange({ from: 0, to: 7 });
      vi.advanceTimersByTime(RANGE_SETTLE_MS - 1);
      expect(rangeCalls()).toHaveLength(0);

      vi.advanceTimersByTime(1);
      expect(rangeCalls()).toEqual([
        [
          {
            kind: 'account',
            user_id: 42,
            since: '2026-09-25T22:00:00+00:00',
            until: '2026-09-26T00:00:00+00:00',
          },
        ],
      ]);
    });

    it('settles only the last of several quick releases', async () => {
      await render();
      vi.useFakeTimers();
      component.selectRange({ from: 0, to: 3 });
      vi.advanceTimersByTime(RANGE_SETTLE_MS / 2);
      component.selectRange({ from: 0, to: 7 });
      vi.advanceTimersByTime(RANGE_SETTLE_MS);

      expect(rangeCalls()).toHaveLength(1);
      expect(rangeCalls()[0]?.[0].until).toBe('2026-09-26T00:00:00+00:00');
    });

    it('narrows the reports to the range with the one range read', async () => {
      await render();
      vi.useFakeTimers();
      component.selectRange({ from: 0, to: 7 });
      vi.advanceTimersByTime(RANGE_SETTLE_MS);
      fixture.detectChanges();
      expect(host().querySelector('[data-events] .hd-skeleton')).not.toBeNull();

      rangeDetail.next(detailOf({ count: 9, events: [event(3)] }));
      fixture.detectChanges();

      expect(moderation.getPromptEvents).not.toHaveBeenCalled();
      expect(component.ranged.detail()?.count).toBe(9);
      expect(host().querySelector('[data-in-range]')).not.toBeNull();
      const shown = Array.from(
        host().querySelectorAll('[data-range-events] [data-event]'),
      ).map((item) => item.getAttribute('data-event'));
      expect(shown).toEqual(['3']);
    });

    it('cancels the reading of a range a newer brush supersedes', async () => {
      await render();
      vi.useFakeTimers();
      component.selectRange({ from: 0, to: 7 });
      vi.advanceTimersByTime(RANGE_SETTLE_MS);
      expect(rangeDetail.observed).toBe(true);

      component.selectRange({ from: 8, to: 15 });
      expect(rangeDetail.observed).toBe(false);

      vi.advanceTimersByTime(RANGE_SETTLE_MS);
      expect(rangeCalls()).toHaveLength(2);
    });

    it('drops the range at once when the whole window is chosen', async () => {
      await render();
      vi.useFakeTimers();
      component.selectRange({ from: 0, to: 7 });
      vi.advanceTimersByTime(RANGE_SETTLE_MS);
      component.selectRange(null);

      expect(rangeDetail.observed).toBe(false);
      expect(component.ranged.settled()).toBeNull();
      expect(component.ranged.range()).toBeNull();
    });

    it('reads nothing while a range is dragged', async () => {
      await render();
      vi.useFakeTimers();
      const timeline = fixture.debugElement.query(
        By.directive(ReviewTimelineComponent),
      ).componentInstance as ReviewTimelineComponent;
      const chart = host().querySelector('[data-timeline]') as Element;
      chart.getBoundingClientRect = () => new DOMRect(0, 0, 960, 144);
      const pointer = (clientX: number) =>
        ({ button: 0, clientX, pointerId: 1 }) as PointerEvent;
      timeline.onChartPointerDown(pointer(5), chart);
      timeline.onChartPointerMove(pointer(85), chart);
      vi.advanceTimersByTime(RANGE_SETTLE_MS * 3);

      expect(timeline.dragRange()).toEqual({ from: 0, to: 8 });
      expect(rangeCalls()).toHaveLength(0);

      timeline.onChartPointerUp(pointer(85), chart);
      vi.advanceTimersByTime(RANGE_SETTLE_MS);
      expect(component.ranged.range()).toEqual({ from: 0, to: 8 });
      expect(rangeCalls()).toHaveLength(1);
    });
  });

  it('shows the first few of a long connected list, and the rest on request', async () => {
    moderation.getSubjectDetail.mockReturnValue(
      of(
        detailOf({
          workers: {
            items: Array.from({ length: PIVOT_LIMIT + 2 }, (_, index) => ({
              worker_id: `w${index}`,
              worker_name: `worker ${index}`,
              count: 1,
            })),
            total: PIVOT_LIMIT + 2,
          },
        }),
      ),
    );
    await render();
    const workerLinks = () =>
      host().querySelectorAll('[data-connected] [data-pivot-worker]');
    expect(workerLinks()).toHaveLength(PIVOT_LIMIT);

    (
      host().querySelector(
        '[data-connected] .review-pivot-toggle',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(workerLinks()).toHaveLength(PIVOT_LIMIT + 2);
  });

  it('says how long the rate limiter asked it to wait, then reads once more', async () => {
    let calls = 0;
    moderation.getSubjectDetail.mockImplementation(() =>
      defer(() =>
        calls++ === 0
          ? throwError(
              () =>
                new HttpErrorResponse({
                  status: 429,
                  headers: new HttpHeaders({ 'Retry-After': '12' }),
                }),
            )
          : of(detailOf()),
      ),
    );
    vi.useFakeTimers();
    try {
      await render();
      expect(component.limitWait()).toBe(12);
      expect(
        host().querySelector('[data-rate-limited]')?.textContent,
      ).toContain('admin.review.rate_limited_other');

      vi.advanceTimersByTime(12_000);
      fixture.detectChanges();
      expect(calls).toBe(2);
      expect(component.limitWait()).toBeNull();
      expect(component.detailState()).toBe('ready');
    } finally {
      vi.useRealTimers();
    }
  });

  describe('keyboard triage', () => {
    let steps: SubjectStep[];

    const press = (key: string, target: Element = host()): void => {
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );
    };

    beforeEach(async () => {
      await render();
      steps = [];
      component.step.subscribe((step) => steps.push(step));
      fixture.componentRef.setInput('hasPrevious', true);
      fixture.componentRef.setInput('hasNext', true);
      fixture.detectChanges();
    });

    it('steps with j and k and with the buttons', () => {
      press('j');
      press('k');
      (host().querySelector('[data-step-next]') as HTMLButtonElement).click();

      expect(steps).toEqual(['next', 'previous', 'next']);
    });

    it('leaves the letters to a field and to an open dialog', () => {
      const field = document.createElement('input');
      host().appendChild(field);
      press('j', field);
      component.openDecision();
      press('j');

      expect(steps).toEqual([]);
    });

    it('does not step past the ends of the list', () => {
      fixture.componentRef.setInput('hasNext', false);
      fixture.detectChanges();
      press('j');

      expect(steps).toEqual([]);
      expect(
        (host().querySelector('[data-step-next]') as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });
  });
});
