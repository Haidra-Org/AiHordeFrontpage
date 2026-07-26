import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SweepLibraryService } from './sweep-library.service';
import { environment } from '../../environments/environment';
import stubIndex from '../testing/fixtures/sweep-index.stub.json';

describe('SweepLibraryService', () => {
  let sweeps: SweepLibraryService;
  let http: HttpTestingController;

  const indexUrl = `${environment.sweepLibraryBaseUrl}/index.json`;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    sweeps = TestBed.inject(SweepLibraryService);
    http = TestBed.inject(HttpTestingController);
  });

  it('fetches the index from the configured base url', async () => {
    const loaded = sweeps.ensureLoaded();
    http.expectOne(indexUrl).flush(stubIndex);
    await loaded;

    expect(sweeps.hasStrips()).toBe(true);
    expect(sweeps.isSettled()).toBe(true);
  });

  it('fetches the index once however many callers ask for it', async () => {
    const first = sweeps.ensureLoaded();
    const second = sweeps.ensureLoaded();
    http.expectOne(indexUrl).flush(stubIndex);
    await Promise.all([first, second]);

    await sweeps.ensureLoaded();
    http.expectNone(indexUrl);
    expect(sweeps.hasStrips()).toBe(true);
  });

  it('reports empty when the library cannot be reached', async () => {
    const loaded = sweeps.ensureLoaded();
    http
      .expectOne(indexUrl)
      .error(new ProgressEvent('offline'), { status: 0, statusText: '' });
    await loaded;

    expect(sweeps.hasStrips()).toBe(false);
    expect(sweeps.strip('steps')).toBeNull();
    expect(sweeps.isSettled()).toBe(true);
  });

  it('prefers the strip matching the model and scene asked for', async () => {
    const loaded = sweeps.ensureLoaded();
    http.expectOne(indexUrl).flush(stubIndex);
    await loaded;

    expect(sweeps.strip('steps', 'Deliberate', 'landscape')?.model).toBe(
      'Deliberate',
    );
    expect(sweeps.strip('steps', 'Deliberate')?.model).toBe('Deliberate');
    // Unknown model falls back rather than going empty.
    expect(sweeps.strip('steps', 'Nothing By This Name')?.model).toBe(
      'AlbedoBase XL (SDXL)',
    );
    expect(sweeps.strip('sampler_name')).toBeNull();
  });

  it('builds frame urls under the configured base', async () => {
    const loaded = sweeps.ensureLoaded();
    http.expectOne(indexUrl).flush(stubIndex);
    await loaded;

    const strip = sweeps.strip('cfg_scale')!;
    expect(sweeps.imageUrl(strip, strip.stops[0])).toBe(
      `${environment.sweepLibraryBaseUrl}/cfg_scale/AlbedoBase XL (SDXL)/portrait/02.webp`,
    );
  });
});
