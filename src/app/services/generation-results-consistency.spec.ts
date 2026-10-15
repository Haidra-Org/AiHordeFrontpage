import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { GenerationDbService } from './generation-db.service';
import { GenerationQueueService } from './generation-queue.service';
import { AiHordeService } from './ai-horde.service';
import { AuthService } from './auth.service';
import { FakeBroadcastChannel } from '../testing/fake-broadcast-channel';
import { LocalGenerationJob } from '../types/generation-job';

describe('generation result consistency across storage and queue state', () => {
  let db: GenerationDbService;
  let queue: GenerationQueueService;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    localStorage.setItem('aihorde.generate.read-back-since', '1');
    FakeBroadcastChannel.reset();
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AiHordeService,
          useValue: {
            getSubmittedImageRequestResult: vi.fn(() =>
              of({ kind: 'missing_route' }),
            ),
          },
        },
        {
          provide: AuthService,
          useValue: { getStoredApiKey: () => 'test-key' },
        },
      ],
    });
    db = TestBed.inject(GenerationDbService);
    const job: LocalGenerationJob = {
      localId: 'batch',
      status: 'done',
      createdAt: 0,
      updatedAt: 10,
      adopted: true,
      hordeId: 'batch-horde',
      request: { prompt: 'cat', params: { n: 2 } },
      resultImageIds: ['bad', 'good'],
    };
    await db.putJob(job);
    for (const imageId of job.resultImageIds) {
      await db.putImage({
        localId: 'batch',
        imageId,
        kind: 'result',
        blob: new Blob([imageId]),
        mimeType: 'image/png',
      });
    }
    queue = TestBed.inject(GenerationQueueService);
    await queue.whenReady();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('uses the canonical saved inventory when a peer deletion has not yet been announced', async () => {
    await db.deleteResults('batch', {
      imageIds: ['bad'],
      censoredIndices: [],
      fetchFailedIndices: [],
    });
    await queue.keepHiddenJobs();
    expect(queue.finishedJobs()[0]).toMatchObject({
      resultImageIds: ['good'],
      resultRevision: 1,
      completedAt: 10,
      keptByReader: true,
    });
    expect((await db.getJob('batch'))?.resultImageIds).toEqual(['good']);
    expect(FakeBroadcastChannel.instances[0].posted).toContainEqual(
      expect.objectContaining({
        topic: 'generation-job.changed',
        payload: expect.objectContaining({ resultImageIds: ['good'] }),
      }),
    );
  });

  it.each([false, true])(
    'does not restore results when a pending metadata write lands after deletion; last result: %s',
    async (last) => {
      let release!: () => void;
      let started!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const write = db.putJob.bind(db);
      vi.spyOn(db, 'putJob').mockImplementationOnce(async (job) => {
        started();
        await gate;
        return write(job);
      });
      const keeping = queue.keepHiddenJobs();
      await entered;
      try {
        await queue.deleteResults('batch', {
          imageIds: last ? ['bad', 'good'] : ['bad'],
          censoredIndices: [],
          fetchFailedIndices: [],
        });
      } finally {
        release();
      }
      await keeping;
      expect(await db.getImage('batch', 'bad')).toBeUndefined();
      expect(queue.jobs().map((job) => job.resultImageIds)).toEqual(
        last ? [] : [['good']],
      );
      expect((await db.getJob('batch'))?.resultImageIds).toEqual(
        last ? undefined : ['good'],
      );
      expect(
        (await db.getImagesForJob('batch')).map((image) => image.imageId),
      ).toEqual(last ? [] : ['good']);
    },
  );
});
