import {
  ImageGenerationParams,
  ImageGenerationRequest,
} from '../../types/generation';
import { StoredJobImageMetadata } from '../../types/generation-job';
import { IMAGE_SCHEDULERS } from '../../types/sampler-constraints';
import type { ImageSamplerName } from '../../types/style';
import {
  SAMPLERS,
  combinePrompt,
  splitCombinedPrompt,
} from './generate-form.model';

/** gen_metadata values that mark an entry as a failure worth surfacing. */
const ERROR_VALUES = new Set([
  'download_failed',
  'parse_failed',
  'baseline_mismatch',
]);

/** gen_metadata types that describe an input image the request had to supply. */
const SOURCE_INPUT_TYPES = new Set([
  'source_image',
  'source_mask',
  'extra_source_images',
]);

/**
 * Whether the submitted request asked for a source image at all. The stored
 * request keeps `source_processing` (only the base64 payloads are stripped), so
 * its presence is the reliable mark of a job that carried an input image.
 * An unknown request counts as carrying one, so a fault is never hidden on a
 * guess.
 */
function requestCarriesSourceInput(
  request: ImageGenerationRequest | undefined,
): boolean {
  return (
    request === undefined ||
    request.source_processing !== undefined ||
    request.source_image !== undefined ||
    request.source_mask !== undefined ||
    (request.extra_source_images?.length ?? 0) > 0
  );
}

/** gen_metadata types this app has reader-facing words for. */
const NAMED_ERROR_FIELDS = new Set([
  'lora',
  'ti',
  'source_image',
  'source_mask',
  'extra_source_images',
]);

/**
 * What to call the input an error is about. The horde names it in its own
 * vocabulary, which is not the reader's, so a type the app has no words for
 * falls back to naming it as one of the things that were sent rather than
 * printing the raw token.
 */
export function imageErrorFieldKey(type: string): string {
  return NAMED_ERROR_FIELDS.has(type)
    ? `generate.results.field_${type}`
    : 'generate.results.field_other';
}

/**
 * What to say happened to it. An unfamiliar reason is reported as the input
 * having been left out, which is what the horde does with every one of them.
 */
export function imageErrorReasonKey(value: string): string {
  return ERROR_VALUES.has(value)
    ? `generate.results.error_${value}`
    : 'generate.results.error_other';
}

/** A failed lora/ti/source/etc. reported in a result's gen_metadata. */
export interface ImageMetaError {
  /** Which input failed: lora | ti | source_image | source_mask | ... */
  type: string;
  /** How it failed: download_failed | parse_failed | baseline_mismatch. */
  value: string;
  /** Optional reference the horde attached (e.g. a lora id). */
  ref?: string;
}

/** The UI-facing view of one result image's provenance, derived from metadata. */
export interface DerivedImageMeta {
  /** True when the worker censored/flagged the image (the NSFW-marker signal). */
  nsfw: boolean;
  censored: boolean;
  /** Why it was censored, when known: 'nsfw' | 'csam'. */
  censorReason: string | null;
  /** LAION aesthetic score (0-10) when a worker reported one, else null. */
  aesthetic: number | null;
  errors: ImageMetaError[];
}

/**
 * Fold a result image's stored metadata into the signals the results grid needs.
 * NSFW is "censored/flagged only": an image is marked NSFW only when the worker
 * actually censored it or reported a censorship/csam reason, never merely because
 * the request permitted NSFW output.
 *
 * `request` is the request the job was submitted with. A worker reports a
 * source-image fault whenever the job it popped names a source processing it
 * cannot satisfy, and a job pop that omits the field is read as img2img by the
 * horde's own schema default; a text-to-image request therefore comes back
 * carrying a source fault it never asked for. Faults about an input the request
 * never sent are dropped rather than shown to the reader.
 */
