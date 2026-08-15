import { describe, expect, it } from 'vitest';
import {
  buildAspectPresets,
  buildImageRequest,
  buildStyledImageRequest,
  cfgRequirementHint,
  clipSkipRequirementHint,
  coerceFormValue,
  combinePrompt,
  DEFAULT_GENERATE_FORM_VALUE,
  GenerateFormValue,
  isSnappableSize,
  karrasRequirementHint,
  nativeSizeHint,
  nativeSquareFor,
  normalizeWorkers,
  promptHistoryFromJobs,
  requestToFormValue,
  samplerRequirementHint,
  sd15HiresHint,
  simpleModeValue,
  sizeBaseFor,
  sizeSuitsNativeSquare,
  stepsRequirementHint,
  stripEphemeralExtras,
  suggestedSamplers,
} from './generate-form.model';
import { AppliedStyle } from '../../services/horde-styles.service';
import { LocalGenerationJob } from '../../types/generation-job';

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

describe('buildImageRequest advanced params', () => {
  it('sends karras only when enabled (default on emits true)', () => {
    expect(buildImageRequest(value()).params?.karras).toBe(true);
    expect(
      buildImageRequest(value({ karras: false })).params?.karras,
    ).toBeUndefined();
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
        { name: 'Clamped', model: 99, clip: -99, is_version: true },
        { name: 'Trimmed', inject_trigger: '  ' },
      ],
    });
    expect(merged.loras).toEqual([
      { name: 'Good', model: 0.5, clip: 0.5 },
      { name: 'Clamped', model: 5, clip: -5, is_version: true },
      { name: 'Trimmed', model: 1, clip: 1 },
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
    expect(result.karras).toBe(true);
    expect(result.nsfw).toBe(true);
    expect(result.censor_nsfw).toBe(false);
    // Loading always opens advanced so every recovered field is visible.
    expect(result.mode).toBe('advanced');
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
    expect(karrasRequirementHint({ schedulers: ['karras'] }, true)).toEqual({
      key: 'generate.form.requirement.karras_on',
      params: {},
      violated: false,
    });
    expect(
      karrasRequirementHint({ schedulers: ['karras'] }, false)?.violated,
    ).toBe(true);
    expect(karrasRequirementHint({ schedulers: ['simple'] }, true)).toEqual({
      key: 'generate.form.requirement.karras_off',
      params: {},
      violated: true,
    });
    expect(karrasRequirementHint({}, true)).toBeNull();
    expect(karrasRequirementHint(null, false)).toBeNull();
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
