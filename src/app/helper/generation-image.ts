const BASE64_IMAGE_PLACEHOLDER = '[base64 data omitted]';

const IMAGE_LINK_PATTERN = /^(https?:)?\/\/\S+/i;
const ROOT_RELATIVE_LINK_PATTERN = /^\/(?!\/)\S*/;
const DATA_IMAGE_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;
const BASE64_IMAGE_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;

function isDataImageUrl(value: string): boolean {
  return DATA_IMAGE_URL_PATTERN.test(value.trim());
}

function normalizeBase64Payload(value: string): string {
  const trimmedValue = value.trim();
  const payload = isDataImageUrl(trimmedValue)
    ? trimmedValue.slice(trimmedValue.indexOf(',') + 1)
    : trimmedValue;

  return payload.replace(/\s+/g, '');
}

function isLikelyBase64ImagePayload(value: string): boolean {
  const normalizedValue = normalizeBase64Payload(value);

  if (normalizedValue.length <= 256) {
    return false;
  }

  return BASE64_IMAGE_PATTERN.test(normalizedValue);
}

function inferImageMimeType(base64Payload: string): string {
  if (base64Payload.startsWith('iVBORw0KGgo')) {
    return 'image/png';
  }

  if (base64Payload.startsWith('/9j/')) {
    return 'image/jpeg';
  }

  if (base64Payload.startsWith('R0lGOD')) {
    return 'image/gif';
  }

  if (base64Payload.startsWith('UklGR')) {
    return 'image/webp';
  }

  if (base64Payload.startsWith('PHN2Zy')) {
    return 'image/svg+xml';
  }

  return 'image/png';
}

export function isLikelyImageFileLink(value: string): boolean {
  const trimmedValue = value.trim();

  return (
    IMAGE_LINK_PATTERN.test(trimmedValue) ||
    ROOT_RELATIVE_LINK_PATTERN.test(trimmedValue)
  );
}

export function toRenderableImageSource(value: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return trimmedValue;
  }

  if (isLikelyImageFileLink(trimmedValue) || isDataImageUrl(trimmedValue)) {
    return trimmedValue;
  }

  if (!isLikelyBase64ImagePayload(trimmedValue)) {
    return trimmedValue;
  }

  const normalizedPayload = normalizeBase64Payload(trimmedValue);
  const mimeType = inferImageMimeType(normalizedPayload);
  return `data:${mimeType};base64,${normalizedPayload}`;
}

export function sanitizeGenerationResponseValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  if (isLikelyImageFileLink(value)) {
    return value;
  }

  return isLikelyBase64ImagePayload(value) ? BASE64_IMAGE_PLACEHOLDER : value;
}
