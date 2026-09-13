import {
  DestroyRef,
  Injectable,
  NgZone,
  PLATFORM_ID,
  Signal,
  computed,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AiHordeService } from './ai-horde.service';
import { PromptDraftDbService } from './prompt-draft-db.service';
import { GenerationWaitInsightsService } from './generation-wait-insights.service';
import {
  StoredTextRequest,
  TextGenerationDbService,
  TextRequestContext,
  TextRequestFigures,
  TextRequestState,
  TextRequestTake,
  textRequestContextKey,
} from './text-generation-db.service';
import {
  PromptDraftChange,
  PromptDraftInput,
  PromptDraftModelPick,
  PromptDraftOrigin,
  cleanDraft,
  cleanJudgement,
  draftRole,
} from './prompt-draft.service';
import { randomUuid } from '../helper/random-uuid';
import {
  GENERATION_NOT_FOUND,
  TextGenerationOutput,
  TextGenerationRequest,
  TextGenerationStatusResponse,
} from '../types/generation';

/**
 * How many requests one card may have waiting on the horde at once. It is the
 * only place the rule lives: the store, the loop and the list a card reads all
 * hold any number, so allowing more is a change to this figure and to how the
 * card draws them.
 */
export const MAX_LIVE_PER_CONTEXT = 1;

/** How often the loop wakes to see whether any request is due a check. */
const TICK_MS = 1_000;
/** The gap between checks for a request whose card is open. */
const ON_SCREEN_INTERVAL_MS = 3_000;
/**
 * The gap between checks for a request nobody is looking at. It still lands
 * its takes when it finishes; it only needs to notice that less promptly.
 */
const OFF_SCREEN_INTERVAL_MS = 10_000;
/** How long a request that drew a 429 waits before it is checked again. */
const CHECK_BACKOFF_MS = 15_000;
/**
 * How long a finished request is kept. The drafts it landed are the lasting
 * record; the request only has to outlive a reload or two.
 */
const FINISHED_RETENTION_MS = 24 * 60 * 60 * 1000;

/** The translation key for a request the page lost track of mid-send. */
const LOST_ERROR_KEY = 'prompt_draft.queue.lost';

const LIVE_STATES: ReadonlySet<TextRequestState> = new Set([
  'sending',
  'queued',
  'writing',
]);

/** The states the horde reports for an answer it held back rather than sent. */
const HELD_BACK_STATES: ReadonlySet<string> = new Set(['censored', 'csam']);

/** Which worker answered, where the horde said. */
function workerOf(generation: TextGenerationOutput): {
  workerId?: string;
  workerName?: string;
} {
  return {
    ...(generation.worker_id ? { workerId: generation.worker_id } : {}),
    ...(generation.worker_name ? { workerName: generation.worker_name } : {}),
  };
}

/** A take that cleaned to nothing, kept for what it says about the answer. */
function emptyTake(
  generation: TextGenerationOutput,
  draftId: string,
  request: StoredTextRequest,
): TextRequestTake {
  return {
    draftId,
    text: '',
    negative: '',
    rawText: generation.text,
    reason: HELD_BACK_STATES.has(generation.state) ? 'censored' : 'blank',
    model: generation.model ?? request.modelLabel ?? '',
    seed: generation.seed ?? null,
    ...workerOf(generation),
  };
}

/** Whether the horde may still change what a request says. */
export function isLiveTextRequest(request: StoredTextRequest): boolean {
  return LIVE_STATES.has(request.state);
}

/** Everything a request goes out with, already built and priced. */
export interface TextRequestSubmission {
  context: TextRequestContext;
  origin: PromptDraftOrigin;
  input: PromptDraftInput;
  pick: PromptDraftModelPick;
  styleId: string | null;
  takes: number;
  anonymous: boolean;
  modelLabel: string | null;
  /** The key the request is sent on. Used for the submit and never stored. */
  apiKey: string;
  request: TextGenerationRequest;
  quotedKudos: number | null;
}

export type TextSubmitResult =
  | { kind: 'sent'; localId: string }
  /**
   * The context already holds as many live requests as it may. Nothing was
   * sent; the caller asks the reader before sending with `replace`.
   */
  | { kind: 'busy'; live: StoredTextRequest[] };

