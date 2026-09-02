import { describe, expect, it } from 'vitest';
import {
  buildParametersText,
  deriveImageMeta,
  imageErrorFieldKey,
  imageErrorReasonKey,
  kudosDiverged,
  parseParametersText,
} from './image-metadata';
import en from '../../../assets/i18n/en.json';
import { ImageGenerationRequest } from '../../types/generation';
import { StoredJobImageMetadata } from '../../types/generation-job';

const TXT2IMG_REQUEST: ImageGenerationRequest = {
  prompt: 'a fox',
  params: { width: 512, height: 512 },
};

const IMG2IMG_REQUEST: ImageGenerationRequest = {
  ...TXT2IMG_REQUEST,
  source_processing: 'img2img',
};

function metadata(
  genMetadata: StoredJobImageMetadata['genMetadata'],
): StoredJobImageMetadata {
  return { seed: '1', model: 'model', genMetadata };
}

describe('deriveImageMeta', () => {
  it('drops a source-image fault on a request that sent no source image', () => {
    const derived = deriveImageMeta(
      metadata([{ type: 'source_image', value: 'parse_failed' }]),
      TXT2IMG_REQUEST,
    );

    expect(derived.errors).toEqual([]);
  });

  it('drops source mask and extra source faults on the same request', () => {
    const derived = deriveImageMeta(
      metadata([
        { type: 'source_mask', value: 'parse_failed' },
        { type: 'extra_source_images', value: 'download_failed', ref: '0' },
      ]),
      TXT2IMG_REQUEST,
    );

    expect(derived.errors).toEqual([]);
  });

  it('keeps a source-image fault when the request asked for one', () => {
    const derived = deriveImageMeta(
      metadata([{ type: 'source_image', value: 'parse_failed' }]),
      IMG2IMG_REQUEST,
    );

    expect(derived.errors).toEqual([
      { type: 'source_image', value: 'parse_failed', ref: undefined },
    ]);
  });

  it('keeps a source-image fault when no request is known', () => {
    const derived = deriveImageMeta(
      metadata([{ type: 'source_image', value: 'parse_failed' }]),
    );

    expect(derived.errors).toHaveLength(1);
  });

  it('keeps lora and ti faults regardless of the source inputs', () => {
    const derived = deriveImageMeta(
      metadata([
        { type: 'lora', value: 'download_failed', ref: '1234' },
        { type: 'ti', value: 'parse_failed' },
        { type: 'source_image', value: 'parse_failed' },
      ]),
      TXT2IMG_REQUEST,
    );

    expect(derived.errors).toEqual([
      { type: 'lora', value: 'download_failed', ref: '1234' },
      { type: 'ti', value: 'parse_failed', ref: undefined },
    ]);
  });

  it('still reads censorship and the aesthetic score', () => {
    const derived = deriveImageMeta(
      metadata([
        { type: 'censorship', value: 'nsfw' },
        { type: 'aesthetic_score', value: 'see_ref', ref: '7.5' },
        { type: 'source_image', value: 'parse_failed' },
      ]),
      TXT2IMG_REQUEST,
    );

    expect(derived.censored).toBe(true);
    expect(derived.censorReason).toBe('nsfw');
    expect(derived.aesthetic).toBe(7.5);
    expect(derived.errors).toEqual([]);
  });
});

describe('gen_metadata in reader language', () => {
  const copy = en as Record<string, string>;

  it.each(['lora', 'ti', 'source_image', 'source_mask', 'extra_source_images'])(
    'names the %s input in words rather than its token',
    (type) => {
      const key = imageErrorFieldKey(type);
      expect(key).toBe(`generate.results.field_${type}`);
      expect(copy[key]).toBeTruthy();
    },
  );

  it('names an input it has no words for without printing the token', () => {
    const key = imageErrorFieldKey('something_new');
    expect(key).toBe('generate.results.field_other');
    expect(copy[key]).toBeTruthy();
  });

  it.each(['download_failed', 'parse_failed', 'baseline_mismatch'])(
    'explains %s as a sentence',
    (value) => {
      const key = imageErrorReasonKey(value);
      expect(key).toBe(`generate.results.error_${value}`);
      expect(copy[key]).toBeTruthy();
    },
  );

  it('falls back to the one thing every unknown reason has in common', () => {
    const key = imageErrorReasonKey('exploded');
    expect(key).toBe('generate.results.error_other');
    expect(copy[key]).toBeTruthy();
  });
});

describe('kudosDiverged', () => {
  it('says nothing about a job that was never quoted or never charged', () => {
    expect(kudosDiverged(null)).toBe(false);
    expect(kudosDiverged({ quoted: null, charged: 40 })).toBe(false);
    expect(kudosDiverged({ quoted: 40, charged: null })).toBe(false);
  });

  it('lets the fractional tail both figures carry pass unremarked', () => {
    expect(kudosDiverged({ quoted: 40.2, charged: 40.9 })).toBe(false);
  });

  it('flags a whole kudos of difference either way', () => {
    expect(kudosDiverged({ quoted: 40, charged: 52 })).toBe(true);
    expect(kudosDiverged({ quoted: 52, charged: 40 })).toBe(true);
  });
});

