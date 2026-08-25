import { FormControl, FormGroup, Validators } from '@angular/forms';
import {
  ANNOTATION_CONTROL_TYPES,
  ImageControlType,
  ImageGenerationParams,
  ImageGenerationRequest,
  ImageSourceProcessing,
} from '../../types/generation';
import {
  IMAGE_POST_PROCESSORS,
  ImagePostProcessor,
  ImageSamplerName,
  StyleLoraConfig,
  StyleTextualInversionConfig,
} from '../../types/style';
import type { AppliedStyle } from '../../services/horde-styles.service';
import type { ModelRequirements } from '../../services/model-reference.service';
import type { WorkerRequirement } from '../../services/worker-pool.service';
import type { LocalGenerationJob } from '../../types/generation-job';
import type { ActiveModel } from '../../types/active-model';
import {
  MAX_FLOW_SHIFT,
  MIN_FLOW_SHIFT,
  IMAGE_SCHEDULERS,
  SamplerConstraintsDocument,
  SamplerSettingName,
  advisedMaxCfgScale,
  availableSchedulers,
  baselinesSupportFlowShift,
  samplerSettingIsValid,
  samplerWorkFactor,
} from '../../types/sampler-constraints';
import {
  activeLoras,
  activeTis,
  coerceLoraSelection,
  coerceTiSelection,
  DEFAULT_LORA_STRENGTH,
} from '../../types/civitai-asset';
export type { TiInjectTarget } from '../../types/civitai-asset';
export {
  activeLoras,
  activeTis,
  DEFAULT_LORA_STRENGTH,
  HORDE_MAX_LORAS,
  HORDE_MAX_TIS,
  MAX_LORA_STRENGTH,
  MIN_LORA_STRENGTH,
  TI_INJECT_TARGETS,
} from '../../types/civitai-asset';
import type { LoraSelection, TiSelection } from '../../types/civitai-asset';

/** The studio's names for the shared selection shapes. */
export type FormLoraEntry = LoraSelection;
export type FormTiEntry = TiSelection;
import type { ImageSchedulerName } from '../../types/sampler-constraints';

/**
 * The samplers AI Horde accepts, in the display order used by the form.
 */
export const SAMPLERS: readonly ImageSamplerName[] = [
  'k_euler',
  'k_euler_a',
  'k_dpm_2',
  'k_dpm_2_a',
  'k_dpmpp_2m',
  'k_dpmpp_2s_a',
  'k_dpmpp_sde',
  'k_heun',
  'k_lms',
  'DDIM',
  'dpmsolver',
  'lcm',
];

/**
 * Every post-processor a request may carry. The horde decides which of them a
 * worker can run, so the form offers the whole vocabulary.
 */
export const POST_PROCESSORS: readonly ImagePostProcessor[] =
  IMAGE_POST_PROCESSORS;

/**
 * Upscaler post-processors offered as a single-choice "Upscale" control.
 * Picking one replaces any other upscaler in the `post_processing` array so at
 * most one runs. The long-standing ones come first, then the newer models.
 */
export const UPSCALERS: readonly ImagePostProcessor[] = [
  'RealESRGAN_x4plus',
  'RealESRGAN_x2plus',
  'RealESRGAN_x4plus_anime_6B',
  'NMKD_Siax',
  '4x_AnimeSharp',
  '4xNomos8kSC',
  '4xLSDIRplus',
  '4xNomosWebPhoto_RealPLKSR',
  '4xNomos2_realplksr_dysample',
  '4xNomos2_hq_dat2',
  '2xModernSpanimationV1',
];

/**
 * Face-fixer post-processors offered as a single-choice control. Selecting one
 * makes `facefixer_strength` meaningful (see {@link buildImageRequest}).
 */
export const FACE_FIXERS: readonly ImagePostProcessor[] = [
  'GFPGAN',
  'GFPGANv1.3',
  'CodeFormers',
  'RestoreFormer',
];

/** The background-strip post-processor, toggled independently of the above. */
export const STRIP_BACKGROUND: ImagePostProcessor = 'strip_background';

export const MIN_DIMENSION = 64;
export const MAX_DIMENSION = 3072;
export const DIMENSION_STEP = 64;
export const MIN_BATCH = 1;
export const MAX_BATCH = 10;

/**
 * The horde takes up to twenty images in one request. The stepper stops at
 * {@link MAX_BATCH}, a queue's worth of pictures being enough to ask for at
 * once, but a batch that arrives from a shared request or a style is kept as
 * long as the horde would take it.
 */
export const MAX_API_BATCH = 20;

/**
 * Two ranges govern each sampling number: what the horde will accept, and what
 * a slider can usefully offer. The `MIN_`/`MAX_` pair is the schema's own bound
 * and is what the control validates against, so anything the horde would take
 * can be typed. The `_SLIDER_` pair is where the travel is worth spending: a
 * steps slider stretched over the whole legal range makes the counts anyone
 * actually renders at indistinguishable from each other. A typed value past the
 * slider's end leaves the thumb parked there and is kept as typed.
 */
export const MIN_STEPS = 1;
export const MAX_STEPS = 500;
export const STEPS_SLIDER_MIN = 1;
export const STEPS_SLIDER_MAX = 50;

export const MIN_CFG_SCALE = 0;
export const MAX_CFG_SCALE = 100;
export const CFG_STEP = 0.5;
export const CFG_SLIDER_MIN = 1;
export const CFG_SLIDER_MAX = 30;

export const MIN_CLIP_SKIP = 1;
export const MAX_CLIP_SKIP = 12;

/**
 * How a source image is used, if one is attached. `none` is plain txt2img.
 * `controlnet` reuses the horde's `img2img` source-processing with a
 * `control_type` set; `inpainting` additionally carries a paint mask; `remix`
 * blends the source with a handful of extra source images and is only served by
 * Stable Cascade models.
 */
export const SOURCE_MODES = [
  'none',
  'img2img',
  'controlnet',
  'inpainting',
  'remix',
] as const;
export type GenerateSourceMode = (typeof SOURCE_MODES)[number];

/**
 * Where the attached picture sits inside the canvas an outpainting request asks
 * for. The padding falls out of the arithmetic: whatever the requested size has
 * that the picture does not, on the sides the anchor does not hold it against.
 */
export const OUTPAINT_ANCHORS = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;
export type GenerateOutpaintAnchor = (typeof OUTPAINT_ANCHORS)[number];

/**
 * The ControlNet guidance modes every worker that offers ControlNet at all can
 * render, in the order the horde enumerates them. `hough` is the older spelling
 * of the line detector the wider vocabulary calls `mlsd`, and is the spelling an
 * older worker understands.
 */
export const LEGACY_CONTROL_TYPES: readonly ImageControlType[] = [
  'canny',
  'hed',
  'depth',
  'normal',
  'openpose',
  'seg',
  'scribble',
  'fakescribbles',
  'hough',
];

/**
 * The rest of the detector vocabulary. A worker only serves these with a recent
 * bridge and the extended-ControlNet opt-in switched on, so a request using one
 * reaches a smaller pool and can wait longer. They are offered separately for
 * that reason rather than because the horde treats them differently.
 */
export const EXTENDED_CONTROL_TYPES: readonly ImageControlType[] =
  ANNOTATION_CONTROL_TYPES.filter(
    (type) => !LEGACY_CONTROL_TYPES.includes(type),
  );

/** The ControlNet guidance modes offered in the source-image section. */
export const CONTROL_TYPES: readonly ImageControlType[] = [
  ...LEGACY_CONTROL_TYPES,
  ...EXTENDED_CONTROL_TYPES,
];

/**
 * How hard a control map holds the render. The horde takes 0.01 to 3 and only
 * beside a control type; a request that leaves it out is rendered at the
 * worker's own default of 1, which is why the panel starts unset.
 */
export const MIN_CONTROL_STRENGTH = 0.01;
export const MAX_CONTROL_STRENGTH = 3;
export const CONTROL_STRENGTH_STEP = 0.01;
/** What the slider is seeded with, matching the default it stands in for. */
export const DEFAULT_CONTROL_STRENGTH = 1;

export const MIN_DENOISE = 0.01;
export const MAX_DENOISE = 1;
export const DENOISE_STEP = 0.01;
export const DEFAULT_DENOISE = 0.75;

/**
 * How wide the control panel is expanded, to trade horizontal space for less
 * vertical scrolling. `normal` is the single-column panel; `double` widens it
 * and reflows settings into two columns (results stays); `full` fills the width
 * with a multi-column panel and hides the results pane. UI-only, never sent.
 */
export const PANEL_SIZES = ['normal', 'double', 'full'] as const;
export type PanelSize = (typeof PANEL_SIZES)[number];

/**
 * Advance the panel one width step, wrapping `full` back to `normal`. Backs the
 * single expand/collapse toggle: each click widens a step, and the last step
 * (`full`) collapses all the way back to `normal`.
 */
export function cyclePanelSize(size: PanelSize): PanelSize {
  const index = PANEL_SIZES.indexOf(size);
  return PANEL_SIZES[(index + 1) % PANEL_SIZES.length];
}

/**
 * How far along its travel a range input sits, as a percentage. Blink and
 * WebKit paint no progress pseudo-element, so the studio's slider draws its
 * filled portion from a gradient stop the template feeds with this value.
 */
export function rangeFillPercent(
  value: number | string | null,
  min: number,
  max: number,
): number {
  const span = max - min;
  if (span <= 0) {
    return 0;
  }
  const at =
    ((typeof value === 'string' ? +value : (value ?? min)) - min) / span;
  return Math.min(100, Math.max(0, at * 100));
}

export const MIN_FACEFIXER_STRENGTH = 0;
export const MAX_FACEFIXER_STRENGTH = 1;
export const DEFAULT_FACEFIXER_STRENGTH = 0.75;

export const MIN_SEED_VARIATION = 1;
export const MAX_SEED_VARIATION = 1000;

/**
 * Blend weight of one remix extra source image. The horde schema documents no
 * bounds beyond a default of 1, so the slider is capped at that default and
 * floored just above zero, where the image would stop contributing.
 */
export const MIN_EXTRA_SOURCE_STRENGTH = 0.05;
export const MAX_EXTRA_SOURCE_STRENGTH = 1;
export const EXTRA_SOURCE_STRENGTH_STEP = 0.05;
export const DEFAULT_EXTRA_SOURCE_STRENGTH = 1;

/** The horde services at most this many named workers per request. */
export const MAX_WORKERS = 5;

/**
 * How many models one request may name. The horde's own bound on `models` is
 * not published, so this is the studio's: past a handful the request stops
 * being "any of these similar models" and the reader can no longer tell which
 * one drew the picture.
 */
export const MAX_REQUEST_MODELS = 5;

/** Schema bounds on the webhook URL the horde POSTs each generation to. */
export const MIN_WEBHOOK_LENGTH = 10;
export const MAX_WEBHOOK_LENGTH = 1024;

const WEBHOOK_PATTERN = /^https?:\/\/\S+$/i;

/**
 * Whether a webhook string is one the horde will accept: an http(s) URL within
 * the schema's length bounds. A malformed webhook fails the horde's validation
 * and rejects the whole request, so {@link buildImageRequest} drops anything
 * this rejects; the form's inline hint reads the same predicate so the two can
 * never drift apart.
 */
export function isValidWebhook(webhook: string): boolean {
  const trimmed = webhook.trim();
  return (
    trimmed.length >= MIN_WEBHOOK_LENGTH &&
    trimmed.length <= MAX_WEBHOOK_LENGTH &&
    WEBHOOK_PATTERN.test(trimmed)
  );
}

