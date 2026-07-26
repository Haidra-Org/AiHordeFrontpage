import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MODEL_REFERENCE_TTL_MS,
  ModelReferenceService,
  baselineSupportsQrCode,
  baselineSupportsRemix,
  coerceBaselineMap,
  normalizeBaseline,
} from './model-reference.service';

const MODEL_REFERENCE_URL =
  'https://models.aihorde.net/api/model_references/v1/image_generation';
const CACHE_KEY = 'aihorde.generate.model_baselines';

const REFERENCE_FIXTURE = {
  Deliberate: { baseline: 'stable diffusion 1', nsfw: false },
  'AlbedoBase XL (SDXL)': { baseline: 'stable_diffusion_xl' },
  'Stable Cascade 1.0': { baseline: 'Stable Cascade' },
  Flux: { baseline: 'flux_1' },
  NoBaseline: { nsfw: true },
  NotAnObject: 'nope',
};

function setup(): {
  service: ModelReferenceService;
  http: HttpTestingController;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(ModelReferenceService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('normalizeBaseline', () => {
  it('folds spacing and case onto one token', () => {
    expect(normalizeBaseline('stable diffusion 1')).toBe('stable_diffusion_1');
    expect(normalizeBaseline('  Stable-Cascade ')).toBe('stable_cascade');
    expect(normalizeBaseline('stable_diffusion_xl')).toBe(
      'stable_diffusion_xl',
    );
  });
});

describe('coerceBaselineMap', () => {
  it('keeps records with a baseline and drops the rest', () => {
    const map = coerceBaselineMap(REFERENCE_FIXTURE);
    expect(map).toEqual({
      Deliberate: 'stable_diffusion_1',
      'AlbedoBase XL (SDXL)': 'stable_diffusion_xl',
      'Stable Cascade 1.0': 'stable_cascade',
      Flux: 'flux_1',
    });
  });

  it('tolerates a non-object payload', () => {
    expect(coerceBaselineMap(null)).toEqual({});
    expect(coerceBaselineMap('nope')).toEqual({});
  });
});

describe('baseline capability rules', () => {
  it('allows remix only on Stable Cascade', () => {
    expect(baselineSupportsRemix('stable_cascade')).toBe(true);
    expect(baselineSupportsRemix('stable_diffusion_xl')).toBe(false);
    expect(baselineSupportsRemix('flux_1')).toBe(false);
  });

  it('allows the QR workflow on SD 1.5 and SDXL', () => {
    expect(baselineSupportsQrCode('stable_diffusion_1')).toBe(true);
    expect(baselineSupportsQrCode('stable_diffusion_xl')).toBe(true);
    expect(baselineSupportsQrCode('stable_cascade')).toBe(false);
  });

  it('fails open on an unknown baseline', () => {
    expect(baselineSupportsRemix(null)).toBe(true);
    expect(baselineSupportsQrCode(null)).toBe(true);
  });
});

describe('ModelReferenceService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('fetches nothing until load() is called', () => {
    const { service, http } = setup();
    http.expectNone(MODEL_REFERENCE_URL);
    expect(service.baselines()).toBeNull();
  });

  it('loads baselines and gates on them', () => {
    const { service, http } = setup();
    service.load();
    http.expectOne(MODEL_REFERENCE_URL).flush(REFERENCE_FIXTURE);

    expect(service.loading()).toBe(false);
    expect(service.baselineFor('Deliberate')).toBe('stable_diffusion_1');
    expect(service.supportsRemix('Stable Cascade 1.0')).toBe(true);
    expect(service.supportsRemix('Deliberate')).toBe(false);
    expect(service.supportsQrCode('Deliberate')).toBe(true);
    expect(service.supportsQrCode('Flux')).toBe(false);
  });

  it('persists the baselines with the time they were fetched', () => {
    const { http } = setup();
    TestBed.inject(ModelReferenceService).load();
    http.expectOne(MODEL_REFERENCE_URL).flush(REFERENCE_FIXTURE);

    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    expect(typeof cached.fetchedAt).toBe('number');
    expect(cached.baselines['Flux']).toBe('flux_1');
  });

  it('serves a fresh cache without a request', () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        fetchedAt: Date.now(),
        baselines: { Deliberate: 'stable_diffusion_1' },
      }),
    );
    const { service, http } = setup();
    service.load();

    http.expectNone(MODEL_REFERENCE_URL);
    expect(service.baselineFor('Deliberate')).toBe('stable_diffusion_1');
  });

  it('refetches a cache older than the TTL while still serving it', () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        fetchedAt: Date.now() - MODEL_REFERENCE_TTL_MS - 1,
        baselines: { Deliberate: 'stable_diffusion_1' },
      }),
    );
    const { service, http } = setup();
    service.load();

    expect(service.baselineFor('Deliberate')).toBe('stable_diffusion_1');
    http.expectOne(MODEL_REFERENCE_URL).flush(REFERENCE_FIXTURE);
    expect(service.baselineFor('Flux')).toBe('flux_1');
  });

  it('stays permissive when the fetch fails', () => {
    const { service, http } = setup();
    service.load();
    http
      .expectOne(MODEL_REFERENCE_URL)
      .error(new ProgressEvent('error'), { status: 503, statusText: 'down' });

    expect(service.baselines()).toBeNull();
    expect(service.baselineFor('Deliberate')).toBeNull();
    expect(service.supportsRemix('Deliberate')).toBe(true);
    expect(service.supportsQrCode('Deliberate')).toBe(true);
  });

  it('treats "any model" as unknown and stays permissive', () => {
    const { service, http } = setup();
    service.load();
    http.expectOne(MODEL_REFERENCE_URL).flush(REFERENCE_FIXTURE);

    expect(service.baselineFor('')).toBeNull();
    expect(service.supportsRemix('')).toBe(true);
  });

  it('only does the work once, however often load() is called', () => {
    const { service, http } = setup();
    service.load();
    service.load();
    http.expectOne(MODEL_REFERENCE_URL).flush(REFERENCE_FIXTURE);
    service.load();
    http.expectNone(MODEL_REFERENCE_URL);
    expect(service.baselines()).not.toBeNull();
  });
});