export function deriveImageMeta(
  metadata: StoredJobImageMetadata | undefined,
  request?: ImageGenerationRequest,
): DerivedImageMeta {
  const gen = metadata?.genMetadata ?? [];
  const hasSourceInput = requestCarriesSourceInput(request);
  let censorReason: string | null = null;
  let aesthetic: number | null = null;
  const errors: ImageMetaError[] = [];

  for (const entry of gen) {
    if (entry.type === 'censorship') {
      censorReason = entry.value;
    } else if (entry.type === 'aesthetic_score') {
      const parsed =
        entry.ref !== undefined ? Number.parseFloat(entry.ref) : NaN;
      if (Number.isFinite(parsed)) {
        aesthetic = parsed;
      }
    } else if (ERROR_VALUES.has(entry.value)) {
      if (!hasSourceInput && SOURCE_INPUT_TYPES.has(entry.type)) {
        continue;
      }
      errors.push({ type: entry.type, value: entry.value, ref: entry.ref });
    }
  }

  const flaggedState =
    metadata?.state === 'censored' || metadata?.state === 'csam';
  const censored =
    metadata?.censored === true || flaggedState || censorReason !== null;
  if (censored && censorReason === null && metadata?.state === 'csam') {
    censorReason = 'csam';
  }

  return { nsfw: censored, censored, censorReason, aesthetic, errors };
}

/**
 * What the horde reported about a finished image, as read-only rows for the
 * metadata panel. It is the same set of facts {@link buildImageMetadataExport}
 * serialises, minus the request (which the panel reads from the request itself).
 */
export interface ImageMetaProvenance {
  seed: string | null;
  model: string | null;
  workerName: string | null;
  workerId: string | null;
  state: string | null;
  censored: boolean;
  censorReason: string | null;
  aesthetic: number | null;
  errors: ImageMetaError[];
  /** The style preset the job was submitted with, when it recorded one. */
  styleName: string | null;
  /** What the job's price came to, quoted and charged; see {@link JobKudos}. */
  kudos: JobKudos | null;
}

/**
 * What the horde said a job would cost when it took it, and what it charged
 * once the job finished. Held together so the two can be shown against each
 * other rather than one silently replacing the other.
 */
export interface JobKudos {
  quoted: number | null;
  charged: number | null;
}

/**
 * How far the charge may sit from the quote before it is worth remarking on.
 * Both figures carry a fractional tail, so an exact comparison would flag every
 * job; a whole kudos is the smallest difference a reader could act on.
 */
const KUDOS_DIVERGENCE = 1;

/**
 * Whether the charge is far enough from the quote to be worth pointing at.
 * False whenever either figure is missing: nothing can be said about a job that
 * was never quoted, and a job still running has not been charged.
 */
export function kudosDiverged(kudos: JobKudos | null): boolean {
  if (kudos?.quoted == null || kudos.charged == null) {
    return false;
  }
  return Math.abs(kudos.charged - kudos.quoted) >= KUDOS_DIVERGENCE;
}

export function buildImageProvenance(
  metadata: StoredJobImageMetadata | undefined,
  derived: DerivedImageMeta,
  styleName: string | null = null,
  kudos: JobKudos | null = null,
): ImageMetaProvenance {
  return {
    kudos,
    seed: metadata?.seed ?? null,
    model: metadata?.model ?? null,
    workerName: metadata?.workerName ?? null,
    workerId: metadata?.workerId ?? null,
    state: metadata?.state ?? null,
    censored: derived.censored,
    censorReason: derived.censorReason,
    aesthetic: derived.aesthetic,
    errors: derived.errors,
    styleName,
  };
}

/**
 * Horde sampler names against the names the A1111 `parameters` format uses. A
 * sampler with no entry here is written through as-is, which readers accept.
 */
const A1111_SAMPLER_NAMES: Record<string, string> = {
  k_lms: 'LMS',
  k_heun: 'Heun',
  k_euler: 'Euler',
  k_euler_a: 'Euler a',
  k_dpm_2: 'DPM2',
  k_dpm_2_a: 'DPM2 a',
  k_dpm_fast: 'DPM fast',
  k_dpm_adaptive: 'DPM adaptive',
  k_dpmpp_2s_a: 'DPM++ 2S a',
  k_dpmpp_2m: 'DPM++ 2M',
  k_dpmpp_sde: 'DPM++ SDE',
  k_dpmpp_3m_sde: 'DPM++ 3M SDE',
  DDIM: 'DDIM',
  lcm: 'LCM',
};

