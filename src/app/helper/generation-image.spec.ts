import {
  isLikelyImageFileLink,
  sanitizeGenerationResponseValue,
  toRenderableImageSource,
} from './generation-image';

describe('generation-image helper', () => {
  it('detects image-style links', () => {
    expect(isLikelyImageFileLink('https://example.com/image.webp')).toBe(true);
    expect(isLikelyImageFileLink('//cdn.example.com/image.png')).toBe(true);
    expect(isLikelyImageFileLink('/images/generated/abc123.webp')).toBe(true);
  });

  it('does not treat data URLs or plain text as file links', () => {
    expect(
      isLikelyImageFileLink('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA'),
    ).toBe(false);
    expect(isLikelyImageFileLink('not-a-link')).toBe(false);
  });

  it('converts long raw base64 image payloads to data URLs', () => {
    const rawPngBase64 = `iVBORw0KGgo${'A'.repeat(300)}`;

    expect(toRenderableImageSource(rawPngBase64)).toBe(
      `data:image/png;base64,${rawPngBase64}`,
    );
  });

  it('keeps existing URLs and data URLs unchanged', () => {
    const url = 'https://example.com/generated.webp';
    const dataUrl = `data:image/jpeg;base64,/9j/${'A'.repeat(300)}`;

    expect(toRenderableImageSource(url)).toBe(url);
    expect(toRenderableImageSource(dataUrl)).toBe(dataUrl);
  });

  it('replaces long base64 payloads with a placeholder for response JSON', () => {
    const rawPngBase64 = `iVBORw0KGgo${'A'.repeat(300)}`;

    expect(sanitizeGenerationResponseValue(rawPngBase64)).toBe(
      '[base64 data omitted]',
    );
  });

  it('preserves image links in response JSON sanitizer', () => {
    const longUrl = `https://example.com/image.webp?sig=${'A'.repeat(300)}`;

    expect(sanitizeGenerationResponseValue(longUrl)).toBe(longUrl);
  });

  it('returns non-string values unchanged in response JSON sanitizer', () => {
    expect(sanitizeGenerationResponseValue(42)).toBe(42);
    expect(sanitizeGenerationResponseValue(false)).toBe(false);
    expect(sanitizeGenerationResponseValue(null)).toBe(null);
    expect(sanitizeGenerationResponseValue({ ok: true })).toEqual({ ok: true });
  });
});
