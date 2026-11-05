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
  FalsePositiveReport,
  ModerationSettings,
  ModerationSubjectDetail,
  ModerationSubjectDetailQuery,
  ModerationWorkerDetail,
  ModerationWorkerDetailQuery,
  ModerationSubjectQuery,
  ModerationSubjectsPage,
  PromptModerationEventQuery,
  PromptModerationEventsPage,
  PromptModerationNote,
  PromptModerationHold,
  PromptModerationText,
  ReportingWorkersPage,
  ReportingWorkersQuery,
  SubjectDecision,
  SubjectDecisionInput,
  SubjectDecisionsPage,
  SubjectDecisionsQuery,
  WorkerSuspicionEventQuery,
  WorkerSuspicionEventsPage,
} from '../types/moderation';

const CATEGORY = 'admin-moderation';

/**
 * How long a subject's or a worker's detail answer is reused. Stepping back
 * and forth through the list with the keyboard reopens the same subjects,
 * and each read costs from the moderators' per-minute budget.
 */
export const DETAIL_MEMO_MS = 60_000;

/** The window the benign-report probe asks for: the horde's retention. */
const PROBE_WINDOW_SECONDS = 2_592_000;

/**
 * The gated endpoints a page can ask to have probed. The report listings are
 * probed by the counts that read them anyway.
 */
export type ProbedEndpoint =
  'promptEvents' | 'reportingWorkers' | 'falsePositives' | 'settings';

/** A remembered detail answer and whose it is, so a change to it can drop it. */
interface MemoEntry {
  at: number;
  owner: string;
  data: unknown;
}

