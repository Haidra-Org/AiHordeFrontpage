import type {
  ImagePostProcessor,
  ImageSamplerName,
  ImageStyle,
  ImageStyleParams,
  StyleExample,
  StyleLoraConfig,
  StyleTextualInversionConfig,
} from '../types/style';
import type { HordeStylePreset } from './horde-styles.service';

/**
 * Where a style came from. The two catalogues are read the same way once they
 * are records, but they are addressed differently (a preset by its name, a
 * published style by its id), so the origin has to survive normalisation.
 */
export type StyleSource = 'curated' | 'native';

/** The separator between a record key's source and its value. */
const KEY_SEPARATOR = ':';

/**
 * One style, whichever catalogue it came from.
 *
 * `params` is the published-style parameter shape because it is the wider of
 * the two: every preset field has a home in it, and the extra fields a
 * published style may carry (denoise, post-processing, tiling, face fixing,
 * workflow, transparency) would have nowhere to go in the preset shape.
 */
export interface StyleRecord {
  source: StyleSource;
  /** `curated:<name>` or `native:<id>`; see {@link styleRecordKey}. */
  key: string;
  /** The published style's id. Absent for a preset, which has only a name. */
  id?: string;
  name: string;
  /** Template carrying the `{p}` and `{np}` placeholders. */
  prompt: string;
  params: ImageStyleParams;
  /** Every model the style declares; empty when it names none. */
  models: string[];
  nsfw?: boolean;
  tags?: string[];
  creator?: string;
  info?: string;
  examples?: StyleExample[];
  sharedkey?: string;
}

/**
 * The key a style is stored, grouped and counted under. Source-qualified so a
 * preset and a published style that happen to share a name never merge.
 */
export function styleRecordKey(source: StyleSource, value: string): string {
  return `${source}${KEY_SEPARATOR}${value}`;
}

/**
 * Read a key back into its parts, or null when the text is not one. Only the
 * first separator is a separator, so a name containing a colon survives.
 */
export function parseStyleRecordKey(
  key: string,
): { source: StyleSource; value: string } | null {
  const index = key.indexOf(KEY_SEPARATOR);
  if (index <= 0) {
    return null;
  }
  const source = key.slice(0, index);
  const value = key.slice(index + 1);
  if (value === '' || (source !== 'curated' && source !== 'native')) {
    return null;
  }
  return { source, value };
}

/**
 * Read a stored style selection. Selections written before styles carried a
 * source hold a bare preset name, which is what a bare value still means, so
 * one reading serves both. An empty value stays empty: no style is selected.
 */
export function storedStyleKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return '';
  }
  return parseStyleRecordKey(trimmed) === null
    ? styleRecordKey('curated', trimmed)
    : trimmed;
}

function mapPresetLoras(
  loras: HordeStylePreset['loras'],
): StyleLoraConfig[] | undefined {
  if (!loras || loras.length === 0) {
    return undefined;
  }
  return loras.map((lora) => {
    const mapped: StyleLoraConfig = { name: lora.name };
    if (typeof lora.model === 'number') mapped.model = lora.model;
    if (typeof lora.clip === 'number') mapped.clip = lora.clip;
    if (lora.inject_trigger) mapped.inject_trigger = lora.inject_trigger;
    if (lora.is_version) mapped.is_version = lora.is_version;
    return mapped;
  });
}

function mapPresetTis(
  tis: HordeStylePreset['tis'],
): StyleTextualInversionConfig[] | undefined {
  if (!tis || tis.length === 0) {
    return undefined;
  }
  return tis.map((ti) => {
    const mapped: StyleTextualInversionConfig = { name: ti.name };
    if (typeof ti.strength === 'number') mapped.strength = ti.strength;
    if (ti.inject_ti) mapped.inject_ti = ti.inject_ti;
    return mapped;
  });
}

/** Normalise one entry of the preset catalogue. */
export function fromPreset(
  name: string,
  preset: HordeStylePreset,
): StyleRecord {
  const params: ImageStyleParams = {};
  if (preset.width !== undefined) params.width = preset.width;
  if (preset.height !== undefined) params.height = preset.height;
  if (preset.steps !== undefined) params.steps = preset.steps;
  if (preset.cfg_scale !== undefined) params.cfg_scale = preset.cfg_scale;
  if (preset.sampler_name !== undefined) {
    params.sampler_name = preset.sampler_name;
  }
  if (preset.clip_skip !== undefined) params.clip_skip = preset.clip_skip;
  if (preset.karras !== undefined) params.karras = preset.karras;
  if (preset.hires_fix !== undefined) params.hires_fix = preset.hires_fix;
  const loras = mapPresetLoras(preset.loras);
  if (loras) params.loras = loras;
  const tis = mapPresetTis(preset.tis);
  if (tis) params.tis = tis;

  return {
    source: 'curated',
    key: styleRecordKey('curated', name),
    name,
    prompt: preset.prompt,
    params,
    models:
      preset.model === undefined || preset.model === '' ? [] : [preset.model],
  };
}