/**
 * The generation settings as A1111 `parameters` text: the prompt, then the
 * negative prompt, then one comma-separated line of settings. This is the shape
 * A1111 and Civitai parse metadata out of, so a downloaded image opened in
 * either of them reports how it was made.
 *
 * `metadata` is what the worker returned, and wins over the request for seed and
 * model: a request that let the horde choose either one still produced a
 * concrete value, and that value is the one that reproduces the image.
 */
export function buildParametersText(
  request: ImageGenerationRequest | undefined,
  metadata: StoredJobImageMetadata | undefined,
): string {
  if (!request) {
    return '';
  }
  const [prompt, negative] = splitCombinedPrompt(request.prompt ?? '');
  const params = request.params ?? {};
  const settings: string[] = [];
  const push = (key: string, value: string | number | undefined): void => {
    if (value !== undefined && value !== '' && value !== null) {
      settings.push(`${key}: ${value}`);
    }
  };

  push('Steps', params.steps);
  const sampler = params.sampler_name;
  push(
    'Sampler',
    sampler ? (A1111_SAMPLER_NAMES[sampler] ?? sampler) : undefined,
  );
  if (params.karras) {
    push('Schedule type', 'Karras');
  } else {
    push('Schedule type', params.scheduler);
  }
  push('CFG scale', params.cfg_scale);
  push('Seed', metadata?.seed ?? params.seed);
  if (params.width && params.height) {
    push('Size', `${params.width}x${params.height}`);
  }
  push('Model', metadata?.model ?? request.models?.[0]);
  push('Clip skip', params.clip_skip);
  if (request.source_processing) {
    push('Denoising strength', params.denoising_strength);
  }

  const lines = [prompt];
  if (negative) {
    lines.push(`Negative prompt: ${negative}`);
  }
  if (settings.length > 0) {
    lines.push(settings.join(', '));
  }
  return lines.join('\n');
}

/** {@link A1111_SAMPLER_NAMES} the other way round, keyed for a case-blind lookup. */
const HORDE_SAMPLER_NAMES: Record<string, ImageSamplerName> =
  Object.fromEntries(
    Object.entries(A1111_SAMPLER_NAMES).map(([horde, a1111]) => [
      a1111.toLowerCase(),
      horde,
    ]),
  );

/** The settings {@link buildParametersText} writes, as the line names them. */
const PARAMETER_KEYS = new Set([
  'steps',
  'sampler',
  'schedule type',
  'cfg scale',
  'seed',
  'size',
  'model',
  'clip skip',
  'denoising strength',
]);

/** How the negative prompt introduces itself on its own line. */
const NEGATIVE_PROMPT_PREFIX = /^negative prompt:\s*/i;

/**
 * The settings a comma-separated line names, or null when it names none. A
 * value runs to the next comma, which is what every writer of this format
 * assumes, so a model name with a comma in it is the one thing that cannot
 * survive the trip.
 */
function readSettingsLine(line: string): Map<string, string> | null {
  const settings = new Map<string, string>();
  const pattern = /([A-Za-z][A-Za-z ]*):\s*([^,]*)(?:,\s*|$)/g;
  let match = pattern.exec(line);
  while (match !== null) {
    const key = match.at(1)?.trim().toLowerCase();
    const value = match.at(2)?.trim();
    if (key !== undefined && value !== undefined && PARAMETER_KEYS.has(key)) {
      settings.set(key, value);
    }
    match = pattern.exec(line);
  }
  return settings.size > 0 ? settings : null;
}

/** A finite number, or undefined for anything that is not one. */
function readNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** A whole number, for the settings the horde only accepts as integers. */
function readWhole(raw: string | undefined): number | undefined {
  const value = readNumber(raw);
  return value === undefined ? undefined : Math.round(value);
}

/**
 * The sampler a settings line names, in the horde's vocabulary. The line is
 * written in A1111's names, but text pasted from elsewhere often carries the
 * horde's own, so a name that is already one of those is taken as it stands.
 */
function readSampler(raw: string | undefined): ImageSamplerName | undefined {
  if (raw === undefined || raw === '') {
    return undefined;
  }
  const known = HORDE_SAMPLER_NAMES[raw.toLowerCase()];
  if (known !== undefined) {
    return known;
  }
  return SAMPLERS.includes(raw) ? raw : undefined;
}

