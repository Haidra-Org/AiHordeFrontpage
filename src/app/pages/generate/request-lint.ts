import {
  baselineSupportsControlNet,
  baselineSupportsMask,
  baselineSupportsQrCode,
  baselineSupportsRemix,
  baselineSupportsTransparent,
  CONTROLNET_BASELINES,
  MASK_BASELINES,
  QR_CODE_BASELINES,
  REMIX_BASELINES,
  TRANSPARENT_BASELINES,
  type ModelRequirements,
} from '../../services/model-reference.service';
import {
  activeLoras,
  HORDE_MAX_LORAS,
  HORDE_MAX_TIS,
} from '../../types/civitai-asset';
import {
  civitaiBaseModelMatchesBaseline,
  baselineForCivitaiBaseModel,
} from '../../services/civitai-base-models';
import {
  cfgAdvisory,
  clipSkipAdvisory,
  hiresUnneededHint,
  samplerRequirementHint,
  scheduleAdvisory,
  sizeAdvisory,
  stepsAdvisory,
  type GenerateFormValue,
  type RequirementHint,
} from './generate-form.model';
import type { SectionId } from '../../content/sections';
import {
  SAMPLER_SETTING_NAMES,
  type SamplerConstraintsDocument,
  type SamplerSettingName,
} from '../../types/sampler-constraints';

/**
 * The control a warning or a rejection is about, named by the id its wrapper is
 * registered under with {@link TutorialAnchorService}. One vocabulary serves the
 * follow-along tutorial, the go-to beside each warning, and the field a horde
 * rejection is shown at, so a control that can be pointed at can be pointed at
 * from all three.
 */
export type FieldAnchorId =
  | 'model'
  | 'size'
  | 'hires'
  | 'steps'
  | 'cfg'
  | 'sampler'
  | 'scheduler'
  | 'clip_skip'
  | 'loras'
  | 'source'
  | 'source_mode'
  | 'control_type'
  | 'qr'
  | 'transparent'
  | 'generate'
  | 'advanced_sampling'
  | 'solver_type'
  | 'flow_shift'
  | SamplerSettingName;

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
  /** The anchor id of the control the rule is about, for the go-to. */
  anchor: FieldAnchorId;
  /** Whether the request asks for the feature at all. */
  applies: (input: RequestLintInput) => boolean;
  /** Whether the request as described satisfies the rule. */
  satisfied: (input: RequestLintInput) => boolean;
}

export type FeatureCompatRuleId =
  | 'controlnet_baseline'
  | 'inpainting_model'
  | 'qr_code_baseline'
  | 'transparent_baseline'
  | 'remix_baseline'
  | 'mask_baseline'
  | 'hires_with_mask'
  | 'outpaint_target'
  | 'source_required';

/**
 * Whether the request carries a mask the worker software would act on. The
 * three masked shapes the panel can send, and the one it cannot: a control type
 * wins the pipeline choice, so a mask beside one is never applied.
 */