/** The `extra_texts` reference the `qr_code` workflow reads its payload from. */
export const QR_CODE_TEXT_REFERENCE = 'qr_code';

/**
 * The further `extra_texts` references the `qr_code` workflow reads its layout
 * from. The offsets place the code's top-left corner in the frame; left unset,
 * the workflow centres it.
 */
export const QR_X_OFFSET_REFERENCE = 'x_offset';
export const QR_Y_OFFSET_REFERENCE = 'y_offset';
export const QR_MODULE_DRAWER_REFERENCE = 'module_drawer';

/**
 * How the code's modules are drawn before the picture is grown over them. These
 * are the renderer's own names for the six shapes it accepts; anything else is
 * dropped on the worker, so the panel offers this set and nothing wider.
 */
export const QR_MODULE_DRAWERS = [
  'Square',
  'Gapped square',
  'Circle',
  'Rounded',
  'Vertical bars',
  'Horizontal bars',
] as const;
export type QrModuleDrawer = (typeof QR_MODULE_DRAWERS)[number];

/** A QR offset the worker accepts: a whole number of pixels, never negative. */
const QR_OFFSET_PATTERN = /^\d+$/;

/** The offset as the request should carry it, or null when it is unset or unusable. */
export function qrOffsetText(raw: string): string | null {
  const trimmed = raw.trim();
  return QR_OFFSET_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * The drawer name the panel holds, read out of whatever a request carries. The
 * worker matches the name case-insensitively, so a request written by hand with
 * a lowercase name is the same choice and reads back as the same option.
 */
export function drawerNameFor(raw: string | null): QrModuleDrawer | null {
  const name = raw?.trim().toLowerCase();
  return (
    QR_MODULE_DRAWERS.find((drawer) => drawer.toLowerCase() === name) ?? null
  );
}

export const MIN_HIRES_DENOISE = 0.01;
export const MAX_HIRES_DENOISE = 1;
export const DEFAULT_HIRES_DENOISE = 0.65;

/**
 * Total-pixel budget above which the form warns that the request may be slow or
 * rejected by workers. Chosen to sit above the common SDXL 1024x1024 baseline so
 * ordinary requests do not trip it.
 */
export const PIXEL_WARN_THRESHOLD = 1536 * 1536;

/** The base resolution family a set of aspect presets is scaled to. */
export type ModelSizeBase = 512 | 768 | 1024 | 1536;

/** The family a model belongs to, before the hires pass lifts it. */
export type ModelSizeFamily = 512 | 768 | 1024;

export interface AspectPreset {
  /** Transloco key for the preset button label. */
  labelKey: string;
  width: number;
  height: number;
}

/**
 * The shapes each family is offered in. Every preset is square or wide, and the
 * swap control turns a chosen shape on its side, so a reader picks a shape once
 * and an orientation once instead of reading a list of both.
 *
 * The 512 and 768 families stop at 16:9. Models trained that small stack a
 * second subject into the spare width at 21:9 rather than framing one subject
 * wider, and the shapes they do offer are the ones the 1024 family also offers,
 * so lifting one family to the next always lands on the same shape.
 *
 * The 1536 family is what a 1024 model is offered while the hires pass is on.
 * Its widest shape stays inside {@link PIXEL_WARN_THRESHOLD}, so choosing a
 * preset never trips the panel's own budget warning.
 */
const ASPECT_PRESETS: Record<ModelSizeBase, readonly AspectPreset[]> = {
  512: [
    { labelKey: 'generate.aspect.square', width: 512, height: 512 },
    { labelKey: 'generate.aspect.landscape_4_3', width: 704, height: 512 },
    { labelKey: 'generate.aspect.landscape_3_2', width: 768, height: 512 },
    { labelKey: 'generate.aspect.landscape_16_9', width: 896, height: 512 },
  ],
  768: [
    { labelKey: 'generate.aspect.square', width: 768, height: 768 },
    { labelKey: 'generate.aspect.landscape_4_3', width: 1024, height: 768 },
    { labelKey: 'generate.aspect.landscape_3_2', width: 1152, height: 768 },
    { labelKey: 'generate.aspect.landscape_16_9', width: 1344, height: 768 },
  ],
  1024: [
    { labelKey: 'generate.aspect.square', width: 1024, height: 1024 },
    { labelKey: 'generate.aspect.landscape_4_3', width: 1152, height: 896 },
    { labelKey: 'generate.aspect.landscape_3_2', width: 1216, height: 832 },
    { labelKey: 'generate.aspect.landscape_16_9', width: 1344, height: 768 },
    { labelKey: 'generate.aspect.landscape_2_1', width: 1408, height: 704 },
    { labelKey: 'generate.aspect.landscape_21_9', width: 1536, height: 640 },
  ],
  1536: [
    { labelKey: 'generate.aspect.square', width: 1536, height: 1536 },
    { labelKey: 'generate.aspect.landscape_4_3', width: 1728, height: 1344 },
    { labelKey: 'generate.aspect.landscape_3_2', width: 1792, height: 1216 },
    { labelKey: 'generate.aspect.landscape_16_9', width: 2048, height: 1152 },
    { labelKey: 'generate.aspect.landscape_2_1', width: 2048, height: 1024 },
    { labelKey: 'generate.aspect.landscape_21_9', width: 2304, height: 960 },
  ],
};

const ASPECT_BASES: readonly ModelSizeBase[] = [512, 768, 1024, 1536];

export function buildAspectPresets(
  base: ModelSizeBase,
): readonly AspectPreset[] {
  return ASPECT_PRESETS[base];
}

/** The preset of `base` that `width`x`height` is, either way round. */
function presetOfBase(
  base: ModelSizeBase,
  width: number,
  height: number,
): AspectPreset | null {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  return (
    ASPECT_PRESETS[base].find(
      (preset) => preset.width === long && preset.height === short,
    ) ?? null
  );
}

/**
 * The same shape in the `base` family, when `width`x`height` is a shape some
 * family offers and `base` offers it at another size. Null for a size nothing
 * offers: a custom size is the reader's own and is never moved.
 *
 * Orientation is kept, so a picture set on its side stays on its side.
 */
export function rescalePresetToBase(
  width: number,
  height: number,
  base: ModelSizeBase,
): { width: number; height: number } | null {
  const portrait = height > width;
  for (const family of ASPECT_BASES) {
    const current = presetOfBase(family, width, height);
    if (current === null) {
      continue;
    }
    const target = ASPECT_PRESETS[base].find(
      (preset) => preset.labelKey === current.labelKey,
    );
    if (!target || target === current) {
      return null;
    }
    return portrait
      ? { width: target.height, height: target.width }
      : { width: target.width, height: target.height };
  }
  return null;
}

// --- Model recommendations ------------------------------------------------

/** The normalised baseline whose models want a hires pass above 768px. */
export const SD15_BASELINE = 'stable_diffusion_1';

/** Native square resolution per normalised baseline; everything else is 1024. */
const BASELINE_NATIVE_SQUARES: Readonly<Record<string, number>> = {
  stable_diffusion_1: 512,
  stable_diffusion_2: 768,
};

const DEFAULT_NATIVE_SQUARE = 1024;

/**
 * The square resolution `baseline`'s models were trained at, or null when no
 * baseline is known (no model picked, or the reference has not loaded). A
 * baseline the table does not name is assumed modern, so a newly published
 * family reads as 1024 rather than dropping the guidance entirely.
 */
export function nativeSquareFor(baseline: string | null): number | null {
  if (baseline === null) {
    return null;
  }
  return BASELINE_NATIVE_SQUARES[baseline] ?? DEFAULT_NATIVE_SQUARE;
}

/** The family `baseline`'s models belong to, or null when unknown. */
export function sizeFamilyFor(baseline: string | null): ModelSizeFamily | null {
  const native = nativeSquareFor(baseline);
  if (native === null) {
    return null;
  }
  if (native <= 512) {
    return 512;
  }
  return native <= 768 ? 768 : 1024;
}

/**
 * The family above `family`, which is what the hires pass is for: it draws at
 * the trained size and enlarges, so the sizes worth asking for while it is on
 * are the ones above what the model draws natively. The two small families
 * share a target: 1024 is already past what either holds in a single pass.
 */
export function liftSizeBase(
  family: ModelSizeFamily,
  hiresFix: boolean,
): ModelSizeBase {
  if (!hiresFix) {
    return family;
  }
  return family === 1024 ? 1536 : 1024;
}

/** The aspect-preset family to offer for `baseline`, or null when unknown. */
export function sizeBaseFor(
  baseline: string | null,
  hiresFix: boolean,
): ModelSizeBase | null {
  const family = sizeFamilyFor(baseline);
  return family === null ? null : liftSizeBase(family, hiresFix);
}

/**
 * Square resolutions the model-driven size snap is allowed to overwrite: the
 * native square of every baseline family, which includes the form's own default.
 * Anything else is a size the user (or a loaded preset) chose deliberately.
 */
const SNAPPABLE_SQUARES: readonly number[] = [512, 768, 1024];

/**
 * Whether the dimensions still look untouched, so switching model may snap them
 * to the new baseline's native square. Only a square from
 * {@link SNAPPABLE_SQUARES} qualifies: every aspect preset and every custom size
 * is left alone, which keeps the snap from ever discarding a deliberate choice.
 */
export function isSnappableSize(width: number, height: number): boolean {
  return width === height && SNAPPABLE_SQUARES.includes(width);
}

/**
 * How far the shorter side may sit from the native square before the size reads
 * as belonging to another baseline family. The bounds are asymmetric because a
 * wide shape shrinks the shorter side but never grows it, while a size carried
 * over from a larger family overshoots it outright.
 */
const NATIVE_SIZE_MIN_RATIO = 0.75;
const NATIVE_SIZE_MAX_RATIO = 1.5;

/**
 * Whether `width`x`height` reads as belonging to the `native` square's family.
 *
 * A shape the family itself offers always does, either way round. The widest of
 * them cut the shorter side past what the ratio band would allow, and a size the
 * panel put there on the reader's press must not then be read back as belonging
 * to another family.
 */
export function sizeSuitsNativeSquare(
  native: number,
  width: number,
  height: number,
): boolean {
  if (
    ASPECT_PRESETS[native as ModelSizeBase] !== undefined &&
    presetOfBase(native as ModelSizeBase, width, height) !== null
  ) {
    return true;
  }
  const shortest = Math.min(width, height);
  return (
    shortest >= native * NATIVE_SIZE_MIN_RATIO &&
    shortest <= native * NATIVE_SIZE_MAX_RATIO
  );
}

/** Above this on either side an SD 1.5 model wants a hires pass to stay coherent. */
export const HIRES_WARN_DIMENSION = 768;

const REQUIREMENT_KEY_PREFIX = 'generate.form.requirement.';

/** The scheduler token the legacy `karras` boolean stands for. */
const KARRAS_SCHEDULER = 'karras';

/**
 * The two schedules that predate the `scheduler` field. A request naming one of
 * them carries the legacy boolean too, so a worker that reads only `karras`
 * still renders the schedule that was asked for.
 */
export const LEGACY_SCHEDULERS: readonly ImageSchedulerName[] = [
  'karras',
  'normal',
];

/**
 * One line of advice under a control. `violated` is true when the form's current
 * value contradicts the advice, which only changes how the line reads: the horde
 * accepts the request either way and nothing here blocks a submission.
 */
export interface RequirementHint {
  /** Transloco key for the line's text. */
  key: string;
  /** Interpolation params for {@link RequirementHint.key}. */
  params: Record<string, string | number>;
  violated: boolean;
}

function hint(
  suffix: string,
  params: Record<string, string | number>,
  violated: boolean,
): RequirementHint {
  return { key: `${REQUIREMENT_KEY_PREFIX}${suffix}`, params, violated };
}

/**
 * Advice on a value bounded by an optional `min`/`max` pair, as the reference
 * spells step and CFG ranges. Either end may stand alone.
 */
function rangeHint(
  suffix: string,
  min: number | undefined,
  max: number | undefined,
  value: number,
): RequirementHint | null {
  if (min !== undefined && max !== undefined) {
    return hint(`${suffix}_range`, { min, max }, value < min || value > max);
  }
  if (min !== undefined) {
    return hint(`${suffix}_min`, { min }, value < min);
  }
  if (max !== undefined) {
    return hint(`${suffix}_max`, { max }, value > max);
  }
  return null;
}

export function stepsRequirementHint(
  requirements: ModelRequirements | null,
  steps: number,
): RequirementHint | null {
  return rangeHint(
    'steps',
    requirements?.min_steps,
    requirements?.max_steps,
    steps,
  );
}

/**
 * The step count past which a sampler that charges more than the ordinary rate
 * per step is worth a word. Below it the extra work is small enough that the
 * cost line beside the sampler name says everything there is to say.
 */
export const STEP_COST_NOTICE_STEPS = 20;

/**
 * What a costly sampler is charging for the steps asked of it. `fixed_rate`
 * samplers multiply every step, so a modest count already buys the work of a
 * much larger one; an adaptive sampler ignores the count altogether. Advice
 * only: the horde runs the request as asked either way.
 */
export function samplerStepCostHint(
  contract: SamplerConstraintsDocument | null,
  sampler: string,
  steps: number,
): RequirementHint | null {
  if (steps <= STEP_COST_NOTICE_STEPS) {
    return null;
  }
  const work = samplerWorkFactor(contract, sampler);
  if (work === null) {
    return null;
  }
  if (work === 'adaptive') {
    return hint('steps_adaptive', { sampler }, true);
  }
  return hint(
    'steps_work',
    {
      sampler,
      factor: work,
      steps: STEP_COST_NOTICE_STEPS,
      equivalent: Math.round(STEP_COST_NOTICE_STEPS * work),
    },
    true,
  );
}

/** The highest CLIP skip models are ordinarily trained for. */
export const COMMON_MAX_CLIP_SKIP = 2;

/**
 * A note that the CLIP skip sits above what models are trained for. Separate
 * from {@link clipSkipRequirementHint}, which speaks for a model that names an
 * exact value; this one holds for any model, including none.
 */
export function clipSkipRangeHint(clipSkip: number): RequirementHint | null {
  if (clipSkip <= COMMON_MAX_CLIP_SKIP) {
    return null;
  }
  return hint('clip_skip_high', {}, true);
}

/**
 * CFG advice. An exact `cfg_scale` wins over the range, which a record may carry
 * alongside it; the exact value is the tighter statement of the same intent.
 */
export function cfgRequirementHint(
  requirements: ModelRequirements | null,
  cfg: number,
): RequirementHint | null {
  const exact = requirements?.cfg_scale;
  if (exact !== undefined) {
    return hint('cfg_exact', { value: exact }, cfg !== exact);
  }
  return rangeHint(
    'cfg',
    requirements?.min_cfg_scale,
    requirements?.max_cfg_scale,
    cfg,
  );
}

export function clipSkipRequirementHint(
  requirements: ModelRequirements | null,
  clipSkip: number,
): RequirementHint | null {
  const exact = requirements?.clip_skip;
  if (exact === undefined) {
    return null;
  }
  return hint('clip_skip_exact', { value: exact }, clipSkip !== exact);
}

/** The `sampler_name` values a model suggests; empty when it suggests none. */
export function suggestedSamplers(
  requirements: ModelRequirements | null,
): readonly string[] {
  return requirements?.samplers ?? [];
}

export function samplerRequirementHint(
  requirements: ModelRequirements | null,
  sampler: string,
): RequirementHint | null {
  const samplers = suggestedSamplers(requirements);
  if (samplers.length === 0) {
    return null;
  }
  return hint(
    'samplers',
    { list: samplers.join(', ') },
    !samplers.includes(sampler),
  );
}

/**
 * Guidance advice for a sampler that folds the guidance step into its own
 * update. Those samplers want guidance around a couple rather than the seven or
 * eight the rest are set to, and the horde publishes the ceiling as advice: a
 * request above it is accepted, dispatched and rendered burnt.
 */
export function cfgPlusPlusHint(
  contract: SamplerConstraintsDocument | null,
  sampler: string,
  cfgScale: number,
): RequirementHint | null {
  const advised = advisedMaxCfgScale(contract, sampler);
  if (advised === null) {
    return null;
  }
  return hint('cfg_pp', { max: advised }, cfgScale > advised);
}

/** The scheduler names a model suggests, lowercased; empty when it names none. */
export function suggestedSchedulers(
  requirements: ModelRequirements | null,
): readonly string[] {
  return (requirements?.schedulers ?? []).map((scheduler) =>
    scheduler.trim().toLowerCase(),
  );
}

/**
 * Karras advice, read off the suggested schedulers. Absent schedulers say
 * nothing either way, so no line is shown; a list that names some other
 * scheduler is a positive statement that karras is not wanted.
 *
 * The model reference speaks of whole schedules, so this only phrases itself as
 * karras advice while the chosen schedule is one of the legacy pair. Any other
 * schedule is covered by {@link schedulerRequirementHint}, which names the
 * suggested list outright rather than reducing it to on or off.
 */
export function karrasRequirementHint(
  requirements: ModelRequirements | null,
  scheduler: ImageSchedulerName,
): RequirementHint | null {
  const schedulers = suggestedSchedulers(requirements);
  if (schedulers.length === 0 || !LEGACY_SCHEDULERS.includes(scheduler)) {
    return null;
  }
  const suggested = schedulers.includes(KARRAS_SCHEDULER);
  return hint(
    suggested ? 'karras_on' : 'karras_off',
    {},
    (scheduler === KARRAS_SCHEDULER) !== suggested,
  );
}

/**
 * Scheduler advice for the schedule select, naming the whole suggested list as
 * the model reference states it.
 */
export function schedulerRequirementHint(
  requirements: ModelRequirements | null,
  scheduler: ImageSchedulerName,
): RequirementHint | null {
  const schedulers = suggestedSchedulers(requirements);
  if (schedulers.length === 0) {
    return null;
  }
  return hint(
    'schedulers',
    { list: schedulers.join(', ') },
    !schedulers.includes(scheduler),
  );
}

/**
 * A note that the dimensions sit outside the selected baseline's family. Purely
 * informational: off-native sizes generate fine, they just drift from what the
 * model was trained on.
 */
export function nativeSizeHint(
  baseline: string | null,
  width: number,
  height: number,
  hiresFix: boolean,
): RequirementHint | null {
  const native = nativeSquareFor(baseline);
  if (native === null || sizeSuitsNativeSquare(native, width, height)) {
    return null;
  }
  // While the hires pass is on, the panel offers the family above the model's
  // own and drawing above native is the point, so its shapes are not drift.
  const family = sizeFamilyFor(baseline);
  if (
    hiresFix &&
    family !== null &&
    presetOfBase(liftSizeBase(family, true), width, height) !== null
  ) {
    return null;
  }
  return hint('native_size', { size: `${native}×${native}` }, false);
}

/**
 * The SD 1.5 high-resolution warning: past {@link HIRES_WARN_DIMENSION} those
 * models repeat and duplicate subjects unless the hires pass is on.
 */
export function sd15HiresHint(
  baseline: string | null,
  width: number,
  height: number,
  hiresFix: boolean,
): RequirementHint | null {
  if (baseline !== SD15_BASELINE || hiresFix) {
    return null;
  }
  if (width <= HIRES_WARN_DIMENSION && height <= HIRES_WARN_DIMENSION) {
    return null;
  }
  return hint('sd15_hires', {}, true);
}

/**
 * How far above its native square a small-format model may be asked to draw
 * before the hires pass earns its second render.
 */
const HIRES_USEFUL_RATIO = 1.25;

/** The pixel count a 1024-class model reaches before the same is true of it. */
const HIRES_USEFUL_PIXELS = 1024 * 1024;

/**
 * A note that the hires pass is on at a size it does nothing for. The pass
 * renders twice, so paying for it to enlarge a picture to roughly the size the
 * model draws natively is cost without a result.
 *
 * The two families are measured differently because the smaller one is asked
 * for portrait and landscape crops of its square far more often, where a rule
 * on total pixels would call a tall 512x768 native and a wide one oversized.
 */
export function hiresUnneededHint(
  baseline: string | null,
  width: number,
  height: number,
  hiresFix: boolean,
): RequirementHint | null {
  const native = nativeSquareFor(baseline);
  if (!hiresFix || native === null) {
    return null;
  }
  const enlarging =
    native <= HIRES_WARN_DIMENSION
      ? width > native * HIRES_USEFUL_RATIO ||
        height > native * HIRES_USEFUL_RATIO
      : width * height >= HIRES_USEFUL_PIXELS;
  return enlarging ? null : hint('hires_unneeded', {}, true);
}

/**
 * A warning that the request asks for more pixels than the horde's ordinary
 * allowance covers. Worded as an advisory line so it can take its turn under
 * the size controls alongside the model's own advice.
 */
export function pixelBudgetHint(
  width: number,
  height: number,
): RequirementHint | null {
  if (width * height <= PIXEL_WARN_THRESHOLD) {
    return null;
  }
  return { key: 'generate.form.pixel_warning', params: {}, violated: true };
}

/**
 * Pick the one line a field shows from the advice that could apply to it.
 *
 * Two lines under one control read as two problems, so a field speaks once. A
 * contradicted value is always the more useful thing to say, so the first
 * violated candidate wins; failing that the first candidate that exists at all,
 * which is how a field with nothing wrong still carries its model's advice.
 */
export function firstAdvisory(
  candidates: readonly (RequirementHint | null)[],
): RequirementHint | null {
  return (
    candidates.find((candidate) => candidate?.violated) ??
    candidates.find((candidate) => candidate !== null) ??
    null
  );
}

/** The single line under the step count. */
export function stepsAdvisory(
  requirements: ModelRequirements | null,
  contract: SamplerConstraintsDocument | null,
  sampler: string,
  steps: number,
): RequirementHint | null {
  return firstAdvisory([
    stepsRequirementHint(requirements, steps),
    samplerStepCostHint(contract, sampler, steps),
  ]);
}

/** The single line under the guidance scale. */
export function cfgAdvisory(
  requirements: ModelRequirements | null,
  contract: SamplerConstraintsDocument | null,
  sampler: string,
  cfgScale: number,
): RequirementHint | null {
  return firstAdvisory([
    cfgRequirementHint(requirements, cfgScale),
    cfgPlusPlusHint(contract, sampler, cfgScale),
  ]);
}

/** The single line under the CLIP skip slider. */
export function clipSkipAdvisory(
  requirements: ModelRequirements | null,
  clipSkip: number,
): RequirementHint | null {
  return firstAdvisory([
    clipSkipRequirementHint(requirements, clipSkip),
    clipSkipRangeHint(clipSkip),
  ]);
}

/**
 * The single line under the schedule select. A horde that publishes a sampler
 * contract offers whole schedules, so the advice names the suggested list; one
 * that does not offers the legacy pair, where the same advice reduces to
 * whether karras is wanted.
 */
export function scheduleAdvisory(
  requirements: ModelRequirements | null,
  contract: SamplerConstraintsDocument | null,
  scheduler: ImageSchedulerName,
): RequirementHint | null {
  return contract
    ? schedulerRequirementHint(requirements, scheduler)
    : karrasRequirementHint(requirements, scheduler);
}

/** The single line under the size controls. */
export function sizeAdvisory(
  baseline: string | null,
  width: number,
  height: number,
  hiresFix: boolean,
): RequirementHint | null {
  return firstAdvisory([
    pixelBudgetHint(width, height),
    sd15HiresHint(baseline, width, height, hiresFix),
    nativeSizeHint(baseline, width, height, hiresFix),
  ]);
}

/** The settings a model's own recommendations would change, and to what. */
export interface SuggestedSettings {
  sampler_name?: string;
  scheduler?: ImageSchedulerName;
  steps?: number;
  cfg_scale?: number;
  clip_skip?: number;
}

/** What the form currently holds of the settings a model can recommend. */
export type SuggestedSettingsSubject = Pick<
  GenerateFormValue,
  'sampler_name' | 'scheduler' | 'steps' | 'cfg_scale' | 'clip_skip'
>;

/** The choices the panel is actually offering, so a suggestion is selectable. */
export interface SuggestedSettingsOffer {
  samplers: readonly string[];
  schedulers: readonly ImageSchedulerName[];
}

/**
 * Everything the selected model recommends that the form is not already doing.
 *
 * Only differences are returned, so an empty result is the statement that the
 * request already matches the model's advice and there is nothing to offer. A
 * recommendation the panel cannot select (a sampler this horde does not run, a
 * schedule refused for this sampler) is left out rather than written into a
 * control that would show it blank.
 */
export function suggestedSettings(
  requirements: ModelRequirements | null,
  offer: SuggestedSettingsOffer,
  current: SuggestedSettingsSubject,
): SuggestedSettings {
  const changes: SuggestedSettings = {};
  if (!requirements) {
    return changes;
  }

  const samplers = suggestedSamplers(requirements);
  if (samplers.length > 0 && !samplers.includes(current.sampler_name)) {
    const sampler = samplers.find((name) => offer.samplers.includes(name));
    if (sampler !== undefined) {
      changes.sampler_name = sampler;
    }
  }

  const schedulers = suggestedSchedulers(requirements);
  if (schedulers.length > 0 && !schedulers.includes(current.scheduler)) {
    const scheduler = offer.schedulers.find((name) =>
      schedulers.includes(name),
    );
    if (scheduler !== undefined) {
      changes.scheduler = scheduler;
    }
  }

  const steps = clampToRange(
    current.steps,
    requirements.min_steps,
    requirements.max_steps,
  );
  if (steps !== current.steps) {
    changes.steps = steps;
  }

  const cfg = suggestedCfgScale(requirements, current.cfg_scale);
  if (cfg !== current.cfg_scale) {
    changes.cfg_scale = cfg;
  }

  if (
    requirements.clip_skip !== undefined &&
    requirements.clip_skip !== current.clip_skip
  ) {
    changes.clip_skip = requirements.clip_skip;
  }

  return changes;
}

/** How many settings {@link suggestedSettings} would change. */
export function suggestedSettingsCount(changes: SuggestedSettings): number {
  return Object.keys(changes).length;
}

function clampToRange(
  value: number,
  min: number | undefined,
  max: number | undefined,
): number {
  if (min !== undefined && value < min) {
    return min;
  }
  if (max !== undefined && value > max) {
    return max;
  }
  return value;
}

/**
 * The guidance the model asks for: its exact figure where it names one, and
 * otherwise the middle of the range it names, which is the only single value a
 * pair of bounds recommends.
 */
function suggestedCfgScale(
  requirements: ModelRequirements,
  current: number,
): number {
  if (requirements.cfg_scale !== undefined) {
    return requirements.cfg_scale;
  }
  const { min_cfg_scale: min, max_cfg_scale: max } = requirements;
  if (
    min !== undefined &&
    max !== undefined &&
    (current < min || current > max)
  ) {
    return Math.round(((min + max) / 2) * 2) / 2;
  }
  return clampToRange(current, min, max);
}

/** A style category paired with the style names under it, for the picker. */
export interface StylePickerGroup {
  category: string;
  names: string[];
}

/** The groups of form controls a style can pin, each lockable as a unit. */
export const STYLE_LOCK_SECTIONS = ['model', 'dimensions', 'sampling'] as const;

export type StyleLockSection = (typeof STYLE_LOCK_SECTIONS)[number];

/**
 * Which sections the user has taken back from the selected style. `style` names
 * the style the detachments were made against, so switching style (or clearing
 * it) makes them inert without any coordinated reset: a detachment only counts
 * while `style` still matches the form's `styleName`.
 */
export interface StyleDetachState {
  style: string;
  sections: StyleLockSection[];
}

/**
 * Flat, serialisable snapshot of the form. This is what is persisted to local
 * storage and what {@link buildImageRequest} maps into a horde request.
 */
export interface GenerateFormValue {
  /** Selected style-preset name; '' means no style. */
  styleName: string;
  /** Sections the user opted out of the style for; see {@link StyleDetachState}. */
  styleDetach: StyleDetachState;
  prompt: string;
  negativePrompt: string;
  n: number;
  /** A single model name, or an empty string for "any model". */
  model: string;
  /**
   * The model the reader picked before a style pinned one over
   * {@link GenerateFormValue.model}, so clearing the style hands their own pick
   * back. It rides the persisted form value because a style survives a reload
   * and the pick it replaced has to survive with it. Empty when no style is
   * pinning a model, and never sent with a request.
   */
  modelBeforeStyle: string | null;
  /**
   * Further model names the request would also accept, beside
   * {@link GenerateFormValue.model}. The horde reads `models` as "any of these
   * may serve it", so these widen who can take the job without changing which
   * model the panel's own advice speaks for: every hint, every recommendation
   * and every style still follows the primary above. Capped at
   * {@link MAX_REQUEST_MODELS} counting the primary.
   */
  extraModels: string[];
  sampler_name: ImageSamplerName;
  steps: number;
  cfg_scale: number;
  clip_skip: number;
  /** A seed string, or an empty string to let the horde pick a random seed. */
  seed: string;
  width: number;
  height: number;
  post_processing: ImagePostProcessor[];
  hires_fix: boolean;
  tiling: boolean;
  nsfw: boolean;
  censor_nsfw: boolean;
  trusted_workers: boolean;
  slow_workers: boolean;
  allow_downgrade: boolean;
  sourceMode: GenerateSourceMode;
  /**
   * Whether image-to-image paints only where a mask says. The horde takes this
   * as `img2img` carrying a `source_mask`, which is a different pipeline from
   * inpainting: the masked pixels stay as the starting point rather than being
   * erased, so the strength below still means what it means everywhere else.
   */
  maskEnabled: boolean;
  /**
   * Whether inpainting is being used to grow the picture rather than to repair
   * it. The horde calls that `outpainting`, and it is the same pipeline: the
   * new canvas and the mask covering it are the caller's to produce.
   */
  outpaintEnabled: boolean;
  /** Where the attached picture sits inside the larger canvas being asked for. */
  outpaintAnchor: GenerateOutpaintAnchor;
  /** img2img/controlnet/inpainting denoise strength (0.01-1). */
  denoising_strength: number;
  /** ControlNet guidance mode; empty means unset (required for controlnet). */
  control_type: ImageControlType | '';
  /**
   * Weight on the control map's hold, or null to send nothing and leave the
   * worker on its own default. Only ever sent beside a control type: the horde
   * refuses the field on its own.
   */
  control_strength: number | null;
  image_is_control: boolean;
  return_control_map: boolean;
  /**
   * The noise schedule. Always set: `karras` and `normal` are the pair every
   * horde client has always had, and they ride the request as the legacy
   * `karras` boolean as well as the modern `scheduler` field.
   */
  scheduler: ImageSchedulerName;
  sampler_eta: number | null;
  sampler_s_noise: number | null;
  sampler_s_churn: number | null;
  sampler_s_tmin: number | null;
  sampler_s_tmax: number | null;
  sampler_order: number | null;
  sampler_solver_type: string;
  flow_shift: number | null;
  /** Face-fixer strength (0-1); only applied when a face fixer is selected. */
  facefixer_strength: number;
  /** Denoise strength for the hires-fix pass; only applied when hires_fix is on. */
  hires_fix_denoising_strength: number;
  /** Per-image seed increment; only sent when > 1 and n > 1. */
  seed_variation: number;
  loras: FormLoraEntry[];
  tis: FormTiEntry[];
  transparent: boolean;
  /** Share the result with LAION for kudos. Forced on for anonymous users. */
  shared: boolean;
  extra_slow_workers: boolean;
  /** Route suspicious prompts through the replacement filter (horde default on). */
  replacement_filter: boolean;
  disable_batching: boolean;
  /** URL the horde POSTs each finished generation to; '' disables the webhook. */
  webhook: string;
  /** Up to {@link MAX_WORKERS} worker names to pin the request to. */
  workers: string[];
  /** Treat {@link GenerateFormValue.workers} as a blacklist instead of a whitelist. */
  workerBlacklist: boolean;
  /** Payload for the `qr_code` workflow; '' leaves the workflow unset. */
  qrText: string;
  /**
   * Where the code sits in the frame, in pixels from the left and top edge, and
   * which shape its modules are drawn as. All three ride the request beside the
   * payload and all three are opt-in: '' sends nothing and the workflow uses its
   * own defaults, which are a centred code drawn as squares.
   */
  qrXOffset: string;
  qrYOffset: string;
  qrModuleDrawer: QrModuleDrawer | '';
  /**
   * Opt-in to persisting the webhook and worker routing between sessions. These
   * carry account-shaped detail that should not linger in local storage unless
   * the user asks for it, so {@link stripEphemeralExtras} blanks them on the way
   * out when this is off.
   */
  rememberExtras: boolean;
}

export type GenerateFormControls = {
  [K in keyof GenerateFormValue]: FormControl<GenerateFormValue[K]>;
};

export type GenerateFormGroup = FormGroup<GenerateFormControls>;

export const DEFAULT_GENERATE_FORM_VALUE: GenerateFormValue = {
  styleName: '',
  styleDetach: { style: '', sections: [] },
  prompt: '',
  negativePrompt: '',
  n: 1,
  model: '',
  modelBeforeStyle: null,
  extraModels: [],
  sampler_name: 'k_euler_a',
  steps: 25,
  cfg_scale: 7.5,
  clip_skip: 1,
  seed: '',
  width: 1024,
  height: 1024,
  post_processing: [],
  hires_fix: false,
  tiling: false,
  nsfw: false,
  censor_nsfw: true,
  trusted_workers: false,
  slow_workers: true,
  allow_downgrade: true,
  sourceMode: 'none',
  maskEnabled: false,
  outpaintEnabled: false,
  outpaintAnchor: 'center',
  denoising_strength: DEFAULT_DENOISE,
  control_type: '',
  control_strength: null,
  image_is_control: false,
  return_control_map: false,
  scheduler: 'karras',
  sampler_eta: null,
  sampler_s_noise: null,
  sampler_s_churn: null,
  sampler_s_tmin: null,
  sampler_s_tmax: null,
  sampler_order: null,
  sampler_solver_type: '',
  flow_shift: null,
  facefixer_strength: DEFAULT_FACEFIXER_STRENGTH,
  hires_fix_denoising_strength: DEFAULT_HIRES_DENOISE,
  seed_variation: MIN_SEED_VARIATION,
  loras: [],
  tis: [],
  transparent: false,
  shared: true,
  extra_slow_workers: false,
  replacement_filter: true,
  disable_batching: false,
  webhook: '',
  workers: [],
  workerBlacklist: false,
  qrText: '',
  qrXOffset: '',
  qrYOffset: '',
  qrModuleDrawer: '',
  rememberExtras: false,
};

/**
 * Normalise a worker list: trimmed, de-duplicated, blanks dropped, capped at
 * {@link MAX_WORKERS}. Applied both when loading a persisted list and when
 * building a request, so neither path can send a list the horde will reject.
 */
export function normalizeWorkers(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const entry of raw) {
    const name = entry.trim();
    if (name !== '') {
      seen.add(name);
    }
    if (seen.size === MAX_WORKERS) {
      break;
    }
  }
  return [...seen];
}

