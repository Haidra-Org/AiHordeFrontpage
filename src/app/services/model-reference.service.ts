import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { DatabaseService } from './database.service';

/**
 * The official image model reference. Each entry is a model record; the fields
 * read here are its `baseline`, which decides which of the horde's
 * baseline-specific features a model can serve, and its `requirements`, the
 * settings the model's publisher recommends generating with.
 */
const MODEL_REFERENCE_URL =
  'https://models.aihorde.net/api/model_references/v1/image_generation';

const CACHE_KEY = 'aihorde.generate.model_baselines';

/**
 * Shape version of the persisted payload. A cache written by an older shape is
 * dropped rather than migrated, since a refetch costs one request and the data
 * is not user-owned.
 */
const CACHE_VERSION = 2;

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

/**
 * The settings a model record recommends. Despite the upstream name these are
 * advice rather than constraints: the horde accepts a request that ignores every
 * one of them, so nothing here may block a submission.
 *
 * Every field is optional and a record may carry any combination of them: an
 * exact `cfg_scale` or a `min_cfg_scale`/`max_cfg_scale` range (or both, or only
 * one end of the range). Fields the reference may grow later are ignored.
 */
export interface ModelRequirements {
  clip_skip?: number;
  min_steps?: number;
  max_steps?: number;
  cfg_scale?: number;
  min_cfg_scale?: number;
  max_cfg_scale?: number;
  /** Suggested `sampler_name` values. */
  samplers?: string[];
  /** Suggested schedulers; the only one the form models is `karras`. */
  schedulers?: string[];
}

/** Model name -> its recommended settings. Models without any are absent. */
export type ModelRequirementsMap = Record<string, ModelRequirements>;

interface CachedReference {
  version: number;
  fetchedAt: number;
  baselines: ModelBaselineMap;
  requirements: ModelRequirementsMap;
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

const REQUIREMENT_NUMBER_KEYS = [
  'clip_skip',
  'min_steps',
  'max_steps',
  'cfg_scale',
  'min_cfg_scale',
  'max_cfg_scale',
] as const satisfies readonly (keyof ModelRequirements)[];

const REQUIREMENT_LIST_KEYS = [
  'samplers',
  'schedulers',
] as const satisfies readonly (keyof ModelRequirements)[];

/**
 * Read one record's `requirements`, keeping only the fields this app models and
 * only where they are well-formed. Returns null when nothing usable survives, so
 * a record with an empty or malformed block reads the same as one with none.
 */
export function coerceRequirements(raw: unknown): ModelRequirements | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const result: ModelRequirements = {};
  let found = false;
  for (const key of REQUIREMENT_NUMBER_KEYS) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = value;
      found = true;
    }
  }
  for (const key of REQUIREMENT_LIST_KEYS) {
    const value = source[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const entries = value.filter(
      (entry): entry is string => typeof entry === 'string' && entry !== '',
    );
    if (entries.length > 0) {
      result[key] = entries;
      found = true;
    }
  }
  return found ? result : null;
}

/** Read the `requirements` of every record in a raw reference payload. */
export function coerceRequirementsMap(raw: unknown): ModelRequirementsMap {
  if (typeof raw !== 'object' || raw === null) {
    return {};
  }
  const map: ModelRequirementsMap = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) {
      continue;
    }
    const requirements = coerceRequirements(
      (value as Record<string, unknown>)['requirements'],
    );
    if (requirements) {
      map[name] = requirements;
    }
  }
  return map;
}

/** Re-read an already-flattened `name -> requirements` map from the cache. */
function coerceFlatRequirementsMap(raw: unknown): ModelRequirementsMap {
  if (typeof raw !== 'object' || raw === null) {
    return {};
  }
  const map: ModelRequirementsMap = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const requirements = coerceRequirements(value);
    if (requirements) {
      map[name] = requirements;
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
 * Serves model baselines and per-model recommended settings to the generate
 * studio, so it can gate the features that only some baselines implement (Stable
 * Cascade remix, the SD 1.5 / SDXL QR-code workflow) and surface the settings a
 * model was published to work best at.
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
  /** Recommended settings per model; null until something has been loaded. */
  public readonly requirements = signal<ModelRequirementsMap | null>(null);
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
      this.requirements.set(cached.requirements);
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

  /**
   * The settings `modelName` recommends, or null when it recommends none, is
   * unknown, or the reference has not loaded.
   */
  public requirementsFor(modelName: string): ModelRequirements | null {
    const name = modelName.trim();
    if (name === '') {
      return null;
    }
    return this.requirements()?.[name] ?? null;
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
        const requirements = coerceRequirementsMap(raw);
        this.baselines.set(baselines);
        this.requirements.set(requirements);
        this.db.store(CACHE_KEY, {
          version: CACHE_VERSION,
          fetchedAt: this.now(),
          baselines,
          requirements,
        } satisfies CachedReference);
      });
  }

  private readCache(): CachedReference | null {
    const raw = this.db.get(CACHE_KEY);
    if (typeof raw !== 'object' || raw === null) {
      return null;
    }
    const source = raw as Record<string, unknown>;
    if (
      source['version'] !== CACHE_VERSION ||
      typeof source['fetchedAt'] !== 'number'
    ) {
      return null;
    }
    const baselines = coerceFlatBaselineMap(source['baselines']);
    if (Object.keys(baselines).length === 0) {
      return null;
    }
    return {
      version: CACHE_VERSION,
      fetchedAt: source['fetchedAt'],
      baselines,
      requirements: coerceFlatRequirementsMap(source['requirements']),
    };
  }

  private now(): number {
    return Date.now();
  }
}
