import {
  ImageGenerationRequest,
  SubmittedImageRequest,
} from '../types/generation';

/**
 * Turn the horde's record of a request into the request shape the studio
 * stores for a job it submitted itself, so a job taken over from the account
 * reads the same as one made here.
 *
 * Left out:
 * - `source_image`, `source_mask` and the extra source images. The horde
 *   returns links to its own copies, which expire, and the studio keeps a
 *   job's pictures in its image store, never in the request. `source_processing`
 *   stays when a source image came with it, as it does on the studio's own
 *   stored requests.
 * - `source_processing` without a source image. The horde fills every unset
 *   parameter with its default, so a text-to-image request reads back with
 *   `img2img`, which would mark the job as carrying an input it never had.
 * - `validated_backends` and `proxied_account`, which the studio never sends.
 * - `params.special`, which is the horde's own and not a studio setting.
 *
 * A missing prompt (a request stored before the horde kept prompts) becomes the
 * empty string, which the horde refuses on submit and so never stands for a
 * real prompt.
 */
export function studioRequestFromSubmitted(
  submitted: SubmittedImageRequest,
): ImageGenerationRequest {
  const request: ImageGenerationRequest = { prompt: submitted.prompt ?? '' };
  if (submitted.params) {
    const { special: _special, ...params } = submitted.params;
    request.params = params;
  }
  if (submitted.nsfw !== undefined) request.nsfw = submitted.nsfw;
  if (submitted.censor_nsfw !== undefined) {
    request.censor_nsfw = submitted.censor_nsfw;
  }
  if (submitted.trusted_workers !== undefined) {
    request.trusted_workers = submitted.trusted_workers;
  }
  if (submitted.slow_workers !== undefined) {
    request.slow_workers = submitted.slow_workers;
  }
  if (submitted.extra_slow_workers !== undefined) {
    request.extra_slow_workers = submitted.extra_slow_workers;
  }
  if (submitted.workers !== undefined) request.workers = submitted.workers;
  if (submitted.worker_blacklist !== undefined) {
    request.worker_blacklist = submitted.worker_blacklist;
  }
  if (submitted.models !== undefined) request.models = submitted.models;
  if (
    submitted.source_processing !== undefined &&
    submitted.source_image !== undefined
  ) {
    request.source_processing = submitted.source_processing;
  }
  if (submitted.r2 !== undefined) request.r2 = submitted.r2;
  if (submitted.shared !== undefined) request.shared = submitted.shared;
  if (submitted.disable_batching !== undefined) {
    request.disable_batching = submitted.disable_batching;
  }
  if (submitted.webhook !== undefined) request.webhook = submitted.webhook;
  return request;
}
