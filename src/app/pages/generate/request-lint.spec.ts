import { describe, expect, it } from 'vitest';
import {
  FEATURE_COMPAT_RULES,
  FeatureCompatRuleId,
  RequestLintInput,
  evaluateRequestLint,
  featureCompatRule,
  rejectionField,
  rejectionWatchValue,
  violatedCompatRules,
  warningsAtAnchor,
  warningsInSection,
} from './request-lint';
import { DEFAULT_GENERATE_FORM_VALUE } from './generate-form.model';
import type { LoraSelection } from '../../types/civitai-asset';
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
      'remix_baseline',
      'qr_code_baseline',
      'source_required',
    ]);
    for (const id of ids) {
      expect(featureCompatRule(id).id).toBe(id);
    }
    expect(() => featureCompatRule('nope' as FeatureCompatRuleId)).toThrow();
  });

  it('says nothing about a default request', () => {
    expect(violated(lintInput())).toEqual([]);
  });

  describe('controlnet_baseline', () => {
    const controlnet = (baseline: string | null): RequestLintInput =>
      lintInput({
        value: { ...DEFAULT_GENERATE_FORM_VALUE, sourceMode: 'controlnet' },
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
      'qr_code_baseline',
      'source_required',
    ]);
    expect(warningsInSection(warnings, 'source').map((w) => w.id)).toEqual([
      'controlnet_baseline',
      'source_required',
    ]);
    expect(warningsInSection(warnings, 'workflows').map((w) => w.key)).toEqual([
      'generate.form.qr_unsupported',
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
