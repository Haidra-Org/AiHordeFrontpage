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
  offeredSamplers,
  samplerRequirementHint,
  scheduleAdvisory,
  sizeAdvisory,
  stepsAdvisory,
  type BoundedFieldName,
  type GenerateFormValue,
  type RequirementHint,
} from './generate-form.model';
import { settingProseLabelKey } from '../../content/settings';
import { hordeRejectionKey } from '../../types/generation';
import type { SectionId } from '../../content/sections';
import type { HordeWorker } from '../../types/horde-worker';
import {
  largestSquareSide,
  workerShortfall,
  type WorkerRequirement,
} from '../../services/worker-pool.service';
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
  | 'prompt'
  | 'model'
  | 'size'
  | 'hires'
  | 'hires_denoise'
  | 'steps'
  | 'cfg'
  | 'sampler'
  | 'scheduler'
  | 'clip_skip'
  | 'loras'
  | 'source'
  | 'source_mode'
  | 'denoise'
  | 'control_type'
  | 'control_strength'
  | 'qr'
  | 'transparent'
  | 'upscaler'
  | 'facefixer'
  | 'facefixer_strength'
  | 'workers'
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
  | 'controlnet_denoise'
  | 'inpainting_model'
  | 'qr_code_baseline'
  | 'transparent_baseline'
  | 'remix_baseline'
  | 'mask_baseline'
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

/**
 * One selected model and the baseline it resolves to. The baseline is null
 * wherever the reference has no answer, which every rule reading it treats as
 * "say nothing".
 */
export interface LintModelSelection {
  name: string;
  baseline: string | null;
}

