import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { GenerationDbService } from './generation-db.service';
import {
  LocalGenerationJob,
  sessionStatsToday,
  StoredImageKind,
  StoredJobImage,
  StoredSourceDraft,
} from '../types/generation-job';

function makeJob(
  overrides: Partial<LocalGenerationJob> = {},
): LocalGenerationJob {
  const now = Date.now();
  return {
    localId: crypto.randomUUID(),
    status: 'waiting',
    createdAt: now,
    updatedAt: now,
    request: { prompt: 'a cat' },
    resultImageIds: [],
    ...overrides,
  };
}

function makeImage(
  localId: string,
  imageId: string,
  kind: StoredImageKind = 'result',
): StoredJobImage {
  return {
    localId,
    imageId,
    kind,
    blob: new Blob([imageId], { type: 'image/webp' }),
    mimeType: 'image/webp',
  };
}

describe('GenerationDbService', () => {
  let service: GenerationDbService;

  beforeEach(() => {
    // Fresh backing store per test so nothing leaks between cases.
    globalThis.indexedDB = new IDBFactory();
    TestBed.configureTestingModule({});
    service = TestBed.inject(GenerationDbService);
  });

  it('round-trips a job through put/get', async () => {
    const job = makeJob({ localId: 'j1', hordeId: 'h1' });
    await service.putJob(job);

    const loaded = await service.getJob('j1');
    expect(loaded).toEqual(job);
  });

  it('keeps a saved content marking when a stale tab writes newer job metadata', async () => {
    const original = makeJob({
      localId: 'marked',
      status: 'done',
      request: { prompt: 'a cat', nsfw: true },
    });
    await service.putJob(original);
    const marked = await service.putJob(original, false);
    const updated = await service.putJob({
      ...original,
      updatedAt: original.updatedAt + 100,
      kudos: 7,
    });

    expect(updated).toMatchObject({
      requestNsfwOverride: false,
      requestNsfwRevision: 1,
      kudos: 7,
    });
    expect(marked?.request).toEqual(original.request);
    expect((await service.getJob('marked'))?.requestNsfwOverride).toBe(false);
  });

  it('edits only the marking when the store has newer server completion metadata', async () => {
    const stale = makeJob({ localId: 'marked', updatedAt: 10 });
    await service.putJob(stale);
    await service.putJob({
      ...stale,
      status: 'done',
      updatedAt: 20,
      kudos: 8,
      resultImageIds: ['finished'],
      request: { prompt: 'recovered', nsfw: true },
    });

    await service.putJob({ ...stale, updatedAt: 30 }, false);

    expect(await service.getJob('marked')).toMatchObject({
      status: 'done',
      updatedAt: 30,
      completedAt: 20,
      kudos: 8,
      resultImageIds: ['finished'],
      request: { prompt: 'recovered', nsfw: true },
      requestNsfwOverride: false,
      requestNsfwRevision: 1,
    });
  });

  it('serializes competing content edits using store revisions even at the same timestamp', async () => {
    const original = makeJob({ localId: 'marked' });
    await service.putJob(original);

    const edits = await Promise.all([
      service.putJob(original, false),
      service.putJob(original, true),
      service.putJob(original, false),
    ]);

    expect(edits.map((job) => job?.requestNsfwRevision)).toEqual([1, 2, 3]);
    expect(await service.getJob('marked')).toMatchObject({
      requestNsfwOverride: false,
      requestNsfwRevision: 3,
    });
    await service.putJob({
      ...original,
      requestNsfwOverride: true,
      requestNsfwRevision: 2,
    });
    expect((await service.getJob('marked'))?.requestNsfwOverride).toBe(false);
  });

  it('retains an existing unversioned content marking on an unrelated update', async () => {
    const original = makeJob({ localId: 'legacy', requestNsfwOverride: false });
    await service.putJob(original);
    await service.putJob({
      ...original,
      requestNsfwOverride: undefined,
      kudos: 8,
    });
    expect(await service.getJob('legacy')).toMatchObject({
      requestNsfwOverride: false,
      kudos: 8,
    });
  });

  it('does not recreate a deleted request when a content edit arrives late', async () => {
    const original = makeJob({ localId: 'deleted' });
    await service.putJob(original);
    await service.deleteJobCascade(original.localId);
    expect(await service.putJob(original, false)).toBeUndefined();
    expect(await service.getJob(original.localId)).toBeUndefined();
  });

  it('lists jobs newest first', async () => {
    await service.putJob(makeJob({ localId: 'old', createdAt: 100 }));
    await service.putJob(makeJob({ localId: 'new', createdAt: 300 }));
    await service.putJob(makeJob({ localId: 'mid', createdAt: 200 }));

    const jobs = await service.listJobs();
    expect(jobs.map((job) => job.localId)).toEqual(['new', 'mid', 'old']);
  });

  it('filters jobs by status via the index', async () => {
    await service.putJob(makeJob({ localId: 'a', status: 'waiting' }));
    await service.putJob(makeJob({ localId: 'b', status: 'done' }));
    await service.putJob(makeJob({ localId: 'c', status: 'done' }));

    const done = await service.listJobsByStatus('done');
    expect(done.map((job) => job.localId).sort()).toEqual(['b', 'c']);
  });

  it('stores and retrieves images for a job', async () => {
    await service.putImage(makeImage('j1', 'img-1'));
    await service.putImage(makeImage('j1', 'img-2', 'source'));
    await service.putImage(makeImage('j2', 'other'));

    const images = await service.getImagesForJob('j1');
    expect(images.map((image) => image.imageId).sort()).toEqual([
      'img-1',
      'img-2',
    ]);

    const single = await service.getImage('j1', 'img-2');
    expect(single?.kind).toBe('source');
  });

  it('cascade-deletes a job together with its images', async () => {
    await service.putJob(makeJob({ localId: 'j1' }));
    await service.putImage(makeImage('j1', 'img-1'));
    await service.putImage(makeImage('j1', 'img-2'));
    await service.putJob(makeJob({ localId: 'j2' }));
    await service.putImage(makeImage('j2', 'keep'));

    await service.deleteJobCascade('j1');

    expect(await service.getJob('j1')).toBeUndefined();
    expect(await service.getImagesForJob('j1')).toEqual([]);
    // Unrelated job and its image are untouched.
    expect(await service.getJob('j2')).toBeDefined();
    expect(await service.getImagesForJob('j2')).toHaveLength(1);
  });

  describe('deleting individual results', () => {
    beforeEach(async () => {
      await service.putJob(
        makeJob({
          localId: 'batch',
          status: 'done',
          resultImageIds: ['bad', 'good'],
        }),
      );
      await service.putImage(makeImage('batch', 'bad'));
      await service.putImage(makeImage('batch', 'good'));
      await service.putImage(makeImage('batch', 'source', 'source'));
    });

    it('persists the surviving result and source across reads', async () => {
      await service.deleteResults('batch', {
        imageIds: ['bad'],
        censoredIndices: [],
        fetchFailedIndices: [],
      });
      expect((await service.getJob('batch'))?.resultImageIds).toEqual(['good']);
      expect(
        (await service.getImagesForJob('batch'))
          .map((image) => image.imageId)
          .sort(),
      ).toEqual(['good', 'source']);
      expect(await service.countResultPictures()).toBe(1);
    });

    it('removes the job and source only when its last result is deleted', async () => {
      expect(
        await service.deleteResults('batch', {
          imageIds: ['bad', 'good'],
          censoredIndices: [],
          fetchFailedIndices: [],
        }),
      ).toBeNull();
      expect(await service.getJob('batch')).toBeUndefined();
      expect(await service.getImagesForJob('batch')).toEqual([]);
    });

    it('keeps good images when deleting censored and unfetched placeholders', async () => {
      const job = (await service.getJob('batch'))!;
      await service.putJob({
        ...job,
        csamCensoredCount: 2,
        fetchFailedCount: 1,
      });
      await service.deleteResults('batch', {
        imageIds: [],
        censoredIndices: [0],
        fetchFailedIndices: [0],
      });
      expect(await service.getJob('batch')).toMatchObject({
        resultImageIds: ['bad', 'good'],
        csamCensoredCount: 1,
        fetchFailedCount: 0,
      });
      expect(await service.countResultPictures()).toBe(3);
    });

    it('serializes concurrent deletions without restoring either result', async () => {
      await Promise.all([
        service.deleteResults('batch', {
          imageIds: ['bad'],
          censoredIndices: [],
          fetchFailedIndices: [],
        }),
        service.deleteResults('batch', {
          imageIds: ['good'],
          censoredIndices: [],
          fetchFailedIndices: [],
        }),
      ]);
      expect(await service.getJob('batch')).toBeUndefined();
      expect(await service.getImagesForJob('batch')).toEqual([]);
    });

    it('preserves deletion across stale metadata writes and late image writes', async () => {
      const stale = (await service.getJob('batch'))!;
      await service.deleteResults('batch', {
        imageIds: ['bad'],
        censoredIndices: [],
        fetchFailedIndices: [],
      });
      const saved = await service.putJob({
        ...stale,
        updatedAt: Date.now() + 1000,
        keptByReader: true,
      });
      await service.putImage(makeImage('batch', 'bad'));
      expect(saved).toMatchObject({
        resultImageIds: ['good'],
        keptByReader: true,
        resultRevision: 1,
      });
      expect((await service.getJob('batch'))?.resultImageIds).toEqual(['good']);
      expect(await service.getImage('batch', 'bad')).toBeUndefined();
      expect(await service.getImage('batch', 'good')).toBeDefined();
      expect(await service.getImage('batch', 'source')).toBeDefined();
      expect(await service.countResultPictures()).toBe(1);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const reopened = TestBed.inject(GenerationDbService);
      const afterReload = await reopened.putJob({
        ...stale,
        updatedAt: Date.now() + 2000,
      });
      expect(afterReload?.resultImageIds).toEqual(['good']);
      await reopened.putImage(makeImage('batch', 'bad'));
      expect(await reopened.getImage('batch', 'bad')).toBeUndefined();
    });

    it.each([true, false])(
      'preserves deletion with writes queued before deletion: %s',
      async (writeFirst) => {
        const stale = (await service.getJob('batch'))!;
        const write = () =>
          service.putJob({ ...stale, updatedAt: Date.now() + 1000 });
        const remove = () =>
          service.deleteResults('batch', {
            imageIds: ['bad'],
            censoredIndices: [],
            fetchFailedIndices: [],
          });
        await Promise.all(
          writeFirst ? [write(), remove()] : [remove(), write()],
        );
        expect((await service.getJob('batch'))?.resultImageIds).toEqual([
          'good',
        ]);
        expect(await service.getImage('batch', 'bad')).toBeUndefined();
      },
    );

    it('keeps a durable tombstone after the last result, including after reload', async () => {
      const stale = (await service.getJob('batch'))!;
      await service.deleteResults('batch', {
        imageIds: ['bad', 'good'],
        censoredIndices: [],
        fetchFailedIndices: [],
      });
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const reopened = TestBed.inject(GenerationDbService);
      expect(
        await reopened.putJob({ ...stale, updatedAt: Date.now() + 1000 }),
      ).toBeUndefined();
      await reopened.putImage(makeImage('batch', 'bad'));
      await reopened.putImage(makeImage('batch', 'source', 'source'));
      expect(await reopened.getJob('batch')).toBeUndefined();
      expect(await reopened.getImagesForJob('batch')).toEqual([]);
    });

    it('retains result deletion protection when the batch is subsequently cleared', async () => {
      const stale = (await service.getJob('batch'))!;
      await service.deleteResults('batch', {
        imageIds: ['bad'],
        censoredIndices: [],
        fetchFailedIndices: [],
      });
      await service.clearAll();
      expect(await service.putJob(stale)).toBeUndefined();
      await service.putImage(makeImage('batch', 'good'));
      expect(await service.countJobs()).toBe(0);
      expect(await service.getImagesForJob('batch')).toEqual([]);
    });

    it('rolls back the inventory, job and images together when image deletion aborts', async () => {
      const original = IDBObjectStore.prototype.delete;
      const remove = vi
        .spyOn(IDBObjectStore.prototype, 'delete')
        .mockImplementation(function (this: IDBObjectStore, key) {
          const request = original.call(this, key);
          if (this.name === 'generationImages') this.transaction.abort();
          return request;
        });
      try {
        await expect(
          service.deleteResults('batch', {
            imageIds: ['bad'],
            censoredIndices: [],
            fetchFailedIndices: [],
          }),
        ).rejects.toThrow();
      } finally {
        remove.mockRestore();
      }
      const job = (await service.getJob('batch'))!;
      expect(job.resultImageIds).toEqual(['bad', 'good']);
      expect(job.resultRevision).toBeUndefined();
      expect(await service.getImage('batch', 'bad')).toBeDefined();
      expect(await service.getImage('batch', 'good')).toBeDefined();
      expect((await service.putJob(job))?.resultImageIds).toEqual([
        'bad',
        'good',
      ]);
    });

    it('does not remove another placeholder when two tabs delete the same placeholder', async () => {
      const job = (await service.getJob('batch'))!;
      await service.putJob({
        ...job,
        csamCensoredCount: 2,
        fetchFailedCount: 2,
      });
      const selection = {
        imageIds: [],

        censoredIndices: [0],
        fetchFailedIndices: [1],
      };
      await Promise.all([
        service.deleteResults('batch', selection),
        service.deleteResults('batch', selection),
      ]);
      const survivor = (await service.getJob('batch'))!;
      expect(survivor).toMatchObject({
        resultImageIds: ['bad', 'good'],
        censoredResultIndices: [1],
        fetchFailedResultIndices: [0],
        csamCensoredCount: 1,
        fetchFailedCount: 1,
        resultRevision: 1,
      });
      const staleWrite = await service.putJob({
        ...job,
        csamCensoredCount: 2,
        fetchFailedCount: 2,
        updatedAt: Date.now() + 1000,
      });
      expect(staleWrite?.csamCensoredCount).toBe(1);
      expect(staleWrite?.fetchFailedCount).toBe(1);
    });

    it('keeps completion time and the original request and cost after deletion', async () => {
      const noon = new Date().setHours(12, 0, 0, 0);
      const original = makeJob({
        localId: 'timed',
        status: 'done',
        createdAt: noon - 600_000,
        updatedAt: noon - 590_000,
        request: { prompt: 'a cat', params: { n: 2 } },
        resultImageIds: ['bad', 'good'],
        kudos: 20,
      });
      await service.putJob(original);
      await service.deleteResults('timed', {
        imageIds: ['bad'],
        censoredIndices: [],
        fetchFailedIndices: [],
      });
      const saved = (await service.getJob('timed'))!;
      expect(saved.completedAt).toBe(original.updatedAt);
      expect(saved.request).toEqual(original.request);
      expect(saved.kudos).toBe(20);
      expect(sessionStatsToday([saved], noon)).toEqual({
        images: 1,
        kudos: 20,
        averageWaitSeconds: 10,
      });
      const edited = await service.putJob({
        ...saved,
        updatedAt: noon + 1000,
        completedAt: noon + 1000,
      });
      expect(edited?.completedAt).toBe(original.updatedAt);
    });

    it('refuses to remove results from an unfinished request', async () => {
      const job = (await service.getJob('batch'))!;
      await service.putJob({ ...job, status: 'processing' });
      expect(
        await service.deleteResults('batch', {
          imageIds: ['bad'],
          censoredIndices: [],
          fetchFailedIndices: [],
        }),
      ).toBeUndefined();
      expect(await service.getImage('batch', 'bad')).toBeDefined();
    });
  });

  it('prunes the oldest terminal jobs and their blobs beyond the retention count', async () => {
    for (let i = 0; i < 4; i++) {
      const localId = `done-${i}`;
      await service.putJob(
        makeJob({ localId, status: 'done', createdAt: 100 + i }),
      );
      await service.putImage(makeImage(localId, `img-${i}`));
    }
    // An in-flight job must never be pruned regardless of age.
    await service.putJob(
      makeJob({ localId: 'live', status: 'processing', createdAt: 1 }),
    );

    await service.pruneFinishedJobs(2);

    const remaining = await service.listJobs();
    const remainingIds = remaining.map((job) => job.localId).sort();
    // Oldest two terminal jobs pruned, newest two kept, live job kept.
    expect(remainingIds).toEqual(['done-2', 'done-3', 'live']);
    // Pruned jobs' blobs are gone; kept jobs' blobs remain.
    expect(await service.getImagesForJob('done-0')).toEqual([]);
    expect(await service.getImagesForJob('done-3')).toHaveLength(1);
  });

  it('does not prune when terminal jobs are within the retention count', async () => {
    await service.putJob(makeJob({ localId: 'd1', status: 'done' }));
    await service.putJob(makeJob({ localId: 'd2', status: 'error' }));

    await service.pruneFinishedJobs(50);

    expect(await service.listJobs()).toHaveLength(2);
  });

  const DB_NAME = 'ai-horde-frontpage';

  /**
   * Provision a database carrying an unrelated store layout at `version`,
   * mimicking a browser that holds a differently-shaped `ai-horde-frontpage`
   * database from an earlier or foreign build.
   */
  async function seedForeignDb(version: number): Promise<void> {
    const db = await openDB(DB_NAME, version, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('legacyStuff')) {
          database.createObjectStore('legacyStuff');
        }
      },
    });
    db.close();
  }

  it('recovers when an existing database at the current version has a foreign layout', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Sits at the service's own version, so no upgrade fires: recovery must be
    // the delete-and-recreate path, not a migration.
    await seedForeignDb(4);

    await service.putJob(makeJob({ localId: 'r1' }));

    expect((await service.getJob('r1'))?.localId).toBe('r1');
    expect(await service.listJobs()).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('recovers from a database at an incompatible newer version', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Newer than the service requests, so the open fails with VersionError.
    await seedForeignDb(5);

    await service.putJob(makeJob({ localId: 'v1' }));

    expect((await service.getJob('v1'))?.localId).toBe('v1');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  /**
   * Provision a database at `version` that already carries this service's own
   * stores, mimicking a browser that has been through a later build of the app.
   */
  async function seedNewerCompatibleDb(version: number): Promise<void> {
    const db = await openDB(DB_NAME, version, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('generationJobs')) {
          const jobs = database.createObjectStore('generationJobs', {
            keyPath: 'localId',
          });
          jobs.createIndex('status', 'status');
          jobs.createIndex('createdAt', 'createdAt');
        }
        if (!database.objectStoreNames.contains('generationImages')) {
          const images = database.createObjectStore('generationImages', {
            keyPath: ['localId', 'imageId'],
          });
          images.createIndex('localId', 'localId');
        }
        if (!database.objectStoreNames.contains('somethingNewer')) {
          database.createObjectStore('somethingNewer');
        }
      },
    });
    await db.put('generationJobs', makeJob({ localId: 'fromNewerBuild' }));
    db.close();
  }

  it('adopts a newer database that still carries the required stores', async () => {
    // Rolling back to an older bundle must not cost the user their history:
    // schema growth is additive, so a later database still carries everything
    // this build reads.
    await seedNewerCompatibleDb(5);

    await service.putJob(makeJob({ localId: 'afterRollback' }));

    expect((await service.getJob('fromNewerBuild'))?.localId).toBe(
      'fromNewerBuild',
    );
    expect((await service.getJob('afterRollback'))?.localId).toBe(
      'afterRollback',
    );
  });

  it('upgrades legacy jobs without losing images and freezes their old completion time on edit', async () => {
    await seedNewerCompatibleDb(3);
    const oldDb = await openDB(DB_NAME, 3);
    const legacy = makeJob({
      localId: 'legacy',
      status: 'done',
      updatedAt: 20_000,
      resultImageIds: ['keep'],
    });
    await oldDb.put('generationJobs', legacy);
    await oldDb.put('generationImages', makeImage('legacy', 'keep'));
    oldDb.close();
    expect(await service.getJob('legacy')).toEqual(legacy);
    const saved = await service.putJob({ ...legacy, updatedAt: 100_000 });
    expect(saved?.completedAt).toBe(20_000);
    expect(await service.getImage('legacy', 'keep')).toBeDefined();
  });

  it('counts stored jobs', async () => {
    await service.putJob(makeJob({ localId: 'c1' }));
    await service.putJob(makeJob({ localId: 'c2' }));

    expect(await service.countJobs()).toBe(2);
  });

  it('counts stored pictures the way the results grid lays out tiles', async () => {
    await service.putJob(
      makeJob({
        localId: 'done-a',
        status: 'done',
        resultImageIds: ['a1', 'a2'],
        csamCensoredCount: 1,
      }),
    );
    await service.putImage(makeImage('done-a', 'a1'));
    await service.putImage(makeImage('done-a', 'a2'));
    await service.putImage(makeImage('done-a', 'src', 'source'));
    await service.putJob(
      makeJob({
        localId: 'done-b',
        status: 'done',
        resultImageIds: ['b1'],
        fetchFailedCount: 2,
      }),
    );
    await service.putImage(makeImage('done-b', 'b1'));
    // Neither an unfinished nor a failed job has placeholder pictures of its
    // own, and a job's source picture is not one of its results.
    await service.putJob(
      makeJob({
        localId: 'running',
        status: 'processing',
        fetchFailedCount: 3,
      }),
    );
    await service.putJob(makeJob({ localId: 'failed', status: 'error' }));
    await service.putImage(makeImage('failed', 'mask', 'mask'));

    expect(await service.countResultPictures()).toBe(6);
  });

  it('counts no pictures in an empty store', async () => {
    expect(await service.countResultPictures()).toBe(0);
  });

  it('clears every job and image blob', async () => {
    await service.putJob(makeJob({ localId: 'w1' }));
    await service.putImage(makeImage('w1', 'i1'));

    await service.clearAll();

    expect(await service.listJobs()).toEqual([]);
    expect(await service.getImagesForJob('w1')).toEqual([]);
    expect(await service.countJobs()).toBe(0);
  });

  it('keeps the attached picture across a reload of the studio', async () => {
    const draft: StoredSourceDraft = {
      id: 'studio',
      savedAt: Date.now(),
      source: new Blob(['picture'], { type: 'image/webp' }),
      mask: new Blob(['mask'], { type: 'image/png' }),
      extras: [
        { blob: new Blob(['extra'], { type: 'image/webp' }), strength: 0.5 },
      ],
    };

    await service.putSourceDraft(draft);

    // The backing store clones blobs opaquely, so the round trip is read off
    // what travels with them rather than off the bytes.
    const loaded = await service.getSourceDraft('studio');
    expect(loaded?.savedAt).toBe(draft.savedAt);
    expect(loaded?.source).toBeDefined();
    expect(loaded?.mask).not.toBeNull();
    expect(loaded?.extras).toHaveLength(1);
    expect(loaded?.extras[0].strength).toBe(0.5);
  });

  it('keeps one picture per id, so putting again replaces it', async () => {
    const base = { id: 'studio', savedAt: 1, mask: null, extras: [] };
    const replacement = {
      ...base,
      savedAt: 2,
      source: new Blob(['a longer second picture'], { type: 'image/webp' }),
    };
    await service.putSourceDraft({
      ...base,
      source: new Blob(['first'], { type: 'image/webp' }),
    });
    await service.putSourceDraft(replacement);

    expect((await service.getSourceDraft('studio'))?.savedAt).toBe(2);
  });

  it('forgets an attached picture once it is detached', async () => {
    await service.putSourceDraft({
      id: 'studio',
      savedAt: Date.now(),
      source: new Blob(['picture'], { type: 'image/webp' }),
      mask: null,
      extras: [],
    });

    await service.deleteSourceDraft('studio');

    expect(await service.getSourceDraft('studio')).toBeUndefined();
  });

  it('holds the picture put aside for a tutorial apart from the bench one', async () => {
    const putAside: StoredSourceDraft = {
      id: 'set-aside',
      savedAt: 2,
      source: new Blob(['put aside'], { type: 'image/webp' }),
      mask: null,
      extras: [],
    };
    await service.putSourceDraft({
      id: 'studio',
      savedAt: 1,
      source: new Blob(['bench'], { type: 'image/webp' }),
      mask: null,
      extras: [],
    });
    await service.putSourceDraft(putAside);

    await service.deleteSourceDraft('studio');

    expect(await service.getSourceDraft('studio')).toBeUndefined();
    expect((await service.getSourceDraft('set-aside'))?.savedAt).toBe(
      putAside.savedAt,
    );
  });

  it('migrates a pre-existing v1 database without losing schema access', async () => {
    // A v1 database opened at v2 takes the idempotent upgrade path; stores are
    // created and writes succeed either way.
    await seedForeignDb(1);

    await service.putJob(makeJob({ localId: 'm1' }));

    expect((await service.getJob('m1'))?.localId).toBe('m1');
  });

  it('does not wipe a valid database when it is reopened by a fresh instance', async () => {
    await service.putJob(makeJob({ localId: 'survivor', hordeId: 'h1' }));

    // A second service instance shares the same backing store but starts with
    // its own un-opened db promise, reproducing a page reload.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reopened = TestBed.inject(GenerationDbService);

    const loaded = await reopened.getJob('survivor');
    expect(loaded?.localId).toBe('survivor');
    expect(loaded?.hordeId).toBe('h1');
  });
});
