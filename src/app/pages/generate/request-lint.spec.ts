import { describe, expect, it } from 'vitest';
import {
  FEATURE_COMPAT_RULES,
  FeatureCompatRuleId,
  RequestLintInput,
  evaluateRequestLint,
  featureCompatRule,
  namedWorkerWarning,
  rejectionField,
  rejectionWatchValue,
  violatedCompatRules,
  warningsAtAnchor,
  warningsInSection,
} from './request-lint';
import { DEFAULT_GENERATE_FORM_VALUE } from './generate-form.model';
import type { LoraSelection } from '../../types/civitai-asset';
import type { HordeWorker } from '../../types/horde-worker';
import type { WorkerRequirement } from '../../services/worker-pool.service';
import { coerceSamplerConstraints } from '../../types/sampler-constraints';
import live from '../../testing/fixtures/sampler-constraints.stub.json';

function lintInput(
  overrides: Partial<RequestLintInput> = {},
): RequestLintInput {
  return {
    value: { ...DEFAULT_GENERATE_FORM_VALUE },
    baseline: null,
    requirements: null,
    hasSourceImage: false,
    contract: null,
    ...overrides,
  };
}

/** The ids of the rules the input violates, for a compact assertion. */
function violated(input: RequestLintInput): FeatureCompatRuleId[] {
  return violatedCompatRules(input).map((rule) => rule.id);
}

