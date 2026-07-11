import { Injectable, inject } from '@angular/core';
import {
  HttpClient,
  HttpErrorResponse,
  HttpParams,
} from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { HordeApiError } from '../types/generation';

const CIVITAI_API_BASE = 'https://civitai.com/api/v1';
const DEFAULT_PAGE_SIZE = 20;

/** The two CivitAI resource kinds the horde can consume as generation assets. */
export type CivitaiModelType = 'LORA' | 'TextualInversion';

export interface CivitaiSearchParams {
  /** Free-text query. When set, CivitAI ignores `page` and uses cursor paging. */
  query?: string;
  type?: CivitaiModelType;
  /** Restrict to a CivitAI base-model label (for example `SDXL 1.0`, `Pony`). */
  baseModel?: string;
  /** 1-indexed page, used only when there is no query and no cursor. */
  page?: number;
  /** Opaque cursor from a prior response's `metadata.nextCursor`. */
  cursor?: string;
  /** Include NSFW results. Excluded by default. */
  nsfw?: boolean;
  limit?: number;
}

export interface CivitaiModelVersion {
  id: number;
  name: string;
  baseModel: string;
  triggerWords: string[];
  /** File size of the primary file in KB, or null when unavailable. */
  fileSizeKb: number | null;
}

export interface CivitaiModel {
  id: number;
  name: string;
  creator: string | null;
  type: CivitaiModelType;
  /** URL of the smallest preview image, or null when the model has none. */
  thumbnailUrl: string | null;
  downloadCount: number;
  rating: number | null;
  nsfw: boolean;
  versions: CivitaiModelVersion[];
}

export interface CivitaiSearchMetadata {
  nextCursor: string | null;
  nextPage: string | null;
  currentPage: number | null;
  pageSize: number | null;
  totalItems: number | null;
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
}

interface RawCivitaiFile {
  sizeKB?: number;
}

interface RawCivitaiModelVersion {
  id?: number;
  name?: string;
  baseModel?: string;
  trainedWords?: string[];
  files?: RawCivitaiFile[];
  images?: RawCivitaiImage[];
}

interface RawCivitaiModel {
  id?: number;
  name?: string;
  type?: string;
  nsfw?: boolean;
  creator?: { username?: string };
  stats?: { downloadCount?: number; rating?: number };
  modelVersions?: RawCivitaiModelVersion[];
}

interface RawCivitaiResponse {
  items?: RawCivitaiModel[];
  metadata?: {
    nextCursor?: string;
    nextPage?: string;
    currentPage?: number;
    pageSize?: number;
    totalItems?: number;
  };
}

function smallestImageUrl(
  images: RawCivitaiImage[] | undefined,
): string | null {
  if (!images || images.length === 0) {
    return null;
  }
  let best: RawCivitaiImage | null = null;
  for (const image of images) {
    if (!image.url || (image.type && image.type !== 'image')) {
      continue;
    }
    if (best === null) {
      best = image;
      continue;
    }
    const bestWidth = best.width ?? Number.POSITIVE_INFINITY;
    const width = image.width ?? Number.POSITIVE_INFINITY;
    if (width < bestWidth) {
      best = image;
    }
  }
  return best?.url ?? null;
}

function mapVersion(version: RawCivitaiModelVersion): CivitaiModelVersion {
  const primaryFile = version.files?.[0];
  return {
    id: version.id ?? 0,
    name: version.name ?? '',
    baseModel: version.baseModel ?? '',
    triggerWords: Array.isArray(version.trainedWords)
      ? version.trainedWords.filter(
          (word): word is string => typeof word === 'string',
        )
      : [],
    fileSizeKb:
      typeof primaryFile?.sizeKB === 'number' ? primaryFile.sizeKB : null,
  };
}

function mapModel(
  model: RawCivitaiModel,
  requestedType: CivitaiModelType,
): CivitaiModel {
  const versions = Array.isArray(model.modelVersions)
    ? model.modelVersions.map(mapVersion)
    : [];
  // CivitAI reports LoCon under its own type; surface it as a LORA to callers.
  const type: CivitaiModelType =
    model.type === 'TextualInversion' ? 'TextualInversion' : 'LORA';
  return {
    id: model.id ?? 0,
    name: model.name ?? '',
    creator: model.creator?.username ?? null,
    type: model.type ? type : requestedType,
    thumbnailUrl: smallestImageUrl(model.modelVersions?.[0]?.images),
    downloadCount:
      typeof model.stats?.downloadCount === 'number'
        ? model.stats.downloadCount
        : 0,
    rating: typeof model.stats?.rating === 'number' ? model.stats.rating : null,
    nsfw: model.nsfw === true,
    versions,
  };
}

@Injectable({
  providedIn: 'root',
})
export class CivitaiService {
  private readonly httpClient = inject(HttpClient);

  /**
   * Search the public CivitAI model catalogue for LoRAs or textual inversions.
   * NSFW results are excluded unless `nsfw` is set. Failures resolve to a typed
   * `{ kind: 'error' }` result rather than throwing.
   */
  public searchModels(
    params: CivitaiSearchParams = {},
  ): Observable<CivitaiSearchResult> {
    const type = params.type ?? 'LORA';
    const httpParams = this.buildParams(params, type);

    return this.httpClient
      .get<RawCivitaiResponse>(`${CIVITAI_API_BASE}/models`, {
        params: httpParams,
      })
      .pipe(
        map((response): CivitaiSearchResult => {
          const items = Array.isArray(response.items)
            ? response.items.map((model) => mapModel(model, type))
            : [];
          return {
            kind: 'success',
            items,
            metadata: {
              nextCursor: response.metadata?.nextCursor ?? null,
              nextPage: response.metadata?.nextPage ?? null,
              currentPage: response.metadata?.currentPage ?? null,
              pageSize: response.metadata?.pageSize ?? null,
              totalItems: response.metadata?.totalItems ?? null,
            },
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

  private buildParams(
    params: CivitaiSearchParams,
    type: CivitaiModelType,
  ): HttpParams {
    let httpParams = new HttpParams()
      .set('limit', String(params.limit ?? DEFAULT_PAGE_SIZE))
      .set('sort', 'Highest Rated')
      .set('nsfw', String(params.nsfw === true));

    if (type === 'TextualInversion') {
      httpParams = httpParams.append('types', 'TextualInversion');
    } else {
      // LoCon is a LoRA variant CivitAI files separately; search both.
      httpParams = httpParams.append('types', 'LORA').append('types', 'LoCon');
    }

    const query = params.query?.trim();
    if (query) {
      httpParams = httpParams.set('query', query);
    }
    if (params.baseModel) {
      httpParams = httpParams.append('baseModels', params.baseModel);
    }
    // A cursor takes precedence; page is only meaningful without a query.
    if (params.cursor) {
      httpParams = httpParams.set('cursor', params.cursor);
    } else if (!query && params.page !== undefined) {
      httpParams = httpParams.set('page', String(params.page));
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
