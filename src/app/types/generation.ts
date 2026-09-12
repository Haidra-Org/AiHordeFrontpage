import {
  IMAGE_POST_PROCESSORS,
  ImageSamplerName,
  ImagePostProcessor,
  StyleLoraConfig,
  StyleTextualInversionConfig,
} from './style';
import type { ImageSchedulerName } from './sampler-constraints';

// ============================================================================
// Image Generation Request Types
// ============================================================================

/**
 * ControlNet guidance modes accepted by the AI Horde `control_type` param.
 * Mirrors the enum on `ModelPayloadStyleStable` in the v2 swagger.
 */
export const ANNOTATION_CONTROL_TYPES = [
  'canny',
  'hed',
  'depth',
  'mlsd',
  'openpose',
  'normal',
  'scribble',
  'fakescribbles',
  'seg',
  'binary',
  'standard_lineart',
  'lineart',
  'lineart_anime',
  'lineart_anime_denoise',
  'pidinet',
  'scribble_xdog',
  'scribble_pidinet',
  'teed',
  'pyracanny',
  'midas_depth',
  'zoe_depth',
  'depth_anything',
  'depth_anything_v2',
  'normal_bae',
  'oneformer_ade20k',
  'oneformer_coco',
  'color',
  'shuffle',
  'recolor_luminance',
  'recolor_intensity',
  'tile',
  'tile_ttplanet_guided',
  'tile_ttplanet_simple',
] as const;

export type AnnotationControlType = (typeof ANNOTATION_CONTROL_TYPES)[number];

/** Image generation additionally accepts the legacy `hough` alias for `mlsd`. */
export type ImageControlType = AnnotationControlType | 'hough';

/**
 * The ways a `source_image` may be interpreted. `remix` feeds the source into
 * a compositional remix workflow rather than a denoise-from-source pass.
 */
export type ImageSourceProcessing =
  | 'img2img'
  | 'inpainting'
  | 'outpainting'
  | 'remix';

/**
 * Named special-purpose generation workflows. The horde currently constrains
 * `params.workflow` to this single value (see `ModelPayloadStyleStable`); the
 * `qr_code` workflow pairs with {@link ImageGenerationExtraText} entries that
 * carry the QR payload.
 */
export type ImageWorkflowName = 'qr_code';

/**
 * A keyed free-text entry carried alongside a workflow (for example the string a
 * `qr_code` workflow should encode). `reference` names which slot the worker
 * should read the text into.
 */
export interface ImageGenerationExtraText {
  text: string;
  reference: string;
}

/**
 * Auxiliary source image for remix-style workflows, submitted as base64 webp.
 * `strength` weights how strongly it influences the result (server default 1).
 */
export interface ImageExtraSourceImage {
  image: string;
  strength?: number;
}

export interface ImageGenerationParams {
  sampler_name?: ImageSamplerName;
  cfg_scale?: number;
  denoising_strength?: number;
  /** Denoise strength applied during the hires-fix upscaling pass (0.01-1). */
  hires_fix_denoising_strength?: number;
  seed?: string;
  height?: number;
  width?: number;
  /** Per-image seed increment when `n` > 1 (1-1000). */
  seed_variation?: number;
  steps?: number;
  n?: number;
  post_processing?: ImagePostProcessor[];
  karras?: boolean;
  scheduler?: ImageSchedulerName;
  sampler_eta?: number;
  sampler_s_noise?: number;
  sampler_s_churn?: number;
  sampler_s_tmin?: number;
  sampler_s_tmax?: number;
  sampler_order?: number;
  sampler_solver_type?: string;
  flow_shift?: number;
  tiling?: boolean;
  hires_fix?: boolean;
  clip_skip?: number;
  facefixer_strength?: number;
  loras?: StyleLoraConfig[];
  tis?: StyleTextualInversionConfig[];
  workflow?: ImageWorkflowName;
  /** Free-text payload consumed by the active `workflow` (for example qr_code). */
  extra_texts?: ImageGenerationExtraText[];
  transparent?: boolean;
  control_type?: ImageControlType;
  /**
   * How hard the control map holds the render (0.01-3). Only accepted beside a
   * `control_type`; left out, the worker renders at its own default of 1.
   */
  control_strength?: number;
  /** Treat `source_image` as an already-computed control map (skip annotation). */
  image_is_control?: boolean;
  /** Return the derived control map instead of a generated image; no render happens. */
  return_control_map?: boolean;
}