export function requestIsMasked(value: GenerateFormValue): boolean {
  if (value.sourceMode === 'inpainting') {
    return true;
  }
  return value.sourceMode === 'img2img' && value.maskEnabled;
}

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
  /**
   * The attached picture's own size, before anything the panel composes around
   * it. Absent while nothing is attached, and while a caller has no answer.
   */
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  /** The horde's sampler contract, or null while it has not loaded. */
  contract: SamplerConstraintsDocument | null;
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
  /** The control the warning is about, so the popover can offer a way there. */
  anchor: FieldAnchorId;
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
    anchor: 'control_type',
    section: 'source',
    baselines: CONTROLNET_BASELINES,
    messageKey: 'generate.lint.controlnet_baseline',
    applies: (input) => input.value.sourceMode === 'controlnet',
    satisfied: (input) => baselineSupportsControlNet(input.baseline),
  },
  {
    id: 'inpainting_model',
    anchor: 'model',
    section: 'model',
    baselines: [],
    messageKey: 'generate.lint.inpainting_model',
    applies: (input) => input.value.sourceMode === 'inpainting',
    // The horde routes by model name, and inpainting-capable checkpoints are
    // labeled that way in the model list. Keep this advisory because names are
    // community-maintained and can drift.
    satisfied: (input) => /inpaint/i.test(input.value.model),
  },
  {
    id: 'remix_baseline',
    anchor: 'source_mode',
    section: 'source',
    baselines: REMIX_BASELINES,
    // The source section already words this for the mode chip it disables, and
    // the two must stay one sentence.
    messageKey: 'generate.source.remix_unsupported',
    applies: (input) => input.value.sourceMode === 'remix',
    satisfied: (input) => baselineSupportsRemix(input.baseline),
  },
  {
    id: 'mask_baseline',
    anchor: 'source_mode',
    section: 'source',
    baselines: MASK_BASELINES,
    messageKey: 'generate.lint.mask_baseline',
    applies: (input) => requestIsMasked(input.value),
    satisfied: (input) => baselineSupportsMask(input.baseline),
  },
  {
    // Two different failures, one rule, because the answer is the same: do not
    // send both. With a mask attached the worker software picks the masked
    // pipeline, which has no second pass in it, and returns the render at the
    // smaller size the first pass was shrunk to. While painting it drops the
    // flag outright. Wording them alike would claim a size error the painting
    // modes never produce.
    id: 'hires_with_mask',
    anchor: 'hires',
    section: 'size',
    baselines: [],
    messageKey: 'generate.lint.hires_with_mask',
    applies: (input) => input.value.hires_fix && requestIsMasked(input.value),
    satisfied: () => false,
  },
  {
    id: 'outpaint_target',
    anchor: 'source_mode',
    section: 'source',
    baselines: [],
    messageKey: 'generate.lint.outpaint_target',
    applies: (input) =>
      input.value.sourceMode === 'inpainting' && input.value.outpaintEnabled,
    // Growing the canvas needs somewhere to grow into. The panel composes the
    // larger picture itself, so a target no bigger than the attachment leaves
    // it nothing to add and the request is an ordinary inpaint. A picture whose
    // size is not known yet is left alone: source_required already covers the
    // case where there is none, and guessing would warn about nothing.
    satisfied: (input) => {
      const width = input.sourceWidth ?? 0;
      const height = input.sourceHeight ?? 0;
      if (width <= 0 || height <= 0) {
        return true;
      }
      return input.value.width > width || input.value.height > height;
    },
  },
  {
    id: 'qr_code_baseline',
    anchor: 'qr',
    section: 'workflows',
    baselines: QR_CODE_BASELINES,
    // As above: the workflows card already carries this sentence beside the
    // input it disables.
    messageKey: 'generate.form.qr_unsupported',
    applies: (input) => input.value.qrText.trim() !== '',
    satisfied: (input) => baselineSupportsQrCode(input.baseline),
  },
  {
    id: 'transparent_baseline',
    anchor: 'transparent',
    section: 'workflows',
    baselines: TRANSPARENT_BASELINES,
    messageKey: 'generate.lint.transparent_baseline',
    applies: (input) => input.value.transparent,
    satisfied: (input) => baselineSupportsTransparent(input.baseline),
  },
  {
    id: 'source_required',
    anchor: 'source',
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
 * How many names a warning lists before it stops naming them. Past a few the
 * sentence stops being readable and the reader is going to open the card
 * anyway.
 */
const MAX_NAMED_ASSETS = 3;

/** More selections than the horde will accept, so the request is truncated. */
export function loraLimitWarning(
  value: GenerateFormValue,
): RequestWarning | null {
  const count = value.loras.length;
  if (count <= HORDE_MAX_LORAS) {
    return null;
  }
  return {
    id: 'lora_limit',
    section: 'model',
    anchor: 'loras',
    key: 'generate.lint.lora_limit',
    params: { count, max: HORDE_MAX_LORAS, dropped: count - HORDE_MAX_LORAS },
  };
}

/** As {@link loraLimitWarning}, for textual inversions and their own cap. */
export function tiLimitWarning(
  value: GenerateFormValue,
): RequestWarning | null {
  const count = value.tis.length;
  if (count <= HORDE_MAX_TIS) {
    return null;
  }
  return {
    id: 'ti_limit',
    section: 'model',
    anchor: 'loras',
    key: 'generate.lint.ti_limit',
    params: { count, max: HORDE_MAX_TIS, dropped: count - HORDE_MAX_TIS },
  };
}

/**
 * A selected LoRA trained for a different model family. Applying one produces
 * noise or nothing at all, and the horde accepts the request either way, so
 * without this the only symptom is a picture that ignored the LoRA.
 *
 * Only the selections actually being sent are checked: warning about one parked
 * past the cap stacks noise on top of the truncation warning already firing.
 * The rule is silent wherever it cannot be sure — no baseline known, no base
 * model recorded on the entry, or a family the table has no opinion about —
 * because a false warning against a working combination is worse than none.
 */
export function loraBaselineWarning(
  value: GenerateFormValue,
  baseline: string | null,
): RequestWarning | null {
  if (baseline === null) {
    return null;
  }
  const mismatched = activeLoras(value.loras).filter(
    (lora) =>
      lora.baseModel !== undefined &&
      baselineForCivitaiBaseModel(lora.baseModel) !== null &&
      !civitaiBaseModelMatchesBaseline(lora.baseModel, baseline),
  );
  if (mismatched.length === 0) {
    return null;
  }
  const named = mismatched
    .slice(0, MAX_NAMED_ASSETS)
    .map((lora) => lora.label ?? lora.name);
  const extra = mismatched.length - named.length;
  return {
    id: 'lora_baseline',
    section: 'model',
    anchor: 'loras',
    key: 'generate.lint.lora_baseline',
    params: {
      names: named.join(', '),
      count: mismatched.length,
      extra,
    },
  };
}

/**
 * Turn a field's one advisory line into a warning, or null where the field has
 * no line or its line does not contradict the form. Every card's inline line
 * comes from the same per-field resolvers, so the count beside Generate is
 * exactly the set of warning lines the panel is drawing.
 */
function fromHint(
  section: SectionId,
  anchor: FieldAnchorId,
  hint: RequirementHint | null,
): RequestWarning | null {
  if (!hint || !hint.violated) {
    return null;
  }
  return { id: hint.key, section, anchor, key: hint.key, params: hint.params };
}

/**
 * Every warning the request as described currently earns: the model's own
 * recommendations where the form contradicts them, the resolution notes, and
 * the feature-compatibility table. The list is the request's, not any one
 * card's, which is what lets the panel show a single count beside Generate.
 *
 * One entry per field at most, because one line per field is what the panel
 * draws; the per-field resolvers in the form model decide which of a field's
 * candidates that is.
 */
export function evaluateRequestLint(
  input: RequestLintInput,
): readonly RequestWarning[] {
  const { value, requirements, baseline, contract } = input;
  const warnings: RequestWarning[] = [];
  const push = (warning: RequestWarning | null): void => {
    if (warning) {
      warnings.push(warning);
    }
  };

  push(
    fromHint(
      'sampling',
      'steps',
      stepsAdvisory(requirements, contract, value.sampler_name, value.steps),
    ),
  );
  push(
    fromHint(
      'sampling',
      'cfg',
      cfgAdvisory(requirements, contract, value.sampler_name, value.cfg_scale),
    ),
  );
  push(
    fromHint(
      'sampling',
      'clip_skip',
      clipSkipAdvisory(requirements, value.clip_skip),
    ),
  );
  push(
    fromHint(
      'sampling',
      'sampler',
      samplerRequirementHint(requirements, value.sampler_name),
    ),
  );
  push(
    fromHint(
      'sampling',
      'scheduler',
      scheduleAdvisory(requirements, contract, value.scheduler),
    ),
  );
  push(
    fromHint(
      'size',
      'size',
      sizeAdvisory(baseline, value.width, value.height, value.hires_fix),
    ),
  );
  push(
    fromHint(
      'size',
      'hires',
      hiresUnneededHint(baseline, value.width, value.height, value.hires_fix),
    ),
  );

  push(loraLimitWarning(value));
  push(tiLimitWarning(value));
  push(loraBaselineWarning(value, baseline));

  for (const rule of violatedCompatRules(input)) {
    warnings.push({
      id: rule.id,
      section: rule.section,
      anchor: rule.anchor,
      key: rule.messageKey,
      params: {},
    });
  }
  return warnings;
}

/**
 * The warnings about one control. The LoRA card reads this rather than its whole
 * section, because the model area also owns the model select and a warning about
 * that must not surface inside the LoRA card.
 */
export function warningsAtAnchor(
  warnings: readonly RequestWarning[],
  anchor: FieldAnchorId,
): readonly RequestWarning[] {
  return warnings.filter((warning) => warning.anchor === anchor);
}

/** The warnings belonging to one panel area, for that card's inline lines. */
export function warningsInSection(
  warnings: readonly RequestWarning[],
  section: SectionId,
): readonly RequestWarning[] {
  return warnings.filter((warning) => warning.section === section);
}

// --- Horde rejections ------------------------------------------------------
//
// A rejected submit comes back as a sentence and a return code. The sentence is
// the horde's own and is shown verbatim, because it is more specific than
// anything the studio could reconstruct; the code is only used to decide which
// control to show it under, so that a reader is looking at the field they have
// to change rather than at a tile at the far side of the screen.

/** A horde rejection placed at the control it is about. */
export interface FieldRejection {
  anchor: FieldAnchorId;
  /** The horde's own sentence, shown as written. */
  message: string;
}

/** The knob words the horde uses in a rejection, and the controls they name. */
const KNOB_WORDS: ReadonlyMap<string, SamplerSettingName> = new Map([
  ['eta', 'sampler_eta'],
  ['s_noise', 'sampler_s_noise'],
  ['s_churn', 'sampler_s_churn'],
  ['s_tmin', 'sampler_s_tmin'],
  ['s_tmax', 'sampler_s_tmax'],
  ['order', 'sampler_order'],
]);

/**
 * Which control a rejection code is about. A code the studio does not model
 * returns null and the rejection stays where every failure already appears.
 */
const REJECTION_ANCHORS: ReadonlyMap<string, FieldAnchorId> = new Map([
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
  ['InsufficientKudos', 'generate'],
  ['TooManyPrompts', 'generate'],
  ['TooManyLoras', 'loras'],
  ['TooManyTIs', 'loras'],
  ['BadLoraVersion', 'loras'],
  ['InvalidModel', 'model'],
  ['ModelNotFound', 'model'],
  ['UnknownModel', 'model'],
]);

/** The codes that name a sampler knob, which the message has to be read for. */
const KNOB_REJECTION_CODES: readonly string[] = [
  'SamplerKnobInapplicable',
  'SamplerKnobOutOfRange',
];

/**
 * The knob a rejection is about. The code says only that some knob was refused,
 * so the word is read out of the sentence; a sentence that names none puts the
 * rejection on the group the knobs live in, which is still nearer than nothing.
 */
function knobAnchor(message: string): FieldAnchorId {
  const boundary = String.raw`\b`;
  for (const [word, setting] of KNOB_WORDS) {
    // Bounded on both sides so `order` does not answer for `sampler_order` in
    // one sentence and for the word "order" in another.
    const pattern = boundary + `(sampler_)?${word}` + boundary;
    if (new RegExp(pattern).test(message)) {
      return setting;
    }
  }
  return 'advanced_sampling';
}

/**
 * Where a horde rejection belongs, or null when the studio has no field for it.
 */
export function rejectionField(
  rc: string | undefined,
  message: string,
): FieldRejection | null {
  if (!rc || message.trim() === '') {
    return null;
  }
  if (KNOB_REJECTION_CODES.includes(rc)) {
    return { anchor: knobAnchor(message), message };
  }
  const anchor = REJECTION_ANCHORS.get(rc);
  return anchor ? { anchor, message } : null;
}

/**
 * The form value a rejection is answered by changing. A rejection stands until
 * the reader touches the control it was placed at: the horde is the authority on
 * whether the new value is acceptable, so an edit clears the message rather than
 * being re-judged locally.
 */
export function rejectionWatchValue(
  anchor: FieldAnchorId,
  value: GenerateFormValue,
): unknown {
  for (const name of SAMPLER_SETTING_NAMES) {
    if (anchor === name) {
      return value[name];
    }
  }
  switch (anchor) {
    case 'solver_type':
      return value.sampler_solver_type;
    case 'scheduler':
      return `${value.scheduler}|${value.sampler_name}|${value.model}`;
    case 'flow_shift':
      return value.flow_shift;
    case 'source':
      return value.sourceMode;
    case 'control_type':
      return value.control_type;
    case 'generate':
      return `${value.n}|${value.prompt}`;
    case 'model':
      return value.model;
    case 'loras':
      return [
        value.loras.length,
        value.tis.length,
        ...value.loras.map(
          (lora) => `${lora.is_version === true}:${lora.name}`,
        ),
      ].join('|');
    case 'advanced_sampling':
      return SAMPLER_SETTING_NAMES.map((name) => value[name]).join('|');
    default:
      return null;
  }
}
