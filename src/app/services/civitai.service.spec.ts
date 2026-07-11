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
      type: 'LORA',
      nsfw: false,
      creator: { username: 'alice' },
      stats: { downloadCount: 4200, rating: 4.9 },
      modelVersions: [
        {
          id: 987,
          name: 'v2.0',
          baseModel: 'SDXL 1.0',
          trainedWords: ['detailed', 'sharp'],
          files: [{ sizeKB: 144000 }],
          images: [
            { url: 'https://img/large.jpg', type: 'image', width: 1024 },
            { url: 'https://img/small.jpg', type: 'image', width: 256 },
            { url: 'https://img/video.mp4', type: 'video', width: 64 },
          ],
        },
      ],
    },
  ],
  metadata: {
    nextCursor: 'CURSOR2',
    nextPage: 'https://civitai.com/api/v1/models?cursor=CURSOR2',
    currentPage: 1,
    pageSize: 20,
    totalItems: 1,
  },
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
    expect(result.items).toHaveLength(1);
    const model = result.items[0];
    expect(model).toEqual({
      id: 123,
      name: 'Detail Tweaker',
      creator: 'alice',
      type: 'LORA',
      thumbnailUrl: 'https://img/small.jpg',
      downloadCount: 4200,
      rating: 4.9,
      nsfw: false,
      versions: [
        {
          id: 987,
          name: 'v2.0',
          baseModel: 'SDXL 1.0',
          triggerWords: ['detailed', 'sharp'],
          fileSizeKb: 144000,
        },
      ],
    });
    expect(result.metadata.nextCursor).toBe('CURSOR2');
    expect(result.metadata.totalItems).toBe(1);
  });

  it('searches LORA and LoCon types with NSFW excluded by default', async () => {
    const [, req] = await flushSearch(
      firstValueFrom(service.searchModels({ query: 'foo' })),
    );

    expect(req.request.params.getAll('types')).toEqual(['LORA', 'LoCon']);
    expect(req.request.params.get('nsfw')).toBe('false');
    expect(req.request.params.get('limit')).toBe('20');
    expect(req.request.params.get('sort')).toBe('Highest Rated');
    expect(req.request.params.get('query')).toBe('foo');
  });

  it('searches only TextualInversion for the TI type', async () => {
    const [, req] = await flushSearch(
      firstValueFrom(service.searchModels({ type: 'TextualInversion' })),
    );

    expect(req.request.params.getAll('types')).toEqual(['TextualInversion']);
  });

  it('sends page only without a query and lets a cursor take precedence', async () => {
    const [, pageReq] = await flushSearch(
      firstValueFrom(service.searchModels({ page: 3 })),
    );
    expect(pageReq.request.params.get('page')).toBe('3');
    expect(pageReq.request.params.get('cursor')).toBeNull();

    const [, cursorReq] = await flushSearch(
      firstValueFrom(service.searchModels({ page: 3, cursor: 'CUR' })),
    );
    expect(cursorReq.request.params.get('cursor')).toBe('CUR');
    expect(cursorReq.request.params.get('page')).toBeNull();

    const [, queryReq] = await flushSearch(
      firstValueFrom(service.searchModels({ query: 'x', page: 3 })),
    );
    expect(queryReq.request.params.get('page')).toBeNull();
  });

  it('forwards the baseModel filter and NSFW opt-in', async () => {
    const [, req] = await flushSearch(
      firstValueFrom(
        service.searchModels({ query: 'x', baseModel: 'Pony', nsfw: true }),
      ),
    );

    expect(req.request.params.getAll('baseModels')).toEqual(['Pony']);
    expect(req.request.params.get('nsfw')).toBe('true');
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
});
