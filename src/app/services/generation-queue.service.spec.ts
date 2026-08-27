import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { of, Subject } from 'rxjs';
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
  });

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
          check: { processing: 1, queue_position: 4, wait_time: 9 },
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
});
