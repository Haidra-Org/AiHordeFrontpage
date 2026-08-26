import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { DatabaseService } from './database.service';
import type { StyleRecord } from './style-record';

/**
 * Community preview renders for the curated style catalogue, from amiantos'
 * `AI-Horde-Styles-Previews` repo. Every style is rendered three times, once per
 * subject ("person", "place", "thing"), so a browser UI can show the same
 * subject across every card and keep the comparison honest.
 */
const PREVIEWS_URL =
  'https://raw.githubusercontent.com/amiantos/AI-Horde-Styles-Previews/main/previews.json';
/**
 * Companion digest file. Its exact shape is not part of any contract, so it is
 * only used as an opaque change signal: any difference in its content means the
 * previews are worth re-fetching.
 */
const HASHES_URL =
  'https://raw.githubusercontent.com/amiantos/AI-Horde-Styles-Previews/main/hashes.json';

const CACHE_KEY = 'aihorde.generate.style_previews';

/** The three preview subjects every style is rendered for. */
export const STYLE_PREVIEW_VARIANTS = ['person', 'place', 'thing'] as const;

export type StylePreviewVariant = (typeof STYLE_PREVIEW_VARIANTS)[number];

/** One style's preview URLs; a subject the repo has no render for is null. */
export type StylePreview = Record<StylePreviewVariant, string | null>;

/** `previews.json`, normalised: style name -> its per-subject preview URLs. */
export type StylePreviewMap = Record<string, StylePreview>;

/** What is persisted between visits: the previews plus the digest they came with. */
interface CachedPreviews {
  signature: string;
  previews: StylePreviewMap;
}

/**
 * A 32-bit FNV-1a digest of the serialised digest file. The repo's own hashes
 * are per-style and their layout may change, so collapsing the whole file into
 * one short signature keeps the cache key stable without depending on its shape.
 */
export function previewsSignature(raw: unknown): string {
  const text = JSON.stringify(raw ?? null);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

/** Normalise one raw `previews.json` entry, dropping non-URL members. */
function coercePreview(raw: unknown): StylePreview | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const preview: StylePreview = { person: null, place: null, thing: null };
  let found = false;
  for (const variant of STYLE_PREVIEW_VARIANTS) {
    const value = source[variant];
    if (typeof value === 'string' && value.trim() !== '') {
      preview[variant] = value;
      found = true;
    }
  }
  return found ? preview : null;
}

/** Normalise a raw `previews.json` payload, dropping malformed entries. */
export function coercePreviewMap(raw: unknown): StylePreviewMap {
  if (typeof raw !== 'object' || raw === null) {
    return {};
  }
  const map: StylePreviewMap = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const preview = coercePreview(value);
    if (preview) {
      map[name] = preview;
    }
  }
  return map;
}

/**
 * Serves style preview images to the style browser, stale-while-revalidate.
 *
 * Nothing is requested until {@link load} is called (the browser modal calls it
 * on first open), so the ~600-entry payload never costs a page load that does
 * not need it. A cached copy is published immediately and the digest file is
 * then checked in the background; the previews themselves are re-fetched only
 * when that digest moved. Every failure path is silent: callers fall back to
 * name-only cards, which is why the previews signal stays null rather than
 * throwing.
 */
@Injectable({ providedIn: 'root' })
export class StylePreviewsService {
  private readonly http = inject(HttpClient);
  private readonly db = inject(DatabaseService);

  /** The known previews, or null while nothing has been loaded yet. */
  public readonly previews = signal<StylePreviewMap | null>(null);
  /** Whether a network round trip is in flight. */
  public readonly loading = signal(false);
  /** Whether the last attempt failed and no cache was available either. */
  public readonly failed = signal(false);

  private started = false;
  private signature: string | null = null;

  /**
   * Publish any cached previews and revalidate in the background. Safe to call
   * on every modal open; only the first call does any work.
   */
  public load(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const cached = this.readCache();
    if (cached) {
      this.signature = cached.signature;
      this.previews.set(cached.previews);
    }
    this.revalidate();
  }

  /**
   * The preview URL for `name` at `variant`, falling back to whichever other
   * subject the repo does have, or null when the style has no preview at all.
   */
  public previewUrl(name: string, variant: StylePreviewVariant): string | null {
    const preview = this.previews()?.[name];
    if (!preview) {
      return null;
    }
    if (preview[variant]) {
      return preview[variant];
    }
    for (const fallback of STYLE_PREVIEW_VARIANTS) {
      if (preview[fallback]) {
        return preview[fallback];
      }
    }
    return null;
  }

  /**
   * Every preview the repo has for `name`, in subject order and without any
   * fallback substitution, for the browser's "all subjects" card layout.
   */
  public previewUrls(name: string): string[] {
    const preview = this.previews()?.[name];
    if (!preview) {
      return [];
    }
    return STYLE_PREVIEW_VARIANTS.map((variant) => preview[variant]).filter(
      (url): url is string => url !== null,
    );
  }

  /**
   * The picture to show for a style, whichever catalogue it came from. A preset
   * is rendered by the previews repository, once per subject; a published style
   * carries its own examples, and the one its author marked primary is the one
   * it is shown by. Null when the style has no picture at all.
   */
  public recordPreviewUrl(
    record: StyleRecord,
    variant: StylePreviewVariant = 'person',
  ): string | null {
    if (record.source === 'curated') {
      return this.previewUrl(record.name, variant);
    }
    return this.recordPreviewUrls(record)[0] ?? null;
  }

  /** Every picture a style has, in the order it should be shown in. */
  public recordPreviewUrls(record: StyleRecord): string[] {
    if (record.source === 'curated') {
      return this.previewUrls(record.name);
    }
    const examples = record.examples ?? [];
    return [
      ...examples.filter((example) => example.primary),
      ...examples.filter((example) => !example.primary),
    ].map((example) => example.url);
  }

  private revalidate(): void {
    this.loading.set(true);
    this.http
      .get<unknown>(HASHES_URL)
      .pipe(catchError(() => of(null)))
      .subscribe((raw) => {
        // A missing digest is not fatal: it only means the freshness check is
        // skipped, so previews are fetched when there is nothing to show yet.
        const signature = raw === null ? null : previewsSignature(raw);
        if (
          signature !== null &&
          signature === this.signature &&
          this.previews() !== null
        ) {
          this.loading.set(false);
          return;
        }
        if (signature === null && this.previews() !== null) {
          this.loading.set(false);
          return;
        }
        this.fetchPreviews(signature);
      });
  }

  private fetchPreviews(signature: string | null): void {
    this.http
      .get<unknown>(PREVIEWS_URL)
      .pipe(catchError(() => of(null)))
      .subscribe((raw) => {
        this.loading.set(false);
        if (raw === null) {
          // Keep any cached previews on screen; only a cold failure is "failed".
          this.failed.set(this.previews() === null);
          return;
        }
        const previews = coercePreviewMap(raw);
        this.failed.set(false);
        this.signature = signature;
        this.previews.set(previews);
        this.writeCache({ signature: signature ?? '', previews });
      });
  }

  private readCache(): CachedPreviews | null {
    const raw = this.db.get(CACHE_KEY);
    if (typeof raw !== 'object' || raw === null) {
      return null;
    }
    const source = raw as Record<string, unknown>;
    if (typeof source['signature'] !== 'string') {
      return null;
    }
    const previews = coercePreviewMap(source['previews']);
    if (Object.keys(previews).length === 0) {
      return null;
    }
    return { signature: source['signature'], previews };
  }

  private writeCache(value: CachedPreviews): void {
    this.db.store(CACHE_KEY, value);
  }
}