/** Everything a rule may read about the request being described. */
export interface RequestLintInput {
  /** The form value that would actually be submitted (simple mode already projected). */
  value: GenerateFormValue;
  /** The primary model's normalised baseline; null when nothing is known. */
  baseline: string | null;
  /**
   * Every model the request would accept, primary first. Absent or empty falls
   * back to the primary alone, so a caller that knows of only one model keeps
   * the answers it always got. A request naming several is asking for any one
   * of them, so a model-dependent rule warns only when none of them satisfies
   * it.
   */
  selectedModels?: readonly LintModelSelection[];
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
  /**
   * The image workers the horde is listing, absent or null while none are
   * known, which every rule reading them treats as "say nothing".
   */
  workers?: readonly HordeWorker[] | null;
  /**
   * What the built request asks of a worker, absent or null before one has been
   * built. Read rather than rebuilt from {@link RequestLintInput.value} so the
   * routing rules judge the same demands the footer's count is made from.
   */
  requirement?: WorkerRequirement | null;
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
    id: 'controlnet_denoise',
    anchor: 'denoise',
    section: 'source',
    baselines: [],
    messageKey: 'generate.lint.controlnet_denoise',
    applies: (input) => input.value.sourceMode === 'controlnet',
    satisfied: (input) => input.value.denoising_strength === 1,
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

/**
 * The models the request would accept, as the rules read them: what the caller
 * listed, or the primary model alone when it listed nothing.
 */
export function lintModelSelections(
  input: RequestLintInput,
): readonly LintModelSelection[] {
  const listed = input.selectedModels ?? [];
  return listed.length > 0
    ? listed
    : [{ name: input.value.model, baseline: input.baseline }];
}

/**
 * The same input as asked about one of the selected models: a rule reading the
 * model name or its baseline then answers for that model rather than for the
 * primary. Every other field is shared, so a rule about anything else gives the
 * same answer whichever selection it is handed.
 */
function inputForSelection(
  input: RequestLintInput,
  selection: LintModelSelection,
): RequestLintInput {
  return {
    ...input,
    baseline: selection.baseline,
    value: { ...input.value, model: selection.name },
  };
}

/** The rule `id` names, for a caller that wants to word one of them itself. */
export function featureCompatRule(id: FeatureCompatRuleId): FeatureCompatRule {
  const rule = FEATURE_COMPAT_RULES.find((entry) => entry.id === id);
  if (!rule) {
    throw new Error(`Unknown feature compatibility rule: ${id}`);
  }
  return rule;
}

/**
 * The compat rules the request currently violates, in table order. With several
 * models named the request only has to be servable by one of them, so a rule is
 * violated when no selected model satisfies it.
 */
export function violatedCompatRules(
  input: RequestLintInput,
): readonly FeatureCompatRule[] {
  const selections = lintModelSelections(input);
  return FEATURE_COMPAT_RULES.filter(
    (rule) =>
      rule.applies(input) &&
      !selections.some((selection) =>
        rule.satisfied(inputForSelection(input, selection)),
      ),
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
 * A note that the selected models were trained differently, so the advice the
 * panel is showing beside the size and sampling controls follows the first of
 * them. Every recommendation the model reference carries is one model's, and
 * showing two models' figures at once under one control would contradict
 * itself; naming the model the figures belong to is what makes them readable.
 *
 * Silent while the models agree, and while fewer than two of them resolve to a
 * baseline at all: an unknown baseline is not a disagreement.
 */
export function mixedBaselineWarning(
  input: RequestLintInput,
): RequestWarning | null {
  const selections = lintModelSelections(input);
  const baselines = new Set(
    selections
      .map((selection) => selection.baseline)
      .filter((baseline): baseline is string => baseline !== null),
  );
  if (baselines.size < 2) {
    return null;
  }
  const firstSelection = selections.at(0);
  if (!firstSelection) {
    return null;
  }
  return {
    id: 'models_mixed',
    section: 'model',
    anchor: 'model',
    key: 'generate.lint.models_mixed',
    params: { model: firstSelection.name },
  };
}

/** The routing warning, worded for one named worker's own shortfall. */
function namedWorkerLine(
  key: string,
  params: Record<string, string | number>,
): RequestWarning {
  return {
    id: 'named_worker',
    section: 'horde',
    anchor: 'workers',
    key: `generate.lint.${key}`,
    params,
  };
}

/**
 * A worker the request is pinned to that cannot serve it as configured. The
 * horde routes an allow list by worker id and simply waits when nobody on it
 * can take the job, so without this the only symptom is a request that never
 * starts.
 *
 * Only the first such worker is reported, and only in allow mode: a list of
 * workers to avoid makes no claim that any of them can serve the request, and
 * one line per control is what the panel draws. Clearing the named one surfaces
 * the next.
 *
 * Silent wherever it cannot be sure — no worker list fetched, no request built
 * yet — because a false warning against a working request is worse than none.
 */
export function namedWorkerWarning(
  input: RequestLintInput,
): RequestWarning | null {
  const requirement = input.requirement ?? null;
  const workers = input.workers ?? null;
  if (requirement === null || workers === null || requirement.workerBlacklist) {
    return null;
  }
  for (const id of requirement.workers) {
    const worker = workers.find((candidate) => candidate.id === id);
    if (!worker) {
      return namedWorkerLine('worker_unknown', { name: id });
    }
    const shortfall = workerShortfall(worker, requirement);
    if (shortfall === null) {
      continue;
    }
    const name = worker.name;
    if (shortfall === 'size') {
      const side = largestSquareSide(worker.max_pixels ?? 0);
      return side > 0
        ? namedWorkerLine('worker_size', { name, side })
        : namedWorkerLine('worker_size_unknown', { name });
    }
    return namedWorkerLine(`worker_${shortfall}`, { name });
  }
  return null;
}

/**
 * A sampler the horde is not offering. The panel keeps the value and sends it,
 * because a saved draft or a shared link is the reader's and rewriting it under
 * them would change the picture without saying so; the horde is the one that
 * decides, and it may refuse the job. Silent while the sampler is one the
 * select offers, which includes every one the long-standing list names while
 * the contract has not loaded.
 */
export function staleSamplerWarning(
  value: GenerateFormValue,
  contract: SamplerConstraintsDocument | null,
): RequestWarning | null {
  const sampler = value.sampler_name;
  if (!sampler || offeredSamplers(contract).includes(sampler)) {
    return null;
  }
  return {
    id: 'sampler_unavailable',
    section: 'sampling',
    anchor: 'sampler',
    key: 'generate.lint.sampler_unavailable',
    params: { sampler },
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
  // Both of these are about the sampler, and the panel draws one line per
  // field. A sampler nothing is offering outranks a sampler the model would
  // rather not have: the second is advice about the picture, the first is the
  // reason there may be no picture.
  push(
    staleSamplerWarning(value, contract) ??
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
  // A LoRA that suits any one of the selected models is not a mismatch: that
  // model can serve the request. The line shown is the primary's, which is the
  // model the rest of the panel's advice speaks for.
  const loraLines = lintModelSelections(input).map((selection) =>
    loraBaselineWarning(value, selection.baseline),
  );
  push(
    loraLines.length > 0 && loraLines.every((line) => line !== null)
      ? (loraLines.at(0) ?? null)
      : null,
  );
  push(mixedBaselineWarning(input));
  push(namedWorkerWarning(input));

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

// --- Blockers --------------------------------------------------------------
//
// The few things the studio itself cannot send. Unlike the advisory rules above
// these are not judgements about what the horde will accept: a request with no
// prompt, with a number outside the schema's range or with a source mode whose
// picture is missing cannot be built at all. Each one names the control that
// answers it, so pressing Generate with any of them standing says what is
// wrong and offers the way there rather than doing nothing.

/** One reason the studio cannot turn a press of Generate into a request. */
export interface SubmitBlocker {
  anchor: FieldAnchorId;
  /** Transloco key of the row's text. */
  key: string;
  params?: Record<string, string | number>;
}

/** A bounded control holding a value outside the range it validates against. */
export interface InvalidRange {
  field: BoundedFieldName;
  min: number;
  max: number;
}

/** The control each bounded field is reached at. */
const RANGE_FIELD_ANCHORS: Readonly<Record<BoundedFieldName, FieldAnchorId>> = {
  // The batch stepper sits in the submit row beside Generate itself.
  n: 'generate',
  steps: 'steps',
  cfg_scale: 'cfg',
  clip_skip: 'clip_skip',
  denoising_strength: 'denoise',
  facefixer_strength: 'facefixer_strength',
  hires_fix_denoising_strength: 'hires_denoise',
};

/**
 * Where each of the source section's own failures is answered. The section
 * already words them for the line it draws inside itself, so the blocker row
 * shows the same sentence and only has to know where to send the reader.
 */
const SOURCE_MESSAGE_ANCHORS: ReadonlyMap<string, FieldAnchorId> = new Map([
  ['generate.source.error_no_image', 'source' as FieldAnchorId],
  ['generate.source.error_no_control_type', 'control_type'],
  ['generate.source.error_no_room', 'source_mode'],
  ['generate.source.error_no_mask', 'source'],
  ['generate.source.remix_unsupported', 'source_mode'],
]);

/**
 * Everything standing between the request as described and a submit, in the
 * order the panel reads: the prompt at the top, then the numbers, then the
 * picture the mode works from.
 */
export function submitBlockers(input: {
  value: GenerateFormValue;
  /** Controls whose validator failed, with the range it failed against. */
  invalidRanges: readonly InvalidRange[];
  usesSource: boolean;
  /** The source section's failure key, null when the section is valid. */
  sourceMessage: string | null;
  /** The word a row calls a field by, given that field's label key. */
  translate: (key: string) => string;
}): SubmitBlocker[] {
  const blockers: SubmitBlocker[] = [];
  if (input.value.prompt.trim() === '') {
    blockers.push({
      anchor: 'prompt',
      key: 'generate.blockers.prompt_required',
    });
  }
  for (const range of input.invalidRanges) {
    blockers.push({
      anchor: RANGE_FIELD_ANCHORS[range.field],
      key: 'generate.blockers.range',
      params: {
        field: input.translate(settingProseLabelKey(range.field)),
        min: range.min,
        max: range.max,
      },
    });
  }
  if (input.usesSource && input.sourceMessage !== null) {
    blockers.push({
      anchor: SOURCE_MESSAGE_ANCHORS.get(input.sourceMessage) ?? 'source',
      key: input.sourceMessage,
    });
  }
  return blockers;
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
  /** The horde's own sentence, shown when the studio has none of its own. */
  message: string;
  /**
   * The studio's line for this return code, where it has one. The horde writes
   * for every client of the API at once; where the refusal is about a control
   * this page offers, the page can name that control in its own words.
   */
  key?: string;
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
  ['ControlStrengthWithoutControlType', 'control_strength'],
  ['ControlStrengthOutOfRange', 'control_strength'],
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
  if (!anchor) {
    return null;
  }
  const key = hordeRejectionKey(rc);
  return { anchor, message, ...(key ? { key } : {}) };
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
    case 'control_strength':
      return value.control_strength;
    case 'generate':
      return `${value.n}|${value.prompt}`;
    case 'model':
      return [value.model, ...value.extraModels].join('|');
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
