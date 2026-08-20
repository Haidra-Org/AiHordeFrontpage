import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { CivitaiSearchResult, CivitaiService } from './civitai.service';

const MODELS_URL = 'https://civitai.com/api/v1/models';

const FIXTURE = {
  items: [
    {
      id: 123,
      name: 'Detail Tweaker',
      type: 'LoCon',
      nsfw: false,
      nsfwLevel: 1,
      poi: false,
      minor: false,
      availability: 'Public',
      tags: ['style', 'detail'],
      baseModels: ['SDXL 1.0'],
      creator: { username: 'alice' },
      stats: { downloadCount: 4200, thumbsUpCount: 310, thumbsDownCount: 4 },
      modelVersions: [
        {
          id: 987,
          index: 0,
          name: 'v2.0',
          baseModel: 'SDXL 1.0',
          baseModelType: 'Standard',
          publishedAt: '2025-03-02T10:00:00Z',
          availability: 'Public',
          nsfwLevel: 1,
          trainedWords: ['detailed', 'sharp'],
          files: [
            { sizeKB: 300, name: 'vae.pt', type: 'VAE', primary: false },
            {
              sizeKB: 144000,
              name: 'detail-tweaker.safetensors',
              type: 'Model',
              primary: true,
              hashes: { SHA256: 'A'.repeat(64) },
            },
          ],
          images: [
            {
              url: 'https://img/large.jpg',
              type: 'image',
              width: 1024,
              height: 1024,
              nsfwLevel: 1,
            },
            {
              url: 'https://img/small.jpg',
              type: 'image',
              width: 256,
              height: 256,
              nsfwLevel: 4,
            },
            { url: 'https://img/video.mp4', type: 'video', width: 64 },
          ],
        },
      ],
    },
  ],
  metadata: { nextCursor: 'CURSOR2' },
};

