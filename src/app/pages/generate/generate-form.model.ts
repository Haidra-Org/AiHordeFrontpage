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
 * `control_type` set; `inpainting` additionally carries a paint mask.
 */
export const SOURCE_MODES = [
  'none',
  'img2img',
  'controlnet',
  'inpainting',
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

/**
 * Flat, serialisable snapshot of the form. This is what is persisted to local
 * storage and what {@link buildImageRequest} maps into a horde request.
 */
export interface GenerateFormValue {
  /** UI mode only; not sent to the API. Simple mode drives generation via styles. */
  mode: GenerateMode;
  /** Selected style-preset name; '' means no style. */
  styleName: string;
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
}

export type GenerateFormControls = {
  [K in keyof GenerateFormValue]: FormControl<GenerateFormValue[K]>;
};

export type GenerateFormGroup = FormGroup<GenerateFormControls>;

export const DEFAULT_GENERATE_FORM_VALUE: GenerateFormValue = {
  mode: 'simple',
  styleName: '',
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
};

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
  });
}

/**
 * The fields the simple-mode UI exposes to the user. Width/height are included
 * because the aspect-ratio presets set them in simple mode; the rest are the
 * prompt, negative prompt, model, batch count, and selected style.
 */
export const SIMPLE_MODE_FIELDS = [
  'mode',
  'styleName',
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
 * Join a positive and negative prompt using the horde's `###` separator. An
 * empty negative prompt yields the positive prompt unchanged.
 */
export function combinePrompt(positive: string, negative: string): string {
  const p = positive.trim();
  const n = negative.trim();
  return n ? `${p} ### ${n}` : p;
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
    }
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

  if (forced.width !== undefined) params.width = forced.width;
  if (forced.height !== undefined) params.height = forced.height;
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
  if (forced.loras) params.loras = forced.loras;
  if (forced.tis) params.tis = forced.tis;

  request.params = params;
  if (forced.model !== undefined) {
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
  } else if (request.source_processing === 'img2img') {
    result.sourceMode = params.control_type ? 'controlnet' : 'img2img';
  } else {
    result.sourceMode = 'none';
  }

  return result;
}
