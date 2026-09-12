import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  base64ByteLength,
  DEFAULT_MAX_EDGE,
  fileToResizedBase64,
  ImageEncodingError,
  sourceToThumbnailDataUrl,
  stripDataUrlPrefix,
} from './image-encoding';
import { SOURCE_MAX_EDGE } from './source-image';

describe('DEFAULT_MAX_EDGE', () => {
  it('is the horde dimension cap the image studio already works to', () => {
    expect(DEFAULT_MAX_EDGE).toBe(SOURCE_MAX_EDGE);
    expect(DEFAULT_MAX_EDGE).toBe(3072);
  });
});

describe('stripDataUrlPrefix', () => {
  it('removes a data-url prefix', () => {
    expect(stripDataUrlPrefix('data:image/webp;base64,AAAA')).toBe('AAAA');
  });

  it('returns the input unchanged when there is no prefix', () => {
    expect(stripDataUrlPrefix('AAAA')).toBe('AAAA');
  });
});

describe('base64ByteLength', () => {
  it('approximates the decoded byte length', () => {
    // 4 base64 chars -> 3 bytes
    expect(base64ByteLength('AAAA')).toBe(3);
  });

  it('accounts for padding', () => {
    expect(base64ByteLength('AAA=')).toBe(2);
  });
});

describe('fileToResizedBase64', () => {
  const makeFile = (type: string): File =>
    new File([new Uint8Array([1, 2, 3])], 'pic', { type });

  let toDataURL: ReturnType<typeof vi.fn>;
  let drawImage: ReturnType<typeof vi.fn>;
  let canvas: { width: number; height: number; getContext: unknown };
  let close: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    toDataURL = vi.fn(() => 'data:image/webp;base64,ENCODED');
    drawImage = vi.fn();
    canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
    };
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') {
        return canvas as unknown as HTMLElement;
      }
      return document.createElement(tag);
    }) as typeof document.createElement);

    close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 2048, height: 1024, close })),
    );
    // Attach toDataURL after canvas object exists
    (canvas as unknown as { toDataURL: unknown }).toDataURL = toDataURL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects non-image files without touching the bitmap decoder', async () => {
    await expect(fileToResizedBase64(makeFile('text/plain'))).rejects.toThrow(
      ImageEncodingError,
    );
  });

  it('downscales to the max edge, preserving aspect ratio', async () => {
    const result = await fileToResizedBase64(makeFile('image/png'), {
      maxEdge: 1024,
    });

    // 2048x1024 -> longest edge 1024 means scale 0.5
    expect(result.width).toBe(1024);
    expect(result.height).toBe(512);
    expect(canvas.width).toBe(1024);
    expect(canvas.height).toBe(512);
    expect(result.base64).toBe('ENCODED');
    expect(result.mimeType).toBe('image/webp');
    expect(close).toHaveBeenCalledOnce();
  });

  it('scales to the default max edge when the caller names none', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 6144, height: 3072, close })),
    );

    const result = await fileToResizedBase64(makeFile('image/png'));

    expect(result.width).toBe(DEFAULT_MAX_EDGE);
    expect(result.height).toBe(DEFAULT_MAX_EDGE / 2);
  });

  it('never upscales smaller images', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 300, height: 200, close })),
    );

    const result = await fileToResizedBase64(makeFile('image/jpeg'), {
      maxEdge: 1024,
    });

    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
  });

  it('throws ImageEncodingError when decoding fails', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new Error('bad image'))),
    );

    await expect(fileToResizedBase64(makeFile('image/png'))).rejects.toThrow(
      ImageEncodingError,
    );
  });
});

describe('sourceToThumbnailDataUrl', () => {
  it('returns null for an empty source', async () => {
    expect(await sourceToThumbnailDataUrl('')).toBeNull();
  });

  it('passes a remote image URL through unchanged', async () => {
    const url = 'https://example.com/pic.png';
    expect(await sourceToThumbnailDataUrl(url)).toBe(url);
  });

  it('passes a root-relative image URL through unchanged', async () => {
    expect(await sourceToThumbnailDataUrl('/assets/pic.webp')).toBe(
      '/assets/pic.webp',
    );
  });

  it('returns null when a base64 source cannot be decoded', async () => {
    // Deterministically fail the decode: a real jsdom image never fires
    // load/error for a data URL, so stub one that errors on src assignment.
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', FailingImage);

    const bareBase64 = 'UklGRhoAAABXRUJQ';
    await expect(sourceToThumbnailDataUrl(bareBase64)).resolves.toBeNull();

    vi.unstubAllGlobals();
  });
});
