import { ImageGenerationRequest } from '../../types/generation';
import { StoredJobImageMetadata } from '../../types/generation-job';

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
}

export function buildImageProvenance(
  metadata: StoredJobImageMetadata | undefined,
  derived: DerivedImageMeta,
  styleName: string | null = null,
): ImageMetaProvenance {
  return {
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
 * A serialisable metadata record for one image: its input parameters (the
 * submitted request) plus everything the horde returned about it. Used both by
 * the per-image metadata modal and the sidecar JSON written into Download All.
 */
export function buildImageMetadataExport(
  imageId: string,
  metadata: StoredJobImageMetadata | undefined,
  request: ImageGenerationRequest | undefined,
  derived: DerivedImageMeta,
): Record<string, unknown> {
  return {
    image_id: imageId,
    seed: metadata?.seed ?? null,
    model: metadata?.model ?? null,
    worker: {
      id: metadata?.workerId ?? null,
      name: metadata?.workerName ?? null,
    },
    state: metadata?.state ?? null,
    censored: derived.censored,
    censorship_reason: derived.censorReason,
    aesthetic_score: derived.aesthetic,
    errors: derived.errors,
    gen_metadata: metadata?.genMetadata ?? [],
    request: request ?? null,
  };
}
