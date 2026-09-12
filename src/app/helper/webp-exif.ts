/**
 * Writes and reads an EXIF chunk carrying A1111-style `parameters` text in WebP
 * bytes, so a downloaded result still says how it was made when it is opened
 * anywhere else, and so the studio can take those settings back off a picture.
 * The horde returns WebP and the browser can neither write nor read EXIF, so the
 * RIFF container is handled directly.
 *
 * Anything that is not a WebP, or any malformed container, is returned
 * untouched: a download must never fail over metadata.
 */

/** EXIF-present bit in the VP8X feature-flags byte. */
const VP8X_EXIF_FLAG = 0x08;
/** Alpha-present bit in the VP8X feature-flags byte. */
const VP8X_ALPHA_FLAG = 0x10;
/** Byte count of a chunk header: four-character code plus a 32-bit size. */
const CHUNK_HEADER_SIZE = 8;
/** Fixed payload size of a VP8X chunk: flags, reserved, and two 24-bit edges. */
const VP8X_PAYLOAD_SIZE = 10;

/** One RIFF chunk, located within the source bytes. */
interface WebpChunk {
  fourCC: string;
  /** Payload bounds, excluding the header and any odd-size pad byte. */
  payloadStart: number;
  payloadSize: number;
}

/** The canvas size and alpha use a synthesised VP8X chunk has to declare. */
interface CanvasInfo {
  width: number;
  height: number;
  hasAlpha: boolean;
}

function readByte(bytes: Uint8Array, offset: number): number {
  const value = bytes[offset];
  if (value === undefined) {
    throw new Error('byte read leaves the buffer');
  }
  return value;
}

function readFourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    readByte(bytes, offset),
    readByte(bytes, offset + 1),
    readByte(bytes, offset + 2),
    readByte(bytes, offset + 3),
  );
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (readByte(bytes, offset) |
      (readByte(bytes, offset + 1) << 8) |
      (readByte(bytes, offset + 2) << 16) |
      (readByte(bytes, offset + 3) << 24)) >>>
    0
  );
}

function writeUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function writeAscii(bytes: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    bytes[offset + i] = text.charCodeAt(i) & 0xff;
  }
}

/**
 * Walk the chunk list of a RIFF/WEBP file. Chunk payloads are padded to an even
 * length, and the pad byte is not counted in the chunk's own size field, so it
 * is skipped rather than folded into the payload.
 */
function readChunks(bytes: Uint8Array): WebpChunk[] {
  const riffSize = readUint32LE(bytes, 4);
  const end = Math.min(CHUNK_HEADER_SIZE + riffSize, bytes.length);
  const chunks: WebpChunk[] = [];
  let offset = 12;
  while (offset + CHUNK_HEADER_SIZE <= end) {
    const fourCC = readFourCC(bytes, offset);
    const payloadSize = readUint32LE(bytes, offset + 4);
    const payloadStart = offset + CHUNK_HEADER_SIZE;
    if (payloadStart + payloadSize > end) {
      throw new Error('webp chunk overruns the container');
    }
    chunks.push({ fourCC, payloadStart, payloadSize });
    offset = payloadStart + payloadSize + (payloadSize % 2);
  }
  return chunks;
}

/**
 * Canvas size for a file that has no VP8X chunk, read from its bitstream. A
 * lossy frame carries its size after the three-byte start code; a lossless one
 * packs two 14-bit edges (stored one less than their real value) and the
 * alpha-in-use flag into the four bytes after its signature.
 */
