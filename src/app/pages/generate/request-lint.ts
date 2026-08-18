import {
  baselineSupportsControlNet,
  baselineSupportsQrCode,
  baselineSupportsRemix,
  CONTROLNET_BASELINES,
  QR_CODE_BASELINES,
  REMIX_BASELINES,
  type ModelRequirements,
} from '../../services/model-reference.service';
import {
  cfgRequirementHint,
  clipSkipRequirementHint,
  karrasRequirementHint,
  samplerRequirementHint,
  sd15HiresHint,
  stepsRequirementHint,
  PIXEL_WARN_THRESHOLD,
  type GenerateFormValue,
  type RequirementHint,
} from './generate-form.model';
import type { SectionId } from '../../content/sections';

/**
 * A combination the horde may refuse, or serve as something other than what was
 * asked for. Every rule here is advisory: the studio never blocks a submission
 * on one, because the horde itself is the only authority on what it will accept
 * and a model reference that is stale or unreachable must not lock anyone out.
 *
 * `baselines` is the set of normalised model baselines that can serve the
 * feature, empty for a rule that is not about the model at all. It is declared
 * rather than hidden inside {@link FeatureCompatRule.satisfied} so written
 * reference content can list the same answer the studio warns with.
 */
export interface FeatureCompatRule {
  id: FeatureCompatRuleId;
  /** The panel area the rule's control lives in; also its hue. */
  section: SectionId;
  /** Normalised baselines that can serve the feature; empty when not gated on one. */
  baselines: readonly string[];
  /** Transloco key of the line the rule renders, inline and in the popover. */
  messageKey: string;
  /** Whether the request asks for the feature at all. */
  applies: (input: RequestLintInput) => boolean;
  /** Whether the request as described satisfies the rule. */
  satisfied: (input: RequestLintInput) => boolean;
}

export type FeatureCompatRuleId =
  | 'controlnet_baseline'
  | 'qr_code_baseline'
  | 'remix_baseline'
  | 'source_required';

/** Everything a rule may read about the request being described. */
export interface RequestLintInput {
  /** The form value that would actually be submitted (simple mode already projected). */
  value: GenerateFormValue;
  /** The selected model's normalised baseline; null when nothing is known. */
  baseline: string | null;
  /** The settings the selected model recommends, or null when it names none. */
  requirements: ModelRequirements | null;
  /** Whether a source image blob is genuinely attached. */
  hasSourceImage: boolean;
}

/** One warning the request currently earns. */
export interface RequestWarning {
  /**
   * Stable identity: a {@link FeatureCompatRuleId} for a compat rule, the
   * requirement hint's own key for the rest. Used to track the list and to ask
   * whether a particular rule is firing.
   */
  id: string;
  section: SectionId;
  /** Transloco key for the line's text. */
  key: string;
  params: Record<string, string | number>;
}

/**
 * The feature-compatibility table. Each entry pairs a request shape the horde
 * only serves on some models with the baselines that can serve it.
 */
export const FEATURE_COMPAT_RULES: readonly FeatureCompatRule[] = [
  {
    id: 'controlnet_baseline',
    section: 'source',
    baselines: CONTROLNET_BASELINES,
    messageKey: 'generate.lint.controlnet_baseline',
    applies: (input) => input.value.sourceMode === 'controlnet',
    satisfied: (input) => baselineSupportsControlNet(input.baseline),
  },
  {
    id: 'remix_baseline',
    section: 'source',
    baselines: REMIX_BASELINES,
    // The source section already words this for the mode chip it disables, and
    // the two must stay one sentence.
    messageKey: 'generate.source.remix_unsupported',
    applies: (input) => input.value.sourceMode === 'remix',
    satisfied: (input) => baselineSupportsRemix(input.baseline),
  },
  {
    id: 'qr_code_baseline',
    section: 'workflows',
    baselines: QR_CODE_BASELINES,
    // As above: the workflows card already carries this sentence beside the
    // input it disables.
    messageKey: 'generate.form.qr_unsupported',
    applies: (input) => input.value.qrText.trim() !== '',
    satisfied: (input) => baselineSupportsQrCode(input.baseline),
  },
  {
    id: 'source_required',
    section: 'source',
    baselines: [],
    messageKey: 'generate.lint.source_required',
    applies: (input) => input.value.sourceMode !== 'none',
    satisfied: (input) => input.hasSourceImage,
  },
];

/** The rule `id` names, for a caller that wants to word one of them itself. */
export function featureCompatRule(id: FeatureCompatRuleId): FeatureCompatRule {
  const rule = FEATURE_COMPAT_RULES.find((entry) => entry.id === id);
  if (!rule) {
    throw new Error(`Unknown feature compatibility rule: ${id}`);
  }
  return rule;
}

/** The compat rules the request currently violates, in table order. */
export function violatedCompatRules(
  input: RequestLintInput,
): readonly FeatureCompatRule[] {
  return FEATURE_COMPAT_RULES.filter(
    (rule) => rule.applies(input) && !rule.satisfied(input),
  );
}

/**
 * Turn a requirement hint into a warning, or null where the hint is absent or
 * the form's value agrees with it. The advisory lines under the controls are
 * the same objects, so the popover can never say something the card does not.
 */
function fromHint(
  section: SectionId,
  hint: RequirementHint | null,
): RequestWarning | null {
  if (!hint || !hint.violated) {
    return null;
  }
  return { id: hint.key, section, key: hint.key, params: hint.params };
}

/**
 * Every warning the request as described currently earns: the model's own
 * recommendations where the form contradicts them, the resolution notes, and
 * the feature-compatibility table. The list is the request's, not any one
 * card's, which is what lets the panel show a single count beside Generate.
 */
export function evaluateRequestLint(
  input: RequestLintInput,
): readonly RequestWarning[] {
  const { value, requirements, baseline } = input;
  const warnings: RequestWarning[] = [];
  const push = (warning: RequestWarning | null): void => {
    if (warning) {
      warnings.push(warning);
    }
  };

  push(fromHint('sampling', stepsRequirementHint(requirements, value.steps)));
  push(fromHint('sampling', cfgRequirementHint(requirements, value.cfg_scale)));
  push(
    fromHint(
      'sampling',
      clipSkipRequirementHint(requirements, value.clip_skip),
    ),
  );
  push(
    fromHint(
      'sampling',
      samplerRequirementHint(requirements, value.sampler_name),
    ),
  );
  push(
    fromHint('sampling', karrasRequirementHint(requirements, value.scheduler)),
  );
  push(
    fromHint(
      'size',
      sd15HiresHint(baseline, value.width, value.height, value.hires_fix),
    ),
  );
  if (value.width * value.height > PIXEL_WARN_THRESHOLD) {
    push({
      id: 'pixel_budget',
      section: 'size',
      key: 'generate.form.pixel_warning',
      params: {},
    });
  }

  for (const rule of violatedCompatRules(input)) {
    warnings.push({
      id: rule.id,
      section: rule.section,
      key: rule.messageKey,
      params: {},
    });
  }
  return warnings;
}

/** The warnings belonging to one panel area, for that card's inline lines. */
export function warningsInSection(
  warnings: readonly RequestWarning[],
  section: SectionId,
): readonly RequestWarning[] {
  return warnings.filter((warning) => warning.section === section);
}