/** Write the schedule a settings line names onto `params`. */
function applySchedule(params: ImageGenerationParams, raw: string): void {
  const value = raw.trim().toLowerCase();
  if (value === 'karras') {
    params.karras = true;
    return;
  }
  const scheduler = IMAGE_SCHEDULERS.find((name) => name === value);
  if (scheduler !== undefined) {
    params.scheduler = scheduler;
  }
}

/**
 * Read a request back out of A1111 `parameters` text, the inverse of
 * {@link buildParametersText}. This is how a picture the studio wrote hands its
 * settings back when it is dropped on the studio again, and it reads the same
 * text every other tool writes in this format.
 *
 * Null when the text says nothing usable: no prompt and no setting anyone could
 * act on. Everything it cannot make sense of is dropped rather than guessed at,
 * so a half-understood line never becomes a setting nobody chose.
 */
export function parseParametersText(
  text: string,
): ImageGenerationRequest | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const settings = readSettingsLine(lines[lines.length - 1] ?? '');
  if (settings !== null) {
    lines.pop();
  }

  const negativeAt = lines.findIndex((line) =>
    NEGATIVE_PROMPT_PREFIX.test(line),
  );
  const prompt = (negativeAt === -1 ? lines : lines.slice(0, negativeAt))
    .join('\n')
    .trim();
  const negative =
    negativeAt === -1
      ? ''
      : [
          (lines.at(negativeAt) ?? '').replace(NEGATIVE_PROMPT_PREFIX, ''),
          ...lines.slice(negativeAt + 1),
        ]
          .join('\n')
          .trim();

  const request: ImageGenerationRequest = {
    prompt: combinePrompt(prompt, negative),
  };
  if (settings === null) {
    return request.prompt === '' ? null : request;
  }

  const params: ImageGenerationParams = {};
  const steps = readWhole(settings.get('steps'));
  if (steps !== undefined) {
    params.steps = steps;
  }
  const sampler = readSampler(settings.get('sampler'));
  if (sampler !== undefined) {
    params.sampler_name = sampler;
  }
  const schedule = settings.get('schedule type');
  if (schedule !== undefined) {
    applySchedule(params, schedule);
  }
  const cfg = readNumber(settings.get('cfg scale'));
  if (cfg !== undefined) {
    params.cfg_scale = cfg;
  }
  const seed = settings.get('seed');
  if (seed !== undefined && seed !== '') {
    params.seed = seed;
  }
  const size = /^(\d+)\s*x\s*(\d+)$/.exec(settings.get('size') ?? '');
  const width = size?.at(1);
  const height = size?.at(2);
  if (width !== undefined && height !== undefined) {
    params.width = Number.parseInt(width, 10);
    params.height = Number.parseInt(height, 10);
  }
  const clipSkip = readWhole(settings.get('clip skip'));
  if (clipSkip !== undefined) {
    params.clip_skip = clipSkip;
  }
  const denoise = readNumber(settings.get('denoising strength'));
  if (denoise !== undefined) {
    params.denoising_strength = denoise;
  }

  const model = settings.get('model');
  if (model !== undefined && model !== '') {
    request.models = [model];
  }
  if (Object.keys(params).length > 0) {
    request.params = params;
  }
  if (
    request.prompt === '' &&
    request.models === undefined &&
    request.params === undefined
  ) {
    return null;
  }
  return request;
}

/**
 * A serialisable metadata record for one image: its input parameters (the
 * submitted request) plus everything the horde returned about it. Used both by
 * the per-image metadata modal and the sidecar JSON written into Download All.
 */
export function buildImageMetadataExport(
  imageId: string,
  metadata: StoredJobImageMetadata | undefined,
  request: ImageGenerationRequest | undefined,
  derived: DerivedImageMeta,
  kudos: JobKudos | null = null,
): Record<string, unknown> {
  return {
    image_id: imageId,
    seed: metadata?.seed ?? null,
    model: metadata?.model ?? null,
    worker: {
      id: metadata?.workerId ?? null,
      name: metadata?.workerName ?? null,
    },
    kudos,
    state: metadata?.state ?? null,
    censored: derived.censored,
    censorship_reason: derived.censorReason,
    aesthetic_score: derived.aesthetic,
    errors: derived.errors,
    gen_metadata: metadata?.genMetadata ?? [],
    request: request ?? null,
  };
}
