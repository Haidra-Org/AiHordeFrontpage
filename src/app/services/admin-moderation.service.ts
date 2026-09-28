import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import {
  HttpClient,
  HttpErrorResponse,
  HttpParams,
} from '@angular/common/http';
import {
  Observable,
  catchError,
  defer,
  map,
  of,
  shareReplay,
  tap,
  throwError,
} from 'rxjs';
import { AuthService } from './auth.service';
import { HordeApiCacheService, CacheTTL } from './horde-api-cache.service';
import { API_BASE_URL } from './api-config';
import { HordeStatusService } from './horde-status.service';
import { isMissingRoute } from '../helper/extract-api-error';
import {
  EndpointAvailability,
  ModerationOverview,
  ModerationOverviewQuery,
  PromptModerationEventQuery,
  PromptModerationEventsPage,
  PromptModerationNote,
  PromptModerationHold,
  WorkerSuspicionEventQuery,
  WorkerSuspicionEventsPage,
} from '../types/moderation';

const CATEGORY = 'admin-moderation';

/** The gated endpoints a page can ask to have probed. */
export type ProbedEndpoint = 'promptEvents';

/**
 * Service for the moderator review queues: the promotion and paused-worker
 * overview, the prompt moderation log and its notes, and the worker suspicion
 * log. Every endpoint needs a moderator key.
 *
 * The endpoints are newer than some hordes the page may talk to, so each
 * surface's availability is exposed as a signal that a request's answer sets.
 * A surface whose endpoint is `absent` hides, and an absent endpoint is not
 * asked again until the page reloads. The overview is one of them: a horde
 * may lack every moderation endpoint.
 *
 * The horde marks these answers `private, no-store`. The in-memory cache keys
 * on the `apikey` header, so one account never reads another's cached answer.
 * The prompt log is never cached at all: it carries prompt text, and a review
 * must show the log as it now stands.
 */
@Injectable({
  providedIn: 'root',
})
export class AdminModerationService {
  private readonly httpClient = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly cache = inject(HordeApiCacheService);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly hordeStatus = inject(HordeStatusService);

  private readonly _overview = signal<EndpointAvailability>('unknown');
  private readonly _promptEvents = signal<EndpointAvailability>('unknown');
  private readonly _workerSuspicionEvents =
    signal<EndpointAvailability>('unknown');

  /**
   * Endpoints whose request failed before reaching the horde while the
   * heartbeat had not yet answered. See `trackAvailability`.
   */
  private readonly unreached = new Set<WritableSignal<EndpointAvailability>>();
  /** Whether a heartbeat read is under way to settle `unreached`. */
  private checkingReach = false;
  /**
   * Probes by endpoint, so every caller shares one request. Each runs to its
   * end whoever unsubscribes, since a probe cancelled mid-flight would only
   * be sent again by the next caller.
   */
  private readonly probes = new Map<ProbedEndpoint, Observable<void>>();

  private readonly _promptReasonFilter = signal<boolean | undefined>(undefined);

  /**
   * Whether `/prompts` filters by `reason` itself; undefined until the prompt
   * log's probe has answered. Reason filtering and evidence holds came in one
   * horde release, so a probe row that carries `held_until` shows the filter
   * is there. The row's shape decides rather than the horde's version, which
   * unrelated horde branches can share. A probe that finds no rows settles
   * it as false: with no reports there is nothing to filter.
   */
  public readonly promptReasonFilter = this._promptReasonFilter.asReadonly();

  /** GET /v2/operations/moderation */
  public readonly overviewAvailability = this._overview.asReadonly();
  /** GET /v2/operations/moderation/prompts and POST its notes */
  public readonly promptEventsAvailability = this._promptEvents.asReadonly();
  /** GET /v2/operations/moderation/worker_suspicion_events */
  public readonly workerSuspicionEventsAvailability =
    this._workerSuspicionEvents.asReadonly();

  private getHeaders(): Record<string, string> {
    const apiKey = this.auth.getStoredApiKey();
    return apiKey ? { apikey: apiKey } : {};
  }