export interface ImageGenerationRequest {
  prompt: string;
  params?: ImageGenerationParams;
  nsfw?: boolean;
  censor_nsfw?: boolean;
  trusted_workers?: boolean;
  slow_workers?: boolean;
  /** Opt in to workers flagged as very slow (extends reach, raises latency). */
  extra_slow_workers?: boolean;
  workers?: string[];
  worker_blacklist?: boolean;
  models?: string[];
  source_image?: string;
  source_processing?: ImageSourceProcessing;
  source_mask?: string;
  /** Additional source images for remix workflows. */
  extra_source_images?: ImageExtraSourceImage[];
  r2?: boolean;
  shared?: boolean;
  replacement_filter?: boolean;
  /** Trusted/Patreon-only: disable batching so returned seeds stay accurate. */
  disable_batching?: boolean;
  dry_run?: boolean;
  allow_downgrade?: boolean;
  /** URL the horde POSTs to when the request finishes. */
  webhook?: string;
  /** Server-side style reference (name or ID) the horde applies to the request. */
  style?: string;
}

// ============================================================================
// Image Generation Response Types
// ============================================================================

export interface ImageGenerationResponse {
  id: string;
  kudos: number;
  message?: string;
}

export interface GenerationCheckResponse {
  finished: number;
  processing: number;
  restarted: number;
  waiting: number;
  done: boolean;
  faulted: boolean;
  wait_time: number;
  queue_position: number;
  kudos: number;
  is_possible: boolean;
  eligible_workers?: number;
  eligible_worker_threads?: number;
  might_stall?: boolean;
}

/**
 * Normalized transport error surfaced by the `*Result` service methods so the
 * generation queue engine can branch on the HTTP status (for example, a 429
 * that should trigger a submit backoff) instead of collapsing every failure to
 * `null` like the fire-and-forget methods do.
 */
export interface HordeApiError {
  /** HTTP status, or 0 when the failure was not an HTTP response. */
  status: number;
  message: string;
  /**
   * The horde's own return code for the refusal, where it sent one. It names
   * what was wrong in a stable way the sentence does not, which is what lets a
   * rejection be shown at the control it is about.
   */
  rc?: string;
}

/**
 * The horde's return codes the studio has its own sentence for, and the line it
 * says instead. The horde's own message is written for every client of the API
 * at once; where the refusal is about a control the studio actually offers, the
 * studio can name that control in the words the rest of the page uses.
 *
 * The map is deliberately partial. A code is listed only when a studio control
 * can produce it and a plainer sentence loses nothing: codes whose message
 * carries a number the studio does not know (the accepted range of a sampler
 * knob, for instance) are left off so the horde's own wording, which has the
 * number in it, is what the reader sees.
 */
const REJECTION_COPY_KEYS: ReadonlyMap<string, string> = new Map([
  // Kudos and how much may be asked for at once
  ['KudosUpfront', 'generate.reject.kudos_upfront'],
  ['TooManyPrompts', 'generate.reject.too_many_prompts'],
  ['SharedKeyEmpty', 'generate.reject.shared_key_empty'],
  ['SharedKeyInsufficientKudos', 'generate.reject.shared_key_kudos'],
  ['SharedKeyExpired', 'generate.reject.shared_key_expired'],
  // The key the request was sent with, and what the horde is doing
  ['InvalidAPIKey', 'generate.reject.invalid_api_key'],
  ['AnonForbidden', 'generate.reject.anon_forbidden'],
  ['MaintenanceMode', 'generate.reject.maintenance'],
  // The prompt
  ['MissingPrompt', 'generate.reject.missing_prompt'],
  ['CorruptPrompt', 'generate.reject.corrupt_prompt'],
  ['InvalidPromptSize', 'generate.reject.prompt_too_long'],
  ['InvalidPromptEncoding', 'generate.reject.prompt_encoding'],
  // Size and the sampling knobs
  ['InvalidSize', 'generate.reject.invalid_size'],
  ['TooManySteps', 'generate.reject.too_many_steps'],
  ['MissingFullSamplerOrder', 'generate.reject.sampler_order_incomplete'],
  // What the chosen model will and will not do
  ['UnexpectedModelName', 'generate.reject.not_an_image_model'],
  ['UnsupportedSampler', 'generate.reject.sampler_model_mismatch'],
  ['SourceImageRequiredForModel', 'generate.reject.model_needs_source'],
  ['Img2ImgMismatch', 'generate.reject.img2img_mismatch'],
  ['TilingMismatch', 'generate.reject.tiling_mismatch'],
  ['HiResMismatch', 'generate.reject.hires_mismatch'],
  ['HiResFixMismatch', 'generate.reject.hires_mismatch'],
  ['InvalidRemixModel', 'generate.reject.remix_mismatch'],
  ['NoValidWorkers', 'generate.reject.no_valid_workers'],
  // Guidance from a picture
  ['ControlNetUnsupported', 'generate.reject.control_unsupported'],
  ['ControlNetMismatch', 'generate.reject.control_unsupported'],
  ['ControlNetSourceMissing', 'generate.reject.control_needs_source'],
  ['ControlNetInpaintingMismatch', 'generate.reject.control_inpainting'],
  ['InvalidControlType', 'generate.reject.control_type_unknown'],
  [
    'ControlStrengthWithoutControlType',
    'generate.reject.control_strength_alone',
  ],
  // The picture the request was built on
  ['SourceImageResolutionExceeded', 'generate.reject.source_too_large'],
  ['SourceImageSizeExceeded', 'generate.reject.source_file_too_big'],
  ['SourceImageUnreadable', 'generate.reject.source_unreadable'],
  ['SourceImageUrlInvalid', 'generate.reject.source_url_invalid'],
  ['InpaintingMissingMask', 'generate.reject.inpainting_needs_mask'],
  // Add-ons and extra pictures
  ['TooManyLoras', 'generate.reject.too_many_loras'],
  ['TooManyTIs', 'generate.reject.too_many_tis'],
  ['BadLoraVersion', 'generate.reject.bad_lora_version'],
  ['TooManyUpscalers', 'generate.reject.too_many_upscalers'],
  ['TooManyExtraSourceImages', 'generate.reject.too_many_extras'],
  ['MoreThanMinExtraSourceImage', 'generate.reject.extras_need_trust'],
  // Transparent output
  ['InvalidTransparencyModel', 'generate.reject.transparency_model'],
  ['InvalidTransparencyCN', 'generate.reject.transparency_control'],
  ['InvalidTransparencyImg2Img', 'generate.reject.transparency_img2img'],
]);

