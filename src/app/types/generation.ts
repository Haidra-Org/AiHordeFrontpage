import {
  ImageSamplerName,
  ImagePostProcessor,
  StyleLoraConfig,
  StyleTextualInversionConfig,
} from './style';

// ============================================================================
// Image Generation Request Types
// ============================================================================

export interface ImageGenerationParams {
  sampler_name?: ImageSamplerName;
  cfg_scale?: number;
  denoising_strength?: number;
  seed?: string;
  height?: number;
  width?: number;
  seed_variation?: number;
  steps?: number;
  n?: number;
  post_processing?: ImagePostProcessor[];
  karras?: boolean;
  tiling?: boolean;
  hires_fix?: boolean;
  clip_skip?: number;
  facefixer_strength?: number;
  loras?: StyleLoraConfig[];
  tis?: StyleTextualInversionConfig[];
  workflow?: string;
  transparent?: boolean;
}

export interface ImageGenerationRequest {
  prompt: string;
  params?: ImageGenerationParams;
  nsfw?: boolean;
  censor_nsfw?: boolean;
  trusted_workers?: boolean;
  slow_workers?: boolean;
  workers?: string[];
  worker_blacklist?: boolean;
  models?: string[];
  source_image?: string;
  source_processing?: 'img2img' | 'inpainting' | 'outpainting';
  source_mask?: string;
  r2?: boolean;
  shared?: boolean;
  replacement_filter?: boolean;
  dry_run?: boolean;
  allow_downgrade?: boolean;
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
}

export type GenerationMetadataType =
  | 'lora'
  | 'ti'
  | 'censorship'
  | 'source_image'
  | 'source_mask'
  | 'extra_source_images'
  | 'batch_index'
  | 'information';

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
] as const;

/**
 * Forms that return a processed image (upscalers, face fixers, background
 * removal). The exact set is enforced server-side by AI-Horde's
 * KNOWN_POST_PROCESSORS.
 */
export const ALCHEMY_POST_PROCESSOR_FORMS = [
  'GFPGAN',
  'GFPGANv1.3',
  'CodeFormers',
  'RestoreFormer',
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
  'strip_background',
] as const;

export type AlchemyDataFormName = (typeof ALCHEMY_DATA_FORMS)[number];
export type AlchemyPostProcessorFormName =
  (typeof ALCHEMY_POST_PROCESSOR_FORMS)[number];
export type AlchemyFormName =
  | AlchemyDataFormName
  | AlchemyPostProcessorFormName;

// --- Request types ---------------------------------------------------------

export interface InterrogationForm {
  name: AlchemyFormName;
  payload?: Record<string, unknown>;
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
  describe?: string;
  interrogation?: InterrogationDetails;
  [key: string]: unknown;
}

export interface AlchemyForm {
  form: string;
  state: string;
  result?: AlchemyFormResult;
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
