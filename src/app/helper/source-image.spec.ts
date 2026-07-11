import { describe, expect, it } from 'vitest';
import {
  SOURCE_MAX_EDGE,
  alphaHasPaint,
  alphaToMaskPixels,
  computeScaledSize,
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
