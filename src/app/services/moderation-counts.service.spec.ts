import { PLATFORM_ID, WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, defer, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import {
  MODERATION_POLL_MS,
  ModerationCountsService,
  OVERVIEW_LIMIT,
  SUBJECT_COUNT_LIMIT,
} from './moderation-counts.service';
import { AdminModerationService } from './admin-moderation.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import {
  EndpointAvailability,
  ModerationOverview,
  ModerationSubjectKind,
  ModerationSubjectQuery,
  ModerationSubjectsPage,
} from '../types/moderation';

function overview(
  eligible: number,
  blocked: number,
  paused: number,
): ModerationOverview {
  const many = (n: number): never[] => Array.from({ length: n });
  return {
    promotion_eligible_users: many(eligible),
    promotion_blocked_users: many(blocked),
    paused_workers: many(paused),
  };
}

function subjects(n: number): ModerationSubjectsPage {
  return {
    criteria: { rules: null },
    subjects: Array.from({ length: n }),
    next_offset: null,
  };
}

function list(n: number): ModerationSubjectsPage {
  return subjects(n);
}

/**
 * A stand-in for AdminModerationService whose availability signals move the
 * way the real service moves them: an answer marks the endpoint available, a
 * failure that never reached the horde (status 0) leaves it as it was.
 */
function makeModeration() {
  const overviewAvailability: WritableSignal<EndpointAvailability> =
    signal('unknown');
  const subjectsAvailability: WritableSignal<EndpointAvailability> =
    signal('unknown');
  const promptEventsAvailability: WritableSignal<EndpointAvailability> =
    signal('unknown');
  const track =
    <T>(target: WritableSignal<EndpointAvailability>) =>
    (source: Observable<T>): Observable<T> =>
      new Observable<T>((subscriber) =>
        source.subscribe({
          next: (value) => {
            target.set('available');
            subscriber.next(value);
          },
          error: (error: unknown) => {
            if (error instanceof HttpErrorResponse && error.status > 0) {
              target.set('available');
            }
            subscriber.error(error);
          },
          complete: () => subscriber.complete(),
        }),
      );
  const perKind: Record<ModerationSubjectKind, number> = {
    account: 3,
    proxied_account: 1,
    ip: 2,
  };
  const answers = {
    overview: (): Observable<ModerationOverview> => of(overview(2, 1, 3)),
    subjects: (
      query: ModerationSubjectQuery,
    ): Observable<ModerationSubjectsPage> =>
      of(subjects(perKind[query.kind ?? 'account'])),
    escalated: (): Observable<ModerationSubjectsPage> => of(list(4)),
  };
  const escalatedRequest = vi.fn(() =>
    answers.escalated().pipe(track(subjectsAvailability)),
  );
  return {
    answers,
    overviewAvailability,
    subjectsAvailability,
    promptEventsAvailability,
    probe: vi.fn((): Observable<void> => {
      promptEventsAvailability.set('available');
      return of(undefined);
    }),
    getOverview: vi.fn(() =>
      answers.overview().pipe(track(overviewAvailability)),
    ),
    getSubjects: vi.fn((query: ModerationSubjectQuery) =>
      query.state === 'escalated'
        ? escalatedRequest()
        : answers.subjects(query).pipe(track(subjectsAvailability)),
    ),
    escalatedRequest,
    invalidate: vi.fn(),
  };
}

