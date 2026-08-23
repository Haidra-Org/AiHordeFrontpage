/**
 * Writes an EXIF chunk carrying A1111-style `parameters` text into WebP bytes,
 * so a downloaded result still says how it was made when it is opened anywhere
 * else. The horde returns WebP and the browser cannot write EXIF, so the RIFF
 * container is edited directly.
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

function readFourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
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
        width: (bytes[at + 6] | (bytes[at + 7] << 8)) & 0x3fff,
        height: (bytes[at + 8] | (bytes[at + 9] << 8)) & 0x3fff,
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
    payload[0] |= VP8X_EXIF_FLAG;
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
