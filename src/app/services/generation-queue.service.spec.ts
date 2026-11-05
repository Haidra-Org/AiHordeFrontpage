import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { GenerationQueueService } from './generation-queue.service';
import { GenerationDbService } from './generation-db.service';
import { AiHordeService } from './ai-horde.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import {
  CheckImageResult,
  GenerationStatusResponse,
  SubmitImageResult,
} from '../types/generation';
import {
  LocalGenerationJob,
  StoredJobImage,
  preserveGenerationRequestMark,
} from '../types/generation-job';
import {
  FakeBroadcastChannel,
  openPeerChannel,
  postFromPeer,
} from '../testing/fake-broadcast-channel';

const DISPATCH_TICK_MS = 1_000;
const READ_BACK_SINCE_KEY = 'aihorde.generate.read-back-since';
const POLL_TICK_MS = 2_000;

/** Minimal in-memory stand-in for the IndexedDB persistence layer. */
class FakeGenerationDb {
  public readonly jobs = new Map<string, LocalGenerationJob>();
  public readonly images = new Map<string, StoredJobImage>();

  private imageKey(localId: string, imageId: string): string {
    return `${localId}::${imageId}`;
  }

  putJob(
    job: LocalGenerationJob,
    requestNsfwOverride?: boolean,
  ): Promise<LocalGenerationJob> {
    const held = this.jobs.get(job.localId);
    if (held) job = preserveGenerationRequestMark(job, held);
    if (requestNsfwOverride !== undefined) {
      job = {
        ...(held ?? job),
        updatedAt: Math.max(job.updatedAt, held?.updatedAt ?? 0),
        requestNsfwOverride,
        requestNsfwRevision: (held?.requestNsfwRevision ?? 0) + 1,
      };
    }
    this.jobs.set(job.localId, job);
    return Promise.resolve(job);
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
  deleteResults = vi.fn<GenerationDbService['deleteResults']>();

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
  getSubmittedImageRequestResult: ReturnType<typeof vi.fn>;
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
  };
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
    localStorage.clear();
    FakeBroadcastChannel.reset();
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    fakeDb = new FakeGenerationDb();
    aiHorde = {
      submitImageGenerationResult: vi.fn(() => of(submitSuccess('horde-id'))),
      checkImageGenerationResult: vi.fn(() => of(checkResult())),
      getImageGenerationStatus: vi.fn(() => of(null)),
      cancelImageGeneration: vi.fn(() => of(null)),
      getSubmittedImageRequestResult: vi.fn(() =>
        of({ kind: 'missing_route' }),
      ),
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

  describe('local request content marking', () => {
    const finished: LocalGenerationJob = {
      localId: 'marked',
      status: 'done',
      createdAt: 0,
      updatedAt: 1,
      completedAt: 1,
      request: { prompt: 'a cat', nsfw: true, censor_nsfw: false },
      resultImageIds: ['one', 'two'],
    };

    it('persists and restores an SFW marking while preserving submission and results', async () => {
      fakeDb.jobs.set(finished.localId, finished);
      const queue = await createQueue();

      await queue.setRequestNsfw(finished.localId, false);

      expect(fakeDb.jobs.get(finished.localId)).toMatchObject({
        requestNsfwOverride: false,
        request: finished.request,
        resultImageIds: finished.resultImageIds,
        completedAt: finished.completedAt,
      });
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          GenerationQueueService,
          { provide: GenerationDbService, useValue: fakeDb },
          { provide: AiHordeService, useValue: aiHorde },
          { provide: AuthService, useValue: auth },
        ],
      });
      const restored = await createQueue();
      expect(restored.finishedJobs()[0].requestNsfwOverride).toBe(false);

      await restored.setRequestNsfw(finished.localId, true);
      expect(fakeDb.jobs.get(finished.localId)?.requestNsfwOverride).toBe(true);
      expect(aiHorde.submitImageGenerationResult).not.toHaveBeenCalled();
    });

    it('leaves the visible marking unchanged if saving fails', async () => {
      fakeDb.jobs.set(finished.localId, finished);
      const queue = await createQueue();
      vi.spyOn(fakeDb, 'putJob').mockRejectedValueOnce(
        new Error('storage full'),
      );

      await expect(
        queue.setRequestNsfw(finished.localId, false),
      ).rejects.toThrow('storage full');

      expect(queue.finishedJobs()[0].requestNsfwOverride).toBeUndefined();
    });

    it('recovers from a failed save and publishes the next content revision', async () => {
      fakeDb.jobs.set(finished.localId, finished);
      const queue = await createQueue();
      vi.spyOn(fakeDb, 'putJob').mockRejectedValueOnce(
        new Error('storage full'),
      );
      await expect(
        queue.setRequestNsfw(finished.localId, false),
      ).rejects.toThrow();
      await queue.setRequestNsfw(finished.localId, false);
      expect(FakeBroadcastChannel.instances[0].posted).toContainEqual(
        expect.objectContaining({
          topic: 'generation-job.changed',
          payload: expect.objectContaining({
            requestNsfwOverride: false,
            requestNsfwRevision: 1,
          }),
        }),
      );
    });

    it('keeps a content marking when a peer sends a later unrelated snapshot', async () => {
      fakeDb.jobs.set(finished.localId, finished);
      const queue = await createQueue();
      const peer = openPeerChannel();
      await queue.setRequestNsfw(finished.localId, false);

      postFromPeer(peer, 'generation-job.changed', {
        ...finished,
        updatedAt: Date.now() + 10,
        kudos: 9,
      });

      expect(queue.finishedJobs()[0]).toMatchObject({
        requestNsfwOverride: false,
        requestNsfwRevision: 1,
        kudos: 9,
      });
    });

    it('accepts a newer peer content revision without rolling back newer metadata', async () => {
      fakeDb.jobs.set(finished.localId, {
        ...finished,
        updatedAt: 100,
        kudos: 9,
      });
      const queue = await createQueue();
      const peer = openPeerChannel();

      postFromPeer(peer, 'generation-job.changed', {
        ...finished,
        updatedAt: 50,
        requestNsfwOverride: false,
        requestNsfwRevision: 1,
      });
      expect(queue.finishedJobs()[0]).toMatchObject({
        requestNsfwOverride: false,
        requestNsfwRevision: 1,
        updatedAt: 100,
        kudos: 9,
      });
      postFromPeer(peer, 'generation-job.changed', {
        ...finished,
        updatedAt: 200,
        requestNsfwOverride: true,
        requestNsfwRevision: 0,
      });
      expect(queue.finishedJobs()[0].requestNsfwOverride).toBe(false);
    });

