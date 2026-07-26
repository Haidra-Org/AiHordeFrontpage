import { ImageGenerationRequest } from '../../types/generation';
import { StoredJobImageMetadata } from '../../types/generation-job';

/** gen_metadata values that mark an entry as a failure worth surfacing. */
const ERROR_VALUES = new Set([
  'download_failed',
  'parse_failed',
  'baseline_mismatch',
]);

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
 */
export function deriveImageMeta(
  metadata: StoredJobImageMetadata | undefined,
): DerivedImageMeta {
  const gen = metadata?.genMetadata ?? [];
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
}

export function buildImageProvenance(
  metadata: StoredJobImageMetadata | undefined,
  derived: DerivedImageMeta,
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
