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

  const indexUrl = `${environment.evidenceBaseUrl}/index.json`;

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

    expect(sweeps.strip('steps', 'deliberate', 'landscape')?.strip_id).toBe(
      'steps/deliberate/landscape',
    );
    expect(sweeps.strip('steps', 'deliberate')?.image_model.slug).toBe(
      'deliberate',
    );
    // Unknown model falls back rather than going empty.
    expect(
      sweeps.strip('steps', 'nothing-by-this-name')?.image_model.slug,
    ).toBe('albedobase-xl');
    expect(sweeps.strip('sampler')).toBeNull();
  });

  it('leaves out the strips a scrubber cannot show', async () => {
    const loaded = sweeps.ensureLoaded();
    http.expectOne(indexUrl).flush(stubIndex);
    await loaded;

    // The incomplete strip would scrub into a missing render.
    expect(sweeps.strip('steps', 'deliberate', 'person')?.strip_id).not.toBe(
      'steps/deliberate/person',
    );
    // A grid is a plate, not a one-axis scrub.
    expect(sweeps.strip('steps_cfg_grid')).toBeNull();
  });

  it('maps the studio baseline onto the strip family it stands for', () => {
    sweeps.setStudioBaseline('stable_diffusion_xl');
    expect(sweeps.studioModelSlug()).toBe('albedobase-xl');

    sweeps.setStudioBaseline('stable_diffusion_1');
    expect(sweeps.studioModelSlug()).toBe('deliberate');

    // A baseline with nothing published, and no model at all, both answer
    // "no preference" rather than a wrong strip.
    sweeps.setStudioBaseline('flux_1');
    expect(sweeps.studioModelSlug()).toBeUndefined();

    sweeps.setStudioBaseline(null);
    expect(sweeps.studioModelSlug()).toBeUndefined();
  });

  it('prefers the reader own model over the family standing for it', () => {
    // The library rendered this one by name, so it beats the baseline map.
    sweeps.setStudioModel('Anything Diffusion', 'stable_diffusion_1');
    expect(sweeps.studioModelSlug()).toBe('anything-diffusion');

    sweeps.setStudioModel('  deliberate  ', 'stable_diffusion_xl');
    expect(sweeps.studioModelSlug()).toBe('deliberate');

    // A checkpoint the library never rendered falls back to its family.
    sweeps.setStudioModel('Some Other SDXL', 'stable_diffusion_xl');
    expect(sweeps.studioModelSlug()).toBe('albedobase-xl');

    sweeps.setStudioModel(null, null);
    expect(sweeps.studioModelSlug()).toBeUndefined();
  });

  it('hands out grid plates separately from scrubbable strips', async () => {
    const loaded = sweeps.ensureLoaded();
    http.expectOne(indexUrl).flush(stubIndex);
    await loaded;

    const plate = sweeps.grid('steps_cfg_grid')!;
    expect(plate.strip_id).toBe('steps-cfg-grid/albedobase-xl/person');
    expect(plate.grid?.rows.values).toEqual([8, 30]);
    expect(plate.grid?.columns.values).toEqual([2, 7]);
    // A strip is never a plate and a plate is never a strip.
    expect(sweeps.grid('steps')).toBeNull();
    expect(sweeps.strip('steps_cfg_grid')).toBeNull();
  });

  it('builds urls for the files a strip names beside its stops', async () => {
    const loaded = sweeps.ensureLoaded();
    http.expectOne(indexUrl).flush(stubIndex);
    await loaded;

    const strip = sweeps.strip('denoising_strength')!;
    expect(sweeps.assetUrl(strip.source_image!)).toBe(
      `${environment.evidenceBaseUrl}/denoising-strength/deliberate/place/source.webp`,
    );
  });

  it('builds frame urls from the stop path verbatim', async () => {
    const loaded = sweeps.ensureLoaded();
    http.expectOne(indexUrl).flush(stubIndex);
    await loaded;

    const strip = sweeps.strip('cfg_scale')!;
    expect(strip.stops[0].file).toBe(
      'cfg-scale/albedobase-xl/person/001_2.webp',
    );
    expect(sweeps.imageUrl(strip.stops[0])).toBe(
      `${environment.evidenceBaseUrl}/cfg-scale/albedobase-xl/person/001_2.webp`,
    );
  });
});