describe('feature compatibility rules', () => {
  it('names one rule per feature and can look each up by id', () => {
    const ids = FEATURE_COMPAT_RULES.map((rule) => rule.id);
    expect(ids).toEqual([
      'controlnet_baseline',
      'controlnet_denoise',
      'inpainting_model',
      'remix_baseline',
      'mask_baseline',
      'hires_with_mask',
      'outpaint_target',
      'qr_code_baseline',
      'transparent_baseline',
      'source_required',
    ]);
    for (const id of ids) {
      expect(featureCompatRule(id).id).toBe(id);
    }
    expect(() => featureCompatRule('nope' as FeatureCompatRuleId)).toThrow();
  });

  it('warns that a mask is dropped on a family with no masked pipeline', () => {
    const masked = {
      ...DEFAULT_GENERATE_FORM_VALUE,
      sourceMode: 'img2img' as const,
      maskEnabled: true,
    };
    expect(
      violated(lintInput({ value: masked, baseline: 'stable_diffusion_xl' })),
    ).not.toContain('mask_baseline');
    expect(
      violated(lintInput({ value: masked, baseline: 'flux_1' })),
    ).toContain('mask_baseline');

    // Inpainting is the same rule, and an unknown baseline never locks anyone
    // out: gating here is guidance, and the horde is the only authority.
    const painting = {
      ...DEFAULT_GENERATE_FORM_VALUE,
      sourceMode: 'inpainting' as const,
    };
    expect(
      violated(lintInput({ value: painting, baseline: 'stable_cascade' })),
    ).toContain('mask_baseline');
    expect(
      violated(lintInput({ value: painting, baseline: null })),
    ).not.toContain('mask_baseline');
  });

  it('warns about hires fix with a mask, and not without one', () => {
    const base = { ...DEFAULT_GENERATE_FORM_VALUE, hires_fix: true };
    expect(violated(lintInput({ value: base }))).not.toContain(
      'hires_with_mask',
    );
    expect(
      violated(
        lintInput({
          value: { ...base, sourceMode: 'img2img', maskEnabled: true },
        }),
      ),
    ).toContain('hires_with_mask');
    expect(
      violated(lintInput({ value: { ...base, sourceMode: 'inpainting' } })),
    ).toContain('hires_with_mask');
    // ControlNet loses the mask to its own pipeline, so the pass still runs.
    expect(
      violated(
        lintInput({
          value: { ...base, sourceMode: 'controlnet', maskEnabled: true },
        }),
      ),
    ).not.toContain('hires_with_mask');
  });

  it('warns when a canvas is being grown with nowhere to grow', () => {
    const growing = {
      ...DEFAULT_GENERATE_FORM_VALUE,
      sourceMode: 'inpainting' as const,
      outpaintEnabled: true,
      width: 1024,
      height: 1024,
    };
    const attached = { hasSourceImage: true, baseline: 'stable_diffusion_xl' };

    expect(
      violated(
        lintInput({
          value: growing,
          ...attached,
          sourceWidth: 1024,
          sourceHeight: 1024,
        }),
      ),
    ).toContain('outpaint_target');
    expect(
      violated(
        lintInput({
          value: growing,
          ...attached,
          sourceWidth: 768,
          sourceHeight: 1024,
        }),
      ),
    ).not.toContain('outpaint_target');
    // A picture whose size nobody has reported yet is left alone rather than
    // warned about; the missing-source rule already speaks for that case.
    expect(violated(lintInput({ value: growing, ...attached }))).not.toContain(
      'outpaint_target',
    );
  });

  it('says nothing about a default request', () => {
    expect(violated(lintInput())).toEqual([]);
  });

  describe('controlnet_baseline', () => {
    const controlnet = (baseline: string | null): RequestLintInput =>
      lintInput({
        value: {
          ...DEFAULT_GENERATE_FORM_VALUE,
          sourceMode: 'controlnet',
          denoising_strength: 1,
        },
        baseline,
        hasSourceImage: true,
      });

    it('passes on SD 1.5', () => {
      expect(violated(controlnet('stable_diffusion_1'))).toEqual([]);
    });

    it('fires on any other baseline', () => {
      expect(violated(controlnet('stable_diffusion_xl'))).toEqual([
        'controlnet_baseline',
      ]);
      expect(violated(controlnet('flux_1'))).toEqual(['controlnet_baseline']);
    });

    it('stays silent on an unknown baseline, and when controlnet is unused', () => {
      expect(violated(controlnet(null))).toEqual([]);
      expect(violated(lintInput({ baseline: 'flux_1' }))).toEqual([]);
    });
  });

  describe('controlnet_denoise', () => {
    it('recommends 1 for ControlNet and permits an intentional override', () => {
      const controlnet = (denoising_strength: number): RequestLintInput =>
        lintInput({
          value: {
            ...DEFAULT_GENERATE_FORM_VALUE,
            sourceMode: 'controlnet',
            denoising_strength,
          },
          hasSourceImage: true,
        });

      expect(violated(controlnet(1))).not.toContain('controlnet_denoise');
      expect(violated(controlnet(0.75))).toContain('controlnet_denoise');
      expect(violated(lintInput())).not.toContain('controlnet_denoise');
    });
  });

  describe('remix_baseline', () => {
    const remix = (baseline: string | null): RequestLintInput =>
      lintInput({
        value: { ...DEFAULT_GENERATE_FORM_VALUE, sourceMode: 'remix' },
        baseline,
        hasSourceImage: true,
      });

    it('passes on Stable Cascade', () => {
      expect(violated(remix('stable_cascade'))).toEqual([]);
    });

    it('fires on any other baseline', () => {
      expect(violated(remix('stable_diffusion_1'))).toEqual(['remix_baseline']);
    });

    it('stays silent on an unknown baseline', () => {
      expect(violated(remix(null))).toEqual([]);
    });
  });

  describe('inpainting_model', () => {
    const inpainting = (model: string): RequestLintInput =>
      lintInput({
        value: {
          ...DEFAULT_GENERATE_FORM_VALUE,
          sourceMode: 'inpainting',
          model,
        },
        hasSourceImage: true,
      });

    it('passes when the selected model is marked as inpainting', () => {
      expect(violated(inpainting('Deliberate Inpainting'))).not.toContain(
        'inpainting_model',
      );
      expect(violated(inpainting('foo-INPAINT-v2'))).not.toContain(
        'inpainting_model',
      );
    });

    it('fires when inpainting mode uses a non-inpainting model', () => {
      expect(violated(inpainting('DreamShaper XL'))).toContain(
        'inpainting_model',
      );
      expect(violated(inpainting(''))).toContain('inpainting_model');
    });

    it('stays silent when inpainting mode is unused', () => {
      expect(
        violated(
          lintInput({
            value: {
              ...DEFAULT_GENERATE_FORM_VALUE,
              sourceMode: 'img2img',
              model: 'DreamShaper XL',
            },
          }),
        ),
      ).not.toContain('inpainting_model');
    });
  });

  describe('qr_code_baseline', () => {
    const qr = (baseline: string | null, text = 'https://aihorde.net') =>
      lintInput({
        value: { ...DEFAULT_GENERATE_FORM_VALUE, qrText: text },
        baseline,
      });

    it('passes on SD 1.5 and SDXL', () => {
      expect(violated(qr('stable_diffusion_1'))).toEqual([]);
      expect(violated(qr('stable_diffusion_xl'))).toEqual([]);
    });

    it('fires on any other baseline', () => {
      expect(violated(qr('stable_cascade'))).toEqual(['qr_code_baseline']);
    });

    it('stays silent on an unknown baseline, and with no QR text', () => {
      expect(violated(qr(null))).toEqual([]);
      expect(violated(qr('stable_cascade', '   '))).toEqual([]);
    });
  });

  describe('transparent_baseline', () => {
    const transparent = (baseline: string | null) =>
      lintInput({
        value: { ...DEFAULT_GENERATE_FORM_VALUE, transparent: true },
        baseline,
      });

    it('passes on SD 1.5 and SDXL', () => {
      expect(violated(transparent('stable_diffusion_1'))).toEqual([]);
      expect(violated(transparent('stable_diffusion_xl'))).toEqual([]);
    });

    it('fires on any other baseline', () => {
      expect(violated(transparent('stable_cascade'))).toEqual([
        'transparent_baseline',
      ]);
    });

    it('stays silent on an unknown baseline, and when transparent is off', () => {
      expect(violated(transparent(null))).toEqual([]);
      expect(violated(lintInput({ baseline: 'stable_cascade' }))).not.toContain(
        'transparent_baseline',
      );
    });
  });

  describe('source_required', () => {
    it('fires for every mode that reads a source image when none is attached', () => {
      for (const mode of ['img2img', 'controlnet', 'inpainting', 'remix']) {
        const ids = violated(
          lintInput({
            value: {
              ...DEFAULT_GENERATE_FORM_VALUE,
              sourceMode: mode as 'img2img',
            },
          }),
        );
        expect(ids).toContain('source_required');
      }
    });

    it('passes once an image is attached, and never fires for txt2img', () => {
      expect(
        violated(
          lintInput({
            value: { ...DEFAULT_GENERATE_FORM_VALUE, sourceMode: 'img2img' },
            hasSourceImage: true,
          }),
        ),
      ).toEqual([]);
      expect(violated(lintInput({ hasSourceImage: false }))).toEqual([]);
    });
  });
});

