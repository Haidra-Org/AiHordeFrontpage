import {
  ImageGenerationRequest,
  SubmittedImageRequest,
} from '../types/generation';

/** Keep parameters inspectable without copying image bytes or expiring links into the view. */
export function imageRequestWithPlaceholders<
  T extends ImageGenerationRequest | SubmittedImageRequest,
>(request: T, placeholder: string): T {
  const copy = JSON.parse(JSON.stringify(request)) as T;
  if (copy.source_image !== undefined) copy.source_image = placeholder;
  if (copy.source_mask !== undefined) copy.source_mask = placeholder;
  if (copy.extra_source_images) {
    copy.extra_source_images = copy.extra_source_images.map((source) => ({
      ...source,
      image: placeholder,
    }));
  }
  return copy;
}
