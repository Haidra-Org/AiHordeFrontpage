import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { HordeApiError } from '../types/generation';
import { CacheTTL, HordeApiCacheService } from './horde-api-cache.service';

const CIVITAI_API_BASE = 'https://civitai.com/api/v1';
const DEFAULT_PAGE_SIZE = 24;

/**
 * How many previews are kept per version. A detail panel shows a strip, not a
 * gallery, and every image kept is carried into the metadata cache.
 */
const CIVITAI_MAX_IMAGES = 6;

/**
 * The CivitAI resource types a worker loads through its LoRA path. LoCon and
 * DoRA are filed separately upstream but consumed the same way, so searching
 * only `LORA` hides a large part of what a model can actually load.
 */
const CIVITAI_LORA_TYPES = ['LORA', 'LoCon', 'DoRA'] as const;

/** The two CivitAI resource kinds the horde can consume as generation assets. */
export type CivitaiModelType = 'LORA' | 'TextualInversion';

/** CivitAI's published sort vocabulary. */
export type CivitaiSort =
  | 'Highest Rated'
  | 'Most Downloaded'
  | 'Most Liked'
  | 'Most Discussed'
  | 'Most Collected'
  | 'Most Images'
  | 'Newest'
  | 'Oldest';

/** The window a sort is computed over. */
export type CivitaiPeriod = 'Day' | 'Week' | 'Month' | 'Year' | 'AllTime';

export interface CivitaiSearchParams {
  /** Free-text query. */
  query?: string;
  type?: CivitaiModelType;
  /** CivitAI base-model labels to restrict to; each is sent as its own param. */
  baseModels?: readonly string[];
  sort?: CivitaiSort;
  period?: CivitaiPeriod;
  /** Ask for mature results. Omitted entirely unless true. */
  nsfw?: boolean;
  tag?: string;
  username?: string;
  /** Opaque cursor from a prior response's `metadata.nextCursor`. */
  cursor?: string;
  limit?: number;
}

export interface CivitaiImage {
  url: string;
  /** CivitAI's own maturity rating; 1 is the tamest. */
  nsfwLevel: number;
  width: number | null;
  height: number | null;
}

export interface CivitaiModelVersion {
  id: number;
  /** Present on a detail fetch; absent inside a search item. */
  modelId: number | null;
  /** The model's name, carried on a detail fetch so a version can name itself. */
  modelName: string | null;
  name: string;
  baseModel: string;
  baseModelType: string | null;
  /** ISO 8601; the ordering key for "newest". */
  publishedAt: string | null;
  /** CivitAI's own position in the model's version list; 0 is newest. */
  index: number | null;
  trainedWords: string[];
  /** The primary file's size, name and hash; null where it publishes none. */
  fileSizeKb: number | null;
  fileName: string | null;
  sha256: string | null;
  nsfwLevel: number;
  /** `Public`, `EarlyAccess`, `Private`; anything but public blocks a worker. */
  availability: string | null;
  paidAccess: boolean;
  images: CivitaiImage[];
}

export interface CivitaiModel {
  id: number;
  name: string;
  type: CivitaiModelType;
  /** The raw upstream type, so a LoCon or DoRA can say so on its card. */
  rawType: string;
  creator: string | null;
  nsfw: boolean;
  nsfwLevel: number;
  /** Depicts a real person. */
  poi: boolean;
  /** CivitAI's own "depicts a minor" flag; such a model is never shown. */
  minor: boolean;
  downloadCount: number;
  thumbsUp: number;
  thumbsDown: number;
  tags: string[];
  /** The model-level roll-up of every version's base model. */
  baseModels: string[];
  availability: string | null;
  preview: CivitaiImage | null;
  versions: CivitaiModelVersion[];
}

export interface CivitaiSearchMetadata {
  nextCursor: string | null;
}

export type CivitaiSearchResult =
  | {
      kind: 'success';
      items: CivitaiModel[];
      metadata: CivitaiSearchMetadata;
    }
  | { kind: 'error'; error: HordeApiError };

// --- Raw response shapes (only the fields consumed here) -------------------

interface RawCivitaiImage {
  url?: string;
  type?: string;
  width?: number;
  height?: number;
  nsfwLevel?: number;
}

interface RawCivitaiFile {
  sizeKB?: number;
  name?: string;
  type?: string;
  primary?: boolean;
  hashes?: { SHA256?: string };
}

interface RawCivitaiModelVersion {
  id?: number;
  modelId?: number;
  model?: { name?: string };
  name?: string;
  index?: number;
  baseModel?: string;
  baseModelType?: string;
  publishedAt?: string;
  nsfwLevel?: number;
  availability?: string;
  paidAccess?: unknown;
  trainedWords?: string[];
  files?: RawCivitaiFile[];
  images?: RawCivitaiImage[];
}

