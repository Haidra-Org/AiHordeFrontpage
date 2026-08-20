/**
 * Client-side helpers for the /generate source-image section: downscaling a
 * user-selected image to the horde's dimension cap and turning an inpainting
 * paint layer into the black/white mask the horde expects.
 *
 * The canvas / createImageBitmap paths are browser-only; callers must guard
 * with `isPlatformBrowser` before invoking during SSR. The pixel-level
 * transforms are pure and separately exported so they can be unit-tested
 * without a real canvas.
 */

/** The horde rejects source images whose longest edge exceeds this many px. */
export const SOURCE_MAX_EDGE = 3072;

const IMAGE_TYPE_PATTERN = /^image\//i;

export interface ScaledSize {
  width: number;
  height: number;
}

/**
 * Scale `width`x`height` down so its longest edge is at most `maxEdge`,
 * preserving aspect ratio. Never upscales.
 */
export function computeScaledSize(
  width: number,
  height: number,
  maxEdge: number,
): ScaledSize {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) {
    return { width, height };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface SourceImage {
  /** Downscaled, re-encoded webp blob (no base64; the queue stores the blob). */
  blob: Blob;
  width: number;
  height: number;
}

/** Promise wrapper over the callback-based `HTMLCanvasElement.toBlob`. */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Decode, downscale (to `maxEdge`), and re-encode an image file to a webp blob.
 * Browser-only: relies on `createImageBitmap` and `<canvas>`.
 */
export async function fileToSourceImage(
  file: File,
  maxEdge: number = SOURCE_MAX_EDGE,
): Promise<SourceImage> {
  if (!IMAGE_TYPE_PATTERN.test(file.type)) {
    throw new Error('Selected file is not an image.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Could not decode the selected image.');
  }

  try {
    const size = computeScaledSize(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is unavailable.');
    }
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);

    const blob = await canvasToBlob(canvas, 'image/webp', 0.92);
    if (!blob) {
      throw new Error('Failed to encode the source image.');
    }
    return { blob, width: size.width, height: size.height };
  } finally {
    bitmap.close();
  }
}

/**
 * Wrap an already-encoded image blob (e.g. a stored source blob being re-loaded
 * into the form) as a {@link SourceImage}, reading its dimensions via decode.
 * Unlike {@link fileToSourceImage} it does not downscale or re-encode; the blob
 * is assumed to already satisfy the horde's constraints. Browser-only.
 */
export async function blobToSourceImage(blob: Blob): Promise<SourceImage> {
  const bitmap = await createImageBitmap(blob);
  try {
    return { blob, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/** True when any pixel of an RGBA buffer has a non-zero alpha (was painted). */
export function alphaHasPaint(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Turn an RGBA paint buffer into a black/white mask buffer. Any painted pixel
 * (alpha > 0) becomes opaque white; everything else becomes opaque black.
 *
 * Mask convention: the horde treats WHITE as the region to regenerate and BLACK
 * as the region to preserve. Verified against hordelib
 * `ImageUtils.add_image_alpha_channel` (which inverts the grayscale mask into
 * the source alpha channel) and `horde_compat`, whose "no mask provided"
 * fallback is an all-white image meaning "regenerate the whole image".
 */
export function alphaToMaskPixels(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const value = rgba[i + 3] > 0 ? 255 : 0;
    out[i] = value;
    out[i + 1] = value;
    out[i + 2] = value;
    out[i + 3] = 255;
  }
  return out;
}

/** Where an attached picture sits inside the larger canvas asked for. */
export type OutpaintAnchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

/** Where the picture's top-left corner lands, given how much room is spare. */
export function outpaintOffset(
  spareWidth: number,
  spareHeight: number,
  anchor: OutpaintAnchor,
): { x: number; y: number } {
  const left = Math.max(0, spareWidth);
  const top = Math.max(0, spareHeight);
  const horizontal = anchor.endsWith('left')
    ? 0
    : anchor.endsWith('right')
      ? left
      : Math.round(left / 2);
  const vertical = anchor.startsWith('top')
    ? 0
    : anchor.startsWith('bottom')
      ? top
      : Math.round(top / 2);
  return { x: horizontal, y: vertical };
}

export interface OutpaintCanvas {
  /** The picture pasted into the larger canvas, as the request's source. */
  source: Blob | null;
  /** White over everything the padding added, black over the picture itself. */
  mask: Blob | null;
  width: number;
  height: number;
  /** Where the original sits, so the panel can show what it is about to add. */
  x: number;
  y: number;
}

/**
 * Grow a picture into a larger canvas and mark the new ground for repainting.
 *
 * The horde has no notion of extending an image: outpainting selects the same
 * worker pipeline as inpainting, and the caller supplies a picture that is
 * already the requested size with a mask over the part that is not real yet.
 * White marks what will be painted, which is everything the padding added.
 *
 * The target is clamped to the horde's own edge cap and never smaller than the
 * picture, so a request can only ever grow. Browser-only.
 */
export async function composeOutpaintCanvas(
  image: SourceImage,
  targetWidth: number,
  targetHeight: number,
  anchor: OutpaintAnchor,
): Promise<OutpaintCanvas> {
  const width = Math.min(SOURCE_MAX_EDGE, Math.max(targetWidth, image.width));
  const height = Math.min(
    SOURCE_MAX_EDGE,
    Math.max(targetHeight, image.height),
  );
  const { x, y } = outpaintOffset(
    width - image.width,
    height - image.height,
    anchor,
  );
  const empty = { source: null, mask: null, width, height, x, y };

  const bitmap = await createImageBitmap(image.blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return empty;
    }
    // The new ground is painted over rather than left transparent: an alpha
    // channel on the source is read as a mask in its own right, which would
    // describe the same region twice and in the opposite sense.
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, x, y);

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) {
      return empty;
    }
    maskCtx.fillStyle = '#ffffff';
    maskCtx.fillRect(0, 0, width, height);
    maskCtx.fillStyle = '#000000';
    maskCtx.fillRect(x, y, image.width, image.height);

    return {
      source: await canvasToBlob(canvas, 'image/webp', 0.95),
      mask: await canvasToBlob(maskCanvas, 'image/png'),
      width,
      height,
      x,
      y,
    };
  } finally {
    bitmap.close();
  }
}

export interface MaskExport {
  /** PNG blob sized to the paint layer, or null when nothing could be encoded. */
  blob: Blob | null;
  /** Whether any region was painted (drives inpainting validity). */
  painted: boolean;
}

/**
 * Read an inpainting paint layer (strokes stored in its alpha channel) and
 * produce the horde mask PNG plus whether anything is painted. Browser-only.
 */
export async function exportMaskFromPaintLayer(
  paint: HTMLCanvasElement,
): Promise<MaskExport> {
  const { width, height } = paint;
  if (width === 0 || height === 0) {
    return { blob: null, painted: false };
  }
  const src = paint.getContext('2d');
  if (!src) {
    return { blob: null, painted: false };
  }
  const rgba = src.getImageData(0, 0, width, height).data;
  const painted = alphaHasPaint(rgba);
  if (!painted) {
    return { blob: null, painted: false };
  }

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const octx = out.getContext('2d');
  if (!octx) {
    return { blob: null, painted };
  }
  const image = octx.createImageData(width, height);
  image.data.set(alphaToMaskPixels(rgba));
  octx.putImageData(image, 0, 0);
  return { blob: await canvasToBlob(out, 'image/png'), painted };
}