/**
 * Every model name one request would accept, primary first: trimmed,
 * de-duplicated, blanks dropped, capped at {@link MAX_REQUEST_MODELS}. An empty
 * result means "any model", which is what an unpicked primary has always meant.
 */
export function requestModelNames(
  primary: string,
  extras: readonly string[],
): string[] {
  const seen = new Set<string>();
  for (const entry of [primary, ...extras]) {
    const name = entry.trim();
    if (name !== '') {
      seen.add(name);
    }
    if (seen.size === MAX_REQUEST_MODELS) {
      break;
    }
  }
  return [...seen];
}

/**
 * The secondary models as the form should hold them: everything
 * {@link requestModelNames} keeps beside `primary`. Applied when loading a
 * persisted list and when reading a past request back into the form.
 */
export function normalizeExtraModels(
  primary: string,
  extras: readonly string[],
): string[] {
  const names = requestModelNames(primary, extras);
  return primary.trim() === '' ? names : names.slice(1);
}

/**
 * The form snapshot as it should be persisted. Without an explicit opt-in the
 * webhook and worker routing are session-only, so they are blanked here rather
 * than at the call site.
 */
export function stripEphemeralExtras(
  value: GenerateFormValue,
): GenerateFormValue {
  if (value.rememberExtras) {
    return value;
  }
  return {
    ...value,
    webhook: DEFAULT_GENERATE_FORM_VALUE.webhook,
    workers: [],
    workerBlacklist: DEFAULT_GENERATE_FORM_VALUE.workerBlacklist,
  };
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(max, Math.max(min, value));
  }
  return fallback;
}

