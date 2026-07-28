import { FormControl, FormGroup } from '@angular/forms';
import {
  ImageControlType,
  ImageGenerationParams,
  ImageGenerationRequest,
  ImageSourceProcessing,
} from '../../types/generation';
import {
  ImagePostProcessor,
  ImageSamplerName,
  StyleLoraConfig,
  StyleTextualInversionConfig,
} from '../../types/style';
import type { AppliedStyle } from '../../services/horde-styles.service';
import type { ModelRequirements } from '../../services/model-reference.service';
import type { LocalGenerationJob } from '../../types/generation-job';

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
 * Post-processors offered as a multi-select. A subset of the samplers the horde
 * knows about, chosen for image generation (upscalers, face fixers, background
 * strip) rather than the full alchemy catalogue.
 */
export const POST_PROCESSORS: readonly ImagePostProcessor[] = [
  'GFPGAN',
  'CodeFormers',
  'RealESRGAN_x4plus',
  'RealESRGAN_x4plus_anime_6B',
  'NMKD_Siax',
  '4x_AnimeSharp',
  'strip_background',
];

/**
 * Upscaler post-processors offered as a single-choice "Upscale" control. A
 * subset of {@link POST_PROCESSORS}; picking one replaces any other upscaler in
 * the `post_processing` array so at most one runs.
 */
export const UPSCALERS: readonly ImagePostProcessor[] = [
  'RealESRGAN_x4plus',
  'RealESRGAN_x4plus_anime_6B',
  'NMKD_Siax',
  '4x_AnimeSharp',
];

/**
 * Face-fixer post-processors offered as a single-choice control. Selecting one
 * makes `facefixer_strength` meaningful (see {@link buildImageRequest}).
 */
export const FACE_FIXERS: readonly ImagePostProcessor[] = [
  'GFPGAN',
  'CodeFormers',
];

/** The background-strip post-processor, toggled independently of the above. */
export const STRIP_BACKGROUND: ImagePostProcessor = 'strip_background';

export const MIN_DIMENSION = 64;
export const MAX_DIMENSION = 3072;
export const DIMENSION_STEP = 64;
export const MIN_BATCH = 1;
export const MAX_BATCH = 10;

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

