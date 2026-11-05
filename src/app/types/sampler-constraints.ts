/** Numeric solver setting accepted by one sampler. */
export interface SamplerKnobRange {
  minimum: number;
  maximum: number | null;
  default: number | null;
  integer_only: boolean;
}

export const SAMPLER_SETTING_NAMES = [
  'sampler_eta',
  'sampler_s_noise',
  'sampler_s_churn',
  'sampler_s_tmin',
  'sampler_s_tmax',
  'sampler_order',
] as const;

export type SamplerSettingName = (typeof SAMPLER_SETTING_NAMES)[number];

/**
 * What one sampler costs. `fixed_rate` samplers charge their multiplier on top
 * of every trajectory step, so a request at the same step count can cost two or
 * three times another's; `adaptive` samplers choose their own step count and are
 * priced against a flat estimate instead.
 */
export type SamplerWorkProfile =
  | { kind: 'fixed_rate'; marginal_work_units_per_trajectory_step: number }
  | { kind: 'adaptive'; estimated_work_units_per_request: number };

export interface SamplerConstraintRecord {
  name: string;
  presentation_tier: 'recommended' | 'advanced';
  /** Null where the horde states no profile for the sampler. */
  work_profile: SamplerWorkProfile | null;
  solver_type_choices: string[];
  accepted_settings: Partial<Record<SamplerSettingName, SamplerKnobRange>>;
  /**
   * Whether the sampler folds the guidance step into its own update. Those
   * samplers want far lower guidance than the rest, and the horde accepts a
   * high value from them rather than refusing it.
   */
  applies_cfg_pp: boolean;
}

export interface RejectedSamplerSchedulerPairing {
  sampler: string;
  scheduler: string;
}

/**
 * Where a pairing suggestion comes from. `upstream_author` is the backend's own
 * authors and `user_ruled` is a ruling made against rendered comparisons;
 * `community` is third-party and unendorsed, which is why the form does not
 * repeat it as advice.
 */
export type RecommendationProvenance =
  'upstream_author' | 'user_ruled' | 'community';

/** One sampler/scheduler pairing the horde suggests without enforcing it. */
export interface SamplerRecommendation {
  /** The samplers it speaks to; empty means every sampler. */
  samplers: string[];
  schedulers: ImageSchedulerName[];
  provenance: RecommendationProvenance;
  source: string;
  summary: string;
}

/** Provenances trusted enough to surface as a line under the schedule select. */
const HINTED_PROVENANCES: readonly RecommendationProvenance[] = [
  'upstream_author',
  'user_ruled',
];

/** Version 1 of the anonymous sampler contract used by non-Python clients. */
export interface SamplerConstraintsDocument {
  schema_version: string;
  samplers: Record<string, SamplerConstraintRecord>;
  hard_constraints: {
    rejected_sampler_scheduler_pairings: RejectedSamplerSchedulerPairing[];
    scheduler_baseline_applicability: Record<string, string[]>;
  };
  presentation_tiers: {
    recommended: string[];
  };
  /** Pairing advice the horde publishes; never enforced. */
  recommendations: SamplerRecommendation[];
  /** Advice the horde publishes but does not enforce. Absent where unstated. */
  advisories: {
    cfg_pp_advised_max_cfg_scale: number | null;
  };
}

/**
 * Scheduler enum on the v2 image-generation request schema, in the order the
 * schedule select offers them: the two schedules every client has always had
 * first, then the rest.
 */
export const IMAGE_SCHEDULERS = [
  'karras',
  'normal',
  'exponential',
  'sgm_uniform',
  'simple',
  'ddim_uniform',
  'beta',
  'linear_quadratic',
  'kl_optimal',
  'align_your_steps',
  'gits',
] as const;

export type ImageSchedulerName = (typeof IMAGE_SCHEDULERS)[number];

/** Model baselines whose backend graph applies `flow_shift`. */
export const FLOW_SHIFT_BASELINES: readonly string[] = [
  'flux_1',
  'flux_dev',
  'flux_schnell',
  'qwen_image',
];

export const MIN_FLOW_SHIFT = 0;
export const MAX_FLOW_SHIFT = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function coerceKnobRange(raw: unknown): SamplerKnobRange | null {
  if (!isRecord(raw)) return null;
  const minimum = finiteNumber(raw['minimum']);
  const maximum = raw['maximum'] === null ? null : finiteNumber(raw['maximum']);
  const defaultValue =
    raw['default'] === null ? null : finiteNumber(raw['default']);
  if (
    minimum === null ||
    (raw['maximum'] !== null && maximum === null) ||
    (raw['default'] !== null && defaultValue === null) ||
    typeof raw['integer_only'] !== 'boolean'
  ) {
    return null;
  }
  return {
    minimum,
    maximum,
    default: defaultValue,
    integer_only: raw['integer_only'],
  };
}

