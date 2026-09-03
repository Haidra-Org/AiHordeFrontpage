import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlchemyQueueService } from './alchemy-queue.service';
import { AlchemyDbService } from './alchemy-db.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { clientAgentInterceptor } from './interceptors/client-agent.interceptor';
import { API_BASE } from '../testing/api-test-helpers';
import { AlchemyStatusResponse } from '../types/generation';

const RESULT_URL = 'https://r2.example/out.webp';

function imageResponse(): Response {
  return new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { 'content-type': 'image/webp' },
  });
}

/** Let the service's promise chains and IndexedDB writes settle. */
const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe('AlchemyQueueService', () => {
  let service: AlchemyQueueService;
  let db: AlchemyDbService;
  let http: HttpTestingController;
  let fetchMock: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    toastError = vi.fn();
    fetchMock = vi.fn(() => Promise.resolve(imageResponse()));
    vi.stubGlobal('fetch', fetchMock);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([clientAgentInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            getStoredApiKey: () => 'my-key',
            isLoggedIn: signal(false),
          },
        },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: toastError, warning: vi.fn() },
        },
      ],
    });
    service = TestBed.inject(AlchemyQueueService);
    db = TestBed.inject(AlchemyDbService);
    http = TestBed.inject(HttpTestingController);
    await service.whenReady();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    http.verify();
  });

  /** Submit a URL-sourced job and return its local id. */
  async function submit(id: string): Promise<string> {
    const pending = service.submit({
      forms: ['caption'],
      slowWorkers: true,
      source: 'https://example.com/i.png',
    });
    http.expectOne(`${API_BASE}/interrogate/async`).flush({ id });
    await pending;
    await settle();
    return service.jobs().find((job) => job.id === id)?.localId as string;
  }

  /** Run one poll pass and answer the status request with `status`. */
  async function poll(
    id: string,
    status: AlchemyStatusResponse,
  ): Promise<void> {
    const tick = (
      service as unknown as { pollTick(): Promise<void> }
    ).pollTick();
    await settle();
    http
      .expectOne(`${API_BASE}/interrogate/status/${id}`)
      .flush(status as unknown as object);
    await tick;
    await settle();
  }

  describe('submit', () => {
    it('posts the request and persists the job', async () => {
      const pending = service.submit({
        forms: ['caption', 'nsfw'],
        slowWorkers: true,
        source: 'https://example.com/i.png',
      });

      const req = http.expectOne(`${API_BASE}/interrogate/async`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('apikey')).toBe('my-key');
      expect(req.request.body).toEqual({
        forms: [{ name: 'caption' }, { name: 'nsfw' }],
        source_image: 'https://example.com/i.png',
        slow_workers: true,
      });
      req.flush({ id: 'job-1' });

      expect(await pending).toBe('job-1');
      await settle();
      expect(service.jobs().map((job) => job.id)).toEqual(['job-1']);
      expect((await db.listJobs())[0].jobId).toBe('job-1');
    });

    it('sends and persists the detector selected for an annotation', async () => {
      const pending = service.submit({
        annotationControlTypes: ['depth'],
        forms: ['annotation'],
        slowWorkers: false,
        source: 'https://example.com/i.png',
      });

      const req = http.expectOne(`${API_BASE}/interrogate/async`);
      expect(req.request.body).toEqual({
        forms: [{ name: 'annotation', payload: { control_type: 'depth' } }],
        source_image: 'https://example.com/i.png',
        slow_workers: false,
      });
      req.flush({ id: 'job-annotation' });

      expect(await pending).toBe('job-annotation');
      await settle();
      expect(service.jobs()[0].annotationControlTypes).toEqual(['depth']);
    });

    it('submits one annotation form per detector asked for', async () => {
      const pending = service.submit({
        annotationControlTypes: ['canny', 'depth', 'openpose'],
        forms: ['caption', 'annotation'],
        slowWorkers: false,
        source: 'https://example.com/i.png',
      });

      const req = http.expectOne(`${API_BASE}/interrogate/async`);
      expect(req.request.body.forms).toEqual([
        { name: 'caption' },
        { name: 'annotation', payload: { control_type: 'canny' } },
        { name: 'annotation', payload: { control_type: 'depth' } },
        { name: 'annotation', payload: { control_type: 'openpose' } },
      ]);
      req.flush({ id: 'job-detectors' });

      expect(await pending).toBe('job-detectors');
      await settle();
      expect((await db.listJobs())[0].annotationControlTypes).toEqual([
        'canny',
        'depth',
        'openpose',
      ]);
    });

    it('records a URL source without storing a blob for it', async () => {
      const localId = await submit('job-url');

      const stored = await db.getJob(localId);
      expect(stored?.sourceMode).toBe('url');
      expect(stored?.sourceUrl).toBe('https://example.com/i.png');
      expect(await db.getImagesForJob(localId)).toEqual([]);
    });

    it('returns null and tracks nothing when the horde rejects it', async () => {
      const pending = service.submit({
        forms: ['caption'],
        slowWorkers: true,
        source: 'https://example.com/i.png',
      });
      http
        .expectOne(`${API_BASE}/interrogate/async`)
        .flush('no', { status: 400, statusText: 'Bad Request' });

      expect(await pending).toBeNull();
      expect(service.jobs()).toEqual([]);
    });
  });

  describe('polling', () => {
    it('writes every transition straight through to storage', async () => {
      const localId = await submit('job-2');

      await poll('job-2', {
        state: 'done',
        forms: [{ form: 'caption', state: 'done', result: { caption: 'hi' } }],
      });

      expect(service.jobs()[0].done).toBe(true);
      expect((await db.getJob(localId))?.done).toBe(true);
      expect((await db.getJob(localId))?.status?.state).toBe('done');
    });

    it('marks a job not found on 404', async () => {
      const localId = await submit('job-404');

      const tick = (
        service as unknown as { pollTick(): Promise<void> }
      ).pollTick();
      await settle();
      http
        .expectOne(`${API_BASE}/interrogate/status/job-404`)
        .flush('gone', { status: 404, statusText: 'Not Found' });
      await tick;
      await settle();

      expect(service.jobs()[0].notFound).toBe(true);
      expect((await db.getJob(localId))?.notFound).toBe(true);
    });

    it('asks about nothing while the tab is hidden', async () => {
      await submit('job-hidden');
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });

      await (service as unknown as { pollTick(): Promise<void> }).pollTick();
      await settle();
      http.expectNone(`${API_BASE}/interrogate/status/job-hidden`);

      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      await poll('job-hidden', {
        state: 'done',
        forms: [{ form: 'caption', state: 'done', result: { caption: 'x' } }],
      });
      expect(service.jobs()[0].done).toBe(true);
    });

    it('stops asking about a settled job with nothing outstanding', async () => {
      await submit('job-3');
      await poll('job-3', {
        state: 'done',
        forms: [{ form: 'caption', state: 'done', result: { caption: 'x' } }],
      });

      await (service as unknown as { pollTick(): Promise<void> }).pollTick();
      await settle();

      http.expectNone(`${API_BASE}/interrogate/status/job-3`);
      expect(service.pendingJobs()).toEqual([]);
    });
  });

  describe('result images', () => {
    it('captures a finished image while another form is still running', async () => {
      const localId = await submit('job-4');

      await poll('job-4', {
        state: 'processing',
        forms: [
          { form: 'GFPGAN', state: 'done', result: { GFPGAN: RESULT_URL } },
          { form: 'interrogation', state: 'processing' },
        ],
      });

      expect(fetchMock).toHaveBeenCalledWith(RESULT_URL, { cache: 'no-store' });
      expect(
        (await service.getResultImages(localId)).map((i) => i.imageId),
      ).toEqual(['GFPGAN']);
      expect((await db.getJob(localId))?.storedResultForms).toEqual(['GFPGAN']);
    });

    it('stores a control map per detector rather than one over the other', async () => {
      const pending = service.submit({
        annotationControlTypes: ['canny', 'depth'],
        forms: ['annotation'],
        slowWorkers: true,
        source: 'https://example.com/i.png',
      });
      http.expectOne(`${API_BASE}/interrogate/async`).flush({ id: 'job-maps' });
      await pending;
      await settle();
      const localId = service.jobs().find((job) => job.id === 'job-maps')
        ?.localId as string;

      await poll('job-maps', {
        state: 'done',
        forms: [
          {
            form: 'annotation',
            state: 'done',
            result: { annotation: `${RESULT_URL}?a` },
            payload: { control_type: 'canny' },
          },
          {
            form: 'annotation',
            state: 'done',
            result: { annotation: `${RESULT_URL}?b` },
            payload: { control_type: 'depth' },
          },
        ],
      });

      expect(
        (await service.getResultImages(localId)).map((i) => i.imageId).sort(),
      ).toEqual(['annotation-canny', 'annotation-depth']);
      expect((await db.getJob(localId))?.storedResultForms.sort()).toEqual([
        'annotation-canny',
        'annotation-depth',
      ]);
    });

    it('names control maps by request order when the server echoes no payload', async () => {
      const pending = service.submit({
        annotationControlTypes: ['canny', 'depth'],
        forms: ['annotation'],
        slowWorkers: true,
        source: 'https://example.com/i.png',
      });
      http
        .expectOne(`${API_BASE}/interrogate/async`)
        .flush({ id: 'job-legacy-maps' });
      await pending;
      await settle();
      const localId = service.jobs().find((job) => job.id === 'job-legacy-maps')
        ?.localId as string;

      await poll('job-legacy-maps', {
        state: 'done',
        forms: [
          {
            form: 'annotation',
            state: 'done',
            result: { annotation: `${RESULT_URL}?a` },
          },
          {
            form: 'annotation',
            state: 'done',
            result: { annotation: `${RESULT_URL}?b` },
          },
        ],
      });

      expect(
        (await service.getResultImages(localId)).map((i) => i.imageId).sort(),
      ).toEqual(['annotation-canny', 'annotation-depth']);
    });

    it('does not download a form it already holds', async () => {
      await submit('job-5');
      const status: AlchemyStatusResponse = {
        state: 'done',
        forms: [
          { form: 'GFPGAN', state: 'done', result: { GFPGAN: RESULT_URL } },
        ],
      };
      await poll('job-5', status);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await (service as unknown as { pollTick(): Promise<void> }).pollTick();
      await settle();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('revisits a settled job for an outstanding image without re-asking its status', async () => {
      const localId = await submit('job-6');
      fetchMock.mockRejectedValueOnce(new Error('network'));

      await poll('job-6', {
        state: 'done',
        forms: [
          { form: 'GFPGAN', state: 'done', result: { GFPGAN: RESULT_URL } },
        ],
      });
      expect(await service.getResultImages(localId)).toEqual([]);

      await (service as unknown as { pollTick(): Promise<void> }).pollTick();
      await settle();

      // No status request: the job has settled, so the retry is the image alone.
      http.expectNone(`${API_BASE}/interrogate/status/job-6`);
      expect((await service.getResultImages(localId)).length).toBe(1);
    });

    it('writes an image off after three consecutive failures', async () => {
      const localId = await submit('job-7');
      fetchMock.mockRejectedValue(new Error('network'));

      await poll('job-7', {
        state: 'done',
        forms: [
          { form: 'GFPGAN', state: 'done', result: { GFPGAN: RESULT_URL } },
        ],
      });
      for (let i = 0; i < 2; i++) {
        await (service as unknown as { pollTick(): Promise<void> }).pollTick();
        await settle();
      }

      expect((await db.getJob(localId))?.failedResultForms).toEqual(['GFPGAN']);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('fetches a fresh link for a job that waited out the link lifetime in the queue', async () => {
      const localId = await submit('job-8b');
      // Submitted long ago, but the result has only just been published, so its
      // link is new and worth a request.
      await (
        service as unknown as {
          patch(id: string, update: { createdAt: number }): Promise<unknown>;
        }
      ).patch(localId, { createdAt: Date.now() - 60 * 60_000 });

      await poll('job-8b', {
        state: 'done',
        forms: [
          { form: 'GFPGAN', state: 'done', result: { GFPGAN: RESULT_URL } },
        ],
      });

      expect(fetchMock).toHaveBeenCalledWith(RESULT_URL, { cache: 'no-store' });
      expect((await service.getResultImages(localId)).length).toBe(1);
      expect((await db.getJob(localId))?.failedResultForms).toEqual([]);
    });

    it('spends no request on links that have already expired', async () => {
      const localId = await submit('job-8');
      const stored = await db.getJob(localId);
      await db.putJob({
        ...(stored as NonNullable<typeof stored>),
        createdAt: Date.now() - 60 * 60_000,
        // The link's own age is what decides, so it is the sighting that is
        // aged here: a request can sit in the queue far longer than its
        // results stay reachable.
        resultLinkFirstSeenAt: { GFPGAN: Date.now() - 60 * 60_000 },
        status: {
          state: 'done',
          forms: [
            { form: 'GFPGAN', state: 'done', result: { GFPGAN: RESULT_URL } },
          ],
        },
        done: true,
      });
      await service.whenReady();
      TestBed.resetTestingModule();

      // Re-read through a fresh service so it restores the aged job from disk.
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(withInterceptors([clientAgentInterceptor])),
          provideHttpClientTesting(),
          {
            provide: AuthService,
            useValue: {
              getStoredApiKey: () => 'my-key',
              isLoggedIn: signal(false),
            },
          },
          {
            provide: ToastService,
            useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
          },
        ],
      });
      const reopened = TestBed.inject(AlchemyQueueService);
      await reopened.whenReady();
      fetchMock.mockClear();

      await (reopened as unknown as { pollTick(): Promise<void> }).pollTick();
      await settle();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(
        (await TestBed.inject(AlchemyDbService).getJob(localId))
          ?.failedResultForms,
      ).toEqual(['GFPGAN']);
      http = TestBed.inject(HttpTestingController);
    });

    it('retries an image written off while its link was still alive', async () => {
      const localId = await submit('job-8c');
      fetchMock.mockRejectedValue(new Error('network'));
      await poll('job-8c', {
        state: 'done',
        forms: [
          { form: 'GFPGAN', state: 'done', result: { GFPGAN: RESULT_URL } },
        ],
      });
      for (let i = 0; i < 2; i++) {
        await (service as unknown as { pollTick(): Promise<void> }).pollTick();
        await settle();
      }
      expect((await db.getJob(localId))?.failedResultForms).toEqual(['GFPGAN']);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(withInterceptors([clientAgentInterceptor])),
          provideHttpClientTesting(),
          {
            provide: AuthService,
            useValue: {
              getStoredApiKey: () => 'my-key',
              isLoggedIn: signal(false),
            },
          },
          {
            provide: ToastService,
            useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
          },
        ],
      });
      fetchMock.mockResolvedValue(imageResponse());
      const reopened = TestBed.inject(AlchemyQueueService);
      await reopened.whenReady();

      expect(
        (await TestBed.inject(AlchemyDbService).getJob(localId))
          ?.failedResultForms,
      ).toEqual([]);

      await (reopened as unknown as { pollTick(): Promise<void> }).pollTick();
      await settle();

      expect((await reopened.getResultImages(localId)).length).toBe(1);
      http = TestBed.inject(HttpTestingController);
    });

    it('reports a full store once and keeps the loop alive', async () => {
      const localId = await submit('job-9');
      vi.spyOn(db, 'putImage').mockRejectedValue(
        new DOMException('full', 'QuotaExceededError'),
      );

      await poll('job-9', {
        state: 'done',
        forms: [
          { form: 'GFPGAN', state: 'done', result: { GFPGAN: RESULT_URL } },
        ],
      });

      expect(toastError).toHaveBeenCalledWith(
        'studio.storage.quota_exhausted',
        {
          transloco: true,
        },
      );
      expect((await db.getJob(localId))?.failedResultForms).toEqual(['GFPGAN']);
    });
  });

  describe('cancel', () => {
    it('keeps the forms the cancel response still carries', async () => {
      const localId = await submit('job-c');

      const pending = service.cancel(localId);
      const req = http.expectOne(`${API_BASE}/interrogate/status/job-c`);
      expect(req.request.method).toBe('DELETE');
      req.flush({
        state: 'partial',
        forms: [
          { form: 'GFPGAN', state: 'done', result: { GFPGAN: RESULT_URL } },
        ],
      });
      await pending;
      await settle();

      expect((await db.getJob(localId))?.cancelled).toBe(true);
      expect((await service.getResultImages(localId)).length).toBe(1);
    });
  });

  describe('adoptActive', () => {
    it('takes over an active id the queue does not already hold', async () => {
      await service.adoptActive(['elsewhere-1']);

      const job = service.jobs()[0];
      expect(job.id).toBe('elsewhere-1');
      expect(job.adopted).toBe(true);
      expect(job.forms).toEqual([]);
      const stored = await db.getJob(job.localId);
      expect(stored?.adopted).toBe(true);
      expect(stored?.sourceMode).toBe('none');
    });

    it('ignores an active id it is already tracking', async () => {
      await submit('job-a');

      await service.adoptActive(['job-a']);

      expect(service.jobs()).toHaveLength(1);
      expect(service.jobs()[0].adopted).toBe(false);
    });

    it('records what an adopted request asked for from its first status', async () => {
      await service.adoptActive(['elsewhere-2']);

      await poll('elsewhere-2', {
        state: 'done',
        forms: [
          { form: 'caption', state: 'done', result: { caption: 'hi' } },
          {
            form: 'annotation',
            state: 'done',
            payload: { control_type: 'depth' },
          },
        ],
      });

      const job = service.jobs()[0];
      expect(job.forms).toEqual(['caption', 'annotation']);
      expect(job.annotationControlTypes).toEqual(['depth']);
    });
  });

  describe('deletion', () => {
    it('drops a job and its blobs', async () => {
      const localId = await submit('job-d');
      await poll('job-d', {
        state: 'done',
        forms: [
          { form: 'GFPGAN', state: 'done', result: { GFPGAN: RESULT_URL } },
        ],
      });

      await service.deleteJobs([localId]);

      expect(service.jobs()).toEqual([]);
      expect(await db.getJob(localId)).toBeUndefined();
      expect(await db.getImagesForJob(localId)).toEqual([]);
    });
  });
});
