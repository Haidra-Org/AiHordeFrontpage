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
  /**
   * The job was taken from the account's own list of active generations rather
   * than submitted from this browser, so `request` is a placeholder standing in
   * for settings nobody here ever held. Everything that would read those
   * settings back (loading them, linking them, asking for the same picture
   * again) has to be withheld for such a job.
   */
  adopted?: true;
  hordeId?: string;
  /**
   * The running kudos figure: what the horde quoted at submit while the job is
   * in flight, and what it actually charged once the job is done.
   */
  kudos?: number;
  /**
   * What the horde quoted when it accepted the submit, kept apart from
   * {@link LocalGenerationJob.kudos} because that field is overwritten with the
   * charge as the job runs. Absent on jobs stored before it existed.
   */
  quotedKudos?: number;
  queuePosition?: number;
  waitTime?: number;
  errorMessage?: string;
  /**
   * Translation key for a failure the studio itself named, as opposed to the
   * horde's own sentence in {@link LocalGenerationJob.errorMessage}. Preferred
   * over the message when set; jobs stored before it existed carry neither.
   */
  errorKey?: string;
  /**
   * What the horde last said about whether anyone can serve this request. False
   * means it is queued with nobody able to pick it up, which is not an error:
   * it waits, and runs if a worker that fits appears. Absent until the first
   * check answers.
   */
  isPossible?: boolean;
  /** Optional because jobs stored before lifecycle reporting do not carry these values. */
  finishedCount?: number;
  processingCount?: number;
  waitingCount?: number;
  restartedCount?: number;
  eligibleWorkers?: number;
  eligibleWorkerThreads?: number;
  mightStall?: boolean;
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
  /** That style's source-qualified key, which is what groups and counts. */
  styleKey?: string;
  resultImageIds: string[];
  /** Keeps a visible result in the grid without retaining the filter image. */
  csamCensoredCount?: number;
  /**
   * Epoch ms of the last poll, used by the engine to throttle check calls.
   * Not part of the user-facing model but persisted so a resumed job does not
   * hammer the check endpoint immediately after a reload.
   */
  lastCheckedAt?: number;
}

/** What a day at the studio came to, read off the jobs already held locally. */
export interface SessionStats {
  /** Pictures that came back today. */
  images: number;
  /** Kudos the horde charged for them. */
  kudos: number;
  /** Mean seconds from asking to arriving, or null when nothing finished. */
  averageWaitSeconds: number | null;
}

/**
 * The day's work, counted from the local job history rather than asked for over
 * the network: every figure here is something the studio already recorded, so
 * the line costs nothing and is right even offline.
 *
 * "Today" runs from local midnight, which is the day the reader is having
 * rather than the horde's own.
 */
export function sessionStatsToday(
  jobs: readonly LocalGenerationJob[],
  now: number,
): SessionStats {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const since = midnight.getTime();

  let images = 0;
  let kudos = 0;
  let waitTotal = 0;
  let waited = 0;
  for (const job of jobs) {
    if (job.status !== 'done' || job.createdAt < since) {
      continue;
    }
    images += job.resultImageIds.length;
    kudos += job.kudos ?? 0;
    const wait = job.updatedAt - job.createdAt;
    if (wait > 0) {
      waitTotal += wait;
      waited += 1;
    }
  }

  return {
    images,
    kudos: Math.round(kudos),
    averageWaitSeconds:
      waited === 0 ? null : Math.round(waitTotal / waited / 1000),
  };
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

/** One remix extra kept with a stored source draft, in submission order. */
export interface StoredSourceDraftExtra {
  blob: Blob;
  strength: number;
}

/**
 * The picture attached to the studio, kept so leaving the page and coming back
 * finds it still there, as the settings draft and the results already are.
 *
 * The bytes are the attachment as it came in, never a canvas composed around it
 * for outpainting: the composition is redone from the settings on restore, and
 * storing its result would grow the picture again every time.
 */
export interface StoredSourceDraft {
  /** Which attachment this is: the one on the bench, or one put aside. */
  id: string;
  savedAt: number;
  source: Blob;
  mask: Blob | null;
  extras: StoredSourceDraftExtra[];
}