function coerceWorkProfile(raw: unknown): SamplerWorkProfile | null {
  if (!isRecord(raw)) return null;
  if (raw['kind'] === 'fixed_rate') {
    const rate = finiteNumber(raw['marginal_work_units_per_trajectory_step']);
    return rate === null
      ? null
      : { kind: 'fixed_rate', marginal_work_units_per_trajectory_step: rate };
  }
  if (raw['kind'] === 'adaptive') {
    const estimate = finiteNumber(raw['estimated_work_units_per_request']);
    return estimate === null
      ? null
      : { kind: 'adaptive', estimated_work_units_per_request: estimate };
  }
  return null;
}

function coerceRecommendation(raw: unknown): SamplerRecommendation | null {
  if (!isRecord(raw)) return null;
  const provenance = raw['provenance'];
  if (
    provenance !== 'upstream_author' &&
    provenance !== 'user_ruled' &&
    provenance !== 'community'
  ) {
    return null;
  }
  if (!Array.isArray(raw['samplers']) || !Array.isArray(raw['schedulers'])) {
    return null;
  }
  return {
    samplers: raw['samplers'].filter(
      (value): value is string => typeof value === 'string',
    ),
    schedulers: raw['schedulers'].filter((value): value is ImageSchedulerName =>
      (IMAGE_SCHEDULERS as readonly unknown[]).includes(value),
    ),
    provenance,
    source: typeof raw['source'] === 'string' ? raw['source'] : '',
    summary: typeof raw['summary'] === 'string' ? raw['summary'] : '',
  };
}

function coerceSampler(
  name: string,
  raw: unknown,
): SamplerConstraintRecord | null {
  if (!isRecord(raw)) return null;
  const tier = raw['presentation_tier'];
  if (tier !== 'recommended' && tier !== 'advanced') return null;
  const solverTypes = raw['solver_type_choices'];
  const settings = raw['accepted_settings'];
  if (!Array.isArray(solverTypes) || !isRecord(settings)) return null;

  const accepted: Partial<Record<SamplerSettingName, SamplerKnobRange>> = {};
  for (const settingName of SAMPLER_SETTING_NAMES) {
    const range = coerceKnobRange(settings[settingName]);
    if (range) accepted[settingName] = range;
  }
  return {
    name,
    presentation_tier: tier,
    work_profile: coerceWorkProfile(raw['work_profile']),
    solver_type_choices: solverTypes.filter(
      (value): value is string => typeof value === 'string',
    ),
    accepted_settings: accepted,
    applies_cfg_pp: raw['applies_cfg_pp'] === true,
  };
}

/**
 * Parse only the version-1 fields the frontend consumes. A malformed or newer
 * major version returns null so callers can fall back to a compatible cache.
 */
export function coerceSamplerConstraints(
  raw: unknown,
): SamplerConstraintsDocument | null {
  if (!isRecord(raw) || typeof raw['schema_version'] !== 'string') return null;
  if (raw['schema_version'].split('.')[0] !== '1') return null;
  if (!isRecord(raw['samplers']) || !isRecord(raw['hard_constraints'])) {
    return null;
  }

  const samplers: Record<string, SamplerConstraintRecord> = {};
  for (const [name, value] of Object.entries(raw['samplers'])) {
    const sampler = coerceSampler(name, value);
    if (sampler) samplers[name] = sampler;
  }
  if (Object.keys(samplers).length === 0) return null;

  const hard = raw['hard_constraints'];
  const rawPairings = hard['rejected_sampler_scheduler_pairings'];
  const pairings: RejectedSamplerSchedulerPairing[] = [];
  if (Array.isArray(rawPairings)) {
    for (const value of rawPairings) {
      if (
        isRecord(value) &&
        typeof value['sampler'] === 'string' &&
        typeof value['scheduler'] === 'string'
      ) {
        pairings.push({
          sampler: value['sampler'],
          scheduler: value['scheduler'],
        });
      }
    }
  }

  const applicability: Record<string, string[]> = {};
  const rawApplicability = hard['scheduler_baseline_applicability'];
  if (isRecord(rawApplicability)) {
    for (const [scheduler, baselines] of Object.entries(rawApplicability)) {
      if (Array.isArray(baselines)) {
        applicability[scheduler] = baselines.filter(
          (value): value is string => typeof value === 'string',
        );
      }
    }
  }

  const presentation = isRecord(raw['presentation_tiers'])
    ? raw['presentation_tiers']
    : {};
  const recommended = Array.isArray(presentation['recommended'])
    ? presentation['recommended'].filter(
        (value): value is string =>
          typeof value === 'string' && value in samplers,
      )
    : [];

  const advisories = isRecord(raw['advisories']) ? raw['advisories'] : {};

  const recommendations: SamplerRecommendation[] = [];
  if (Array.isArray(raw['recommendations'])) {
    for (const value of raw['recommendations']) {
      const entry = coerceRecommendation(value);
      if (entry) recommendations.push(entry);
    }
  }

  return {
    schema_version: raw['schema_version'],
    samplers,
    hard_constraints: {
      rejected_sampler_scheduler_pairings: pairings,
      scheduler_baseline_applicability: applicability,
    },
    presentation_tiers: { recommended },
    recommendations,
    advisories: {
      cfg_pp_advised_max_cfg_scale: finiteNumber(
        advisories['cfg_pp_advised_max_cfg_scale'],
      ),
    },
  };
}

