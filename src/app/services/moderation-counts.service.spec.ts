import { PLATFORM_ID, WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, defer, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import {
  MODERATION_POLL_MS,
  ModerationCountsService,
  OVERVIEW_LIMIT,
} from './moderation-counts.service';
import { AdminModerationService } from './admin-moderation.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { EndpointAvailability, ModerationOverview } from '../types/moderation';

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

/**
 * A stand-in for AdminModerationService whose availability signals move the
 * way the real service moves them: an answer marks the endpoint available, a
 * failure that never reached the horde (status 0) leaves it as it was.
 */
function makeModeration() {
  const overviewAvailability: WritableSignal<EndpointAvailability> =
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
  const answers = {
    overview: (): Observable<ModerationOverview> => of(overview(2, 1, 3)),
  };
  return {
    answers,
    overviewAvailability,
    promptEventsAvailability,
    probe: vi.fn((): Observable<void> => {
      promptEventsAvailability.set('available');
      return of(undefined);
    }),
    getOverview: vi.fn(() =>
      answers.overview().pipe(track(overviewAvailability)),
    ),
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

  it('adds the overview queues into the total', () => {
    const counts = setup();

    expect(counts.eligible()).toEqual({ count: 2, atLeast: false });
    expect(counts.blocked()).toEqual({ count: 1, atLeast: false });
    expect(counts.paused()).toEqual({ count: 3, atLeast: false });
    expect(counts.total()).toEqual({ count: 6, atLeast: false });
    expect(counts.anyAvailable()).toBe(true);
  });

  it('counts paused workers from the total the horde states, past its cap', () => {
    moderation.answers.overview = () =>
      of({ ...overview(0, 0, OVERVIEW_LIMIT), paused_workers_total: 1840 });
    const counts = setup();

    expect(counts.paused()).toEqual({ count: 1840, atLeast: false });
  });

  it('carries a full page into the total as a floor', () => {
    moderation.answers.overview = () => of(overview(OVERVIEW_LIMIT, 0, 0));
    const counts = setup();

    expect(counts.total()).toEqual({ count: 100, atLeast: true });
  });

  it('asks nothing for an account that is not a moderator', () => {
    currentUser.set({ moderator: false });
    const counts = setup();

    expect(moderation.getOverview).not.toHaveBeenCalled();
    expect(counts.total()).toBeNull();
  });

  it('never polls while rendering on the server', () => {
    setup('server');
    vi.advanceTimersByTime(MODERATION_POLL_MS * 2);

    expect(moderation.getOverview).not.toHaveBeenCalled();
  });

  it('polls on its interval and skips its turn while the page is hidden', () => {
    setup();
    expect(moderation.getOverview).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(MODERATION_POLL_MS);
    expect(moderation.getOverview).toHaveBeenCalledTimes(2);

    visibility = 'hidden';
    vi.advanceTimersByTime(MODERATION_POLL_MS * 3);
    expect(moderation.getOverview).toHaveBeenCalledTimes(2);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(moderation.getOverview).toHaveBeenCalledTimes(3);
  });

  it('does not ask again on becoming visible when the counts are fresh', () => {
    setup();
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));

    expect(moderation.getOverview).toHaveBeenCalledTimes(1);
  });

  it('stops polling and forgets the counts when the account stops being a moderator', () => {
    const counts = setup();
    currentUser.set(null);
    TestBed.tick();
    vi.advanceTimersByTime(MODERATION_POLL_MS * 2);

    expect(moderation.getOverview).toHaveBeenCalledTimes(1);
    expect(counts.total()).toBeNull();
  });

  it('shows nothing and says nothing when the browser never reached the horde', () => {
    // An undeployed route fails its CORS preflight, which a browser reports
    // as status 0 rather than the 404 behind it.
    const unreachable = () =>
      throwError(() => new HttpErrorResponse({ status: 0, error: null }));
    moderation.answers.overview = unreachable;
    // The prompt log's probe fails the same way and leaves it unknown.
    moderation.probe.mockImplementation(() => of(undefined));
    const counts = setup();

    expect(counts.anyAvailable()).toBe(false);
    expect(counts.total()).toBeNull();
    expect(counts.loading()).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('probes the prompt log once, which is enough to show a queue', () => {
    moderation.answers.overview = () =>
      throwError(() => new HttpErrorResponse({ status: 0, error: null }));
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
    moderation.probe.mockImplementation(() => {
      moderation.promptEventsAvailability.set('absent');
      return of(undefined);
    });
    const counts = setup();
    vi.advanceTimersByTime(MODERATION_POLL_MS * 3);
    counts.refresh();

    expect(moderation.getOverview).toHaveBeenCalledTimes(1);
    expect(moderation.probe).toHaveBeenCalledTimes(1);
    expect(counts.noneAvailable()).toBe(true);
    expect(counts.anyAvailable()).toBe(false);
    expect(counts.loading()).toBe(false);
  });

  it('is not settled on having no queue while any endpoint is unknown', () => {
    moderation.overviewAvailability.set('absent');
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