/**
 * The studio's own line for a refusal, or undefined when it has none and the
 * horde's sentence is what should be shown.
 */
export function hordeRejectionKey(rc: string | undefined): string | undefined {
  return rc ? REJECTION_COPY_KEYS.get(rc) : undefined;
}

export type SubmitImageResult =
  | { kind: 'success'; response: ImageGenerationResponse }
  | { kind: 'error'; error: HordeApiError };

export type SubmitInterrogationResult =
  | { kind: 'success'; response: InterrogationResponse }
  | { kind: 'error'; error: HordeApiError };

export type CheckImageResult =
  | { kind: 'success'; check: GenerationCheckResponse }
  | { kind: 'not_found' }
  | { kind: 'error'; error: HordeApiError };

export type GenerationMetadataType =
  | 'lora'
  | 'ti'
  | 'censorship'
  | 'source_image'
  | 'source_mask'
  | 'extra_source_images'
  | 'batch_index'
  | 'information'
  // Newer workers report the LAION aesthetic score here; the numeric score is
  // carried in `ref` (with value `see_ref`).
  | 'aesthetic_score';

export type GenerationMetadataValue =
  | 'download_failed'
  | 'parse_failed'
  | 'baseline_mismatch'
  | 'csam'
  | 'nsfw'
  | 'see_ref';

export interface GenerationMetadataStable {
  type: GenerationMetadataType;
  value: GenerationMetadataValue;
  ref?: string;
}

export interface GenerationOutput {
  img: string;
  seed: string;
  id: string;
  censored: boolean;
  model: string;
  state: 'ok' | 'censored' | 'faulted' | 'csam';
  worker_id: string;
  worker_name: string;
  gen_metadata?: GenerationMetadataStable[];
}

export interface GenerationStatusResponse extends GenerationCheckResponse {
  generations: GenerationOutput[];
}

// ============================================================================
// Text Generation Response Types
// ============================================================================

export interface TextGenerationOutput {
  text: string;
  model: string;
  seed: number;
  state: string;
  worker_id: string;
  worker_name: string;
  gen_metadata?: GenerationMetadataStable[];
}

export interface TextGenerationStatusResponse {
  finished: number;
  processing: number;
  restarted: number;
  waiting: number;
  done: boolean;
  faulted: boolean;
  wait_time: number;
  queue_position: number;
  kudos: number;
  is_possible: boolean;
  generations: TextGenerationOutput[];
}

/** The sampling knobs a text request carries; the horde's own names. */
export interface TextGenerationParams {
  /** How many answers to ask for at once (1-20). */
  n?: number;
  max_context_length?: number;
  max_length?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  rep_pen?: number;
  singleline?: boolean;
  stop_sequence?: string[];
}

export interface TextGenerationRequest {
  prompt: string;
  params?: TextGenerationParams;
  /** Models allowed to answer; absent means any. */
  models?: string[];
  slow_workers?: boolean;
  trusted_workers?: boolean;
  /** Price the request and queue nothing; the answer is the kudos alone. */
  dry_run?: boolean;
  /**
   * Server-side style reference (id or name). The horde then supplies the
   * template, the sampling parameters and the models itself.
   */
  style?: string;
}

/**
 * What a priced request answers with. A dry run carries no id because nothing
 * was queued, so it is a shape of its own rather than a text response with
 * holes in it.
 */
