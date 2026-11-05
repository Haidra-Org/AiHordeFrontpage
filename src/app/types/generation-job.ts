import {
  GenerationMetadataStable,
  GenerationOutput,
  ImageGenerationRequest,
  SubmittedImageRequest,
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

/**
 * Why a submit has not gone through yet. Both are conditions that pass on their
 * own, so the job stays `waiting` and is tried again rather than failing.
 */
export type SubmitBlockReason = 'rate_limited' | 'unanswered';

/** Which role a stored blob plays for its job. */
export type StoredImageKind =
  | 'result'
  | 'source'
  | 'mask'
  | 'control_map'
  | 'extra_source'
  | 'submitted_request';

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
 * What a finished picture was read back as, kept beside the bytes it was read
 * from. Only the reading itself is stored: how it compares with the prompt is
 * worked out again whenever it is shown, so an edited prompt is answered
 * without asking the horde for another reading.
 */
export interface StoredPromptCheck {
  readAt: number;
  caption: string | null;
  tags: string | null;
  /** A text model's short opinion of the picture against its prompt. */
  verdict?: { text: string; model: string; at: number };
}

/**
 * An image or recorded submission body, keyed by `[localId, imageId]` in IndexedDB.
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
  /** The reading of this picture, once one has been asked for. */
  promptCheck?: StoredPromptCheck;
}

/** Finished results selected for removal, without removing their siblings. */
export interface GenerationResultSelection {
  imageIds: readonly string[];
  censoredIndices: readonly number[];
  fetchFailedIndices: readonly number[];
}

/** Persisted result inventory after deletion; retained even after its last image. */
export interface GenerationResultState {
  localId: string;
  resultRevision: number;
  resultImageIds: string[];
  censoredResultIndices: number[];
  fetchFailedResultIndices: number[];
  completedAt: number;
  updatedAt: number;
  deleted: boolean;
}

/** A result revision changes only when the stored inventory changes. */
export function withGenerationResultState(
  job: LocalGenerationJob,
  state: GenerationResultState,
): LocalGenerationJob {
  return {
    ...job,
    status: 'done',
    resultRevision: state.resultRevision,
    resultImageIds: state.resultImageIds,
    censoredResultIndices: state.censoredResultIndices,
    fetchFailedResultIndices: state.fetchFailedResultIndices,
    csamCensoredCount: state.censoredResultIndices.length,
    fetchFailedCount: state.fetchFailedResultIndices.length,
    completedAt: state.completedAt,
    updatedAt: Math.max(job.updatedAt, state.updatedAt),
  };
}

export function resultPlaceholderIndices(
  job: LocalGenerationJob,
  kind: 'censored' | 'fetch-failed',
): readonly number[] {
  return kind === 'censored'
    ? (job.censoredResultIndices ??
        Array.from({ length: job.csamCensoredCount ?? 0 }, (_, i) => i))
    : (job.fetchFailedResultIndices ??
        Array.from({ length: job.fetchFailedCount ?? 0 }, (_, i) => i));
}

/** Content revisions survive unrelated writes from tabs with stale job snapshots. */
export function preserveGenerationRequestMark(
  incoming: LocalGenerationJob,
  held: LocalGenerationJob,
): LocalGenerationJob {
  if (
    held.requestNsfwOverride !== undefined &&
    (incoming.requestNsfwOverride === undefined ||
      (held.requestNsfwRevision ?? 0) >= (incoming.requestNsfwRevision ?? 0))
  ) {
    return {
      ...incoming,
      requestNsfwOverride: held.requestNsfwOverride,
      requestNsfwRevision: held.requestNsfwRevision,
    };
  }
  return incoming;
}

