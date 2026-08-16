import { describe, expect, it } from 'vitest';
import { deriveImageMeta } from './image-metadata';
import { ImageGenerationRequest } from '../../types/generation';
import { StoredJobImageMetadata } from '../../types/generation-job';

const TXT2IMG_REQUEST: ImageGenerationRequest = {
  prompt: 'a fox',
  params: { width: 512, height: 512 },
};

const IMG2IMG_REQUEST: ImageGenerationRequest = {
  ...TXT2IMG_REQUEST,
  source_processing: 'img2img',
};

function metadata(
  genMetadata: StoredJobImageMetadata['genMetadata'],
): StoredJobImageMetadata {
  return { seed: '1', model: 'model', genMetadata };
}

describe('deriveImageMeta', () => {
  it('drops a source-image fault on a request that sent no source image', () => {
    const derived = deriveImageMeta(
      metadata([{ type: 'source_image', value: 'parse_failed' }]),
      TXT2IMG_REQUEST,
    );

    expect(derived.errors).toEqual([]);
  });

  it('drops source mask and extra source faults on the same request', () => {
    const derived = deriveImageMeta(
      metadata([
        { type: 'source_mask', value: 'parse_failed' },
        { type: 'extra_source_images', value: 'download_failed', ref: '0' },
      ]),
      TXT2IMG_REQUEST,
    );

    expect(derived.errors).toEqual([]);
  });

  it('keeps a source-image fault when the request asked for one', () => {
    const derived = deriveImageMeta(
      metadata([{ type: 'source_image', value: 'parse_failed' }]),
      IMG2IMG_REQUEST,
    );

    expect(derived.errors).toEqual([
      { type: 'source_image', value: 'parse_failed', ref: undefined },
    ]);
  });

  it('keeps a source-image fault when no request is known', () => {
    const derived = deriveImageMeta(
      metadata([{ type: 'source_image', value: 'parse_failed' }]),
    );

    expect(derived.errors).toHaveLength(1);
  });

  it('keeps lora and ti faults regardless of the source inputs', () => {
    const derived = deriveImageMeta(
      metadata([
        { type: 'lora', value: 'download_failed', ref: '1234' },
        { type: 'ti', value: 'parse_failed' },
        { type: 'source_image', value: 'parse_failed' },
      ]),
      TXT2IMG_REQUEST,
    );

    expect(derived.errors).toEqual([
      { type: 'lora', value: 'download_failed', ref: '1234' },
      { type: 'ti', value: 'parse_failed', ref: undefined },
    ]);
  });

  it('still reads censorship and the aesthetic score', () => {
    const derived = deriveImageMeta(
      metadata([
        { type: 'censorship', value: 'nsfw' },
        { type: 'aesthetic_score', value: 'see_ref', ref: '7.5' },
        { type: 'source_image', value: 'parse_failed' },
      ]),
      TXT2IMG_REQUEST,
    );

    expect(derived.censored).toBe(true);
    expect(derived.censorReason).toBe('nsfw');
    expect(derived.aesthetic).toBe(7.5);
    expect(derived.errors).toEqual([]);
  });
});