// The two selection validators live with the shape they validate, so the
// picker, the style editor and this form all reject the same malformed entry.
const coerceLoraEntry = coerceLoraSelection;
const coerceTiEntry = coerceTiSelection;

/** Validate a persisted style-detach snapshot, falling back to "nothing detached". */
function coerceStyleDetach(raw: unknown): StyleDetachState {
  if (typeof raw !== 'object' || raw === null) {
    return { style: '', sections: [] };
  }
  const source = raw as Record<string, unknown>;
  if (
    typeof source['style'] !== 'string' ||
    !Array.isArray(source['sections'])
  ) {
    return { style: '', sections: [] };
  }
  return {
    style: source['style'],
    sections: source['sections'].filter((item): item is StyleLockSection =>
      (STYLE_LOCK_SECTIONS as readonly string[]).includes(item as string),
    ),
  };
}

/**
 * The sections the user has detached from the style the form currently selects.
 * A detachment recorded against another style (or left over after the style was
 * cleared) is ignored, so it can never leak into an unrelated request.
 */
export function detachedStyleSections(
  value: GenerateFormValue,
): readonly StyleLockSection[] {
  if (!value.styleName || value.styleDetach.style !== value.styleName) {
    return [];
  }
  return value.styleDetach.sections;
}

/**
 * Merge a possibly-partial persisted snapshot onto the defaults, dropping any
 * unknown or wrongly-typed fields so a stale local-storage payload can never
 * corrupt the form.
 */