/** Older peer snapshots may update metadata but cannot reopen deleted results. */
export function preserveGenerationResultState(
  incoming: LocalGenerationJob,
  held: LocalGenerationJob,
): LocalGenerationJob {
  let job = incoming;
  if ((held.resultRevision ?? 0) > (incoming.resultRevision ?? 0)) {
    job = withGenerationResultState(job, {
      localId: held.localId,
      resultRevision: held.resultRevision!,
      resultImageIds: held.resultImageIds,
      censoredResultIndices: [...resultPlaceholderIndices(held, 'censored')],
      fetchFailedResultIndices: [
        ...resultPlaceholderIndices(held, 'fetch-failed'),
      ],
      completedAt: held.completedAt ?? held.updatedAt,
      updatedAt: held.updatedAt,
      deleted: false,
    });
    job = { ...job, updatedAt: incoming.updatedAt };
  }
  return held.status === 'done'
    ? { ...job, completedAt: held.completedAt ?? held.updatedAt }
    : job;
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
  /** Completion time is immutable; legacy jobs use updatedAt until first edited. */
  completedAt?: number;
  resultRevision?: number;
  censoredResultIndices?: number[];
  fetchFailedResultIndices?: number[];
  request: ImageGenerationRequest;
  /** Local content marking for this request's results; never sent to the Horde. */
  requestNsfwOverride?: boolean;
  /** Incremented by the store so stale job snapshots cannot undo a marking. */
  requestNsfwRevision?: number;
  /** Parameters with empty image slots; the view supplies translated placeholders. */
  inspectionRequest?: ImageGenerationRequest;
  /** The exact HTTP body is kept as a JSON blob beside this job's images. */
  submittedBodyAvailable?: true;
  /** Server-reported parameters, with image bytes and links replaced by empty slots. */
  reportedRequest?: SubmittedImageRequest;
  requestRecoveryAttempts?: number;
  requestRecoveryRetryAt?: number;
  /**
   * The job was taken from the account's own list of active generations rather
   * than submitted from this browser. Its `request` starts as a placeholder and
   * holds what was asked for only once {@link LocalGenerationJob.requestRecovery}
   * says it was read back; {@link requestKnowledge} is the one reading of the
   * two that decides what the job's settings may be used for.
   */
  adopted?: true;
  /**
   * How reading an adopted job's request back from the horde went. Transient
   * failures are retried while the request is active, up to a bounded count.
   */
  requestRecovery?: AdoptedRequestRecovery;
  /**
   * The reader chose to keep this job after being told that jobs taken from the
   * account before the horde could read requests back may belong to people
   * using their shared keys. Lifts {@link isJobHidden} for it.
   */
  keptByReader?: true;
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
  /**
   * Why a job that is still `waiting` has not been sent yet: the horde is
   * limiting how fast requests arrive, or it is not answering at all. Absent
   * while nothing has gone wrong, and cleared once a submit is accepted.
   */
  submitBlocked?: SubmitBlockReason;
  /** Epoch ms of the next submit attempt, for the countdown the card shows. */
  submitRetryAt?: number;
  /**
   * How many submit attempts this job has had refused. The engine gives up at a
   * bound and turns the job into an error the reader can act on, rather than
   * posting the same request for as long as the page stays open.
   */
  submitAttempts?: number;
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
   * Pictures the horde finished but this browser could not fetch within the
   * retry window. Each one keeps a placeholder tile so the grid and every
   * count agree on how many pictures the request produced.
   */
  fetchFailedCount?: number;
  /**
   * Epoch ms of the first failed picture fetch for a finished job. While set,
   * the job stays active and the missing pictures are fetched again on later
   * ticks; the job becomes done once every picture landed or the window ran
   * out. Cleared on done.
   */
  fetchRetryFrom?: number;
  /**
   * Epoch ms of the last poll, used by the engine to throttle check calls.
   * Not part of the user-facing model but persisted so a resumed job does not
   * hammer the check endpoint immediately after a reload.
   */
  lastCheckedAt?: number;
}

/**
 * Where reading back an adopted job's request stands.
 *
 * - `pending`: an attempt is under way, or the page closed during it.
 * - `full`: the request and its prompt came back.
 * - `settings`: the settings came back, but the horde stored no prompt for it.
 * - `refused`: the horde has the endpoint and answered with a refusal (the
 *   request is gone, or the key did not submit it). The answer itself shows the
 *   job was taken from a horde that reads requests back.
 * - `failed`: no answer from the endpoint: a network failure, or a horde
 *   without it.
 */
export type AdoptedRequestRecovery =
  'pending' | 'full' | 'settings' | 'refused' | 'failed';

/**
 * How much of what a job asked for this browser holds: the whole request,
 * its settings without the prompt, or nothing but a placeholder.
 */
export type RequestKnowledge = 'full' | 'settings' | 'none';

/**
 * What a job's stored request may stand for. A job submitted here holds its
 * request in full. An adopted one holds only what was read back for it, and
 * until that has succeeded its request is a placeholder that must not be
 * shown, loaded or shared as if it were what was asked for.
 */
export function requestKnowledge(
  job: Pick<LocalGenerationJob, 'adopted' | 'requestRecovery'>,
): RequestKnowledge {
  if (!job.adopted) {
    return 'full';
  }
  if (job.requestRecovery === 'full') {
    return 'full';
  }
  return job.requestRecovery === 'settings' ? 'settings' : 'none';
}

/**
 * Whether a job stays out of every list of the reader's generations.
 *
 * Before the horde could read requests back, the account's list of running
 * generations also named requests other people made through the account's
 * shared keys, and the studio took those in like any other. A job taken in
 * then cannot be told apart from one the reader started on another device, so
 * every such job is held back until the reader decides. `readBackSince` is when
 * this browser first saw the horde read a request back (null until it has).
 * A job whose own read-back reached the endpoint was taken in after that
 * change and is never held back.
 */
export function isJobHidden(
  job: Pick<
    LocalGenerationJob,
    'adopted' | 'requestRecovery' | 'keptByReader' | 'createdAt'
  >,
  readBackSince: number | null,
): boolean {
  if (!job.adopted || job.keptByReader || readBackSince === null) {
    return false;
  }
  if (
    job.requestRecovery === 'full' ||
    job.requestRecovery === 'settings' ||
    job.requestRecovery === 'refused'
  ) {
    return false;
  }
  return job.createdAt < readBackSince;
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
    const wait = (job.completedAt ?? job.updatedAt) - job.createdAt;
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