function readCanvasInfo(bytes: Uint8Array, chunks: WebpChunk[]): CanvasInfo {
  const hasAlphaChunk = chunks.some((chunk) => chunk.fourCC === 'ALPH');
  for (const chunk of chunks) {
    const at = chunk.payloadStart;
    if (chunk.fourCC === 'VP8 ' && chunk.payloadSize >= 10) {
      if (
        bytes[at + 3] !== 0x9d ||
        bytes[at + 4] !== 0x01 ||
        bytes[at + 5] !== 0x2a
      ) {
        break;
      }
      return {
        width:
          (readByte(bytes, at + 6) | (readByte(bytes, at + 7) << 8)) & 0x3fff,
        height:
          (readByte(bytes, at + 8) | (readByte(bytes, at + 9) << 8)) & 0x3fff,
        hasAlpha: hasAlphaChunk,
      };
    }
    if (chunk.fourCC === 'VP8L' && chunk.payloadSize >= 5) {
      if (bytes[at] !== 0x2f) {
        break;
      }
      const packed = readUint32LE(bytes, at + 1);
      return {
        width: (packed & 0x3fff) + 1,
        height: ((packed >>> 14) & 0x3fff) + 1,
        hasAlpha: hasAlphaChunk || ((packed >>> 28) & 1) === 1,
      };
    }
  }
  throw new Error('webp carries no readable bitstream');
}

/**
 * UTF-16 big-endian bytes for a string. EXIF stores a `UNICODE` UserComment as
 * UTF-16, and the readers this text is written for (A1111, Civitai, and the
 * piexif-based tooling behind them) expect big-endian regardless of the TIFF
 * byte order, so the two deliberately disagree here.
 */
function encodeUtf16BE(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out[i * 2] = (code >>> 8) & 0xff;
    out[i * 2 + 1] = code & 0xff;
  }
  return out;
}

/** IFD entry byte count: tag, type, value count, then value or its offset. */
const IFD_ENTRY_SIZE = 12;
/** TIFF header: byte-order mark, magic, and the offset of the first IFD. */
const TIFF_HEADER_SIZE = 8;
/** Bytes an IFD spends outside its entries: the entry count and the next-IFD link. */
const IFD_FRAME_SIZE = 6;

function writeIfdEntry(
  out: Uint8Array,
  offset: number,
  tag: number,
  type: number,
  count: number,
  value: number,
): void {
  out[offset] = tag & 0xff;
  out[offset + 1] = (tag >>> 8) & 0xff;
  out[offset + 2] = type & 0xff;
  out[offset + 3] = (type >>> 8) & 0xff;
  writeUint32LE(out, offset + 4, count);
  writeUint32LE(out, offset + 8, value);
}

/**
 * A minimal little-endian TIFF block holding `text` as the EXIF UserComment.
 * IFD0 exists only to carry the Exif sub-IFD pointer, because UserComment is an
 * Exif-IFD tag and readers that follow the spec will not find it anywhere else.
 * The WebP EXIF chunk holds the bare TIFF block, with no `Exif\0\0` prefix.
 */
export function buildExifPayload(text: string): Uint8Array {
  const comment = encodeUtf16BE(text);
  const commentBytes = new Uint8Array(8 + comment.length);
  writeAscii(commentBytes, 0, 'UNICODE');
  commentBytes.set(comment, 8);

  const ifd0Offset = TIFF_HEADER_SIZE;
  const ifd0Size = IFD_FRAME_SIZE + IFD_ENTRY_SIZE;
  const exifIfdOffset = ifd0Offset + ifd0Size;
  const exifIfdSize = IFD_FRAME_SIZE + IFD_ENTRY_SIZE * 2;
  const commentOffset = exifIfdOffset + exifIfdSize;

  const out = new Uint8Array(commentOffset + commentBytes.length);
  writeAscii(out, 0, 'II');
  out[2] = 0x2a;
  out[3] = 0x00;
  writeUint32LE(out, 4, ifd0Offset);

  out[ifd0Offset] = 1;
  writeIfdEntry(out, ifd0Offset + 2, 0x8769, 4, 1, exifIfdOffset);
  writeUint32LE(out, ifd0Offset + 2 + IFD_ENTRY_SIZE, 0);

  // Entries within an IFD must be ordered by ascending tag.
  out[exifIfdOffset] = 2;
  const versionEntry = exifIfdOffset + 2;
  writeIfdEntry(out, versionEntry, 0x9000, 7, 4, 0);
  writeAscii(out, versionEntry + 8, '0230');
  writeIfdEntry(
    out,
    versionEntry + IFD_ENTRY_SIZE,
    0x9286,
    7,
    commentBytes.length,
    commentOffset,
  );
  writeUint32LE(out, versionEntry + IFD_ENTRY_SIZE * 2, 0);
  out.set(commentBytes, commentOffset);
  return out;
}

