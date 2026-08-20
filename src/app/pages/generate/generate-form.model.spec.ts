import { describe, expect, it } from 'vitest';
import {
  buildAspectPresets,
  buildImageRequest,
  CFG_SLIDER_MAX,
  CFG_SLIDER_MIN,
  createGenerateForm,
  CONTROL_TYPES,
  EXTENDED_CONTROL_TYPES,
  LEGACY_CONTROL_TYPES,
  MAX_CFG_SCALE,
  MAX_CLIP_SKIP,
  MAX_STEPS,
  MIN_CFG_SCALE,
  MIN_STEPS,
  rangeFillPercent,
  STEPS_SLIDER_MAX,
  STEPS_SLIDER_MIN,
  buildStyledImageRequest,
  cfgRequirementHint,
  clipSkipRequirementHint,
  coerceFormValue,
  combinePrompt,
  DEFAULT_GENERATE_FORM_VALUE,
  GenerateFormValue,
  isSnappableSize,
  kudosBreakdown,
  modelWaitEstimate,
  karrasRequirementHint,
  nativeSizeHint,
  nativeSquareFor,
  normalizeWorkers,
  promptHistoryFromJobs,
  requestToFormValue,
  cfgPlusPlusHint,
  samplerRequirementHint,
  schedulerRequirementHint,
  clipSkipRangeHint,
  hiresUnneededHint,
  samplerStepCostHint,
  sd15HiresHint,
  cfgAdvisory,
  clipSkipAdvisory,
  scheduleAdvisory,
  sizeAdvisory,
  stepsAdvisory,
  suggestedSettings,
  suggestedSettingsCount,
  simpleModeValue,
  sizeBaseFor,
  sizeSuitsNativeSquare,
  stepsRequirementHint,
  stripEphemeralExtras,
  suggestedSamplers,
} from './generate-form.model';
import { ANNOTATION_CONTROL_TYPES } from '../../types/generation';
import { AppliedStyle } from '../../services/horde-styles.service';
import { LocalGenerationJob } from '../../types/generation-job';
import {
  SamplerConstraintsDocument,
  coerceSamplerConstraints,
} from '../../types/sampler-constraints';
import live from '../../testing/fixtures/sampler-constraints.stub.json';

const samplerContract: SamplerConstraintsDocument = {
  schema_version: '1.0',
  samplers: {
    k_euler: {
      name: 'k_euler',
      presentation_tier: 'recommended',
      solver_type_choices: [],
      accepted_settings: {
        sampler_s_churn: {
          minimum: 0,
          maximum: 100,
          default: 0,
          integer_only: false,
        },
      },
    },
    dpmpp_2m_sde: {
      name: 'dpmpp_2m_sde',
      presentation_tier: 'recommended',
      solver_type_choices: ['midpoint', 'heun'],
      accepted_settings: {
        sampler_eta: {
          minimum: 0,
          maximum: 100,
          default: 1,
          integer_only: false,
        },
      },
    },
  },
  hard_constraints: {
    rejected_sampler_scheduler_pairings: [
      { sampler: 'dpmpp_2m_sde', scheduler: 'normal' },
    ],
    scheduler_baseline_applicability: {
      align_your_steps: ['stable_diffusion_1', 'stable_diffusion_xl'],
    },
  },
  presentation_tiers: { recommended: ['k_euler', 'dpmpp_2m_sde'] },
};

const baselineForModel = (model: string): string | null =>
  ({ flux: 'flux_1', sdxl: 'stable_diffusion_xl' })[model] ?? null;

function value(overrides: Partial<GenerateFormValue> = {}): GenerateFormValue {
  return { ...DEFAULT_GENERATE_FORM_VALUE, ...overrides };
}

