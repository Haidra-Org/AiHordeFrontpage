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
 * caller wraps them in a Blob and triggers the download. When `metaByImageId` is
 * given, a `<name>.json` metadata sidecar is written next to each image whose id
 * it carries, so an export keeps each image's parameters and returned data.
 */
export async function buildJobImageArchive(
  images: StoredJobImage[],
  metaByImageId?: Map<string, string>,
): Promise<Uint8Array> {
  const files: Zippable = {};
  const encoder = new TextEncoder();
  await Promise.all(
    images.map(async (image, index) => {
      const bytes = new Uint8Array(await image.blob.arrayBuffer());
      const name = imageFileName(image, index);
      files[name] = bytes;
      const meta = metaByImageId?.get(image.imageId);
      if (meta) {
        const stem = name.replace(/\.[^.]+$/, '');
        files[`${stem}.json`] = encoder.encode(meta);
      }
    }),
  );
  return zipSync(files);
}
