import { describe, expect, it } from 'vitest';
import {
  FEATURE_COMPAT_RULES,
  FeatureCompatRuleId,
  RequestLintInput,
  evaluateRequestLint,
  featureCompatRule,
  violatedCompatRules,
  warningsInSection,
} from './request-lint';
import { DEFAULT_GENERATE_FORM_VALUE } from './generate-form.model';

function lintInput(
  overrides: Partial<RequestLintInput> = {},
): RequestLintInput {
  return {
    value: { ...DEFAULT_GENERATE_FORM_VALUE },
    baseline: null,
    requirements: null,
    hasSourceImage: false,
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

  it('carries the SD 1.5 hires note and the pixel budget as size warnings', () => {
    const warnings = evaluateRequestLint(
      lintInput({
        value: { ...DEFAULT_GENERATE_FORM_VALUE, width: 2048, height: 2048 },
        baseline: 'stable_diffusion_1',
      }),
    );
    expect(warnings.map((warning) => warning.key)).toEqual([
      'generate.form.requirement.sd15_hires',
      'generate.form.pixel_warning',
    ]);
    expect(warningsInSection(warnings, 'size')).toHaveLength(2);
    expect(warningsInSection(warnings, 'sampling')).toHaveLength(0);
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