export function coerceFormValue(raw: unknown): GenerateFormValue {
  if (typeof raw !== 'object' || raw === null) {
    return { ...DEFAULT_GENERATE_FORM_VALUE };
  }
  const source = raw as Record<string, unknown>;
  const merged: GenerateFormValue = { ...DEFAULT_GENERATE_FORM_VALUE };
  for (const key of Object.keys(merged) as (keyof GenerateFormValue)[]) {
    const value = source[key];
    const expected = typeof DEFAULT_GENERATE_FORM_VALUE[key];
    if (key === 'post_processing') {
      if (Array.isArray(value)) {
        merged.post_processing = value.filter(
          (item): item is ImagePostProcessor =>
            (POST_PROCESSORS as readonly string[]).includes(item as string),
        );
      }
      continue;
    }
    // Enum-typed fields must be validated against their allowed set so a stale
    // storage payload cannot inject an unsupported source mode or control type.
    if (key === 'sourceMode') {
      if ((SOURCE_MODES as readonly string[]).includes(value as string)) {
        merged.sourceMode = value as GenerateSourceMode;
      }
      continue;
    }
    if (key === 'control_type') {
      if (
        value === '' ||
        (CONTROL_TYPES as readonly string[]).includes(value as string)
      ) {
        merged.control_type = value as ImageControlType | '';
      }
      continue;
    }
    if (key === 'scheduler') {
      if ((IMAGE_SCHEDULERS as readonly string[]).includes(value as string)) {
        merged.scheduler = value as ImageSchedulerName;
      }
      continue;
    }
    if (key === 'denoising_strength') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        merged.denoising_strength = Math.min(
          MAX_DENOISE,
          Math.max(MIN_DENOISE, value),
        );
      }
      continue;
    }
    if (
      key === 'sampler_eta' ||
      key === 'sampler_s_noise' ||
      key === 'sampler_s_churn' ||
      key === 'sampler_s_tmin' ||
      key === 'sampler_s_tmax' ||
      key === 'sampler_order' ||
      key === 'flow_shift' ||
      key === 'control_strength'
    ) {
      if (
        value === null ||
        (typeof value === 'number' && Number.isFinite(value))
      ) {
        merged[key] = value;
      }
      continue;
    }
    if (key === 'modelBeforeStyle') {
      if (value === null || typeof value === 'string') {
        merged.modelBeforeStyle = value;
      }
      continue;
    }
    if (key === 'styleDetach') {
      merged.styleDetach = coerceStyleDetach(value);
      continue;
    }
    if (key === 'loras') {
      if (Array.isArray(value)) {
        merged.loras = value
          .map(coerceLoraEntry)
          .filter((entry): entry is FormLoraEntry => entry !== null);
      }
      continue;
    }
    if (key === 'tis') {
      if (Array.isArray(value)) {
        merged.tis = value
          .map(coerceTiEntry)
          .filter((entry): entry is FormTiEntry => entry !== null);
      }
      continue;
    }
    if (key === 'facefixer_strength') {
      merged.facefixer_strength = clampNumber(
        value,
        MIN_FACEFIXER_STRENGTH,
        MAX_FACEFIXER_STRENGTH,
        DEFAULT_GENERATE_FORM_VALUE.facefixer_strength,
      );
      continue;
    }
    if (key === 'hires_fix_denoising_strength') {
      merged.hires_fix_denoising_strength = clampNumber(
        value,
        MIN_HIRES_DENOISE,
        MAX_HIRES_DENOISE,
        DEFAULT_GENERATE_FORM_VALUE.hires_fix_denoising_strength,
      );
      continue;
    }
    if (key === 'workers') {
      if (Array.isArray(value)) {
        merged.workers = normalizeWorkers(
          value.filter((item): item is string => typeof item === 'string'),
        );
      }
      continue;
    }
    if (key === 'extraModels') {
      if (Array.isArray(value)) {
        merged.extraModels = normalizeExtraModels(
          merged.model,
          value.filter((item): item is string => typeof item === 'string'),
        );
      }
      continue;
    }
    if (key === 'webhook') {
      if (typeof value === 'string') {
        merged.webhook = value.slice(0, MAX_WEBHOOK_LENGTH);
      }
      continue;
    }
    if (key === 'qrModuleDrawer') {
      if (
        value === '' ||
        (QR_MODULE_DRAWERS as readonly string[]).includes(value as string)
      ) {
        merged.qrModuleDrawer = value as QrModuleDrawer | '';
      }
      continue;
    }
    if (key === 'seed_variation') {
      merged.seed_variation = Math.round(
        clampNumber(
          value,
          MIN_SEED_VARIATION,
          MAX_SEED_VARIATION,
          DEFAULT_GENERATE_FORM_VALUE.seed_variation,
        ),
      );
      continue;
    }
    if (typeof value === expected) {
      // Index assignment is sound: `key` and `value` share a type per branch.
      (merged as Record<keyof GenerateFormValue, unknown>)[key] = value;
    }
  }
  return merged;
}

export function createGenerateForm(
  value: GenerateFormValue,
): GenerateFormGroup {
  const control = <T>(initial: T): FormControl<T> =>
    new FormControl<T>(initial, { nonNullable: true });
  // Bounded numbers validate against the horde's schema rather than against the
  // range their slider offers, so a value typed past the slider's end is still
  // submittable as long as the horde would accept it.
  const bounded = (initial: number, min: number, max: number) =>
    new FormControl<number>(initial, {
      nonNullable: true,
      validators: [Validators.min(min), Validators.max(max)],
    });
  return new FormGroup<GenerateFormControls>({
    styleName: control(value.styleName),
    styleDetach: control(value.styleDetach),
    prompt: control(value.prompt),
    negativePrompt: control(value.negativePrompt),
    n: bounded(value.n, MIN_BATCH, MAX_API_BATCH),
    model: control(value.model),
    modelBeforeStyle: control(value.modelBeforeStyle),
    extraModels: control(value.extraModels),
    sampler_name: control(value.sampler_name),
    steps: bounded(value.steps, MIN_STEPS, MAX_STEPS),
    cfg_scale: bounded(value.cfg_scale, MIN_CFG_SCALE, MAX_CFG_SCALE),
    clip_skip: bounded(value.clip_skip, MIN_CLIP_SKIP, MAX_CLIP_SKIP),
    seed: control(value.seed),
    width: control(value.width),
    height: control(value.height),
    post_processing: control(value.post_processing),
    hires_fix: control(value.hires_fix),
    tiling: control(value.tiling),
    nsfw: control(value.nsfw),
    censor_nsfw: control(value.censor_nsfw),
    trusted_workers: control(value.trusted_workers),
    slow_workers: control(value.slow_workers),
    allow_downgrade: control(value.allow_downgrade),
    sourceMode: control(value.sourceMode),
    maskEnabled: control(value.maskEnabled),
    outpaintEnabled: control(value.outpaintEnabled),
    outpaintAnchor: control(value.outpaintAnchor),
    denoising_strength: bounded(
      value.denoising_strength,
      MIN_DENOISE,
      MAX_DENOISE,
    ),
    control_type: control(value.control_type),
    control_strength: control(value.control_strength),
    image_is_control: control(value.image_is_control),
    return_control_map: control(value.return_control_map),
    scheduler: control(value.scheduler),
    sampler_eta: control(value.sampler_eta),
    sampler_s_noise: control(value.sampler_s_noise),
    sampler_s_churn: control(value.sampler_s_churn),
    sampler_s_tmin: control(value.sampler_s_tmin),
    sampler_s_tmax: control(value.sampler_s_tmax),
    sampler_order: control(value.sampler_order),
    sampler_solver_type: control(value.sampler_solver_type),
    flow_shift: control(value.flow_shift),
    facefixer_strength: bounded(
      value.facefixer_strength,
      MIN_FACEFIXER_STRENGTH,
      MAX_FACEFIXER_STRENGTH,
    ),
    hires_fix_denoising_strength: bounded(
      value.hires_fix_denoising_strength,
      MIN_HIRES_DENOISE,
      MAX_HIRES_DENOISE,
    ),
    seed_variation: control(value.seed_variation),
    loras: control(value.loras),
    tis: control(value.tis),
    transparent: control(value.transparent),
    shared: control(value.shared),
    extra_slow_workers: control(value.extra_slow_workers),
    replacement_filter: control(value.replacement_filter),
    disable_batching: control(value.disable_batching),
    webhook: control(value.webhook),
    workers: control(value.workers),
    workerBlacklist: control(value.workerBlacklist),
    qrText: control(value.qrText),
    qrXOffset: control(value.qrXOffset),
    qrYOffset: control(value.qrYOffset),
    qrModuleDrawer: control(value.qrModuleDrawer),
    rememberExtras: control(value.rememberExtras),
  });
}