/** The ControlNet guidance modes offered in the source-image section. */
export const CONTROL_TYPES: readonly ImageControlType[] = [
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

export const MIN_DENOISE = 0.01;
export const MAX_DENOISE = 1;
export const DENOISE_STEP = 0.01;
export const DEFAULT_DENOISE = 0.75;

/** Top-level UI mode. Persisted for convenience but never sent to the API. */
export const GENERATE_MODES = ['simple', 'advanced'] as const;
export type GenerateMode = (typeof GENERATE_MODES)[number];

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

/** Horde LoRA/TI strength bounds (`model`, `clip`, TI `strength`): -5 to 5. */
export const MIN_LORA_STRENGTH = -5;
export const MAX_LORA_STRENGTH = 5;
export const DEFAULT_LORA_STRENGTH = 1;

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

export const MIN_HIRES_DENOISE = 0.01;
export const MAX_HIRES_DENOISE = 1;
export const DEFAULT_HIRES_DENOISE = 0.65;

/** Where the horde may auto-inject a textual inversion trigger. */
export const TI_INJECT_TARGETS = ['prompt', 'negprompt'] as const;
export type TiInjectTarget = (typeof TI_INJECT_TARGETS)[number];

/**
 * Post-processors that are face fixers; `facefixer_strength` is only meaningful
 * (and only emitted) when one of these is selected.
 */
const FACE_FIXER_POST_PROCESSORS: readonly ImagePostProcessor[] = [
  'GFPGAN',
  'CodeFormers',
];

/**
 * A persisted LoRA selection. `name` is the horde LoRA identifier: an exact name
 * or CivitAI model-page ID, or a CivitAI version ID when `is_version` is set.
 * `model` and `clip` are strengths in the -5..5 range.
 */
export interface FormLoraEntry {
  name: string;
  model: number;
  clip: number;
  inject_trigger?: string;
  is_version?: boolean;
  /** Friendly display name (e.g. from CivitAI); never sent to the horde. */
  label?: string;
}

/**
 * A persisted textual-inversion selection. `strength` is in the -5..5 range;
 * `inject_ti` asks the horde to add the embedding to the given prompt half.
 */
export interface FormTiEntry {
  name: string;
  strength: number;
  inject_ti?: TiInjectTarget;
  /** Friendly display name (e.g. from CivitAI); never sent to the horde. */
  label?: string;
}

/**
 * Total-pixel budget above which the form warns that the request may be slow or
 * rejected by workers. Chosen to sit above the common SDXL 1024x1024 baseline so
 * ordinary requests do not trip it.
 */
export const PIXEL_WARN_THRESHOLD = 1536 * 1536;

/** The base resolution family a set of aspect presets is scaled to. */
export type ModelSizeBase = 512 | 1024;

export interface AspectPreset {
  /** Transloco key for the preset button label. */
  labelKey: string;
  width: number;
  height: number;
}

const ASPECT_PRESETS: Record<ModelSizeBase, readonly AspectPreset[]> = {
  512: [
    { labelKey: 'generate.aspect.square', width: 512, height: 512 },
    { labelKey: 'generate.aspect.landscape_3_2', width: 768, height: 512 },
    { labelKey: 'generate.aspect.landscape_16_9', width: 896, height: 512 },
    { labelKey: 'generate.aspect.portrait_2_3', width: 512, height: 768 },
    { labelKey: 'generate.aspect.portrait_9_16', width: 512, height: 896 },
  ],
  1024: [
    { labelKey: 'generate.aspect.square', width: 1024, height: 1024 },
    { labelKey: 'generate.aspect.landscape_3_2', width: 1216, height: 832 },
    { labelKey: 'generate.aspect.landscape_16_9', width: 1344, height: 768 },
    { labelKey: 'generate.aspect.portrait_2_3', width: 832, height: 1216 },
    { labelKey: 'generate.aspect.portrait_9_16', width: 768, height: 1344 },
  ],
};

export function buildAspectPresets(
  base: ModelSizeBase,
): readonly AspectPreset[] {
  return ASPECT_PRESETS[base];
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

/** The aspect-preset family that suits `baseline`, or null when unknown. */
export function sizeBaseFor(baseline: string | null): ModelSizeBase | null {
  const native = nativeSquareFor(baseline);
  if (native === null) {
    return null;
  }
  return native <= 768 ? 512 : 1024;
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
 * as belonging to another baseline family. The bounds are asymmetric because the
 * aspect presets shrink the shorter side (down to 0.75x at 16:9) but never grow
 * it, while a size carried over from a larger family overshoots it outright.
 */
const NATIVE_SIZE_MIN_RATIO = 0.75;
const NATIVE_SIZE_MAX_RATIO = 1.5;

/** Whether `width`x`height` reads as belonging to the `native` square's family. */
export function sizeSuitsNativeSquare(
  native: number,
  width: number,
  height: number,
): boolean {
  const shortest = Math.min(width, height);
  return (
    shortest >= native * NATIVE_SIZE_MIN_RATIO &&
    shortest <= native * NATIVE_SIZE_MAX_RATIO
  );
}

/** Above this on either side an SD 1.5 model wants a hires pass to stay coherent. */
export const HIRES_WARN_DIMENSION = 768;

const REQUIREMENT_KEY_PREFIX = 'generate.form.requirement.';

/** The scheduler token the form's `karras` switch stands for. */
const KARRAS_SCHEDULER = 'karras';

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
 * Karras advice, read off the suggested schedulers. Absent schedulers say
 * nothing either way, so no line is shown; a list that names some other
 * scheduler is a positive statement that karras is not wanted.
 */
export function karrasRequirementHint(
  requirements: ModelRequirements | null,
  karras: boolean,
): RequirementHint | null {
  const schedulers = requirements?.schedulers;
  if (!schedulers || schedulers.length === 0) {
    return null;
  }
  const suggested = schedulers.some(
    (scheduler) => scheduler.trim().toLowerCase() === KARRAS_SCHEDULER,
  );
  return hint(suggested ? 'karras_on' : 'karras_off', {}, karras !== suggested);
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
): RequirementHint | null {
  const native = nativeSquareFor(baseline);
  if (native === null || sizeSuitsNativeSquare(native, width, height)) {
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
  /** UI mode only; not sent to the API. Simple mode drives generation via styles. */
  mode: GenerateMode;
  /** Selected style-preset name; '' means no style. */
  styleName: string;
  /** Sections the user opted out of the style for; see {@link StyleDetachState}. */
  styleDetach: StyleDetachState;
  prompt: string;
  negativePrompt: string;
  n: number;
  /** A single model name, or an empty string for "any model". */
  model: string;
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
  /** img2img/controlnet/inpainting denoise strength (0.01-1). */
  denoising_strength: number;
  /** ControlNet guidance mode; empty means unset (required for controlnet). */
  control_type: ImageControlType | '';
  image_is_control: boolean;
  return_control_map: boolean;
  karras: boolean;
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
  mode: 'simple',
  styleName: '',
  styleDetach: { style: '', sections: [] },
  prompt: '',
  negativePrompt: '',
  n: 1,
  model: '',
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
  denoising_strength: DEFAULT_DENOISE,
  control_type: '',
  image_is_control: false,
  return_control_map: false,
  karras: true,
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

/** Validate one persisted LoRA entry, returning null if it is malformed. */
function coerceLoraEntry(raw: unknown): FormLoraEntry | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  if (typeof source['name'] !== 'string' || source['name'].trim() === '') {
    return null;
  }
  const entry: FormLoraEntry = {
    name: source['name'],
    model: clampNumber(
      source['model'],
      MIN_LORA_STRENGTH,
      MAX_LORA_STRENGTH,
      DEFAULT_LORA_STRENGTH,
    ),
    clip: clampNumber(
      source['clip'],
      MIN_LORA_STRENGTH,
      MAX_LORA_STRENGTH,
      DEFAULT_LORA_STRENGTH,
    ),
  };
  if (
    typeof source['inject_trigger'] === 'string' &&
    source['inject_trigger'].trim() !== ''
  ) {
    entry.inject_trigger = source['inject_trigger'];
  }
  if (typeof source['is_version'] === 'boolean') {
    entry.is_version = source['is_version'];
  }
  if (typeof source['label'] === 'string' && source['label'].trim() !== '') {
    entry.label = source['label'];
  }
  return entry;
}

/** Validate one persisted textual-inversion entry, returning null if malformed. */
function coerceTiEntry(raw: unknown): FormTiEntry | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  if (typeof source['name'] !== 'string' || source['name'].trim() === '') {
    return null;
  }
  const entry: FormTiEntry = {
    name: source['name'],
    strength: clampNumber(
      source['strength'],
      MIN_LORA_STRENGTH,
      MAX_LORA_STRENGTH,
      DEFAULT_LORA_STRENGTH,
    ),
  };
  if (
    (TI_INJECT_TARGETS as readonly string[]).includes(
      source['inject_ti'] as string,
    )
  ) {
    entry.inject_ti = source['inject_ti'] as TiInjectTarget;
  }
  if (typeof source['label'] === 'string' && source['label'].trim() !== '') {
    entry.label = source['label'];
  }
  return entry;
}

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
    if (key === 'denoising_strength') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        merged.denoising_strength = Math.min(
          MAX_DENOISE,
          Math.max(MIN_DENOISE, value),
        );
      }
      continue;
    }
    if (key === 'styleDetach') {
      merged.styleDetach = coerceStyleDetach(value);
      continue;
    }
    if (key === 'mode') {
      if ((GENERATE_MODES as readonly string[]).includes(value as string)) {
        merged.mode = value as GenerateMode;
      }
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
    if (key === 'webhook') {
      if (typeof value === 'string') {
        merged.webhook = value.slice(0, MAX_WEBHOOK_LENGTH);
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
  return new FormGroup<GenerateFormControls>({
    mode: control(value.mode),
    styleName: control(value.styleName),
    styleDetach: control(value.styleDetach),
    prompt: control(value.prompt),
    negativePrompt: control(value.negativePrompt),
    n: control(value.n),
    model: control(value.model),
    sampler_name: control(value.sampler_name),
    steps: control(value.steps),
    cfg_scale: control(value.cfg_scale),
    clip_skip: control(value.clip_skip),
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
    denoising_strength: control(value.denoising_strength),
    control_type: control(value.control_type),
    image_is_control: control(value.image_is_control),
    return_control_map: control(value.return_control_map),
    karras: control(value.karras),
    facefixer_strength: control(value.facefixer_strength),
    hires_fix_denoising_strength: control(value.hires_fix_denoising_strength),
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
    rememberExtras: control(value.rememberExtras),
  });
}

/**
 * The fields the simple-mode UI exposes to the user. Width/height are included
 * because the aspect-ratio presets set them in simple mode; the rest are the
 * prompt, negative prompt, model, batch count, and selected style (plus any
 * per-section opt-outs from it, which the model and dimension locks offer here).
 */
export const SIMPLE_MODE_FIELDS = [
  'mode',
  'styleName',
  'styleDetach',
  'prompt',
  'negativePrompt',
  'n',
  'model',
  'width',
  'height',
] as const satisfies readonly (keyof GenerateFormValue)[];

/**
 * Project a form snapshot down to what simple mode submits. Simple mode keeps
 * only the {@link SIMPLE_MODE_FIELDS}; every advanced-only field is reset to its
 * default rather than carrying whatever a prior advanced-mode session persisted.
 * This is the least-surprising rule: switching to simple mode always yields a
 * clean request (default sampler/steps/cfg, no source image, no post-processing,
 * default worker/output options), and any style the user picked is still applied
 * on top afterwards via {@link buildStyledImageRequest}.
 */
export function simpleModeValue(value: GenerateFormValue): GenerateFormValue {
  const result: GenerateFormValue = { ...DEFAULT_GENERATE_FORM_VALUE };
  for (const key of SIMPLE_MODE_FIELDS) {
    // Index assignment is sound: each key copies the same-typed field across.
    (result as Record<keyof GenerateFormValue, unknown>)[key] = value[key];
  }
  return result;
}

/**
 * The fields a "reset all settings" leaves alone. The two prompts are the work
 * rather than a setting; `mode` is the panel's own detail level; `sourceMode`
 * stays because dropping it back to `none` would detach the image the reset
 * promises to keep (and, in simple mode, discard it outright).
 */
export const RESET_KEPT_FIELDS = [
  'prompt',
  'negativePrompt',
  'mode',
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
  // The horde default for karras is false, so only the enabled state is sent.
  if (value.karras) {
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
    FACE_FIXER_POST_PROCESSORS.includes(processor),
  );
  if (usesFaceFixer) {
    params.facefixer_strength = value.facefixer_strength;
  }
  if (value.loras.length > 0) {
    params.loras = value.loras.map(mapFormLora);
  }
  if (value.tis.length > 0) {
    params.tis = value.tis.map(mapFormTi);
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
        sourceProcessing = 'inpainting';
        params.denoising_strength = value.denoising_strength;
        break;
      // Remix weights its inputs through per-image `extra_source_images`
      // strengths rather than a denoise pass, so no denoising_strength is sent.
      case 'remix':
        sourceProcessing = 'remix';
        break;
    }
  }

  const qrText = value.qrText.trim();
  if (qrText) {
    params.workflow = 'qr_code';
    params.extra_texts = [{ text: qrText, reference: QR_CODE_TEXT_REFERENCE }];
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

  const model = value.model.trim();
  if (model) {
    request.models = [model];
  }
  return request;
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
    request.models = [forced.model];
  }
  return request;
}

/** Split a combined horde prompt back into its positive/negative halves. */
function splitCombinedPrompt(prompt: string): [string, string] {
  const index = prompt.indexOf(' ### ');
  if (index === -1) {
    return [prompt, ''];
  }
  return [prompt.slice(0, index).trim(), prompt.slice(index + 5).trim()];
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
 * re-attaches any source blob separately. The result opens in advanced mode so
 * every recovered field is visible and editable.
 */
export function requestToFormValue(
  request: ImageGenerationRequest,
): GenerateFormValue {
  const result: GenerateFormValue = { ...DEFAULT_GENERATE_FORM_VALUE };
  const params = request.params ?? {};

  const [positive, negative] = splitCombinedPrompt(request.prompt);
  result.prompt = positive;
  result.negativePrompt = negative;
  result.mode = 'advanced';
  result.styleName = '';

  if (request.models && request.models.length > 0) {
    result.model = request.models[0];
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
  result.karras = params.karras === true;
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

  if (request.source_processing === 'inpainting') {
    result.sourceMode = 'inpainting';
  } else if (request.source_processing === 'remix') {
    result.sourceMode = 'remix';
  } else if (request.source_processing === 'img2img') {
    result.sourceMode = params.control_type ? 'controlnet' : 'img2img';
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
    const qr = params.extra_texts.find(
      (entry) => entry.reference === QR_CODE_TEXT_REFERENCE,
    );
    if (qr && typeof qr.text === 'string') {
      result.qrText = qr.text;
    }
  }

  return result;
}