export interface TextGenerationDryRunResponse {
  kudos: number;
  message?: string;
}

export interface TextGenerationResponse {
  id: string;
  kudos: number;
  message?: string;
}

export type SubmitTextGenerationResult =
  | { kind: 'success'; response: TextGenerationResponse }
  | { kind: 'error'; error: HordeApiError };

// ============================================================================
// Alchemy (Interrogation) Types
// ============================================================================

/**
 * Forms that return textual/structured data about the source image.
 */
export const ALCHEMY_DATA_FORMS = [
  'caption',
  'interrogation',
  'nsfw',
  'vectorize',
  'palette',
  'describe',
  'aesthetic',
] as const;

/**
 * Forms that return a processed image (upscalers, face fixers, background
 * removal). The same vocabulary image generation offers as `post_processing`,
 * so both read from one list.
 */
export const ALCHEMY_POST_PROCESSOR_FORMS = IMAGE_POST_PROCESSORS;

/**
 * Annotation is separate from data and post-processing because it needs a
 * detector payload and returns an image intended for a later generation. That
 * distinction keeps generic form builders from silently dropping the payload.
 */
export const ALCHEMY_ANNOTATION_FORMS = ['annotation'] as const;

export type AlchemyDataFormName = (typeof ALCHEMY_DATA_FORMS)[number];
export type AlchemyPostProcessorFormName =
  (typeof ALCHEMY_POST_PROCESSOR_FORMS)[number];
/** A form the studio can put in an `/interrogate/async` request. */
export type AlchemyFormName =
  | AlchemyDataFormName
  | AlchemyPostProcessorFormName
  | (typeof ALCHEMY_ANNOTATION_FORMS)[number];
/** A form the documentation describes. */
export type AlchemyDocumentedFormName = AlchemyFormName;

// --- Request types ---------------------------------------------------------

export interface InterrogationForm {
  name: AlchemyFormName;
  payload?: { control_type: AnnotationControlType };
}

export interface InterrogationRequest {
  forms: InterrogationForm[];
  /** A public image URL or a bare base64-encoded image (no data-URL prefix). */
  source_image: string;
  slow_workers?: boolean;
}

export interface InterrogationResponse {
  id: string;
  /** Only returned for registered API keys, not anonymous submissions. */
  kudos?: number;
  message?: string;
}

// --- Response types --------------------------------------------------------

/** A single `{ text, confidence }` entry within an interrogation result. */
export interface InterrogationTag {
  text: string;
  confidence: number;
}

/**
 * The `interrogation` form result. Every section is optional because workers
 * may omit empty sections; unknown sections are tolerated via the index
 * signature.
 */
export interface InterrogationDetails {
  tags?: InterrogationTag[];
  sites?: InterrogationTag[];
  artists?: InterrogationTag[];
  flavors?: InterrogationTag[];
  mediums?: InterrogationTag[];
  movements?: InterrogationTag[];
  techniques?: InterrogationTag[];
  [section: string]: InterrogationTag[] | undefined;
}

/**
 * Per-form result. Modeled permissively: the known keys are typed, but the
 * base remains an open record so an unexpected worker payload never breaks
 * rendering (the UI falls back to a raw-JSON view). Post-processor forms set a
 * key matching the form name to the processed image URL.
 */
export interface AlchemyFormResult {
  caption?: string;
  nsfw?: boolean;
  vectorize?: string;
  palette?: unknown;
  /** A record of named fields; readers accept nothing else. */
  describe?: string | Record<string, unknown>;
  interrogation?: InterrogationDetails;
  [key: string]: unknown;
}

export interface AlchemyForm {
  form: string;
  state: string;
  result?: AlchemyFormResult;
  /**
   * The request payload the form was submitted with, echoed back. Only the
   * control-map form carries one, and only servers new enough to echo it: it is
   * what tells two annotation forms in the same job apart.
   */
  payload?: { control_type: AnnotationControlType };
}

export interface AlchemyStatusResponse {
  state: string;
  forms?: AlchemyForm[];
}

// ============================================================================
// Internal Tracking Types
// ============================================================================

export type GenerationType = 'image' | 'text' | 'alchemy';

export interface TrackedGeneration {
  id: string;
  type: GenerationType;
  check: GenerationCheckResponse | null;
  result:
    | GenerationStatusResponse
    | TextGenerationStatusResponse
    | AlchemyStatusResponse
    | null;
  done: boolean;
  faulted: boolean;
  notFound?: boolean;
  firstSeenAt: number;
  /** The original request payload, stored when submitted via the Quick Image Generator. */
  sentRequest?: ImageGenerationRequest;
}

/**
 * Sentinel returned by AiHordeService check/status methods when the API
 * responds with 404 (generation no longer exists).
 */
export const GENERATION_NOT_FOUND = Symbol('GENERATION_NOT_FOUND');