describe('buildParametersText', () => {
  const metadata: StoredJobImageMetadata = {
    seed: '99',
    model: 'Deliberate',
  };

  it('writes the three A1111 lines, with the returned seed and model', () => {
    const request: ImageGenerationRequest = {
      prompt: 'a fox ### blurry, watermark',
      models: ['AlbedoBase XL'],
      params: {
        steps: 30,
        sampler_name: 'k_euler_a',
        cfg_scale: 7.5,
        seed: '1',
        width: 1024,
        height: 768,
        clip_skip: 2,
      },
    };
    expect(buildParametersText(request, metadata)).toBe(
      [
        'a fox',
        'Negative prompt: blurry, watermark',
        'Steps: 30, Sampler: Euler a, CFG scale: 7.5, Seed: 99, Size: 1024x768, Model: Deliberate, Clip skip: 2',
      ].join('\n'),
    );
  });

  it('falls back to the request when the worker reported no seed or model', () => {
    const request: ImageGenerationRequest = {
      prompt: 'a fox',
      models: ['AlbedoBase XL'],
      params: { seed: '1', steps: 20 },
    };
    expect(buildParametersText(request, undefined)).toBe(
      'a fox\nSteps: 20, Seed: 1, Model: AlbedoBase XL',
    );
  });

  it('passes an unmapped sampler name through as the horde named it', () => {
    const request: ImageGenerationRequest = {
      prompt: 'a fox',
      params: { sampler_name: 'k_something_new' },
    };
    expect(buildParametersText(request, undefined)).toContain(
      'Sampler: k_something_new',
    );
  });

  it('names the schedule, preferring Karras over a named scheduler', () => {
    const karras: ImageGenerationRequest = {
      prompt: 'a fox',
      params: { karras: true, scheduler: 'simple' },
    };
    expect(buildParametersText(karras, undefined)).toContain(
      'Schedule type: Karras',
    );
    const scheduled: ImageGenerationRequest = {
      prompt: 'a fox',
      params: { scheduler: 'simple' },
    };
    expect(buildParametersText(scheduled, undefined)).toContain(
      'Schedule type: simple',
    );
  });

  it('reports denoising strength only where it did something', () => {
    const params = { denoising_strength: 0.6 };
    expect(
      buildParametersText({ prompt: 'a fox', params }, undefined),
    ).not.toContain('Denoising');
    expect(
      buildParametersText(
        { prompt: 'a fox', params, source_processing: 'img2img' },
        undefined,
      ),
    ).toContain('Denoising strength: 0.6');
  });

  it('has nothing to say about a job with no request', () => {
    expect(buildParametersText(undefined, metadata)).toBe('');
  });
});

describe('parseParametersText', () => {
  it('reads back everything buildParametersText wrote', () => {
    const request: ImageGenerationRequest = {
      prompt: 'a fox in the snow ### blurry, watermark',
      models: ['AlbedoBase XL'],
      source_processing: 'img2img',
      params: {
        steps: 30,
        sampler_name: 'k_dpmpp_2m',
        scheduler: 'simple',
        cfg_scale: 7.5,
        seed: '12345',
        width: 1024,
        height: 768,
        clip_skip: 2,
        denoising_strength: 0.6,
      },
    };
    const parsed = parseParametersText(buildParametersText(request, undefined));

    expect(parsed?.prompt).toBe('a fox in the snow ### blurry, watermark');
    expect(parsed?.models).toEqual(['AlbedoBase XL']);
    expect(parsed?.params).toEqual({
      steps: 30,
      sampler_name: 'k_dpmpp_2m',
      scheduler: 'simple',
      cfg_scale: 7.5,
      seed: '12345',
      width: 1024,
      height: 768,
      clip_skip: 2,
      denoising_strength: 0.6,
    });
  });

  it('turns a Karras schedule back into the flag that asks for it', () => {
    const parsed = parseParametersText(
      'a fox\nSteps: 20, Schedule type: Karras',
    );
    expect(parsed?.params?.karras).toBe(true);
    expect(parsed?.params?.scheduler).toBeUndefined();
  });

  it('reads a sampler named the horde way as well as the A1111 way', () => {
    expect(
      parseParametersText('a fox\nSampler: Euler a')?.params?.sampler_name,
    ).toBe('k_euler_a');
    expect(
      parseParametersText('a fox\nSampler: k_dpmpp_sde')?.params?.sampler_name,
    ).toBe('k_dpmpp_sde');
    expect(
      parseParametersText('a fox\nSampler: nothing of the sort, Steps: 20')
        ?.params?.sampler_name,
    ).toBeUndefined();
  });

  it('keeps a plain sentence as a prompt and nothing else', () => {
    const parsed = parseParametersText('a fox in the snow');
    expect(parsed?.prompt).toBe('a fox in the snow');
    expect(parsed?.params).toBeUndefined();
    expect(parsed?.models).toBeUndefined();
  });

  it('reads a prompt that runs over several lines', () => {
    const parsed = parseParametersText(
      'a fox\nin the snow\nNegative prompt: blurry\nwatermark\nSteps: 20',
    );
    expect(parsed?.prompt).toBe('a fox\nin the snow ### blurry\nwatermark');
    expect(parsed?.params?.steps).toBe(20);
  });

  it('has nothing to answer with for text that says nothing', () => {
    expect(parseParametersText('')).toBeNull();
    expect(parseParametersText('   \n  ')).toBeNull();
  });
});
