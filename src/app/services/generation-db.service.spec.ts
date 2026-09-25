import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { GenerationDbService } from './generation-db.service';
import {
  LocalGenerationJob,
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
    await seedForeignDb(3);

    await service.putJob(makeJob({ localId: 'r1' }));

    expect((await service.getJob('r1'))?.localId).toBe('r1');
    expect(await service.listJobs()).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('recovers from a database at an incompatible newer version', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Newer than the service requests, so the open fails with VersionError.
    await seedForeignDb(4);

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
    await seedNewerCompatibleDb(4);

    await service.putJob(makeJob({ localId: 'afterRollback' }));

    expect((await service.getJob('fromNewerBuild'))?.localId).toBe(
      'fromNewerBuild',
    );
    expect((await service.getJob('afterRollback'))?.localId).toBe(
      'afterRollback',
    );
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
