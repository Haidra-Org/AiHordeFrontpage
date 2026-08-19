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
  coerceRequirements,
  coerceModelNames,
  coerceRequirementsMap,
  normalizeBaseline,
} from './model-reference.service';

const MODEL_REFERENCE_URL =
  'https://models.aihorde.net/api/model_references/v1/image_generation';
const CACHE_KEY = 'aihorde.generate.model_baselines';
const CACHE_VERSION = 3;

const REFERENCE_FIXTURE = {
  Deliberate: { baseline: 'stable diffusion 1', nsfw: false },
  'AlbedoBase XL (SDXL)': { baseline: 'stable_diffusion_xl' },
  'Stable Cascade 1.0': { baseline: 'Stable Cascade' },
  Flux: {
    baseline: 'flux_1',
    requirements: {
      min_steps: 3,
      max_steps: 8,
      min_cfg_scale: 1,
      max_cfg_scale: 4,
      clip_skip: 1,
      samplers: ['k_euler'],
      schedulers: ['karras'],
    },
  },
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

describe('coerceRequirements', () => {
  it('keeps well-formed numbers and string lists', () => {
    expect(
      coerceRequirements({
        min_steps: 3,
        max_steps: 6,
        cfg_scale: 2,
        samplers: ['k_dpmpp_sde'],
        schedulers: ['karras'],
      }),
    ).toEqual({
      min_steps: 3,
      max_steps: 6,
      cfg_scale: 2,
      samplers: ['k_dpmpp_sde'],
      schedulers: ['karras'],
    });
  });

  it('drops malformed fields and keys it does not model', () => {
    expect(
      coerceRequirements({
        clip_skip: 2,
        min_steps: 'three',
        max_steps: Number.NaN,
        samplers: [7, 'k_euler', ''],
        schedulers: [],
        some_future_key: 'ignored',
      }),
    ).toEqual({ clip_skip: 2, samplers: ['k_euler'] });
  });

  it('answers null when nothing usable survives', () => {
    expect(coerceRequirements(null)).toBeNull();
    expect(coerceRequirements('nope')).toBeNull();
    expect(coerceRequirements({})).toBeNull();
    expect(coerceRequirements({ samplers: [] })).toBeNull();
  });
});

describe('coerceRequirementsMap', () => {
  it('keeps only the records that carry requirements', () => {
    expect(coerceRequirementsMap(REFERENCE_FIXTURE)).toEqual({
      Flux: {
        min_steps: 3,
        max_steps: 8,
        min_cfg_scale: 1,
        max_cfg_scale: 4,
        clip_skip: 1,
        samplers: ['k_euler'],
        schedulers: ['karras'],
      },
    });
  });

  it('tolerates a non-object payload', () => {
    expect(coerceRequirementsMap(null)).toEqual({});
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

describe('coerceModelNames', () => {
  it('keeps every record, including one without a baseline', () => {
    expect(coerceModelNames(REFERENCE_FIXTURE)).toEqual([
      'Deliberate',
      'AlbedoBase XL (SDXL)',
      'Stable Cascade 1.0',
      'Flux',
      'NoBaseline',
    ]);
  });

  it('tolerates a non-object payload', () => {
    expect(coerceModelNames(null)).toEqual([]);
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
    expect(service.names()).toContain('NoBaseline');
    expect(service.baselineFor('Deliberate')).toBe('stable_diffusion_1');
    expect(service.supportsRemix('Stable Cascade 1.0')).toBe(true);
    expect(service.supportsRemix('Deliberate')).toBe(false);
    expect(service.supportsQrCode('Deliberate')).toBe(true);
    expect(service.supportsQrCode('Flux')).toBe(false);
  });

  it('loads the requirements alongside the baselines', () => {
    const { service, http } = setup();
    service.load();
    http.expectOne(MODEL_REFERENCE_URL).flush(REFERENCE_FIXTURE);

    expect(service.requirementsFor('Flux')?.max_steps).toBe(8);
    expect(service.requirementsFor('Deliberate')).toBeNull();
    expect(service.requirementsFor('')).toBeNull();
  });

  it('persists the reference with its shape version and fetch time', () => {
    const { http } = setup();
    TestBed.inject(ModelReferenceService).load();
    http.expectOne(MODEL_REFERENCE_URL).flush(REFERENCE_FIXTURE);

    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    expect(cached.version).toBe(CACHE_VERSION);
    expect(typeof cached.fetchedAt).toBe('number');
    expect(cached.names).toContain('NoBaseline');
    expect(cached.baselines['Flux']).toBe('flux_1');
    expect(cached.requirements['Flux'].samplers).toEqual(['k_euler']);
  });

  it('serves a fresh cache without a request', () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        version: CACHE_VERSION,
        fetchedAt: Date.now(),
        names: ['Deliberate', 'NoBaseline'],
        baselines: { Deliberate: 'stable_diffusion_1' },
        requirements: { Deliberate: { clip_skip: 2 } },
      }),
    );
    const { service, http } = setup();
    service.load();

    http.expectNone(MODEL_REFERENCE_URL);
    expect(service.names()).toEqual(['Deliberate', 'NoBaseline']);
    expect(service.baselineFor('Deliberate')).toBe('stable_diffusion_1');
    expect(service.requirementsFor('Deliberate')?.clip_skip).toBe(2);
  });

  it('discards a cache written by an older shape', () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        fetchedAt: Date.now(),
        baselines: { Deliberate: 'stable_diffusion_1' },
      }),
    );
    const { service, http } = setup();
    service.load();

    expect(service.baselines()).toBeNull();
    http.expectOne(MODEL_REFERENCE_URL).flush(REFERENCE_FIXTURE);
    expect(service.baselineFor('Deliberate')).toBe('stable_diffusion_1');
  });

  it('refetches a cache older than the TTL while still serving it', () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        version: CACHE_VERSION,
        fetchedAt: Date.now() - MODEL_REFERENCE_TTL_MS - 1,
        baselines: { Deliberate: 'stable_diffusion_1' },
        requirements: {},
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