/** Serialise a chunk into `out`, padding an odd payload. Returns the new offset. */
function writeChunk(
  out: Uint8Array,
  offset: number,
  fourCC: string,
  payload: Uint8Array,
): number {
  writeAscii(out, offset, fourCC);
  writeUint32LE(out, offset + 4, payload.length);
  out.set(payload, offset + CHUNK_HEADER_SIZE);
  let next = offset + CHUNK_HEADER_SIZE + payload.length;
  if (payload.length % 2 === 1) {
    out[next] = 0;
    next += 1;
  }
  return next;
}

/** A chunk ready to be written out, with its payload detached from the source. */
interface OutputChunk {
  fourCC: string;
  payload: Uint8Array;
}

function paddedSize(payloadLength: number): number {
  return CHUNK_HEADER_SIZE + payloadLength + (payloadLength % 2);
}

/**
 * Assemble the chunk list of the rewritten file. An extended file must lead
 * with VP8X and place EXIF after the image data (and before XMP, which is the
 * only chunk the spec puts after it), so a simple file grows a VP8X header and
 * an existing one only gains the EXIF flag.
 */
function assembleChunks(
  bytes: Uint8Array,
  chunks: WebpChunk[],
  exif: Uint8Array,
): OutputChunk[] {
  const detach = (chunk: WebpChunk): Uint8Array =>
    bytes.subarray(chunk.payloadStart, chunk.payloadStart + chunk.payloadSize);

  let header: OutputChunk;
  let rest: WebpChunk[];
  if (chunks[0]?.fourCC === 'VP8X' && chunks[0].payloadSize >= 1) {
    const payload = new Uint8Array(detach(chunks[0]));
    payload[0] = readByte(payload, 0) | VP8X_EXIF_FLAG;
    header = { fourCC: 'VP8X', payload };
    rest = chunks.slice(1);
  } else {
    const canvas = readCanvasInfo(bytes, chunks);
    const payload = new Uint8Array(VP8X_PAYLOAD_SIZE);
    payload[0] = VP8X_EXIF_FLAG | (canvas.hasAlpha ? VP8X_ALPHA_FLAG : 0);
    // Canvas edges are stored as 24-bit little-endian values, one less than the
    // real size.
    const width = canvas.width - 1;
    const height = canvas.height - 1;
    payload[4] = width & 0xff;
    payload[5] = (width >>> 8) & 0xff;
    payload[6] = (width >>> 16) & 0xff;
    payload[7] = height & 0xff;
    payload[8] = (height >>> 8) & 0xff;
    payload[9] = (height >>> 16) & 0xff;
    header = { fourCC: 'VP8X', payload };
    rest = chunks;
  }

  const body = rest
    .filter((chunk) => chunk.fourCC !== 'EXIF')
    .map((chunk) => ({ fourCC: chunk.fourCC, payload: detach(chunk) }));
  const xmpIndex = body.findIndex((chunk) => chunk.fourCC === 'XMP ');
  const exifChunk: OutputChunk = { fourCC: 'EXIF', payload: exif };
  if (xmpIndex === -1) {
    body.push(exifChunk);
  } else {
    body.splice(xmpIndex, 0, exifChunk);
  }
  return [header, ...body];
}

/**
 * Return `source` with `parameters` written as its EXIF UserComment. Bytes that
 * are not a RIFF/WEBP container, and any container that cannot be rewritten,
 * are returned exactly as they came in.
 */
export function embedWebpExif(
  source: Uint8Array,
  parameters: string,
): Uint8Array {
  if (!parameters) {
    return source;
  }
  try {
    if (
      source.length < 12 ||
      readFourCC(source, 0) !== 'RIFF' ||
      readFourCC(source, 8) !== 'WEBP'
    ) {
      return source;
    }
    const chunks = readChunks(source);
    if (chunks.length === 0) {
      return source;
    }
    const output = assembleChunks(source, chunks, buildExifPayload(parameters));
    const bodySize = output.reduce(
      (total, chunk) => total + paddedSize(chunk.payload.length),
      0,
    );
    // The RIFF size field counts the 'WEBP' form type plus every chunk.
    const out = new Uint8Array(CHUNK_HEADER_SIZE + 4 + bodySize);
    writeAscii(out, 0, 'RIFF');
    writeUint32LE(out, 4, 4 + bodySize);
    writeAscii(out, 8, 'WEBP');
    let offset = 12;
    for (const chunk of output) {
      offset = writeChunk(out, offset, chunk.fourCC, chunk.payload);
    }
    return out;
  } catch {
    return source;
  }
}

