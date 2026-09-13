import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import {
  MAX_LIVE_PER_CONTEXT,
  TextGenerationQueueService,
  TextRequestSubmission,
} from './text-generation-queue.service';
import {
  StoredTextRequest,
  TextGenerationDbService,
} from './text-generation-db.service';
import { PromptDraftDbService } from './prompt-draft-db.service';
import type { StoredPromptDraft } from './prompt-draft-db.service';
import { AiHordeService } from './ai-horde.service';
import { GenerationWaitInsightsService } from './generation-wait-insights.service';
import {
  CheckTextResult,
  GENERATION_NOT_FOUND,
  SubmitTextGenerationResult,
  TextGenerationStatusResponse,
} from '../types/generation';

const TICK_MS = 1_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Minimal in-memory stand-in for the requests store. */
class FakeTextDb {
  public readonly requests = new Map<string, StoredTextRequest>();

  put(request: StoredTextRequest): Promise<void> {
    this.requests.set(request.localId, structuredClone(request));
    return Promise.resolve();
  }
  get(localId: string): Promise<StoredTextRequest | undefined> {
    return Promise.resolve(this.requests.get(localId));
  }
  list(): Promise<StoredTextRequest[]> {
    return Promise.resolve(
      [...this.requests.values()].sort((a, b) => b.createdAt - a.createdAt),
    );
  }
  remove(localId: string): Promise<void> {
    this.requests.delete(localId);
    return Promise.resolve();
  }
}

/** Minimal in-memory stand-in for the drafts store. */
class FakeDraftsDb {
  public readonly drafts = new Map<string, StoredPromptDraft>();

  put(draft: StoredPromptDraft): Promise<void> {
    this.drafts.set(draft.id, draft);
    return Promise.resolve();
  }
}

interface AiHordeMock {
  submitTextGeneration: ReturnType<typeof vi.fn>;
  checkTextGenerationResult: ReturnType<typeof vi.fn>;
  cancelTextGeneration: ReturnType<typeof vi.fn>;
}

function status(
  overrides: Partial<TextGenerationStatusResponse> = {},
): TextGenerationStatusResponse {
  return {
    finished: 0,
    processing: 0,
    restarted: 0,
    waiting: 1,
    done: false,
    faulted: false,
    wait_time: 90,
    queue_position: 4,
    kudos: 1,
    is_possible: true,
    generations: [],
    ...overrides,
  };
}

function checked(overrides: Partial<TextGenerationStatusResponse> = {}) {
  return of<CheckTextResult>({ kind: 'success', status: status(overrides) });
}

function take(text: string, seed = 1) {
  return {
    text,
    model: 'm/1',
    seed,
    state: 'ok',
    worker_id: 'w',
    worker_name: 'W',
  };
}

function submission(
  overrides: Partial<TextRequestSubmission> = {},
): TextRequestSubmission {
  return {
    context: { kind: 'studio' },
    origin: 'studio',
    input: { prompt: 'a dog' },
    pick: 'auto',
    styleId: null,
    takes: 1,
    anonymous: true,
    modelLabel: 'm/1',
    apiKey: '0000000000',
    request: { prompt: 'the body', slow_workers: true },
    quotedKudos: 3,
    ...overrides,
  };
}

function kept(overrides: Partial<StoredTextRequest>): StoredTextRequest {
  return {
    localId: 'kept-1',
    hordeId: 'h-kept',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    context: { kind: 'studio' },
    origin: 'studio',
    input: { prompt: 'a dog' },
    pick: 'auto',
    takes: 1,
    anonymous: true,
    modelLabel: 'm/1',
    request: { prompt: 'the body' },
    state: 'queued',
    acknowledged: false,
    ...overrides,
  };
}