describe('evaluateRequestLint', () => {
  it('finds nothing to say about a default request', () => {
    expect(evaluateRequestLint(lintInput())).toEqual([]);
  });

  it('reports the model recommendations the form contradicts, and only those', () => {
    const warnings = evaluateRequestLint(
      lintInput({
        value: { ...DEFAULT_GENERATE_FORM_VALUE, steps: 60, cfg_scale: 7.5 },
        requirements: {
          min_steps: 4,
          max_steps: 12,
          cfg_scale: 1,
          clip_skip: 1,
        },
      }),
    );
    expect(warnings.map((warning) => warning.key)).toEqual([
      'generate.form.requirement.steps_range',
      'generate.form.requirement.cfg_exact',
    ]);
    expect(warnings[1].params).toEqual({ value: 1 });
    expect(warnings.every((warning) => warning.section === 'sampling')).toBe(
      true,
    );
  });

  it('leaves a satisfied recommendation out entirely', () => {
    const warnings = evaluateRequestLint(
      lintInput({
        value: { ...DEFAULT_GENERATE_FORM_VALUE, steps: 8 },
        requirements: { min_steps: 4, max_steps: 12 },
      }),
    );
    expect(warnings).toEqual([]);
  });

  it('speaks once for the size, and the pixel budget outranks the rest', () => {
    const warnings = evaluateRequestLint(
      lintInput({
        value: { ...DEFAULT_GENERATE_FORM_VALUE, width: 2048, height: 2048 },
        baseline: 'stable_diffusion_1',
      }),
    );
    expect(warnings.map((warning) => warning.key)).toEqual([
      'generate.form.pixel_warning',
    ]);
    expect(warningsInSection(warnings, 'size')).toHaveLength(1);
    expect(warningsInSection(warnings, 'sampling')).toHaveLength(0);
  });

  it('falls to the SD 1.5 hires note where the size is within budget', () => {
    const warnings = evaluateRequestLint(
      lintInput({
        value: { ...DEFAULT_GENERATE_FORM_VALUE, width: 1024, height: 1024 },
        baseline: 'stable_diffusion_1',
      }),
    );
    expect(warnings.map((warning) => warning.key)).toEqual([
      'generate.form.requirement.sd15_hires',
    ]);
  });

  it('drops the hires note once the hires pass is on', () => {
    const warnings = evaluateRequestLint(
      lintInput({
        value: {
          ...DEFAULT_GENERATE_FORM_VALUE,
          width: 1024,
          height: 1024,
          hires_fix: true,
        },
        baseline: 'stable_diffusion_1',
      }),
    );
    expect(warnings).toEqual([]);
  });

  it('gives a step count contradicting the model precedence over its cost', () => {
    const warnings = evaluateRequestLint(
      lintInput({
        value: {
          ...DEFAULT_GENERATE_FORM_VALUE,
          sampler_name: 'k_heun',
          steps: 30,
        },
        requirements: { min_steps: 4, max_steps: 12 },
        contract: coerceSamplerConstraints(live),
      }),
    );
    expect(warnings.map((warning) => warning.key)).toEqual([
      'generate.form.requirement.steps_range',
    ]);
  });

  it('names the control every warning is about', () => {
    const warnings = evaluateRequestLint(
      lintInput({
        value: {
          ...DEFAULT_GENERATE_FORM_VALUE,
          sourceMode: 'controlnet',
          steps: 30,
          clip_skip: 4,
        },
        baseline: 'stable_cascade',
        requirements: { min_steps: 4, max_steps: 12 },
      }),
    );
    expect(warnings.map((warning) => warning.anchor)).toEqual([
      'steps',
      'clip_skip',
      'control_type',
      'denoise',
      'source',
    ]);
  });

  it('counts the sampler cost and the CLIP skip among the sampling warnings', () => {
    const warnings = evaluateRequestLint(
      lintInput({
        value: {
          ...DEFAULT_GENERATE_FORM_VALUE,
          sampler_name: 'k_heun',
          steps: 30,
          clip_skip: 4,
        },
        contract: coerceSamplerConstraints(live),
      }),
    );
    expect(warnings.map((warning) => warning.key)).toEqual([
      'generate.form.requirement.steps_work',
      'generate.form.requirement.clip_skip_high',
    ]);
    expect(warningsInSection(warnings, 'sampling')).toHaveLength(2);
  });

  it('counts a hires pass that has nothing to enlarge as a size warning', () => {
    const warnings = evaluateRequestLint(
      lintInput({
        value: {
          ...DEFAULT_GENERATE_FORM_VALUE,
          width: 512,
          height: 512,
          hires_fix: true,
        },
        baseline: 'stable_diffusion_1',
      }),
    );
    expect(warningsInSection(warnings, 'size').map((w) => w.key)).toEqual([
      'generate.form.requirement.hires_unneeded',
    ]);
  });

  it('appends the compat rules after the recommendations, tagged by section', () => {
    const warnings = evaluateRequestLint(
      lintInput({
        value: {
          ...DEFAULT_GENERATE_FORM_VALUE,
          sourceMode: 'controlnet',
          qrText: 'https://aihorde.net',
        },
        baseline: 'stable_cascade',
      }),
    );
    expect(warnings.map((warning) => warning.id)).toEqual([
      'controlnet_baseline',
      'controlnet_denoise',
      'qr_code_baseline',
      'source_required',
    ]);
    expect(warningsInSection(warnings, 'source').map((w) => w.id)).toEqual([
      'controlnet_baseline',
      'controlnet_denoise',
      'source_required',
    ]);
    expect(warningsInSection(warnings, 'workflows').map((w) => w.key)).toEqual([
      'generate.form.qr_unsupported',
    ]);
  });
});

