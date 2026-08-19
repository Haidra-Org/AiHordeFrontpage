import {
  GenerationMetadataStable,
  GenerationOutput,
  ImageGenerationRequest,
} from './generation';

/**
 * Lifecycle of a locally-tracked image generation job.
 *
 * - `waiting`: enqueued, not yet submitted to the horde.
 * - `requested`: accepted by the horde, an id was returned, not yet polled.
 * - `queued` / `processing`: in flight, derived from check-endpoint counts.
 * - `done`: finished, result images downloaded and stored.
 * - `error`: submission rejected, faulted, or expired.
 * - `cancelled`: cancelled by the user before completion.
 */
export type LocalGenerationJobStatus =
  | 'waiting'
  | 'requested'
  | 'queued'
  | 'processing'
  | 'done'
  | 'error'
  | 'cancelled';

/** Which role a stored blob plays for its job. */
export type StoredImageKind =
  | 'result'
  | 'source'
  | 'mask'
  | 'control_map'
  | 'extra_source';

/**
 * How many extra source images a remix request may carry alongside its primary
 * source image. The horde schema sets no maxItems, so this is a client-side cap
 * chosen to keep the request payload (one base64 webp per image) manageable.
 */
export const MAX_EXTRA_SOURCE_IMAGES = 5;

/**
 * The image-store id for the extra source blob at `index`. Extra blobs share the
 * `[localId, imageId]` keying with the primary source and mask, so their ids
 * must not collide with the fixed `source` / `mask` ones.
 */
export function extraSourceImageId(index: number): string {
  return `extra-${index}`;
}

/**
 * Per-image provenance captured from the status response. Every field is
 * optional because source/mask blobs carry no worker metadata.
 */
export interface StoredJobImageMetadata {
  seed?: string;
  model?: string;
  workerId?: string;
  workerName?: string;
  censored?: boolean;
  state?: GenerationOutput['state'];
  /**
   * Raw per-image metadata from the horde (`gen_metadata`): censorship reason,
   * lora/ti/source download or parse failures, aesthetic score, etc. Kept so the
   * results UI can surface NSFW/error/aesthetic signals and the metadata export.
   */
  genMetadata?: GenerationMetadataStable[];
}

/**
 * A binary image tied to a job, keyed by `[localId, imageId]` in IndexedDB.
 * Source and mask blobs are written at enqueue time; result and control-map
 * blobs are written when the job finishes.
 */
export interface StoredJobImage {
  localId: string;
  imageId: string;
  kind: StoredImageKind;
  blob: Blob;
  mimeType: string;
  /**
   * Blend weight for an `extra_source` blob, carried here rather than on the job
   * so a remix extra keeps its strength next to the bytes it belongs to and the
   * two can never drift out of alignment. Unset for every other kind.
   */
  strength?: number;
  metadata?: StoredJobImageMetadata;
}

/**
 * The persisted record for a single generation. The stored `request` never
 * embeds the large base64 `source_image` / `source_mask`; those live in the
 * image store and are re-attached from their blobs at submit time.
 */
export interface LocalGenerationJob {
  localId: string;
  status: LocalGenerationJobStatus;
  createdAt: number;
  updatedAt: number;
  request: ImageGenerationRequest;
  hordeId?: string;
  kudos?: number;
  queuePosition?: number;
  waitTime?: number;
  errorMessage?: string;
  /**
   * The horde's return code for a refused submit, where it sent one. Kept beside
   * the message so the studio can put the message under the control the code
   * names; absent on jobs that failed for any other reason.
   */
  errorRc?: string;
  /** How many times this job has been re-submitted via Retry (0/undefined = original). */
  retryCount?: number;
  /**
   * The style preset selected when this was submitted, when any. A request
   * carries no trace of the style that shaped it, so it is recorded alongside;
   * absent on jobs stored before this field existed.
   */
  styleName?: string;
  resultImageIds: string[];
  /**
   * Epoch ms of the last poll, used by the engine to throttle check calls.
   * Not part of the user-facing model but persisted so a resumed job does not
   * hammer the check endpoint immediately after a reload.
   */
  lastCheckedAt?: number;
}

/**
 * A source, mask, or remix-extra blob handed to `enqueue`. The engine stores it
 * immediately and rehydrates it into base64 on the request at submit time.
 */
export interface EnqueueSourceImage {
  kind: 'source' | 'mask' | 'extra_source';
  blob: Blob;
  mimeType: string;
  /** Slot of an `extra_source` blob; ignored for the primary source and mask. */
  index?: number;
  /** Blend weight of an `extra_source` blob; ignored for the other kinds. */
  strength?: number;
}