interface RawCivitaiModel {
  id?: number;
  name?: string;
  type?: string;
  nsfw?: boolean;
  nsfwLevel?: number;
  poi?: boolean;
  minor?: boolean;
  availability?: string;
  tags?: string[];
  baseModels?: string[];
  creator?: { username?: string };
  stats?: {
    downloadCount?: number;
    thumbsUpCount?: number;
    thumbsDownCount?: number;
  };
  modelVersions?: RawCivitaiModelVersion[];
}

interface RawCivitaiResponse {
  items?: RawCivitaiModel[];
  metadata?: { nextCursor?: string };
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function mapImage(image: RawCivitaiImage): CivitaiImage | null {
  // A version's media list carries video too, which no preview slot can show.
  if (!image.url || (image.type && image.type !== 'image')) {
    return null;
  }
  return {
    url: image.url,
    // An unrated image is treated as the tamest rather than hidden, matching
    // how CivitAI renders one.
    nsfwLevel: typeof image.nsfwLevel === 'number' ? image.nsfwLevel : 1,
    width: typeof image.width === 'number' ? image.width : null,
    height: typeof image.height === 'number' ? image.height : null,
  };
}

function mapImages(images: RawCivitaiImage[] | undefined): CivitaiImage[] {
  if (!Array.isArray(images)) {
    return [];
  }
  return images
    .map(mapImage)
    .filter((image): image is CivitaiImage => image !== null)
    .slice(0, CIVITAI_MAX_IMAGES);
}

/**
 * The file a version is actually distributed as. The first entry may be a VAE
 * or a config, so its size would describe something nobody is downloading.
 */
function primaryFile(
  files: RawCivitaiFile[] | undefined,
): RawCivitaiFile | null {
  if (!Array.isArray(files) || files.length === 0) {
    return null;
  }
  return (
    files.find((file) => file.primary === true) ??
    files.find((file) => file.type === 'Model') ??
    files[0]
  );
}

function mapVersion(version: RawCivitaiModelVersion): CivitaiModelVersion {
  const file = primaryFile(version.files);
  return {
    id: version.id ?? 0,
    modelId: typeof version.modelId === 'number' ? version.modelId : null,
    modelName: version.model?.name?.trim() || null,
    name: version.name ?? '',
    baseModel: version.baseModel ?? '',
    baseModelType: version.baseModelType ?? null,
    publishedAt: version.publishedAt ?? null,
    index: typeof version.index === 'number' ? version.index : null,
    trainedWords: readStrings(version.trainedWords),
    fileSizeKb: typeof file?.sizeKB === 'number' ? file.sizeKB : null,
    fileName: file?.name ?? null,
    sha256: file?.hashes?.SHA256 ?? null,
    nsfwLevel: typeof version.nsfwLevel === 'number' ? version.nsfwLevel : 1,
    availability: version.availability ?? null,
    paidAccess: version.paidAccess != null && version.paidAccess !== false,
    images: mapImages(version.images),
  };
}

/** The smallest preview, which is the one a card-sized slot should fetch. */
function smallestImage(images: CivitaiImage[]): CivitaiImage | null {
  let best: CivitaiImage | null = null;
  for (const image of images) {
    const bestWidth = best?.width ?? Number.POSITIVE_INFINITY;
    const width = image.width ?? Number.POSITIVE_INFINITY;
    if (best === null || width < bestWidth) {
      best = image;
    }
  }
  return best;
}

function mapModel(
  model: RawCivitaiModel,
  requestedType: CivitaiModelType,
): CivitaiModel {
  const versions = Array.isArray(model.modelVersions)
    ? model.modelVersions.map(mapVersion)
    : [];
  const rawType = model.type ?? '';
  // LoCon and DoRA are LoRA variants CivitAI files separately; callers care
  // only which of the two horde asset paths a model travels.
  const type: CivitaiModelType =
    rawType === 'TextualInversion' ? 'TextualInversion' : 'LORA';
  return {
    id: model.id ?? 0,
    name: model.name ?? '',
    type: rawType ? type : requestedType,
    rawType: rawType || requestedType,
    creator: model.creator?.username ?? null,
    nsfw: model.nsfw === true,
    nsfwLevel: typeof model.nsfwLevel === 'number' ? model.nsfwLevel : 1,
    poi: model.poi === true,
    minor: model.minor === true,
    downloadCount:
      typeof model.stats?.downloadCount === 'number'
        ? model.stats.downloadCount
        : 0,
    thumbsUp:
      typeof model.stats?.thumbsUpCount === 'number'
        ? model.stats.thumbsUpCount
        : 0,
    thumbsDown:
      typeof model.stats?.thumbsDownCount === 'number'
        ? model.stats.thumbsDownCount
        : 0,
    tags: readStrings(model.tags),
    baseModels: readStrings(model.baseModels),
    availability: model.availability ?? null,
    preview: smallestImage(versions[0]?.images ?? []),
    versions,
  };
}

@Injectable({
  providedIn: 'root',
})
export class CivitaiService {
  private readonly cache = inject(HordeApiCacheService);

