/** Hex byte lookup (`00`..`ff`) so id assembly avoids per-byte padding. */
const BYTE_TO_HEX: readonly string[] = Array.from({ length: 256 }, (_, i) =>
  (i + 0x100).toString(16).slice(1),
);

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
  // Pin the version (4) and variant (RFC 4122) bits per the spec.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = BYTE_TO_HEX;
  return (
    hex[bytes[0]] +
    hex[bytes[1]] +
    hex[bytes[2]] +
    hex[bytes[3]] +
    '-' +
    hex[bytes[4]] +
    hex[bytes[5]] +
    '-' +
    hex[bytes[6]] +
    hex[bytes[7]] +
    '-' +
    hex[bytes[8]] +
    hex[bytes[9]] +
    '-' +
    hex[bytes[10]] +
    hex[bytes[11]] +
    hex[bytes[12]] +
    hex[bytes[13]] +
    hex[bytes[14]] +
    hex[bytes[15]]
  );
}
