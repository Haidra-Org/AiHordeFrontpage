import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { GenerationQueueService } from './generation-queue.service';
import { GenerationDbService } from './generation-db.service';
import { AiHordeService } from './ai-horde.service';
import { AuthService } from './auth.service';
import {
  CheckImageResult,
  GenerationStatusResponse,
  SubmitImageResult,
} from '../types/generation';
import { LocalGenerationJob, StoredJobImage } from '../types/generation-job';
import {
  FakeBroadcastChannel,
  openPeerChannel,
  postFromPeer,
} from '../testing/fake-broadcast-channel';

const DISPATCH_TICK_MS = 1_000;
const POLL_TICK_MS = 2_000;

/** Minimal in-memory stand-in for the IndexedDB persistence layer. */
class FakeGenerationDb {
  public readonly jobs = new Map<string, LocalGenerationJob>();
  public readonly images = new Map<string, StoredJobImage>();

  private imageKey(localId: string, imageId: string): string {
    return `${localId}::${imageId}`;
  }

  putJob(job: LocalGenerationJob): Promise<void> {
    this.jobs.set(job.localId, job);
    return Promise.resolve();
  }
  getJob(localId: string): Promise<LocalGenerationJob | undefined> {
    return Promise.resolve(this.jobs.get(localId));
  }
  listJobs(): Promise<LocalGenerationJob[]> {
    return Promise.resolve(
      [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt),
    );
  }
  async listJobsByStatus(status: string): Promise<LocalGenerationJob[]> {
    return (await this.listJobs()).filter((job) => job.status === status);
  }
  async listJobsByRecency(limit: number): Promise<LocalGenerationJob[]> {
    return (await this.listJobs()).slice(0, limit);
  }
  putImage(image: StoredJobImage): Promise<void> {
    this.images.set(this.imageKey(image.localId, image.imageId), image);
    return Promise.resolve();
  }
  getImage(
    localId: string,
    imageId: string,
  ): Promise<StoredJobImage | undefined> {
    return Promise.resolve(this.images.get(this.imageKey(localId, imageId)));
  }
  getImagesForJob(localId: string): Promise<StoredJobImage[]> {
    return Promise.resolve(
      [...this.images.values()].filter((image) => image.localId === localId),
    );
  }
  deleteJobCascade(localId: string): Promise<void> {
    this.jobs.delete(localId);
    for (const [key, image] of this.images) {
      if (image.localId === localId) {
        this.images.delete(key);
      }
    }
    return Promise.resolve();
  }
  clearAll(): Promise<void> {
    this.jobs.clear();
    this.images.clear();
    return Promise.resolve();
  }
  pruneFinishedJobs(): Promise<void> {
    // Not exercised here; the real implementation is covered in the DB spec.
    return Promise.resolve();
  }
}

interface AiHordeMock {
  submitImageGenerationResult: ReturnType<typeof vi.fn>;
  checkImageGenerationResult: ReturnType<typeof vi.fn>;
  getImageGenerationStatus: ReturnType<typeof vi.fn>;
  cancelImageGeneration: ReturnType<typeof vi.fn>;
}

function submitSuccess(id: string, kudos = 1): SubmitImageResult {
  return { kind: 'success', response: { id, kudos } };
}

function checkResult(
  overrides: Partial<CheckImageResult & { check: unknown }> = {},
): CheckImageResult {
  return {
    kind: 'success',
    check: {
      finished: 0,
      processing: 1,
      restarted: 0,
      waiting: 0,
      done: false,
      faulted: false,
      wait_time: 5,
      queue_position: 2,
      kudos: 3,
      is_possible: true,
      ...(overrides as { check?: object }).check,
    },
  } as CheckImageResult;
}

function doneStatus(): GenerationStatusResponse {
  return {
    finished: 1,
    processing: 0,
    restarted: 0,
    waiting: 0,
    done: true,
    faulted: false,
    wait_time: 0,
    queue_position: 0,
    kudos: 7,
    is_possible: true,
    generations: [
      {
        // Bare base64 payload ("hello") so no network fetch is needed.
        img: 'aGVsbG8=',
        seed: '42',
        id: 'out-1',
        censored: false,
        model: 'sd',
        state: 'ok',
        worker_id: 'w1',
        worker_name: 'W1',
      },
    ],
  };
}

