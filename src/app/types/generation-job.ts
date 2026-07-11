import { GenerationOutput, ImageGenerationRequest } from './generation';

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
export type StoredImageKind = 'result' | 'source' | 'mask' | 'control_map';

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
  resultImageIds: string[];
  /**
   * Epoch ms of the last poll, used by the engine to throttle check calls.
   * Not part of the user-facing model but persisted so a resumed job does not
   * hammer the check endpoint immediately after a reload.
   */
  lastCheckedAt?: number;
}

/**
 * A source or mask blob handed to `enqueue`. The engine stores it immediately
 * and rehydrates it into base64 on the request at submit time.
 */
export interface EnqueueSourceImage {
  kind: 'source' | 'mask';
  blob: Blob;
  mimeType: string;
}