    it('preserves a local marking when a delayed server request recovery completes', async () => {
      const queue = await createQueue();
      const recovered = new Subject();
      aiHorde.getSubmittedImageRequestResult.mockReturnValue(recovered);
      await queue.adoptActive(['remote']);
      await vi.advanceTimersByTimeAsync(0);
      const localId = queue.jobs()[0].localId;
      await queue.setRequestNsfw(localId, false);

      recovered.next({
        kind: 'success',
        request: { prompt: 'a cat', nsfw: true, censor_nsfw: false },
      });
      recovered.complete();
      await vi.advanceTimersByTimeAsync(0);

      expect(queue.jobs()[0]).toMatchObject({
        requestNsfwOverride: false,
        requestNsfwRevision: 1,
        requestRecovery: 'full',
        request: { nsfw: true },
      });
      expect(fakeDb.jobs.get(localId)?.requestNsfwOverride).toBe(false);
    });

    it('accepts a peer marking based on a running snapshot without reopening a finished request', async () => {
      fakeDb.jobs.set(finished.localId, finished);
      const queue = await createQueue();
      const row: LocalGenerationJob = {
        ...finished,
        status: 'processing',
        updatedAt: Date.now(),
        requestNsfwOverride: false,
        requestNsfwRevision: 1,
      };
      fakeDb.jobs.set(finished.localId, row);

      postFromPeer(openPeerChannel(), 'generation-job.changed', row);
      await vi.advanceTimersByTimeAsync(0);

      expect(queue.finishedJobs()[0]).toMatchObject({
        status: 'done',
        requestNsfwOverride: false,
        requestNsfwRevision: 1,
      });
      expect(fakeDb.jobs.get(finished.localId)).toMatchObject({
        status: 'done',
        requestNsfwOverride: false,
      });
    });

    it('applies peer result deletion and content marking revisions together without rolling back metadata', async () => {
      fakeDb.jobs.set(finished.localId, {
        ...finished,
        updatedAt: 100,
        kudos: 9,
      });
      const queue = await createQueue();

      postFromPeer(openPeerChannel(), 'generation-job.changed', {
        ...finished,
        updatedAt: 50,
        requestNsfwOverride: false,
        requestNsfwRevision: 1,
        resultRevision: 1,
        resultImageIds: ['two'],
      });

      expect(queue.finishedJobs()[0]).toMatchObject({
        requestNsfwOverride: false,
        requestNsfwRevision: 1,
        resultRevision: 1,
        resultImageIds: ['two'],
        kudos: 9,
      });
    });

    it('preserves a marking through server completion without changing the submitted flags', async () => {
      const queue = await createQueue();
      const localId = await queue.enqueue({
        prompt: 'a cat',
        nsfw: true,
        censor_nsfw: false,
      });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      await queue.setRequestNsfw(localId, false);
      aiHorde.checkImageGenerationResult.mockReturnValue(
        of(checkResult({ check: { done: true, processing: 0 } })),
      );
      aiHorde.getImageGenerationStatus.mockReturnValue(of(doneStatus()));
      await vi.advanceTimersByTimeAsync(POLL_TICK_MS);

      expect(queue.finishedJobs()[0]).toMatchObject({
        status: 'done',
        requestNsfwOverride: false,
        requestNsfwRevision: 1,
        request: { nsfw: true, censor_nsfw: false },
      });
      const retryId = await queue.retry(localId);
      expect(queue.jobs().find((job) => job.localId === retryId)).toMatchObject(
        { request: { nsfw: true, censor_nsfw: false } },
      );
      expect(
        queue.jobs().find((job) => job.localId === retryId)
          ?.requestNsfwOverride,
      ).toBeUndefined();
    });

