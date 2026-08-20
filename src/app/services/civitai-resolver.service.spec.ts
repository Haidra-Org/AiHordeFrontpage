import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CivitaiResolverService,
  assetRefKey,
} from './civitai-resolver.service';
import { CivitaiCacheService } from './civitai-cache.service';

const MODEL_URL = (id: string): string =>
  `https://civitai.com/api/v1/models/${id}`;
const VERSION_URL = (id: string): string =>
  `https://civitai.com/api/v1/model-versions/${id}`;

/**
 * Let the resolver's awaited cache reads and fetches settle. Real task ticks,
 * not microtasks: it reads IndexedDB before it reaches the network, and that
 * only advances on the macrotask queue.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('CivitaiResolverService', () => {
  let service: CivitaiResolverService;
  let http: HttpTestingController;

  beforeEach(() => {
    indexedDB = new IDBFactory();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CivitaiResolverService);
    http = TestBed.inject(HttpTestingController);
  });

  it('never looks up a name that is not an identifier', async () => {
    service.request({ id: 'epi_noiseoffset', isVersion: false });
    await settle();

    // A named asset is already what the horde was given; the catalogue has no
    // way to look it up.
    http.expectNone(() => true);
    expect(
      service.metaFor({ id: 'epi_noiseoffset', isVersion: false }),
    ).toBeNull();
  });

  it('names a model page and publishes it', async () => {
    service.request({ id: '123', isVersion: false });
    await settle();

    http.expectOne(MODEL_URL('123')).flush({
      id: 123,
      name: 'Detail Tweaker',
      availability: 'Public',
      modelVersions: [
        { id: 9, baseModel: 'SD 1.5', trainedWords: ['detail'], images: [] },
      ],
    });
    await settle();

    expect(service.metaFor({ id: '123', isVersion: false })).toMatchObject({
      label: 'Detail Tweaker',
      baseModel: 'SD 1.5',
      modelId: 123,
      trainedWords: ['detail'],
    });
  });

  it('joins a version to the model it belongs to', async () => {
    service.request({ id: '987', isVersion: true });
    await settle();

    http.expectOne(VERSION_URL('987')).flush({
      id: 987,
      name: 'v2.0',
      modelId: 123,
      model: { name: 'Detail Tweaker' },
      baseModel: 'Pony',
      trainedWords: [],
      images: [],
    });
    await settle();

    expect(service.metaFor({ id: '987', isVersion: true })).toMatchObject({
      label: 'Detail Tweaker · v2.0',
      versionLabel: 'v2.0',
      baseModel: 'Pony',
    });
  });

  it('asks about each identifier only once', async () => {
    service.request({ id: '55', isVersion: false });
    service.request({ id: '55', isVersion: false });
    await settle();

    http.expectOne(MODEL_URL('55')).flush({ id: 55, name: 'Once' });
    await settle();

    service.request({ id: '55', isVersion: false });
    await settle();
    http.expectNone(MODEL_URL('55'));
    expect(service.metaFor({ id: '55', isVersion: false })?.label).toBe('Once');
  });

  describe('when the endpoint a ref names has nothing', () => {
    it('tries the other one and records the answer under both keys', async () => {
      // A textual inversion has no version endpoint, and a LoRA stored before
      // pinning carries a model id: which endpoint fits is a guess at the call
      // site, so the resolver settles it rather than asking the caller.
      service.request({ id: '7808', isVersion: true });
      await settle();

      http
        .expectOne(VERSION_URL('7808'))
        .flush('nope', { status: 404, statusText: 'Not Found' });
      await settle();

      http.expectOne(MODEL_URL('7808')).flush({ id: 7808, name: 'BadDream' });
      await settle();

      expect(service.metaFor({ id: '7808', isVersion: true })?.label).toBe(
        'BadDream',
      );
      // Recorded under its real key too, so the repair is not redone.
      expect(service.metaFor({ id: '7808', isVersion: false })?.label).toBe(
        'BadDream',
      );
    });

    it('gives up quietly when neither endpoint answers', async () => {
      service.request({ id: '404', isVersion: false });
      await settle();

      http
        .expectOne(MODEL_URL('404'))
        .flush('nope', { status: 404, statusText: 'Not Found' });
      await settle();
      http
        .expectOne(VERSION_URL('404'))
        .flush('nope', { status: 404, statusText: 'Not Found' });
      await settle();

      expect(service.metaFor({ id: '404', isVersion: false })).toBeNull();
    });
  });

  it('lets a failed lookup be retried later in the session', async () => {
    service.request({ id: '77', isVersion: false });
    await settle();
    http
      .expectOne(MODEL_URL('77'))
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();
    http
      .expectOne(VERSION_URL('77'))
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();
    expect(service.metaFor({ id: '77', isVersion: false })).toBeNull();

    // An outage must not blank a name for the rest of the session.
    service.request({ id: '77', isVersion: false });
    await settle();
    http.expectOne(MODEL_URL('77')).flush({ id: 77, name: 'Recovered' });
    await settle();

    expect(service.metaFor({ id: '77', isVersion: false })?.label).toBe(
      'Recovered',
    );
  });

  it('answers from the cache without asking the network', async () => {
    const cache = TestBed.inject(CivitaiCacheService);
    await cache.putSearchResult({
      id: 321,
      name: 'Cached LoRA',
      type: 'LORA',
      rawType: 'LORA',
      creator: null,
      nsfw: false,
      nsfwLevel: 1,
      poi: false,
      minor: false,
      downloadCount: 0,
      thumbsUp: 0,
      thumbsDown: 0,
      tags: [],
      baseModels: [],
      availability: 'Public',
      preview: null,
      versions: [],
    });

    service.request({ id: '321', isVersion: false });
    await settle();

    // This is the offline case: the name has to come from disk alone.
    http.expectNone(MODEL_URL('321'));
    expect(service.metaFor({ id: '321', isVersion: false })?.label).toBe(
      'Cached LoRA',
    );
  });

  it('keys a version and a model page apart', () => {
    expect(assetRefKey({ id: '5', isVersion: true })).toBe('v:5');
    expect(assetRefKey({ id: '5', isVersion: false })).toBe('m:5');
  });
});