/**
 * Blob-level wrapper over {@link embedWebpExif}. Falls back to the original blob
 * whenever the bytes cannot be read or rewritten.
 */
export async function embedWebpExifInBlob(
  blob: Blob,
  parameters: string,
): Promise<Blob> {
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const embedded = embedWebpExif(bytes, parameters);
    if (embedded === bytes) {
      return blob;
    }
    return new Blob([embedded as BlobPart], {
      type: blob.type || 'image/webp',
    });
  } catch {
    return blob;
  }
}

/** The Exif sub-IFD pointer in IFD0. UserComment lives behind it, not in IFD0. */
const TAG_EXIF_IFD = 0x8769;
/** The UserComment tag, which carries the `parameters` text. */
const TAG_USER_COMMENT = 0x9286;
/** Byte count of the charset marker EXIF puts in front of a UserComment. */
const COMMENT_CHARSET_SIZE = 8;

/** Byte width of each TIFF value type, by its type number. */
const TIFF_TYPE_SIZES: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
};

/** A TIFF block being read: its bounds within the file and its byte order. */
interface TiffBlock {
  bytes: Uint8Array;
  /** Where the block starts. Every offset inside it counts from here. */
  base: number;
  /** One past the block's last byte. */
  end: number;
  littleEndian: boolean;
}

/** One located IFD entry, with its value already resolved to a file position. */
interface TiffEntry {
  count: number;
  /** Absolute position of the value, inline or pointed at. */
  valueAt: number;
}

/** Reject a read that leaves the block, so a truncated file cannot be misread. */
function requireRange(block: TiffBlock, at: number, length: number): void {
  if (at < block.base || at + length > block.end) {
    throw new Error('tiff read leaves the block');
  }
}

function readTiffUint16(block: TiffBlock, offset: number): number {
  const at = block.base + offset;
  requireRange(block, at, 2);
  const { bytes } = block;
  return block.littleEndian
    ? readByte(bytes, at) | (readByte(bytes, at + 1) << 8)
    : (readByte(bytes, at) << 8) | readByte(bytes, at + 1);
}

function readTiffUint32(block: TiffBlock, offset: number): number {
  const at = block.base + offset;
  requireRange(block, at, 4);
  const { bytes } = block;
  return (
    (block.littleEndian
      ? readByte(bytes, at) |
        (readByte(bytes, at + 1) << 8) |
        (readByte(bytes, at + 2) << 16) |
        (readByte(bytes, at + 3) << 24)
      : (readByte(bytes, at) << 24) |
        (readByte(bytes, at + 1) << 16) |
        (readByte(bytes, at + 2) << 8) |
        readByte(bytes, at + 3)) >>> 0
  );
}

/**
 * Locate `tag` in the IFD at `ifdOffset`. A value of four bytes or fewer sits
 * in the entry itself and a longer one is pointed at, so the position handed
 * back is already the one the value is read from.
 */
function findTiffEntry(
  block: TiffBlock,
  ifdOffset: number,
  tag: number,
): TiffEntry | null {
  const entries = readTiffUint16(block, ifdOffset);
  for (let index = 0; index < entries; index++) {
    const entry = ifdOffset + 2 + index * IFD_ENTRY_SIZE;
    if (readTiffUint16(block, entry) !== tag) {
      continue;
    }
    const type = readTiffUint16(block, entry + 2);
    const count = readTiffUint32(block, entry + 4);
    const width = TIFF_TYPE_SIZES[type] ?? 1;
    const size = width * count;
    const valueAt =
      size <= 4
        ? block.base + entry + 8
        : block.base + readTiffUint32(block, entry + 8);
    requireRange(block, valueAt, size);
    return { count, valueAt };
  }
  return null;
}