    it('does not resurrect a request deleted while a content marking is being saved', async () => {
      fakeDb.jobs.set(finished.localId, finished);
      const queue = await createQueue();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const putJob = fakeDb.putJob.bind(fakeDb);
      vi.spyOn(fakeDb, 'putJob').mockImplementationOnce(
        async (job, marking) => {
          await gate;
          return putJob(job, marking);
        },
      );
      const saving = queue.setRequestNsfw(finished.localId, false);
      await queue.deleteJob(finished.localId);
      release();
      await saving;

      expect(queue.jobs()).toEqual([]);
      expect(fakeDb.jobs.has(finished.localId)).toBe(false);
    });
  });

  describe('deleting batch results', () => {
    const batch: LocalGenerationJob = {
      localId: 'batch',
      hordeId: 'batch-horde',
      status: 'done',
      createdAt: 0,
      updatedAt: 0,
      request: { prompt: 'a cat' },
      resultImageIds: ['bad', 'good'],
    };
    const selection = {
      imageIds: ['bad'],
      censoredIndices: [],
      fetchFailedIndices: [],
    };

    it('updates the batch without cancelling its request', async () => {
      fakeDb.jobs.set('batch', batch);
      const queue = await createQueue();
      fakeDb.deleteResults.mockResolvedValue({
        ...batch,
        updatedAt: 1,
        resultImageIds: ['good'],
      });
      await queue.deleteResults('batch', selection);
      expect(queue.finishedJobs()[0].resultImageIds).toEqual(['good']);
      expect(FakeBroadcastChannel.instances[0].posted).toContainEqual(
        expect.objectContaining({
          topic: 'generation-job.changed',
          payload: expect.objectContaining({ resultImageIds: ['good'] }),
        }),
      );
      expect(fakeDb.deleteResults).toHaveBeenCalledWith('batch', selection);
      expect(aiHorde.cancelImageGeneration).not.toHaveBeenCalled();
    });

    it('leaves the batch visible when the transaction fails', async () => {
      fakeDb.jobs.set('batch', batch);
      const queue = await createQueue();
      fakeDb.deleteResults.mockRejectedValue(new Error('storage'));
      await expect(queue.deleteResults('batch', selection)).rejects.toThrow(
        'storage',
      );
      expect(queue.finishedJobs()[0].resultImageIds).toEqual(['bad', 'good']);
    });

    it('accepts newer metadata without restoring images from a stale peer snapshot', async () => {
      const current = {
        ...batch,
        resultRevision: 2,
        completedAt: 10,
        updatedAt: 20,
        resultImageIds: ['good'],
        censoredResultIndices: [1],
        csamCensoredCount: 1,
        fetchFailedResultIndices: [],
        fetchFailedCount: 0,
      };
      fakeDb.jobs.set('batch', current);
      const queue = await createQueue();
      postFromPeer(openPeerChannel(), 'generation-job.changed', {
        ...batch,
        updatedAt: 100,
        styleName: 'recovered',
        csamCensoredCount: 2,
      });
      expect(queue.finishedJobs()[0]).toMatchObject({
        resultRevision: 2,
        resultImageIds: ['good'],
        completedAt: 10,
        styleName: 'recovered',
        censoredResultIndices: [1],
        csamCensoredCount: 1,
      });
    });

    it('applies newer deletions even with an older timestamp while preserving newer metadata', async () => {
      fakeDb.jobs.set('batch', {
        ...batch,
        updatedAt: 100,
        styleName: 'new metadata',
      });
      const queue = await createQueue();
      postFromPeer(openPeerChannel(), 'generation-job.changed', {
        ...batch,
        updatedAt: 50,
        completedAt: 10,
        resultRevision: 1,
        resultImageIds: ['good'],
        styleName: 'old metadata',
      });
      expect(queue.finishedJobs()[0]).toMatchObject({
        resultImageIds: ['good'],
        resultRevision: 1,
        styleName: 'new metadata',
      });
    });

    it('does not reopen results when an older revision arrives after a newer deletion', async () => {
      fakeDb.jobs.set('batch', {
        ...batch,
        resultRevision: 3,
        updatedAt: 100,
        resultImageIds: ['good'],
      });
      const queue = await createQueue();
      const peer = openPeerChannel();
      for (const revision of [2, 0, 1]) {
        postFromPeer(peer, 'generation-job.changed', {
          ...batch,
          resultRevision: revision,
          updatedAt: 200,
        });
        expect(queue.finishedJobs()[0].resultImageIds).toEqual(['good']);
      }
    });

    it('forgets a batch when its last result is removed', async () => {
      fakeDb.jobs.set('batch', batch);
      const queue = await createQueue();
      fakeDb.deleteResults.mockResolvedValue(null);
      await queue.deleteResults('batch', selection);
      expect(queue.finishedJobs()).toEqual([]);
      expect(aiHorde.cancelImageGeneration).not.toHaveBeenCalled();
    });
  });

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

  it('records the complete submitted body separately from image placeholders and retains it after reload', async () => {
    const queue = await createQueue();
    const request = { prompt: 'a cat', params: { steps: 30 } };
    const localId = await queue.enqueue(request, [
      { kind: 'source', blob: new Blob(['hello']), mimeType: 'image/webp' },
      { kind: 'mask', blob: new Blob(['mask']), mimeType: 'image/webp' },
      {
        kind: 'extra_source',
        blob: new Blob(['extra']),
        mimeType: 'image/webp',
        strength: 0.7,
      },
    ]);
    request.params.steps = 99;
    expect(await queue.getSubmittedBody(localId)).toBeNull();
    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
    const submitted = aiHorde.submitImageGenerationResult.mock.calls[0][1];
    expect(submitted).toMatchObject({
      params: { steps: 30 },
      source_image: 'aGVsbG8=',
      source_mask: 'bWFzaw==',
      extra_source_images: [{ image: 'ZXh0cmE=', strength: 0.7 }],
    });
    expect(
      JSON.parse(await (await queue.getSubmittedBody(localId))!.text()),
    ).toEqual(submitted);
    expect(queue.jobs()[0].inspectionRequest).toMatchObject({
      source_image: '',
      source_mask: '',
      extra_source_images: [{ image: '', strength: 0.7 }],
    });
    expect(queue.jobs()[0].submittedBodyAvailable).toBe(true);
    expect(await queue.getJobImages(localId)).toHaveLength(3);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: GenerationDbService, useValue: fakeDb },
        { provide: AiHordeService, useValue: aiHorde },
        { provide: AuthService, useValue: auth },
      ],
    });
    const resumed = await createQueue();
    expect(
      JSON.parse(await (await resumed.getSubmittedBody(localId))!.text()),
    ).toEqual(submitted);
    await resumed.deleteJob(localId);
    expect(await resumed.getSubmittedBody(localId)).toBeNull();
  });

  it('still submits when recording the full body exceeds storage capacity', async () => {
    const queue = await createQueue();
    const localId = await queue.enqueue({ prompt: 'a cat' });
    vi.spyOn(fakeDb, 'putImage').mockRejectedValueOnce(
      new DOMException('Full', 'QuotaExceededError'),
    );
    const warning = vi.spyOn(TestBed.inject(ToastService), 'warning');
    await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
    expect(queue.jobs()[0].status).toBe('requested');
    expect(queue.jobs()[0].submittedBodyAvailable).toBeUndefined();
    expect(await queue.getSubmittedBody(localId)).toBeNull();
    expect(warning).toHaveBeenCalledWith(
      'generate.results.payload_record_failed',
      { transloco: true },
    );
  });

  it.each([false, true])(
    'handles deletion while the submitted body is being recorded, deletion succeeds: %s',
    async (succeeds) => {
      const queue = await createQueue();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      let releaseWrite!: () => void;
      const writeGate = new Promise<void>(
        (resolve) => (releaseWrite = resolve),
      );
      const putImage = fakeDb.putImage.bind(fakeDb);
      vi.spyOn(fakeDb, 'putImage').mockImplementationOnce(async (image) => {
        await writeGate;
        await putImage(image);
      });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      let settleDeletion!: () => void;
      const deleteJob = fakeDb.deleteJobCascade.bind(fakeDb);
      vi.spyOn(fakeDb, 'deleteJobCascade').mockImplementationOnce(
        () =>
          new Promise<void>((resolve, reject) => {
            settleDeletion = () => {
              if (succeeds) void deleteJob(localId).then(resolve);
              else reject(new Error('Deletion failed'));
            };
          }),
      );
      const deletion = queue
        .deleteJob(localId)
        .catch((error: unknown) => error);
      releaseWrite();
      await vi.advanceTimersByTimeAsync(0);
      expect(aiHorde.submitImageGenerationResult).not.toHaveBeenCalled();
      settleDeletion();
      await deletion;
      await vi.advanceTimersByTimeAsync(0);
      expect(queue.jobs().map((job) => job.status)).toEqual(
        succeeds ? [] : ['requested'],
      );
      expect((await queue.getSubmittedBody(localId)) !== null).toBe(!succeeds);
      expect(fakeDb.images.size).toBe(succeeds ? 0 : 1);
      expect(aiHorde.submitImageGenerationResult).toHaveBeenCalledTimes(
        succeeds ? 0 : 1,
      );
    },
  );

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

  it.each([false, true])(
    'preserves informational NSFW per image with censor_nsfw=%s',
    async (censor_nsfw) => {
      const status = doneStatus();
      status.generations[0].gen_metadata = [
        { type: 'information', value: 'nsfw' },
      ];
      status.generations.push({
        ...status.generations[0],
        id: 'unflagged',
        gen_metadata: [],
      });
      aiHorde.checkImageGenerationResult.mockReturnValue(
        of(checkResult({ check: { done: true, processing: 0 } })),
      );
      aiHorde.getImageGenerationStatus.mockReturnValue(of(status));
      const queue = await createQueue();
      const id = await queue.enqueue({
        prompt: 'a cat',
        nsfw: false,
        censor_nsfw,
      });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS + POLL_TICK_MS);

      const images = await queue.getJobImages(id);
      expect(
        images.find((image) => image.imageId === 'out-1')?.metadata,
      ).toMatchObject({
        censored: false,
        state: 'ok',
        genMetadata: [{ type: 'information', value: 'nsfw' }],
      });
      expect(
        images.find((image) => image.imageId === 'unflagged')?.metadata
          ?.genMetadata,
      ).toEqual([]);
    },
  );

  it.each([0, 145, 255])(
    'keeps dry-run estimate, submit quote, progress consumption and final %s kudos separate',
    async (charged) => {
      aiHorde.submitImageGenerationResult
        .mockReturnValueOnce(of(submitSuccess('dry', 180)))
        .mockReturnValue(of(submitSuccess('h1', 210)));
      const queue = await createQueue();
      expect(await queue.estimateKudos({ prompt: 'a cat' })).toBe(180);
      const id = await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      aiHorde.checkImageGenerationResult.mockReturnValue(
        of(checkResult({ check: { kudos: 21 } })),
      );
      await vi.advanceTimersByTimeAsync(POLL_TICK_MS);
      expect(queue.jobs().find((job) => job.localId === id)).toMatchObject({
        quotedKudos: 210,
        kudos: 21,
      });

      aiHorde.checkImageGenerationResult.mockReturnValue(
        of(checkResult({ check: { done: true, processing: 0, kudos: 99 } })),
      );
      aiHorde.getImageGenerationStatus.mockReturnValue(
        of({ ...doneStatus(), kudos: charged }),
      );
      await vi.advanceTimersByTimeAsync(POLL_TICK_MS);
      expect(queue.finishedJobs()[0]).toMatchObject({
        quotedKudos: 210,
        kudos: charged,
      });
    },
  );

  it.each([
    { partial: 37, final: 173 },
    { partial: 84, final: 249 },
    { partial: 0, final: 137 },
  ])(
    'does not freeze partial $partial consumption when the full status contradicts a completed check',
    async ({ partial, final }) => {
      const queue = await createQueue();
      const id = await queue.enqueue({ prompt: 'a cat', params: { n: 2 } });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      aiHorde.checkImageGenerationResult.mockReturnValue(
        of(
          checkResult({
            check: { done: true, processing: 0, finished: 2, kudos: final },
          }),
        ),
      );
      const complete = doneStatus();
      complete.generations.push({ ...complete.generations[0], id: 'out-2' });
      aiHorde.getImageGenerationStatus
        .mockReturnValueOnce(
          of({
            ...complete,
            done: false,
            processing: 1,
            finished: 1,
            kudos: partial,
            generations: complete.generations.slice(0, 1),
          }),
        )
        .mockReturnValue(of({ ...complete, finished: 2, kudos: final }));

      await vi.advanceTimersByTimeAsync(POLL_TICK_MS);

      expect(queue.jobs().find((job) => job.localId === id)?.status).not.toBe(
        'done',
      );
      await vi.advanceTimersByTimeAsync(POLL_TICK_MS * 2);
      expect(aiHorde.getImageGenerationStatus).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(queue.finishedJobs()[0]).toMatchObject({
        kudos: final,
        resultImageIds: ['out-1', 'out-2'],
      });
    },
  );

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
    expect(job.completedAt).toEqual(expect.any(Number));
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

  describe('reading back an adopted request', () => {
    it('fills the request from the horde when the job is adopted', async () => {
      aiHorde.getSubmittedImageRequestResult.mockReturnValue(
        of({
          kind: 'success',
          request: {
            prompt: 'a lighthouse',
            params: { width: 832, height: 1216, steps: 20, n: 2 },
            models: ['m1'],
            source_processing: 'img2img',
            source_image: 'https://r2.example/x_src.webp?sig=1',
          },
        }),
      );
      const queue = await createQueue();

      await queue.adoptActive(['elsewhere-1']);
      await vi.advanceTimersByTimeAsync(0);

      expect(aiHorde.getSubmittedImageRequestResult).toHaveBeenCalledTimes(1);
      expect(aiHorde.getSubmittedImageRequestResult).toHaveBeenCalledWith(
        'test-key',
        'elsewhere-1',
      );
      const job = queue.jobs()[0];
      expect(job.adopted).toBe(true);
      expect(job.requestRecovery).toBe('full');
      expect(job.request).toEqual({
        prompt: 'a lighthouse',
        params: { width: 832, height: 1216, steps: 20, n: 2 },
        models: ['m1'],
        source_processing: 'img2img',
      });
      expect(fakeDb.jobs.get(job.localId)?.request.prompt).toBe('a lighthouse');
      expect(fakeDb.jobs.get(job.localId)?.requestRecovery).toBe('full');
    });

    it('keeps the settings of a request stored without a prompt', async () => {
      aiHorde.getSubmittedImageRequestResult.mockReturnValue(
        of({
          kind: 'success',
          request: { params: { width: 512, height: 512 }, models: ['m1'] },
        }),
      );
      const queue = await createQueue();

      await queue.adoptActive(['legacy-1']);
      await vi.advanceTimersByTimeAsync(0);

      const job = queue.jobs()[0];
      expect(job.requestRecovery).toBe('settings');
      expect(job.request).toEqual({
        prompt: '',
        params: { width: 512, height: 512 },
        models: ['m1'],
      });
    });

    it.each([
      [
        'a refusal',
        () =>
          of({
            kind: 'error',
            error: { status: 403, message: 'no', rc: 'NotRequestOwner' },
          }),
        'refused',
      ],
      [
        'a request the horde no longer has',
        () =>
          of({
            kind: 'error',
            error: { status: 404, message: 'gone', rc: 'RequestNotFound' },
          }),
        'refused',
      ],
      [
        'a horde without the endpoint',
        () => of({ kind: 'missing_route' }),
        'failed',
      ],
      [
        'an endpoint the browser could not reach',
        () => of({ kind: 'error', error: { status: 0, message: 'failed' } }),
        'failed',
      ],
      [
        'a network failure',
        () => throwError(() => new Error('offline')),
        'failed',
      ],
    ])(
      'leaves the placeholder and records the attempt after %s',
      async (_label, answer, outcome) => {
        const warn = vi
          .spyOn(console, 'warn')
          .mockImplementation(() => undefined);
        aiHorde.getSubmittedImageRequestResult.mockImplementation(answer);
        const queue = await createQueue();

        await queue.adoptActive(['elsewhere-1']);
        await vi.advanceTimersByTimeAsync(0);

        const job = queue.jobs()[0];
        expect(job.request).toEqual({ prompt: '' });
        expect(job.requestRecovery).toBe(outcome);
        expect(fakeDb.jobs.get(job.localId)?.requestRecovery).toBe(outcome);
        warn.mockRestore();
      },
    );

    it('keeps both changes when an earlier write lands after a later one', async () => {
      const answer = new Subject<unknown>();
      aiHorde.getSubmittedImageRequestResult.mockReturnValue(answer);
      const queue = await createQueue();
      await queue.adoptActive(['elsewhere-1']);
      const localId = queue.jobs()[0].localId;

      // The first poll's write is held until the read-back has come in, so the
      // write that started first is the one that finishes last.
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const putJob = fakeDb.putJob.bind(fakeDb);
      let held = false;
      vi.spyOn(fakeDb, 'putJob').mockImplementation(async (job) => {
        if (!held && job.queuePosition !== undefined) {
          held = true;
          await gate;
        }
        return putJob(job);
      });
      await vi.advanceTimersByTimeAsync(POLL_TICK_MS);
      expect(held).toBe(true);

      answer.next({ kind: 'success', request: { prompt: 'a lighthouse' } });
      answer.complete();
      await vi.advanceTimersByTimeAsync(0);
      release();
      await vi.advanceTimersByTimeAsync(0);

      const job = queue.jobs()[0];
      expect(job.request.prompt).toBe('a lighthouse');
      expect(job.requestRecovery).toBe('full');
      expect(job.queuePosition).toBe(2);
      const stored = fakeDb.jobs.get(localId);
      expect(stored?.request.prompt).toBe('a lighthouse');
      expect(stored?.queuePosition).toBe(2);
    });

    it('asks once per adopted job, however often the account is read', async () => {
      const queue = await createQueue();

      await queue.adoptActive(['elsewhere-1']);
      await vi.advanceTimersByTimeAsync(0);
      await queue.adoptActive(['elsewhere-1']);
      await vi.advanceTimersByTimeAsync(0);

      expect(aiHorde.getSubmittedImageRequestResult).toHaveBeenCalledTimes(1);
    });

    it('never asks with the anonymous key, which the horde refuses', async () => {
      auth.getStoredApiKey.mockReturnValue('');
      const queue = await createQueue();

      await queue.adoptActive(['elsewhere-1']);
      await vi.advanceTimersByTimeAsync(0);

      expect(aiHorde.getSubmittedImageRequestResult).not.toHaveBeenCalled();
      expect(queue.jobs()[0].requestRecovery).toBe('failed');
    });

    it('resumes request recovery for persisted and interrupted adopted jobs', async () => {
      const stored: LocalGenerationJob[] = [
        {
          localId: 'old-adopted',
          status: 'queued',
          createdAt: 1,
          updatedAt: 1,
          request: { prompt: '' },
          adopted: true,
          hordeId: 'h-old',
          resultImageIds: [],
        },
        {
          localId: 'interrupted',
          status: 'queued',
          createdAt: 2,
          updatedAt: 2,
          request: { prompt: '' },
          adopted: true,
          requestRecovery: 'pending',
          hordeId: 'h-interrupted',
          resultImageIds: [],
        },
      ];
      for (const job of stored) {
        fakeDb.jobs.set(job.localId, job);
      }
      const queue = await createQueue();

      await queue.adoptActive(['h-old', 'h-interrupted']);
      await vi.advanceTimersByTimeAsync(POLL_TICK_MS);

      const asked = aiHorde.getSubmittedImageRequestResult.mock.calls.map(
        (call) => call[1] as string,
      );
      expect(asked).toHaveLength(3);
      expect(asked).toContain('h-old');
      expect(asked).toContain('h-interrupted');
    });

    it.each([0, 429, 500])(
      'retries a transient recovery failure with HTTP status %s and retains server parameters',
      async (status) => {
        aiHorde.getSubmittedImageRequestResult
          .mockReturnValueOnce(
            of({
              kind: 'error',
              error: { status, message: 'temporary', rc: 'TemporaryError' },
            }),
          )
          .mockReturnValue(
            of({
              kind: 'success',
              request: {
                prompt: 'a lighthouse',
                params: { steps: 40 },
                source_image: 'https://example.com/input.png',
              },
            }),
          );
        const queue = await createQueue();
        await queue.adoptActive(['h-retry']);
        await vi.advanceTimersByTimeAsync(0);
        expect(queue.jobs()[0].requestRecovery).toBe('failed');
        await vi.advanceTimersByTimeAsync(14_000);
        expect(aiHorde.getSubmittedImageRequestResult).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(2_000);
        expect(aiHorde.getSubmittedImageRequestResult).toHaveBeenCalledTimes(2);
        expect(queue.jobs()[0]).toMatchObject({
          requestRecovery: 'full',
          request: { prompt: 'a lighthouse', params: { steps: 40 } },
          reportedRequest: { params: { steps: 40 }, source_image: '' },
        });
      },
    );

    it('bounds transient retries and never retries definitive refusals', async () => {
      aiHorde.getSubmittedImageRequestResult.mockImplementation(
        (_key: string, id: string) =>
          of({
            kind: 'error',
            error: {
              status: id === 'refused' ? 403 : 503,
              message: 'unavailable',
              rc: 'Unavailable',
            },
          }),
      );
      const queue = await createQueue();
      await queue.adoptActive(['transient', 'refused']);
      await vi.advanceTimersByTimeAsync(300_000);
      const ids = aiHorde.getSubmittedImageRequestResult.mock.calls.map(
        (call) => call[1],
      );
      expect(ids.filter((id) => id === 'transient')).toHaveLength(5);
      expect(ids.filter((id) => id === 'refused')).toHaveLength(1);
    });

    it('times out unanswered recovery so later attempts can succeed', async () => {
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      aiHorde.getSubmittedImageRequestResult
        .mockReturnValueOnce(new Subject())
        .mockReturnValue(of({ kind: 'success', request: { prompt: 'a cat' } }));
      const queue = await createQueue();
      await queue.adoptActive(['timeout']);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(queue.jobs()[0].requestRecovery).toBe('failed');
      await vi.advanceTimersByTimeAsync(16_000);
      expect(queue.jobs()[0].requestRecovery).toBe('full');
      warn.mockRestore();
    });
  });

  describe('jobs taken in before the horde read requests back', () => {
    const NOT_FOUND = {
      kind: 'error',
      error: { status: 404, message: 'not found', rc: 'RequestNotFound' },
    } as const;

    function storedAdopted(
      localId: string,
      overrides: Partial<LocalGenerationJob> = {},
    ): LocalGenerationJob {
      return {
        localId,
        status: 'done',
        createdAt: 1_000,
        updatedAt: 1_000,
        request: { prompt: '' },
        adopted: true,
        hordeId: `h-${localId}`,
        resultImageIds: [],
        ...overrides,
      };
    }

    function seed(...jobs: LocalGenerationJob[]): void {
      for (const job of jobs) {
        fakeDb.jobs.set(job.localId, job);
      }
    }

    describe('finding out when the horde started reading requests back', () => {
      it('asks once on load and records the moment the endpoint answers', async () => {
        seed(storedAdopted('old'));
        aiHorde.getSubmittedImageRequestResult.mockReturnValue(of(NOT_FOUND));

        const queue = await createQueue();
        await vi.advanceTimersByTimeAsync(0);

        expect(aiHorde.getSubmittedImageRequestResult).toHaveBeenCalledTimes(1);
        const [key, id] = aiHorde.getSubmittedImageRequestResult.mock
          .calls[0] as [string, string];
        expect(key).toBe('test-key');
        expect(id).not.toBe('h-old');
        expect(queue.readBackSince()).not.toBeNull();
        expect(localStorage.getItem(READ_BACK_SINCE_KEY)).toBe(
          String(queue.readBackSince()),
        );
      });

      it.each([
        [
          'an endpoint the browser could not reach',
          { kind: 'error', error: { status: 0, message: 'failed' } },
        ],
        ['a bare 404', { kind: 'missing_route' }],
      ])('records nothing after %s', async (_label, answer) => {
        seed(storedAdopted('old'));
        aiHorde.getSubmittedImageRequestResult.mockReturnValue(of(answer));

        const queue = await createQueue();
        await vi.advanceTimersByTimeAsync(0);

        expect(aiHorde.getSubmittedImageRequestResult).toHaveBeenCalledTimes(1);
        expect(queue.readBackSince()).toBeNull();
        expect(localStorage.getItem(READ_BACK_SINCE_KEY)).toBeNull();
        expect(queue.jobs()).toHaveLength(1);
      });

      it('never asks when no job was taken in from the account', async () => {
        seed({ ...storedAdopted('own'), adopted: undefined });

        await createQueue();
        await vi.advanceTimersByTimeAsync(0);

        expect(aiHorde.getSubmittedImageRequestResult).not.toHaveBeenCalled();
      });

      it('never asks again once the moment is known, and never moves it', async () => {
        localStorage.setItem(READ_BACK_SINCE_KEY, '5000');
        seed(storedAdopted('old'));
        aiHorde.getSubmittedImageRequestResult.mockReturnValue(of(NOT_FOUND));

        const queue = await createQueue();
        await vi.advanceTimersByTimeAsync(0);
        expect(aiHorde.getSubmittedImageRequestResult).not.toHaveBeenCalled();

        await queue.adoptActive(['fresh']);
        await vi.advanceTimersByTimeAsync(0);

        expect(aiHorde.getSubmittedImageRequestResult).toHaveBeenCalledTimes(1);
        expect(queue.readBackSince()).toBe(5000);
        expect(localStorage.getItem(READ_BACK_SINCE_KEY)).toBe('5000');
      });

      it('learns the moment from a job read back on adoption', async () => {
        const queue = await createQueue();
        aiHorde.getSubmittedImageRequestResult.mockReturnValue(
          of({ kind: 'success', request: { prompt: 'a cat' } }),
        );

        await queue.adoptActive(['fresh']);
        await vi.advanceTimersByTimeAsync(0);

        expect(queue.readBackSince()).not.toBeNull();
        // The job that proved it is not held back.
        expect(queue.jobs()).toHaveLength(1);
        expect(queue.hiddenJobs()).toEqual([]);
      });

      it('hears the moment from another tab', async () => {
        seed(storedAdopted('old'));
        const queue = await createQueue();
        expect(queue.hiddenJobs()).toEqual([]);

        localStorage.setItem(READ_BACK_SINCE_KEY, '5000');
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: READ_BACK_SINCE_KEY,
            newValue: '5000',
          }),
        );

        expect(queue.readBackSince()).toBe(5000);
        expect(queue.hiddenJobs().map((job) => job.localId)).toEqual(['old']);
      });
    });

    describe('holding them back', () => {
      beforeEach(() => localStorage.setItem(READ_BACK_SINCE_KEY, '5000'));

      it('leaves them out of every list and keeps the rest', async () => {
        seed(
          storedAdopted('old'),
          storedAdopted('old-pending', { requestRecovery: 'pending' }),
          storedAdopted('old-failed', { requestRecovery: 'failed' }),
          storedAdopted('read-back', { requestRecovery: 'full' }),
          storedAdopted('settings-only', { requestRecovery: 'settings' }),
          storedAdopted('refused', { requestRecovery: 'refused' }),
          storedAdopted('after', { createdAt: 6_000 }),
          storedAdopted('kept', { keptByReader: true }),
          { ...storedAdopted('own'), adopted: undefined },
          storedAdopted('old-running', { status: 'queued' }),
        );

        const queue = await createQueue();

        expect(
          queue
            .hiddenJobs()
            .map((job) => job.localId)
            .sort(),
        ).toEqual(['old', 'old-failed', 'old-pending', 'old-running']);
        const shown = queue.jobs().map((job) => job.localId);
        expect(shown.sort()).toEqual(
          [
            'after',
            'kept',
            'own',
            'read-back',
            'refused',
            'settings-only',
          ].sort(),
        );
        expect(queue.finishedJobs().map((job) => job.localId)).not.toContain(
          'old',
        );
        expect(queue.pendingJobs()).toEqual([]);
      });

      it('deletes nothing on its own', async () => {
        seed(storedAdopted('old'));

        await createQueue();
        await vi.advanceTimersByTimeAsync(POLL_TICK_MS * 3);

        expect(fakeDb.jobs.has('old')).toBe(true);
      });

      it('shows them again when kept, in this tab and the others', async () => {
        seed(storedAdopted('old'));
        const queue = await createQueue();
        const peer = openPeerChannel();

        await queue.keepHiddenJobs();

        expect(queue.hiddenJobs()).toEqual([]);
        expect(queue.jobs().map((job) => job.localId)).toEqual(['old']);
        expect(fakeDb.jobs.get('old')?.keptByReader).toBe(true);
        const app = FakeBroadcastChannel.instances[0];
        expect(app.posted).toContainEqual(
          expect.objectContaining({
            topic: 'generation-job.changed',
            payload: expect.objectContaining({
              localId: 'old',
              keptByReader: true,
            }),
          }),
        );
        peer.close();
      });

      it('shows a job another tab kept', async () => {
        seed(storedAdopted('old'));
        const queue = await createQueue();
        const peer = openPeerChannel();

        postFromPeer(peer, 'generation-job.changed', {
          ...storedAdopted('old'),
          keptByReader: true,
          updatedAt: 2_000,
        });

        expect(queue.hiddenJobs()).toEqual([]);
        expect(queue.jobs().map((job) => job.localId)).toEqual(['old']);
      });

      it('deletes a held-back job with its pictures through the usual delete', async () => {
        seed(storedAdopted('old'), {
          ...storedAdopted('own'),
          adopted: undefined,
        });
        fakeDb.images.set('old::out-1', {
          localId: 'old',
          imageId: 'out-1',
          kind: 'result',
          blob: new Blob(['x']),
          mimeType: 'image/webp',
        });
        const queue = await createQueue();

        await queue.deleteJob(queue.hiddenJobs()[0].localId);

        expect(fakeDb.jobs.has('old')).toBe(false);
        expect(fakeDb.images.size).toBe(0);
        expect(fakeDb.jobs.has('own')).toBe(true);
        expect(queue.hiddenJobs()).toEqual([]);
      });
    });
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
    it('does not recover a finished deletion after the old guard expires or after reload', async () => {
      const queue = await createQueue();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      aiHorde.checkImageGenerationResult.mockReturnValue(
        of(checkResult({ check: { done: true, finished: 1 } })),
      );
      aiHorde.getImageGenerationStatus.mockReturnValue(of(doneStatus()));
      await vi.advanceTimersByTimeAsync(POLL_TICK_MS);
      expect(queue.jobs()[0].status).toBe('done');
      await queue.deleteJob(localId);
      await vi.advanceTimersByTimeAsync(25 * 60_000);
      await queue.adoptActive(['horde-id']);
      expect(queue.jobs()).toEqual([]);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: GenerationDbService, useValue: fakeDb },
          { provide: AiHordeService, useValue: aiHorde },
          { provide: AuthService, useValue: auth },
        ],
      });
      // A stale stored row, even under a different local id, must also stay hidden.
      await fakeDb.putJob({
        localId: 'stale',
        hordeId: 'horde-id',
        status: 'done',
        createdAt: 0,
        updatedAt: 0,
        request: { prompt: '' },
        resultImageIds: [],
      });
      const reloaded = await createQueue();
      await reloaded.adoptActive(['horde-id', 'unrelated']);
      expect(reloaded.jobs().map((job) => job.hordeId)).toEqual(['unrelated']);
    });

    it('finishes local deletion and informs peers without waiting for cancellation', async () => {
      aiHorde.cancelImageGeneration.mockReturnValue(new Subject());
      const queue = await createQueue();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      await queue.deleteJob(localId);
      expect(queue.jobs()).toEqual([]);
      expect(FakeBroadcastChannel.instances[0].posted).toContainEqual(
        expect.objectContaining({
          topic: 'generation-job.deleted',
          payload: { localId, hordeId: 'horde-id' },
        }),
      );
    });

    it('refuses a peer adoption whose server id was deleted in shared storage', async () => {
      const queue = await createQueue();
      localStorage.setItem('aihorde.generate.deleted.horde.deleted-id', '1');
      const peer = openPeerChannel();
      postFromPeer(peer, 'generation-job.added', {
        localId: 'peer-adoption',
        hordeId: 'deleted-id',
        status: 'queued',
        createdAt: 0,
        updatedAt: 0,
        request: { prompt: '' },
        resultImageIds: [],
        adopted: true,
      });
      await queue.adoptActive(['deleted-id']);
      expect(queue.jobs()).toEqual([]);
    });

    it('removes an adoption deleted by a peer while its row is being written', async () => {
      const queue = await createQueue();
      let release!: () => void;
      vi.spyOn(fakeDb, 'putJob').mockImplementationOnce(
        (job) =>
          new Promise<LocalGenerationJob>((resolve) => {
            release = () => {
              fakeDb.jobs.set(job.localId, job);
              resolve(job);
            };
          }),
      );
      const adoption = queue.adoptActive(['deleted-id']);
      localStorage.setItem('aihorde.generate.deleted.horde.deleted-id', '1');
      release();
      await adoption;
      expect(queue.jobs()).toEqual([]);
      expect(fakeDb.jobs.size).toBe(0);
      expect(aiHorde.getSubmittedImageRequestResult).not.toHaveBeenCalled();
    });

    it('removes a late poll write that lands after deletion commits', async () => {
      const queue = await createQueue();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      let release!: () => void;
      vi.spyOn(fakeDb, 'putJob').mockImplementationOnce(
        (job) =>
          new Promise<LocalGenerationJob>((resolve) => {
            release = () => {
              fakeDb.jobs.set(job.localId, job);
              resolve(job);
            };
          }),
      );
      await vi.advanceTimersByTimeAsync(POLL_TICK_MS);
      await queue.deleteJob(localId);
      await vi.advanceTimersByTimeAsync(2 * 60_000);
      release();
      await vi.advanceTimersByTimeAsync(0);
      expect(fakeDb.jobs.size).toBe(0);
      expect(queue.jobs()).toEqual([]);
    });

    it('keeps history that failed deletion usable and leaves no persistent suppression', async () => {
      const queue = await createQueue();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      vi.spyOn(fakeDb, 'deleteJobCascade').mockRejectedValueOnce(
        new Error('storage unavailable'),
      );
      await expect(queue.clearHistory()).rejects.toThrow('storage unavailable');
      expect(
        localStorage.getItem('aihorde.generate.deleted.horde.horde-id'),
      ).toBeNull();
      expect(
        localStorage.getItem(`aihorde.generate.deleted.local.${localId}`),
      ).toBeNull();
      await vi.advanceTimersByTimeAsync(POLL_TICK_MS);
      expect(queue.jobs()[0].status).toBe('processing');
    });

    it.each([false, true])(
      'keeps an in-flight submit consistent when storage deletion succeeds: %s',
      async (succeeds) => {
        const submitted = new Subject<SubmitImageResult>();
        aiHorde.submitImageGenerationResult.mockReturnValue(submitted);
        const queue = await createQueue();
        const localId = await queue.enqueue({ prompt: 'a cat' });
        await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
        let resolveDelete!: () => void;
        let rejectDelete!: (error: Error) => void;
        vi.spyOn(fakeDb, 'deleteJobCascade').mockImplementationOnce(
          () =>
            new Promise<void>((resolve, reject) => {
              resolveDelete = () => {
                fakeDb.jobs.delete(localId);
                resolve();
              };
              rejectDelete = reject;
            }),
        );
        const deletion = queue.deleteJob(localId);
        const settled = deletion.catch((error: unknown) => error);

        submitted.next(submitSuccess('late-id'));
        submitted.complete();
        await vi.advanceTimersByTimeAsync(0);
        expect(queue.jobs()[0].hordeId).toBeUndefined();

        if (succeeds) {
          resolveDelete();
        } else {
          rejectDelete(new Error('storage unavailable'));
        }
        expect(await settled).toEqual(
          succeeds ? undefined : new Error('storage unavailable'),
        );
        await vi.advanceTimersByTimeAsync(0);

        const expectedIds = succeeds ? [] : ['late-id'];
        expect(queue.jobs().map((job) => job.hordeId)).toEqual(expectedIds);
        expect((await fakeDb.getJob(localId))?.hordeId).toBe(
          succeeds ? undefined : 'late-id',
        );
        expect(aiHorde.cancelImageGeneration.mock.calls).toEqual(
          succeeds ? [['late-id']] : [],
        );
        expect(aiHorde.submitImageGenerationResult).toHaveBeenCalledTimes(1);
        await queue.adoptActive(['late-id']);
        expect(queue.jobs().map((job) => job.hordeId)).toEqual(expectedIds);
      },
    );

    it('keeps a flagged batch and its images when storage deletion fails, then allows retry', async () => {
      const row: LocalGenerationJob = {
        localId: 'mixed',
        status: 'done',
        createdAt: 0,
        updatedAt: 0,
        request: { prompt: 'a cat' },
        resultImageIds: ['image'],
        csamCensoredCount: 1,
        fetchFailedCount: 1,
      };
      await fakeDb.putJob(row);
      await fakeDb.putImage({
        localId: 'mixed',
        imageId: 'image',
        kind: 'result',
        blob: new Blob(['image']),
        mimeType: 'image/webp',
      });
      const queue = await createQueue();
      const remove = vi
        .spyOn(fakeDb, 'deleteJobCascade')
        .mockRejectedValueOnce(new Error('storage unavailable'));

      await expect(queue.deleteJob('mixed')).rejects.toThrow(
        'storage unavailable',
      );
      expect(queue.finishedJobs()).toEqual([row]);
      expect(await fakeDb.getJob('mixed')).toEqual(row);
      expect(await queue.getJobImages('mixed')).toHaveLength(1);

      await queue.deleteJob('mixed');
      expect(remove).toHaveBeenCalledTimes(2);
      expect(queue.jobs()).toEqual([]);
      expect(await fakeDb.getJob('mixed')).toBeUndefined();
      expect(await queue.getJobImages('mixed')).toEqual([]);
    });

    it('allows a waiting job to submit after its storage deletion fails', async () => {
      const queue = await createQueue();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      vi.spyOn(fakeDb, 'deleteJobCascade').mockRejectedValueOnce(
        new Error('storage unavailable'),
      );

      await expect(queue.deleteJob(localId)).rejects.toThrow(
        'storage unavailable',
      );
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);

      expect(queue.jobs()[0].status).toBe('requested');
      expect(queue.jobs()[0].hordeId).toBe('horde-id');
      expect((await fakeDb.getJob(localId))?.hordeId).toBe('horde-id');
      expect(aiHorde.cancelImageGeneration).not.toHaveBeenCalled();
    });

    it('keeps polling a running job after failed storage deletion without cancelling it', async () => {
      const queue = await createQueue();
      const localId = await queue.enqueue({ prompt: 'a cat' });
      await vi.advanceTimersByTimeAsync(DISPATCH_TICK_MS);
      vi.spyOn(fakeDb, 'deleteJobCascade').mockRejectedValueOnce(
        new Error('storage unavailable'),
      );
      aiHorde.checkImageGenerationResult.mockReturnValue(
        of(checkResult({ check: { processing: 1, waiting: 0 } })),
      );

      await expect(queue.deleteJob(localId)).rejects.toThrow(
        'storage unavailable',
      );
      await vi.advanceTimersByTimeAsync(POLL_TICK_MS);

      expect(aiHorde.cancelImageGeneration).not.toHaveBeenCalled();
      expect(queue.jobs()[0].status).toBe('processing');
      expect((await fakeDb.getJob(localId))?.status).toBe('processing');
    });

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
