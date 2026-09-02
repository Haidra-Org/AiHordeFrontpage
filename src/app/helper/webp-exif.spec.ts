import { describe, expect, it } from 'vitest';
import {
  buildExifPayload,
  embedWebpExif,
  embedWebpExifInBlob,
  readWebpExifComment,
} from './webp-exif';

/** Assemble a RIFF/WEBP container out of raw chunks, padding odd payloads. */
function makeWebp(chunks: { fourCC: string; payload: number[] }[]): Uint8Array {
  const body: number[] = [];
  for (const chunk of chunks) {
    for (const char of chunk.fourCC) {
      body.push(char.charCodeAt(0));
    }
    const size = chunk.payload.length;
    body.push(size & 0xff, (size >>> 8) & 0xff, (size >>> 16) & 0xff, 0);
    body.push(...chunk.payload);
    if (size % 2 === 1) {
      body.push(0);
    }
  }
  const riffSize = 4 + body.length;
  return new Uint8Array([
    ...'RIFF'.split('').map((c) => c.charCodeAt(0)),
    riffSize & 0xff,
    (riffSize >>> 8) & 0xff,
    (riffSize >>> 16) & 0xff,
    0,
    ...'WEBP'.split('').map((c) => c.charCodeAt(0)),
    ...body,
  ]);
}

/** A minimal lossy frame declaring a 64x48 canvas. */
function vp8Payload(width = 64, height = 48, extra = 0): number[] {
  return [
    0x00,
    0x00,
    0x00,
    0x9d,
    0x01,
    0x2a,
    width & 0xff,
    (width >>> 8) & 0x3f,
    height & 0xff,
    (height >>> 8) & 0x3f,
    ...new Array<number>(extra).fill(0x11),
  ];
}

/** A minimal lossless frame declaring a 5x3 canvas, optionally with alpha. */
function vp8lPayload(hasAlpha: boolean): number[] {
  const packed = (5 - 1) | ((3 - 1) << 14) | (hasAlpha ? 1 << 28 : 0);
  return [
    0x2f,
    packed & 0xff,
    (packed >>> 8) & 0xff,
    (packed >>> 16) & 0xff,
    (packed >>> 24) & 0xff,
  ];
}

interface ParsedChunk {
  fourCC: string;
  payload: Uint8Array;
}

function parseChunks(bytes: Uint8Array): ParsedChunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = 8 + view.getUint32(4, true);
  const chunks: ParsedChunk[] = [];
  let offset = 12;
  while (offset + 8 <= end) {
    const fourCC = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    chunks.push({
      fourCC,
      payload: bytes.subarray(offset + 8, offset + 8 + size),
    });
    offset += 8 + size + (size % 2);
  }
  return chunks;
}

/**
 * Read the UserComment back out of a TIFF block: follow the Exif sub-IFD
 * pointer in IFD0, find tag 0x9286, and decode its UTF-16BE text.
 */
function readUserComment(tiff: Uint8Array): string {
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  expect(String.fromCharCode(tiff[0], tiff[1])).toBe('II');
  expect(view.getUint16(2, true)).toBe(0x2a);

  const findTag = (ifdOffset: number, tag: number): DataView | null => {
    const count = view.getUint16(ifdOffset, true);
    for (let i = 0; i < count; i++) {
      const entry = ifdOffset + 2 + i * 12;
      if (view.getUint16(entry, true) === tag) {
        return new DataView(tiff.buffer, tiff.byteOffset + entry, 12);
      }
    }
    return null;
  };

  const pointer = findTag(view.getUint32(4, true), 0x8769);
  expect(pointer).not.toBeNull();
  const exifIfd = pointer!.getUint32(8, true);
  const comment = findTag(exifIfd, 0x9286);
  expect(comment).not.toBeNull();
  const length = comment!.getUint32(4, true);
  const start = comment!.getUint32(8, true);
  const bytes = tiff.subarray(start, start + length);
  expect(String.fromCharCode(...bytes.subarray(0, 7))).toBe('UNICODE');
  expect(bytes[7]).toBe(0);
  let text = '';
  for (let i = 8; i < bytes.length; i += 2) {
    text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  }
  return text;
}

function exifOf(bytes: Uint8Array): Uint8Array {
  const chunk = parseChunks(bytes).find((entry) => entry.fourCC === 'EXIF');
  expect(chunk).toBeDefined();
  return chunk!.payload;
}

const PARAMS =
  'a cat\nNegative prompt: blurry\nSteps: 30, Sampler: Euler a, CFG scale: 7.5, Seed: 12345, Size: 64x48, Model: Deliberate';

describe('buildExifPayload', () => {
  it('round-trips the text through a TIFF block', () => {
    expect(readUserComment(buildExifPayload(PARAMS))).toBe(PARAMS);
  });

  it('carries non-ASCII text', () => {
    const text = 'котик 🐈 café';
    expect(readUserComment(buildExifPayload(text))).toBe(text);
  });
});