describe('namedWorkerWarning', () => {
  function poolWorker(overrides: Partial<HordeWorker> = {}): HordeWorker {
    return {
      type: 'image',
      name: 'Sunflower',
      id: 'worker-1',
      online: true,
      requests_fulfilled: 0,
      kudos_rewards: 0,
      performance: '1 megapixelsteps per second',
      threads: 1,
      uptime: 0,
      maintenance_mode: false,
      paused: false,
      nsfw: true,
      trusted: true,
      flagged: false,
      suspicious: 0,
      uncompleted_jobs: 0,
      models: ['stable_diffusion'],
      bridge_agent: 'test',
      max_pixels: 1_048_576,
      img2img: true,
      painting: true,
      controlnet: true,
      extended_controlnet: true,
      ...overrides,
    };
  }

  function pinned(
    overrides: Partial<WorkerRequirement> = {},
  ): WorkerRequirement {
    return {
      models: [],
      width: 512,
      height: 512,
      nsfw: false,
      needsImg2Img: false,
      needsPainting: false,
      needsControlNet: false,
      needsExtendedControlNet: false,
      needsControlStrength: false,
      trustedOnly: false,
      workers: ['worker-1'],
      workerBlacklist: false,
      ...overrides,
    };
  }

  it('says nothing while the worker list or the request is unknown', () => {
    expect(
      namedWorkerWarning(lintInput({ requirement: pinned(), workers: null })),
    ).toBeNull();
    expect(
      namedWorkerWarning(
        lintInput({ requirement: null, workers: [poolWorker()] }),
      ),
    ).toBeNull();
  });

  it('says nothing about an avoid list or an empty one', () => {
    expect(
      namedWorkerWarning(
        lintInput({
          requirement: pinned({ workerBlacklist: true, models: ['other'] }),
          workers: [poolWorker()],
        }),
      ),
    ).toBeNull();
    expect(
      namedWorkerWarning(
        lintInput({
          requirement: pinned({ workers: [] }),
          workers: [poolWorker()],
        }),
      ),
    ).toBeNull();
  });

  it('says nothing when the named worker can take the request', () => {
    expect(
      namedWorkerWarning(
        lintInput({
          requirement: pinned({ models: ['stable_diffusion'] }),
          workers: [poolWorker()],
        }),
      ),
    ).toBeNull();
  });

  it('names an ID the horde is not listing', () => {
    expect(
      namedWorkerWarning(
        lintInput({
          requirement: pinned({ workers: ['typo'] }),
          workers: [poolWorker()],
        }),
      ),
    ).toEqual({
      id: 'named_worker',
      section: 'horde',
      anchor: 'workers',
      key: 'generate.lint.worker_unknown',
      params: { name: 'typo' },
    });
  });

  it('names the worker and the demand it cannot meet', () => {
    const reasons: [
      Partial<WorkerRequirement>,
      Partial<HordeWorker>,
      string,
    ][] = [
      [{}, { online: false }, 'generate.lint.worker_available'],
      [{ models: ['other_model'] }, {}, 'generate.lint.worker_model'],
      [{ nsfw: true }, { nsfw: false }, 'generate.lint.worker_nsfw'],
      [
        { needsImg2Img: true },
        { img2img: false },
        'generate.lint.worker_img2img',
      ],
      [
        { needsPainting: true },
        { painting: false },
        'generate.lint.worker_painting',
      ],
      [
        { needsControlNet: true },
        { controlnet: false },
        'generate.lint.worker_controlnet',
      ],
      [
        { needsExtendedControlNet: true },
        { extended_controlnet: false },
        'generate.lint.worker_controlnet_extended',
      ],
      [
        { needsControlStrength: true },
        { bridge_agent: 'AI Horde Worker reGen:17.9.1:https://example.com' },
        'generate.lint.worker_control_strength',
      ],
      [
        { trustedOnly: true },
        { trusted: false },
        'generate.lint.worker_trusted',
      ],
    ];
    for (const [requirement, worker, key] of reasons) {
      expect(
        namedWorkerWarning(
          lintInput({
            requirement: pinned(requirement),
            workers: [poolWorker(worker)],
          }),
        ),
      ).toEqual({
        id: 'named_worker',
        section: 'horde',
        anchor: 'workers',
        key,
        params: { name: 'Sunflower' },
      });
    }
  });

  it('quotes the largest size the named worker offers', () => {
    expect(
      namedWorkerWarning(
        lintInput({
          requirement: pinned({ width: 1024, height: 1536 }),
          workers: [poolWorker()],
        }),
      ),
    ).toEqual({
      id: 'named_worker',
      section: 'horde',
      anchor: 'workers',
      key: 'generate.lint.worker_size',
      params: { name: 'Sunflower', side: 1024 },
    });
    expect(
      namedWorkerWarning(
        lintInput({
          requirement: pinned({ width: 1024, height: 1536 }),
          workers: [poolWorker({ max_pixels: undefined })],
        }),
      )?.key,
    ).toBe('generate.lint.worker_size_unknown');
  });

  it('reports the first named worker that cannot serve, one line at a time', () => {
    const warning = namedWorkerWarning(
      lintInput({
        requirement: pinned({
          models: ['stable_diffusion'],
          workers: ['worker-1', 'worker-2'],
        }),
        workers: [
          poolWorker(),
          poolWorker({ id: 'worker-2', name: 'Moonflower', models: [] }),
        ],
      }),
    );
    expect(warning?.params).toEqual({ name: 'Moonflower' });
  });

  it('is carried by the whole request lint', () => {
    const warnings = evaluateRequestLint(
      lintInput({
        requirement: pinned({ workers: ['typo'] }),
        workers: [poolWorker()],
      }),
    );
    expect(warningsAtAnchor(warnings, 'workers').map((w) => w.id)).toEqual([
      'named_worker',
    ]);
  });
});

