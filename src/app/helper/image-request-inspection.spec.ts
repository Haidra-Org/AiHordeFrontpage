import { describe, expect, it } from 'vitest';
import { imageRequestWithPlaceholders } from './image-request-inspection';

describe('imageRequestWithPlaceholders', () => {
  it('omits image bytes and URLs without changing parameters or the original request', () => {
    const request = {
      prompt: 'a cat',
      params: { seed: '12', steps: 30 },
      source_image: 'aGVsbG8=',
      source_mask: 'https://example.com/mask.png?signature=private',
      extra_source_images: [{ image: 'extra', strength: 0.5 }],
    };
    expect(imageRequestWithPlaceholders(request, '[image]')).toEqual({
      ...request,
      source_image: '[image]',
      source_mask: '[image]',
      extra_source_images: [{ image: '[image]', strength: 0.5 }],
    });
    expect(request.source_image).toBe('aGVsbG8=');
    expect(request.extra_source_images[0].image).toBe('extra');
  });

  it('preserves absent image fields and server-specific parameters', () => {
    const request = {
      prompt: 'a cat',
      params: { special: { worker: 'value' } },
    };
    expect(imageRequestWithPlaceholders(request, '[image]')).toEqual(request);
    expect(imageRequestWithPlaceholders(request, '[image]')).not.toHaveProperty(
      'source_image',
    );
  });
});
