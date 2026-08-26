import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { ParamMap, Params, Router } from '@angular/router';
import type { ImageGenerationRequest } from '../../types/generation';
import {
  parseStyleRecordKey,
  styleRecordKey,
} from '../../services/style-record';

/**
 * The shape of the packed parameter. Only version 1 is understood; a link
 * written by a later studio is refused rather than half-read, because a partly
 * understood request would open the studio on settings nobody chose.
 */
const STUDIO_LINK_VERSION = 1;

/**
 * Longest packed parameter worth carrying, in characters of the address. Past
 * this the link stops being something that survives being pasted about, so one
 * is neither written nor read.
 */
export const STUDIO_LINK_MAX_PARAM_CHARS = 4096;

/** Where a studio link points. */
export const STUDIO_LINK_PATH = '/generate/image';

/** Longest JSON a packed parameter may expand to, in bytes. */
const MAX_UNPACKED_BYTES = 32768;

/**
 * What a studio link carries once it is read.
 *
 * `simple` is the readable form: a model name, a style, or both, and nothing
 * else. `full` came from the packed parameter and describes a whole request, so
 * the page offers it for review rather than writing it straight in.
 */
export interface StudioLinkPayload {
  request: ImageGenerationRequest;
  /** The style's source-qualified key, or null when the link names none. */
  styleKey: string | null;
  kind: 'simple' | 'full';
}

/** The query parameters that carry a whole request. */
export interface StudioLinkParams {
  r: string;
}

/** Base64 with the two URL-unsafe characters swapped and the padding dropped. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Inverse of {@link toBase64Url}. Returns null for anything that is not it. */
function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) {
    return null;
  }
  const padded = text
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=');
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Pack a request, and the name of the style it was built with, into the query
 * parameters that reopen the studio on it. Browser-only: the packing runs on
 * the platform's own base64.
 */
export function studioLinkParams(
  request: ImageGenerationRequest,
  styleKey: string | null,
): StudioLinkParams {
  const body: Record<string, unknown> = {
    v: STUDIO_LINK_VERSION,
    request,
  };
  const named = styleQueryParams(styleKey);
  if (named !== null) {
    Object.assign(body, named);
  }
  return { r: toBase64Url(deflateSync(strToU8(JSON.stringify(body)))) };
}

/**
 * The query parameters that name a style, or null when there is none to name.
 * A preset is named by the name it is published under and a published style by
 * its id, so the two never share one parameter and can never be confused.
 */
function styleQueryParams(styleKey: string | null): Params | null {
  if (styleKey === null || styleKey === '') {
    return null;
  }
  const parsed = parseStyleRecordKey(styleKey);
  if (parsed === null) {
    return null;
  }
  return parsed.source === 'native'
    ? { styleId: parsed.value }
    : { style: parsed.value };
}

/**
 * The address that reopens the studio on a request, or null when the request is
 * too long to carry in one. A style is named openly beside the packed request
 * rather than inside it, so the reader can see which one they are being handed.
 */
export function studioLinkAddress(
  router: Router,
  request: ImageGenerationRequest,
  styleKey: string | null,
): string | null {
  const packed = studioLinkParams(request, null);
  if (packed.r.length > STUDIO_LINK_MAX_PARAM_CHARS) {
    return null;
  }
  const queryParams: Params = { r: packed.r, ...styleQueryParams(styleKey) };
  const tree = router.createUrlTree([STUDIO_LINK_PATH], { queryParams });
  return new URL(
    router.serializeUrl(tree),
    globalThis.location.href,
  ).toString();
}

/**
 * The same request with the seed let go, so it describes the settings rather
 * than the one picture they made.
 */
export function requestWithoutSeed(
  request: ImageGenerationRequest,
): ImageGenerationRequest {
  if (request.params?.seed === undefined) {
    return request;
  }
  const params = { ...request.params };
  delete params.seed;
  return { ...request, params };
}

