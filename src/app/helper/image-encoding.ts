/**
 * Client-side encoding of a user-selected image file into the bare base64
 * payload the AI Horde `source_image` field expects (no `data:` URL prefix).
 *
 * The Horde rejects oversized payloads, and large source images waste bandwidth
 * and kudos, so we downscale to a bounded longest-edge and re-encode to webp
 * before encoding. This keeps a typical phone photo well under the size cap
 * while preserving enough detail for captioning/interrogation.
 */

import {
  isLikelyImageFileLink,
  toRenderableImageSource,
} from './generation-image';
import { SOURCE_MAX_EDGE } from './source-image';

/**
 * The horde's own dimension cap, so a picture alchemy accepts is one the image
 * studio would accept too. The 4 MB payload ceiling, not this edge, is what a
 * large picture actually runs into.
 */
export const DEFAULT_MAX_EDGE = SOURCE_MAX_EDGE;
export const DEFAULT_WEBP_QUALITY = 0.9;

/**
 * Longest edge (px) for a persisted source thumbnail. Sized for the widest
 * consumer (a gallery tile runs 300-500px on desktop) rather than the 72px rail
 * thumb, because a rail-sized image visibly upscales in a tile.
 */
export const THUMB_MAX_EDGE = 256;
/** webp quality for source thumbnails: small enough to persist many of them. */
export const THUMB_WEBP_QUALITY = 0.55;

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

/**
 * Downscale an already-resolved alchemy source (a remote/root-relative URL, a
 * `data:` URL, or a bare base64 payload) into a tiny `data:image/webp` URL for
 * the results rail/gallery thumbnails.
 *
 * A remote URL is returned verbatim: it renders directly in an `<img>`, costs no
 * localStorage, and re-encoding it via canvas would taint on cross-origin reads
 * anyway. A base64/data source is decoded and redrawn at `THUMB_MAX_EDGE`.
 *
 * The result is the *persistable* thumbnail; callers that can show something
 * larger should prefer the full source they already hold in memory.
 *
 * Browser-only (needs `<canvas>`); returns `null` on any failure (SSR, no
 * canvas, decode error) so callers fall back to a placeholder rather than throw.
 */
export async function sourceToThumbnailDataUrl(
  source: string,
): Promise<string | null> {
  if (!source) return null;
  if (isLikelyImageFileLink(source)) return source;
  if (!canDrawThumbnails()) return null;

  try {
    const image = await loadImageElement(toRenderableImageSource(source));
    return imageToThumbnailDataUrl(image);
  } catch {
    return null;
  }
}

/**
 * A small copy of a picture held as bytes, for the tiles and table cells that
 * show every request's results at once. Null where the picture cannot be
 * decoded or drawn, which the caller treats as "no small copy" rather than
 * an error: the full picture is still there.
 */
export async function blobToThumbnailDataUrl(
  blob: Blob,
): Promise<string | null> {
  if (!canDrawThumbnails()) return null;
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImageElement(url);
    return imageToThumbnailDataUrl(image);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Whether this runtime can draw at all. A test DOM has a canvas element with
 * no drawing context, and an image it never loads: asking it for a thumbnail
 * would wait forever rather than fail.
 */
function canDrawThumbnails(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.createElement('canvas').getContext('2d') !== null;
  } catch {
    return false;
  }
}

function imageToThumbnailDataUrl(image: HTMLImageElement): string | null {
  const target = computeTargetSize(
    image.naturalWidth,
    image.naturalHeight,
    THUMB_MAX_EDGE,
  );
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, target.width, target.height);
  return canvas.toDataURL('image/webp', THUMB_WEBP_QUALITY);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = (): void => resolve(image);
    image.onerror = (): void =>
      reject(new ImageEncodingError('Could not decode image for thumbnail.'));
    image.src = src;
  });
}
