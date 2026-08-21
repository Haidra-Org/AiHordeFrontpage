/**
 * Pure arithmetic behind the source-image editor: converting a brush size
 * between what the hand sees and what the picture stores, snapping the frame
 * that grows a canvas to the sizes the form will accept, and deciding what a
 * session actually touched so Apply re-encodes no more than it must.
 *
 * Nothing here touches Konva, a canvas or the DOM, so all of it is testable
 * without a browser. The drawing surface itself is the untestable part and is
 * kept as thin over these functions as it can be.
 */

import type { OutpaintAnchor } from './source-image';

/** A rectangle in picture pixels, as the frame and the crop both are. */
export interface EditorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A brush is set in the pixels the hand sees, so it feels the same however far
 * in the view is zoomed. What it lays down is measured in picture pixels.
 */
export function brushImageSize(screenSize: number, stageScale: number): number {
  if (!(stageScale > 0)) {
    return screenSize;
  }
  return screenSize / stageScale;
}

/**
 * How far the pointer must travel before a stroke takes another point. The gate
 * is a screen distance so that a fast flick is sampled just as finely far out as
 * it is close in; measured in picture pixels, a zoomed-out flick would skip past
 * the corners and cut them.
 */
export function pointSpacing(
  screenSpacing: number,
  stageScale: number,
): number {
  return brushImageSize(screenSpacing, stageScale);
}

/**
 * Round a dimension to the step the form accepts, keeping it within range. The
 * frame is dragged freely and the form only takes multiples, so every drag ends
 * on a size the form will not immediately argue with.
 */
export function snapDimension(
  value: number,
  step: number,
  min: number,
  max: number,
): number {
  const snapped = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

/**
 * The frame for a picture of `image` size inside a canvas of `target` size,
 * placed at `offset` (or by `anchor` when nothing has been placed by hand).
 * The frame is expressed around the picture, whose top-left is the origin, so a
 * canvas that grows upwards or leftwards has a negative x or y.
 */
export function frameForTarget(
  image: { width: number; height: number },
  targetWidth: number,
  targetHeight: number,
  offset: { x: number; y: number } | null,
  anchor: OutpaintAnchor,
): EditorRect {
  const width = Math.max(targetWidth, image.width);
  const height = Math.max(targetHeight, image.height);
  const spareWidth = width - image.width;
  const spareHeight = height - image.height;
  const placed = offset ?? anchorOffset(spareWidth, spareHeight, anchor);
  return {
    x: reachBack(placed.x, spareWidth),
    y: reachBack(placed.y, spareHeight),
    width,
    height,
  };
}

/** How far the frame reaches back past the picture, as a negative coordinate.
 *  Adding zero is what keeps a placement flush to the edge off negative zero,
 *  which reads as a different value to both an equality check and a readout. */
function reachBack(offset: number, spare: number): number {
  return -Math.min(Math.max(0, offset), Math.max(0, spare)) + 0;
}

/** Where the picture's top-left lands for a nine-way anchor. */
function anchorOffset(
  spareWidth: number,
  spareHeight: number,
  anchor: OutpaintAnchor,
): { x: number; y: number } {
  const left = Math.max(0, spareWidth);
  const top = Math.max(0, spareHeight);
  const x = anchor.endsWith('left')
    ? 0
    : anchor.endsWith('right')
      ? left
      : Math.round(left / 2);
  const y = anchor.startsWith('top')
    ? 0
    : anchor.startsWith('bottom')
      ? top
      : Math.round(top / 2);
  return { x, y };
}

/**
 * Where the picture sits inside a frame, as the offset
 * {@link composeOutpaintCanvas} places it at. The frame's own origin is the
 * picture's top-left, so the offset is simply how far the frame reaches back.
 */
export function offsetForFrame(frame: EditorRect): { x: number; y: number } {
  return {
    x: Math.round(Math.max(0, -frame.x)),
    y: Math.round(Math.max(0, -frame.y)),
  };
}

/**
 * The sizes the form should hold for a frame, snapped to the step it accepts.
 */
export function targetForFrame(
  frame: EditorRect,
  step: number,
  min: number,
  max: number,
): { width: number; height: number } {
  return {
    width: snapDimension(frame.width, step, min, max),
    height: snapDimension(frame.height, step, min, max),
  };
}

/**
 * How close to an edge a placement has to be, as a share of the room there is,
 * before it reads as sitting against that edge rather than somewhere between.
 */
const ANCHOR_TOLERANCE = 0.15;

/**
 * The nine-way anchor a free placement most nearly is. The request still
 * carries an anchor so a past generation can be reproduced from its settings
 * alone, and this is the honest answer to what a hand-placed frame described.
 */
export function anchorForOffset(
  offset: { x: number; y: number },
  spareWidth: number,
  spareHeight: number,
): OutpaintAnchor {
  const horizontal = axisAnchor(offset.x, spareWidth, 'left', 'right');
  const vertical = axisAnchor(offset.y, spareHeight, 'top', 'bottom');
  if (vertical === '' && horizontal === '') {
    return 'center';
  }
  if (vertical === '') {
    return horizontal as OutpaintAnchor;
  }
  if (horizontal === '') {
    return vertical as OutpaintAnchor;
  }
  return `${vertical}-${horizontal}` as OutpaintAnchor;
}

function axisAnchor(
  offset: number,
  spare: number,
  low: string,
  high: string,
): string {
  if (spare <= 0) {
    return '';
  }
  const share = Math.min(1, Math.max(0, offset / spare));
  if (share <= ANCHOR_TOLERANCE) {
    return low;
  }
  if (share >= 1 - ANCHOR_TOLERANCE) {
    return high;
  }
  return '';
}

/**
 * What a session has changed since it was opened or last applied. Pixel work is
 * staged, so this is what tells Apply which of the picture, the mask and the
 * grown canvas it has to rebuild, and what closing would throw away.
 */
export interface EditorTouched {
  /** Colour strokes, shapes, or a crop: anything that alters the picture. */
  picture: boolean;
  /** Mask strokes, which travel separately from the picture. */
  mask: boolean;
  /** The frame that grows the canvas has been moved or resized. */
  frame: boolean;
}

export const NOTHING_TOUCHED: EditorTouched = {
  picture: false,
  mask: false,
  frame: false,
};

/**
 * Whether closing now would lose work the reader has not applied. Every pixel
 * step takes an undo entry, so where the session stands is the top of the undo
 * stack rather than the fact that something once happened: undoing back to the
 * step that was last applied leaves nothing staged, however much was drawn and
 * taken back on the way. `offHistory` carries the few edits that take no undo
 * entry of their own, which nothing can step back from.
 */
export function hasUnappliedWork(
  atLastAppliedStep: boolean,
  offHistory: boolean,
): boolean {
  return offHistory || !atLastAppliedStep;
}

/**
 * Whether Apply has to flatten and re-encode the picture. A session that only
 * painted a mask, or only moved the frame, hands the original bytes straight
 * back: re-encoding them would cost a generation of quality for no change. A
 * blank sheet is always re-encoded, because the painting is the picture.
 */
export function needsPictureExport(
  touched: EditorTouched,
  fromBlank: boolean,
): boolean {
  return fromBlank || touched.picture;
}