/**
 * Service for the moderator review queues: the promotion and paused-worker
 * overview, the report listings by account, proxied account and address with
 * the decisions on them, the prompt moderation log and its notes, the alert
 * settings, and the worker suspicion log. Every endpoint needs a moderator
 * key.
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
  private readonly _subjects = signal<EndpointAvailability>('unknown');
  private readonly _falsePositives = signal<EndpointAvailability>('unknown');
  private readonly _reportingWorkers = signal<EndpointAvailability>('unknown');

  /**
   * Detail answers by owner, address and key. Kept apart from the shared
   * cache, whose in-flight sharing would keep a superseded read running;
   * here a miss is a plain request that unsubscribing cancels.
   */
  private readonly detailMemo = new Map<string, MemoEntry>();
  private readonly _settings = signal<EndpointAvailability>('unknown');
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
  /**
   * GET /v2/operations/moderation/subjects, its watching and escalated lists,
   * and the decisions on subjects. One signal, because the horde serves them
   * together.
   */
  public readonly subjectsAvailability = this._subjects.asReadonly();
  /** GET /v2/operations/moderation/workers and a worker's detail */
  public readonly reportingWorkersAvailability =
    this._reportingWorkers.asReadonly();
  /** GET /v2/operations/moderation/models */
  public readonly falsePositivesAvailability =
    this._falsePositives.asReadonly();
  /** GET and PUT /v2/operations/moderation/settings */
  public readonly settingsAvailability = this._settings.asReadonly();
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
   * Accounts, proxied accounts or addresses ranked by how many reports they
   * collected under the criteria. Without a window and a minimum count the
   * horde lists those over any of its alert rules.
   * GET /v2/operations/moderation/subjects
   */
  public getSubjects(
    query: ModerationSubjectQuery,
  ): Observable<ModerationSubjectsPage> {
    return this.cache
      .cachedGet<ModerationSubjectsPage>(
        `${this.baseUrl}/operations/moderation/subjects`,
        { headers: this.getHeaders(), params: toParams(query) },
        { ttl: CacheTTL.SHORT, category: CATEGORY },
      )
      .pipe(this.trackAvailability(this._subjects));
  }

  /**
   * One subject's counts, timeline, related subjects, reporting workers,
   * models, rules and state, over the largest rule window or a range.
   * An answer is reused for `DETAIL_MEMO_MS` unless a decision on the
   * subject or a note drops it first; a read that is superseded before it
   * answers is cancelled at the socket.
   * GET /v2/operations/moderation/subjects/detail
   *
   * A 404 `ModerationSubjectNotFound` means the subject has no reports kept.
   */
  public getSubjectDetail(
    query: ModerationSubjectDetailQuery,
  ): Observable<ModerationSubjectDetail> {
    return this.memoized<ModerationSubjectDetail>(
      subjectOwner(query),
      `${this.baseUrl}/operations/moderation/subjects/detail`,
      toParams(query),
    ).pipe(this.trackAvailability(this._subjects));
  }

  /**
   * Workers ranked by the reports they made in a window, with the accounts
   * those reports were about and how many a benign decision later covered.
   * GET /v2/operations/moderation/workers
   */
  public getReportingWorkers(
    query: ReportingWorkersQuery,
  ): Observable<ReportingWorkersPage> {
    return this.cache
      .cachedGet<ReportingWorkersPage>(
        `${this.baseUrl}/operations/moderation/workers`,
        { headers: this.getHeaders(), params: toParams(query) },
        { ttl: CacheTTL.SHORT, category: CATEGORY },
      )
      .pipe(this.trackAvailability(this._reportingWorkers));
  }

  /**
   * One worker's reports over the largest rule window or a range: counts,
   * the timeline, the accounts it reported and the models asked for.
   * Reused like the subject detail.
   * GET /v2/operations/moderation/workers/detail
   */
  public getWorkerDetail(
    query: ModerationWorkerDetailQuery,
  ): Observable<ModerationWorkerDetail> {
    return this.memoized<ModerationWorkerDetail>(
      `worker:${query.worker_id}`,
      `${this.baseUrl}/operations/moderation/workers/detail`,
      toParams(query),
    ).pipe(this.trackAvailability(this._reportingWorkers));
  }

  /**
   * One subject's decisions, newest first. Never cached, so a decision just
   * made is in the next read.
   * GET /v2/operations/moderation/subjects/decisions
   */
  public getSubjectDecisions(
    query: SubjectDecisionsQuery,
  ): Observable<SubjectDecisionsPage> {
    return this.cache
      .cachedGet<SubjectDecisionsPage>(
        `${this.baseUrl}/operations/moderation/subjects/decisions`,
        { headers: this.getHeaders(), params: toParams(query) },
        { ttl: CacheTTL.NEVER },
      )
      .pipe(this.trackAvailability(this._subjects));
  }

  /**
   * Record a decision on a subject. The listings change with it, so the
   * cached ones are dropped.
   * POST /v2/operations/moderation/subjects/decisions
   *
   * A 400 `InvalidModerationDecision` or a 404 `ModerationSubjectNotFound`
   * is a real answer and reaches the caller as an error.
   *
   * @returns The stored decision, or null without a key.
   */
  public recordSubjectDecision(
    input: SubjectDecisionInput,
  ): Observable<SubjectDecision | null> {
    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) {
      return of(null);
    }
    return this.httpClient
      .post<SubjectDecision>(
        `${this.baseUrl}/operations/moderation/subjects/decisions`,
        input,
        { headers: { apikey: apiKey } },
      )
      .pipe(
        this.trackAvailability(this._subjects),
        tap(() => {
          this.cache.invalidate({ category: CATEGORY });
          this.forgetDetails(subjectOwner(input));
          if (input.action === 'pause_worker' && input.action_detail) {
            this.forgetDetails(`worker:${input.action_detail}`);
          }
        }),
      );
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
   * The prompt stages of a `stored` event, read from its `text_url`.
   *
   * The link is presigned for the evidence bucket, so the request carries no
   * header: the key must not reach the bucket, and a header would make the
   * cross-origin GET need a preflight the bucket does not answer. An expired
   * link is refused by the store; the caller reads the event again for a
   * fresh one.
   */
  public getStoredPromptText(url: string): Observable<PromptModerationText> {
    return this.httpClient.get<PromptModerationText>(url);
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
      .pipe(
        this.trackAvailability(this._promptEvents),
        // A note shows on every subject and worker the event names, and
        // only the event's id is known here, so every detail is dropped.
        tap(() => this.detailMemo.clear()),
      );
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
    return this.httpClient
      .post<PromptModerationHold>(
        `${this.baseUrl}/operations/moderation/prompts/${id}/hold`,
        { duration_days: durationDays, note },
        { headers: { apikey: apiKey } },
      )
      .pipe(tap(() => this.detailMemo.clear()));
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
    return this.httpClient
      .delete<PromptModerationHold>(
        `${this.baseUrl}/operations/moderation/prompts/${id}/hold`,
        { headers: { apikey: apiKey }, ...(note ? { body: { note } } : {}) },
      )
      .pipe(tap(() => this.detailMemo.clear()));
  }

  /**
   * Worker reports later covered by a benign decision, counted by model and
   * by worker.
   * GET /v2/operations/moderation/models
   *
   * @param windowSeconds How far back to count.
   */
  public getFalsePositives(
    windowSeconds: number,
    offset = 0,
  ): Observable<FalsePositiveReport> {
    return this.cache
      .cachedGet<FalsePositiveReport>(
        `${this.baseUrl}/operations/moderation/models`,
        {
          headers: this.getHeaders(),
          params: new HttpParams()
            .set('window', windowSeconds)
            .set('offset', offset),
        },
        { ttl: CacheTTL.SHORT, category: CATEGORY },
      )
      .pipe(this.trackAvailability(this._falsePositives));
  }

  /**
   * The alert rules and the reasons they count.
   * GET /v2/operations/moderation/settings
   */
  public getSettings(): Observable<ModerationSettings> {
    return this.cache
      .cachedGet<ModerationSettings>(
        `${this.baseUrl}/operations/moderation/settings`,
        { headers: this.getHeaders() },
        { ttl: CacheTTL.SHORT, category: CATEGORY },
      )
      .pipe(this.trackAvailability(this._settings));
  }

  /**
   * Replace the alert rules and reasons. The listings count by them, so the
   * cached ones are dropped.
   * PUT /v2/operations/moderation/settings
   *
   * @returns The stored settings, or null without a key.
   */
  public updateSettings(
    settings: ModerationSettings,
  ): Observable<ModerationSettings | null> {
    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) {
      return of(null);
    }
    return this.httpClient
      .put<ModerationSettings>(
        `${this.baseUrl}/operations/moderation/settings`,
        settings,
        { headers: { apikey: apiKey } },
      )
      .pipe(
        this.trackAvailability(this._settings),
        tap(() => this.cache.invalidate({ category: CATEGORY })),
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
   * Drop the cached overview, listings, settings and suspicion log. A change
   * made through another service (trusting an account, unpausing a worker)
   * reaches them without passing through here.
   */
  public invalidate(): void {
    this.cache.invalidate({ category: CATEGORY });
    this.detailMemo.clear();
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
    const request: Observable<unknown> =
      endpoint === 'promptEvents'
        ? this.getPromptEvents({ limit: 1 }).pipe(
            tap((page) =>
              this._promptReasonFilter.set(
                page.events.at(0)?.held_until !== undefined,
              ),
            ),
          )
        : endpoint === 'reportingWorkers'
          ? this.getReportingWorkers({ limit: 1 })
          : endpoint === 'falsePositives'
            ? this.getFalsePositives(PROBE_WINDOW_SECONDS)
            : this.getSettings();
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

  /** Drop the remembered detail answers of one subject or worker. */
  public forgetDetails(owner: string): void {
    for (const [key, entry] of this.detailMemo) {
      if (entry.owner === owner) this.detailMemo.delete(key);
    }
  }

  private memoized<T>(
    owner: string,
    url: string,
    params: HttpParams,
  ): Observable<T> {
    const headers = this.getHeaders();
    const key = `${headers['apikey'] ?? ''}|${url}?${params.toString()}`;
    const hit = this.detailMemo.get(key);
    if (hit && Date.now() - hit.at < DETAIL_MEMO_MS) {
      return of(hit.data as T);
    }
    return this.cache
      .cachedGet<T>(url, { headers, params }, { ttl: CacheTTL.NEVER })
      .pipe(
        tap((data) =>
          this.detailMemo.set(key, { at: Date.now(), owner, data }),
        ),
      );
  }

  private availabilityOf(
    endpoint: ProbedEndpoint,
  ): WritableSignal<EndpointAvailability> {
    switch (endpoint) {
      case 'promptEvents':
        return this._promptEvents;
      case 'reportingWorkers':
        return this._reportingWorkers;
      case 'falsePositives':
        return this._falsePositives;
      case 'settings':
        return this._settings;
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

/** Whose a subject query or decision is, as the detail memo keys it. */
function subjectOwner(
  query: Pick<
    SubjectDecisionInput,
    'kind' | 'user_id' | 'proxied_account' | 'ipaddr'
  >,
): string {
  switch (query.kind) {
    case 'account':
      return `account:${query.user_id}`;
    case 'proxied_account':
      return `proxied_account:${query.user_id}:${query.proxied_account}`;
    case 'ip':
      return `ip:${query.ipaddr}`;
  }
}