describe('embedWebpExif', () => {
  it('adds a VP8X header and an EXIF chunk to a simple lossy file', () => {
    const source = makeWebp([{ fourCC: 'VP8 ', payload: vp8Payload() }]);
    const out = embedWebpExif(source, PARAMS);
    const chunks = parseChunks(out);

    expect(chunks.map((chunk) => chunk.fourCC)).toEqual([
      'VP8X',
      'VP8 ',
      'EXIF',
    ]);
    expect(chunks[0].payload[0] & 0x08).toBe(0x08);
    // Canvas edges are stored one less than the real size.
    expect(chunks[0].payload[4] | (chunks[0].payload[5] << 8)).toBe(63);
    expect(chunks[0].payload[7] | (chunks[0].payload[8] << 8)).toBe(47);
    expect(readUserComment(exifOf(out))).toBe(PARAMS);
  });

  it('keeps the declared RIFF size in step with the rewritten body', () => {
    const source = makeWebp([{ fourCC: 'VP8 ', payload: vp8Payload() }]);
    const out = embedWebpExif(source, PARAMS);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getUint32(4, true)).toBe(out.length - 8);
  });

  it('sets the EXIF flag on an existing VP8X without disturbing its other bits', () => {
    const vp8x = [0x10, 0, 0, 0, 0x3f, 0, 0, 0x2f, 0, 0];
    const source = makeWebp([
      { fourCC: 'VP8X', payload: vp8x },
      { fourCC: 'ALPH', payload: [0x01, 0x02, 0x03] },
      { fourCC: 'VP8 ', payload: vp8Payload() },
    ]);
    const chunks = parseChunks(embedWebpExif(source, PARAMS));

    expect(chunks.map((chunk) => chunk.fourCC)).toEqual([
      'VP8X',
      'ALPH',
      'VP8 ',
      'EXIF',
    ]);
    expect(chunks[0].payload[0]).toBe(0x18);
    expect([...chunks[0].payload.subarray(4)]).toEqual([
      0x3f, 0, 0, 0x2f, 0, 0,
    ]);
  });

  it('carries the lossless alpha flag onto a synthesised VP8X', () => {
    const source = makeWebp([{ fourCC: 'VP8L', payload: vp8lPayload(true) }]);
    const chunks = parseChunks(embedWebpExif(source, PARAMS));
    expect(chunks[0].fourCC).toBe('VP8X');
    expect(chunks[0].payload[0]).toBe(0x18);
    expect(chunks[0].payload[4]).toBe(4);
    expect(chunks[0].payload[7]).toBe(2);
  });

  it('leaves the alpha flag clear when the lossless frame has none', () => {
    const source = makeWebp([{ fourCC: 'VP8L', payload: vp8lPayload(false) }]);
    const chunks = parseChunks(embedWebpExif(source, PARAMS));
    expect(chunks[0].payload[0]).toBe(0x08);
  });

  it('replaces an existing EXIF chunk rather than adding a second', () => {
    const source = makeWebp([
      { fourCC: 'VP8 ', payload: vp8Payload() },
      { fourCC: 'EXIF', payload: [0x00, 0x01] },
    ]);
    const out = embedWebpExif(source, PARAMS);
    const exifChunks = parseChunks(out).filter(
      (chunk) => chunk.fourCC === 'EXIF',
    );
    expect(exifChunks).toHaveLength(1);
    expect(readUserComment(exifChunks[0].payload)).toBe(PARAMS);
  });

  it('keeps EXIF ahead of XMP, as the chunk order requires', () => {
    const source = makeWebp([
      { fourCC: 'VP8 ', payload: vp8Payload() },
      { fourCC: 'XMP ', payload: [0x3c, 0x78] },
    ]);
    expect(
      parseChunks(embedWebpExif(source, PARAMS)).map((chunk) => chunk.fourCC),
    ).toEqual(['VP8X', 'VP8 ', 'EXIF', 'XMP ']);
  });

  it('pads an odd-sized chunk so the next header stays aligned', () => {
    const source = makeWebp([
      { fourCC: 'VP8 ', payload: vp8Payload(64, 48, 1) },
    ]);
    const out = embedWebpExif(source, PARAMS);
    const chunks = parseChunks(out);
    expect(chunks[1].payload.length % 2).toBe(1);
    expect(chunks[2].fourCC).toBe('EXIF');
    expect(readUserComment(chunks[2].payload)).toBe(PARAMS);
  });

  it('passes non-RIFF bytes through untouched', () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(embedWebpExif(png, PARAMS)).toBe(png);
  });

  it('passes a truncated container through untouched', () => {
    expect(embedWebpExif(new Uint8Array([0x52, 0x49]), PARAMS)).toStrictEqual(
      new Uint8Array([0x52, 0x49]),
    );
  });

  it('passes a container with an overrunning chunk through untouched', () => {
    const source = makeWebp([{ fourCC: 'VP8 ', payload: vp8Payload() }]);
    // Claim a payload far larger than the file holds.
    source[16] = 0xff;
    source[17] = 0xff;
    expect(embedWebpExif(source, PARAMS)).toBe(source);
  });

  it('passes a container with no readable bitstream through untouched', () => {
    const source = makeWebp([{ fourCC: 'ICCP', payload: [1, 2, 3, 4] }]);
    expect(embedWebpExif(source, PARAMS)).toBe(source);
  });

  it('passes through when there is no text to write', () => {
    const source = makeWebp([{ fourCC: 'VP8 ', payload: vp8Payload() }]);
    expect(embedWebpExif(source, '')).toBe(source);
  });
});

