import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  base64ByteLength,
  fileToResizedBase64,
  ImageEncodingError,
  stripDataUrlPrefix,
} from './image-encoding';

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