/** Schedulers valid for the final sampler and every final model baseline. */
export function availableSchedulers(
  contract: SamplerConstraintsDocument,
  sampler: string,
  baselines: readonly string[],
): ImageSchedulerName[] {
  const rejected = new Set(
    contract.hard_constraints.rejected_sampler_scheduler_pairings
      .filter((pair) => pair.sampler === sampler)
      .map((pair) => pair.scheduler),
  );
  return IMAGE_SCHEDULERS.filter((scheduler) => {
    if (rejected.has(scheduler)) return false;
    const allowed =
      contract.hard_constraints.scheduler_baseline_applicability[scheduler];
    return (
      allowed === undefined ||
      (baselines.length > 0 &&
        baselines.every((baseline) => allowed.includes(baseline)))
    );
  });
}

/**
 * How much work the sampler charges per step relative to the cheapest ones, or
 * 'adaptive' where it picks its own step count. Null where the horde states no
 * profile, or where the sampler charges the ordinary rate and there is nothing
 * to say about it.
 */
export function samplerWorkFactor(
  contract: SamplerConstraintsDocument | null,
  sampler: string,
): number | 'adaptive' | null {
  const profile = contract?.samplers[sampler]?.work_profile;
  if (!profile) return null;
  if (profile.kind === 'adaptive') return 'adaptive';
  const rate = profile.marginal_work_units_per_trajectory_step;
  return rate > 1 ? rate : null;
}

/**
 * The schedules the horde pairs `sampler` with by name. Third-party advice is
 * left out: the form only marks what the backend's authors or a project ruling
 * stand behind.
 *
 * Entries that name no sampler are left out too. They speak for the schedule
 * itself rather than for a pairing, and marking every schedule they mention
 * would mark most of the list.
 */
export function recommendedSchedulers(
  contract: SamplerConstraintsDocument | null,
  sampler: string,
): ImageSchedulerName[] {
  const schedulers: ImageSchedulerName[] = [];
  for (const entry of contract?.recommendations ?? []) {
    if (!HINTED_PROVENANCES.includes(entry.provenance)) continue;
    if (!entry.samplers.includes(sampler)) continue;
    for (const scheduler of entry.schedulers) {
      if (!schedulers.includes(scheduler)) schedulers.push(scheduler);
    }
  }
  return schedulers;
}

export function samplerSettingIsValid(
  range: SamplerKnobRange,
  value: number,
): boolean {
  return (
    Number.isFinite(value) &&
    value >= range.minimum &&
    (range.maximum === null || value <= range.maximum) &&
    (!range.integer_only || Number.isInteger(value))
  );
}

export function baselinesSupportFlowShift(
  baselines: readonly string[],
): boolean {
  return (
    baselines.length > 0 &&
    baselines.every((baseline) => FLOW_SHIFT_BASELINES.includes(baseline))
  );
}

/**
 * The guidance ceiling the contract advises for the selected sampler, or null
 * where the sampler does not fold guidance into its update or the horde states
 * no ceiling. Advice only: a request above it is accepted and dispatched.
 */
export function advisedMaxCfgScale(
  contract: SamplerConstraintsDocument | null,
  sampler: string,
): number | null {
  if (!contract?.samplers[sampler]?.applies_cfg_pp) {
    return null;
  }
  return contract.advisories.cfg_pp_advised_max_cfg_scale;
}
