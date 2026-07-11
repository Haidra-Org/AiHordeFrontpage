import { describe, expect, it } from 'vitest';
import {
  buildImageRequest,
  coerceFormValue,
  combinePrompt,
  DEFAULT_GENERATE_FORM_VALUE,
  GenerateFormValue,
} from './generate-form.model';

function value(overrides: Partial<GenerateFormValue> = {}): GenerateFormValue {
  return { ...DEFAULT_GENERATE_FORM_VALUE, ...overrides };
}

describe('buildImageRequest', () => {
  it('maps the core params and defaults r2 on', () => {
    const request = buildImageRequest(
      value({
        prompt: 'a red fox',
        steps: 30,
        cfg_scale: 8,
        width: 768,
        height: 512,
      }),
    );
    expect(request.prompt).toBe('a red fox');
    expect(request.r2).toBe(true);
    expect(request.params?.steps).toBe(30);
    expect(request.params?.cfg_scale).toBe(8);
    expect(request.params?.width).toBe(768);
    expect(request.params?.height).toBe(512);
    expect(request.params?.n).toBe(1);
  });

  it('omits the seed when blank and includes it when set', () => {
    expect(buildImageRequest(value({ seed: '' })).params?.seed).toBeUndefined();
    expect(
      buildImageRequest(value({ seed: '  ' })).params?.seed,
    ).toBeUndefined();
    expect(buildImageRequest(value({ seed: '12345' })).params?.seed).toBe(
      '12345',
    );
  });

  it('includes post_processing only when at least one is selected', () => {
    expect(
      buildImageRequest(value({ post_processing: [] })).params?.post_processing,
    ).toBeUndefined();
    expect(
      buildImageRequest(value({ post_processing: ['GFPGAN', 'CodeFormers'] }))
        .params?.post_processing,
    ).toEqual(['GFPGAN', 'CodeFormers']);
  });

  it('attaches hires_fix and tiling only when enabled', () => {
    const off = buildImageRequest(value({ hires_fix: false, tiling: false }));
    expect(off.params?.hires_fix).toBeUndefined();
    expect(off.params?.tiling).toBeUndefined();

    const on = buildImageRequest(value({ hires_fix: true, tiling: true }));
    expect(on.params?.hires_fix).toBe(true);
    expect(on.params?.tiling).toBe(true);
  });

  it('sends models only when a model is chosen', () => {
    expect(buildImageRequest(value({ model: '' })).models).toBeUndefined();
    expect(buildImageRequest(value({ model: 'AlbedoBase XL' })).models).toEqual(
      ['AlbedoBase XL'],
    );
  });

  it('joins a negative prompt with the horde separator', () => {
    const request = buildImageRequest(
      value({ prompt: 'a castle', negativePrompt: 'blurry' }),
    );
    expect(request.prompt).toBe('a castle ### blurry');
  });

  it('forwards the horde toggles from the form', () => {
    const request = buildImageRequest(
      value({
        nsfw: true,
        censor_nsfw: false,
        trusted_workers: true,
        slow_workers: false,
        allow_downgrade: false,
      }),
    );
    expect(request.nsfw).toBe(true);
    expect(request.censor_nsfw).toBe(false);
    expect(request.trusted_workers).toBe(true);
    expect(request.slow_workers).toBe(false);
    expect(request.allow_downgrade).toBe(false);
  });
});