function figuresOf(status: TextGenerationStatusResponse): TextRequestFigures {
  return {
    finished: status.finished,
    processing: status.processing,
    waiting: status.waiting,
    restarted: status.restarted,
    queuePosition: status.queue_position,
    waitTime: status.wait_time,
    isPossible: status.is_possible,
    ...(status.eligible_workers !== undefined
      ? { eligibleWorkers: status.eligible_workers }
      : {}),
    ...(status.eligible_worker_threads !== undefined
      ? { eligibleWorkerThreads: status.eligible_worker_threads }
      : {}),
    ...(status.might_stall !== undefined
      ? { mightStall: status.might_stall }
      : {}),
  };
}

/**
 * Text requests that outlive the card that sent them. Each request is kept in
 * IndexedDB from the moment it is sent, checked on a single loop until the
 * horde finishes, cancels or expires it, and its takes are written to the
 * drafts store whether or not a card is open to show them.
 *
 * There is no time limit on this side. A request nobody picks up is expired by
 * the horde about twenty minutes after it was last refreshed, and the status
 * answers 404 from then on, which is what ends it here.
 *
 * The service is browser-only. On the server the constructor starts nothing
 * and the store no-ops.
 */
@Injectable({ providedIn: 'root' })
export class TextGenerationQueueService {
  private readonly db = inject(TextGenerationDbService);
  private readonly drafts = inject(PromptDraftDbService);
  private readonly aiHorde = inject(AiHordeService);
  private readonly waitInsights = inject(GenerationWaitInsightsService);
  private readonly ngZone = inject(NgZone);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _requests = signal<StoredTextRequest[]>([]);
  private readonly _clock = signal(Date.now());
  private readonly _cancelling = signal<ReadonlySet<string>>(new Set());

  /** Every kept request, newest first. */
  public readonly requests = this._requests.asReadonly();
  /**
   * Wall clock, advanced by the loop while any request is live so a time waited
   * drawn against it stays current. It stands still otherwise.
   */
  public readonly clock = this._clock.asReadonly();
  /** The requests a cancel has been sent for and not yet answered. */
  public readonly cancelling = this._cancelling.asReadonly();

  private readonly byContext = new Map<
    string,
    Signal<readonly StoredTextRequest[]>
  >();
  /** How many open cards are showing each context. */
  private readonly onScreen = new Map<string, number>();
  private readonly backoffUntil = new Map<string, number>();
  /** Requests cancelled before the horde had given them an id. */
  private readonly cancelOnAccept = new Set<string>();
  private readonly settleWaiters = new Map<
    string,
    ((request: StoredTextRequest) => void)[]
  >();

  private ticking = false;
  private destroyed = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private initPromise: Promise<void> | null = null;

  private readonly onVisibility = (): void => {
    if (this.document.visibilityState === 'visible') {
      void this.tick();
    }
  };

  constructor() {
    if (this.isBrowser) {
      // Registered before the kept requests load: the injector can be torn
      // down while that read is still out, and a hook added after that throws.
      this.destroyRef.onDestroy(() => {
        this.destroyed = true;
        this.document.removeEventListener(
          'visibilitychange',
          this.onVisibility,
        );
        if (this.timer !== null) clearInterval(this.timer);
      });
      this.initPromise = this.initialize();
    }
  }

  /** Resolves once kept requests are loaded and the loop is running. */
  public whenReady(): Promise<void> {
    return this.initPromise ?? Promise.resolve();
  }

  private async initialize(): Promise<void> {
    try {
      const stored = await this.db.list();
      const now = this.now();
      const kept: StoredTextRequest[] = [];
      for (const request of stored) {
        if (
          !isLiveTextRequest(request) &&
          now - request.updatedAt > FINISHED_RETENTION_MS
        ) {
          await this.db.remove(request.localId);
          continue;
        }
        if (request.state === 'sending') {
          // The page went away between sending and hearing back, so there is
          // no id to follow. The horde may well have the request; there is no
          // way to find it again.
          const lost: StoredTextRequest = {
            ...request,
            state: 'faulted',
            errorKey: LOST_ERROR_KEY,
            updatedAt: now,
            acknowledged: true,
          };
          await this.db.put(lost);
          kept.push(lost);
          continue;
        }
        kept.push(request);
      }
      this._requests.update((current) => this.sorted([...current, ...kept]));
    } catch (error) {
      // A store that will not open must not wedge the card: new requests still
      // run in memory for this visit.
      console.warn('Failed to load kept text requests:', error);
    }
    this.startLoop();
  }

