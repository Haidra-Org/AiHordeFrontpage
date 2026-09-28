import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  HttpErrorResponse,
  HttpParams,
  provideHttpClient,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { vi } from 'vitest';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AdminModerationService } from './admin-moderation.service';
import { AuthService } from './auth.service';
import { CacheTTL, HordeApiCacheService } from './horde-api-cache.service';
import { HordeStatusService } from './horde-status.service';
import { API_BASE } from '../testing/api-test-helpers';
import {
  ModerationOverview,
  ModerationSubjectsPage,
  PromptModerationEvent,
  PromptModerationEventsPage,
} from '../types/moderation';

const BASE = API_BASE;

const OVERVIEW: ModerationOverview = {
  promotion_blocked_users: [],
  promotion_eligible_users: [],
  paused_workers: [],
};

const PAGE: PromptModerationEventsPage = { events: [], next_cursor: null };

/** One log row as a horde without evidence holds sends it. */
const ROW: PromptModerationEvent = {
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

const SUBJECTS: ModerationSubjectsPage = {
  criteria: { rules: null },
  subjects: [],
  next_offset: null,
};

function paramsOf(call: unknown[]): HttpParams | undefined {
  return (call[1] as { params?: HttpParams }).params;
}

describe('AdminModerationService', () => {
  let svc: AdminModerationService;
  let http: HttpTestingController;
  let mockAuth: { getStoredApiKey: ReturnType<typeof vi.fn> };
  let mockCache: {
    cachedGet: ReturnType<typeof vi.fn>;
    invalidate: ReturnType<typeof vi.fn>;
  };
  /** The heartbeat, which answers only when a test says so. */
  let heartbeat: Subject<boolean>;
  let mockStatus: {
    reachable: WritableSignal<boolean>;
    checkReachable: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockAuth = { getStoredApiKey: vi.fn().mockReturnValue('mod-key') };
    mockCache = {
      cachedGet: vi.fn().mockReturnValue(of(OVERVIEW)),
      invalidate: vi.fn(),
    };
    heartbeat = new Subject<boolean>();
    mockStatus = {
      reachable: signal(false),
      checkReachable: vi.fn(() => heartbeat),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuth },
        { provide: HordeApiCacheService, useValue: mockCache },
        { provide: HordeStatusService, useValue: mockStatus },
      ],
    });

    svc = TestBed.inject(AdminModerationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('getOverview', () => {
    it('sends the moderator key and the limit, cached by category', () => {
      svc.getOverview({ limit: 250 }).subscribe();
      const call = mockCache.cachedGet.mock.calls[0];
      expect(call[0]).toBe(`${BASE}/operations/moderation`);
      expect(call[1]).toEqual(
        expect.objectContaining({ headers: { apikey: 'mod-key' } }),
      );
      expect(paramsOf(call)?.get('limit')).toBe('250');
      expect(call[2]).toEqual({
        ttl: CacheTTL.SHORT,
        category: 'admin-moderation',
      });
    });

    it('leaves the limit to the horde when none is given', () => {
      svc.getOverview().subscribe();
      expect(paramsOf(mockCache.cachedGet.mock.calls[0])?.keys()).toEqual([]);
    });

    it('sends the paused-worker filters, repeating each list', () => {
      svc
        .getOverview({
          limit: 500,
          worker_type: ['image', 'text'],
          suspicion_id: [3, 5],
          online: false,
          sort: 'last_check_in',
        })
        .subscribe();
      const params = paramsOf(mockCache.cachedGet.mock.calls[0]);
      expect(params?.getAll('worker_type')).toEqual(['image', 'text']);
      expect(params?.getAll('suspicion_id')).toEqual(['3', '5']);
      expect(params?.get('online')).toBe('false');
      expect(params?.get('sort')).toBe('last_check_in');
      expect(params?.get('limit')).toBe('500');
    });

    it('marks the endpoint available on an answer', () => {
      expect(svc.overviewAvailability()).toBe('unknown');
      svc.getOverview().subscribe();
      expect(svc.overviewAvailability()).toBe('available');
    });

    it('marks the endpoint absent on a bare 404', () => {
      mockCache.cachedGet.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 404,
              error: { message: 'The requested URL was not found.' },
            }),
        ),
      );
      svc.getOverview().subscribe({ error: () => undefined });
      expect(svc.overviewAvailability()).toBe('absent');
    });

    it('keeps the endpoint available when the route refuses', () => {
      mockCache.cachedGet.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 403,
              error: { message: 'Access Denied', rc: 'NotModerator' },
            }),
        ),
      );
      svc.getOverview().subscribe({ error: () => undefined });
      expect(svc.overviewAvailability()).toBe('available');
    });

    it('learns nothing from a failure that never reached the horde', () => {
      mockCache.cachedGet.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 0, error: null })),
      );
      svc.getOverview().subscribe({ error: () => undefined });
      expect(svc.overviewAvailability()).toBe('unknown');
    });
  });

  describe('getPromptEvents', () => {
    beforeEach(() => mockCache.cachedGet.mockReturnValue(of(PAGE)));

    it('sends every filter and the cursor, and never caches', () => {
      svc
        .getPromptEvents({
          limit: 25,
          before_id: 900,
          user_id: 12,
          proxied_account: 'discord:5',
          ipaddr: '10.0.0.1',
          reason: ['filter_rejection', 'model_rejection'],
          since: '2026-09-01T00:00:00+00:00',
          until: '2026-09-02T00:00:00+00:00',
        })
        .subscribe();
      const call = mockCache.cachedGet.mock.calls[0];
      expect(call[0]).toBe(`${BASE}/operations/moderation/prompts`);
      expect(call[2]).toEqual({ ttl: CacheTTL.NEVER });
      const params = paramsOf(call);
      expect(params?.get('limit')).toBe('25');
      expect(params?.get('before_id')).toBe('900');
      expect(params?.get('user_id')).toBe('12');
      expect(params?.get('proxied_account')).toBe('discord:5');
      expect(params?.get('ipaddr')).toBe('10.0.0.1');
      expect(params?.getAll('reason')).toEqual([
        'filter_rejection',
        'model_rejection',
      ]);
      expect(params?.get('since')).toBe('2026-09-01T00:00:00+00:00');
      expect(params?.get('until')).toBe('2026-09-02T00:00:00+00:00');
    });

    it('leaves unset filters off the query', () => {
      svc.getPromptEvents({ user_id: 3 }).subscribe();
      expect(paramsOf(mockCache.cachedGet.mock.calls[0])?.keys()).toEqual([
        'user_id',
      ]);
    });

    it('marks the log absent on a bare 404', () => {
      mockCache.cachedGet.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 404, error: null })),
      );
      svc.getPromptEvents().subscribe({ error: () => undefined });
      expect(svc.promptEventsAvailability()).toBe('absent');
    });
  });

  describe('addPromptNote', () => {
    it('posts the note with the key', () => {
      let result: unknown;
      svc.addPromptNote(42, 'blurry photo').subscribe((r) => (result = r));

      const req = http.expectOne(
        `${BASE}/operations/moderation/prompts/42/notes`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('apikey')).toBe('mod-key');
      expect(req.request.body).toEqual({ note: 'blurry photo' });
      const note = {
        id: 1,
        author_id: 9,
        note: 'blurry photo',
        created: '2026-09-26T10:00:00+00:00',
      };
      req.flush(note, { status: 201, statusText: 'Created' });

      expect(result).toEqual(note);
      expect(svc.promptEventsAvailability()).toBe('available');
    });

    it('returns null without a key and sends nothing', () => {
      mockAuth.getStoredApiKey.mockReturnValue('');
      let result: unknown = 'unset';
      svc.addPromptNote(1, 'x').subscribe((r) => (result = r));
      expect(result).toBeNull();
    });
  });

  describe('prompt hold', () => {
    const NOTE = {
      id: 9,
      author_id: 7,
      note: 'case review',
      created: '2026-09-26T10:00:00+00:00',
    };
    const HOLD_URL = `${BASE}/operations/moderation/prompts/42/hold`;

    it('sets and releases a hold with the moderator key', () => {
      svc.holdPromptEvent(42, 30, 'case review').subscribe();
      const hold = http.expectOne(HOLD_URL);
      expect(hold.request.method).toBe('POST');
      expect(hold.request.headers.get('apikey')).toBe('mod-key');
      expect(hold.request.body).toEqual({
        duration_days: 30,
        note: 'case review',
      });
      hold.flush({ held_until: '2026-10-26T10:00:00+00:00', note: NOTE });

      svc.releasePromptHold(42).subscribe();
      const release = http.expectOne(HOLD_URL);
      expect(release.request.method).toBe('DELETE');
      expect(release.request.headers.get('apikey')).toBe('mod-key');
      expect(release.request.body).toBeNull();
      release.flush({ held_until: null, note: NOTE });
    });

    it('sends a release note as the body only when one is given', () => {
      svc.releasePromptHold(42, 'case closed').subscribe();
      const release = http.expectOne(HOLD_URL);
      expect(release.request.method).toBe('DELETE');
      expect(release.request.body).toEqual({ note: 'case closed' });
      release.flush({ held_until: null, note: NOTE });
    });

    it('leaves the prompt log available when a hold write is refused or unreached', () => {
      mockCache.cachedGet.mockReturnValue(of(PAGE));
      svc.getPromptEvents().subscribe();
      expect(svc.promptEventsAvailability()).toBe('available');

      svc.holdPromptEvent(42, 30, 'case review').subscribe({
        error: () => undefined,
      });
      http
        .expectOne(HOLD_URL)
        .flush(null, { status: 404, statusText: 'Not Found' });
      svc.releasePromptHold(42).subscribe({ error: () => undefined });
      http.expectOne(HOLD_URL).error(new ProgressEvent('error'));

      expect(svc.promptEventsAvailability()).toBe('available');
      svc.getPromptEvents().subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledTimes(2);
    });

    it('leaves an unread prompt log unknown after a hold write', () => {
      svc.holdPromptEvent(42, 30, 'case review').subscribe({
        error: () => undefined,
      });
      http
        .expectOne(HOLD_URL)
        .flush(null, { status: 404, statusText: 'Not Found' });
      expect(svc.promptEventsAvailability()).toBe('unknown');
    });
  });

  describe('getSubjects', () => {
    beforeEach(() => mockCache.cachedGet.mockReturnValue(of(SUBJECTS)));

    it('repeats each reason and sends the criteria, cached by category', () => {
      svc
        .getSubjects({
          kind: 'ip',
          window: 3600,
          min_count: 5,
          reason: ['worker_csam', 'model_rejection'],
          since_review: false,
          limit: 50,
          offset: 50,
        })
        .subscribe();
      const call = mockCache.cachedGet.mock.calls[0];
      expect(call[0]).toBe(`${BASE}/operations/moderation/subjects`);
      expect(call[2]).toEqual({
        ttl: CacheTTL.SHORT,
        category: 'admin-moderation',
      });
      const params = paramsOf(call);
      expect(params?.get('kind')).toBe('ip');
      expect(params?.get('window')).toBe('3600');
      expect(params?.get('min_count')).toBe('5');
      expect(params?.getAll('reason')).toEqual([
        'worker_csam',
        'model_rejection',
      ]);
      expect(params?.get('since_review')).toBe('false');
      expect(params?.get('offset')).toBe('50');
      expect(svc.subjectsAvailability()).toBe('available');
    });

    it('sends no window or count for the alert view', () => {
      svc.getSubjects({ kind: 'account', since_review: true }).subscribe();
      expect(paramsOf(mockCache.cachedGet.mock.calls[0])?.keys()).toEqual([
        'kind',
        'since_review',
      ]);
    });

    it('marks the listings absent on a bare 404', () => {
      mockCache.cachedGet.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 404, error: null })),
      );
      svc
        .getSubjects({ kind: 'account' })
        .subscribe({ error: () => undefined });
      expect(svc.subjectsAvailability()).toBe('absent');
    });

    it('learns nothing from a refused preflight', () => {
      mockCache.cachedGet.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 0, error: null })),
      );
      svc
        .getSubjects({ kind: 'account' })
        .subscribe({ error: () => undefined });
      expect(svc.subjectsAvailability()).toBe('unknown');
    });
  });

  describe('the watching and escalated lists', () => {
    beforeEach(() => mockCache.cachedGet.mockReturnValue(of({ subjects: [] })));

    it('reads each state through the subject endpoint', () => {
      svc.getSubjects({ state: 'watching', limit: 50 }).subscribe();
      svc.getSubjects({ state: 'escalated', limit: 50 }).subscribe();
      expect(mockCache.cachedGet.mock.calls.map((call) => call[0])).toEqual([
        `${BASE}/operations/moderation/subjects`,
        `${BASE}/operations/moderation/subjects`,
      ]);
      expect(svc.subjectsAvailability()).toBe('available');
    });
  });

  describe('getSubjectDecisions', () => {
    it('sends the identity and cursor and never caches', () => {
      mockCache.cachedGet.mockReturnValue(
        of({ decisions: [], next_cursor: null }),
      );
      svc
        .getSubjectDecisions({
          kind: 'proxied_account',
          user_id: 4,
          proxied_account: 'bot:1',
          before_id: 30,
          limit: 10,
        })
        .subscribe();
      const call = mockCache.cachedGet.mock.calls[0];
      expect(call[0]).toBe(`${BASE}/operations/moderation/subjects/decisions`);
      expect(call[2]).toEqual({ ttl: CacheTTL.NEVER });
      const params = paramsOf(call);
      expect(params?.get('kind')).toBe('proxied_account');
      expect(params?.get('user_id')).toBe('4');
      expect(params?.get('proxied_account')).toBe('bot:1');
      expect(params?.get('before_id')).toBe('30');
    });
  });

  describe('getSubjectDetail', () => {
    it('sends the identity and range and never caches, so a superseded read can be cancelled', () => {
      mockCache.cachedGet.mockReturnValue(of({}));
      svc
        .getSubjectDetail({
          kind: 'ip',
          ipaddr: '2001:db8:1:2::/64',
          since: '2026-09-26T02:00:00+00:00',
          until: '2026-09-26T04:00:00+00:00',
        })
        .subscribe();
      const call = mockCache.cachedGet.mock.calls[0];
      expect(call[0]).toBe(`${BASE}/operations/moderation/subjects/detail`);
      expect(call[2]).toEqual({ ttl: CacheTTL.NEVER });
      const params = paramsOf(call);
      expect(params?.get('kind')).toBe('ip');
      expect(params?.get('ipaddr')).toBe('2001:db8:1:2::/64');
      expect(params?.get('since')).toBe('2026-09-26T02:00:00+00:00');
      expect(params?.get('until')).toBe('2026-09-26T04:00:00+00:00');
      expect(params?.has('window')).toBe(false);
    });
  });

  describe('detail memo', () => {
    const query = { kind: 'account' as const, user_id: 7 };

    it('reuses a detail answer, and reads again after a decision on the subject', () => {
      mockCache.cachedGet.mockReturnValue(of({ count: 1 }));
      svc.getSubjectDetail(query).subscribe();
      svc.getSubjectDetail(query).subscribe();
      svc.getSubjectDetail({ ...query, since: 'x', until: 'y' }).subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledTimes(2);

      svc.forgetDetails('account:8');
      svc.getSubjectDetail(query).subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledTimes(2);

      svc
        .recordSubjectDecision({
          kind: 'account',
          user_id: 7,
          outcome: 'benign',
        })
        .subscribe();
      http
        .expectOne(`${BASE}/operations/moderation/subjects/decisions`)
        .flush({ id: 5 });
      svc.getSubjectDetail(query).subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledTimes(3);
    });

    it('drops a paused worker, and every detail when a note is added', () => {
      mockCache.cachedGet.mockReturnValue(of({ count: 1 }));
      svc.getWorkerDetail({ worker_id: 'w' }).subscribe();
      svc
        .recordSubjectDecision({
          kind: 'account',
          user_id: 7,
          outcome: 'actioned',
          action: 'pause_worker',
          action_detail: 'w',
        })
        .subscribe();
      http
        .expectOne(`${BASE}/operations/moderation/subjects/decisions`)
        .flush({ id: 6 });
      svc.getWorkerDetail({ worker_id: 'w' }).subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledTimes(2);

      svc.addPromptNote(3, 'ordinary').subscribe();
      http
        .expectOne(`${BASE}/operations/moderation/prompts/3/notes`)
        .flush({ id: 1 });
      svc.getWorkerDetail({ worker_id: 'w' }).subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledTimes(3);
    });
  });

  describe('getReportingWorkers', () => {
    it('sends the window, order and paging to the ranking', () => {
      mockCache.cachedGet.mockReturnValue(of({}));
      svc
        .getReportingWorkers({
          window: 604800,
          sort: 'cleared',
          limit: 50,
          offset: 50,
        })
        .subscribe();
      const call = mockCache.cachedGet.mock.calls[0];
      expect(call[0]).toBe(`${BASE}/operations/moderation/workers`);
      const params = paramsOf(call);
      expect(params?.get('window')).toBe('604800');
      expect(params?.get('sort')).toBe('cleared');
      expect(params?.get('offset')).toBe('50');
    });
  });

  describe('getWorkerDetail', () => {
    it('sends the worker and range and never caches', () => {
      mockCache.cachedGet.mockReturnValue(of({}));
      svc
        .getWorkerDetail({
          worker_id: 'w-1',
          since: '2026-09-26T02:00:00+00:00',
          until: '2026-09-26T04:00:00+00:00',
        })
        .subscribe();
      const call = mockCache.cachedGet.mock.calls[0];
      expect(call[0]).toBe(`${BASE}/operations/moderation/workers/detail`);
      expect(call[2]).toEqual({ ttl: CacheTTL.NEVER });
      expect(paramsOf(call)?.get('worker_id')).toBe('w-1');
    });
  });

  describe('recordSubjectDecision', () => {
    it('posts the decision and drops the cached listings', () => {
      let result: unknown;
      svc
        .recordSubjectDecision({
          kind: 'account',
          user_id: 12,
          outcome: 'benign',
          note: 'blurry photos',
          watermark_event_id: 80,
        })
        .subscribe((r) => (result = r));

      const req = http.expectOne(
        `${BASE}/operations/moderation/subjects/decisions`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('apikey')).toBe('mod-key');
      expect(req.request.body).toEqual({
        kind: 'account',
        user_id: 12,
        outcome: 'benign',
        note: 'blurry photos',
        watermark_event_id: 80,
      });
      req.flush({ id: 5 }, { status: 201, statusText: 'Created' });

      expect(result).toEqual({ id: 5 });
      expect(mockCache.invalidate).toHaveBeenCalledWith({
        category: 'admin-moderation',
      });
    });

    it('passes a refused decision to the caller and keeps the listings', () => {
      let failed = false;
      svc
        .recordSubjectDecision({
          kind: 'ip',
          ipaddr: '1.2.3.4',
          outcome: 'benign',
        })
        .subscribe({ error: () => (failed = true) });
      http
        .expectOne(`${BASE}/operations/moderation/subjects/decisions`)
        .flush(
          { message: 'no events', rc: 'ModerationSubjectNotFound' },
          { status: 404, statusText: 'Not Found' },
        );
      expect(failed).toBe(true);
      expect(svc.subjectsAvailability()).toBe('available');
      expect(mockCache.invalidate).not.toHaveBeenCalled();
    });

    it('returns null without a key and sends nothing', () => {
      mockAuth.getStoredApiKey.mockReturnValue('');
      let result: unknown = 'unset';
      svc
        .recordSubjectDecision({
          kind: 'account',
          user_id: 1,
          outcome: 'benign',
        })
        .subscribe((r) => (result = r));
      expect(result).toBeNull();
    });
  });

  describe('getFalsePositives', () => {
    it('sends the window', () => {
      mockCache.cachedGet.mockReturnValue(
        of({
          since: '2026-09-01T00:00:00Z',
          until: '2026-09-27T00:00:00Z',
          models: [],
          total: 0,
          next_offset: null,
        }),
      );
      svc.getFalsePositives(604800).subscribe();
      const call = mockCache.cachedGet.mock.calls[0];
      expect(call[0]).toBe(`${BASE}/operations/moderation/models`);
      expect(paramsOf(call)?.get('window')).toBe('604800');
      expect(svc.falsePositivesAvailability()).toBe('available');
    });
  });

  describe('settings', () => {
    const SETTINGS = {
      rules: [
        {
          window_seconds: 3600,
          min_count: 50,
          reasons: ['worker_csam' as const],
        },
      ],
    };

    it('reads the settings, cached by category', () => {
      mockCache.cachedGet.mockReturnValue(of(SETTINGS));
      svc.getSettings().subscribe();
      const call = mockCache.cachedGet.mock.calls[0];
      expect(call[0]).toBe(`${BASE}/operations/moderation/settings`);
      expect(call[2]).toEqual({
        ttl: CacheTTL.SHORT,
        category: 'admin-moderation',
      });
      expect(svc.settingsAvailability()).toBe('available');
    });

    it('puts the settings and drops the cached listings', () => {
      svc.updateSettings(SETTINGS).subscribe();
      const req = http.expectOne(`${BASE}/operations/moderation/settings`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(SETTINGS);
      req.flush(SETTINGS);
      expect(mockCache.invalidate).toHaveBeenCalledWith({
        category: 'admin-moderation',
      });
    });
  });

  describe('getWorkerSuspicionEvents', () => {
    beforeEach(() => mockCache.cachedGet.mockReturnValue(of(PAGE)));

    it('sends the filters and cursor, cached by category', () => {
      svc
        .getWorkerSuspicionEvents({
          limit: 200,
          before_id: 55,
          worker_id: '00000000-0000-0000-0000-000000000001',
          user_id: 9,
        })
        .subscribe();
      const call = mockCache.cachedGet.mock.calls[0];
      expect(call[0]).toBe(
        `${BASE}/operations/moderation/worker_suspicion_events`,
      );
      expect(call[1]).toEqual(
        expect.objectContaining({ headers: { apikey: 'mod-key' } }),
      );
      expect(call[2]).toEqual({
        ttl: CacheTTL.SHORT,
        category: 'admin-moderation',
      });
      const params = paramsOf(call);
      expect(params?.get('limit')).toBe('200');
      expect(params?.get('before_id')).toBe('55');
      expect(params?.get('worker_id')).toBe(
        '00000000-0000-0000-0000-000000000001',
      );
      expect(params?.get('user_id')).toBe('9');
      expect(svc.workerSuspicionEventsAvailability()).toBe('available');
    });

    it('marks the log absent on a bare 404', () => {
      mockCache.cachedGet.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 404, error: null })),
      );
      svc.getWorkerSuspicionEvents().subscribe({ error: () => undefined });
      expect(svc.workerSuspicionEventsAvailability()).toBe('absent');
    });
  });

  describe('availability across endpoints', () => {
    /** A failure these tests read from the signals, not the subscriber. */
    const ignore = (): void => undefined;
    const unreached = () =>
      throwError(() => new HttpErrorResponse({ status: 0, error: null }));

    /** The heartbeat answers, as it does on any horde the browser reaches. */
    const answerHeartbeat = (): void => {
      mockStatus.reachable.set(true);
      heartbeat.next(true);
      heartbeat.complete();
    };

    it('marks an endpoint absent on a status 0 once the heartbeat has answered, and asks it no more', () => {
      mockStatus.reachable.set(true);
      mockCache.cachedGet.mockReturnValue(unreached());
      svc.getSubjects({ kind: 'account' }).subscribe({ error: ignore });
      expect(svc.subjectsAvailability()).toBe('absent');
      expect(mockStatus.checkReachable).not.toHaveBeenCalled();

      // The cache's request is lazy; what matters is that nothing
      // subscribes to it, so nothing reaches the network.
      let sent = 0;
      mockCache.cachedGet.mockReturnValue(
        new Observable<never>(() => {
          sent++;
        }),
      );
      let refusal: unknown;
      svc
        .getSubjects({ kind: 'ip' })
        .subscribe({ error: (error: unknown) => (refusal = error) });
      expect(sent).toBe(0);
      expect(refusal).toBeInstanceOf(HttpErrorResponse);
      expect((refusal as HttpErrorResponse).status).toBe(404);
    });

    it('marks the overview absent on a status 0 from a reachable horde, and asks it no more', () => {
      mockStatus.reachable.set(true);
      mockCache.cachedGet.mockReturnValue(unreached());
      svc.getOverview().subscribe({ error: ignore });
      expect(svc.overviewAvailability()).toBe('absent');

      let sent = 0;
      mockCache.cachedGet.mockReturnValue(
        new Observable<never>(() => {
          sent++;
        }),
      );
      svc.getOverview().subscribe({ error: ignore });
      expect(sent).toBe(0);
    });

    it('holds a status 0 until the heartbeat answers, then marks it absent', () => {
      mockCache.cachedGet.mockReturnValue(unreached());
      svc.getSettings().subscribe({ error: ignore });
      svc.getOverview().subscribe({ error: ignore });
      expect(svc.settingsAvailability()).toBe('unknown');
      expect(svc.overviewAvailability()).toBe('unknown');
      expect(mockStatus.checkReachable).toHaveBeenCalledTimes(1);

      answerHeartbeat();
      expect(svc.settingsAvailability()).toBe('absent');
      expect(svc.overviewAvailability()).toBe('absent');
    });

    it('leaves held endpoints unknown when the heartbeat fails too, and reads both again next time', () => {
      mockCache.cachedGet.mockReturnValue(unreached());
      svc.getSettings().subscribe({ error: ignore });
      heartbeat.next(false);
      heartbeat.complete();
      expect(svc.settingsAvailability()).toBe('unknown');

      heartbeat = new Subject<boolean>();
      mockCache.cachedGet.mockClear();
      svc.getSettings().subscribe({ error: ignore });
      expect(mockCache.cachedGet).toHaveBeenCalledTimes(1);
      expect(mockStatus.checkReachable).toHaveBeenCalledTimes(2);
      expect(svc.settingsAvailability()).toBe('unknown');

      answerHeartbeat();
      expect(svc.settingsAvailability()).toBe('absent');
    });

    it('keeps an endpoint that answers while the heartbeat is still out', () => {
      mockCache.cachedGet.mockReturnValue(unreached());
      svc.getSettings().subscribe({ error: ignore });
      mockCache.cachedGet.mockReturnValue(of({ rules: [] }));
      svc.getSettings().subscribe();

      answerHeartbeat();
      expect(svc.settingsAvailability()).toBe('available');
    });

    it('keeps an endpoint that has answered when a later read never reaches the horde', () => {
      mockStatus.reachable.set(true);
      mockCache.cachedGet.mockReturnValue(of(PAGE));
      svc.getPromptEvents().subscribe();
      mockCache.cachedGet.mockReturnValue(unreached());
      svc.getPromptEvents().subscribe({ error: ignore });
      expect(svc.promptEventsAvailability()).toBe('available');
    });
  });

  describe('probe', () => {
    it('asks the prompt log for one event, once, sharing a probe in flight', () => {
      const answer = new Subject<PromptModerationEventsPage>();
      mockCache.cachedGet.mockReturnValue(answer);
      svc.probe('promptEvents').subscribe();
      svc.probe('promptEvents').subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledTimes(1);
      expect(paramsOf(mockCache.cachedGet.mock.calls[0])?.get('limit')).toBe(
        '1',
      );

      answer.next(PAGE);
      answer.complete();
      expect(svc.promptEventsAvailability()).toBe('available');
      svc.probe('promptEvents').subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledTimes(1);
    });

    it('runs a probe to its answer when its first caller leaves, and shares it with the next', () => {
      let sent = 0;
      const answer = new Subject<PromptModerationEventsPage>();
      mockCache.cachedGet.mockReturnValue(
        new Observable<PromptModerationEventsPage>((subscriber) => {
          sent++;
          const inner = answer.subscribe(subscriber);
          return () => inner.unsubscribe();
        }),
      );
      svc.probe('promptEvents').subscribe().unsubscribe();
      let done = false;
      svc.probe('promptEvents').subscribe({ complete: () => (done = true) });
      expect(sent).toBe(1);

      answer.next(PAGE);
      answer.complete();
      expect(done).toBe(true);
      expect(svc.promptEventsAvailability()).toBe('available');
    });

    it('reads the reason filter from the shape of the probe row', () => {
      expect(svc.promptReasonFilter()).toBeUndefined();
      mockCache.cachedGet.mockReturnValue(
        of({ events: [{ ...ROW, held_until: null }], next_cursor: null }),
      );
      svc.probe('promptEvents').subscribe();
      expect(svc.promptReasonFilter()).toBe(true);

      svc.probe('promptEvents').subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledTimes(1);
    });

    it('finds no reason filter in a row without hold state, or in no rows', () => {
      mockCache.cachedGet.mockReturnValue(
        of({ events: [ROW], next_cursor: null }),
      );
      svc.probe('promptEvents').subscribe();
      expect(svc.promptReasonFilter()).toBe(false);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: AuthService, useValue: mockAuth },
          { provide: HordeApiCacheService, useValue: mockCache },
          { provide: HordeStatusService, useValue: mockStatus },
        ],
      });
      svc = TestBed.inject(AdminModerationService);
      http = TestBed.inject(HttpTestingController);
      mockCache.cachedGet.mockReturnValue(of(PAGE));
      svc.probe('promptEvents').subscribe();
      expect(svc.promptReasonFilter()).toBe(false);
      expect(svc.promptEventsAvailability()).toBe('available');
    });

    it('probes a log that answered elsewhere once, to learn its row shape', () => {
      mockCache.cachedGet.mockReturnValue(of(PAGE));
      svc.getPromptEvents({ user_id: 42 }).subscribe();
      expect(svc.promptEventsAvailability()).toBe('available');
      expect(svc.promptReasonFilter()).toBeUndefined();

      svc.probe('promptEvents').subscribe();
      svc.probe('promptEvents').subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledTimes(2);
      expect(svc.promptReasonFilter()).toBe(false);
    });

    it('probes again after a probe that could not tell', () => {
      mockCache.cachedGet.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 0, error: null })),
      );
      svc.probe('promptEvents').subscribe();
      svc.probe('promptEvents').subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledTimes(2);
      expect(svc.promptEventsAvailability()).toBe('unknown');
    });

    it('asks each parked view with its cheapest read and swallows the failure', () => {
      mockCache.cachedGet.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 404, error: null })),
      );
      let completed = 0;
      for (const endpoint of [
        'reportingWorkers',
        'falsePositives',
        'settings',
      ] as const) {
        svc.probe(endpoint).subscribe({ complete: () => completed++ });
      }
      expect(completed).toBe(3);
      expect(
        mockCache.cachedGet.mock.calls.map((call) => String(call[0])),
      ).toEqual([
        `${BASE}/operations/moderation/workers`,
        `${BASE}/operations/moderation/models`,
        `${BASE}/operations/moderation/settings`,
      ]);
      expect(svc.reportingWorkersAvailability()).toBe('absent');
      expect(svc.falsePositivesAvailability()).toBe('absent');
      expect(svc.settingsAvailability()).toBe('absent');
    });
  });
});

describe('AdminModerationService with the real cache', () => {
  let http: HttpTestingController;
  let key = 'mod-a';

  beforeEach(() => {
    key = 'mod-a';
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getStoredApiKey: () => key } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('never serves one account the overview another account read', () => {
    const svc = TestBed.inject(AdminModerationService);
    svc.getOverview().subscribe();
    http.expectOne(`${BASE}/operations/moderation`).flush(OVERVIEW);

    key = 'mod-b';
    svc.getOverview().subscribe();
    const second = http.expectOne(`${BASE}/operations/moderation`);
    expect(second.request.headers.get('apikey')).toBe('mod-b');
    second.flush(OVERVIEW);
  });

  it('asks the horde again for the prompt log every time', () => {
    const svc = TestBed.inject(AdminModerationService);
    let answers = 0;
    svc.getPromptEvents().subscribe(() => answers++);
    http.expectOne(`${BASE}/operations/moderation/prompts`).flush(PAGE);
    svc.getPromptEvents().subscribe(() => answers++);
    http.expectOne(`${BASE}/operations/moderation/prompts`).flush(PAGE);
    expect(answers).toBe(2);
  });
});