describe('rejectionField', () => {
  it('reads the knob out of the sentence the horde refused with', () => {
    expect(
      rejectionField('SamplerKnobInapplicable', 'k_dpm_2 does not accept eta.'),
    ).toEqual({
      anchor: 'sampler_eta',
      message: 'k_dpm_2 does not accept eta.',
    });
    expect(
      rejectionField('SamplerKnobOutOfRange', 'order must be at most 4.')
        ?.anchor,
    ).toBe('sampler_order');
  });

  it('falls back to the group when the sentence names no knob', () => {
    expect(
      rejectionField('SamplerKnobInapplicable', 'That value is not accepted.')
        ?.anchor,
    ).toBe('advanced_sampling');
  });

  it('places the codes it models at their own controls', () => {
    const cases: [string, string][] = [
      ['SamplerSolverTypeUnsupported', 'solver_type'],
      ['SamplerSchedulerMismatch', 'scheduler'],
      ['SchedulerBaselineMismatch', 'scheduler'],
      ['FlowShiftInapplicable', 'flow_shift'],
      ['FlowShiftOutOfRange', 'flow_shift'],
      ['ControlNetSourceMissing', 'source'],
      ['ControlNetMismatch', 'source'],
      ['ControlNetUnsupported', 'source'],
      ['ControlNetInpaintingMismatch', 'source'],
      ['InvalidControlType', 'control_type'],
      ['ControlStrengthWithoutControlType', 'control_strength'],
      ['ControlStrengthOutOfRange', 'control_strength'],
      ['KudosUpfront', 'generate'],
      ['TooManyPrompts', 'generate'],
      ['InvalidModel', 'model'],
    ];
    for (const [rc, anchor] of cases) {
      expect(rejectionField(rc, 'refused')?.anchor).toBe(anchor);
    }
  });

  it('leaves a code it does not model, and an empty sentence, to the tile', () => {
    expect(rejectionField('SomethingElse', 'refused')).toBeNull();
    expect(rejectionField(undefined, 'refused')).toBeNull();
    expect(rejectionField('KudosUpfront', '   ')).toBeNull();
  });
});

