import { describe, expect, it } from 'vitest';
import {
  NOTHING_TOUCHED,
  anchorForOffset,
  brushImageSize,
  frameForTarget,
  hasUnappliedWork,
  needsPictureExport,
  offsetForFrame,
  pointSpacing,
  snapDimension,
  targetForFrame,
} from './source-editor';

describe('brushImageSize', () => {
  it('is the screen size itself at one to one', () => {
    expect(brushImageSize(40, 1)).toBe(40);
  });

  it('lays down more picture pixels the further out the view is', () => {
    expect(brushImageSize(40, 0.5)).toBe(80);
  });

  it('lays down fewer the further in it is', () => {
    expect(brushImageSize(40, 4)).toBe(10);
  });

  it('falls back to the screen size for a nonsense scale', () => {
    expect(brushImageSize(40, 0)).toBe(40);
    expect(brushImageSize(40, -2)).toBe(40);
  });
});

describe('pointSpacing', () => {
  it('samples a zoomed-out flick finely enough to keep its corners', () => {
    expect(pointSpacing(3, 0.25)).toBe(12);
    expect(pointSpacing(3, 3)).toBe(1);
  });
});

describe('snapDimension', () => {
  it('rounds to the nearest step', () => {
    expect(snapDimension(700, 64, 64, 3072)).toBe(704);
    expect(snapDimension(500, 64, 64, 3072)).toBe(512);
  });

  it('holds the range', () => {
    expect(snapDimension(10, 64, 64, 3072)).toBe(64);
    expect(snapDimension(99999, 64, 64, 3072)).toBe(3072);
  });
});

describe('frameForTarget', () => {
  const image = { width: 512, height: 512 };

  it('is the picture itself when there is no room to grow', () => {
    expect(frameForTarget(image, 512, 512, null, 'center')).toEqual({
      x: 0,
      y: 0,
      width: 512,
      height: 512,
    });
  });

  it('never shrinks below the picture', () => {
    const frame = frameForTarget(image, 256, 128, null, 'center');
    expect(frame.width).toBe(512);
    expect(frame.height).toBe(512);
  });

  it('reaches back around a centred picture', () => {
    expect(frameForTarget(image, 768, 768, null, 'center')).toEqual({
      x: -128,
      y: -128,
      width: 768,
      height: 768,
    });
  });

  it('grows only outwards from a top-left anchor', () => {
    expect(frameForTarget(image, 768, 768, null, 'top-left')).toEqual({
      x: 0,
      y: 0,
      width: 768,
      height: 768,
    });
  });

  it('grows only backwards from a bottom-right anchor', () => {
    expect(frameForTarget(image, 768, 768, null, 'bottom-right')).toEqual({
      x: -256,
      y: -256,
      width: 768,
      height: 768,
    });
  });

  it('honours a hand placement over the anchor', () => {
    const frame = frameForTarget(image, 768, 768, { x: 40, y: 10 }, 'center');
    expect(frame.x).toBe(-40);
    expect(frame.y).toBe(-10);
  });

  it('keeps a hand placement inside the room there is', () => {
    const frame = frameForTarget(
      image,
      768,
      768,
      { x: 9999, y: -50 },
      'center',
    );
    expect(frame.x).toBe(-256);
    expect(frame.y).toBe(0);
  });
});

describe('offsetForFrame', () => {
  it('is the round trip of a frame built from an offset', () => {
    const frame = frameForTarget(
      { width: 512, height: 384 },
      900,
      700,
      { x: 100, y: 60 },
      'center',
    );
    expect(offsetForFrame(frame)).toEqual({ x: 100, y: 60 });
  });

  it('is the origin for a frame that grows only outwards', () => {
    expect(offsetForFrame({ x: 0, y: 0, width: 800, height: 800 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('targetForFrame', () => {
  it('snaps a dragged frame to the sizes the form accepts', () => {
    expect(
      targetForFrame({ x: -30, y: -12, width: 701, height: 499 }, 64, 64, 3072),
    ).toEqual({ width: 704, height: 512 });
  });
});

describe('anchorForOffset', () => {
  it('reads a picture pinned to a corner as that corner', () => {
    expect(anchorForOffset({ x: 0, y: 0 }, 200, 200)).toBe('top-left');
    expect(anchorForOffset({ x: 200, y: 200 }, 200, 200)).toBe('bottom-right');
  });

  it('reads a middling placement as centred', () => {
    expect(anchorForOffset({ x: 100, y: 100 }, 200, 200)).toBe('center');
  });

  it('names only the axis that has an edge', () => {
    expect(anchorForOffset({ x: 100, y: 0 }, 200, 200)).toBe('top');
    expect(anchorForOffset({ x: 200, y: 100 }, 200, 200)).toBe('right');
  });

  it('is centred when there is no room on either axis', () => {
    expect(anchorForOffset({ x: 0, y: 0 }, 0, 0)).toBe('center');
  });

  it('tolerates a placement near but not on an edge', () => {
    expect(anchorForOffset({ x: 10, y: 190 }, 200, 200)).toBe('bottom-left');
  });
});

describe('editor staging', () => {
  it('has nothing to lose while the session stands where it was applied', () => {
    expect(hasUnappliedWork(true)).toBe(false);
  });

  it('has work to lose once the session stands on a later step', () => {
    expect(hasUnappliedWork(false)).toBe(true);
  });

  it('hands the original bytes back when only the mask was painted', () => {
    expect(needsPictureExport({ ...NOTHING_TOUCHED, mask: true }, false)).toBe(
      false,
    );
  });

  it('re-encodes once the picture itself changed', () => {
    expect(
      needsPictureExport({ ...NOTHING_TOUCHED, picture: true }, false),
    ).toBe(true);
  });

  it('always encodes a blank sheet, because the painting is the picture', () => {
    expect(needsPictureExport(NOTHING_TOUCHED, true)).toBe(true);
  });
});