/** Whether a decoded value can stand as a request for the form's decoder. */
function isRequestLike(value: unknown): value is ImageGenerationRequest {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Make a decoded request safe for {@link requestToFormValue}, which reads the
 * prompt as a string before it defends anything else.
 */
function sanitizeRequest(raw: ImageGenerationRequest): ImageGenerationRequest {
  const request: ImageGenerationRequest = { ...raw };
  if (typeof request.prompt !== 'string') {
    request.prompt = '';
  }
  const params: unknown = request.params;
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    delete request.params;
  }
  return request;
}

/** Read the packed parameter, or null when it is absent, stale or malformed. */
function unpackRequest(
  packed: string,
): { request: ImageGenerationRequest; styleKey: string | null } | null {
  if (packed.length === 0 || packed.length > STUDIO_LINK_MAX_PARAM_CHARS) {
    return null;
  }
  const bytes = fromBase64Url(packed);
  if (bytes === null) {
    return null;
  }
  let inflated: Uint8Array;
  try {
    inflated = inflateSync(bytes);
  } catch {
    return null;
  }
  if (inflated.length > MAX_UNPACKED_BYTES) {
    return null;
  }
  const json = strFromU8(inflated);
  let body: unknown;
  try {
    body = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (record['v'] !== STUDIO_LINK_VERSION) {
    return null;
  }
  const request = record['request'];
  if (!isRequestLike(request)) {
    return null;
  }
  const style = record['style'];
  const styleId = record['styleId'];
  return {
    request: sanitizeRequest(request),
    styleKey:
      typeof styleId === 'string' && styleId !== ''
        ? styleRecordKey('native', styleId)
        : typeof style === 'string' && style !== ''
          ? styleRecordKey('curated', style)
          : null,
  };
}

/**
 * Read a studio link off a lookup of its query parameters.
 *
 * The readable keys sit on top of the packed one: a link that carries both is
 * a packed request with a model or a style named openly beside it, and the
 * open name is the one the reader can see, so it wins.
 */
function readLink(
  get: (key: string) => string | null,
): StudioLinkPayload | null {
  const packed = get('r');
  const unpacked = packed === null ? null : unpackRequest(packed);
  const model = get('model')?.trim() ?? '';
  const style = get('style')?.trim() ?? '';
  const styleId = get('styleId')?.trim() ?? '';
  // An id and a name in the same address name two different styles, and the id
  // is the more exact of the two, so it is the one that is answered.
  const named =
    styleId !== ''
      ? styleRecordKey('native', styleId)
      : style !== ''
        ? styleRecordKey('curated', style)
        : null;

  if (unpacked !== null) {
    const request = { ...unpacked.request };
    if (model !== '') {
      request.models = [model];
    }
    return {
      request,
      styleKey: named ?? unpacked.styleKey,
      kind: 'full',
    };
  }

  if (model === '' && named === null) {
    return null;
  }
  const request: ImageGenerationRequest = { prompt: '' };
  if (model !== '') {
    request.models = [model];
  }
  return {
    request,
    styleKey: named,
    kind: 'simple',
  };
}

/** Read a studio link off the route's query parameters. */
export function parseStudioLink(map: ParamMap): StudioLinkPayload | null {
  return readLink((key) => map.get(key));
}

/**
 * Read a studio link off text somebody pasted: either a request body written
 * as JSON, or a studio address copied out of the address bar.
 */
export function studioLinkFromText(text: string): StudioLinkPayload | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  if (trimmed.startsWith('{')) {
    let body: unknown;
    try {
      body = JSON.parse(trimmed);
    } catch {
      return null;
    }
    if (!isRequestLike(body)) {
      return null;
    }
    return {
      request: sanitizeRequest(body),
      styleKey: null,
      kind: 'full',
    };
  }
  const query = trimmed.indexOf('?');
  if (query === -1) {
    return null;
  }
  const params = new URLSearchParams(trimmed.slice(query + 1));
  return readLink((key) => params.get(key));
}