  /**
   * Accounts blocked from or eligible for promotion, and paused workers.
   * GET /v2/operations/moderation
   *
   * @param query The row limit and the paused-worker filters and order.
   */
  public getOverview(
    query: ModerationOverviewQuery = {},
  ): Observable<ModerationOverview> {
    return this.cache
      .cachedGet<ModerationOverview>(
        `${this.baseUrl}/operations/moderation`,
        { headers: this.getHeaders(), params: toParams(query) },
        { ttl: CacheTTL.SHORT, category: CATEGORY },
      )
      .pipe(this.trackAvailability(this._overview));
  }

  /**
   * One page of the prompt moderation log, newest first.
   * GET /v2/operations/moderation/prompts
   *
   * @param query Filters, and `before_id` set to the previous page's
   *   `next_cursor` for the page after it.
   */
  public getPromptEvents(
    query: PromptModerationEventQuery = {},
  ): Observable<PromptModerationEventsPage> {
    return this.cache
      .cachedGet<PromptModerationEventsPage>(
        `${this.baseUrl}/operations/moderation/prompts`,
        { headers: this.getHeaders(), params: toParams(query) },
        { ttl: CacheTTL.NEVER },
      )
      .pipe(this.trackAvailability(this._promptEvents));
  }

  /**
   * Add a note to one event.
   * POST /v2/operations/moderation/prompts/{id}/notes
   *
   * @returns The stored note, or null without a key.
   */
  public addPromptNote(
    id: number,
    note: string,
  ): Observable<PromptModerationNote | null> {
    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) {
      return of(null);
    }
    return this.httpClient
      .post<PromptModerationNote>(
        `${this.baseUrl}/operations/moderation/prompts/${id}/notes`,
        { note },
        { headers: { apikey: apiKey } },
      )
      .pipe(this.trackAvailability(this._promptEvents));
  }

  /**
   * Retain one event temporarily and record the moderator's reason as a note.
   * The horde never shortens a hold, so the expiry returned may be later than
   * `durationDays` from now.
   *
   * Hold writes leave the prompt log's availability alone: the log answered
   * for the event to be shown, and a refused write is reported by its form.
   */
  public holdPromptEvent(
    id: number,
    durationDays: number,
    note: string,
  ): Observable<PromptModerationHold | null> {
    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) return of(null);
    return this.httpClient.post<PromptModerationHold>(
      `${this.baseUrl}/operations/moderation/prompts/${id}/hold`,
      { duration_days: durationDays, note },
      { headers: { apikey: apiKey } },
    );
  }

  /**
   * End a temporary hold so the normal retention rule applies. The horde
   * records a release note either way; `note` replaces its default text.
   */
  public releasePromptHold(
    id: number,
    note?: string,
  ): Observable<PromptModerationHold | null> {
    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) return of(null);
    return this.httpClient.delete<PromptModerationHold>(
      `${this.baseUrl}/operations/moderation/prompts/${id}/hold`,
      { headers: { apikey: apiKey }, ...(note ? { body: { note } } : {}) },
    );
  }

  /**
   * One page of the worker suspicion log, newest first.
   * GET /v2/operations/moderation/worker_suspicion_events
   */
  public getWorkerSuspicionEvents(
    query: WorkerSuspicionEventQuery = {},
  ): Observable<WorkerSuspicionEventsPage> {
    return this.cache
      .cachedGet<WorkerSuspicionEventsPage>(
        `${this.baseUrl}/operations/moderation/worker_suspicion_events`,
        { headers: this.getHeaders(), params: toParams(query) },
        { ttl: CacheTTL.SHORT, category: CATEGORY },
      )
      .pipe(this.trackAvailability(this._workerSuspicionEvents));
  }

  /**
   * Drop the cached overview and suspicion log. A change
   * made through another service (trusting an account, unpausing a worker)
   * reaches them without passing through here.
   */
  public invalidate(): void {
    this.cache.invalidate({ category: CATEGORY });
  }

  /**
   * Ask an endpoint whose availability is not yet known, with the cheapest
   * read it takes, so the pages gated on it can show. The answer only moves
   * the availability signal, and for the prompt log `promptReasonFilter`;
   * errors are swallowed. Nothing is sent once the endpoint is known either
   * way (the prompt log's row shape included), and a probe in flight is
   * shared.
   */
  public probe(endpoint: ProbedEndpoint): Observable<void> {
    if (this.probeSettled(endpoint)) return of(undefined);
    const shared = this.probes.get(endpoint);
    if (shared) return shared;
    const request: Observable<unknown> = this.getPromptEvents({
      limit: 1,
    }).pipe(
      tap((page) =>
        this._promptReasonFilter.set(
          page.events.at(0)?.held_until !== undefined,
        ),
      ),
    );
    const probe: Observable<void> = request.pipe(
      map(() => undefined),
      catchError(() => of(undefined)),
      tap({ complete: () => this.forgetProbe(endpoint, probe) }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.probes.set(endpoint, probe);
    return probe;
  }

  private probeSettled(endpoint: ProbedEndpoint): boolean {
    const availability = this.availabilityOf(endpoint)();
    if (endpoint === 'promptEvents' && availability === 'available') {
      return this._promptReasonFilter() !== undefined;
    }
    return availability !== 'unknown';
  }

  /**
   * Let an endpoint that a finished probe left unknown (the horde could not
   * be reached) be probed again by the next caller.
   */
  private forgetProbe(endpoint: ProbedEndpoint, probe: Observable<void>): void {
    if (this.probes.get(endpoint) === probe) this.probes.delete(endpoint);
  }

  private availabilityOf(
    endpoint: ProbedEndpoint,
  ): WritableSignal<EndpointAvailability> {
    switch (endpoint) {
      case 'promptEvents':
        return this._promptEvents;
    }
  }

  /**
   * Record what an answer says about its endpoint, and send nothing to an
   * endpoint already found absent. Any answer from the route, refusals
   * included, means it is there; a missing route marks it absent.
   *
   * A browser reports a request to an unregistered path as status 0, because
   * the CORS preflight for a keyed request is refused before the 404 behind
   * it can be read. Status 0 is also what a network failure looks like, so
   * the heartbeat decides between them: it is unkeyed and on every horde,
   * and once it has answered in this page load, the horde is reachable and a
   * status 0 from any of these endpoints means that endpoint is not
   * deployed. A status 0 that arrives before the heartbeat has answered is
   * held, and the heartbeat is read. If it answers, the held endpoints are
   * absent; if it fails too, they stay unknown, and the next read of one of
   * them tries both again.
   */
  private trackAvailability<T>(
    target: WritableSignal<EndpointAvailability>,
  ): (source: Observable<T>) => Observable<T> {
    return (source) =>
      defer(() =>
        target() === 'absent'
          ? throwError(
              () =>
                new HttpErrorResponse({ status: 404, statusText: 'Not Found' }),
            )
          : source.pipe(
              tap<T>({
                next: () => this.settle(target, 'available'),
                error: (error: unknown) => {
                  if (isMissingRoute(error)) {
                    this.settle(target, 'absent');
                  } else if (error instanceof HttpErrorResponse) {
                    if (error.status > 0) this.settle(target, 'available');
                    else this.unreachable(target);
                  }
                },
              }),
            ),
      );
  }

  private settle(
    target: WritableSignal<EndpointAvailability>,
    availability: Exclude<EndpointAvailability, 'unknown'>,
  ): void {
    this.unreached.delete(target);
    target.set(availability);
  }

  private unreachable(target: WritableSignal<EndpointAvailability>): void {
    if (target() !== 'unknown') return;
    if (this.hordeStatus.reachable()) {
      target.set('absent');
      return;
    }
    this.unreached.add(target);
    if (this.checkingReach) return;
    this.checkingReach = true;
    this.hordeStatus.checkReachable().subscribe((reachable) => {
      this.checkingReach = false;
      if (reachable) {
        for (const held of this.unreached) {
          if (held() === 'unknown') held.set('absent');
        }
      }
      this.unreached.clear();
    });
  }
}

/**
 * A query as parameters. An array repeats its key, as the horde reads a
 * repeated `reason`; an empty string or array is left off.
 */
function toParams(query: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query) as [string, unknown][]) {
    if (Array.isArray(value)) {
      for (const item of value as (string | number)[]) {
        params = params.append(key, item);
      }
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      (typeof value === 'string' && value)
    ) {
      params = params.set(key, value);
    }
  }
  return params;
}