/**
 * The fields a "reset all settings" leaves alone. The two prompts are the work
 * rather than a setting; `sourceMode` stays because dropping it back to `none`
 * would detach the image the reset promises to keep.
 */
export const RESET_KEPT_FIELDS = [
  'prompt',
  'negativePrompt',
  'sourceMode',
] as const satisfies readonly (keyof GenerateFormValue)[];

/**
 * Every generation setting back to its default, keeping only the
 * {@link RESET_KEPT_FIELDS}. Style selection, LoRAs and embeddings,
 * post-processing, the workflow toggles and the worker routing all go with the
 * rest: they are settings, and a reset that spared them would leave the request
 * carrying choices the user just asked to be rid of.
 */
export function resetFormValue(value: GenerateFormValue): GenerateFormValue {
  const result: GenerateFormValue = { ...DEFAULT_GENERATE_FORM_VALUE };
  for (const key of RESET_KEPT_FIELDS) {
    // Index assignment is sound: each key copies the same-typed field across.
    (result as Record<keyof GenerateFormValue, unknown>)[key] = value[key];
  }
  return result;
}

/**
 * Join a positive and negative prompt using the horde's `###` separator. An
 * empty negative prompt yields the positive prompt unchanged.
 */
export function combinePrompt(positive: string, negative: string): string {
  const p = positive.trim();
  const n = negative.trim();
  return n ? `${p} ### ${n}` : p;
}

/** How many past prompts the prompt-history quick-pick offers. */
export const PROMPT_HISTORY_LIMIT = 10;

/** One past prompt, already split into the halves the form's two boxes hold. */
export interface PromptHistoryEntry {
  prompt: string;
  negativePrompt: string;
}

/**
 * The most recent distinct prompts across `jobs`, newest first. A stored request
 * holds the combined `positive ### negative` string, so every entry is split
 * back into the two fields the form fills, and a repeated prompt keeps only its
 * newest occurrence. Jobs whose prompt is empty are skipped.
 */
export function promptHistoryFromJobs(
  jobs: readonly LocalGenerationJob[],
  limit: number = PROMPT_HISTORY_LIMIT,
): PromptHistoryEntry[] {
  const history: PromptHistoryEntry[] = [];
  const seen = new Set<string>();
  const newestFirst = [...jobs].sort((a, b) => b.createdAt - a.createdAt);
  for (const job of newestFirst) {
    const raw = job.request.prompt.trim();
    if (raw === '' || seen.has(raw)) {
      continue;
    }
    seen.add(raw);
    const [prompt, negativePrompt] = splitCombinedPrompt(raw);
    if (prompt === '') {
      continue;
    }
    history.push({ prompt, negativePrompt });
    if (history.length === limit) {
      break;
    }
  }
  return history;
}

/**
 * The horde's view of one LoRA. `sha256` is deliberately absent: the shared
 * selection shape carries it for the style editor, and a generation request has
 * never pinned a file hash.
 */
function mapFormLora(entry: FormLoraEntry): StyleLoraConfig {
  const lora: StyleLoraConfig = {
    name: entry.name,
    model: entry.model,
    clip: entry.clip,
  };
  if (entry.inject_trigger) {
    lora.inject_trigger = entry.inject_trigger;
  }
  if (entry.is_version) {
    lora.is_version = entry.is_version;
  }
  return lora;
}

function mapFormTi(entry: FormTiEntry): StyleTextualInversionConfig {
  const ti: StyleTextualInversionConfig = {
    name: entry.name,
    strength: entry.strength,
  };
  if (entry.inject_ti) {
    ti.inject_ti = entry.inject_ti;
  }
  return ti;
}

export interface BuildImageRequestOptions {
  /**
   * Whether a source image blob is actually attached. When false, no
   * source_processing / denoising / controlnet fields are emitted even if the
   * form still remembers a source mode, so a mode with no image estimates and
   * submits as plain txt2img.
   */
  hasSourceImage?: boolean;
  /** Live API contract; absent keeps the legacy sampler request shape. */
  samplerContract?: SamplerConstraintsDocument | null;
  /** Resolve final request model names after a style has replaced the model. */
  baselineForModel?: (modelName: string) => string | null;
}

const MODERN_SAMPLER_PARAMS = [
  'scheduler',
  'sampler_eta',
  'sampler_s_noise',
  'sampler_s_churn',
  'sampler_s_tmin',
  'sampler_s_tmax',
  'sampler_order',
  'sampler_solver_type',
  'flow_shift',
] as const satisfies readonly (keyof ImageGenerationParams)[];

const SAMPLER_VALUE_FIELDS: Readonly<
  Record<SamplerSettingName, keyof GenerateFormValue>
> = {
  sampler_eta: 'sampler_eta',
  sampler_s_noise: 'sampler_s_noise',
  sampler_s_churn: 'sampler_s_churn',
  sampler_s_tmin: 'sampler_s_tmin',
  sampler_s_tmax: 'sampler_s_tmax',
  sampler_order: 'sampler_order',
};

/**
 * Apply sampler-specific fields to the final request. This deliberately runs
 * after style resolution because a style may replace the sampler or model that
 * made the visible controls applicable.
 */
export function applyModernSamplerSettings(
  request: ImageGenerationRequest,
  value: GenerateFormValue,
  options: BuildImageRequestOptions,
): ImageGenerationRequest {
  const params = request.params ?? {};
  for (const field of MODERN_SAMPLER_PARAMS) delete params[field];

  const contract = options.samplerContract;
  const samplerName = params.sampler_name ?? value.sampler_name;
  const sampler = contract?.samplers[samplerName];
  if (!contract || !sampler) {
    request.params = params;
    return request;
  }

  const modelNames = request.models ?? [];
  const resolved = modelNames.map((name) => options.baselineForModel?.(name));
  const baselines =
    modelNames.length > 0 && resolved.every((baseline) => baseline !== null)
      ? (resolved as string[])
      : [];

  if (
    availableSchedulers(contract, samplerName, baselines).includes(
      value.scheduler,
    )
  ) {
    params.scheduler = value.scheduler;
    // The legacy boolean only speaks for the two schedules it can name, so it
    // is dropped rather than left contradicting a modern schedule.
    if (!LEGACY_SCHEDULERS.includes(value.scheduler)) {
      delete params.karras;
    }
  }

  for (const [settingName, range] of Object.entries(
    sampler.accepted_settings,
  ) as [
    SamplerSettingName,
    NonNullable<(typeof sampler.accepted_settings)[SamplerSettingName]>,
  ][]) {
    const raw = value[SAMPLER_VALUE_FIELDS[settingName]];
    if (typeof raw === 'number' && samplerSettingIsValid(range, raw)) {
      params[settingName] = raw;
    }
  }

  if (
    value.sampler_solver_type &&
    sampler.solver_type_choices.includes(value.sampler_solver_type)
  ) {
    params.sampler_solver_type = value.sampler_solver_type;
  }
  if (
    value.flow_shift !== null &&
    value.flow_shift >= MIN_FLOW_SHIFT &&
    value.flow_shift <= MAX_FLOW_SHIFT &&
    baselinesSupportFlowShift(baselines)
  ) {
    params.flow_shift = value.flow_shift;
  }

  request.params = params;
  return request;
}

/**
 * Map a form snapshot onto an {@link ImageGenerationRequest}. Optional fields
 * are omitted rather than sent empty: a blank seed lets the horde randomise, an
 * empty model list means "any model", and post-processing/hires/tiling are only
 * attached when actually requested.
 *
 * The base64 `source_image` / `source_mask` are never embedded here; the queue
 * rehydrates those from stored blobs at submit time (the kudos dry run attaches
 * the source separately). This only sets the `source_processing` and the
 * img2img/controlnet params that describe how the attached image is used.
 */
