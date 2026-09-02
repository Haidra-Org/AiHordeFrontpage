import { embedWebpExif } from '../helper/webp-exif';

function chars(text: string): number[] {
  return text.split('').map((character) => character.charCodeAt(0));
}

/**
 * The smallest RIFF/WEBP container the EXIF writer will take: one lossy frame
 * declaring a 64x48 canvas. jsdom cannot decode it, which is enough for tests
 * that only care whether a file carries settings.
 */
export function plainWebp(): Uint8Array {
  const frame = [0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x3f, 0x00, 0x2f, 0x00];
  const body = [...chars('VP8 '), frame.length, 0, 0, 0, ...frame];
  const riffSize = 4 + body.length;
  return new Uint8Array([
    ...chars('RIFF'),
    riffSize & 0xff,
    (riffSize >>> 8) & 0xff,
    0,
    0,
    ...chars('WEBP'),
    ...body,
  ]);
}

/**
 * A downloaded result, with or without the `parameters` text the studio writes
 * into one. Null parameters give a picture that says nothing about itself.
 */
export function webpFile(parameters: string | null): File {
  const bytes =
    parameters === null ? plainWebp() : embedWebpExif(plainWebp(), parameters);
  return new File([bytes as BlobPart], 'result.webp', { type: 'image/webp' });
}
