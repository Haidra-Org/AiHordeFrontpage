import { describe, expect, it } from 'vitest';
import {
  SamplerConstraintsDocument,
  availableSchedulers,
  baselinesSupportFlowShift,
  coerceSamplerConstraints,
  recommendedSchedulers,
  samplerSettingIsValid,
  samplerWorkFactor,
} from './sampler-constraints';

const contract: SamplerConstraintsDocument = {
  schema_version: '1.0',
  samplers: {
    k_euler: {
      name: 'k_euler',
      presentation_tier: 'recommended',
      work_profile: {
        kind: 'fixed_rate',
        marginal_work_units_per_trajectory_step: 1,
      },
      solver_type_choices: [],
      accepted_settings: {},
      applies_cfg_pp: false,
    },
    k_heun: {
      name: 'k_heun',
      presentation_tier: 'advanced',
      work_profile: {
        kind: 'fixed_rate',
        marginal_work_units_per_trajectory_step: 2,
      },
      solver_type_choices: [],
      accepted_settings: {},
      applies_cfg_pp: false,
    },
    k_dpm_adaptive: {
      name: 'k_dpm_adaptive',
      presentation_tier: 'advanced',
      work_profile: {
        kind: 'adaptive',
        estimated_work_units_per_request: 40,
      },
      solver_type_choices: [],
      accepted_settings: {},
      applies_cfg_pp: false,
    },
  },
  hard_constraints: {
    rejected_sampler_scheduler_pairings: [
      { sampler: 'k_euler', scheduler: 'normal' },
    ],
    scheduler_baseline_applicability: {
      align_your_steps: ['stable_diffusion_1', 'stable_diffusion_xl'],
    },
  },
  presentation_tiers: { recommended: ['k_euler'] },
  recommendations: [
    {
      samplers: [],
      schedulers: ['karras', 'normal'],
      provenance: 'upstream_author',
      source: 'backend author',
      summary: 'the schedules to use for most samplers',
    },
    {
      samplers: ['k_euler'],
      schedulers: ['simple'],
      provenance: 'community',
      source: 'a third-party matrix',
      summary: 'commonly paired',
    },
    {
      samplers: ['k_heun'],
      schedulers: ['exponential'],
      provenance: 'user_ruled',
      source: 'project ruling',
      summary: 'ruled against rendered comparisons',
    },
  ],
  advisories: { cfg_pp_advised_max_cfg_scale: null },
};

describe('sampler constraints', () => {
  it('accepts a version-1 document and rejects unsupported major versions', () => {
    expect(coerceSamplerConstraints(contract)?.schema_version).toBe('1.0');
    expect(
      coerceSamplerConstraints({ ...contract, schema_version: '2.0' }),
    ).toBeNull();
  });

  it('filters explicit rejections and fails closed for restricted schedulers', () => {
    expect(availableSchedulers(contract, 'k_euler', [])).not.toContain(
      'align_your_steps',
    );
    expect(
      availableSchedulers(contract, 'k_euler', ['stable_diffusion_xl']),
    ).toContain('align_your_steps');
    expect(
      availableSchedulers(contract, 'k_euler', ['stable_diffusion_2']),
    ).not.toContain('align_your_steps');
    expect(availableSchedulers(contract, 'k_euler', [])).not.toContain(
      'normal',
    );
  });

  it('applies finite bounds and integer-only constraints', () => {
    const range = {
      minimum: 1,
      maximum: 5,
      default: 2,
      integer_only: true,
    };
    expect(samplerSettingIsValid(range, 3)).toBe(true);
    expect(samplerSettingIsValid(range, 3.5)).toBe(false);
    expect(samplerSettingIsValid(range, 6)).toBe(false);
  });

  it('prices only the samplers that charge more than the ordinary rate', () => {
    expect(samplerWorkFactor(contract, 'k_euler')).toBeNull();
    expect(samplerWorkFactor(contract, 'k_heun')).toBe(2);
    expect(samplerWorkFactor(contract, 'k_dpm_adaptive')).toBe('adaptive');
    expect(samplerWorkFactor(null, 'k_heun')).toBeNull();
  });

  it('marks a pairing only where the horde or this project names the sampler', () => {
    // The k_euler/simple pairing is third-party, and the karras/normal entry
    // names no sampler, so neither marks anything.
    expect(recommendedSchedulers(contract, 'k_euler')).toEqual([]);
    expect(recommendedSchedulers(contract, 'k_heun')).toEqual(['exponential']);
    expect(recommendedSchedulers(null, 'k_heun')).toEqual([]);
  });

  it('reads the work profile and the pairings off a published document', () => {
    const parsed = coerceSamplerConstraints({
      ...contract,
      recommendations: [
        ...contract.recommendations,
        { samplers: [], schedulers: ['nonsense'], provenance: 'invented' },
      ],
    });

    expect(parsed?.samplers['k_heun'].work_profile).toEqual({
      kind: 'fixed_rate',
      marginal_work_units_per_trajectory_step: 2,
    });
    // An unknown provenance is dropped rather than shown as advice.
    expect(parsed?.recommendations).toHaveLength(3);
  });

  it('allows flow shift only when every effective baseline supports it', () => {
    expect(baselinesSupportFlowShift(['flux_1', 'qwen_image'])).toBe(true);
    expect(baselinesSupportFlowShift([])).toBe(false);
    expect(baselinesSupportFlowShift(['flux_1', 'stable_diffusion_xl'])).toBe(
      false,
    );
  });
});