export function buildImageRequest(
  value: GenerateFormValue,
  options: BuildImageRequestOptions = {},
): ImageGenerationRequest {
  const params: ImageGenerationParams = {
    sampler_name: value.sampler_name,
    cfg_scale: value.cfg_scale,
    steps: value.steps,
    clip_skip: value.clip_skip,
    width: value.width,
    height: value.height,
    n: value.n,
  };

  const seed = value.seed.trim();
  if (seed) {
    params.seed = seed;
  }
  if (value.post_processing.length > 0) {
    params.post_processing = [...value.post_processing];
  }
  if (value.hires_fix) {
    params.hires_fix = true;
    params.hires_fix_denoising_strength = value.hires_fix_denoising_strength;
  }
  if (value.tiling) {
    params.tiling = true;
  }
  // The horde default for karras is false, so only the karras schedule is sent.
  if (value.scheduler === 'karras') {
    params.karras = true;
  }
  if (value.transparent) {
    params.transparent = true;
  }
  // seed_variation only bites when n > 1; a value of 1 is the no-op default.
  if (value.seed_variation > MIN_SEED_VARIATION) {
    params.seed_variation = value.seed_variation;
  }
  // facefixer_strength is meaningless unless a face fixer is post-processing.
  const usesFaceFixer = value.post_processing.some((processor) =>
    FACE_FIXERS.includes(processor),
  );
  if (usesFaceFixer) {
    params.facefixer_strength = value.facefixer_strength;
  }
  // The panel keeps every selection so one can be promoted past the cap, but a
  // request carries only the ones the horde will accept.
  const sentLoras = activeLoras(value.loras);
  if (sentLoras.length > 0) {
    params.loras = sentLoras.map(mapFormLora);
  }
  const sentTis = activeTis(value.tis);
  if (sentTis.length > 0) {
    params.tis = sentTis.map(mapFormTi);
  }

  // Only describe source processing when an image is genuinely attached.
  // controlnet rides the horde's img2img source-processing with a control_type;
  // denoising is meaningful for all three attached modes (matches artbot's
  // ImageParamsForHordeApi, which sends denoising_strength for img2img,
  // controlnet, and inpainting alike).
  let sourceProcessing: ImageSourceProcessing | undefined;
  if ((options.hasSourceImage ?? false) && value.sourceMode !== 'none') {
    switch (value.sourceMode) {
      case 'img2img':
        sourceProcessing = 'img2img';
        params.denoising_strength = value.denoising_strength;
        break;
      case 'controlnet':
        sourceProcessing = 'img2img';
        if (value.control_type) {
          params.control_type = value.control_type;
        }
        if (value.image_is_control) {
          params.image_is_control = true;
        }
        if (value.return_control_map) {
          params.return_control_map = true;
        }
        params.denoising_strength = value.denoising_strength;
        break;
      case 'inpainting':
        // Growing the canvas is the same pipeline with the mask covering what
        // was added rather than something already in the picture, so it is a
        // choice inside this mode rather than a mode of its own.
        sourceProcessing = value.outpaintEnabled ? 'outpainting' : 'inpainting';
        // The panel offers no strength control in either: the masked pixels are
        // erased before the render starts, so a lower strength does not soften
        // the edit, it leaves it unfinished. The request says 1 rather than
        // carrying whatever the reader last set for image-to-image.
        params.denoising_strength = 1;
        break;
      // Remix weights its inputs through per-image `extra_source_images`
      // strengths rather than a denoise pass, so no denoising_strength is sent.
      case 'remix':
        sourceProcessing = 'remix';
        break;
    }
  }

  // The layout entries only mean anything beside a payload, so they ride the
  // same test the workflow itself is selected by; each is sent only when set.
  const qrText = value.qrText.trim();
  if (qrText) {
    params.workflow = 'qr_code';
    const extraTexts = [{ text: qrText, reference: QR_CODE_TEXT_REFERENCE }];
    const xOffset = qrOffsetText(value.qrXOffset);
    if (xOffset !== null) {
      extraTexts.push({ text: xOffset, reference: QR_X_OFFSET_REFERENCE });
    }
    const yOffset = qrOffsetText(value.qrYOffset);
    if (yOffset !== null) {
      extraTexts.push({ text: yOffset, reference: QR_Y_OFFSET_REFERENCE });
    }
    if (value.qrModuleDrawer) {
      extraTexts.push({
        text: value.qrModuleDrawer,
        reference: QR_MODULE_DRAWER_REFERENCE,
      });
    }
    params.extra_texts = extraTexts;
  }

  // The weight on a control map is only accepted where there is a control map:
  // beside a control type, or under the QR workflow, which applies a ControlNet
  // of its own. Carried anywhere else, or outside the horde's bounds, the
  // request is refused, so it is written once here where both are decided.
  if (
    (params.control_type !== undefined || params.workflow === 'qr_code') &&
    value.control_strength !== null &&
    value.control_strength >= MIN_CONTROL_STRENGTH &&
    value.control_strength <= MAX_CONTROL_STRENGTH
  ) {
    params.control_strength = value.control_strength;
  }

  const request: ImageGenerationRequest = {
    prompt: combinePrompt(value.prompt, value.negativePrompt),
    params,
    nsfw: value.nsfw,
    censor_nsfw: value.censor_nsfw,
    trusted_workers: value.trusted_workers,
    slow_workers: value.slow_workers,
    allow_downgrade: value.allow_downgrade,
    r2: true,
  };

  if (sourceProcessing) {
    request.source_processing = sourceProcessing;
  }

  // shared / extra_slow_workers / disable_batching all default off server-side,
  // so only their enabled state is sent. replacement_filter defaults ON, so only
  // an explicit opt-out is worth sending.
  if (value.shared) {
    request.shared = true;
  }
  if (value.extra_slow_workers) {
    request.extra_slow_workers = true;
  }
  if (!value.replacement_filter) {
    request.replacement_filter = false;
  }
  if (value.disable_batching) {
    request.disable_batching = true;
  }

  const webhook = value.webhook.trim();
  if (isValidWebhook(webhook)) {
    request.webhook = webhook;
  }

  const workers = normalizeWorkers(value.workers);
  if (workers.length > 0) {
    request.workers = workers;
    request.worker_blacklist = value.workerBlacklist;
  }

  // The horde reads `models` as "any of these may serve it", so the primary
  // model and every extra ride together, primary first.
  const models = requestModelNames(value.model, value.extraModels);
  if (models.length > 0) {
    request.models = models;
  }
  return applyModernSamplerSettings(request, value, options);
}

/**
 * What a built request needs of a worker, so the studio can say how many could
 * take it. Read off the request rather than the form because that is the thing
 * the horde will route: a style that replaced the model or the size is already
 * folded in, and a past generation can be asked the same question from the
 * request it was submitted with.
 *
 * Remix is deliberately not mapped onto a capability. It carries a source image
 * but which worker flag the horde routes it by is not visible in the worker
 * list, and a demand that cannot be checked would be reported as an emptied
 * pool that is not real.
 */
export function workerRequirementForRequest(
  request: ImageGenerationRequest,
): WorkerRequirement {
  const params = request.params ?? {};
  const processing = request.source_processing;
  const controlType =
    processing === 'img2img' ? params.control_type : undefined;
  return {
    models:
      request.models
        ?.map((name) => name.trim())
        .filter((name) => name !== '') ?? [],
    width: params.width ?? DEFAULT_GENERATE_FORM_VALUE.width,
    height: params.height ?? DEFAULT_GENERATE_FORM_VALUE.height,
    nsfw: request.nsfw === true,
    needsImg2Img: processing === 'img2img',
    needsPainting: processing === 'inpainting' || processing === 'outpainting',
    needsControlNet: controlType !== undefined,
    needsExtendedControlNet:
      controlType !== undefined && EXTENDED_CONTROL_TYPES.includes(controlType),
    // Read off the built request rather than the control type: the QR workflow
    // carries a control strength without one.
    needsControlStrength: params.control_strength !== undefined,
    trustedOnly: request.trusted_workers === true,
    workers: request.workers ?? [],
    workerBlacklist: request.worker_blacklist === true,
  };
}

/**
 * Build a request with a resolved style applied on top of the form's own values.
 * When `applied` is null this is exactly {@link buildImageRequest}. Otherwise the
 * style's final prompt and any parameters it forces (model, dimensions, steps,
 * cfg, sampler, clip_skip, karras, hires_fix, loras, tis) override the form's,
 * matching the horde behaviour where a style pins those fields.
 *
 * Sections the user detached from the style (see {@link detachedStyleSections})
 * keep the form's own values, which is what the per-section "use my values"
 * escape hatch in the control panel relies on.
 *
 * `applied` is produced by the styles service's `applyStyle(preset, positive,
 * negative)`, keeping preset resolution out of the form model.
 */
export function buildStyledImageRequest(
  value: GenerateFormValue,
  applied: AppliedStyle | null,
  options: BuildImageRequestOptions = {},
): ImageGenerationRequest {
  const request = buildImageRequest(value, options);
  if (!applied) {
    return request;
  }

  request.prompt = applied.prompt;
  const params: ImageGenerationParams = request.params ?? {};
  const forced = applied.forcedParams;
  const detached = detachedStyleSections(value);
  const pinned = (section: StyleLockSection): boolean =>
    !detached.includes(section);

  if (pinned('dimensions')) {
    if (forced.width !== undefined) params.width = forced.width;
    if (forced.height !== undefined) params.height = forced.height;
  }
  if (pinned('sampling')) {
    if (forced.steps !== undefined) params.steps = forced.steps;
    if (forced.cfg_scale !== undefined) params.cfg_scale = forced.cfg_scale;
    if (forced.sampler_name !== undefined) {
      params.sampler_name = forced.sampler_name;
    }
    if (forced.clip_skip !== undefined) params.clip_skip = forced.clip_skip;
    if (forced.karras !== undefined) {
      if (forced.karras) {
        params.karras = true;
      } else {
        delete params.karras;
      }
    }
    if (forced.hires_fix !== undefined) {
      if (forced.hires_fix) {
        params.hires_fix = true;
      } else {
        delete params.hires_fix;
        delete params.hires_fix_denoising_strength;
      }
    }
  }
  if (forced.loras) params.loras = forced.loras;
  if (forced.tis) params.tis = forced.tis;

  request.params = params;
  if (pinned('model') && forced.model !== undefined) {
    // A style that pins a model replaces the whole list: it is naming the model
    // its settings were written for, so widening the routing past it would send
    // the style's numbers to a model they were never meant for.
    request.models = [forced.model];
  }
  // A style names its schedule as the legacy boolean, so the modern pass runs
  // against that schedule rather than the form's: leaving the form's in would
  // send a `scheduler` contradicting the `karras` the style just pinned.
  const styled: GenerateFormValue =
    pinned('sampling') && forced.karras !== undefined
      ? { ...value, scheduler: forced.karras ? 'karras' : 'normal' }
      : value;
  return applyModernSamplerSettings(request, styled, options);
}

/**
 * Split a combined horde prompt back into its positive/negative halves.
 *
 * The separator is matched on the marker alone rather than on ` ### `, because
 * a payload written by anything other than {@link combinePrompt} spaces it
 * however it likes; both halves are trimmed so the spacing never reaches the
 * form. A prompt with no marker is entirely positive.
 */
export function splitCombinedPrompt(prompt: string): [string, string] {
  const index = prompt.indexOf('###');
  if (index === -1) {
    return [prompt, ''];
  }
  return [prompt.slice(0, index).trim(), prompt.slice(index + 3).trim()];
}

function loraConfigToForm(lora: StyleLoraConfig): FormLoraEntry {
  const entry: FormLoraEntry = {
    name: lora.name,
    model: typeof lora.model === 'number' ? lora.model : DEFAULT_LORA_STRENGTH,
    clip: typeof lora.clip === 'number' ? lora.clip : DEFAULT_LORA_STRENGTH,
  };
  if (lora.inject_trigger) {
    entry.inject_trigger = lora.inject_trigger;
  }
  if (lora.is_version) {
    entry.is_version = lora.is_version;
  }
  return entry;
}

function tiConfigToForm(ti: StyleTextualInversionConfig): FormTiEntry {
  const entry: FormTiEntry = {
    name: ti.name,
    strength:
      typeof ti.strength === 'number' ? ti.strength : DEFAULT_LORA_STRENGTH,
  };
  if (ti.inject_ti === 'prompt' || ti.inject_ti === 'negprompt') {
    entry.inject_ti = ti.inject_ti;
  }
  return entry;
}

/**
 * Reverse of {@link buildImageRequest}: recover a {@link GenerateFormValue} from
 * a stored request, so a past generation's settings can be loaded back into the
 * form. It is inherently lossy (a request carries no style name, and the base64
 * source image lives outside it), so `styleName` is cleared and the caller
 * re-attaches any source blob separately.
 */
