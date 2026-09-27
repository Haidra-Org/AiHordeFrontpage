import { studioRequestFromSubmitted } from './submitted-request';
import { SubmittedImageRequest } from '../types/generation';

describe('studioRequestFromSubmitted', () => {
  const submitted: SubmittedImageRequest = {
    prompt: 'a lighthouse at dusk###blurry',
    params: {
      sampler_name: 'k_euler_a',
      cfg_scale: 7,
      denoising_strength: 0.6,
      seed: '12345',
      seed_variation: 1,
      width: 1024,
      height: 768,
      steps: 30,
      n: 2,
      karras: true,
      loras: [{ name: '1234', model: 1, clip: 1 }],
      special: { anything: true },
    },
    nsfw: false,
    censor_nsfw: true,
    trusted_workers: false,
    validated_backends: true,
    slow_workers: true,
    extra_slow_workers: false,
    workers: ['w-1'],
    worker_blacklist: false,
    models: ['AlbedoBase XL (SDXL)'],
    source_image: 'https://r2.example/abc_src.webp?X-Amz-Signature=1',
    source_processing: 'img2img',
    source_mask: 'https://r2.example/abc_msk.webp?X-Amz-Signature=1',
    extra_source_images: [
      { image: 'https://r2.example/abc_exra_src_0.webp', strength: 0.5 },
    ],
    r2: true,
    shared: false,
    disable_batching: false,
    webhook: 'https://example.org/hook',
    proxied_account: 'someone',
  };

  it('carries every setting the studio sends', () => {
    expect(studioRequestFromSubmitted(submitted)).toEqual({
      prompt: 'a lighthouse at dusk###blurry',
      params: {
        sampler_name: 'k_euler_a',
        cfg_scale: 7,
        denoising_strength: 0.6,
        seed: '12345',
        seed_variation: 1,
        width: 1024,
        height: 768,
        steps: 30,
        n: 2,
        karras: true,
        loras: [{ name: '1234', model: 1, clip: 1 }],
      },
      nsfw: false,
      censor_nsfw: true,
      trusted_workers: false,
      slow_workers: true,
      extra_slow_workers: false,
      workers: ['w-1'],
      worker_blacklist: false,
      models: ['AlbedoBase XL (SDXL)'],
      source_processing: 'img2img',
      r2: true,
      shared: false,
      disable_batching: false,
      webhook: 'https://example.org/hook',
    });
  });

  it('drops the source picture links, which are not inputs the studio can send', () => {
    const request = studioRequestFromSubmitted(submitted);
    expect(request.source_image).toBeUndefined();
    expect(request.source_mask).toBeUndefined();
    expect(request.extra_source_images).toBeUndefined();
  });

  it('drops the default source processing the horde fills in without a source image', () => {
    const {
      source_image: _image,
      source_mask: _mask,
      extra_source_images: _extra,
      ...textToImage
    } = submitted;
    expect(
      studioRequestFromSubmitted(textToImage).source_processing,
    ).toBeUndefined();
  });

  it('keeps an empty prompt where the horde stored none', () => {
    const { prompt: _prompt, ...legacy } = submitted;
    expect(studioRequestFromSubmitted(legacy).prompt).toBe('');
  });

  it('adds nothing the horde left out', () => {
    expect(studioRequestFromSubmitted({ prompt: 'a cat' })).toEqual({
      prompt: 'a cat',
    });
  });
});