describe('GenerationQueueService', () => {
  let fakeDb: FakeGenerationDb;
  let aiHorde: AiHordeMock;
  let auth: { getStoredApiKey: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    FakeBroadcastChannel.reset();
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    fakeDb = new FakeGenerationDb();
    aiHorde = {
      submitImageGenerationResult: vi.fn(() => of(submitSuccess('horde-id'))),
      checkImageGenerationResult: vi.fn(() => of(checkResult())),
      getImageGenerationStatus: vi.fn(() => of(null)),
      cancelImageGeneration: vi.fn(() => of(null)),
    };
    auth = { getStoredApiKey: vi.fn(() => 'test-key') };

    TestBed.configureTestingModule({
      providers: [
        GenerationQueueService,
        { provide: GenerationDbService, useValue: fakeDb },
        { provide: AiHordeService, useValue: aiHorde },
        { provide: AuthService, useValue: auth },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setVisibility('visible');
  });

  /** jsdom has no page lifecycle, so the state the loops read is set directly. */
  function setVisibility(state: DocumentVisibilityState): void {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    });
  }

  async function createQueue(): Promise<GenerationQueueService> {
    const queue = TestBed.inject(GenerationQueueService);
    await queue.whenReady();
    return queue;
  }

  it('persists an enqueued job as waiting without submitting', async () => {
    const queue = await createQueue();

    const localId = await queue.enqueue({ prompt: 'a cat' });

    expect(fakeDb.jobs.get(localId)?.status).toBe('waiting');
    expect(queue.pendingJobs().some((job) => job.localId === localId)).toBe(
      true,
    );
    expect(aiHorde.submitImageGenerationResult).not.toHaveBeenCalled();
  });

  it('strips base64 source data from the stored request', async () => {
    const queue = await createQueue();

    const localId = await queue.enqueue(
      {
        prompt: 'a cat',
        source_image: 'BIGBASE64',
        source_processing: 'img2img',
      },
      [{ kind: 'source', blob: new Blob(['x']), mimeType: 'image/webp' }],
    );

    const stored = fakeDb.jobs.get(localId);
    expect(stored?.request.source_image).toBeUndefined();
    expect(stored?.request.source_processing).toBe('img2img');
    expect(await queue.getJobImages(localId)).toHaveLength(1);
  });

  it('dispatches a waiting job and transitions it to requested', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of(submitSuccess('h1', 5)),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);

    const job = queue.jobs()[0];
    expect(job.status).toBe('requested');
    expect(job.hordeId).toBe('h1');
    expect(job.kudos).toBe(5);
    expect(aiHorde.submitImageGenerationResult).toHaveBeenCalledWith(
      'test-key',
      expect.objectContaining({ prompt: 'a cat' }),
    );
  });

  it('rehydrates source blobs into base64 at submit time', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of(submitSuccess('h1')),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat', source_processing: 'img2img' }, [
      { kind: 'source', blob: new Blob(['hello']), mimeType: 'image/webp' },
    ]);

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);

    const submittedRequest =
      aiHorde.submitImageGenerationResult.mock.calls[0][1];
    // "hello" encoded as base64.
    expect(submittedRequest.source_image).toBe('aGVsbG8=');
  });

  it('rehydrates remix extras into ordered extra_source_images', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of(submitSuccess('h1')),
    );
    const queue = await createQueue();
    const localId = await queue.enqueue(
      {
        prompt: 'a cat',
        source_processing: 'remix',
        extra_source_images: [{ image: 'BIGBASE64' }],
      },
      [
        { kind: 'source', blob: new Blob(['hello']), mimeType: 'image/webp' },
        {
          kind: 'extra_source',
          blob: new Blob(['hello']),
          mimeType: 'image/webp',
          strength: 0.5,
        },
        {
          kind: 'extra_source',
          blob: new Blob(['hello']),
          mimeType: 'image/webp',
        },
      ],
    );

    expect(
      fakeDb.jobs.get(localId)?.request.extra_source_images,
    ).toBeUndefined();

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);

    const submittedRequest =
      aiHorde.submitImageGenerationResult.mock.calls[0][1];
    expect(submittedRequest.extra_source_images).toEqual([
      { image: 'aGVsbG8=', strength: 0.5 },
      { image: 'aGVsbG8=' },
    ]);
  });

  it('sends no extra_source_images when none were attached', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of(submitSuccess('h1')),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);

    expect(
      aiHorde.submitImageGenerationResult.mock.calls[0][1].extra_source_images,
    ).toBeUndefined();
  });

  it('respects the concurrency cap, leaving overflow jobs waiting', async () => {
    let counter = 0;
    aiHorde.submitImageGenerationResult.mockImplementation(() =>
      of(submitSuccess(`h${counter++}`)),
    );
    const queue = await createQueue();
    for (let i = 0; i < 6; i++) {
      await queue.enqueue({ prompt: `p${i}` });
    }

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);

    const requested = queue.jobs().filter((job) => job.status === 'requested');
    const waiting = queue.jobs().filter((job) => job.status === 'waiting');
    expect(requested).toHaveLength(5);
    expect(waiting).toHaveLength(1);
    expect(aiHorde.submitImageGenerationResult).toHaveBeenCalledTimes(5);
  });

  it('fetches status and stores result blobs when a job finishes', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of(submitSuccess('h1')),
    );
    aiHorde.checkImageGenerationResult.mockReturnValue(
      of(checkResult({ check: { done: true, processing: 0 } })),
    );
    aiHorde.getImageGenerationStatus.mockReturnValue(of(doneStatus()));
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
    await vi.advanceTimersByTimeAsync(POLL_TICK_MS);

    const job = queue.jobs()[0];
    expect(job.status).toBe('done');
    expect(job.kudos).toBe(7);
    expect(job.resultImageIds).toEqual(['out-1']);
    expect(aiHorde.getImageGenerationStatus).toHaveBeenCalledWith('h1');

    const images = await queue.getJobImages(job.localId);
    const result = images.find((image) => image.imageId === 'out-1');
    expect(result?.kind).toBe('result');
    expect(result?.metadata?.seed).toBe('42');
    expect(await result?.blob.text()).toBe('hello');
  });

  it('drops CSAM filter images and records a notice instead', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of(submitSuccess('h1')),
    );
    aiHorde.checkImageGenerationResult.mockReturnValue(
      of(checkResult({ check: { done: true, processing: 0 } })),
    );
    const status = doneStatus();
    status.generations[0] = {
      ...status.generations[0],
      censored: true,
      state: 'censored',
      gen_metadata: [{ type: 'censorship', value: 'csam' }],
    };
    aiHorde.getImageGenerationStatus.mockReturnValue(of(status));
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
    await vi.advanceTimersByTimeAsync(POLL_TICK_MS);

    const job = queue.jobs()[0];
    expect(job.status).toBe('done');
    expect(job.resultImageIds).toEqual([]);
    expect(job.csamCensoredCount).toBe(1);
    expect(await queue.getJobImages(job.localId)).toEqual([]);
  });

  it('maps in-flight check counts onto the job status', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of(submitSuccess('h1')),
    );
    aiHorde.checkImageGenerationResult.mockReturnValue(
      of(
        checkResult({
          check: {
            finished: 1,
            processing: 1,
            waiting: 2,
            restarted: 3,
            queue_position: 4,
            wait_time: 9,
            eligible_workers: 2,
            eligible_worker_threads: 5,
            might_stall: true,
          },
        }),
      ),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
    await vi.advanceTimersByTimeAsync(POLL_TICK_MS);

    const job = queue.jobs()[0];
    expect(job.status).toBe('processing');
    expect(job.queuePosition).toBe(4);
    expect(job.waitTime).toBe(9);
    expect(job.finishedCount).toBe(1);
    expect(job.processingCount).toBe(1);
    expect(job.waitingCount).toBe(2);
    expect(job.restartedCount).toBe(3);
    expect(job.eligibleWorkers).toBe(2);
    expect(job.eligibleWorkerThreads).toBe(5);
    expect(job.mightStall).toBe(true);
  });

  it('backs off submits after a 429 and does not immediately resubmit', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of<SubmitImageResult>({
        kind: 'error',
        error: { status: 429, message: 'Too Many Requests' },
      }),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
    expect(queue.jobs()[0].status).toBe('waiting');
    expect(aiHorde.submitImageGenerationResult).toHaveBeenCalledTimes(1);

    // Next tick is inside the 15s backoff window: no new attempt.
    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
    expect(aiHorde.submitImageGenerationResult).toHaveBeenCalledTimes(1);
  });

  it('says a 429 is holding a job back, with when it is tried again', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of<SubmitImageResult>({
        kind: 'error',
        error: { status: 429, message: 'Too Many Requests' },
      }),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);

    const job = queue.jobs()[0];
    expect(job.status).toBe('waiting');
    expect(job.submitBlocked).toBe('rate_limited');
    expect(job.submitAttempts).toBe(1);
    expect(job.submitRetryAt).toBeGreaterThan(queue.clock() - 1);
  });

  it('says so while the horde does not answer, and waits longer each time', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of<SubmitImageResult>({
        kind: 'error',
        error: { status: 500, message: 'Internal Server Error' },
      }),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
    expect(queue.jobs()[0].submitBlocked).toBe('unanswered');
    expect(aiHorde.submitImageGenerationResult).toHaveBeenCalledTimes(1);

    // The first wait is five seconds, so the ticks in between spend nothing.
    await vi.advanceTimersByTimeAsync(4 * DISPATCH_TICK_MS);
    expect(aiHorde.submitImageGenerationResult).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2 * DISPATCH_TICK_MS);
    expect(aiHorde.submitImageGenerationResult).toHaveBeenCalledTimes(2);
    expect(queue.jobs()[0].submitAttempts).toBe(2);
  });

  it('gives up on a job the horde never answers for and offers Retry', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of<SubmitImageResult>({
        kind: 'error',
        error: { status: 0, message: 'network' },
      }),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });

    // Five refusals, the last of which is the bound.
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    const job = queue.jobs()[0];
    expect(job.status).toBe('error');
    expect(job.submitAttempts).toBe(5);
    expect(job.errorKey).toBe('generate.results.error_submit_unanswered');
    expect(job.submitBlocked).toBeUndefined();
    expect(aiHorde.submitImageGenerationResult).toHaveBeenCalledTimes(5);
  });

  it('gives up on a job the horde keeps rate-limiting', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of<SubmitImageResult>({
        kind: 'error',
        error: { status: 429, message: 'Too Many Requests' },
      }),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });

    await vi.advanceTimersByTimeAsync(5 * 60_000);

    const job = queue.jobs()[0];
    expect(job.status).toBe('error');
    expect(job.errorKey).toBe('generate.results.error_submit_rate_limited');
  });

  it('clears the held-up marks once a submit is accepted', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValueOnce(
      of<SubmitImageResult>({
        kind: 'error',
        error: { status: 503, message: 'unavailable' },
      }),
    );
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of(submitSuccess('h1')),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
    expect(queue.jobs()[0].submitBlocked).toBe('unanswered');

    await vi.advanceTimersByTimeAsync(6 * DISPATCH_TICK_MS);

    const job = queue.jobs()[0];
    expect(job.hordeId).toBe('h1');
    expect(job.submitBlocked).toBeUndefined();
    expect(job.submitRetryAt).toBeUndefined();
    expect(queue.lastAccepted()?.localId).toBe(job.localId);
  });

  it('puts the studio own words on a refusal whose code it knows', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of<SubmitImageResult>({
        kind: 'error',
        error: {
          status: 400,
          message: 'Image size must be a multiple of 64',
          rc: 'InvalidSize',
        },
      }),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);

    const job = queue.jobs()[0];
    expect(job.errorKey).toBe('generate.reject.invalid_size');
    expect(job.errorRc).toBe('InvalidSize');
    expect(job.errorMessage).toBe('Image size must be a multiple of 64');
  });

  it('keeps the horde sentence for a code it has no words for', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of<SubmitImageResult>({
        kind: 'error',
        error: {
          status: 400,
          message: 'eta must be between 0 and 1',
          rc: 'SamplerKnobOutOfRange',
        },
      }),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);

    const job = queue.jobs()[0];
    expect(job.errorKey).toBeUndefined();
    expect(job.errorMessage).toBe('eta must be between 0 and 1');
  });

  it('leaves the check endpoint alone while the tab is hidden', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of(submitSuccess('h1')),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });
    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
    aiHorde.checkImageGenerationResult.mockClear();

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(8 * POLL_TICK_MS);
    expect(aiHorde.checkImageGenerationResult).not.toHaveBeenCalled();

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(aiHorde.checkImageGenerationResult).toHaveBeenCalledTimes(1);
  });

  it('records a validation failure as an error with its message', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of<SubmitImageResult>({
        kind: 'error',
        error: { status: 400, message: 'invalid sampler' },
      }),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);

    const job = queue.jobs()[0];
    expect(job.status).toBe('error');
    expect(job.errorMessage).toBe('invalid sampler');
  });

  it('marks a job errored when the horde reports it faulted', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of(submitSuccess('h1')),
    );
    aiHorde.checkImageGenerationResult.mockReturnValue(
      of(checkResult({ check: { faulted: true } })),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
    await vi.advanceTimersByTimeAsync(POLL_TICK_MS);

    expect(queue.jobs()[0].status).toBe('error');
  });

  it('resumes polling a persisted in-flight job on startup', async () => {
    const now = Date.now();
    fakeDb.jobs.set('j9', {
      localId: 'j9',
      status: 'requested',
      createdAt: now,
      updatedAt: now,
      request: { prompt: 'resumed' },
      hordeId: 'h9',
      resultImageIds: [],
    });
    aiHorde.checkImageGenerationResult.mockReturnValue(
      of(checkResult({ check: { processing: 1 } })),
    );

    const queue = await createQueue();
    await vi.advanceTimersByTimeAsync(POLL_TICK_MS);

    expect(aiHorde.checkImageGenerationResult).toHaveBeenCalledWith('h9');
    expect(queue.jobs().find((job) => job.localId === 'j9')?.status).toBe(
      'processing',
    );
  });

  it('does not resurrect a job cancelled while its submit is in flight', async () => {
    const pending = new Subject<SubmitImageResult>();
    aiHorde.submitImageGenerationResult.mockReturnValue(pending.asObservable());
    const queue = await createQueue();
    const localId = await queue.enqueue({ prompt: 'a cat' });

    // Fire the dispatch tick; the submit request now hangs on the subject.
    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
    expect(aiHorde.submitImageGenerationResult).toHaveBeenCalledTimes(1);

    // The user cancels while the submit is still pending.
    await queue.cancel(localId);
    expect(queue.jobs()[0].status).toBe('cancelled');

    // The in-flight submit now resolves successfully.
    pending.next(submitSuccess('h1'));
    pending.complete();
    await vi.advanceTimersByTimeAsync(POLL_TICK_MS * 2);

    const job = queue.jobs()[0];
    // The success path must not overwrite the cancelled status.
    expect(job.status).toBe('cancelled');
    // The id is still recorded so the orphan can be cancelled and traced.
    expect(job.hordeId).toBe('h1');
    expect(aiHorde.cancelImageGeneration).toHaveBeenCalledWith('h1');
    // A cancelled job is never polled.
    expect(aiHorde.checkImageGenerationResult).not.toHaveBeenCalled();
  });

  it('cancels a waiting job locally without hitting the horde', async () => {
    const queue = await createQueue();
    const localId = await queue.enqueue({ prompt: 'a cat' });

    await queue.cancel(localId);

    expect(queue.jobs()[0].status).toBe('cancelled');
    expect(aiHorde.cancelImageGeneration).not.toHaveBeenCalled();
  });

  it('estimates kudos via a dry-run submission', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of(submitSuccess('dry', 42)),
    );
    const queue = await createQueue();

    const kudos = await queue.estimateKudos({ prompt: 'a cat' });

    expect(kudos).toBe(42);
    expect(aiHorde.submitImageGenerationResult).toHaveBeenCalledWith(
      'test-key',
      expect.objectContaining({ dry_run: true }),
    );
  });

  it('preserves a genuine zero-kudos estimate', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of(submitSuccess('dry', 0)),
    );
    const queue = await createQueue();

    expect(await queue.estimateKudos({ prompt: 'a cat' })).toBe(0);
  });

  it('returns null (not 0) when a dry-run estimate fails', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of<SubmitImageResult>({
        kind: 'error',
        error: { status: 429, message: 'Too Many Requests' },
      }),
    );
    const queue = await createQueue();

    expect(await queue.estimateKudos({ prompt: 'a cat' })).toBeNull();
  });

  it('stays functional when the startup persistence load fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fakeDb.listJobs = vi.fn(() => Promise.reject(new Error('db unavailable')));

    // whenReady must resolve (no unhandled rejection) despite the load failure.
    const queue = await createQueue();
    const localId = await queue.enqueue({ prompt: 'a cat' });

    expect(fakeDb.jobs.get(localId)?.status).toBe('waiting');
    expect(queue.pendingJobs().some((job) => job.localId === localId)).toBe(
      true,
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('adopts an active id the queue does not already hold', async () => {
    const queue = await createQueue();

    await queue.adoptActive(['elsewhere-1']);

    const job = queue.jobs()[0];
    expect(job.hordeId).toBe('elsewhere-1');
    expect(job.adopted).toBe(true);
    expect(job.status).toBe('queued');
    expect(job.request).toEqual({ prompt: '' });
    expect(fakeDb.jobs.get(job.localId)?.adopted).toBe(true);
  });

  it('ignores an active id it is already tracking', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of(submitSuccess('h1')),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });
    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);

    await queue.adoptActive(['h1']);
    await queue.adoptActive(['h1']);

    expect(queue.jobs()).toHaveLength(1);
    expect(queue.jobs()[0].adopted).toBeUndefined();
  });

  it('does not adopt an id whose submit is still being recorded', async () => {
    aiHorde.submitImageGenerationResult.mockReturnValue(
      of(submitSuccess('h-race')),
    );
    const queue = await createQueue();
    await queue.enqueue({ prompt: 'a cat' });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const putJob = fakeDb.putJob.bind(fakeDb);
    vi.spyOn(fakeDb, 'putJob').mockImplementation(async (job) => {
      if (job.hordeId === 'h-race' && !job.adopted) {
        await gate;
      }
      return putJob(job);
    });

    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
    expect(aiHorde.submitImageGenerationResult).toHaveBeenCalledTimes(1);

    await queue.adoptActive(['h-race']);
    expect(queue.jobs()).toHaveLength(1);

    release();
    await vi.advanceTimersByTimeAsync(0);

    expect(queue.jobs()).toHaveLength(1);
    expect(queue.jobs()[0].hordeId).toBe('h-race');
    expect(queue.jobs()[0].adopted).toBeUndefined();
  });

  it('polls an adopted job to done through the existing path', async () => {
    aiHorde.checkImageGenerationResult.mockReturnValue(
      of(checkResult({ check: { done: true, processing: 0 } })),
    );
    aiHorde.getImageGenerationStatus.mockReturnValue(of(doneStatus()));
    const queue = await createQueue();
    await queue.adoptActive(['elsewhere-1']);

    await vi.advanceTimersByTimeAsync(POLL_TICK_MS);

    const job = queue.jobs()[0];
    expect(aiHorde.checkImageGenerationResult).toHaveBeenCalledWith(
      'elsewhere-1',
    );
    expect(job.status).toBe('done');
    expect(job.resultImageIds).toEqual(['out-1']);
    const images = await queue.getJobImages(job.localId);
    // The tile has no request to name the model, so the per-image record is
    // where it has to come from.
    expect(images[0].metadata?.model).toBe('sd');
  });

  it('refuses to retry an adopted job', async () => {
    const queue = await createQueue();
    await queue.adoptActive(['elsewhere-1']);

    await expect(queue.retry(queue.jobs()[0].localId)).rejects.toThrow();
  });

  it('produces a well-formed id when crypto.randomUUID is unavailable', async () => {
    const cryptoRef = crypto as { randomUUID?: () => string };
    const original = cryptoRef.randomUUID;
    // Reproduce a non-secure context (LAN-IP dev access) where randomUUID is
    // not exposed and the getRandomValues fallback must take over.
    cryptoRef.randomUUID = undefined;
    try {
      const queue = await createQueue();
      const localId = await queue.enqueue({ prompt: 'a cat' });

      expect(localId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      cryptoRef.randomUUID = original;
    }
  });

  describe('deletion', () => {
    it('cancels a running job on the horde when it is deleted', async () => {
      const queue = await createQueue();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      expect(queue.jobs()[0].hordeId).toBe('horde-id');

      await queue.deleteJob(localId);

      expect(aiHorde.cancelImageGeneration).toHaveBeenCalledWith('horde-id');
      expect(queue.jobs()).toEqual([]);
      expect(fakeDb.jobs.has(localId)).toBe(false);
    });

    it('deletes a running job even when the horde cancel fails', async () => {
      aiHorde.cancelImageGeneration.mockReturnValue(
        throwError(() => new Error('offline')),
      );
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const queue = await createQueue();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);

      await queue.deleteJob(localId);

      expect(queue.jobs()).toEqual([]);
      expect(fakeDb.jobs.has(localId)).toBe(false);
      warn.mockRestore();
    });

    it('deletes a waiting job without asking the horde', async () => {
      const queue = await createQueue();
      const localId = await queue.enqueue({ prompt: 'a cat' });

      await queue.deleteJob(localId);

      expect(aiHorde.cancelImageGeneration).not.toHaveBeenCalled();
      expect(queue.jobs()).toEqual([]);
    });

    it('does not adopt back a job it just deleted', async () => {
      const queue = await createQueue();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      await queue.deleteJob(localId);

      await queue.adoptActive(['horde-id']);

      expect(queue.jobs()).toEqual([]);
    });

    it('cancels every running job when the history is cleared', async () => {
      const queue = await createQueue();
      await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      await queue.enqueue({ prompt: 'a dog' });

      await queue.clearHistory();

      expect(aiHorde.cancelImageGeneration).toHaveBeenCalledTimes(1);
      expect(aiHorde.cancelImageGeneration).toHaveBeenCalledWith('horde-id');
      expect(queue.jobs()).toEqual([]);
      expect(fakeDb.jobs.size).toBe(0);
    });

    it('cancels the generation of a job deleted while its submit was in flight', async () => {
      const pending = new Subject<SubmitImageResult>();
      aiHorde.submitImageGenerationResult.mockReturnValue(
        pending.asObservable(),
      );
      const queue = await createQueue();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);

      await queue.deleteJob(localId);
      pending.next(submitSuccess('h1'));
      pending.complete();
      await vi.advanceTimersByTimeAsync(0);

      expect(aiHorde.cancelImageGeneration).toHaveBeenCalledWith('h1');
      expect(queue.jobs()).toEqual([]);
      expect(fakeDb.jobs.has(localId)).toBe(false);
      await queue.adoptActive(['h1']);
      expect(queue.jobs()).toEqual([]);
    });

    it('does not write back a job deleted while its check was in flight', async () => {
      const pending = new Subject<CheckImageResult>();
      aiHorde.checkImageGenerationResult.mockReturnValue(
        pending.asObservable(),
      );
      const queue = await createQueue();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      await vi.advanceTimersByTimeAsync(POLL_TICK_MS);
      expect(aiHorde.checkImageGenerationResult).toHaveBeenCalledTimes(1);

      await queue.deleteJob(localId);
      pending.next(checkResult());
      pending.complete();
      await vi.advanceTimersByTimeAsync(0);

      expect(fakeDb.jobs.has(localId)).toBe(false);
      expect(queue.jobs()).toEqual([]);
    });
  });

  describe('pictures that could not be fetched', () => {
    const MISSING_URL = 'https://r2.example/out-2.webp';

    function twoPictureStatus(): GenerationStatusResponse {
      const status = doneStatus();
      return {
        ...status,
        finished: 2,
        generations: [
          status.generations[0],
          { ...status.generations[0], id: 'out-2', img: MISSING_URL },
        ],
      };
    }

    beforeEach(() => {
      aiHorde.checkImageGenerationResult.mockReturnValue(
        of(checkResult({ check: { done: true, processing: 0, finished: 2 } })),
      );
      aiHorde.getImageGenerationStatus.mockReturnValue(of(twoPictureStatus()));
    });

    it('keeps the job active and fetches only what is missing', async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValue(
          new Response(new Uint8Array([1, 2]), {
            status: 200,
            headers: { 'content-type': 'image/webp' },
          }),
        );
      vi.stubGlobal('fetch', fetchMock);
      const putImage = vi.spyOn(fakeDb, 'putImage');
      const queue = await createQueue();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      await vi.advanceTimersByTimeAsync(POLL_TICK_MS);

      let job = queue.jobs()[0];
      expect(job.status).toBe('requested');
      expect(job.resultImageIds).toEqual(['out-1']);
      expect(job.fetchRetryFrom).toBeDefined();

      await vi.advanceTimersByTimeAsync(30_000);

      job = queue.jobs()[0];
      expect(job.status).toBe('done');
      expect(job.resultImageIds).toEqual(['out-1', 'out-2']);
      expect(job.fetchRetryFrom).toBeUndefined();
      expect(job.fetchFailedCount).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const outOneWrites = putImage.mock.calls.filter(
        ([image]) => image.localId === localId && image.imageId === 'out-1',
      );
      expect(outOneWrites).toHaveLength(1);
    });

    it('marks the job done with the shortfall once the window runs out', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('network'));
      vi.stubGlobal('fetch', fetchMock);
      const queue = await createQueue();
      await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      await vi.advanceTimersByTimeAsync(POLL_TICK_MS);
      expect(queue.jobs()[0].status).toBe('requested');

      await vi.advanceTimersByTimeAsync(4 * 60_000);
      expect(queue.jobs()[0].status).toBe('requested');

      await vi.advanceTimersByTimeAsync(90_000);

      const job = queue.jobs()[0];
      expect(job.status).toBe('done');
      expect(job.resultImageIds).toEqual(['out-1']);
      expect(job.fetchFailedCount).toBe(1);
      expect(job.fetchRetryFrom).toBeUndefined();
      // Retries are spaced out rather than made on every poll tick.
      expect(fetchMock.mock.calls.length).toBeLessThan(30);
    });
  });

  describe('other tabs', () => {
    function peerRow(
      overrides: Partial<LocalGenerationJob> = {},
    ): LocalGenerationJob {
      const now = Date.now();
      return {
        localId: 'peer-job',
        status: 'waiting',
        createdAt: now,
        updatedAt: now,
        request: { prompt: 'a peer cat' },
        resultImageIds: [],
        ...overrides,
      };
    }

    it('announces each write to other tabs', async () => {
      const queue = await createQueue();
      const peer = openPeerChannel();
      const topics: string[] = [];
      peer.onmessage = (event) =>
        topics.push((event.data as { topic: string }).topic);

      const localId = await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      await queue.cancel(localId);
      await queue.deleteJob(localId);

      expect(topics).toEqual([
        'generation-job.added',
        'generation-job.changed',
        'generation-job.cancelled',
        'generation-job.deleted',
      ]);
    });

    it('shows a job a peer added without storing it again', async () => {
      const queue = await createQueue();
      const peer = openPeerChannel();
      const putJob = vi.spyOn(fakeDb, 'putJob');

      postFromPeer(peer, 'generation-job.added', peerRow());

      expect(queue.jobs().map((job) => job.localId)).toEqual(['peer-job']);
      expect(putJob).not.toHaveBeenCalled();
    });

    it('drops a job a peer deleted and stops polling it', async () => {
      const queue = await createQueue();
      const peer = openPeerChannel();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);

      postFromPeer(peer, 'generation-job.deleted', {
        localId,
        hordeId: 'horde-id',
      });
      await vi.advanceTimersByTimeAsync(POLL_TICK_MS * 2);

      expect(queue.jobs()).toEqual([]);
      expect(aiHorde.checkImageGenerationResult).not.toHaveBeenCalled();
      await queue.adoptActive(['horde-id']);
      expect(queue.jobs()).toEqual([]);
    });

    it('ignores a peer row older than the one it holds', async () => {
      const queue = await createQueue();
      const peer = openPeerChannel();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      const held = queue.jobs()[0];

      postFromPeer(
        peer,
        'generation-job.changed',
        peerRow({
          localId,
          status: 'queued',
          updatedAt: held.updatedAt - 1_000,
        }),
      );

      expect(queue.jobs()[0].status).toBe('waiting');
    });

    it('takes a peer cancel over a running row it holds', async () => {
      const queue = await createQueue();
      const peer = openPeerChannel();
      await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      const held = queue.jobs()[0];

      postFromPeer(peer, 'generation-job.cancelled', {
        ...held,
        status: 'cancelled',
        updatedAt: held.updatedAt - 1,
      });
      await vi.advanceTimersByTimeAsync(POLL_TICK_MS * 2);

      expect(queue.jobs()[0].status).toBe('cancelled');
      expect(aiHorde.checkImageGenerationResult).not.toHaveBeenCalled();
    });

    it('rewrites its finished row when a peer write would reopen it', async () => {
      const queue = await createQueue();
      const peer = openPeerChannel();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      await queue.cancel(localId);
      const held = queue.jobs()[0];
      // A peer that had not heard of the cancel stored a poll answer over it.
      const stale: LocalGenerationJob = {
        ...held,
        status: 'processing',
        updatedAt: held.updatedAt + 1,
      };
      fakeDb.jobs.set(localId, stale);

      postFromPeer(peer, 'generation-job.changed', stale);
      await vi.advanceTimersByTimeAsync(0);

      expect(queue.jobs()[0].status).toBe('cancelled');
      expect(fakeDb.jobs.get(localId)?.status).toBe('cancelled');
    });

    it('leaves a peer job alone once the store says it was sent', async () => {
      const queue = await createQueue();
      const peer = openPeerChannel();
      const row = peerRow();
      postFromPeer(peer, 'generation-job.added', row);
      // The peer's submit landed in the shared store before its notice did.
      fakeDb.jobs.set(row.localId, {
        ...row,
        status: 'requested',
        hordeId: 'peer-h',
        updatedAt: row.updatedAt + 1,
      });

      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);

      expect(aiHorde.submitImageGenerationResult).not.toHaveBeenCalled();
      expect(queue.jobs()[0].status).toBe('requested');
    });

    it('does not collect results a peer already collected', async () => {
      aiHorde.checkImageGenerationResult.mockReturnValue(
        of(checkResult({ check: { done: true, processing: 0 } })),
      );
      aiHorde.getImageGenerationStatus.mockReturnValue(of(doneStatus()));
      const queue = await createQueue();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      const held = fakeDb.jobs.get(localId) as LocalGenerationJob;
      fakeDb.jobs.set(localId, {
        ...held,
        status: 'done',
        resultImageIds: ['out-1'],
        updatedAt: held.updatedAt + 1,
      });

      await vi.advanceTimersByTimeAsync(POLL_TICK_MS);

      expect(aiHorde.getImageGenerationStatus).not.toHaveBeenCalled();
      expect(queue.jobs()[0].status).toBe('done');
    });
  });
});