  private startLoop(): void {
    if (this.destroyed) return;
    this.ngZone.runOutsideAngular(() => {
      this.timer = setInterval(() => void this.tick(), TICK_MS);
      this.document.addEventListener('visibilitychange', this.onVisibility);
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** The requests asked from one context, newest first. */
  public requestsFor(
    context: TextRequestContext,
  ): Signal<readonly StoredTextRequest[]> {
    const key = textRequestContextKey(context);
    let found = this.byContext.get(key);
    if (!found) {
      // Created untracked so a card reading this from inside its own computed
      // does not tie the list's lifetime to that computed.
      found = untracked(() =>
        computed(() =>
          this._requests().filter(
            (request) => textRequestContextKey(request.context) === key,
          ),
        ),
      );
      this.byContext.set(key, found);
    }
    return found;
  }

  /**
   * Say a card showing this context is open, so its requests are checked at
   * the quicker pace. Returns the call that says it has closed.
   */
  public watch(context: TextRequestContext): () => void {
    const key = textRequestContextKey(context);
    this.onScreen.set(key, (this.onScreen.get(key) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const count = (this.onScreen.get(key) ?? 1) - 1;
      if (count <= 0) this.onScreen.delete(key);
      else this.onScreen.set(key, count);
    };
  }

  /**
   * Send a request and keep it. When the context already has as many live
   * requests as {@link MAX_LIVE_PER_CONTEXT} allows, nothing is sent unless
   * `replace` is set, in which case the oldest of them are cancelled first.
   */
  public async submit(
    submission: TextRequestSubmission,
    options: { replace?: boolean } = {},
  ): Promise<TextSubmitResult> {
    await this.whenReady();
    const live = untracked(() => this.requestsFor(submission.context)()).filter(
      isLiveTextRequest,
    );
    if (live.length >= MAX_LIVE_PER_CONTEXT) {
      if (!options.replace) return { kind: 'busy', live };
      const excess = live.slice(MAX_LIVE_PER_CONTEXT - 1).reverse();
      for (const request of excess) {
        await this.cancel(request.localId);
      }
    }

    const now = this.now();
    const record: StoredTextRequest = {
      localId: randomUuid(),
      createdAt: now,
      updatedAt: now,
      context: submission.context,
      origin: submission.origin,
      input: submission.input,
      pick: submission.pick,
      ...(submission.styleId ? { styleId: submission.styleId } : {}),
      takes: submission.takes,
      anonymous: submission.anonymous,
      modelLabel: submission.modelLabel,
      request: submission.request,
      state: 'sending',
      ...(submission.quotedKudos !== null
        ? { quotedKudos: submission.quotedKudos }
        : {}),
      acknowledged: false,
    };
    this._requests.update((current) => this.sorted([record, ...current]));
    this._clock.set(now);
    await this.persist(record);

    const sent = await firstValueFrom(
      this.aiHorde.submitTextGeneration(submission.apiKey, submission.request),
    );
    if (sent.kind === 'error') {
      this.cancelOnAccept.delete(record.localId);
      await this.patch(record.localId, {
        state: 'refused',
        refusal: sent.error,
        acknowledged: true,
      });
      return { kind: 'sent', localId: record.localId };
    }
    await this.patch(record.localId, {
      hordeId: sent.response.id,
      state: 'queued',
      ...(submission.quotedKudos === null &&
      typeof sent.response.kudos === 'number'
        ? { quotedKudos: sent.response.kudos }
        : {}),
    });
    if (this.cancelOnAccept.delete(record.localId)) {
      await this.cancel(record.localId);
    }
    return { kind: 'sent', localId: record.localId };
  }

  /**
   * Cancel a live request. The horde answers with every take already written,
   * and those are landed like a finished request's. A request still being sent
   * is cancelled as soon as the horde gives it an id.
   */
  public async cancel(localId: string): Promise<void> {
    const request = this.find(localId);
    if (!request || !isLiveTextRequest(request)) return;
    const hordeId = request.hordeId;
    if (!hordeId) {
      this.cancelOnAccept.add(localId);
      return;
    }
    if (this._cancelling().has(localId)) return;
    this.setCancelling(localId, true);
    try {
      const answer = await firstValueFrom(
        this.aiHorde.cancelTextGeneration(hordeId),
      );
      const current = this.find(localId);
      if (!current || !isLiveTextRequest(current)) return;
      if (answer === null) {
        // The horde could not be reached. The request is still running there,
        // so it stays live and the reader can press again.
        return;
      }
      if (answer === GENERATION_NOT_FOUND) {
        await this.patch(localId, {
          state: 'cancelled',
          results: [],
          acknowledged: true,
        });
        this.waitInsights.clear(localId);
        return;
      }
      await this.land(current, answer, 'cancelled', this.now());
    } finally {
      this.setCancelling(localId, false);
    }
  }

  /** Resolves with the request once it is no longer live. */
  public settled(localId: string): Promise<StoredTextRequest> {
    const request = this.find(localId);
    if (request && !isLiveTextRequest(request)) {
      return Promise.resolve(request);
    }
    return new Promise((resolve) => {
      const waiters = this.settleWaiters.get(localId) ?? [];
      waiters.push(resolve);
      this.settleWaiters.set(localId, waiters);
    });
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------

  private async tick(): Promise<void> {
    if (this.ticking) return;
    // A tab nobody is looking at cannot show what a check says. The visibility
    // listener runs a tick as soon as the tab returns, so a request that
    // finished meanwhile is picked up at once.
    if (this.document.visibilityState === 'hidden') return;
    const live = this._requests().filter(isLiveTextRequest);
    if (live.length === 0) return;
    this.ticking = true;
    try {
      const now = this.now();
      this._clock.set(now);
      for (const request of live) {
        if (!request.hordeId) continue;
        if ((this.backoffUntil.get(request.localId) ?? 0) > now) continue;
        const interval = this.onScreen.has(
          textRequestContextKey(request.context),
        )
          ? ON_SCREEN_INTERVAL_MS
          : OFF_SCREEN_INTERVAL_MS;
        if (
          request.lastCheckedAt !== undefined &&
          now - request.lastCheckedAt < interval
        ) {
          continue;
        }
        await this.check(request);
      }
    } finally {
      this.ticking = false;
    }
  }

  private async check(request: StoredTextRequest): Promise<void> {
    const hordeId = request.hordeId;
    if (!hordeId) return;
    const result = await firstValueFrom(
      this.aiHorde.checkTextGenerationResult(hordeId),
    );
    const now = this.now();
    const current = this.find(request.localId);
    // A cancel may have landed while the check was out.
    if (!current || !isLiveTextRequest(current)) return;

    if (result.kind === 'not_found') {
      await this.patch(request.localId, {
        state: 'expired',
        lastCheckedAt: now,
        acknowledged: true,
      });
      this.waitInsights.clear(request.localId);
      return;
    }
    if (result.kind === 'error') {
      if (result.error.status === 429) {
        this.backoffUntil.set(request.localId, now + CHECK_BACKOFF_MS);
      }
      await this.patch(request.localId, { lastCheckedAt: now });
      return;
    }

    const status = result.status;
    this.backoffUntil.delete(request.localId);
    this.waitInsights.recordCheck(request.localId, status, now);
    if (status.faulted) {
      await this.patch(request.localId, {
        state: 'faulted',
        figures: figuresOf(status),
        chargedKudos: status.kudos,
        lastCheckedAt: now,
        response: status,
        acknowledged: true,
      });
      this.waitInsights.clear(request.localId);
      return;
    }
    if (status.done) {
      await this.land(current, status, 'done', now);
      return;
    }
    await this.patch(request.localId, {
      state:
        status.processing > 0 || status.finished > 0 ? 'writing' : 'queued',
      figures: figuresOf(status),
      chargedKudos: status.kudos,
      lastCheckedAt: now,
    });
  }

  /**
   * Write every usable take to the drafts store and close the request. Draft
   * ids are derived from the horde id and the take, so landing the same
   * request twice (a reload between the write and the close) overwrites
   * rather than duplicates.
   */
  private async land(
    request: StoredTextRequest,
    status: TextGenerationStatusResponse,
    state: 'done' | 'cancelled',
    now: number,
  ): Promise<void> {
    const hordeId = request.hordeId ?? request.localId;
    // A verdict is prose, not a prompt: it is kept as the model wrote it
    // rather than being cut down to its first line.
    const judging = draftRole(request.input) === 'judge';
    const read = status.generations.map((generation) => ({
      generation,
      ...(judging
        ? {
            text: cleanJudgement(generation.text),
            negative: '',
            changes: [] as PromptDraftChange[],
          }
        : cleanDraft(generation.text)),
    }));
    const cleaned = read.filter((take) => take.text.length > 0);

    if (state === 'done' && cleaned.length === 0) {
      // Nothing came back to read. That is neither the horde's own fault flag
      // nor a request that went wrong: a worker can answer with blank text,
      // and a filter can hold an answer back. Either way what did arrive is
      // kept, so the reason can be shown and a retry can go elsewhere.
      await this.patch(request.localId, {
        state: 'empty',
        figures: figuresOf(status),
        chargedKudos: status.kudos,
        lastCheckedAt: now,
        results: read.map((take, index) =>
          emptyTake(take.generation, `${hordeId}-${index}`, request),
        ),
        response: status,
        acknowledged: true,
      });
      this.waitInsights.clear(request.localId);
      return;
    }

    const takes: TextRequestTake[] = [];
    for (const [index, take] of cleaned.entries()) {
      const draftId = `${hordeId}-${index}`;
      const model = take.generation.model ?? request.modelLabel ?? '';
      const seed = take.generation.seed ?? null;
      try {
        await this.drafts.put({
          id: draftId,
          createdAt: now,
          origin: request.origin,
          input: request.input,
          pick: request.pick,
          model,
          seed,
          kudos: status.kudos,
          anonymous: request.anonymous,
          text: take.text,
          ...(take.negative ? { negative: take.negative } : {}),
          requestId: hordeId,
          takeIndex: index,
          ...(request.styleId ? { style: request.styleId } : {}),
        });
      } catch {
        // The drafts store is a convenience beside the answer. A store that
        // will not take the record must not cost the reader the words they
        // waited for, which stay on the request.
      }
      takes.push({
        draftId,
        text: take.text,
        negative: take.negative,
        rawText: take.generation.text,
        ...(take.changes.length > 0 ? { changes: take.changes } : {}),
        model,
        seed,
        ...workerOf(take.generation),
      });
    }
    await this.patch(request.localId, {
      state,
      figures: figuresOf(status),
      chargedKudos: status.kudos,
      lastCheckedAt: now,
      results: takes,
      response: status,
      acknowledged: true,
    });
    this.waitInsights.clear(request.localId);
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  private find(localId: string): StoredTextRequest | undefined {
    return this._requests().find((request) => request.localId === localId);
  }

  private sorted(requests: StoredTextRequest[]): StoredTextRequest[] {
    return requests.sort((a, b) => b.createdAt - a.createdAt);
  }

  private async patch(
    localId: string,
    changes: Partial<Omit<StoredTextRequest, 'localId'>>,
  ): Promise<void> {
    const current = this.find(localId);
    if (!current) return;
    const updated: StoredTextRequest = {
      ...current,
      ...changes,
      updatedAt: this.now(),
    };
    this._requests.update((requests) =>
      requests.map((request) =>
        request.localId === localId ? updated : request,
      ),
    );
    if (!isLiveTextRequest(updated)) {
      this.backoffUntil.delete(localId);
      const waiters = this.settleWaiters.get(localId) ?? [];
      this.settleWaiters.delete(localId);
      for (const resolve of waiters) resolve(updated);
    }
    await this.persist(updated);
  }

  private async persist(request: StoredTextRequest): Promise<void> {
    try {
      await this.db.put(request);
    } catch (error) {
      // The request carries on in memory; only a reload would lose it.
      console.warn('Failed to keep a text request:', error);
    }
  }

  private setCancelling(localId: string, on: boolean): void {
    this._cancelling.update((current) => {
      const next = new Set(current);
      if (on) next.add(localId);
      else next.delete(localId);
      return next;
    });
  }

  private now(): number {
    return Date.now();
  }
}
