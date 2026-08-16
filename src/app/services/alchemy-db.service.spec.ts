import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { TestBed } from '@angular/core/testing';
import { AlchemyDbService } from './alchemy-db.service';
import { GenerationDbService } from './generation-db.service';
import {
  StoredAlchemyImage,
  StoredAlchemyImageKind,
  StoredAlchemyJob,
} from '../types/alchemy-job';

function makeJob(overrides: Partial<StoredAlchemyJob> = {}): StoredAlchemyJob {
  const now = Date.now();
  return {
    localId: crypto.randomUUID(),
    jobId: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    forms: ['caption'],
    slowWorkers: true,
    sourceMode: 'upload',
    status: null,
    done: false,
    faulted: false,
    cancelled: false,
    notFound: false,
    storedResultForms: [],
    failedResultForms: [],
    ...overrides,
  };
}

function makeImage(
  localId: string,
  imageId: string,
  kind: StoredAlchemyImageKind = 'result',
): StoredAlchemyImage {
  return {
    localId,
    imageId,
    kind,
    blob: new Blob([imageId], { type: 'image/webp' }),
    mimeType: 'image/webp',
  };
}

describe('AlchemyDbService', () => {
  let service: AlchemyDbService;

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    TestBed.configureTestingModule({});
    service = TestBed.inject(AlchemyDbService);
  });

  it('round-trips a job through put/get', async () => {
    const job = makeJob({ localId: 'j1', jobId: 'h1' });
    await service.putJob(job);

    expect(await service.getJob('j1')).toEqual(job);
  });

  it('keeps the whole polled status, including per-form results', async () => {
    const job = makeJob({
      localId: 'j2',
      status: {
        state: 'done',
        forms: [
          { form: 'caption', state: 'done', result: { caption: 'a cat' } },
          {
            form: 'GFPGAN',
            state: 'done',
            result: { GFPGAN: 'https://r2.example/out.webp' },
          },
        ],
      },
    });
    await service.putJob(job);

    const loaded = await service.getJob('j2');
    expect(loaded?.status?.forms?.[0].result?.caption).toBe('a cat');
    expect(loaded?.status?.forms?.[1].result?.['GFPGAN']).toBe(
      'https://r2.example/out.webp',
    );
  });

  it('lists jobs newest first', async () => {
    await service.putJob(makeJob({ localId: 'old', createdAt: 1000 }));
    await service.putJob(makeJob({ localId: 'new', createdAt: 2000 }));

    expect((await service.listJobs()).map((j) => j.localId)).toEqual([
      'new',
      'old',
    ]);
  });

  it('finds a job by its horde id', async () => {
    await service.putJob(makeJob({ localId: 'j3', jobId: 'horde-3' }));

    expect((await service.getJobByHordeId('horde-3'))?.localId).toBe('j3');
    expect(await service.getJobByHordeId('nope')).toBeUndefined();
  });

  it('round-trips image blobs and lists them per job', async () => {
    await service.putImage(makeImage('j4', 'source', 'source'));
    await service.putImage(makeImage('j4', 'GFPGAN'));
    await service.putImage(makeImage('other', 'GFPGAN'));

    const images = await service.getImagesForJob('j4');
    expect(images.map((i) => i.imageId).sort()).toEqual(['GFPGAN', 'source']);
    const stored = await service.getImage('j4', 'source');
    expect(stored?.kind).toBe('source');
    expect(stored?.mimeType).toBe('image/webp');
    expect(stored?.blob).toBeDefined();
  });

  it('deletes a job together with its blobs and nothing else', async () => {
    await service.putJob(makeJob({ localId: 'doomed' }));
    await service.putImage(makeImage('doomed', 'GFPGAN'));
    await service.putJob(makeJob({ localId: 'keep' }));
    await service.putImage(makeImage('keep', 'GFPGAN'));

    await service.deleteJobCascade('doomed');

    expect(await service.getJob('doomed')).toBeUndefined();
    expect(await service.getImagesForJob('doomed')).toEqual([]);
    expect(await service.getJob('keep')).toBeDefined();
    expect(await service.getImagesForJob('keep')).toHaveLength(1);
  });

  it('counts stored jobs', async () => {
    await service.putJob(makeJob());
    await service.putJob(makeJob());

    expect(await service.countJobs()).toBe(2);
  });

  it('clears alchemy history without touching generation history', async () => {
    const generation = TestBed.inject(GenerationDbService);
    await generation.putJob({
      localId: 'g1',
      status: 'done',
      createdAt: 1,
      updatedAt: 1,
      request: { prompt: 'a cat' },
      resultImageIds: [],
    });
    await service.putJob(makeJob({ localId: 'a1' }));
    await service.putImage(makeImage('a1', 'GFPGAN'));

    await service.clearAll();

    expect(await service.listJobs()).toEqual([]);
    expect(await service.getImagesForJob('a1')).toEqual([]);
    expect((await generation.getJob('g1'))?.localId).toBe('g1');
  });
});
