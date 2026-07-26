import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { DatabaseService } from './database.service';

/**
 * The official image model reference. Each entry is a model record; only its
 * `baseline` matters here, and it is the field that decides which of the horde's
 * baseline-specific features a model can serve.
 */
const MODEL_REFERENCE_URL =
  'https://models.aihorde.net/api/model_references/v1/image_generation';

const CACHE_KEY = 'aihorde.generate.model_baselines';

/** How long a persisted copy is served without a background refetch. */
export const MODEL_REFERENCE_TTL_MS = 60 * 60 * 1000;

/** Baselines whose models can serve a `remix` request (Stable Cascade). */
const REMIX_BASELINES: readonly string[] = ['stable_cascade'];

/** Baselines whose models can serve the `qr_code` workflow (SD 1.5 and SDXL). */
const QR_CODE_BASELINES: readonly string[] = [
  'stable_diffusion_1',
  'stable_diffusion_xl',
];

/** Model name -> normalised baseline. */
export type ModelBaselineMap = Record<string, string>;

interface CachedBaselines {
  fetchedAt: number;
  baselines: ModelBaselineMap;
}

/**
 * Fold the spelling variants the reference has carried over time ("stable
 * diffusion 1", "stable_diffusion_1", "Stable Cascade") onto one token, so the
 * capability tables can be written once and keep matching if the upstream
 * punctuation shifts again.
 */
export function normalizeBaseline(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_');
}

/** Read the `baseline` of every record in a raw reference payload. */
export function coerceBaselineMap(raw: unknown): ModelBaselineMap {
  if (typeof raw !== 'object' || raw === null) {
    return {};
  }
  const map: ModelBaselineMap = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) {
      continue;
    }
    const baseline = (value as Record<string, unknown>)['baseline'];
    if (typeof baseline === 'string' && baseline.trim() !== '') {
      map[name] = normalizeBaseline(baseline);
    }
  }
  return map;
}

/** Re-read an already-flattened `name -> baseline` map, e.g. from the cache. */
function coerceFlatBaselineMap(raw: unknown): ModelBaselineMap {
  if (typeof raw !== 'object' || raw === null) {
    return {};
  }
  const map: ModelBaselineMap = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim() !== '') {
      map[name] = normalizeBaseline(value);
    }
  }
  return map;
}

/**
 * Whether a baseline can serve a request, failing open on an unknown one. Gating
 * exists to steer users away from a combination the horde will reject, so a
 * reference that could not be fetched (or a model it has never heard of) must
 * leave every mode reachable rather than locking the user out.
 */
function baselineSupports(
  baseline: string | null,
  supported: readonly string[],
): boolean {
  return baseline === null || supported.includes(baseline);
}

export function baselineSupportsRemix(baseline: string | null): boolean {
  return baselineSupports(baseline, REMIX_BASELINES);
}

export function baselineSupportsQrCode(baseline: string | null): boolean {
  return baselineSupports(baseline, QR_CODE_BASELINES);
}

/**
 * Serves model baselines to the generate studio so it can gate the features that
 * only some baselines implement (Stable Cascade remix, the SD 1.5 / SDXL QR-code
 * workflow).
 *
 * Nothing is requested until {@link load} is called. A persisted copy is
 * published immediately and refetched in the background once it is older than
 * {@link MODEL_REFERENCE_TTL_MS}. Every failure path is silent and leaves the
 * baselines signal null, which the `supports*` helpers read as "allow".
 */
@Injectable({ providedIn: 'root' })
export class ModelReferenceService {
  private readonly http = inject(HttpClient);
  private readonly db = inject(DatabaseService);

  /** Known model baselines, or null while nothing has been loaded yet. */
  public readonly baselines = signal<ModelBaselineMap | null>(null);
  /** Whether a network round trip is in flight. */
  public readonly loading = signal(false);

  private started = false;

  /**
   * Publish any cached baselines and revalidate when they are stale. Safe to
   * call repeatedly; only the first call does any work.
   */
  public load(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const cached = this.readCache();
    if (cached) {
      this.baselines.set(cached.baselines);
      if (this.now() - cached.fetchedAt < MODEL_REFERENCE_TTL_MS) {
        return;
      }
    }
    this.fetch();
  }

  /**
   * The normalised baseline for `modelName`, or null when it is unknown, the
   * reference has not loaded, or no model is selected.
   */
  public baselineFor(modelName: string): string | null {
    const name = modelName.trim();
    if (name === '') {
      return null;
    }
    return this.baselines()?.[name] ?? null;
  }

  /** Whether `modelName` can serve a remix request; permissive when unknown. */
  public supportsRemix(modelName: string): boolean {
    return baselineSupportsRemix(this.baselineFor(modelName));
  }

  /** Whether `modelName` can serve the QR-code workflow; permissive when unknown. */
  public supportsQrCode(modelName: string): boolean {
    return baselineSupportsQrCode(this.baselineFor(modelName));
  }

  private fetch(): void {
    this.loading.set(true);
    this.http
      .get<unknown>(MODEL_REFERENCE_URL)
      .pipe(catchError(() => of(null)))
      .subscribe((raw) => {
        this.loading.set(false);
        if (raw === null) {
          return;
        }
        const baselines = coerceBaselineMap(raw);
        if (Object.keys(baselines).length === 0) {
          return;
        }
        this.baselines.set(baselines);
        this.db.store(CACHE_KEY, {
          fetchedAt: this.now(),
          baselines,
        } satisfies CachedBaselines);
      });
  }

  private readCache(): CachedBaselines | null {
    const raw = this.db.get(CACHE_KEY);
    if (typeof raw !== 'object' || raw === null) {
      return null;
    }
    const source = raw as Record<string, unknown>;
    if (typeof source['fetchedAt'] !== 'number') {
      return null;
    }
    const baselines = coerceFlatBaselineMap(source['baselines']);
    if (Object.keys(baselines).length === 0) {
      return null;
    }
    return { fetchedAt: source['fetchedAt'], baselines };
  }

  private now(): number {
    return Date.now();
  }
}
