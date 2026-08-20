import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CIVITAI_CACHE_TTL_MS,
  CivitaiCacheService,
} from './civitai-cache.service';
import { CivitaiModel, CivitaiModelVersion } from './civitai.service';

function makeVersion(
  id: number,
  overrides: Partial<CivitaiModelVersion> = {},
): CivitaiModelVersion {
  return {
    id,
    modelId: null,
    modelName: null,
    name: `v${id}`,
    baseModel: 'SD 1.5',
    baseModelType: null,
    publishedAt: '2025-01-01T00:00:00Z',
    index: 0,
    trainedWords: ['trigger'],
    fileSizeKb: 1000,
    fileName: 'x.safetensors',
    sha256: null,
    nsfwLevel: 1,
    availability: 'Public',
    paidAccess: false,
    images: [],
    ...overrides,
  };
}

function makeModel(
  id: number,
  versions: CivitaiModelVersion[] = [makeVersion(id * 10)],
): CivitaiModel {
  return {
    id,
    name: `Model ${id}`,
    type: 'LORA',
    rawType: 'LORA',
    creator: 'alice',
    nsfw: false,
    nsfwLevel: 1,
    poi: false,
    minor: false,
    downloadCount: 1,
    thumbsUp: 1,
    thumbsDown: 0,
    tags: [],
    baseModels: ['SD 1.5'],
    availability: 'Public',
    preview: null,
    versions,
  };
}

describe('CivitaiCacheService', () => {
  let service: CivitaiCacheService;

  beforeEach(() => {
    indexedDB = new IDBFactory();
    TestBed.configureTestingModule({});
    service = TestBed.inject(CivitaiCacheService);
  });

  it('round-trips a model and a version', async () => {
    await service.putModel(makeModel(1));
    await service.putVersion(makeVersion(99));

    expect((await service.getModel(1))?.data.name).toBe('Model 1');
    expect((await service.getVersion(99))?.data.name).toBe('v99');
  });

  it('answers a miss with null rather than an empty record', async () => {
    expect(await service.getModel(404)).toBeNull();
    expect(await service.getVersion(404)).toBeNull();
  });

  it('marks a record stale past the window without discarding it', async () => {
    // Date.now is moved rather than the whole clock: fake timers stall
    // IndexedDB, which needs real scheduling to settle a request.
    const written = Date.now();
    await service.putModel(makeModel(2));
    expect((await service.getModel(2))?.stale).toBe(false);

    const clock = vi
      .spyOn(Date, 'now')
      .mockReturnValue(written + CIVITAI_CACHE_TTL_MS + 1000);
    const stale = await service.getModel(2);
    clock.mockRestore();

    // Stale asks for a refresh; it must still answer, because being offline is
    // exactly when no refresh can succeed.
    expect(stale?.stale).toBe(true);
    expect(stale?.data.name).toBe('Model 2');
  });

  it('reads a record written by another payload shape as a miss', async () => {
    await service.putModel(makeModel(3));
    const db = await (
      service as unknown as {
        db: () => Promise<{
          put: (store: string, value: unknown) => Promise<unknown>;
        }>;
      }
    ).db();
    await db.put('civitaiModels', {
      id: 3,
      schema: 999,
      fetchedAt: Date.now(),
      data: makeModel(3),
    });

    // A record from a shape this build does not understand is refetched, not
    // handed to a reader that would misread it.
    expect(await service.getModel(3)).toBeNull();
  });

  it('stores a picked search result whole, naming each version', async () => {
    const model = makeModel(7, [makeVersion(71), makeVersion(72)]);
    await service.putSearchResult(model);

    const version = await service.getVersion(71);
    // A version inside a search result does not name its own model, but the
    // resolver and the detail panel both need that pairing.
    expect(version?.data.modelId).toBe(7);
    expect(version?.data.modelName).toBe('Model 7');
    expect(await service.countVersions()).toBe(2);
  });

  it('does not overwrite a version that already names its model', async () => {
    const owned = makeVersion(81, { modelId: 500, modelName: 'Original' });
    await service.putSearchResult(makeModel(8, [owned]));

    expect((await service.getVersion(81))?.data.modelName).toBe('Original');
  });

  it('finds every cached version of one model page', async () => {
    await service.putSearchResult(
      makeModel(9, [makeVersion(91), makeVersion(92)]),
    );
    await service.putSearchResult(makeModel(10, [makeVersion(101)]));

    const siblings = await service.versionsOfModel(9);
    expect(siblings.map((version) => version.id).sort()).toEqual([91, 92]);
  });

  it('counts and clears both stores', async () => {
    await service.putSearchResult(makeModel(11));
    expect(await service.countModels()).toBe(1);
    expect(await service.countVersions()).toBe(1);

    await service.clear();
    expect(await service.countModels()).toBe(0);
    expect(await service.countVersions()).toBe(0);
  });

  it('loses the names rather than the page when storage is unusable', async () => {
    // A private window can refuse to open a database at all. Everything here is
    // a convenience, so a caller must get an empty answer, never an exception.
    const real = indexedDB;
    (globalThis as { indexedDB?: unknown }).indexedDB = undefined;

    await expect(service.countModels()).resolves.toBe(0);
    await expect(service.getModel(1)).resolves.toBeNull();
    await expect(service.versionsOfModel(1)).resolves.toEqual([]);
    await expect(service.putModel(makeModel(1))).resolves.toBeUndefined();

    indexedDB = real;
    // The failed open is not remembered, so the next call can still succeed.
    await service.putModel(makeModel(12));
    expect((await service.getModel(12))?.data.name).toBe('Model 12');
  });

  it('ignores a record with no usable id', async () => {
    await service.putModel(makeModel(0));
    expect(await service.countModels()).toBe(0);
  });
});