describe('buildImageRequest source processing', () => {
  it('emits nothing source-related for txt2img (mode none)', () => {
    const request = buildImageRequest(value({ sourceMode: 'none' }), {
      hasSourceImage: true,
    });
    expect(request.source_processing).toBeUndefined();
    expect(request.params?.denoising_strength).toBeUndefined();
    expect(request.params?.control_type).toBeUndefined();
  });

  it('suppresses source fields when no image is attached', () => {
    const request = buildImageRequest(
      value({ sourceMode: 'img2img', denoising_strength: 0.5 }),
      { hasSourceImage: false },
    );
    expect(request.source_processing).toBeUndefined();
    expect(request.params?.denoising_strength).toBeUndefined();
  });

  it('maps img2img to img2img processing with denoising', () => {
    const request = buildImageRequest(
      value({ sourceMode: 'img2img', denoising_strength: 0.4 }),
      { hasSourceImage: true },
    );
    expect(request.source_processing).toBe('img2img');
    expect(request.params?.denoising_strength).toBe(0.4);
    expect(request.params?.control_type).toBeUndefined();
  });

  it('maps controlnet to img2img processing with control_type and denoising', () => {
    const request = buildImageRequest(
      value({
        sourceMode: 'controlnet',
        control_type: 'canny',
        denoising_strength: 0.6,
      }),
      { hasSourceImage: true },
    );
    expect(request.source_processing).toBe('img2img');
    expect(request.params?.control_type).toBe('canny');
    expect(request.params?.denoising_strength).toBe(0.6);
  });

  it('emits image_is_control / return_control_map only when enabled', () => {
    const off = buildImageRequest(
      value({ sourceMode: 'controlnet', control_type: 'depth' }),
      { hasSourceImage: true },
    );
    expect(off.params?.image_is_control).toBeUndefined();
    expect(off.params?.return_control_map).toBeUndefined();

    const on = buildImageRequest(
      value({
        sourceMode: 'controlnet',
        control_type: 'depth',
        image_is_control: true,
        return_control_map: true,
      }),
      { hasSourceImage: true },
    );
    expect(on.params?.image_is_control).toBe(true);
    expect(on.params?.return_control_map).toBe(true);
  });

  it('omits control_type when it is unset for controlnet', () => {
    const request = buildImageRequest(
      value({ sourceMode: 'controlnet', control_type: '' }),
      { hasSourceImage: true },
    );
    expect(request.source_processing).toBe('img2img');
    expect(request.params?.control_type).toBeUndefined();
  });

  it('maps inpainting to inpainting processing with denoising', () => {
    const request = buildImageRequest(
      value({ sourceMode: 'inpainting', denoising_strength: 0.8 }),
      { hasSourceImage: true },
    );
    expect(request.source_processing).toBe('inpainting');
    expect(request.params?.denoising_strength).toBe(0.8);
  });
});

describe('combinePrompt', () => {
  it('returns the positive prompt unchanged with no negative', () => {
    expect(combinePrompt('sunset', '')).toBe('sunset');
    expect(combinePrompt('sunset', '   ')).toBe('sunset');
  });
});

describe('coerceFormValue', () => {
  it('falls back to defaults for non-objects', () => {
    expect(coerceFormValue(null)).toEqual(DEFAULT_GENERATE_FORM_VALUE);
    expect(coerceFormValue('nonsense')).toEqual(DEFAULT_GENERATE_FORM_VALUE);
  });

  it('merges known fields and drops wrongly-typed or unknown ones', () => {
    const merged = coerceFormValue({
      prompt: 'hi',
      steps: 'not-a-number',
      unknownField: 5,
      post_processing: ['GFPGAN', 'bogus'],
    });
    expect(merged.prompt).toBe('hi');
    expect(merged.steps).toBe(DEFAULT_GENERATE_FORM_VALUE.steps);
    expect(merged.post_processing).toEqual(['GFPGAN']);
    expect('unknownField' in merged).toBe(false);
  });

  it('rejects a junk source mode and keeps a valid one', () => {
    expect(coerceFormValue({ sourceMode: 'bogus' }).sourceMode).toBe('none');
    expect(coerceFormValue({ sourceMode: 'inpainting' }).sourceMode).toBe(
      'inpainting',
    );
  });

  it('rejects a junk control type and keeps a valid one', () => {
    expect(coerceFormValue({ control_type: 'bogus' }).control_type).toBe('');
    expect(coerceFormValue({ control_type: 'openpose' }).control_type).toBe(
      'openpose',
    );
    expect(coerceFormValue({ control_type: '' }).control_type).toBe('');
  });

  it('clamps denoising strength into range and ignores non-numbers', () => {
    expect(coerceFormValue({ denoising_strength: 5 }).denoising_strength).toBe(
      1,
    );
    expect(coerceFormValue({ denoising_strength: 0 }).denoising_strength).toBe(
      0.01,
    );
    expect(
      coerceFormValue({ denoising_strength: 'nope' }).denoising_strength,
    ).toBe(DEFAULT_GENERATE_FORM_VALUE.denoising_strength);
  });
});