describe('TextGenerationQueueService', () => {
  let textDb: FakeTextDb;
  let draftsDb: FakeDraftsDb;
  let aiHorde: AiHordeMock;

  beforeEach(() => {
    vi.useFakeTimers();
    textDb = new FakeTextDb();
    draftsDb = new FakeDraftsDb();
    aiHorde = {
      submitTextGeneration: vi.fn(() =>
        of<SubmitTextGenerationResult>({
          kind: 'success',
          response: { id: 'h1', kudos: 2 },
        }),
      ),
      checkTextGenerationResult: vi.fn(() => checked()),
      cancelTextGeneration: vi.fn(() => of(null)),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: TextGenerationDbService, useValue: textDb },
        { provide: PromptDraftDbService, useValue: draftsDb },
        { provide: AiHordeService, useValue: aiHorde },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    setVisibility('visible');
  });

  /** jsdom has no page lifecycle, so the state the loop reads is set directly. */
  function setVisibility(state: DocumentVisibilityState): void {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    });
  }

  async function createQueue(): Promise<TextGenerationQueueService> {
    const queue = TestBed.inject(TextGenerationQueueService);
    await queue.whenReady();
    return queue;
  }

  function only(queue: TextGenerationQueueService): StoredTextRequest {
    const request = queue.requests().at(0);
    if (!request) throw new Error('no request kept');
    return request;
  }

  it('keeps a sent request and moves it to queued once the horde accepts it', async () => {
    const queue = await createQueue();
    const sent = await queue.submit(submission());

    expect(sent.kind).toBe('sent');
    expect(aiHorde.submitTextGeneration).toHaveBeenCalledWith('0000000000', {
      prompt: 'the body',
      slow_workers: true,
    });
    const request = only(queue);
    expect(request).toMatchObject({
      hordeId: 'h1',
      state: 'queued',
      quotedKudos: 3,
    });
    expect(textDb.requests.get(request.localId)?.state).toBe('queued');
    // The key is used for the send and never kept.
    expect(JSON.stringify([...textDb.requests.values()])).not.toContain(
      '0000000000',
    );
  });

  it('reports a refusal as the horde worded it', async () => {
    aiHorde.submitTextGeneration.mockReturnValue(
      of<SubmitTextGenerationResult>({
        kind: 'error',
        error: { status: 400, message: 'No workers', rc: 'NoWorkers' },
      }),
    );
    const queue = await createQueue();
    await queue.submit(submission());

    expect(only(queue)).toMatchObject({
      state: 'refused',
      refusal: { status: 400, message: 'No workers' },
    });
  });

  it('follows the status from queued to writing to done, and lands every take', async () => {
    const queue = await createQueue();
    await queue.submit(
      submission({
        takes: 2,
        input: { prompt: 'a dog' },
        styleId: 's1',
        origin: 'studio',
      }),
    );

    aiHorde.checkTextGenerationResult.mockReturnValue(
      checked({ queue_position: 3, wait_time: 40 }),
    );
    await vi.advanceTimersByTimeAsync(TICK_MS);
    expect(only(queue)).toMatchObject({
      state: 'queued',
      figures: { queuePosition: 3, waitTime: 40 },
    });

    aiHorde.checkTextGenerationResult.mockReturnValue(
      checked({ processing: 1, finished: 1, waiting: 0 }),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(only(queue)).toMatchObject({
      state: 'writing',
      figures: { finished: 1 },
    });

    aiHorde.checkTextGenerationResult.mockReturnValue(
      checked({
        done: true,
        finished: 2,
        waiting: 0,
        kudos: 6,
        generations: [
          take('Prompt: a dog on a couch\nNegative: blurry', 11),
          take('a dog in a field', 12),
        ],
      }),
    );
    await vi.advanceTimersByTimeAsync(10_000);

    const request = only(queue);
    expect(request).toMatchObject({
      state: 'done',
      chargedKudos: 6,
      acknowledged: true,
    });
    expect(request.results?.map((result) => result.text)).toEqual([
      'a dog on a couch',
      'a dog in a field',
    ]);
    const drafts = [...draftsDb.drafts.values()];
    expect(drafts).toHaveLength(2);
    expect(drafts.at(0)).toMatchObject({
      requestId: 'h1',
      takeIndex: 0,
      origin: 'studio',
      model: 'm/1',
      seed: 11,
      kudos: 6,
      anonymous: true,
      text: 'a dog on a couch',
      negative: 'blurry',
      style: 's1',
      input: { prompt: 'a dog' },
      pick: 'auto',
    });
    expect(drafts.at(1)).toMatchObject({ takeIndex: 1, seed: 12 });
  });

  it('keeps a verdict as the model wrote it, line breaks and all', async () => {
    aiHorde.checkTextGenerationResult.mockReturnValue(
      checked({
        done: true,
        generations: [
          take(' Matches: nothing.\nMissing: the dog.\nTry: say dog. '),
        ],
      }),
    );
    const queue = await createQueue();
    await queue.submit(
      submission({
        input: { role: 'judge', prompt: 'a dog', caption: 'a cat' },
      }),
    );
    await vi.advanceTimersByTimeAsync(TICK_MS);

    expect(only(queue).results?.at(0)?.text).toBe(
      'Matches: nothing.\nMissing: the dog.\nTry: say dog.',
    );
  });

  it('files a request that came back with nothing as empty, with the reason and the worker', async () => {
    aiHorde.checkTextGenerationResult.mockReturnValue(
      checked({ done: true, generations: [take('   ')] }),
    );
    const queue = await createQueue();
    await queue.submit(submission());
    await vi.advanceTimersByTimeAsync(TICK_MS);

    const request = only(queue);
    expect(request.state).toBe('empty');
    expect(request.results).toEqual([
      {
        draftId: 'h1-0',
        text: '',
        negative: '',
        rawText: '   ',
        reason: 'blank',
        model: 'm/1',
        seed: 1,
        workerId: 'w',
        workerName: 'W',
      },
    ]);
    expect(draftsDb.drafts.size).toBe(0);
  });

  it('tells an answer a filter held back from one a worker left blank', async () => {
    aiHorde.checkTextGenerationResult.mockReturnValue(
      checked({
        done: true,
        generations: [{ ...take(''), state: 'censored' }],
      }),
    );
    const queue = await createQueue();
    await queue.submit(submission());
    await vi.advanceTimersByTimeAsync(TICK_MS);

    expect(only(queue).state).toBe('empty');
    expect(only(queue).results?.at(0)?.reason).toBe('censored');
  });

  it('keeps the answer the horde sent, word for word, on every request that got one', async () => {
    const answer = status({
      done: true,
      finished: 1,
      kudos: 6,
      generations: [take('a dog on a couch')],
    });
    aiHorde.checkTextGenerationResult.mockReturnValue(
      of<CheckTextResult>({ kind: 'success', status: answer }),
    );
    const queue = await createQueue();
    await queue.submit(submission());
    await vi.advanceTimersByTimeAsync(TICK_MS);

    const request = only(queue);
    expect(request.response).toEqual(answer);
    expect(request.results?.at(0)).toMatchObject({
      text: 'a dog on a couch',
      rawText: 'a dog on a couch',
      workerId: 'w',
    });
  });

  it('keeps the answer on a faulted request too', async () => {
    aiHorde.checkTextGenerationResult.mockReturnValue(
      checked({ faulted: true, kudos: 2 }),
    );
    const queue = await createQueue();
    await queue.submit(submission());
    await vi.advanceTimersByTimeAsync(TICK_MS);

    expect(only(queue)).toMatchObject({
      state: 'faulted',
      response: { faulted: true, kudos: 2 },
    });
  });

  it('lists what cleaning changed on a take', async () => {
    aiHorde.checkTextGenerationResult.mockReturnValue(
      checked({
        done: true,
        generations: [
          take('<think>hmm</think>\nPrompt: a dog on a couch, soft light'),
        ],
      }),
    );
    const queue = await createQueue();
    await queue.submit(submission());
    await vi.advanceTimersByTimeAsync(TICK_MS);

    expect(only(queue).results?.at(0)).toMatchObject({
      text: 'a dog on a couch, soft light',
      rawText: '<think>hmm</think>\nPrompt: a dog on a couch, soft light',
      changes: ['think_removed', 'label_stripped'],
    });
  });

  it('marks a request the horde no longer knows as expired', async () => {
    aiHorde.checkTextGenerationResult.mockReturnValue(
      of<CheckTextResult>({ kind: 'not_found' }),
    );
    const queue = await createQueue();
    await queue.submit(submission());
    await vi.advanceTimersByTimeAsync(TICK_MS);

    expect(only(queue).state).toBe('expired');
  });

  it('marks a faulted request as faulted', async () => {
    aiHorde.checkTextGenerationResult.mockReturnValue(
      checked({ faulted: true }),
    );
    const queue = await createQueue();
    await queue.submit(submission());
    await vi.advanceTimersByTimeAsync(TICK_MS);

    expect(only(queue).state).toBe('faulted');
  });

  it('keeps the takes a cancel answers with', async () => {
    aiHorde.cancelTextGeneration.mockReturnValue(
      of(
        status({
          done: true,
          finished: 1,
          waiting: 0,
          kudos: 4,
          generations: [take('a dog on a couch')],
        }),
      ),
    );
    const queue = await createQueue();
    await queue.submit(submission({ takes: 3 }));
    const localId = only(queue).localId;

    await queue.cancel(localId);

    expect(aiHorde.cancelTextGeneration).toHaveBeenCalledWith('h1');
    const request = only(queue);
    expect(request).toMatchObject({
      state: 'cancelled',
      chargedKudos: 4,
      acknowledged: true,
    });
    expect(request.results?.map((result) => result.text)).toEqual([
      'a dog on a couch',
    ]);
    expect(draftsDb.drafts.size).toBe(1);
  });

  it('marks a cancel of a request already gone as cancelled with nothing kept', async () => {
    aiHorde.cancelTextGeneration.mockReturnValue(of(GENERATION_NOT_FOUND));
    const queue = await createQueue();
    await queue.submit(submission());

    await queue.cancel(only(queue).localId);

    expect(only(queue)).toMatchObject({ state: 'cancelled', results: [] });
  });

  it('leaves a request live when the cancel cannot reach the horde', async () => {
    const queue = await createQueue();
    await queue.submit(submission());

    await queue.cancel(only(queue).localId);

    expect(only(queue).state).toBe('queued');
  });

  it('picks up kept live requests after a restart and follows them to done', async () => {
    const lastChecked = Date.now() - 30 * 60 * 1000;
    await textDb.put(
      kept({ localId: 'r1', hordeId: 'h-r1', lastCheckedAt: lastChecked }),
    );
    aiHorde.checkTextGenerationResult.mockReturnValue(
      checked({ done: true, generations: [take('a dog')] }),
    );

    const queue = await createQueue();
    expect(only(queue).state).toBe('queued');
    await vi.advanceTimersByTimeAsync(TICK_MS);

    expect(aiHorde.checkTextGenerationResult).toHaveBeenCalledWith('h-r1');
    expect(only(queue).state).toBe('done');
    expect(draftsDb.drafts.get('h-r1-0')?.text).toBe('a dog');
  });

  it('ends a kept request that was still being sent, since it cannot be followed', async () => {
    await textDb.put(
      kept({ localId: 'r2', hordeId: undefined, state: 'sending' }),
    );

    const queue = await createQueue();

    expect(only(queue)).toMatchObject({
      state: 'faulted',
      errorKey: 'prompt_draft.queue.lost',
    });
    expect(textDb.requests.get('r2')?.state).toBe('faulted');
  });

  it('backs a request off for fifteen seconds after a 429', async () => {
    aiHorde.checkTextGenerationResult.mockReturnValue(
      of<CheckTextResult>({
        kind: 'error',
        error: { status: 429, message: 'slow down' },
      }),
    );
    const queue = await createQueue();
    const release = queue.watch({ kind: 'studio' });
    await queue.submit(submission());

    await vi.advanceTimersByTimeAsync(TICK_MS);
    expect(aiHorde.checkTextGenerationResult).toHaveBeenCalledTimes(1);

    // An open card would be checked every three seconds; the backoff holds it.
    await vi.advanceTimersByTimeAsync(13_000);
    expect(aiHorde.checkTextGenerationResult).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(aiHorde.checkTextGenerationResult).toHaveBeenCalledTimes(2);
    release();
  });

  it('checks every three seconds while a card is open and every ten otherwise', async () => {
    const queue = await createQueue();
    await queue.submit(submission());
    await vi.advanceTimersByTimeAsync(TICK_MS);
    expect(aiHorde.checkTextGenerationResult).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(9_000);
    expect(aiHorde.checkTextGenerationResult).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(aiHorde.checkTextGenerationResult).toHaveBeenCalledTimes(2);

    const release = queue.watch({ kind: 'studio' });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(aiHorde.checkTextGenerationResult).toHaveBeenCalledTimes(3);
    release();
  });

  it('checks nothing while the tab is hidden', async () => {
    const queue = await createQueue();
    await queue.submit(submission());
    setVisibility('hidden');

    await vi.advanceTimersByTimeAsync(30_000);
    expect(aiHorde.checkTextGenerationResult).not.toHaveBeenCalled();

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(aiHorde.checkTextGenerationResult).toHaveBeenCalledTimes(1);
  });

  it('lands takes when no card is open to show them', async () => {
    aiHorde.checkTextGenerationResult.mockReturnValue(
      checked({ done: true, generations: [take('a dog')] }),
    );
    const queue = await createQueue();
    await queue.submit(
      submission({ context: { kind: 'alchemy', jobId: 'j1' } }),
    );
    await vi.advanceTimersByTimeAsync(TICK_MS);

    expect(only(queue).state).toBe('done');
    expect(draftsDb.drafts.size).toBe(1);
  });

  describe('live requests per context', () => {
    it('allows one at a time, and asks rather than sending a second', async () => {
      expect(MAX_LIVE_PER_CONTEXT).toBe(1);
      const queue = await createQueue();
      await queue.submit(submission());

      const second = await queue.submit(submission());

      expect(second.kind).toBe('busy');
      expect(aiHorde.submitTextGeneration).toHaveBeenCalledTimes(1);
      expect(queue.requests()).toHaveLength(1);
    });

    it('leaves other contexts free', async () => {
      const queue = await createQueue();
      await queue.submit(submission());

      const other = await queue.submit(
        submission({ context: { kind: 'alchemy', jobId: 'j1' } }),
      );

      expect(other.kind).toBe('sent');
      expect(queue.requestsFor({ kind: 'studio' })()).toHaveLength(1);
      expect(
        queue.requestsFor({ kind: 'alchemy', jobId: 'j1' })(),
      ).toHaveLength(1);
      expect(
        queue.requestsFor({ kind: 'alchemy', jobId: 'j2' })(),
      ).toHaveLength(0);
    });

    it('cancels the waiting request and sends when asked to replace it', async () => {
      aiHorde.cancelTextGeneration.mockReturnValue(of(status()));
      const queue = await createQueue();
      await queue.submit(submission());
      aiHorde.submitTextGeneration.mockReturnValue(
        of<SubmitTextGenerationResult>({
          kind: 'success',
          response: { id: 'h2', kudos: 2 },
        }),
      );

      const second = await queue.submit(submission(), { replace: true });

      expect(second.kind).toBe('sent');
      expect(aiHorde.cancelTextGeneration).toHaveBeenCalledWith('h1');
      const list = queue.requestsFor({ kind: 'studio' })();
      expect(list.map((request) => request.state)).toEqual([
        'queued',
        'cancelled',
      ]);
      expect(list.at(0)?.hordeId).toBe('h2');
    });

    it('holds and lists several live requests in one context, newest first', async () => {
      const now = Date.now();
      await textDb.put(
        kept({ localId: 'old', hordeId: 'h-old', createdAt: now - 5_000 }),
      );
      await textDb.put(
        kept({ localId: 'new', hordeId: 'h-new', createdAt: now }),
      );

      const queue = await createQueue();

      expect(
        queue
          .requestsFor({ kind: 'studio' })()
          .map((request) => request.localId),
      ).toEqual(['new', 'old']);
      await vi.advanceTimersByTimeAsync(TICK_MS);
      expect(aiHorde.checkTextGenerationResult).toHaveBeenCalledWith('h-old');
      expect(aiHorde.checkTextGenerationResult).toHaveBeenCalledWith('h-new');
    });
  });

  it('removes finished requests older than a day on start, and keeps the rest', async () => {
    const now = Date.now();
    await textDb.put(
      kept({
        localId: 'stale-done',
        state: 'done',
        updatedAt: now - DAY_MS - 1,
        acknowledged: true,
      }),
    );
    await textDb.put(
      kept({
        localId: 'stale-refused',
        state: 'refused',
        updatedAt: now - DAY_MS - 1,
      }),
    );
    await textDb.put(
      kept({
        localId: 'fresh-expired',
        state: 'expired',
        updatedAt: now - 1_000,
      }),
    );
    await textDb.put(
      kept({
        localId: 'old-live',
        state: 'queued',
        updatedAt: now - 2 * DAY_MS,
      }),
    );

    const queue = await createQueue();

    expect([...textDb.requests.keys()].sort()).toEqual([
      'fresh-expired',
      'old-live',
    ]);
    expect(
      queue
        .requests()
        .map((request) => request.localId)
        .sort(),
    ).toEqual(['fresh-expired', 'old-live']);
  });

  it('resolves a settled wait once the request finishes', async () => {
    aiHorde.checkTextGenerationResult.mockReturnValue(
      checked({ done: true, generations: [take('a dog')] }),
    );
    const queue = await createQueue();
    const sent = await queue.submit(submission());
    if (sent.kind !== 'sent') throw new Error('not sent');

    const settled = queue.settled(sent.localId);
    await vi.advanceTimersByTimeAsync(TICK_MS);

    await expect(settled).resolves.toMatchObject({ state: 'done' });
  });

  it('records each check for the wait trend under the request id', async () => {
    const insights = TestBed.inject(GenerationWaitInsightsService);
    const queue = await createQueue();
    const release = queue.watch({ kind: 'studio' });
    await queue.submit(submission());
    const localId = only(queue).localId;

    aiHorde.checkTextGenerationResult.mockReturnValue(
      checked({ queue_position: 9 }),
    );
    await vi.advanceTimersByTimeAsync(TICK_MS);
    aiHorde.checkTextGenerationResult.mockReturnValue(
      checked({ queue_position: 5 }),
    );
    await vi.advanceTimersByTimeAsync(3_000);

    expect(insights.trendFor(localId)).toBe('improved');
    release();
  });
});