/** Normalise one published image style. */
export function fromNativeImageStyle(style: ImageStyle): StyleRecord {
  const record: StyleRecord = {
    source: 'native',
    key: styleRecordKey('native', style.id),
    id: style.id,
    name: style.name,
    prompt: style.prompt,
    params: style.params ? { ...style.params } : {},
    models: style.models ? [...style.models] : [],
    nsfw: style.nsfw,
  };
  if (style.tags && style.tags.length > 0) record.tags = [...style.tags];
  if (style.creator) record.creator = style.creator;
  if (style.info) record.info = style.info;
  if (style.examples && style.examples.length > 0) {
    record.examples = [...style.examples];
  }
  if (style.sharedkey) record.sharedkey = style.sharedkey;
  return record;
}

/**
 * Generation parameters a style forces onto a request. Every field is optional:
 * a style only overrides what it declares. `model` names the model the panel
 * shows in its own single-model field, while `models` is every model the style
 * declares and is what the request routes on.
 */
export interface StyleForcedParams {
  model?: string;
  models?: string[];
  width?: number;
  height?: number;
  steps?: number;
  cfg_scale?: number;
  sampler_name?: ImageSamplerName;
  clip_skip?: number;
  karras?: boolean;
  hires_fix?: boolean;
  loras?: StyleLoraConfig[];
  tis?: StyleTextualInversionConfig[];
  denoising_strength?: number;
  post_processing?: ImagePostProcessor[];
  tiling?: boolean;
  facefixer_strength?: number;
  workflow?: string;
  transparent?: boolean;
}

/** The result of merging a style with a user's prompts. */
export interface AppliedStyle {
  /** Final prompt string, negative folded in via the horde `###` separator. */
  prompt: string;
  forcedParams: StyleForcedParams;
  /**
   * Whether the horde applies this style rather than the studio. It replaces
   * the request's parameters with the style's own, so anything describing what
   * will be sent has to stop offering the reader a way around them.
   */
  hordeApplied?: boolean;
}

/**
 * Merge a style's prompt template with the user's positive/negative prompts,
 * following the `{p}`/`{np}` convention both catalogues share.
 *
 * When the template omits `{np}` but a negative prompt is present, the negative
 * is still appended via ` ### ` rather than silently dropped; and when the
 * template omits `{p}`, the positive prompt is prepended rather than lost.
 */
export function applyStylePrompt(
  template: string,
  positive: string,
  negative: string,
): string {
  const pos = positive.trim();
  const neg = negative.trim();
  const hasP = template.includes('{p}');
  const hasNp = template.includes('{np}');

  let out = hasP ? template.replace('{p}', pos) : `${pos} ${template}`;

  if (hasNp) {
    if (neg) {
      // A template that already spells out `###` positions the separator
      // itself, so only the bare negative is substituted in that case.
      const replacement = template.includes('###') ? neg : `### ${neg}`;
      out = out.replace('{np}', replacement);
    } else {
      out = out.replace('{np}', '');
    }
  } else if (neg) {
    out = `${out} ### ${neg}`;
  }

  // Normalise the horde `###` delimiter to a single clean space on each side,
  // regardless of the whitespace the template happened to put around {np}.
  return out.replace(/\s*###\s*/g, ' ### ').trim();
}

/**
 * Apply a style to the user's prompts, returning the final prompt plus the
 * generation parameters the style forces. Pure and side-effect free so it can
 * be unit tested and reused across the form and preview layers.
 */
export function applyStyle(
  record: StyleRecord,
  positive: string,
  negative: string,
): AppliedStyle {
  const params = record.params;
  const forcedParams: StyleForcedParams = {};
  if (record.models.length > 0) {
    forcedParams.model = record.models[0];
    forcedParams.models = [...record.models];
  }
  if (params.width !== undefined) forcedParams.width = params.width;
  if (params.height !== undefined) forcedParams.height = params.height;
  if (params.steps !== undefined) forcedParams.steps = params.steps;
  if (params.cfg_scale !== undefined) forcedParams.cfg_scale = params.cfg_scale;
  if (params.sampler_name !== undefined) {
    forcedParams.sampler_name = params.sampler_name;
  }
  if (params.clip_skip !== undefined) forcedParams.clip_skip = params.clip_skip;
  if (params.karras !== undefined) forcedParams.karras = params.karras;
  if (params.hires_fix !== undefined) forcedParams.hires_fix = params.hires_fix;
  if (params.loras && params.loras.length > 0) {
    forcedParams.loras = params.loras.map((lora) => ({ ...lora }));
  }
  if (params.tis && params.tis.length > 0) {
    forcedParams.tis = params.tis.map((ti) => ({ ...ti }));
  }
  if (params.denoising_strength !== undefined) {
    forcedParams.denoising_strength = params.denoising_strength;
  }
  if (params.post_processing && params.post_processing.length > 0) {
    forcedParams.post_processing = [...params.post_processing];
  }
  if (params.tiling !== undefined) forcedParams.tiling = params.tiling;
  if (params.facefixer_strength !== undefined) {
    forcedParams.facefixer_strength = params.facefixer_strength;
  }
  if (params.workflow) forcedParams.workflow = params.workflow;
  if (params.transparent !== undefined) {
    forcedParams.transparent = params.transparent;
  }

  const applied: AppliedStyle = {
    prompt: applyStylePrompt(record.prompt, positive, negative),
    forcedParams,
  };
  if (record.source === 'native') {
    applied.hordeApplied = true;
  }
  return applied;
}
