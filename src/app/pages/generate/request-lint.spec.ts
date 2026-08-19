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
  warningsInSection,
} from './request-lint';
import { DEFAULT_GENERATE_FORM_VALUE } from './generate-form.model';
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
