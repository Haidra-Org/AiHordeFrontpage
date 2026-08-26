import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, zip } from 'rxjs';
import { ImageSamplerName } from '../types/style';
import { HordeApiCacheService, CacheTTL } from './horde-api-cache.service';

/**
 * Source of the curated preset catalogue.
 *
 * The native `/v2/styles/image` endpoints (served by {@link StyleService})
 * expose community-authored styles, paginated and without curated category
 * grouping. This service instead consumes the Haidra `AI-Horde-Styles` GitHub
 * JSONs, which are the same catalogue artbot uses: `styles.json` (name -> preset)
 * plus `categories.json` (category -> style names). Those two files are the only
 * source that provides both the `{p}`/`{np}` prompt-template convention and the
 * category grouping this slice needs, so preset browsing is built on them rather
 * than on the paginated API.
 */
const STYLES_JSON_URL =
  'https://raw.githubusercontent.com/Haidra-Org/AI-Horde-Styles/main/styles.json';
const CATEGORIES_JSON_URL =
  'https://raw.githubusercontent.com/Haidra-Org/AI-Horde-Styles/main/categories.json';

/** A LoRA entry as declared inside a style preset. */
export interface HordeStylePresetLora {
  name: string;
  model?: number;
  clip?: number;
  inject_trigger?: string;
  is_version?: boolean;
}

/** A textual-inversion entry as declared inside a style preset. */
export interface HordeStylePresetTi {
  name: string;
  strength?: number;
  inject_ti?: 'prompt' | 'negprompt';
}

/**
 * A single style preset from `styles.json`. `prompt` is a template that carries
 * the `{p}` (positive) and `{np}` (negative) placeholders; the remaining fields
 * are generation parameters the style forces onto the request.
 */
export interface HordeStylePreset {
  prompt: string;
  model?: string;
  steps?: number;
  width?: number;
  height?: number;
  cfg_scale?: number;
  karras?: boolean;
  sampler_name?: ImageSamplerName;
  clip_skip?: number;
  hires_fix?: boolean;
  /** Artbot-era hint, not a horde param; carried through but never submitted. */
  enhance?: boolean;
  loras?: HordeStylePresetLora[];
  tis?: HordeStylePresetTi[];
}

/** Raw shape of `styles.json`: a flat map of style name to preset. */
export type HordeStylesCatalog = Record<string, HordeStylePreset>;

/** Raw shape of `categories.json`: a map of category name to style names. */
export type HordeStyleCategories = Record<string, string[]>;

/** A style paired with the categories it belongs to, for listing UIs. */
export interface HordeStyleSummary {
  name: string;
  preset: HordeStylePreset;
  categories: string[];
}

/** A category and the (existing) style names under it. */
export interface HordeStyleCategoryGroup {
  category: string;
  styleNames: string[];
}

/**
 * Invert a `category -> style names` map into `style name -> categories`,
 * keeping only names that exist in the catalogue.
 */
export function indexStyleCategories(
  catalog: HordeStylesCatalog,
  categories: HordeStyleCategories,
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const [category, names] of Object.entries(categories)) {
    if (!Array.isArray(names)) {
      continue;
    }
    for (const name of names) {
      if (!(name in catalog)) {
        continue;
      }
      const existing = index.get(name);
      if (existing) {
        existing.push(category);
      } else {
        index.set(name, [category]);
      }
    }
  }
  return index;
}

@Injectable({
  providedIn: 'root',
})
export class HordeStylesService {
  private readonly cache = inject(HordeApiCacheService);

  /** Fetch the raw style catalogue (`styles.json`). */
  public getCatalog(): Observable<HordeStylesCatalog> {
    return this.cache
      .cachedGet<HordeStylesCatalog>(STYLES_JSON_URL, undefined, {
        ttl: CacheTTL.VERY_LONG,
        category: 'style-presets',
      })
      .pipe(catchError(() => of<HordeStylesCatalog>({})));
  }

  /** Fetch the raw category map (`categories.json`). */
  public getCategories(): Observable<HordeStyleCategories> {
    return this.cache
      .cachedGet<HordeStyleCategories>(CATEGORIES_JSON_URL, undefined, {
        ttl: CacheTTL.VERY_LONG,
        category: 'style-presets',
      })
      .pipe(catchError(() => of<HordeStyleCategories>({})));
  }

  /**
   * List every style with the categories it belongs to. Styles absent from the
   * catalogue are ignored; styles present but uncategorised list an empty
   * `categories` array.
   */
  public getStyles(): Observable<HordeStyleSummary[]> {
    return zip(this.getCatalog(), this.getCategories()).pipe(
      map(([catalog, categories]) => {
        const index = indexStyleCategories(catalog, categories);
        return Object.entries(catalog).map(([name, preset]) => ({
          name,
          preset,
          categories: index.get(name) ?? [],
        }));
      }),
    );
  }

  /**
   * List categories with their existing style names, dropping any style names a
   * category references that are missing from the catalogue (mirrors artbot's
   * category filtering).
   */
  public getCategoryGroups(): Observable<HordeStyleCategoryGroup[]> {
    return zip(this.getCatalog(), this.getCategories()).pipe(
      map(([catalog, categories]) =>
        Object.entries(categories)
          .map(([category, names]) => ({
            category,
            styleNames: (Array.isArray(names) ? names : []).filter(
              (name) => name in catalog,
            ),
          }))
          .filter((group) => group.styleNames.length > 0),
      ),
    );
  }
}