  /**
   * Search the public CivitAI model catalogue for LoRAs or textual inversions.
   * Mature results are excluded unless `nsfw` is set. Failures resolve to a
   * typed `{ kind: 'error' }` result rather than throwing.
   */
  public searchModels(
    params: CivitaiSearchParams = {},
  ): Observable<CivitaiSearchResult> {
    const type = params.type ?? 'LORA';

    return this.cache
      .cachedGet<RawCivitaiResponse>(
        `${CIVITAI_API_BASE}/models`,
        { params: this.buildParams(params, type) },
        { ttl: CacheTTL.LONG, category: 'civitai-search' },
      )
      .pipe(
        map((response): CivitaiSearchResult => {
          const items = Array.isArray(response.items)
            ? response.items.map((model) => mapModel(model, type))
            : [];
          return {
            kind: 'success',
            items,
            metadata: { nextCursor: response.metadata?.nextCursor ?? null },
          };
        }),
        catchError((err: unknown) =>
          of<CivitaiSearchResult>({
            kind: 'error',
            error: this.toError(err),
          }),
        ),
      );
  }

  /** One model page with its versions, or null when it cannot be read. */
  public fetchModel(id: string | number): Observable<CivitaiModel | null> {
    return this.cache
      .cachedGet<RawCivitaiModel>(
        `${CIVITAI_API_BASE}/models/${encodeURIComponent(String(id))}`,
        undefined,
        { ttl: CacheTTL.VERY_LONG, category: 'civitai-detail' },
      )
      .pipe(
        map((response) => mapModel(response, 'LORA')),
        catchError(() => of(null)),
      );
  }

  /** One version, or null when it cannot be read. */
  public fetchVersion(
    id: string | number,
  ): Observable<CivitaiModelVersion | null> {
    return this.cache
      .cachedGet<RawCivitaiModelVersion>(
        `${CIVITAI_API_BASE}/model-versions/${encodeURIComponent(String(id))}`,
        undefined,
        { ttl: CacheTTL.VERY_LONG, category: 'civitai-detail' },
      )
      .pipe(
        map((response) => mapVersion(response)),
        catchError(() => of(null)),
      );
  }

  /**
   * Resolve a bare CivitAI identifier to a display name. A stored request only
   * carries the identifier it was given, so a past generation has nothing
   * readable to show until the catalogue is asked. `isVersion` selects the
   * version endpoint, matching the horde's own `is_version` flag.
   *
   * A version names itself only as "v2.0", which means something alongside its
   * model, so the two are joined when both are known.
   */
  public resolveName(
    id: string,
    isVersion: boolean,
  ): Observable<string | null> {
    if (isVersion) {
      return this.fetchVersion(id).pipe(
        map((version) => {
          if (!version) {
            return null;
          }
          const own = version.name.trim();
          const model = version.modelName?.trim();
          if (model && own) {
            return `${model} · ${own}`;
          }
          return model || own || null;
        }),
      );
    }
    return this.fetchModel(id).pipe(map((model) => model?.name.trim() || null));
  }

  private buildParams(
    params: CivitaiSearchParams,
    type: CivitaiModelType,
  ): HttpParams {
    let httpParams = new HttpParams()
      .set('limit', String(params.limit ?? DEFAULT_PAGE_SIZE))
      // Downloads are the signal a reader actually judges a LoRA by; the older
      // default read from a rating CivitAI no longer publishes.
      .set('sort', params.sort ?? 'Most Downloaded')
      .set('period', params.period ?? 'AllTime')
      // Only the primary file is ever read, and asking for it alone keeps the
      // response small enough to cache comfortably.
      .set('primaryFileOnly', 'true');

    if (type === 'TextualInversion') {
      httpParams = httpParams.append('types', 'TextualInversion');
    } else {
      for (const loraType of CIVITAI_LORA_TYPES) {
        httpParams = httpParams.append('types', loraType);
      }
    }

    // Asking for `nsfw=false` is a stronger statement than not asking, and it
    // interacts badly with the SFW-only mode CivitAI forces in some regions.
    if (params.nsfw === true) {
      httpParams = httpParams.set('nsfw', 'true');
    }

    const query = params.query?.trim();
    if (query) {
      httpParams = httpParams.set('query', query);
    }
    for (const baseModel of params.baseModels ?? []) {
      httpParams = httpParams.append('baseModels', baseModel);
    }
    const tag = params.tag?.trim();
    if (tag) {
      httpParams = httpParams.set('tag', tag);
    }
    const username = params.username?.trim();
    if (username) {
      httpParams = httpParams.set('username', username);
    }
    if (params.cursor) {
      httpParams = httpParams.set('cursor', params.cursor);
    }
    return httpParams;
  }

  private toError(err: unknown): HordeApiError {
    if (err instanceof HttpErrorResponse) {
      return { status: err.status, message: err.message };
    }
    return { status: 0, message: 'CivitAI request failed' };
  }
}