export function requestToFormValue(
  request: ImageGenerationRequest,
): GenerateFormValue {
  const result: GenerateFormValue = { ...DEFAULT_GENERATE_FORM_VALUE };
  const params = request.params ?? {};

  const [positive, negative] = splitCombinedPrompt(request.prompt);
  result.prompt = positive;
  result.negativePrompt = negative;
  result.styleName = '';

  if (request.models && request.models.length > 0) {
    // The horde's list is unordered as far as routing goes, but the first name
    // is the one the panel's advice will speak for, which is what the form's
    // own primary means.
    result.model = request.models[0];
    result.extraModels = normalizeExtraModels(
      result.model,
      request.models.slice(1),
    );
  }
  if (params.sampler_name) result.sampler_name = params.sampler_name;
  if (typeof params.steps === 'number') result.steps = params.steps;
  if (typeof params.cfg_scale === 'number') result.cfg_scale = params.cfg_scale;
  if (typeof params.clip_skip === 'number') result.clip_skip = params.clip_skip;
  if (typeof params.seed === 'string') result.seed = params.seed;
  if (typeof params.width === 'number') result.width = params.width;
  if (typeof params.height === 'number') result.height = params.height;
  if (typeof params.n === 'number') result.n = params.n;
  if (Array.isArray(params.post_processing)) {
    result.post_processing = [...params.post_processing];
  }
  result.hires_fix = params.hires_fix === true;
  if (typeof params.hires_fix_denoising_strength === 'number') {
    result.hires_fix_denoising_strength = params.hires_fix_denoising_strength;
  }
  result.tiling = params.tiling === true;
  // A named schedule wins; otherwise the legacy boolean names one of the pair.
  if (
    params.scheduler &&
    (IMAGE_SCHEDULERS as readonly string[]).includes(params.scheduler)
  ) {
    result.scheduler = params.scheduler;
  } else {
    result.scheduler = params.karras === true ? 'karras' : 'normal';
  }
  if (typeof params.sampler_eta === 'number')
    result.sampler_eta = params.sampler_eta;
  if (typeof params.sampler_s_noise === 'number') {
    result.sampler_s_noise = params.sampler_s_noise;
  }
  if (typeof params.sampler_s_churn === 'number') {
    result.sampler_s_churn = params.sampler_s_churn;
  }
  if (typeof params.sampler_s_tmin === 'number') {
    result.sampler_s_tmin = params.sampler_s_tmin;
  }
  if (typeof params.sampler_s_tmax === 'number') {
    result.sampler_s_tmax = params.sampler_s_tmax;
  }
  if (typeof params.sampler_order === 'number') {
    result.sampler_order = params.sampler_order;
  }
  if (typeof params.sampler_solver_type === 'string') {
    result.sampler_solver_type = params.sampler_solver_type;
  }
  if (typeof params.flow_shift === 'number')
    result.flow_shift = params.flow_shift;
  result.transparent = params.transparent === true;
  if (typeof params.seed_variation === 'number') {
    result.seed_variation = params.seed_variation;
  }
  if (typeof params.facefixer_strength === 'number') {
    result.facefixer_strength = params.facefixer_strength;
  }
  if (typeof params.denoising_strength === 'number') {
    result.denoising_strength = params.denoising_strength;
  }
  if (params.control_type) result.control_type = params.control_type;
  // Comes back only where the request could have carried it, so a reload cannot
  // seed a strength the studio would then have to drop.
  if (
    typeof params.control_strength === 'number' &&
    (params.control_type !== undefined || params.workflow === 'qr_code')
  ) {
    result.control_strength = params.control_strength;
  }
  result.image_is_control = params.image_is_control === true;
  result.return_control_map = params.return_control_map === true;
  if (Array.isArray(params.loras)) {
    result.loras = params.loras.map(loraConfigToForm);
  }
  if (Array.isArray(params.tis)) {
    result.tis = params.tis.map(tiConfigToForm);
  }

  result.nsfw = request.nsfw === true;
  result.censor_nsfw = request.censor_nsfw ?? true;
  result.trusted_workers = request.trusted_workers === true;
  result.slow_workers = request.slow_workers ?? true;
  result.allow_downgrade = request.allow_downgrade ?? true;
  result.shared = request.shared === true;
  result.extra_slow_workers = request.extra_slow_workers === true;
  // replacement_filter is only sent when explicitly off, so absence means on.
  result.replacement_filter = request.replacement_filter !== false;
  result.disable_batching = request.disable_batching === true;

  // Outpainting is inpainting with the canvas grown, and masked image-to-image
  // is image-to-image with a mask attached, so both come back as the mode they
  // were sent under plus the choice that distinguishes them. A request that
  // lost either of those would reload as something the reader did not send.
  if (request.source_processing === 'inpainting') {
    result.sourceMode = 'inpainting';
  } else if (request.source_processing === 'outpainting') {
    result.sourceMode = 'inpainting';
    result.outpaintEnabled = true;
  } else if (request.source_processing === 'remix') {
    result.sourceMode = 'remix';
  } else if (request.source_processing === 'img2img') {
    result.sourceMode = params.control_type ? 'controlnet' : 'img2img';
    // ControlNet has no mask of its own: the backends pick the control pipeline
    // over the masked one, so a mask alongside a control type is never applied
    // and must not come back as though it had been.
    result.maskEnabled =
      !params.control_type && typeof request.source_mask === 'string';
  } else {
    result.sourceMode = 'none';
  }

  if (typeof request.webhook === 'string') {
    result.webhook = request.webhook;
  }
  if (Array.isArray(request.workers)) {
    result.workers = normalizeWorkers(
      request.workers.filter(
        (item): item is string => typeof item === 'string',
      ),
    );
  }
  result.workerBlacklist = request.worker_blacklist === true;

  if (Array.isArray(params.extra_texts)) {
    const entries = params.extra_texts;
    const textFor = (reference: string): string | null => {
      const entry = entries.find((item) => item.reference === reference);
      return entry && typeof entry.text === 'string' ? entry.text : null;
    };
    const qr = textFor(QR_CODE_TEXT_REFERENCE);
    if (qr !== null) {
      result.qrText = qr;
    }
    const xOffset = textFor(QR_X_OFFSET_REFERENCE);
    if (xOffset !== null && qrOffsetText(xOffset) !== null) {
      result.qrXOffset = xOffset.trim();
    }
    const yOffset = textFor(QR_Y_OFFSET_REFERENCE);
    if (yOffset !== null && qrOffsetText(yOffset) !== null) {
      result.qrYOffset = yOffset.trim();
    }
    const drawer = drawerNameFor(textFor(QR_MODULE_DRAWER_REFERENCE));
    if (drawer !== null) {
      result.qrModuleDrawer = drawer;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// What the estimate is made of
// ---------------------------------------------------------------------------

/** One contribution to the price, as a line the popover prints. */
export interface KudosBreakdownLine {
  id: string;
  key: string;
  params: Record<string, string | number>;
}

/**
 * The settings the reader is spending kudos on, read off the form in front of
 * them. The horde owns the arithmetic and the button carries its answer; these
 * lines only name the choices that move it, so a bare number becomes something
 * the reader can act on.
 */
export function kudosBreakdown(
  value: GenerateFormValue,
  contract: SamplerConstraintsDocument | null,
): KudosBreakdownLine[] {
  const lines: KudosBreakdownLine[] = [];

  lines.push({
    id: 'size',
    key: 'generate.form.kudos_line_size',
    params: {
      width: value.width,
      height: value.height,
      megapixels: ((value.width * value.height) / 1_000_000).toFixed(2),
    },
  });

  const work = samplerWorkFactor(contract, value.sampler_name);
  if (work === 'adaptive') {
    lines.push({
      id: 'steps',
      key: 'generate.form.kudos_line_steps_adaptive',
      params: { steps: value.steps, sampler: value.sampler_name },
    });
  } else if (typeof work === 'number') {
    lines.push({
      id: 'steps',
      key: 'generate.form.kudos_line_steps_work',
      params: {
        steps: value.steps,
        sampler: value.sampler_name,
        factor: work,
        units: Math.round(value.steps * work),
      },
    });
  } else {
    lines.push({
      id: 'steps',
      key: 'generate.form.kudos_line_steps',
      params: { steps: value.steps, sampler: value.sampler_name },
    });
  }

  if (value.hires_fix) {
    lines.push({
      id: 'hires',
      key: 'generate.form.kudos_line_hires',
      params: {},
    });
  }

  const faceFixers = value.post_processing.filter((processor) =>
    FACE_FIXERS.includes(processor),
  );
  const afterwards = value.post_processing.filter(
    (processor) => !FACE_FIXERS.includes(processor),
  );
  if (afterwards.length > 0) {
    lines.push({
      id: 'post',
      key: 'generate.form.kudos_line_post',
      params: { list: afterwards.join(', ') },
    });
  }
  if (faceFixers.length > 0) {
    lines.push({
      id: 'facefix',
      key: 'generate.form.kudos_line_facefix',
      params: { list: faceFixers.join(', ') },
    });
  }

  // Counts what is sent, not what is listed: a selection parked past the cap
  // must not inflate the estimate it is not part of.
  const chargedLoras = activeLoras(value.loras).length;
  if (chargedLoras > 0) {
    lines.push({
      id: 'loras',
      key:
        chargedLoras === 1
          ? 'generate.form.kudos_line_loras_one'
          : 'generate.form.kudos_line_loras_other',
      params: { count: chargedLoras },
    });
  }

  if (value.n > 1) {
    lines.push({
      id: 'batch',
      key: 'generate.form.kudos_line_batch',
      params: { count: value.n },
    });
  }

  return lines;
}

/**
 * Fields the changed-settings ledger never lists. `styleDetach` records which
 * sections of a style the reader opted out of, and `modelBeforeStyle` holds the
 * model pick a style is standing on: both are bookkeeping about another setting
 * rather than settings of their own.
 */
const LEDGER_EXCLUDED: readonly (keyof GenerateFormValue)[] = [
  'styleDetach',
  'modelBeforeStyle',
];

/**
 * Every setting the form is no longer carrying its default for, in the order
 * the form declares them. This is the same comparison a group's changed mark
 * makes, gathered across the whole panel so a reader can see at once what they
 * have moved and put any of it back.
 */
export function changedFields(
  value: GenerateFormValue,
): (keyof GenerateFormValue)[] {
  return (
    Object.keys(DEFAULT_GENERATE_FORM_VALUE) as (keyof GenerateFormValue)[]
  )
    .filter((field) => !LEDGER_EXCLUDED.includes(field))
    .filter(
      (field) =>
        JSON.stringify(value[field]) !==
        JSON.stringify(DEFAULT_GENERATE_FORM_VALUE[field]),
    );
}

/** What a reader's kudos balance buys at the price this request was quoted. */
export interface KudosAffordability {
  /** The balance the arithmetic was done against. */
  balance: number;
  /** How many further requests at this price the balance covers after this one. */
  more: number;
  /** Whether this one alone costs more than the balance holds. */
  short: boolean;
}

/**
 * What the balance buys, or null when the question cannot be answered honestly:
 * an anonymous reader has no balance to read, and a quote that has not arrived
 * (or is zero, which a free request is) has no price to divide by.
 *
 * The horde is the only authority on whether a submit is accepted, so a short
 * balance is a warning about the price and never a bar on the button.
 */
export function kudosAffordability(
  balance: number | null,
  quote: number | null,
): KudosAffordability | null {
  if (balance === null || quote === null || quote <= 0) {
    return null;
  }
  return {
    balance: Math.round(balance),
    more: Math.max(0, Math.floor(balance / quote) - 1),
    short: quote > balance,
  };
}

/** How long the picked model is taking right now, as a line to print. */
export interface WaitEstimate {
  key: string;
  params: Record<string, string | number>;
}

/** Below this many seconds the wait is spoken in seconds rather than minutes. */
const WAIT_MINUTES_FROM_SECONDS = 90;

/**
 * What to say about the wait for `model`, which is null when no model is picked
 * or the status list has never heard of the one that is. The horde reports an
 * eta for a model nobody serves as well as for one in demand, so the worker
 * count is read first: with nobody carrying it the number means nothing.
 */
export function modelWaitEstimate(model: ActiveModel | null): WaitEstimate {
  if (model && model.count === 0) {
    return { key: 'generate.form.model_no_workers', params: {} };
  }
  const eta = model?.eta;
  if (typeof eta === 'number' && Number.isFinite(eta) && eta > 0) {
    return eta < WAIT_MINUTES_FROM_SECONDS
      ? {
          key: 'generate.form.kudos_wait_seconds',
          params: { seconds: Math.max(1, Math.round(eta)) },
        }
      : {
          key: 'generate.form.kudos_wait_minutes',
          params: { minutes: Math.round(eta / 60) },
        };
  }
  return { key: 'generate.form.kudos_wait_unknown', params: {} };
}
