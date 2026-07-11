import { FormControl, FormGroup } from '@angular/forms';
import {
  ImageControlType,
  ImageGenerationParams,
  ImageGenerationRequest,
  ImageSourceProcessing,
} from '../../types/generation';
import { ImagePostProcessor, ImageSamplerName } from '../../types/style';

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
}

export type GenerateFormControls = {
  [K in keyof GenerateFormValue]: FormControl<GenerateFormValue[K]>;
};

export type GenerateFormGroup = FormGroup<GenerateFormControls>;

export const DEFAULT_GENERATE_FORM_VALUE: GenerateFormValue = {
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
};

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
  });
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
  }
  if (value.tiling) {
    params.tiling = true;
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

  const model = value.model.trim();
  if (model) {
    request.models = [model];
  }
  return request;
}
