/**
 * Style types for AI Horde styles API.
 * Styles are prompt templates with pre-configured parameters.
 */

// ============================================================================
// Shared Types
// ============================================================================

/**
 * Example image attached to an image style.
 */
export interface StyleExample {
  /** Unique identifier for the example. */
  id: string;
  /** URL to the example image. */
  url: string;
  /** Whether this is the primary example displayed in listings. */
  primary?: boolean;
}

/**
 * LoRA (Low-Rank Adaptation) configuration for image styles.
 */
export interface StyleLoraConfig {
  /** The exact name or CivitAI ID of the LoRA. */
  name: string;
  /** The strength of the LoRA to apply. Default: 1. */
  model?: number;
  /** The strength of the CLIP LoRA. Default: 1. */
  clip?: number;
  /** If true, will inject trigger into prompt. */
  inject_trigger?: string;
  /** If true, the lora will only be downloaded if it matches this SHA256. */
  sha256?: string;
  /** If true, the lora will only be used if model is SDXL. */
  is_version?: boolean;
}

/**
 * Textual Inversion (embedding) configuration for image styles.
 */
export interface StyleTextualInversionConfig {
  /** The exact name of the textual inversion. */
  name: string;
  /** The strength to apply. Default: 1. */
  strength?: number;
  /** If true, will inject trigger into prompt. */
  inject_ti?: string;
}

// ============================================================================
// Image Style Types
// ============================================================================

/**
 * Sampler names available for image generation.
 */
export type ImageSamplerName =
  | 'k_euler'
  | 'k_euler_a'
  | 'k_heun'
  | 'k_dpm_2'
  | 'k_dpm_2_a'
  | 'k_dpmpp_2s_a'
  | 'k_dpmpp_2m'
  | 'k_dpmpp_sde'
  | 'dpmsolver'
  | 'k_lms'
  | 'DDIM'
  | 'lcm';

/**
 * Post-processing options for image generation.
 */
export type ImagePostProcessor =
  | 'GFPGAN'
  | 'RealESRGAN_x4plus'
  | 'RealESRGAN_x2plus'
  | 'RealESRGAN_x4plus_anime_6B'
  | 'NMKD_Siax'
  | 'CodeFormers'
  | '4x_AnimeSharp'
  | 'strip_background';

/**
 * Parameters for image style generation.
 */
export interface ImageStyleParams {
  /** The sampler to use for generation. */
  sampler_name?: ImageSamplerName;
  /** Classifier-Free Guidance scale. Range: 0-100, Default: 7.5 */
  cfg_scale?: number;
  /** Denoising strength for img2img. Range: 0.01-1.0 */
  denoising_strength?: number;
  /** Image height in pixels. Range: 64-3072, must be multiple of 64. */
  height?: number;
  /** Image width in pixels. Range: 64-3072, must be multiple of 64. */
  width?: number;
  /** Number of sampling steps. Range: 1-500. */
  steps?: number;
  /** Post-processing operations to apply. */
  post_processing?: ImagePostProcessor[];
  /** Whether to use Karras noise schedule. */
  karras?: boolean;
  /** Whether to generate tileable images. */
  tiling?: boolean;
  /** Whether to apply hires fix for upscaling. */
  hires_fix?: boolean;
  /** CLIP skip layers. Range: 1-12. */
  clip_skip?: number;
  /** Face fixer strength. Range: 0-1.0. */
  facefixer_strength?: number;
  /** LoRA configurations to apply. */
  loras?: StyleLoraConfig[];
  /** Textual inversion configurations to apply. */
  tis?: StyleTextualInversionConfig[];
  /** Workflow name for special generation modes (e.g., "qr_code"). */
  workflow?: string;
  /** Whether to generate images with transparent backgrounds. */
  transparent?: boolean;
}

/**
 * An image generation style (Stable Diffusion).
 */
export interface ImageStyle {
  /** Unique identifier for the style. */
  id: string;
  /** Display name of the style. 1-100 characters, unique per user. */
  name: string;
  /** Description of what the style does. 10-1000 characters. */
  info?: string;
  /** Prompt template. Must include {p} for positive and {np} for negative prompt. */
  prompt: string;
  /** Generation parameters. */
  params?: ImageStyleParams;
  /** Whether this style is publicly listed. */
  public: boolean;
  /** Whether this style contains NSFW content. */
  nsfw: boolean;
  /** Tags for categorization. Each tag 1-25 characters. */
  tags?: string[];
  /** Compatible model names. */
  models?: string[];
  /** Shared key ID to use for generation. */
  sharedkey?: string;
  /** Number of times this style has been used. */
  use_count: number;
  /** Creator username in format "alias#id". */
  creator: string;
  /** Example images demonstrating the style. */
  examples?: StyleExample[];
}

