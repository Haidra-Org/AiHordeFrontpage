import { describe, expect, it } from 'vitest';
import {
  IMAGE_RESULT_ALCHEMY_FORMS,
  alchemyImageTiles,
  estimateAlchemyKudos,
} from './alchemy-kudos';

describe('alchemyImageTiles', () => {
  it('counts a part of a square as a whole one', () => {
    expect(alchemyImageTiles(512, 512)).toBe(1);
    expect(alchemyImageTiles(513, 512)).toBe(2);
    expect(alchemyImageTiles(1024, 1024)).toBe(4);
    expect(alchemyImageTiles(640, 384)).toBe(2);
  });
});

describe('estimateAlchemyKudos', () => {
  it('prices the studio reading at eight with slow workers and six without', () => {
    const forms = ['caption', 'interrogation'];
    expect(estimateAlchemyKudos(forms, { slowWorkers: true })).toBe(8);
    expect(estimateAlchemyKudos(forms, { slowWorkers: false })).toBe(6);
  });

  it('charges a caption one and a completion, and interrogation three', () => {
    expect(estimateAlchemyKudos(['caption'], { slowWorkers: false })).toBe(2);
    expect(
      estimateAlchemyKudos(['interrogation'], { slowWorkers: false }),
    ).toBe(4);
  });

  it('charges every other text form at the flat rate', () => {
    for (const form of [
      'nsfw',
      'vectorize',
      'palette',
      'describe',
      'aesthetic',
    ]) {
      expect(estimateAlchemyKudos([form], { slowWorkers: false })).toBe(2);
    }
  });

  it('adds one per form again when slow workers are allowed', () => {
    expect(estimateAlchemyKudos(['caption'], { slowWorkers: true })).toBe(3);
    expect(
      estimateAlchemyKudos(['caption', 'nsfw'], { slowWorkers: true }),
    ).toBe(6);
  });

  it('scales a picture-returning form by the tiles it covers', () => {
    expect(
      estimateAlchemyKudos(['RealESRGAN_x4plus'], {
        slowWorkers: false,
        width: 512,
        height: 512,
      }),
    ).toBe(4);
    expect(
      estimateAlchemyKudos(['GFPGAN'], {
        slowWorkers: false,
        width: 1024,
        height: 1024,
      }),
    ).toBe(13);
    expect(
      estimateAlchemyKudos(['strip_background'], {
        slowWorkers: true,
        width: 1024,
        height: 512,
      }),
    ).toBe(8);
  });

  it('treats every post-processing form as priced by area', () => {
    for (const form of IMAGE_RESULT_ALCHEMY_FORMS) {
      expect(estimateAlchemyKudos([form], { slowWorkers: false })).toBeNull();
      expect(
        estimateAlchemyKudos([form], {
          slowWorkers: false,
          width: 512,
          height: 512,
        }),
      ).toBe(4);
    }
  });

  it('refuses to price a picture-returning form without a usable size', () => {
    expect(
      estimateAlchemyKudos(['RealESRGAN_x4plus'], {
        slowWorkers: true,
        width: 512,
      }),
    ).toBeNull();
    expect(
      estimateAlchemyKudos(['RealESRGAN_x4plus'], {
        slowWorkers: true,
        width: 0,
        height: 512,
      }),
    ).toBeNull();
    expect(
      estimateAlchemyKudos(['RealESRGAN_x4plus'], {
        slowWorkers: true,
        width: Number.NaN,
        height: 512,
      }),
    ).toBeNull();
  });

  it('refuses to price a control map, whatever else the request asks for', () => {
    expect(
      estimateAlchemyKudos(['annotation'], { slowWorkers: true }),
    ).toBeNull();
    expect(
      estimateAlchemyKudos(['caption', 'annotation'], {
        slowWorkers: true,
        width: 512,
        height: 512,
      }),
    ).toBeNull();
  });

  it('prices an empty request at nothing', () => {
    expect(estimateAlchemyKudos([], { slowWorkers: true })).toBe(0);
  });

  it('adds up a mixed request', () => {
    expect(
      estimateAlchemyKudos(['caption', 'interrogation', 'RealESRGAN_x4plus'], {
        slowWorkers: true,
        width: 512,
        height: 512,
      }),
    ).toBe(13);
  });
});
