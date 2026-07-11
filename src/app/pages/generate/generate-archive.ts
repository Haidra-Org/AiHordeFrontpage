import { zipSync, type Zippable } from 'fflate';
import { StoredJobImage } from '../../types/generation-job';

/** Pick a file extension from an image MIME type, defaulting to webp. */
function extensionFor(mimeType: string): string {
  if (mimeType.includes('png')) {
    return 'png';
  }
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
    return 'jpg';
  }
  if (mimeType.includes('gif')) {
    return 'gif';
  }
  return 'webp';
}

/**
 * Build a filename for a single result image, preferring the seed for
 * disambiguation and falling back to the image id.
 */
export function imageFileName(image: StoredJobImage, index: number): string {
  const seed = image.metadata?.seed;
  const stem = seed
    ? `${index + 1}-seed-${seed}`
    : `${index + 1}-${image.imageId}`;
  return `${stem}.${extensionFor(image.mimeType)}`;
}

/**
 * Zip a job's result images into a single archive. Returns the zipped bytes; the
 * caller wraps them in a Blob and triggers the download.
 */
export async function buildJobImageArchive(
  images: StoredJobImage[],
): Promise<Uint8Array> {
  const files: Zippable = {};
  await Promise.all(
    images.map(async (image, index) => {
      const bytes = new Uint8Array(await image.blob.arrayBuffer());
      files[imageFileName(image, index)] = bytes;
    }),
  );
  return zipSync(files);
}
