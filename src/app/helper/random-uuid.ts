/** Hex byte lookup (`00`..`ff`) so id assembly avoids per-byte padding. */
const BYTE_TO_HEX: readonly string[] = Array.from({ length: 256 }, (_, i) =>
  (i + 0x100).toString(16).slice(1),
);

function hexByte(byte: number): string {
  const hex = BYTE_TO_HEX[byte];
  if (hex === undefined) {
    throw new RangeError('UUID byte is outside the hexadecimal lookup');
  }
  return hex;
}

/**
 * Return an RFC 4122 version 4 UUID.
 *
 * `crypto.randomUUID` is only exposed in secure contexts, so it is absent when
 * the dev server is reached over a plain-HTTP LAN IP. Fall back to a
 * `crypto.getRandomValues` construction there instead of throwing, which would
 * otherwise collapse an enqueue into a generic failure toast.
 */
export function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Pin the version (4) and variant (RFC 4122) bits per the spec.
  view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x40);
  view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80);
  return [
    bytes.subarray(0, 4),
    bytes.subarray(4, 6),
    bytes.subarray(6, 8),
    bytes.subarray(8, 10),
    bytes.subarray(10, 16),
  ]
    .map((part) => Array.from(part, hexByte).join(''))
    .join('-');
}
