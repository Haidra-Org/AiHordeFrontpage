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
// Alchemy (Interrogation) Response Types
// ============================================================================

export interface AlchemyForm {
  form: string;
  state: string;
  result?: Record<string, unknown>;
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
  result: GenerationStatusResponse | TextGenerationStatusResponse | AlchemyStatusResponse | null;
  done: boolean;
  faulted: boolean;
  firstSeenAt: number;
  /** The original request payload, stored when submitted via the Quick Image Generator. */
  sentRequest?: ImageGenerationRequest;
}