describe('rejectionWatchValue', () => {
  it('watches the control the rejection was placed at', () => {
    const value = { ...DEFAULT_GENERATE_FORM_VALUE, flow_shift: 3 };
    expect(rejectionWatchValue('flow_shift', value)).toBe(3);
    expect(rejectionWatchValue('model', value)).toBe(value.model);
    expect(
      rejectionWatchValue('control_strength', {
        ...value,
        control_strength: 2,
      }),
    ).toBe(2);
    expect(rejectionWatchValue('sampler_eta', value)).toBe(value.sampler_eta);
    expect(
      rejectionWatchValue('scheduler', {
        ...value,
        scheduler: 'normal',
      }),
    ).not.toBe(rejectionWatchValue('scheduler', value));
  });
});

describe('LoRA and embedding warnings', () => {
  const lora = (
    name: string,
    extra: Partial<LoraSelection> = {},
  ): LoraSelection => ({ name, model: 1, clip: 1, ...extra });

  const withLoras = (loras: LoraSelection[], baseline: string | null = null) =>
    lintInput({
      value: { ...DEFAULT_GENERATE_FORM_VALUE, loras },
      baseline,
    });

  const ids = (input: RequestLintInput): string[] =>
    evaluateRequestLint(input).map((warning) => warning.id);

  it('says nothing while the selection fits', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((n) => lora(n));
    expect(ids(withLoras(five))).not.toContain('lora_limit');
  });

  it('counts what will be dropped once the cap is passed', () => {
    const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => lora(n));
    const warning = evaluateRequestLint(withLoras(seven)).find(
      (entry) => entry.id === 'lora_limit',
    );

    expect(warning).toMatchObject({
      anchor: 'loras',
      section: 'model',
      params: { count: 7, max: 5, dropped: 2 },
    });
  });

  it('warns about too many embeddings at their own, larger cap', () => {
    const tis = Array.from({ length: 21 }, (_, i) => ({
      name: `ti-${i}`,
      strength: 1,
    }));
    const warning = evaluateRequestLint(
      lintInput({ value: { ...DEFAULT_GENERATE_FORM_VALUE, tis } }),
    ).find((entry) => entry.id === 'ti_limit');

    expect(warning?.params).toMatchObject({ count: 21, max: 20, dropped: 1 });
  });

  describe('a LoRA trained for another model family', () => {
    it('is named when both families are known and differ', () => {
      const warning = evaluateRequestLint(
        withLoras(
          [lora('1', { baseModel: 'Pony', label: 'Pony Detailer' })],
          'stable_diffusion_1',
        ),
      ).find((entry) => entry.id === 'lora_baseline');

      expect(warning).toMatchObject({
        anchor: 'loras',
        params: { names: 'Pony Detailer', count: 1 },
      });
    });

    it('says nothing when the families agree', () => {
      expect(
        ids(
          withLoras([lora('1', { baseModel: 'Pony' })], 'stable_diffusion_xl'),
        ),
      ).not.toContain('lora_baseline');
    });

    it('stays quiet wherever it cannot be sure', () => {
      // No model picked, nothing recorded on the entry, and a family the table
      // has no opinion about: a false warning is worse than none.
      expect(
        ids(withLoras([lora('1', { baseModel: 'Pony' })], null)),
      ).not.toContain('lora_baseline');
      expect(ids(withLoras([lora('1')], 'stable_diffusion_1'))).not.toContain(
        'lora_baseline',
      );
      expect(
        ids(
          withLoras([lora('1', { baseModel: 'Chroma' })], 'stable_diffusion_1'),
        ),
      ).not.toContain('lora_baseline');
    });

    it('ignores a selection that is not being sent anyway', () => {
      const loras = [
        ...['a', 'b', 'c', 'd', 'e'].map((n) => lora(n)),
        lora('6', { baseModel: 'Pony' }),
      ];
      // The sixth is already covered by the truncation warning; naming its base
      // model too would stack noise on a selection that is not being sent.
      expect(ids(withLoras(loras, 'stable_diffusion_1'))).not.toContain(
        'lora_baseline',
      );
    });

    it('stops naming names past a handful', () => {
      const many = ['1', '2', '3', '4'].map((n) =>
        lora(n, { baseModel: 'Pony', label: `L${n}` }),
      );
      const warning = evaluateRequestLint(
        withLoras(many, 'stable_diffusion_1'),
      ).find((entry) => entry.id === 'lora_baseline');

      expect(warning?.params).toMatchObject({
        names: 'L1, L2, L3',
        count: 4,
        extra: 1,
      });
    });
  });

  it('gathers the warnings for one card by the control they are about', () => {
    const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => lora(n));
    const warnings = evaluateRequestLint(withLoras(seven));

    expect(warningsAtAnchor(warnings, 'loras').map((w) => w.id)).toEqual([
      'lora_limit',
    ]);
    expect(warningsAtAnchor(warnings, 'model')).toEqual([]);
  });

  it('places the asset rejections the horde returns at the LoRA card', () => {
    for (const code of ['TooManyLoras', 'TooManyTIs', 'BadLoraVersion']) {
      expect(rejectionField(code, 'nope')?.anchor).toBe('loras');
    }
  });

  it('clears an asset rejection once the selection changes', () => {
    const before = { ...DEFAULT_GENERATE_FORM_VALUE, loras: [lora('a')] };
    const after = { ...DEFAULT_GENERATE_FORM_VALUE, loras: [lora('b')] };

    expect(rejectionWatchValue('loras', before)).not.toBe(
      rejectionWatchValue('loras', after),
    );
  });
});