describe('CivitaiService', () => {
  let service: CivitaiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CivitaiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  function flushSearch(
    result: Promise<CivitaiSearchResult>,
  ): Promise<[CivitaiSearchResult, TestRequest]> {
    const req = http.expectOne((r) => r.url === MODELS_URL);
    req.flush(FIXTURE);
    return result.then((value) => [value, req]);
  }

  it('maps the response into the internal model shape', async () => {
    const [result] = await flushSearch(
      firstValueFrom(service.searchModels({ query: 'detail' })),
    );

    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    const model = result.items[0];
    expect(model).toMatchObject({
      id: 123,
      name: 'Detail Tweaker',
      creator: 'alice',
      // A LoCon travels the LoRA path, but its own type is kept so a card can
      // say which of the three it is.
      type: 'LORA',
      rawType: 'LoCon',
      downloadCount: 4200,
      thumbsUp: 310,
      thumbsDown: 4,
      tags: ['style', 'detail'],
      baseModels: ['SDXL 1.0'],
      minor: false,
    });
    expect(result.metadata.nextCursor).toBe('CURSOR2');
  });

  it('reads size, name and hash from the primary file, not the first', async () => {
    const [result] = await flushSearch(
      firstValueFrom(service.searchModels({ query: 'x' })),
    );
    if (result.kind !== 'success') return;
    const version = result.items[0].versions[0];

    // files[0] is a VAE; describing the download by its size would be wrong.
    expect(version.fileSizeKb).toBe(144000);
    expect(version.fileName).toBe('detail-tweaker.safetensors');
    expect(version.sha256).toBe('A'.repeat(64));
  });

  it('keeps the version fields a pin and a warning depend on', async () => {
    const [result] = await flushSearch(
      firstValueFrom(service.searchModels({ query: 'x' })),
    );
    if (result.kind !== 'success') return;

    expect(result.items[0].versions[0]).toMatchObject({
      id: 987,
      index: 0,
      publishedAt: '2025-03-02T10:00:00Z',
      baseModel: 'SDXL 1.0',
      availability: 'Public',
      paidAccess: false,
      trainedWords: ['detailed', 'sharp'],
    });
  });

  it('keeps still images with their maturity rating and drops video', async () => {
    const [result] = await flushSearch(
      firstValueFrom(service.searchModels({ query: 'x' })),
    );
    if (result.kind !== 'success') return;
    const images = result.items[0].versions[0].images;

    expect(images.map((image) => image.url)).toEqual([
      'https://img/large.jpg',
      'https://img/small.jpg',
    ]);
    expect(images[1].nsfwLevel).toBe(4);
    // A card-sized slot should not fetch the 1024px preview.
    expect(result.items[0].preview?.url).toBe('https://img/small.jpg');
  });

  it('searches every type the LoRA path can load', async () => {
    const [, req] = await flushSearch(
      firstValueFrom(service.searchModels({ query: 'foo' })),
    );

    // DoRA is a peer of LORA and LoCon; omitting it hides usable results.
    expect(req.request.params.getAll('types')).toEqual([
      'LORA',
      'LoCon',
      'DoRA',
    ]);
    expect(req.request.params.get('query')).toBe('foo');
    expect(req.request.params.get('sort')).toBe('Most Downloaded');
    expect(req.request.params.get('period')).toBe('AllTime');
    expect(req.request.params.get('primaryFileOnly')).toBe('true');
  });

  it('searches only TextualInversion for the TI type', async () => {
    const [, req] = await flushSearch(
      firstValueFrom(service.searchModels({ type: 'TextualInversion' })),
    );

    expect(req.request.params.getAll('types')).toEqual(['TextualInversion']);
  });

  it('says nothing about maturity unless asked, then asks plainly', async () => {
    const [, quiet] = await flushSearch(
      firstValueFrom(service.searchModels({ query: 'a' })),
    );
    // Sending nsfw=false is a stronger claim than not asking, and it reads
    // badly against the SFW-only mode CivitAI forces in some regions.
    expect(quiet.request.params.get('nsfw')).toBeNull();

    const [, asked] = await flushSearch(
      firstValueFrom(service.searchModels({ query: 'b', nsfw: true })),
    );
    expect(asked.request.params.get('nsfw')).toBe('true');
  });

  it('sends one baseModels param per label', async () => {
    const [, req] = await flushSearch(
      firstValueFrom(
        service.searchModels({
          query: 'x',
          baseModels: ['SDXL 1.0', 'Pony', 'Illustrious'],
        }),
      ),
    );

    expect(req.request.params.getAll('baseModels')).toEqual([
      'SDXL 1.0',
      'Pony',
      'Illustrious',
    ]);
  });

  it('forwards the cursor, tag and creator filters', async () => {
    const [, req] = await flushSearch(
      firstValueFrom(
        service.searchModels({
          query: 'x',
          cursor: 'CUR',
          tag: 'character',
          username: 'bob',
        }),
      ),
    );

    expect(req.request.params.get('cursor')).toBe('CUR');
    expect(req.request.params.get('tag')).toBe('character');
    expect(req.request.params.get('username')).toBe('bob');
    // Paging is by cursor alone; CivitAI ignores `page` beside a query.
    expect(req.request.params.get('page')).toBeNull();
  });

  it('returns a typed error result on HTTP failure', async () => {
    const promise = firstValueFrom(service.searchModels({ query: 'x' }));
    http
      .expectOne((r) => r.url === MODELS_URL)
      .flush('boom', { status: 500, statusText: 'Server Error' });

    const result = await promise;
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.error.status).toBe(500);
  });

  describe('resolving a bare identifier to a name', () => {
    it('joins a version to its model, which alone means nothing', async () => {
      const promise = firstValueFrom(service.resolveName('987', true));
      http
        .expectOne('https://civitai.com/api/v1/model-versions/987')
        .flush({ id: 987, name: 'v2.0', model: { name: 'Detail Tweaker' } });

      expect(await promise).toBe('Detail Tweaker · v2.0');
    });

    it('reads a model page by its own name', async () => {
      const promise = firstValueFrom(service.resolveName('123', false));
      http
        .expectOne('https://civitai.com/api/v1/models/123')
        .flush({ id: 123, name: 'Detail Tweaker' });

      expect(await promise).toBe('Detail Tweaker');
    });

    it('answers null when the catalogue cannot be read', async () => {
      const promise = firstValueFrom(service.resolveName('404', false));
      http
        .expectOne('https://civitai.com/api/v1/models/404')
        .flush('nope', { status: 404, statusText: 'Not Found' });

      expect(await promise).toBeNull();
    });

    it('does not remember a failure as an answer', async () => {
      const first = firstValueFrom(service.resolveName('55', false));
      http
        .expectOne('https://civitai.com/api/v1/models/55')
        .flush('boom', { status: 500, statusText: 'Server Error' });
      expect(await first).toBeNull();

      // A transient outage used to blank a name for the rest of the session.
      const second = firstValueFrom(service.resolveName('55', false));
      http
        .expectOne('https://civitai.com/api/v1/models/55')
        .flush({ id: 55, name: 'Recovered' });
      expect(await second).toBe('Recovered');
    });
  });
});