/** The 32-bit number an entry holds, which for a pointer tag is another IFD. */
function entryLongValue(block: TiffBlock, entry: TiffEntry): number {
  return readTiffUint32(block, entry.valueAt - block.base);
}

/** The ASCII characters at a position, used to read a charset marker. */
function readAscii(bytes: Uint8Array, at: number, length: number): string {
  let text = '';
  for (let index = 0; index < length; index++) {
    text += String.fromCharCode(readByte(bytes, at + index));
  }
  return text;
}

/** UTF-16 big-endian text, the inverse of {@link encodeUtf16BE}. */
function decodeUtf16BE(bytes: Uint8Array): string {
  let text = '';
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    text += String.fromCharCode(
      (readByte(bytes, index) << 8) | readByte(bytes, index + 1),
    );
  }
  return text;
}

/** Text one byte per character, for a comment written as ASCII. */
function decodeAscii(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return text;
}

/**
 * The comment text behind a UserComment entry. EXIF puts an eight-byte charset
 * marker in front of the text; an unset marker is the spec's "undefined", which
 * every writer that leaves it unset means as plain bytes.
 */
function readUserComment(block: TiffBlock, entry: TiffEntry): string | null {
  if (entry.count <= COMMENT_CHARSET_SIZE) {
    return null;
  }
  const charset = readAscii(block.bytes, entry.valueAt, COMMENT_CHARSET_SIZE);
  const body = block.bytes.subarray(
    entry.valueAt + COMMENT_CHARSET_SIZE,
    entry.valueAt + entry.count,
  );
  let text: string;
  if (charset.startsWith('UNICODE')) {
    text = decodeUtf16BE(body);
  } else if (charset.startsWith('ASCII') || charset.charCodeAt(0) === 0) {
    text = decodeAscii(body);
  } else {
    return null;
  }
  return text.replace(/^\ufeff/, '').replace(/\0+$/, '');
}

/**
 * Read the UserComment out of a TIFF block. The byte order is whichever the
 * block declares, because a file re-saved elsewhere comes back in the tool's
 * own order rather than the one this app writes.
 */
function readTiffUserComment(
  bytes: Uint8Array,
  start: number,
  size: number,
): string | null {
  let base = start;
  // A block lifted out of a JPEG keeps the APP1 marker in front of it.
  if (size >= 6 && readAscii(bytes, base, 6) === 'Exif\0\0') {
    base += 6;
  }
  const end = start + size;
  if (end - base < TIFF_HEADER_SIZE) {
    return null;
  }
  const order = readAscii(bytes, base, 2);
  if (order !== 'II' && order !== 'MM') {
    return null;
  }
  const block: TiffBlock = { bytes, base, end, littleEndian: order === 'II' };
  if (readTiffUint16(block, 2) !== 0x2a) {
    return null;
  }
  const exifIfd = findTiffEntry(block, readTiffUint32(block, 4), TAG_EXIF_IFD);
  if (exifIfd === null) {
    return null;
  }
  const comment = findTiffEntry(
    block,
    entryLongValue(block, exifIfd),
    TAG_USER_COMMENT,
  );
  return comment === null ? null : readUserComment(block, comment);
}

/**
 * The `parameters` text {@link embedWebpExif} wrote, read back out of WebP
 * bytes, or null when the file carries none. Anything unreadable, from a file
 * that is not a WebP to a truncated EXIF block, answers null rather than
 * throwing: the callers are offering the reader a convenience, and a picture
 * that has nothing to say about itself is the ordinary case.
 */
export function readWebpExifComment(bytes: Uint8Array): string | null {
  try {
    if (
      bytes.length < 12 ||
      readFourCC(bytes, 0) !== 'RIFF' ||
      readFourCC(bytes, 8) !== 'WEBP'
    ) {
      return null;
    }
    const exif = readChunks(bytes).find((chunk) => chunk.fourCC === 'EXIF');
    if (exif === undefined) {
      return null;
    }
    const text = readTiffUserComment(
      bytes,
      exif.payloadStart,
      exif.payloadSize,
    );
    return text === null || text === '' ? null : text;
  } catch {
    return null;
  }
}