describe('simpleModeValue', () => {
  it('keeps the simple-mode fields and resets everything else to defaults', () => {
    const result = simpleModeValue(
      value({
        mode: 'simple',
        styleName: 'Cinematic',
        prompt: 'a fox',
        negativePrompt: 'blurry',
        n: 3,
        model: 'flux',
        width: 768,
        height: 512,
        // Advanced-only fields that must be discarded in simple mode.
        steps: 40,
        post_processing: ['GFPGAN'],
        sourceMode: 'img2img',
        seed: '12345',
        nsfw: true,
      }),
    );

    expect(result.styleName).toBe('Cinematic');
    expect(result.prompt).toBe('a fox');
    expect(result.negativePrompt).toBe('blurry');
    expect(result.n).toBe(3);
    expect(result.model).toBe('flux');
    expect(result.width).toBe(768);
    expect(result.height).toBe(512);

    expect(result.steps).toBe(DEFAULT_GENERATE_FORM_VALUE.steps);
    expect(result.post_processing).toEqual([]);
    expect(result.sourceMode).toBe('none');
    expect(result.seed).toBe('');
    expect(result.nsfw).toBe(false);
  });

  it('does not mutate the input value', () => {
    const original = value({ mode: 'simple', steps: 40 });
    simpleModeValue(original);
    expect(original.steps).toBe(40);
  });
});

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

  it('sends only as many loras as the horde accepts', () => {
    const loras = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name) => ({
      name,
      model: 1,
      clip: 1,
    }));
    const sent = buildImageRequest(value({ loras })).params?.loras;
    // The panel keeps all seven so one can be promoted; the request cannot.
    expect(sent).toHaveLength(5);
    expect(sent?.map((lora) => lora.name)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('sends only as many textual inversions as the horde accepts', () => {
    const tis = Array.from({ length: 25 }, (_, i) => ({
      name: `ti-${i}`,
      strength: 1,
    }));
    expect(buildImageRequest(value({ tis })).params?.tis).toHaveLength(20);
  });

  it('never sends a style-only file hash on a generation', () => {
    const sent = buildImageRequest(
      value({
        loras: [{ name: '1', model: 1, clip: 1, sha256: 'c'.repeat(64) }],
      }),
    ).params?.loras;
    expect(sent?.[0]).toEqual({ name: '1', model: 1, clip: 1 });
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

  it('leaves the source keys out of a txt2img payload entirely', () => {
    // A key present but undefined still serialises as a source-carrying request
    // to anything that reads the payload by key, so absence is what is asserted.
    for (const request of [
      buildImageRequest(value({ prompt: 'a fox' })),
      buildStyledImageRequest(value({ prompt: 'a fox' }), null),
    ]) {
      expect(Object.keys(request)).not.toContain('source_image');
      expect(Object.keys(request)).not.toContain('source_processing');
      expect(Object.keys(request)).not.toContain('source_mask');
      expect(Object.keys(request)).not.toContain('extra_source_images');
    }
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

  it('maps inpainting to inpainting processing, replacing the masked region outright', () => {
    // The panel shows no strength control in this mode, so the strength the
    // reader last set for img2img must not ride along unseen.
    const request = buildImageRequest(
      value({ sourceMode: 'inpainting', denoising_strength: 0.8 }),
      { hasSourceImage: true },
    );
    expect(request.source_processing).toBe('inpainting');
    expect(request.params?.denoising_strength).toBe(1);
  });
});

describe('buildImageRequest advanced params', () => {
  it('sends the legacy karras flag for the karras schedule and no other', () => {
    expect(buildImageRequest(value()).params?.karras).toBe(true);
    expect(
      buildImageRequest(value({ scheduler: 'normal' })).params?.karras,
    ).toBeUndefined();
    // Without the contract the modern field is never sent, so the flag is the
    // whole of what a pre-contract server is told.
    expect(buildImageRequest(value()).params?.scheduler).toBeUndefined();
  });

  it('emits transparent only when enabled', () => {
    expect(buildImageRequest(value()).params?.transparent).toBeUndefined();
    expect(
      buildImageRequest(value({ transparent: true })).params?.transparent,
    ).toBe(true);
  });

  it('emits facefixer_strength only when a face fixer is post-processing', () => {
    expect(
      buildImageRequest(value({ facefixer_strength: 0.4 })).params
        ?.facefixer_strength,
    ).toBeUndefined();
    expect(
      buildImageRequest(
        value({ post_processing: ['GFPGAN'], facefixer_strength: 0.4 }),
      ).params?.facefixer_strength,
    ).toBe(0.4);
  });

  it('emits hires_fix_denoising_strength only alongside hires_fix', () => {
    expect(
      buildImageRequest(value({ hires_fix_denoising_strength: 0.5 })).params
        ?.hires_fix_denoising_strength,
    ).toBeUndefined();
    const on = buildImageRequest(
      value({ hires_fix: true, hires_fix_denoising_strength: 0.5 }),
    );
    expect(on.params?.hires_fix).toBe(true);
    expect(on.params?.hires_fix_denoising_strength).toBe(0.5);
  });

  it('emits seed_variation only when greater than one', () => {
    expect(
      buildImageRequest(value({ seed_variation: 1 })).params?.seed_variation,
    ).toBeUndefined();
    expect(
      buildImageRequest(value({ seed_variation: 5 })).params?.seed_variation,
    ).toBe(5);
  });

  it('maps loras only when present, carrying strengths and flags', () => {
    expect(
      buildImageRequest(value({ loras: [] })).params?.loras,
    ).toBeUndefined();
    const request = buildImageRequest(
      value({
        loras: [
          { name: '247778', model: 0.8, clip: 0.5, is_version: true },
          { name: 'Plain', model: 1, clip: 1 },
        ],
      }),
    );
    expect(request.params?.loras).toEqual([
      { name: '247778', model: 0.8, clip: 0.5, is_version: true },
      { name: 'Plain', model: 1, clip: 1 },
    ]);
  });

  it('maps tis only when present, carrying inject target and strength', () => {
    expect(buildImageRequest(value({ tis: [] })).params?.tis).toBeUndefined();
    const request = buildImageRequest(
      value({ tis: [{ name: '7808', strength: 0.6, inject_ti: 'negprompt' }] }),
    );
    expect(request.params?.tis).toEqual([
      { name: '7808', strength: 0.6, inject_ti: 'negprompt' },
    ]);
  });
});

describe('buildImageRequest sampler contract', () => {
  it('serializes only settings accepted by the final sampler', () => {
    const request = buildImageRequest(
      value({
        model: 'sdxl',
        sampler_name: 'dpmpp_2m_sde',
        scheduler: 'karras',
        sampler_eta: 0.7,
        sampler_s_churn: 9,
        sampler_solver_type: 'heun',
      }),
      { samplerContract, baselineForModel },
    );

    expect(request.params?.scheduler).toBe('karras');
    // The legacy pair rides both fields, so a worker reading either one gets
    // the schedule that was asked for.
    expect(request.params?.karras).toBe(true);
    expect(request.params?.sampler_eta).toBe(0.7);
    expect(request.params?.sampler_s_churn).toBeUndefined();
    expect(request.params?.sampler_solver_type).toBe('heun');
  });

  it('drops the legacy flag once a modern schedule is chosen', () => {
    const request = buildImageRequest(
      value({
        model: 'sdxl',
        sampler_name: 'k_euler',
        scheduler: 'align_your_steps',
      }),
      { samplerContract, baselineForModel },
    );

    expect(request.params?.scheduler).toBe('align_your_steps');
    expect(request.params?.karras).toBeUndefined();
  });

  it('omits rejected schedulers and out-of-range settings', () => {
    const request = buildImageRequest(
      value({
        model: 'sdxl',
        sampler_name: 'dpmpp_2m_sde',
        scheduler: 'normal',
        sampler_eta: 101,
        sampler_solver_type: 'unsupported',
      }),
      { samplerContract, baselineForModel },
    );

    expect(request.params?.scheduler).toBeUndefined();
    expect(request.params?.sampler_eta).toBeUndefined();
    expect(request.params?.sampler_solver_type).toBeUndefined();
  });

  it('revalidates hidden values after a style replaces sampler and model', () => {
    const request = buildStyledImageRequest(
      value({
        model: 'flux',
        sampler_name: 'k_euler',
        sampler_eta: 0.5,
        sampler_s_churn: 4,
        flow_shift: 3,
      }),
      {
        prompt: 'styled',
        forcedParams: { model: 'sdxl', sampler_name: 'dpmpp_2m_sde' },
      },
      { samplerContract, baselineForModel },
    );

    expect(request.params?.sampler_eta).toBe(0.5);
    expect(request.params?.sampler_s_churn).toBeUndefined();
    expect(request.params?.flow_shift).toBeUndefined();
  });
});

describe('buildImageRequest request-level toggles', () => {
  it('emits shared true by default and drops it when disabled', () => {
    expect(buildImageRequest(value()).shared).toBe(true);
    expect(buildImageRequest(value({ shared: false })).shared).toBeUndefined();
  });

  it('emits replacement_filter only as an explicit opt-out', () => {
    expect(buildImageRequest(value()).replacement_filter).toBeUndefined();
    expect(
      buildImageRequest(value({ replacement_filter: false }))
        .replacement_filter,
    ).toBe(false);
  });

  it('emits extra_slow_workers and disable_batching only when enabled', () => {
    const off = buildImageRequest(value());
    expect(off.extra_slow_workers).toBeUndefined();
    expect(off.disable_batching).toBeUndefined();

    const on = buildImageRequest(
      value({ extra_slow_workers: true, disable_batching: true }),
    );
    expect(on.extra_slow_workers).toBe(true);
    expect(on.disable_batching).toBe(true);
  });
});

describe('buildStyledImageRequest', () => {
  it('is identical to buildImageRequest when no style is applied', () => {
    const form = value({ prompt: 'a fox', negativePrompt: 'blurry' });
    expect(buildStyledImageRequest(form, null)).toEqual(
      buildImageRequest(form),
    );
  });

  it('overrides the prompt and forced params from the style', () => {
    const form = value({
      prompt: 'a fox',
      negativePrompt: 'blurry',
      model: 'user-model',
      steps: 25,
      cfg_scale: 7.5,
      karras: true,
    });
    const applied: AppliedStyle = {
      prompt: 'stylised a fox ### blurry',
      forcedParams: {
        model: 'SDXL 1.0',
        steps: 8,
        cfg_scale: 2,
        karras: false,
        loras: [{ name: '247778', is_version: true }],
      },
    };

    const request = buildStyledImageRequest(form, applied);

    expect(request.prompt).toBe('stylised a fox ### blurry');
    expect(request.models).toEqual(['SDXL 1.0']);
    expect(request.params?.steps).toBe(8);
    expect(request.params?.cfg_scale).toBe(2);
    // Style forces karras off, so it must not linger from the form default.
    expect(request.params?.karras).toBeUndefined();
    expect(request.params?.loras).toEqual([
      { name: '247778', is_version: true },
    ]);
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

  it('drops malformed lora entries and clamps strengths', () => {
    const merged = coerceFormValue({
      loras: [
        { name: 'Good', model: 0.5, clip: 0.5 },
        { name: '', model: 1, clip: 1 },
        { model: 1, clip: 1 },
        'nonsense',
        null,
        { name: '1558543', model: 99, clip: -99, is_version: true },
        { name: 'Trimmed', inject_trigger: '  ' },
      ],
    });
    expect(merged.loras).toEqual([
      { name: 'Good', model: 0.5, clip: 0.5 },
      { name: '1558543', model: 5, clip: -5, is_version: true },
      { name: 'Trimmed', model: 1, clip: 1 },
    ]);
  });

  it('keeps a lora version flag only where the horde would accept one', () => {
    // A version request has to name an integer, so the flag is what is wrong on
    // a named asset, not the name: dropping it saves the rest of the entry.
    const merged = coerceFormValue({
      loras: [
        { name: 'epi_noiseoffset', model: 1, clip: 1, is_version: true },
        { name: '1558543', model: 1, clip: 1, is_version: true },
      ],
    });
    expect(merged.loras).toEqual([
      { name: 'epi_noiseoffset', model: 1, clip: 1 },
      { name: '1558543', model: 1, clip: 1, is_version: true },
    ]);
  });

  it('drops malformed ti entries and validates the inject target', () => {
    const merged = coerceFormValue({
      tis: [
        { name: '7808', strength: 0.6, inject_ti: 'negprompt' },
        { name: 'Bad', inject_ti: 'sideways' },
        { strength: 1 },
      ],
    });
    expect(merged.tis).toEqual([
      { name: '7808', strength: 0.6, inject_ti: 'negprompt' },
      { name: 'Bad', strength: 1 },
    ]);
  });

  it('rejects a junk mode and keeps a valid one', () => {
    expect(coerceFormValue({ mode: 'bogus' }).mode).toBe('simple');
    expect(coerceFormValue({ mode: 'advanced' }).mode).toBe('advanced');
  });

  it('clamps facefixer, hires denoise and seed_variation into range', () => {
    expect(coerceFormValue({ facefixer_strength: 9 }).facefixer_strength).toBe(
      1,
    );
    expect(
      coerceFormValue({ hires_fix_denoising_strength: 0 })
        .hires_fix_denoising_strength,
    ).toBe(0.01);
    expect(coerceFormValue({ seed_variation: 9000 }).seed_variation).toBe(1000);
    expect(coerceFormValue({ seed_variation: 3.7 }).seed_variation).toBe(4);
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

describe('requestToFormValue', () => {
  it('splits the combined prompt and recovers core parameters', () => {
    const result = requestToFormValue({
      prompt: 'a castle ### blurry, low quality',
      params: {
        sampler_name: 'k_euler',
        steps: 30,
        cfg_scale: 6,
        width: 768,
        height: 1024,
        n: 2,
        seed: '42',
        karras: true,
      },
      models: ['Deliberate'],
      nsfw: true,
      censor_nsfw: false,
    });

    expect(result.prompt).toBe('a castle');
    expect(result.negativePrompt).toBe('blurry, low quality');
    expect(result.model).toBe('Deliberate');
    expect(result.sampler_name).toBe('k_euler');
    expect(result.steps).toBe(30);
    expect(result.width).toBe(768);
    expect(result.height).toBe(1024);
    expect(result.n).toBe(2);
    expect(result.seed).toBe('42');
    expect(result.scheduler).toBe('karras');
    expect(result.nsfw).toBe(true);
    expect(result.censor_nsfw).toBe(false);
    // Loading always opens advanced so every recovered field is visible.
    expect(result.mode).toBe('advanced');
  });

  it('prefers a named schedule over the legacy flag when both ride along', () => {
    expect(
      requestToFormValue({
        prompt: 'a castle',
        params: { karras: true, scheduler: 'beta' },
      }).scheduler,
    ).toBe('beta');
    expect(
      requestToFormValue({ prompt: 'a castle', params: {} }).scheduler,
    ).toBe('normal');
  });

  it('recovers a plain prompt with no negative half', () => {
    const result = requestToFormValue({ prompt: 'just a prompt' });
    expect(result.prompt).toBe('just a prompt');
    expect(result.negativePrompt).toBe('');
  });

  it('distinguishes controlnet, img2img, and inpainting source modes', () => {
    expect(
      requestToFormValue({
        prompt: 'x',
        source_processing: 'img2img',
        params: { control_type: 'canny' },
      }).sourceMode,
    ).toBe('controlnet');
    expect(
      requestToFormValue({ prompt: 'x', source_processing: 'img2img' })
        .sourceMode,
    ).toBe('img2img');
    expect(
      requestToFormValue({ prompt: 'x', source_processing: 'inpainting' })
        .sourceMode,
    ).toBe('inpainting');
    expect(requestToFormValue({ prompt: 'x' }).sourceMode).toBe('none');
  });

  it('maps loras and tis back with defaulted strengths', () => {
    const result = requestToFormValue({
      prompt: 'x',
      params: {
        loras: [{ name: 'l1', model: 0.8 }],
        tis: [{ name: 't1', inject_ti: 'negprompt' }],
      },
    });
    expect(result.loras).toEqual([{ name: 'l1', model: 0.8, clip: 1 }]);
    expect(result.tis[0].name).toBe('t1');
    expect(result.tis[0].strength).toBe(1);
    expect(result.tis[0].inject_ti).toBe('negprompt');
  });

  it('treats an absent replacement_filter as enabled', () => {
    expect(requestToFormValue({ prompt: 'x' }).replacement_filter).toBe(true);
    expect(
      requestToFormValue({ prompt: 'x', replacement_filter: false })
        .replacement_filter,
    ).toBe(false);
  });
});

describe('promptHistoryFromJobs', () => {
  const job = (prompt: string, createdAt: number): LocalGenerationJob => ({
    localId: `job-${createdAt}`,
    status: 'done',
    createdAt,
    updatedAt: createdAt,
    request: { prompt },
    resultImageIds: [],
  });

  it('lists distinct prompts newest first, splitting off the negative half', () => {
    const history = promptHistoryFromJobs([
      job('a castle ### blurry', 300),
      job('a fox', 200),
      job('a castle ### blurry', 100),
    ]);

    expect(history).toEqual([
      { prompt: 'a castle', negativePrompt: 'blurry' },
      { prompt: 'a fox', negativePrompt: '' },
    ]);
  });

  it('orders by creation time rather than the order it was handed', () => {
    const history = promptHistoryFromJobs([
      job('older', 100),
      job('newer', 900),
    ]);
    expect(history.map((entry) => entry.prompt)).toEqual(['newer', 'older']);
  });

  it('skips jobs with an empty prompt and honours the limit', () => {
    const history = promptHistoryFromJobs(
      [job('   ', 400), job('one', 300), job('two', 200), job('three', 100)],
      2,
    );
    expect(history.map((entry) => entry.prompt)).toEqual(['one', 'two']);
  });
});

describe('normalizeWorkers', () => {
  it('trims, drops blanks, de-duplicates, and caps at the horde limit', () => {
    expect(
      normalizeWorkers([' a ', 'a', '', '   ', 'b', 'c', 'd', 'e', 'f']),
    ).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('stripEphemeralExtras', () => {
  it('blanks the webhook and worker routing without the opt-in', () => {
    const stripped = stripEphemeralExtras(
      value({
        webhook: 'https://example.test/hook',
        workers: ['alpha'],
        workerBlacklist: true,
        qrText: 'https://aihorde.net',
      }),
    );

    expect(stripped.webhook).toBe('');
    expect(stripped.workers).toEqual([]);
    expect(stripped.workerBlacklist).toBe(false);
    // qrText is a generation parameter, not account-shaped detail.
    expect(stripped.qrText).toBe('https://aihorde.net');
  });

  it('keeps everything once the user opts in', () => {
    const input = value({
      rememberExtras: true,
      webhook: 'https://example.test/hook',
      workers: ['alpha'],
      workerBlacklist: true,
    });
    expect(stripEphemeralExtras(input)).toBe(input);
  });
});

describe('buildImageRequest extras', () => {
  it('sends a valid webhook and drops anything else', () => {
    expect(
      buildImageRequest(value({ webhook: '  https://example.test/hook  ' }))
        .webhook,
    ).toBe('https://example.test/hook');
    expect(
      buildImageRequest(value({ webhook: 'ftp://x.test' })).webhook,
    ).toBeUndefined();
    expect(
      buildImageRequest(value({ webhook: 'nope' })).webhook,
    ).toBeUndefined();
    expect(buildImageRequest(value()).webhook).toBeUndefined();
  });

  it('sends workers with the blacklist flag, and neither when the list is empty', () => {
    const request = buildImageRequest(
      value({ workers: [' alpha ', 'alpha', 'beta'], workerBlacklist: true }),
    );
    expect(request.workers).toEqual(['alpha', 'beta']);
    expect(request.worker_blacklist).toBe(true);

    const bare = buildImageRequest(value({ workerBlacklist: true }));
    expect(bare.workers).toBeUndefined();
    expect(bare.worker_blacklist).toBeUndefined();
  });

  it('turns qrText into the qr_code workflow and its extra text', () => {
    const request = buildImageRequest(
      value({ qrText: ' https://aihorde.net ' }),
    );
    expect(request.params?.workflow).toBe('qr_code');
    expect(request.params?.extra_texts).toEqual([
      { text: 'https://aihorde.net', reference: 'qr_code' },
    ]);

    const bare = buildImageRequest(value({ qrText: '   ' }));
    expect(bare.params?.workflow).toBeUndefined();
    expect(bare.params?.extra_texts).toBeUndefined();
  });

  it('sends the layout knobs beside the payload, and only when set', () => {
    const request = buildImageRequest(
      value({
        qrText: 'https://aihorde.net',
        qrXOffset: ' 48 ',
        qrYOffset: '48',
        qrModuleDrawer: 'Circle',
      }),
    );
    expect(request.params?.extra_texts).toEqual([
      { text: 'https://aihorde.net', reference: 'qr_code' },
      { text: '48', reference: 'x_offset' },
      { text: '48', reference: 'y_offset' },
      { text: 'Circle', reference: 'module_drawer' },
    ]);

    // Unset, and anything that is not a whole number of pixels, sends nothing:
    // the workflow's own defaults are a centred code drawn as squares.
    const partial = buildImageRequest(
      value({ qrText: 'https://aihorde.net', qrXOffset: '-8', qrYOffset: '' }),
    );
    expect(partial.params?.extra_texts).toEqual([
      { text: 'https://aihorde.net', reference: 'qr_code' },
    ]);
  });

  it('leaves the layout knobs off a request with no QR payload', () => {
    const request = buildImageRequest(
      value({ qrText: '', qrXOffset: '48', qrModuleDrawer: 'Circle' }),
    );
    expect(request.params?.extra_texts).toBeUndefined();
  });

  it('maps remix onto its own source processing without a denoise pass', () => {
    const request = buildImageRequest(value({ sourceMode: 'remix' }), {
      hasSourceImage: true,
    });
    expect(request.source_processing).toBe('remix');
    expect(request.params?.denoising_strength).toBeUndefined();
  });
});

describe('requestToFormValue extras', () => {
  it('recovers the webhook, workers, qr text, and remix mode', () => {
    const recovered = requestToFormValue(
      buildImageRequest(
        value({
          sourceMode: 'remix',
          webhook: 'https://example.test/hook',
          workers: ['alpha', 'beta'],
          workerBlacklist: true,
          qrText: 'https://aihorde.net',
        }),
        { hasSourceImage: true },
      ),
    );

    expect(recovered.sourceMode).toBe('remix');
    expect(recovered.webhook).toBe('https://example.test/hook');
    expect(recovered.workers).toEqual(['alpha', 'beta']);
    expect(recovered.workerBlacklist).toBe(true);
    expect(recovered.qrText).toBe('https://aihorde.net');
  });

  it('defaults the extras when the request carries none', () => {
    const recovered = requestToFormValue({ prompt: 'a fox' });
    expect(recovered.webhook).toBe('');
    expect(recovered.workers).toEqual([]);
    expect(recovered.workerBlacklist).toBe(false);
    expect(recovered.qrText).toBe('');
    expect(recovered.qrXOffset).toBe('');
    expect(recovered.qrYOffset).toBe('');
    expect(recovered.qrModuleDrawer).toBe('');
  });

  it('reads the QR layout back out of extra_texts', () => {
    const recovered = requestToFormValue(
      buildImageRequest(
        value({
          qrText: 'https://aihorde.net',
          qrXOffset: '48',
          qrYOffset: '64',
          qrModuleDrawer: 'Circle',
        }),
      ),
    );

    expect(recovered.qrXOffset).toBe('48');
    expect(recovered.qrYOffset).toBe('64');
    expect(recovered.qrModuleDrawer).toBe('Circle');
  });

  it('reads a hand-written drawer name as the option the panel holds', () => {
    // The worker matches the name case-insensitively, so a request written by
    // hand is the same choice and has to land on the same option.
    const recovered = requestToFormValue({
      prompt: 'a fox',
      params: {
        workflow: 'qr_code',
        extra_texts: [
          { text: 'https://aihorde.net', reference: 'qr_code' },
          { text: 'circle', reference: 'module_drawer' },
          { text: 'sideways', reference: 'x_offset' },
        ],
      },
    });

    expect(recovered.qrModuleDrawer).toBe('Circle');
    expect(recovered.qrXOffset).toBe('');
  });
});

describe('coerceFormValue extras', () => {
  it('normalises a persisted worker list and rejects malformed members', () => {
    const merged = coerceFormValue({
      workers: [' alpha ', 42, '', 'beta', 'alpha'],
      webhook: 'https://example.test/hook',
      workerBlacklist: 'yes',
      qrText: 7,
      rememberExtras: true,
    });

    expect(merged.workers).toEqual(['alpha', 'beta']);
    expect(merged.webhook).toBe('https://example.test/hook');
    expect(merged.workerBlacklist).toBe(false);
    expect(merged.qrText).toBe('');
    expect(merged.rememberExtras).toBe(true);
  });

  it('rejects a persisted drawer name the workflow does not accept', () => {
    expect(coerceFormValue({ qrModuleDrawer: 'Circle' }).qrModuleDrawer).toBe(
      'Circle',
    );
    expect(coerceFormValue({ qrModuleDrawer: 'Hexagon' }).qrModuleDrawer).toBe(
      '',
    );
  });

  it('accepts remix as a persisted source mode', () => {
    expect(coerceFormValue({ sourceMode: 'remix' }).sourceMode).toBe('remix');
    expect(coerceFormValue({ sourceMode: 'nonsense' }).sourceMode).toBe('none');
  });
});

describe('baseline size defaults', () => {
  it('maps each baseline family onto its native square and preset base', () => {
    expect(nativeSquareFor('stable_diffusion_1')).toBe(512);
    expect(nativeSquareFor('stable_diffusion_2')).toBe(768);
    expect(nativeSquareFor('stable_diffusion_xl')).toBe(1024);
    expect(nativeSquareFor('stable_cascade')).toBe(1024);
    expect(nativeSquareFor('flux_1')).toBe(1024);
    expect(sizeBaseFor('stable_diffusion_1')).toBe(512);
    expect(sizeBaseFor('stable_diffusion_2')).toBe(512);
    expect(sizeBaseFor('flux_1')).toBe(1024);
  });

  it('assumes a baseline it has never seen is a modern one', () => {
    expect(nativeSquareFor('some_future_baseline')).toBe(1024);
    expect(sizeBaseFor('some_future_baseline')).toBe(1024);
  });

  it('answers nothing when no baseline is known', () => {
    expect(nativeSquareFor(null)).toBeNull();
    expect(sizeBaseFor(null)).toBeNull();
  });

  it('only treats a baseline native square as snappable', () => {
    expect(isSnappableSize(512, 512)).toBe(true);
    expect(isSnappableSize(768, 768)).toBe(true);
    expect(isSnappableSize(1024, 1024)).toBe(true);
    expect(
      isSnappableSize(
        DEFAULT_GENERATE_FORM_VALUE.width,
        DEFAULT_GENERATE_FORM_VALUE.height,
      ),
    ).toBe(true);
    expect(isSnappableSize(1216, 832)).toBe(false);
    expect(isSnappableSize(640, 640)).toBe(false);
  });

  it('accepts the aspect presets of a family as suiting its native square', () => {
    for (const preset of buildAspectPresets(1024)) {
      expect(sizeSuitsNativeSquare(1024, preset.width, preset.height)).toBe(
        true,
      );
    }
    for (const preset of buildAspectPresets(512)) {
      expect(sizeSuitsNativeSquare(512, preset.width, preset.height)).toBe(
        true,
      );
    }
  });

  it('rejects a size carried over from another family', () => {
    expect(sizeSuitsNativeSquare(1024, 512, 512)).toBe(false);
    expect(sizeSuitsNativeSquare(512, 1024, 1024)).toBe(false);
  });
});

describe('requirement hints', () => {
  it('reads a step range and flags a value outside it', () => {
    const req = { min_steps: 3, max_steps: 6 };
    expect(stepsRequirementHint(req, 4)).toEqual({
      key: 'generate.form.requirement.steps_range',
      params: { min: 3, max: 6 },
      violated: false,
    });
    expect(stepsRequirementHint(req, 25)?.violated).toBe(true);
    expect(stepsRequirementHint(req, 2)?.violated).toBe(true);
  });

  it('reads a half-open step range', () => {
    expect(stepsRequirementHint({ min_steps: 20 }, 10)).toEqual({
      key: 'generate.form.requirement.steps_min',
      params: { min: 20 },
      violated: true,
    });
    expect(stepsRequirementHint({ max_steps: 8 }, 8)?.violated).toBe(false);
    expect(stepsRequirementHint({}, 25)).toBeNull();
    expect(stepsRequirementHint(null, 25)).toBeNull();
  });

  it('prefers an exact cfg over a range that accompanies it', () => {
    expect(
      cfgRequirementHint(
        { cfg_scale: 2, min_cfg_scale: 1, max_cfg_scale: 4 },
        2,
      ),
    ).toEqual({
      key: 'generate.form.requirement.cfg_exact',
      params: { value: 2 },
      violated: false,
    });
    expect(cfgRequirementHint({ cfg_scale: 2 }, 7.5)?.violated).toBe(true);
    expect(
      cfgRequirementHint({ min_cfg_scale: 1, max_cfg_scale: 4 }, 7.5),
    ).toEqual({
      key: 'generate.form.requirement.cfg_range',
      params: { min: 1, max: 4 },
      violated: true,
    });
    expect(cfgRequirementHint(null, 7.5)).toBeNull();
  });

  it('flags a clip skip that differs from the suggested one', () => {
    expect(clipSkipRequirementHint({ clip_skip: 2 }, 2)?.violated).toBe(false);
    expect(clipSkipRequirementHint({ clip_skip: 2 }, 1)).toEqual({
      key: 'generate.form.requirement.clip_skip_exact',
      params: { value: 2 },
      violated: true,
    });
    expect(clipSkipRequirementHint({}, 1)).toBeNull();
  });

  it('lists the suggested samplers and flags one outside the list', () => {
    const req = { samplers: ['k_dpmpp_sde', 'k_euler'] };
    expect(suggestedSamplers(req)).toEqual(['k_dpmpp_sde', 'k_euler']);
    expect(suggestedSamplers(null)).toEqual([]);
    expect(samplerRequirementHint(req, 'k_euler')).toEqual({
      key: 'generate.form.requirement.samplers',
      params: { list: 'k_dpmpp_sde, k_euler' },
      violated: false,
    });
    expect(samplerRequirementHint(req, 'k_lms')?.violated).toBe(true);
    expect(samplerRequirementHint({}, 'k_lms')).toBeNull();
  });

  it('reads karras off the suggested schedulers, and only when they exist', () => {
    expect(karrasRequirementHint({ schedulers: ['karras'] }, 'karras')).toEqual(
      {
        key: 'generate.form.requirement.karras_on',
        params: {},
        violated: false,
      },
    );
    expect(
      karrasRequirementHint({ schedulers: ['karras'] }, 'normal')?.violated,
    ).toBe(true);
    expect(karrasRequirementHint({ schedulers: ['simple'] }, 'karras')).toEqual(
      {
        key: 'generate.form.requirement.karras_off',
        params: {},
        violated: true,
      },
    );
    expect(karrasRequirementHint({}, 'karras')).toBeNull();
    expect(karrasRequirementHint(null, 'normal')).toBeNull();
  });

  it('notes an off-family size without calling it a violation', () => {
    expect(nativeSizeHint('stable_diffusion_xl', 1024, 1024)).toBeNull();
    expect(nativeSizeHint('stable_diffusion_xl', 512, 512)).toEqual({
      key: 'generate.form.requirement.native_size',
      params: { size: '1024×1024' },
      violated: false,
    });
    expect(nativeSizeHint(null, 512, 512)).toBeNull();
  });

  it('warns an SD 1.5 request past 768px with no hires pass', () => {
    expect(sd15HiresHint('stable_diffusion_1', 1024, 512, false)).toEqual({
      key: 'generate.form.requirement.sd15_hires',
      params: {},
      violated: true,
    });
    expect(
      sd15HiresHint('stable_diffusion_1', 512, 1024, false),
    ).not.toBeNull();
    expect(sd15HiresHint('stable_diffusion_1', 1024, 1024, true)).toBeNull();
    expect(sd15HiresHint('stable_diffusion_1', 768, 768, false)).toBeNull();
    expect(sd15HiresHint('stable_diffusion_xl', 1024, 1024, false)).toBeNull();
    expect(sd15HiresHint(null, 1024, 1024, false)).toBeNull();
  });
});

describe('sampling number bounds', () => {
  it('validates a control against the horde bounds, not the slider travel', () => {
    const form = createGenerateForm(value());

    form.controls.steps.setValue(MAX_STEPS);
    expect(form.controls.steps.valid).toBe(true);
    form.controls.steps.setValue(MAX_STEPS + 1);
    expect(form.controls.steps.valid).toBe(false);
    form.controls.steps.setValue(MIN_STEPS - 1);
    expect(form.controls.steps.valid).toBe(false);

    // The slider stops well short of what may be typed, which is the point of
    // holding the two ranges apart.
    expect(STEPS_SLIDER_MAX).toBeLessThan(MAX_STEPS);
    form.controls.steps.setValue(200);
    expect(form.controls.steps.valid).toBe(true);
    expect(form.controls.steps.value).toBe(200);
  });

  it('validates guidance and CLIP skip against their schema bounds', () => {
    const form = createGenerateForm(value());

    form.controls.cfg_scale.setValue(MAX_CFG_SCALE);
    expect(form.controls.cfg_scale.valid).toBe(true);
    form.controls.cfg_scale.setValue(MAX_CFG_SCALE + 0.5);
    expect(form.controls.cfg_scale.valid).toBe(false);
    form.controls.cfg_scale.setValue(MIN_CFG_SCALE - 0.5);
    expect(form.controls.cfg_scale.valid).toBe(false);
    // Past the slider's end but well inside what the horde takes.
    form.controls.cfg_scale.setValue(CFG_SLIDER_MAX + 10);
    expect(form.controls.cfg_scale.valid).toBe(true);

    form.controls.clip_skip.setValue(MAX_CLIP_SKIP);
    expect(form.controls.clip_skip.valid).toBe(true);
    form.controls.clip_skip.setValue(MAX_CLIP_SKIP + 1);
    expect(form.controls.clip_skip.valid).toBe(false);
    form.controls.clip_skip.setValue(0);
    expect(form.controls.clip_skip.valid).toBe(false);
  });

  it('pins the slider fill at its ends without touching the value', () => {
    const form = createGenerateForm(value({ steps: 200 }));

    expect(
      rangeFillPercent(
        form.controls.steps.value,
        STEPS_SLIDER_MIN,
        STEPS_SLIDER_MAX,
      ),
    ).toBe(100);
    expect(form.controls.steps.value).toBe(200);

    expect(rangeFillPercent(0.5, CFG_SLIDER_MIN, CFG_SLIDER_MAX)).toBe(0);
    expect(
      rangeFillPercent(
        (CFG_SLIDER_MIN + CFG_SLIDER_MAX) / 2,
        CFG_SLIDER_MIN,
        CFG_SLIDER_MAX,
      ),
    ).toBe(50);
  });
});

describe('scheduler advice', () => {
  const suggests = { schedulers: ['karras', 'exponential'] };

  it('reads the model reference list as it stands', () => {
    const hint = schedulerRequirementHint(suggests, 'karras');

    expect(hint?.key).toBe('generate.form.requirement.schedulers');
    expect(hint?.params['list']).toBe('karras, exponential');
    expect(hint?.violated).toBe(false);
  });

  it('marks an explicit schedule the model does not suggest', () => {
    expect(schedulerRequirementHint(suggests, 'beta')?.violated).toBe(true);
    expect(schedulerRequirementHint(suggests, 'karras')?.violated).toBe(false);
  });

  it('says nothing about a model that suggests no schedule', () => {
    expect(schedulerRequirementHint(null, 'karras')).toBeNull();
    expect(schedulerRequirementHint({ schedulers: [] }, 'karras')).toBeNull();
  });

  it('speaks of karras only for the two schedules that predate the field', () => {
    // Any other schedule is named outright by the list line, which says more
    // than reducing the reference's advice to on or off.
    expect(karrasRequirementHint(suggests, 'normal')?.key).toBe(
      'generate.form.requirement.karras_on',
    );
    expect(karrasRequirementHint(suggests, 'beta')).toBeNull();
  });
});

describe('control type vocabulary', () => {
  it('offers every detector the horde takes, and the legacy line alias', () => {
    expect([...CONTROL_TYPES].sort()).toEqual(
      [...ANNOTATION_CONTROL_TYPES, 'hough'].sort(),
    );
  });

  it('separates what any ControlNet worker serves from what few do', () => {
    expect(
      LEGACY_CONTROL_TYPES.filter((type) =>
        EXTENDED_CONTROL_TYPES.includes(type),
      ),
    ).toEqual([]);
    expect(LEGACY_CONTROL_TYPES).toContain('hough');
    // The same detector under its current name reaches only newer workers.
    expect(EXTENDED_CONTROL_TYPES).toContain('mlsd');
    expect(EXTENDED_CONTROL_TYPES).toContain('depth_anything_v2');
  });
});

describe('guidance advice for samplers that apply it themselves', () => {
  it('names the ceiling, and marks a request above it', () => {
    const contract = coerceSamplerConstraints(live)!;

    expect(cfgPlusPlusHint(contract, 'euler_cfg_pp', 2)?.violated).toBe(false);
    const over = cfgPlusPlusHint(contract, 'euler_cfg_pp', 7.5);
    expect(over?.key).toBe('generate.form.requirement.cfg_pp');
    expect(over?.params['max']).toBe(2);
    expect(over?.violated).toBe(true);
  });

  it('says nothing for a sampler that takes guidance the ordinary way', () => {
    const contract = coerceSamplerConstraints(live)!;

    expect(cfgPlusPlusHint(contract, 'k_euler', 7.5)).toBeNull();
    expect(cfgPlusPlusHint(null, 'euler_cfg_pp', 7.5)).toBeNull();
  });

  it('says nothing where the horde publishes no ceiling', () => {
    const contract = coerceSamplerConstraints({
      ...live,
      advisories: {},
    })!;

    expect(cfgPlusPlusHint(contract, 'euler_cfg_pp', 7.5)).toBeNull();
  });
});

describe('the cost of a sampler that charges above the ordinary rate', () => {
  const contract = coerceSamplerConstraints(live)!;

  it('states what the steps really cost, once there are enough of them', () => {
    const hint = samplerStepCostHint(contract, 'k_heun', 30);

    expect(hint?.key).toBe('generate.form.requirement.steps_work');
    expect(hint?.params).toEqual({
      sampler: 'k_heun',
      factor: 2,
      steps: 20,
      equivalent: 40,
    });
    expect(hint?.violated).toBe(true);
    expect(samplerStepCostHint(contract, 'heunpp2', 30)?.params).toMatchObject({
      factor: 3,
      equivalent: 60,
    });
  });

  it('says nothing at a modest count, or for an ordinary sampler', () => {
    expect(samplerStepCostHint(contract, 'k_heun', 20)).toBeNull();
    expect(samplerStepCostHint(contract, 'k_euler', 30)).toBeNull();
    expect(samplerStepCostHint(null, 'k_heun', 30)).toBeNull();
  });

  it('tells a sampler that picks its own count apart from the rest', () => {
    const hint = samplerStepCostHint(contract, 'k_dpm_adaptive', 30);

    expect(hint?.key).toBe('generate.form.requirement.steps_adaptive');
    expect(hint?.params).toEqual({ sampler: 'k_dpm_adaptive' });
  });
});

describe('clipSkipRangeHint', () => {
  it('marks a CLIP skip above what models are trained for', () => {
    expect(clipSkipRangeHint(1)).toBeNull();
    expect(clipSkipRangeHint(2)).toBeNull();
    expect(clipSkipRangeHint(3)).toEqual({
      key: 'generate.form.requirement.clip_skip_high',
      params: {},
      violated: true,
    });
  });
});

describe('hiresUnneededHint', () => {
  it('marks a hires pass that has nothing to enlarge', () => {
    expect(hiresUnneededHint('stable_diffusion_1', 512, 512, true)).toEqual({
      key: 'generate.form.requirement.hires_unneeded',
      params: {},
      violated: true,
    });
    expect(
      hiresUnneededHint('stable_diffusion_1', 512, 640, true),
    ).not.toBeNull();
    expect(
      hiresUnneededHint('stable_diffusion_xl', 768, 768, true),
    ).not.toBeNull();
  });

  it('stays quiet where the pass is actually enlarging something', () => {
    expect(hiresUnneededHint('stable_diffusion_1', 1024, 512, true)).toBeNull();
    expect(
      hiresUnneededHint('stable_diffusion_xl', 1024, 1024, true),
    ).toBeNull();
  });

  it('says nothing while the pass is off, or with no model picked', () => {
    expect(hiresUnneededHint('stable_diffusion_1', 512, 512, false)).toBeNull();
    expect(hiresUnneededHint(null, 512, 512, true)).toBeNull();
  });
});

describe('per-field advisories', () => {
  const contract = coerceSamplerConstraints(live);

  it('lets a contradicted step count outrank the sampler cost note', () => {
    expect(
      stepsAdvisory({ min_steps: 4, max_steps: 12 }, contract, 'k_heun', 30)
        ?.key,
    ).toBe('generate.form.requirement.steps_range');
  });

  it('falls to the cost note where the step count is within the range', () => {
    expect(
      stepsAdvisory({ min_steps: 4, max_steps: 40 }, contract, 'k_heun', 30)
        ?.key,
    ).toBe('generate.form.requirement.steps_work');
  });

  it('keeps the model advice where nothing else applies', () => {
    expect(stepsAdvisory({ min_steps: 4 }, null, 'k_euler', 30)?.key).toBe(
      'generate.form.requirement.steps_min',
    );
    expect(stepsAdvisory(null, null, 'k_euler', 30)).toBeNull();
  });

  it('lets a contradicted guidance outrank the folded-guidance ceiling', () => {
    const advisory = cfgAdvisory({ cfg_scale: 4 }, contract, 'k_dpmpp_2m', 12);
    expect(advisory?.key).toBe('generate.form.requirement.cfg_exact');
  });

  it('lets an exact CLIP skip outrank the note about high values', () => {
    expect(clipSkipAdvisory({ clip_skip: 1 }, 4)?.key).toBe(
      'generate.form.requirement.clip_skip_exact',
    );
    expect(clipSkipAdvisory(null, 4)?.key).toBe(
      'generate.form.requirement.clip_skip_high',
    );
  });

  it('names the whole schedule list with a contract, and karras without', () => {
    const requirements = { schedulers: ['karras'] };
    expect(scheduleAdvisory(requirements, contract, 'normal')?.key).toBe(
      'generate.form.requirement.schedulers',
    );
    expect(scheduleAdvisory(requirements, null, 'normal')?.key).toBe(
      'generate.form.requirement.karras_on',
    );
  });

  it('puts the pixel budget ahead of the other size notes', () => {
    expect(sizeAdvisory('stable_diffusion_1', 2048, 2048, false)?.key).toBe(
      'generate.form.pixel_warning',
    );
    expect(sizeAdvisory('stable_diffusion_1', 1024, 1024, false)?.key).toBe(
      'generate.form.requirement.sd15_hires',
    );
    expect(sizeAdvisory('stable_diffusion_xl', 640, 640, false)?.key).toBe(
      'generate.form.requirement.native_size',
    );
  });
});

describe('suggestedSettings', () => {
  const offer = {
    samplers: ['k_euler', 'k_dpmpp_2m'],
    schedulers: ['karras', 'normal'] as const,
  };
  const current = {
    sampler_name: 'k_euler',
    scheduler: 'normal' as const,
    steps: 30,
    cfg_scale: 7,
    clip_skip: 1,
  };

  it('names only what the model would change', () => {
    const changes = suggestedSettings(
      {
        samplers: ['k_dpmpp_2m'],
        schedulers: ['karras'],
        min_steps: 8,
        max_steps: 20,
        cfg_scale: 4,
        clip_skip: 2,
      },
      { ...offer, schedulers: [...offer.schedulers] },
      current,
    );
    expect(changes).toEqual({
      sampler_name: 'k_dpmpp_2m',
      scheduler: 'karras',
      steps: 20,
      cfg_scale: 4,
      clip_skip: 2,
    });
    expect(suggestedSettingsCount(changes)).toBe(5);
  });

  it('offers nothing once the request already matches the advice', () => {
    const changes = suggestedSettings(
      {
        samplers: ['k_euler'],
        schedulers: ['normal'],
        min_steps: 8,
        max_steps: 40,
        cfg_scale: 7,
        clip_skip: 1,
      },
      { ...offer, schedulers: [...offer.schedulers] },
      current,
    );
    expect(changes).toEqual({});
    expect(suggestedSettingsCount(changes)).toBe(0);
  });

  it('takes the middle of a guidance range where no exact figure is named', () => {
    const changes = suggestedSettings(
      { min_cfg_scale: 1, max_cfg_scale: 4 },
      { ...offer, schedulers: [...offer.schedulers] },
      current,
    );
    expect(changes).toEqual({ cfg_scale: 2.5 });
  });

  it('leaves out a recommendation the panel is not offering', () => {
    const changes = suggestedSettings(
      { samplers: ['k_lms'], schedulers: ['exponential'] },
      { ...offer, schedulers: [...offer.schedulers] },
      current,
    );
    expect(changes).toEqual({});
  });

  it('offers nothing at all when the model names no requirements', () => {
    expect(
      suggestedSettings(
        null,
        { ...offer, schedulers: [...offer.schedulers] },
        current,
      ),
    ).toEqual({});
  });
});

describe('what the kudos estimate is made of', () => {
  const contract = coerceSamplerConstraints(live)!;
  const value: GenerateFormValue = {
    ...DEFAULT_GENERATE_FORM_VALUE,
    width: 1024,
    height: 1024,
    steps: 30,
    sampler_name: 'k_heun',
  };
  const lineFor = (
    lines: readonly {
      id: string;
      key: string;
      params: Record<string, unknown>;
    }[],
    id: string,
  ) => lines.find((line) => line.id === id);

  it('opens with the size, in pixels and in megapixels', () => {
    const size = lineFor(kudosBreakdown(value, contract), 'size');

    expect(size?.key).toBe('generate.form.kudos_line_size');
    expect(size?.params).toEqual({
      width: 1024,
      height: 1024,
      megapixels: '1.05',
    });
  });

  it('charges the steps at the rate the sampler really costs', () => {
    const steps = lineFor(kudosBreakdown(value, contract), 'steps');

    expect(steps?.key).toBe('generate.form.kudos_line_steps_work');
    expect(steps?.params).toEqual({
      steps: 30,
      sampler: 'k_heun',
      factor: 2,
      units: 60,
    });
  });

  it('states the steps plainly where the sampler charges the ordinary rate', () => {
    const steps = lineFor(
      kudosBreakdown({ ...value, sampler_name: 'k_euler' }, contract),
      'steps',
    );

    expect(steps?.key).toBe('generate.form.kudos_line_steps');
    expect(steps?.params).toEqual({ steps: 30, sampler: 'k_euler' });
  });

  it('says a sampler that picks its own step count does exactly that', () => {
    const steps = lineFor(
      kudosBreakdown({ ...value, sampler_name: 'k_dpm_adaptive' }, contract),
      'steps',
    );

    expect(steps?.key).toBe('generate.form.kudos_line_steps_adaptive');
  });

  it('names the second pass, the finishing and the batch when they are asked for', () => {
    const lines = kudosBreakdown(
      {
        ...value,
        hires_fix: true,
        post_processing: ['GFPGAN', 'RealESRGAN_x4plus'],
        loras: [{ name: '12345', model: 1, clip: 1, is_version: false }],
        n: 4,
      },
      contract,
    );

    expect(lines.map((line) => line.id)).toEqual([
      'size',
      'steps',
      'hires',
      'post',
      'facefix',
      'loras',
      'batch',
    ]);
    expect(lineFor(lines, 'post')?.params).toEqual({
      list: 'RealESRGAN_x4plus',
    });
    expect(lineFor(lines, 'facefix')?.params).toEqual({ list: 'GFPGAN' });
    expect(lineFor(lines, 'loras')?.key).toBe(
      'generate.form.kudos_line_loras_one',
    );
    expect(lineFor(lines, 'batch')?.params).toEqual({ count: 4 });
  });

  it('leaves out everything the request does not ask for', () => {
    expect(kudosBreakdown(value, contract).map((line) => line.id)).toEqual([
      'size',
      'steps',
    ]);
  });
});

describe('what to say about the wait', () => {
  it('speaks a short queue in seconds and a long one in minutes', () => {
    expect(modelWaitEstimate({ name: 'a', count: 3, eta: 45 })).toEqual({
      key: 'generate.form.kudos_wait_seconds',
      params: { seconds: 45 },
    });
    expect(modelWaitEstimate({ name: 'a', count: 3, eta: 240 })).toEqual({
      key: 'generate.form.kudos_wait_minutes',
      params: { minutes: 4 },
    });
  });

  it('falls back to the workers when the horde states no eta', () => {
    expect(modelWaitEstimate({ name: 'a', count: 3 }).key).toBe(
      'generate.form.kudos_wait_unknown',
    );
    expect(modelWaitEstimate(null).key).toBe(
      'generate.form.kudos_wait_unknown',
    );
  });

  it('reuses the no-worker sentence, eta or no eta', () => {
    expect(modelWaitEstimate({ name: 'a', count: 0, eta: 10000 }).key).toBe(
      'generate.form.model_no_workers',
    );
  });
});