describe('a request naming several models', () => {
  const lora = (
    name: string,
    extra: Partial<LoraSelection> = {},
  ): LoraSelection => ({ name, model: 1, clip: 1, ...extra });

  const ids = (input: RequestLintInput): string[] =>
    evaluateRequestLint(input).map((warning) => warning.id);

  const painting = (
    models: readonly { name: string; baseline: string | null }[],
  ): RequestLintInput =>
    lintInput({
      value: {
        ...DEFAULT_GENERATE_FORM_VALUE,
        sourceMode: 'inpainting',
        model: models[0].name,
        extraModels: models.slice(1).map((entry) => entry.name),
      },
      baseline: models[0].baseline,
      selectedModels: models,
      hasSourceImage: true,
    });

  it('lets one model that can serve the request answer for all of them', () => {
    expect(
      violated(
        painting([
          { name: 'DreamShaper XL', baseline: 'stable_diffusion_xl' },
          { name: 'Deliberate Inpainting', baseline: 'stable_diffusion_1' },
        ]),
      ),
    ).not.toContain('inpainting_model');
  });

  it('warns when none of them can', () => {
    expect(
      violated(
        painting([
          { name: 'DreamShaper XL', baseline: 'stable_diffusion_xl' },
          { name: 'Anything Diffusion', baseline: 'stable_diffusion_1' },
        ]),
      ),
    ).toContain('inpainting_model');
  });

  it('judges a baseline rule against the whole set', () => {
    const transparent = (
      models: readonly { name: string; baseline: string | null }[],
    ): RequestLintInput =>
      lintInput({
        value: {
          ...DEFAULT_GENERATE_FORM_VALUE,
          transparent: true,
          model: models[0].name,
          extraModels: models.slice(1).map((entry) => entry.name),
        },
        baseline: models[0].baseline,
        selectedModels: models,
      });

    expect(
      violated(
        transparent([
          { name: 'a', baseline: 'stable_diffusion_1' },
          { name: 'b', baseline: 'stable_diffusion_xl' },
        ]),
      ),
    ).toEqual([]);
    expect(
      violated(
        transparent([
          { name: 'a', baseline: 'flux_1' },
          { name: 'b', baseline: 'stable_cascade' },
        ]),
      ),
    ).toContain('transparent_baseline');
  });

  it('keeps a LoRA that suits any one of the selected models', () => {
    const withModels = (
      models: readonly { name: string; baseline: string | null }[],
    ): RequestLintInput =>
      lintInput({
        value: {
          ...DEFAULT_GENERATE_FORM_VALUE,
          loras: [lora('1', { baseModel: 'Pony' })],
          model: models[0].name,
          extraModels: models.slice(1).map((entry) => entry.name),
        },
        baseline: models[0].baseline,
        selectedModels: models,
      });

    expect(
      ids(
        withModels([
          { name: 'a', baseline: 'stable_diffusion_1' },
          { name: 'b', baseline: 'stable_diffusion_xl' },
        ]),
      ),
    ).not.toContain('lora_baseline');
    expect(
      ids(
        withModels([
          { name: 'a', baseline: 'stable_diffusion_1' },
          { name: 'b', baseline: 'stable_diffusion_2' },
        ]),
      ),
    ).toContain('lora_baseline');
  });

  it('says which model the panel is advising for when they differ', () => {
    const warning = evaluateRequestLint(
      lintInput({
        value: {
          ...DEFAULT_GENERATE_FORM_VALUE,
          model: 'a',
          extraModels: ['b'],
        },
        baseline: 'stable_diffusion_1',
        selectedModels: [
          { name: 'a', baseline: 'stable_diffusion_1' },
          { name: 'b', baseline: 'stable_diffusion_xl' },
        ],
      }),
    ).find((entry) => entry.id === 'models_mixed');

    expect(warning).toMatchObject({
      anchor: 'model',
      key: 'generate.lint.models_mixed',
      params: { model: 'a' },
    });
  });

  it('says nothing about models that agree, or that nothing is known about', () => {
    const selections = (
      models: readonly { name: string; baseline: string | null }[],
    ): RequestLintInput =>
      lintInput({
        value: {
          ...DEFAULT_GENERATE_FORM_VALUE,
          model: models[0].name,
          extraModels: models.slice(1).map((entry) => entry.name),
        },
        baseline: models[0].baseline,
        selectedModels: models,
      });

    expect(
      ids(
        selections([
          { name: 'a', baseline: 'stable_diffusion_1' },
          { name: 'b', baseline: 'stable_diffusion_1' },
        ]),
      ),
    ).not.toContain('models_mixed');
    expect(
      ids(
        selections([
          { name: 'a', baseline: 'stable_diffusion_1' },
          { name: 'b', baseline: null },
        ]),
      ),
    ).not.toContain('models_mixed');
  });

  it('clears a model rejection once an extra model changes', () => {
    const before = {
      ...DEFAULT_GENERATE_FORM_VALUE,
      model: 'a',
      extraModels: ['b'],
    };
    expect(rejectionWatchValue('model', before)).not.toBe(
      rejectionWatchValue('model', { ...before, extraModels: ['c'] }),
    );
  });
});
