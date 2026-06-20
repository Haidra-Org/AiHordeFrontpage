/**
 * Client-side encoding of a user-selected image file into the bare base64
 * payload the AI Horde `source_image` field expects (no `data:` URL prefix).
 *
 * The Horde rejects oversized payloads, and large source images waste bandwidth
 * and kudos, so we downscale to a bounded longest-edge and re-encode to webp
 * before encoding. This keeps a typical phone photo well under the size cap
 * while preserving enough detail for captioning/interrogation.
 */

export const DEFAULT_MAX_EDGE = 1024;
export const DEFAULT_WEBP_QUALITY = 0.9;

export interface EncodeImageOptions {
  /** Longest edge (px) the image is scaled down to. Never upscales. */
  maxEdge?: number;
  /** webp quality, 0-1. */
  quality?: number;
}

export interface EncodedImage {
  /** Bare base64 payload (no `data:image/...;base64,` prefix). */
  base64: string;
  /** Output mime type (always image/webp here). */
  mimeType: string;
  width: number;
  height: number;
}

export class ImageEncodingError extends Error {}

const ACCEPTED_TYPE_PATTERN = /^image\//i;

function computeTargetSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width, height };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Decode, downscale, and re-encode an image file to a base64 webp payload.
 *
 * Relies on browser-only APIs (`createImageBitmap`, `<canvas>`); callers must
 * guard with `isPlatformBrowser` before invoking during SSR.
 */
export async function fileToResizedBase64(
  file: File,
  options: EncodeImageOptions = {},
): Promise<EncodedImage> {
  if (!ACCEPTED_TYPE_PATTERN.test(file.type)) {
    throw new ImageEncodingError('Selected file is not an image.');
  }

  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options.quality ?? DEFAULT_WEBP_QUALITY;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageEncodingError('Could not decode the selected image.');
  }

  try {
    const target = computeTargetSize(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new ImageEncodingError('Canvas 2D context is unavailable.');
    }
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);

    const mimeType = 'image/webp';
    const dataUrl = canvas.toDataURL(mimeType, quality);
    const base64 = stripDataUrlPrefix(dataUrl);
    if (!base64) {
      throw new ImageEncodingError('Failed to encode the image.');
    }

    return { base64, mimeType, width: target.width, height: target.height };
  } finally {
    bitmap.close();
  }
}

/** Strip a leading `data:<mime>;base64,` prefix, returning the bare payload. */
export function stripDataUrlPrefix(value: string): string {
  const commaIndex = value.indexOf(',');
  return commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
}

/** Approximate decoded byte size of a base64 string. */
export function base64ByteLength(base64: string): number {
  const normalized = base64.replace(/=+$/, '');
  return Math.floor((normalized.length * 3) / 4);
}
