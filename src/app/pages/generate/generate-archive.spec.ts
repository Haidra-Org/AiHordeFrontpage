import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { buildJobImageArchive, imageFileName } from './generate-archive';
import { StoredJobImage } from '../../types/generation-job';

/** The smallest well-formed lossy WebP the EXIF writer will rewrite. */
function webpBytes(): Uint8Array {
  const body = [
    ...'VP8 '.split('').map((c) => c.charCodeAt(0)),
    10,
    0,
    0,
    0,
    0x00,
    0x00,
    0x00,
    0x9d,
    0x01,
    0x2a,
    0x40,
    0x00,
    0x30,
    0x00,
  ];
  const riffSize = 4 + body.length;
  return new Uint8Array([
    ...'RIFF'.split('').map((c) => c.charCodeAt(0)),
    riffSize & 0xff,
    (riffSize >>> 8) & 0xff,
    0,
    0,
    ...'WEBP'.split('').map((c) => c.charCodeAt(0)),
    ...body,
  ]);
}

function storedImage(imageId: string, bytes: Uint8Array): StoredJobImage {
  return {
    localId: 'job-1',
    imageId,
    kind: 'result',
    blob: new Blob([bytes as BlobPart], { type: 'image/webp' }),
    mimeType: 'image/webp',
    metadata: { seed: `seed-${imageId}` },
  };
}

describe('imageFileName', () => {
  it('prefers the seed and keeps the position, falling back to the id', () => {
    const bytes = webpBytes();
    expect(imageFileName(storedImage('a', bytes), 0)).toBe(
      '1-seed-seed-a.webp',
    );
    const seedless = storedImage('a', bytes);
    seedless.metadata = undefined;
    expect(imageFileName(seedless, 2)).toBe('3-a.webp');
  });
});

describe('buildJobImageArchive', () => {
  it('writes a sidecar next to each image and embeds its parameters', async () => {
    const image = storedImage('a', webpBytes());
    const archive = await buildJobImageArchive(
      [image],
      new Map([['a', '{"image_id":"a"}']]),
      new Map([['a', 'a fox\nSteps: 30']]),
    );
    const files = unzipSync(archive);

    expect(Object.keys(files).sort()).toEqual([
      '1-seed-seed-a.json',
      '1-seed-seed-a.webp',
    ]);
    expect(new TextDecoder().decode(files['1-seed-seed-a.json'])).toBe(
      '{"image_id":"a"}',
    );
    const written = files['1-seed-seed-a.webp'];
    expect(written.length).toBeGreaterThan(webpBytes().length);
    expect(String.fromCharCode(...written.subarray(12, 16))).toBe('VP8X');
  });

  it('stores the original bytes when the image cannot take an EXIF chunk', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const image = storedImage('a', png);
    image.mimeType = 'image/png';
    const files = unzipSync(
      await buildJobImageArchive(
        [image],
        undefined,
        new Map([['a', 'a fox\nSteps: 30']]),
      ),
    );
    expect(files['1-seed-seed-a.png']).toStrictEqual(png);
  });

  it('writes the images alone when no metadata is supplied', async () => {
    const files = unzipSync(
      await buildJobImageArchive([storedImage('a', webpBytes())]),
    );
    expect(Object.keys(files)).toEqual(['1-seed-seed-a.webp']);
    expect(files['1-seed-seed-a.webp']).toStrictEqual(webpBytes());
  });
});