describe('embedWebpExifInBlob', () => {
  it('returns a blob whose bytes carry the comment', async () => {
    const source = makeWebp([{ fourCC: 'VP8 ', payload: vp8Payload() }]);
    const blob = new Blob([source as BlobPart], { type: 'image/webp' });
    const out = await embedWebpExifInBlob(blob, PARAMS);

    expect(out).not.toBe(blob);
    expect(out.type).toBe('image/webp');
    const bytes = new Uint8Array(await out.arrayBuffer());
    expect(readUserComment(exifOf(bytes))).toBe(PARAMS);
  });

  it('returns the original blob when the bytes are not a webp', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], {
      type: 'image/png',
    });
    expect(await embedWebpExifInBlob(blob, PARAMS)).toBe(blob);
  });

  it('returns the original blob when the bytes cannot be read', async () => {
    const blob = {
      type: 'image/webp',
      arrayBuffer: () => Promise.reject(new Error('unreadable')),
    } as unknown as Blob;
    expect(await embedWebpExifInBlob(blob, PARAMS)).toBe(blob);
  });
});

/**
 * A TIFF block in the byte order and charset this app does not write: big-endian
 * with an ASCII comment, which is what a file re-saved by another tool comes
 * back as. Optionally prefixed the way a block lifted out of a JPEG is.
 */
function bigEndianExif(text: string, jpegPrefix = false): number[] {
  const comment = [
    ...'ASCII   '.split('').map((c) => c.charCodeAt(0)),
    ...text.split('').map((c) => c.charCodeAt(0)),
  ];
  const long = (value: number): number[] => [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
  const short = (value: number): number[] => [
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
  const exifIfdAt = 8 + 18;
  const commentAt = exifIfdAt + 18;
  const block = [
    ...'MM'.split('').map((c) => c.charCodeAt(0)),
    ...short(0x2a),
    ...long(8),
    ...short(1),
    ...short(0x8769),
    ...short(4),
    ...long(1),
    ...long(exifIfdAt),
    ...long(0),
    ...short(1),
    ...short(0x9286),
    ...short(7),
    ...long(comment.length),
    ...long(commentAt),
    ...long(0),
    ...comment,
  ];
  const prefix = jpegPrefix
    ? [...'Exif'.split('').map((c) => c.charCodeAt(0)), 0, 0]
    : [];
  return [...prefix, ...block];
}

describe('readWebpExifComment', () => {
  it('reads back what embedWebpExif wrote', () => {
    const source = makeWebp([{ fourCC: 'VP8 ', payload: vp8Payload() }]);
    expect(readWebpExifComment(embedWebpExif(source, PARAMS))).toBe(PARAMS);
  });

  it('reads back non-ASCII text', () => {
    const text = 'котик 🐈 café';
    const source = makeWebp([{ fourCC: 'VP8L', payload: vp8lPayload(false) }]);
    expect(readWebpExifComment(embedWebpExif(source, text))).toBe(text);
  });

  it('reads a big-endian block written as ASCII', () => {
    const source = makeWebp([
      { fourCC: 'VP8X', payload: [0x08, 0, 0, 0, 0x3f, 0, 0, 0x2f, 0, 0] },
      { fourCC: 'VP8 ', payload: vp8Payload() },
      { fourCC: 'EXIF', payload: bigEndianExif(PARAMS) },
    ]);
    expect(readWebpExifComment(source)).toBe(PARAMS);
  });

  it('reads a block that kept its JPEG marker', () => {
    const source = makeWebp([
      { fourCC: 'VP8 ', payload: vp8Payload() },
      { fourCC: 'EXIF', payload: bigEndianExif(PARAMS, true) },
    ]);
    expect(readWebpExifComment(source)).toBe(PARAMS);
  });

  it('answers null for a webp that carries no EXIF chunk', () => {
    const source = makeWebp([{ fourCC: 'VP8 ', payload: vp8Payload() }]);
    expect(readWebpExifComment(source)).toBeNull();
  });

  it('answers null for bytes that are not a webp at all', () => {
    expect(readWebpExifComment(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(readWebpExifComment(new Uint8Array(0))).toBeNull();
  });

  it('answers null for an EXIF chunk full of nonsense', () => {
    const source = makeWebp([
      { fourCC: 'VP8 ', payload: vp8Payload() },
      { fourCC: 'EXIF', payload: [9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9] },
    ]);
    expect(readWebpExifComment(source)).toBeNull();
  });

  it('answers null when the block promises more than it holds', () => {
    const truncated = bigEndianExif(PARAMS).slice(0, 40);
    const source = makeWebp([
      { fourCC: 'VP8 ', payload: vp8Payload() },
      { fourCC: 'EXIF', payload: truncated },
    ]);
    expect(readWebpExifComment(source)).toBeNull();
  });
});
