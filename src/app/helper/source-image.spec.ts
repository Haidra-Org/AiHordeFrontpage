import { describe, expect, it } from 'vitest';
import {
  SOURCE_MAX_EDGE,
  alphaHasPaint,
  alphaToMaskPixels,
  computeScaledSize,
  maskPixelsToAlpha,
  outpaintOffset,
} from './source-image';

describe('computeScaledSize', () => {
  it('never upscales an image within the cap', () => {
    expect(computeScaledSize(800, 600, SOURCE_MAX_EDGE)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('scales the longest edge down to the cap, preserving aspect', () => {
    const size = computeScaledSize(6144, 3072, SOURCE_MAX_EDGE);
    expect(size.width).toBe(3072);
    expect(size.height).toBe(1536);
  });

  it('scales a tall image by its height', () => {
    const size = computeScaledSize(1000, 4000, 2000);
    expect(size.height).toBe(2000);
    expect(size.width).toBe(500);
  });

  it('returns the input unchanged for zero size', () => {
    expect(computeScaledSize(0, 0, 3072)).toEqual({ width: 0, height: 0 });
  });
});

describe('alphaHasPaint', () => {
  it('is false for a fully-transparent buffer', () => {
    expect(alphaHasPaint(new Uint8ClampedArray([0, 0, 0, 0, 9, 9, 9, 0]))).toBe(
      false,
    );
  });

  it('is true when any pixel has non-zero alpha', () => {
    expect(alphaHasPaint(new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 5]))).toBe(
      true,
    );
  });
});

describe('alphaToMaskPixels', () => {
  it('maps painted pixels to opaque white and the rest to opaque black', () => {
    // First pixel unpainted (alpha 0), second painted (alpha 128).
    const input = new Uint8ClampedArray([200, 30, 30, 0, 200, 30, 30, 128]);
    const out = alphaToMaskPixels(input);
    expect(Array.from(out.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(out.slice(4, 8))).toEqual([255, 255, 255, 255]);
  });
});

describe('maskPixelsToAlpha', () => {
  const ink = { r: 56, g: 189, b: 248 };

  it('paints white back as opaque ink and black as nothing', () => {
    const input = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    const out = maskPixelsToAlpha(input, ink);
    expect(Array.from(out.slice(0, 4))).toEqual([56, 189, 248, 0]);
    expect(Array.from(out.slice(4, 8))).toEqual([56, 189, 248, 255]);
  });

  it('round-trips a painted region back to a painted region', () => {
    const painted = new Uint8ClampedArray([
      9, 9, 9, 0, 9, 9, 9, 200, 9, 9, 9, 0,
    ]);
    const restored = maskPixelsToAlpha(alphaToMaskPixels(painted), ink);
    expect(restored[3]).toBe(0);
    expect(restored[7]).toBe(255);
    expect(restored[11]).toBe(0);
    expect(alphaHasPaint(restored)).toBe(true);
  });

  it('keeps a resampled grey edge on the side it looks like', () => {
    const input = new Uint8ClampedArray([60, 60, 60, 255, 200, 200, 200, 255]);
    const out = maskPixelsToAlpha(input, ink);
    expect(out[3]).toBe(0);
    expect(out[7]).toBe(255);
  });

  it('treats a transparent mask pixel as unpainted whatever its colour', () => {
    const out = maskPixelsToAlpha(
      new Uint8ClampedArray([255, 255, 255, 0]),
      ink,
    );
    expect(out[3]).toBe(0);
  });
});

describe('outpaintOffset', () => {
  it('puts the picture where the anchor says and splits the rest evenly', () => {
    expect(outpaintOffset(400, 200, 'top-left')).toEqual({ x: 0, y: 0 });
    expect(outpaintOffset(400, 200, 'bottom-right')).toEqual({
      x: 400,
      y: 200,
    });
    expect(outpaintOffset(400, 200, 'center')).toEqual({ x: 200, y: 100 });
    expect(outpaintOffset(400, 200, 'top')).toEqual({ x: 200, y: 0 });
    expect(outpaintOffset(400, 200, 'left')).toEqual({ x: 0, y: 100 });
  });

  it('rounds an odd remainder rather than leaving a fractional offset', () => {
    // A canvas offset by half a pixel would resample the picture it is meant to
    // be leaving untouched.
    expect(outpaintOffset(101, 0, 'center')).toEqual({ x: 51, y: 0 });
  });

  it('never places the picture outside a canvas no larger than itself', () => {
    expect(outpaintOffset(0, 0, 'bottom-right')).toEqual({ x: 0, y: 0 });
    expect(outpaintOffset(-50, -50, 'center')).toEqual({ x: 0, y: 0 });
  });
});