// ============================================================================
// Text Style Types
// ============================================================================

/**
 * Parameters for text style generation (LLM).
 */
export interface TextStyleParams {
  /** Add a leading space to the generation. */
  frmtadsnsp?: boolean;
  /** Replace consecutive newlines with single newlines. */
  frmtrmblln?: boolean;
  /** Remove special characters from output. */
  frmtrmspch?: boolean;
  /** Trim incomplete sentences from output. */
  frmttriminc?: boolean;
  /** Repetition penalty. Range: 1-3. */
  rep_pen?: number;
  /** Repetition penalty range in tokens. Range: 0-4096. */
  rep_pen_range?: number;
  /** Repetition penalty slope. Range: 0-10. */
  rep_pen_slope?: number;
  /** Stop generation after a single line. */
  singleline?: boolean;
  /** Sampling temperature. Range: 0-5.0. */
  temperature?: number;
  /** Tail-free sampling parameter. Range: 0-1.0. */
  tfs?: number;
  /** Top-A sampling parameter. Range: 0-1.0. */
  top_a?: number;
  /** Top-K sampling parameter. Range: 0-200. */
  top_k?: number;
  /** Top-P (nucleus) sampling parameter. Range: 0.001-1.0. */
  top_p?: number;
  /** Typical sampling parameter. Range: 0-1.0. */
  typical?: number;
  /** Custom sampler order. Array of sampler indices. */
  sampler_order?: number[];
  /** Whether to use default bad word IDs. */
  use_default_badwordsids?: boolean;
  /** Stop sequences that end generation. */
  stop_sequence?: string[];
  /** Min-P sampling parameter. Range: 0-1.0. */
  min_p?: number;
  /** Smoothing factor for sampling. Range: 0-10.0. */
  smoothing_factor?: number;
  /** Dynamic temperature range. Range: 0-5.0. */
  dynatemp_range?: number;
  /** Dynamic temperature exponent. Range: 0-5.0. */
  dynatemp_exponent?: number;
}

/**
 * A text generation style (LLM/Kobold).
 */
export interface TextStyle {
  /** Unique identifier for the style. */
  id: string;
  /** Display name of the style. 1-100 characters, unique per user. */
  name: string;
  /** Description of what the style does. 10-1000 characters. */
  info?: string;
  /** Prompt template. Must include {p} placeholder. */
  prompt: string;
  /** Generation parameters. */
  params?: TextStyleParams;
  /** Whether this style is publicly listed. */
  public: boolean;
  /** Whether this style contains NSFW content. */
  nsfw: boolean;
  /** Tags for categorization. Each tag 1-25 characters. */
  tags?: string[];
  /** Compatible model names. */
  models?: string[];
  /** Number of times this style has been used. */
  use_count: number;
  /** Creator username in format "alias#id". */
  creator: string;
}

// ============================================================================
// Union & Discriminated Types
// ============================================================================

/**
 * Style type discriminator.
 */
export type StyleType = 'image' | 'text';

/**
 * Union type for any style.
 * Use isImageStyle/isTextStyle type guards to narrow.
 */
export type Style = ImageStyle | TextStyle;

/**
 * Type guard to check if a style is an image style.
 */
export function isImageStyle(style: Style): style is ImageStyle {
  // Image styles have examples array; text styles do not
  return 'examples' in style || 'sharedkey' in style;
}

/**
 * Type guard to check if a style is a text style.
 */
export function isTextStyle(style: Style): style is TextStyle {
  return !isImageStyle(style);
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Response from style creation or update operations.
 */
export interface StyleModifyResponse {
  /** The ID of the created or modified style. */
  id: string;
  /** Informational message from the horde. */
  message?: string;
  /** Any warnings generated during the operation. */
  warnings?: StyleWarning[];
}

/**
 * Warning returned from style operations.
 */
export interface StyleWarning {
  /** Warning code. */
  code: string;
  /** Human-readable warning message. */
  message: string;
}

/**
 * Normalized API error shape for style requests.
 */
export interface StyleApiError {
  status: number;
  message: string;
  rc?: string;
}