describe('ModerationCountsService', () => {
  let moderation: ReturnType<typeof makeModeration>;
  let currentUser: WritableSignal<{ moderator: boolean } | null>;
  let toast: { error: ReturnType<typeof vi.fn> };
  let visibility: DocumentVisibilityState;

  const setup = (platform = 'browser'): ModerationCountsService => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: AdminModerationService, useValue: moderation },
        { provide: AuthService, useValue: { currentUser } },
        { provide: ToastService, useValue: toast },
      ],
    });
    const service = TestBed.inject(ModerationCountsService);
    TestBed.tick();
    return service;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    moderation = makeModeration();
    currentUser = signal({ moderator: true });
    toast = { error: vi.fn() };
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    delete (document as { visibilityState?: unknown }).visibilityState;
  });

  it('counts each kind over the default criteria, and the escalated, never single reports', () => {
    const counts = setup();

    expect(moderation.getSubjects.mock.calls.map(([query]) => query)).toEqual([
      { kind: 'account', limit: SUBJECT_COUNT_LIMIT },
      { kind: 'proxied_account', limit: SUBJECT_COUNT_LIMIT },
      { kind: 'ip', limit: SUBJECT_COUNT_LIMIT },
      { state: 'escalated', limit: SUBJECT_COUNT_LIMIT },
    ]);
    expect(moderation.escalatedRequest).toHaveBeenCalledTimes(1);
    expect(counts.subjects()).toEqual({
      account: { count: 3, atLeast: false },
      proxied_account: { count: 1, atLeast: false },
      ip: { count: 2, atLeast: false },
    });
    expect(counts.escalated()).toEqual({ count: 4, atLeast: false });
    expect(counts.reportsTotal()).toEqual({ count: 10, atLeast: false });
  });

  it('adds the overview queues into the total', () => {
    const counts = setup();

    expect(counts.eligible()).toEqual({ count: 2, atLeast: false });
    expect(counts.blocked()).toEqual({ count: 1, atLeast: false });
    expect(counts.paused()).toEqual({ count: 3, atLeast: false });
    expect(counts.total()).toEqual({ count: 16, atLeast: false });
    expect(counts.anyAvailable()).toBe(true);
  });

  it('counts paused workers from the total the horde states, past its cap', () => {
    moderation.answers.overview = () =>
      of({ ...overview(0, 0, OVERVIEW_LIMIT), paused_workers_total: 1840 });
    const counts = setup();

    expect(counts.paused()).toEqual({ count: 1840, atLeast: false });
  });

  it('carries a full page into the total as a floor', () => {
    moderation.answers.subjects = () => of(subjects(SUBJECT_COUNT_LIMIT));
    moderation.answers.overview = () => of(overview(OVERVIEW_LIMIT, 0, 0));
    const counts = setup();

    expect(counts.subjects()?.account).toEqual({ count: 100, atLeast: true });
    expect(counts.reportsTotal()?.atLeast).toBe(true);
    expect(counts.total()).toEqual({ count: 404, atLeast: true });
  });

  it('asks nothing for an account that is not a moderator', () => {
    currentUser.set({ moderator: false });
    const counts = setup();

    expect(moderation.getOverview).not.toHaveBeenCalled();
    expect(moderation.getSubjects).not.toHaveBeenCalled();
    expect(counts.total()).toBeNull();
  });

  it('never polls while rendering on the server', () => {
    setup('server');
    vi.advanceTimersByTime(MODERATION_POLL_MS * 2);

    expect(moderation.getOverview).not.toHaveBeenCalled();
    expect(moderation.getSubjects).not.toHaveBeenCalled();
  });

  it('polls on its interval and skips its turn while the page is hidden', () => {
    setup();
    expect(moderation.escalatedRequest).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(MODERATION_POLL_MS);
    expect(moderation.escalatedRequest).toHaveBeenCalledTimes(2);

    visibility = 'hidden';
    vi.advanceTimersByTime(MODERATION_POLL_MS * 3);
    expect(moderation.escalatedRequest).toHaveBeenCalledTimes(2);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(moderation.escalatedRequest).toHaveBeenCalledTimes(3);
    expect(moderation.getOverview).toHaveBeenCalledTimes(3);
  });

  it('does not ask again on becoming visible when the counts are fresh', () => {
    setup();
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));

    expect(moderation.getOverview).toHaveBeenCalledTimes(1);
    expect(moderation.escalatedRequest).toHaveBeenCalledTimes(1);
  });

  it('stops polling and forgets the counts when the account stops being a moderator', () => {
    const counts = setup();
    currentUser.set(null);
    TestBed.tick();
    vi.advanceTimersByTime(MODERATION_POLL_MS * 2);

    expect(moderation.getOverview).toHaveBeenCalledTimes(1);
    expect(counts.total()).toBeNull();
    expect(counts.reportsTotal()).toBeNull();
  });

  it('shows nothing and says nothing when the browser never reached the horde', () => {
    // An undeployed route fails its CORS preflight, which a browser reports
    // as status 0 rather than the 404 behind it.
    const unreachable = () =>
      throwError(() => new HttpErrorResponse({ status: 0, error: null }));
    moderation.answers.overview = unreachable;
    moderation.answers.subjects = unreachable;
    moderation.answers.escalated = unreachable;
    // The prompt log's probe fails the same way and leaves it unknown.
    moderation.probe.mockImplementation(() => of(undefined));
    const counts = setup();

    expect(moderation.subjectsAvailability()).toBe('unknown');
    expect(counts.reportsAvailable()).toBe(false);
    expect(counts.anyAvailable()).toBe(false);
    expect(counts.total()).toBeNull();
    expect(counts.loading()).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps the other counts when one listing fails, and fills it in once a later read reaches it', () => {
    moderation.answers.escalated = () =>
      throwError(() => new HttpErrorResponse({ status: 0, error: null }));
    const counts = setup();
    expect(counts.escalated()).toBeNull();
    expect(counts.reportsTotal()).toEqual({ count: 6, atLeast: false });

    moderation.answers.escalated = () => of(list(1));
    counts.refresh();

    expect(counts.escalated()).toEqual({ count: 1, atLeast: false });
    expect(counts.reportsTotal()).toEqual({ count: 7, atLeast: false });
  });

  it('keeps the last count of a listing whose read fails', () => {
    const counts = setup();
    moderation.answers.subjects = (query) =>
      query.kind === 'ip'
        ? throwError(
            () =>
              new HttpErrorResponse({
                status: 500,
                error: { message: 'boom', rc: 'InternalError' },
              }),
          )
        : of(subjects(5));
    counts.refresh();

    expect(counts.subjects()).toEqual({
      account: { count: 5, atLeast: false },
      proxied_account: { count: 5, atLeast: false },
      ip: { count: 2, atLeast: false },
    });
  });

  it('asks one listing until the listings answer, and none of the others if it does not', () => {
    moderation.answers.subjects = () =>
      throwError(() => new HttpErrorResponse({ status: 0, error: null }));
    const counts = setup();

    expect(moderation.getSubjects.mock.calls.map(([query]) => query)).toEqual([
      { kind: 'account', limit: SUBJECT_COUNT_LIMIT },
    ]);
    expect(counts.reportsTotal()).toBeNull();

    vi.advanceTimersByTime(MODERATION_POLL_MS);
    expect(moderation.getSubjects).toHaveBeenCalledTimes(2);
  });

  it('asks no listing once the listings are absent, and badges only the other queues', () => {
    moderation.subjectsAvailability.set('absent');
    const counts = setup();
    vi.advanceTimersByTime(MODERATION_POLL_MS * 2);

    expect(moderation.getSubjects).not.toHaveBeenCalled();
    expect(counts.reportsTotal()).toBeNull();
    expect(counts.total()).toEqual({ count: 6, atLeast: false });
  });

  it('probes the prompt log once, which is enough to show a queue', () => {
    moderation.answers.overview = () =>
      throwError(() => new HttpErrorResponse({ status: 0, error: null }));
    moderation.subjectsAvailability.set('absent');
    const counts = setup();
    vi.advanceTimersByTime(MODERATION_POLL_MS * 2);

    expect(moderation.probe).toHaveBeenCalledExactlyOnceWith('promptEvents');
    expect(counts.promptsAvailable()).toBe(true);
    expect(counts.anyAvailable()).toBe(true);
    expect(counts.total()).toBeNull();
    expect(counts.loading()).toBe(false);
  });

  it('asks a horde without any queue once per endpoint in a page load', () => {
    // A reachable horde answers an undeployed route with a refused
    // preflight, which the moderation service settles as absent.
    const refused = (target: WritableSignal<EndpointAvailability>) =>
      defer(() => {
        target.set('absent');
        return throwError(
          () => new HttpErrorResponse({ status: 0, error: null }),
        );
      });
    moderation.answers.overview = () =>
      refused(moderation.overviewAvailability);
    moderation.answers.subjects = () =>
      refused(moderation.subjectsAvailability);
    moderation.probe.mockImplementation(() => {
      moderation.promptEventsAvailability.set('absent');
      return of(undefined);
    });
    const counts = setup();
    vi.advanceTimersByTime(MODERATION_POLL_MS * 3);
    counts.refresh();

    expect(moderation.getOverview).toHaveBeenCalledTimes(1);
    expect(moderation.getSubjects).toHaveBeenCalledTimes(1);
    expect(moderation.probe).toHaveBeenCalledTimes(1);
    expect(counts.noneAvailable()).toBe(true);
    expect(counts.anyAvailable()).toBe(false);
    expect(counts.loading()).toBe(false);
  });

  it('is not settled on having no queue while any endpoint is unknown', () => {
    moderation.overviewAvailability.set('absent');
    moderation.subjectsAvailability.set('absent');
    moderation.probe.mockImplementation(() => of(undefined));
    const counts = setup();

    expect(counts.noneAvailable()).toBe(false);
  });

  it('drops the cached overview before a fresh read', () => {
    const counts = setup();
    counts.refreshOverview(true);

    expect(moderation.invalidate).toHaveBeenCalledTimes(1);
    expect(moderation.getOverview).toHaveBeenCalledTimes(2);
  });
});
