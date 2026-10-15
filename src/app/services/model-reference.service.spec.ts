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
  baselineSupportsTransparent,
  coercePendingRecordMap,
  coerceRecordMap,
  coerceRequirements,
  coerceTextRecordMap,
  normalizeBaseline,
  resolveTextModelName,
} from './model-reference.service';

const MODEL_REFERENCE_URL =
  'https://models.aihorde.net/api/model_references/v1/image_generation';
const PENDING_MODEL_REFERENCE_URL =
  'https://models.aihorde.net/api/model_references/v2/pending_queue/changes' +
  '?statuses=pending&categories=image_generation&limit=500';
const TEXT_MODEL_REFERENCE_URL =
  'https://models.aihorde.net/api/model_references/v1/text_generation';
const CACHE_KEY = 'aihorde.generate.model_baselines';
const PENDING_CACHE_KEY = 'aihorde.generate.pending_model_reference';
const TEXT_CACHE_KEY = 'aihorde.generate.text_model_reference';
const CACHE_VERSION = 4;

const REFERENCE_FIXTURE = {
  Deliberate: {
    baseline: 'stable diffusion 1',
    nsfw: false,
    inpainting: false,
    type: 'ckpt',
    description: 'A generalist model.',
    version: '2',
    style: 'generalist',
    homepage: 'https://civitai.com/models/4823',
    showcases: ['https://example.invalid/deliberate.webp', ''],
    tags: ['photorealistic'],
    trigger: ['deliberate style'],
    size_on_disk_bytes: 2132780730,
    optimization: 'lightning',
    config: {
      files: [{ path: 'Deliberate.ckpt', md5sum: 'ignored' }],
      download: [
        { file_name: 'Deliberate.ckpt', file_url: 'https://example.invalid/d' },
        { file_path: '' },
      ],
    },
  },
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

const TEXT_FIXTURE = {
  'acrastt/Marx-3B-V3': {
    name: 'acrastt/Marx-3B-V3',
    model_name: 'Marx-3B-V3',
    baseline: 'StableLM-3B-4E1T',
    parameters: 3000000000,
    description: 'A 3B model.',
    display_name: 'Marx 3B V3',
    url: 'https://huggingface.co/acrastt/Marx-3B-V3',
    tags: ['3B'],
    nsfw: false,
    settings: { temperature: 0.7, top_k: 40, top_p: 'nope' },
  },
  Plain: { baseline: 'llama' },
};

const PENDING_FIXTURE = {
  items: [
    {
      change_id: 301,
      resource_kind: 'model_reference',
      category: 'image_generation',
      model_name: 'Krea2-Turbo_fp8',
      operation: 'create',
      status: 'pending',
      payload: {
        name: 'Krea2-Turbo_fp8',
        baseline: 'qwen_image',
        description: 'A beta image model.',
        requirements: {
          min_steps: 8,
          max_steps: 8,
          min_cfg_scale: 1,
          max_cfg_scale: 1,
          samplers: ['er_sde'],
          schedulers: ['simple'],
        },
      },
    },
  ],
  total: 1,
  offset: 0,
  limit: 500,
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

describe('coerceRecordMap', () => {
  it('reads the fields a model page shows', () => {
    const record = coerceRecordMap(REFERENCE_FIXTURE).get('Deliberate');

    expect(record?.baseline).toBe('stable_diffusion_1');
    expect(record?.description).toBe('A generalist model.');
    expect(record?.homepage).toBe('https://civitai.com/models/4823');
    expect(record?.showcases).toEqual([
      'https://example.invalid/deliberate.webp',
    ]);
    expect(record?.tags).toEqual(['photorealistic']);
    expect(record?.trigger).toEqual(['deliberate style']);
    expect(record?.size_on_disk_bytes).toBe(2132780730);
    expect(record?.optimization).toBe('lightning');
    expect(record?.downloads).toEqual([
      { file_name: 'Deliberate.ckpt', file_url: 'https://example.invalid/d' },
    ]);
  });

  it('keeps a record that carries no baseline, and drops what is not one', () => {
    const records = coerceRecordMap(REFERENCE_FIXTURE);

    expect([...records.keys()]).toEqual([
      'Deliberate',
      'AlbedoBase XL (SDXL)',
      'Stable Cascade 1.0',
      'Flux',
      'NoBaseline',
    ]);
    expect(records.get('NoBaseline')?.baseline).toBeNull();
    expect(records.get('NoBaseline')?.nsfw).toBe(true);
  });

  it('reads back a record it wrote, downloads included', () => {
    const once = coerceRecordMap(REFERENCE_FIXTURE);
    const twice = coerceRecordMap(Object.fromEntries(once));

    expect(twice.get('Deliberate')).toEqual(once.get('Deliberate'));
  });

  it('tolerates a non-object payload', () => {
    expect(coerceRecordMap(null).size).toBe(0);
    expect(coerceRecordMap('nope').size).toBe(0);
  });
});

describe('coercePendingRecordMap', () => {
  it('reads model payloads from pending image-reference changes', () => {
    const record =
      coercePendingRecordMap(PENDING_FIXTURE).get('Krea2-Turbo_fp8');

    expect(record?.baseline).toBe('qwen_image');
    expect(record?.requirements?.samplers).toEqual(['er_sde']);
    expect(record?.description).toBe('A beta image model.');
  });

  it('keeps the newest usable change and ignores non-model changes', () => {
    const records = coercePendingRecordMap({
      items: [
        ...PENDING_FIXTURE.items,
        {
          ...PENDING_FIXTURE.items[0],
          change_id: 302,
          payload: { baseline: 'qwen_image_2' },
        },
        {
          ...PENDING_FIXTURE.items[0],
          change_id: 303,
          operation: 'delete',
        },
        {
          ...PENDING_FIXTURE.items[0],
          change_id: 304,
          resource_kind: 'guidance',
        },
      ],
    });

    expect(records.size).toBe(1);
    expect(records.get('Krea2-Turbo_fp8')?.baseline).toBe('qwen_image_2');
  });
});

describe('coerceTextRecordMap', () => {
  it('reads the fields a text model page shows', () => {
    const record = coerceTextRecordMap(TEXT_FIXTURE).get('acrastt/Marx-3B-V3');

    expect(record?.display_name).toBe('Marx 3B V3');
    expect(record?.baseline).toBe('StableLM-3B-4E1T');
    expect(record?.parameters).toBe(3000000000);
    expect(record?.settings).toEqual({ temperature: 0.7, top_k: 40 });
    expect(record?.url).toBe('https://huggingface.co/acrastt/Marx-3B-V3');
  });

  it('leaves settings null when the record recommends none', () => {
    expect(coerceTextRecordMap(TEXT_FIXTURE).get('Plain')?.settings).toBeNull();
  });
});

describe('resolveTextModelName', () => {
  const records = coerceTextRecordMap(TEXT_FIXTURE);
  const canonical = 'acrastt/Marx-3B-V3';

  it.each([
    canonical,
    `${canonical}::worker`,
    `${canonical}.IQ4_XS`,
    `${canonical}.IQ4_XS::worker`,
    `${canonical}-GGUF-Q4_K_M`,
  ])('resolves the backend-recognized name %s', (name) => {
    expect(resolveTextModelName(name, records)).toBe(canonical);
  });

  it.each([
    `${canonical}.Q4_K_M`,
    `${canonical}::one::two`,
    canonical.toLowerCase(),
    'other/Marx-3B-V3',
  ])('does not broaden backend recognition for %s', (name) => {
    expect(resolveTextModelName(name, records)).toBeNull();
  });

  it('prefers an exact quantized record over its base', () => {
    const quantized = `${canonical}.IQ4_XS`;
    const expanded = coerceTextRecordMap({
      ...TEXT_FIXTURE,
      [quantized]: { parameters: 4e9 },
    });
    expect(resolveTextModelName(quantized, expanded)).toBe(quantized);
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

  it('allows a transparent background on SD 1.5 and SDXL', () => {
    expect(baselineSupportsTransparent('stable_diffusion_1')).toBe(true);
    expect(baselineSupportsTransparent('stable_diffusion_xl')).toBe(true);
    expect(baselineSupportsTransparent('stable_cascade')).toBe(false);
  });

  it('fails open on an unknown baseline', () => {
    expect(baselineSupportsRemix(null)).toBe(true);
    expect(baselineSupportsQrCode(null)).toBe(true);
    expect(baselineSupportsTransparent(null)).toBe(true);
  });
});

describe('ModelReferenceService', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      PENDING_CACHE_KEY,
      JSON.stringify({
        version: CACHE_VERSION,
        fetchedAt: Date.now(),
        records: {},
      }),
    );
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
    expect(service.supportsTransparent('Deliberate')).toBe(true);
    expect(service.supportsTransparent('Flux')).toBe(false);
  });

  it('loads the requirements alongside the baselines', () => {
    const { service, http } = setup();
    service.load();
    http.expectOne(MODEL_REFERENCE_URL).flush(REFERENCE_FIXTURE);

    expect(service.requirementsFor('Flux')?.max_steps).toBe(8);
    expect(service.requirementsFor('Deliberate')).toBeNull();
    expect(service.requirementsFor('')).toBeNull();
  });

  it('uses pending details for an offered model without adding it to the reference list', () => {
    localStorage.removeItem(PENDING_CACHE_KEY);
    const { service, http } = setup();
    service.load();
    http.expectOne(MODEL_REFERENCE_URL).flush(REFERENCE_FIXTURE);
    const pending = http.expectOne(PENDING_MODEL_REFERENCE_URL);
    expect(pending.request.headers.get('apikey')).toBe('0000000000');
    pending.flush(PENDING_FIXTURE);

    expect(service.names()).not.toContain('Krea2-Turbo_fp8');
    expect(service.isPendingModel('Krea2-Turbo_fp8')).toBe(true);
    expect(service.baselineFor('Krea2-Turbo_fp8')).toBe('qwen_image');
    expect(service.requirementsFor('Krea2-Turbo_fp8')?.max_steps).toBe(8);
    expect(service.recordFor('Krea2-Turbo_fp8')?.description).toBe(
      'A beta image model.',
    );

    const cached = JSON.parse(
      localStorage.getItem(PENDING_CACHE_KEY) ?? 'null',
    );
    expect(cached.records['Krea2-Turbo_fp8'].baseline).toBe('qwen_image');
  });

  it('keeps an accepted reference record authoritative over a pending change', () => {
    localStorage.setItem(
      PENDING_CACHE_KEY,
      JSON.stringify({
        version: CACHE_VERSION,
        fetchedAt: Date.now(),
        records: {
          Flux: {
            baseline: 'pending_baseline',
            requirements: { max_steps: 99 },
          },
        },
      }),
    );
    const { service, http } = setup();
    service.load();
    http.expectOne(MODEL_REFERENCE_URL).flush(REFERENCE_FIXTURE);

    expect(service.isPendingModel('Flux')).toBe(false);
    expect(service.baselineFor('Flux')).toBe('flux_1');
    expect(service.requirementsFor('Flux')?.max_steps).toBe(8);
  });

  it('persists the reference with its shape version and fetch time', () => {
    const { http } = setup();
    TestBed.inject(ModelReferenceService).load();
    http.expectOne(MODEL_REFERENCE_URL).flush(REFERENCE_FIXTURE);

    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    expect(cached.version).toBe(CACHE_VERSION);
    expect(typeof cached.fetchedAt).toBe('number');
    expect(Object.keys(cached.records)).toContain('NoBaseline');
    expect(cached.records['Flux'].baseline).toBe('flux_1');
    expect(cached.records['Flux'].requirements.samplers).toEqual(['k_euler']);
  });

  it('serves a fresh cache without a request', () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        version: CACHE_VERSION,
        fetchedAt: Date.now(),
        records: {
          Deliberate: {
            baseline: 'stable_diffusion_1',
            requirements: { clip_skip: 2 },
          },
          NoBaseline: {},
        },
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
        records: { Deliberate: { baseline: 'stable_diffusion_1' } },
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
        records: { Deliberate: { baseline: 'stable_diffusion_1' } },
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

describe('ModelReferenceService text reference', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      PENDING_CACHE_KEY,
      JSON.stringify({
        version: CACHE_VERSION,
        fetchedAt: Date.now(),
        records: {},
      }),
    );
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('asks for nothing until loadText() is called', () => {
    const { service, http } = setup();
    service.load();
    http.expectOne(MODEL_REFERENCE_URL).flush(REFERENCE_FIXTURE);

    http.expectNone(TEXT_MODEL_REFERENCE_URL);
    expect(service.textRecords()).toBeNull();
  });

  it('loads the text records and persists them under their own key', () => {
    const { service, http } = setup();
    service.loadText();
    http.expectOne(TEXT_MODEL_REFERENCE_URL).flush(TEXT_FIXTURE);

    expect(service.textLoading()).toBe(false);
    expect(service.textNames()).toEqual(['acrastt/Marx-3B-V3', 'Plain']);
    expect(service.textRecordFor('acrastt/Marx-3B-V3')?.parameters).toBe(
      3000000000,
    );
    expect(service.textRecordFor('missing')).toBeNull();

    const cached = JSON.parse(localStorage.getItem(TEXT_CACHE_KEY) ?? 'null');
    expect(cached.version).toBe(CACHE_VERSION);
    expect(cached.records['Plain'].baseline).toBe('llama');
  });

  it('serves a fresh text cache without a request', () => {
    localStorage.setItem(
      TEXT_CACHE_KEY,
      JSON.stringify({
        version: CACHE_VERSION,
        fetchedAt: Date.now(),
        records: { Plain: { baseline: 'llama' } },
      }),
    );
    const { service, http } = setup();
    service.loadText();

    http.expectNone(TEXT_MODEL_REFERENCE_URL);
    expect(service.textRecordFor('Plain')?.baseline).toBe('llama');
  });

  it('provides canonical metadata for a worker-qualified quantized model', () => {
    const { service, http } = setup();
    service.loadText();
    http.expectOne(TEXT_MODEL_REFERENCE_URL).flush(TEXT_FIXTURE);
    expect(service.textRecordFor('acrastt/Marx-3B-V3.IQ4_XS::worker')).toEqual(
      service.textRecordFor('acrastt/Marx-3B-V3'),
    );
  });

  it('stays quiet when the text fetch fails', () => {
    const { service, http } = setup();
    service.loadText();
    http
      .expectOne(TEXT_MODEL_REFERENCE_URL)
      .error(new ProgressEvent('error'), { status: 503, statusText: 'down' });

    expect(service.textRecords()).toBeNull();
    expect(service.textRecordFor('Plain')).toBeNull();
  });
});
