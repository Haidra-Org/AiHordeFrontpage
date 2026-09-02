import {
  Injectable,
  PLATFORM_ID,
  Signal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { TranslocoService } from '@jsverse/transloco';
import { catchError, of } from 'rxjs';
import { DatabaseService } from './database.service';
import { CacheTTL, HordeApiCacheService } from './horde-api-cache.service';

/**
 * What the model reference publishes about the licences the horde's weights
 * come under. The site shows one fact from it: whether the reader may use what
 * a model, a ControlNet, an upscaler or a face fixer makes for them
 * commercially.
 */
const LICENSING_URL =
  'https://models.aihorde.net/api/model_references/v2/licensing';

/** The address the export's own `definition_urls` are relative to. */
const API_ROOT = 'https://models.aihorde.net/api';

/** Where the same reference is published for a reader to browse. */
const EXPLORER_ROOT = 'https://reference.aihorde.net';

/** How many assets one page of the assets endpoint carries. */
const PAGE_LIMIT = 500;

/** How many pages are read before the walk gives up on a category. */
const MAX_PAGES = 10;

const CACHE_KEY = 'aihorde.licensing';

/**
 * Every request here is made without the shared in-memory cache. Asking about
 * an asset is what starts a category loading, and a template asks on every
 * change detection, so a cached reply replayed synchronously would land the
 * signal write that follows it inside whatever computed made the ask. The
 * service keeps its own copy, in memory and in storage, in its place.
 */
const REQUEST_CACHE = { ttl: CacheTTL.NEVER } as const;

/**
 * Shape version of the persisted copy. One written by an older shape is dropped
 * rather than migrated: a refetch costs one request and the data is not
 * user-owned.
 */
const CACHE_VERSION = 1;

/**
 * How long a persisted copy is served before it is read again. The export
 * carries a revision, so a refetch that finds the same revision changes
 * nothing; the interval is what decides how often that is checked.
 */
export const LICENSING_TTL_MS = 24 * 60 * 60 * 1000;

/** How long a category that failed to load waits before it is asked for again. */
export const LICENSING_RETRY_MS = 60 * 1000;

/** The asset categories the studio and the model pages ask about. */
export const LICENSING_CATEGORIES = [
  'image_generation',
  'controlnet',
  'controlnet_annotator',
  'esrgan',
  'gfpgan',
  'codeformer',
] as const;

export type LicensingCategory = (typeof LICENSING_CATEGORIES)[number];

/** What the reference says about using an asset's output commercially. */
export type LicensingStatus =
  | 'allowed'
  | 'allowed_with_conditions'
  | 'prohibited'
  | 'unknown';

/** The conditions a licence attaches, as the reference enumerates them. */
export const LICENSING_OBLIGATIONS = [
  'attribution',
  'include_license',
  'share_alike',
  'disclose_source',
  'network_source_disclosure',
  'responsible_use_restrictions',
  'other',
] as const;

export type LicensingObligation = (typeof LICENSING_OBLIGATIONS)[number];

/**
 * How much doubt each status leaves a reader who wants to sell what they made.
 * A licence nobody has read yet is a worse answer than one that says yes with
 * conditions, so it outranks it where several assets are being summarised.
 */
const STATUS_SEVERITY: Readonly<Record<LicensingStatus, number>> = {
  allowed: 0,
  allowed_with_conditions: 1,
  unknown: 2,
  prohibited: 3,
};

/** One asset's licensing, as a line of copy needs it. */
export interface LicensingFact {
  status: LicensingStatus;
  /** The licence expression the reference publishes, empty when it has none. */
  licenseId: string;
  /** The licence's published name, or null until its definition is known. */
  licenseName: string | null;
  /** Where the licence itself can be read, or null when the expression names several. */
  licenseUrl: string | null;
  obligations: readonly LicensingObligation[];
}

/** A fact together with the asset it belongs to, for a line that names it. */
export interface NamedLicensingFact {
  name: string;
  /** The category the asset is filed under, which its name alone does not say. */
  category: LicensingCategory;
  fact: LicensingFact;
}

/** One asset as the reference publishes it, before the definitions are laid over it. */
export interface AssetLicensing {
  status: LicensingStatus;
  licenseId: string;
  licenseIds: readonly string[];
  obligations: readonly LicensingObligation[];
  /** Licence id to the API path of its definition. */
  definitionUrls: Readonly<Record<string, string>>;
}

/** A licence definition, reduced to what a line shows. */
export interface LicenseDefinition {
  name: string | null;
  canonicalUrl: string | null;
}

interface CachedLicensing {
  version: number;
  fetchedAt: number;
  /** The export revision the copy was read at, when the pages carried one. */
  revision: number | null;
  updatedAt: number | null;
  categories: string[];
  assets: Record<string, AssetLicensing>;
  licenses: Record<string, LicenseDefinition>;
}

/** The key one asset is held under, matching the reference's own identifier. */
function assetKey(category: string, name: string): string {
  return `${category}:${name}`;
}

/** A status field, folded onto the four the site knows. */
function readStatus(raw: unknown): LicensingStatus {
  return raw === 'allowed' ||
    raw === 'allowed_with_conditions' ||
    raw === 'prohibited'
    ? raw
    : 'unknown';
}

/**
 * The obligations of one asset. A condition the reference grows later reads as
 * "other" rather than disappearing, so a reader is never told a licence asks
 * nothing of them when it does.
 */
function readObligations(raw: unknown): readonly LicensingObligation[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const known = new Set<string>(LICENSING_OBLIGATIONS);
  const obligations = new Set<LicensingObligation>();
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      continue;
    }
    obligations.add(
      known.has(entry) ? (entry as LicensingObligation) : 'other',
    );
  }
  return [...obligations];
}

/** The non-empty strings of a list field, or an empty list. */
function readIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (entry): entry is string => typeof entry === 'string' && entry !== '',
  );
}

/** The licence id to definition-path map an asset carries, or an empty one. */
function readDefinitionUrls(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null) {
    return {};
  }
  const urls: Record<string, string> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value !== '') {
      urls[id] = value;
    }
  }
  return urls;
}

/**
 * Read one page of the assets endpoint, keyed by the reference's own asset
 * identifiers. An entry the page cannot be read from is skipped rather than
 * stored half-formed.
 */
export function coerceAssetPage(raw: unknown): Map<string, AssetLicensing> {
  const assets = new Map<string, AssetLicensing>();
  if (typeof raw !== 'object' || raw === null) {
    return assets;
  }
  const items = (raw as Record<string, unknown>)['items'];
  if (!Array.isArray(items)) {
    return assets;
  }
  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const entry = item as Record<string, unknown>;
    const identifier = entry['asset_identifier'];
    const licensing = entry['licensing'];
    if (
      typeof identifier !== 'string' ||
      identifier === '' ||
      typeof licensing !== 'object' ||
      licensing === null
    ) {
      continue;
    }
    const source = licensing as Record<string, unknown>;
    const expression = source['license_expression'];
    const licenseIds = readIds(source['license_ids']);
    assets.set(identifier, {
      status: readStatus(source['commercial_use']),
      licenseId:
        typeof expression === 'string' && expression !== ''
          ? expression
          : (licenseIds[0] ?? ''),
      licenseIds,
      obligations: readObligations(source['obligations']),
      definitionUrls: readDefinitionUrls(entry['definition_urls']),
    });
  }
  return assets;
}

/** The `total` a page reports, or null when it reports none. */
function readTotal(raw: unknown): number | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const total = (raw as Record<string, unknown>)['total'];
  return typeof total === 'number' && Number.isFinite(total) ? total : null;
}

/** The export revision and timestamp a page carries, or nulls when it carries none. */
function readMetadata(raw: unknown): {
  revision: number | null;
  updatedAt: number | null;
} {
  const empty = { revision: null, updatedAt: null };
  if (typeof raw !== 'object' || raw === null) {
    return empty;
  }
  const metadata = (raw as Record<string, unknown>)['metadata'];
  if (typeof metadata !== 'object' || metadata === null) {
    return empty;
  }
  const source = metadata as Record<string, unknown>;
  const revision = source['revision'];
  const updatedAt = source['updated_at'];
  return {
    revision: typeof revision === 'number' ? revision : null,
    updatedAt: typeof updatedAt === 'number' ? updatedAt : null,
  };
}

/** Read one licence definition, keeping the name and the address of the text. */
export function coerceLicenseDefinition(
  raw: unknown,
): LicenseDefinition | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const name = source['name'];
  const canonical = source['canonical_url'];
  return {
    name: typeof name === 'string' && name !== '' ? name : null,
    canonicalUrl:
      typeof canonical === 'string' && canonical !== '' ? canonical : null,
  };
}

/**
 * The entry a reader most needs to know about, or null when there are none. The
 * order is {@link STATUS_SEVERITY}, and the first entry wins a tie so a list
 * that is all one status names the model the rest of the panel speaks for.
 */
export function worstLicensingFact(
  entries: readonly NamedLicensingFact[],
): NamedLicensingFact | null {
  let worst: NamedLicensingFact | null = null;
  for (const entry of entries) {
    if (
      worst === null ||
      STATUS_SEVERITY[entry.fact.status] > STATUS_SEVERITY[worst.fact.status]
    ) {
      worst = entry;
    }
  }
  return worst;
}

/** The entries whose licence forbids commercial use. */
export function prohibitedFacts(
  entries: readonly NamedLicensingFact[],
): readonly NamedLicensingFact[] {
  return entries.filter((entry) => entry.fact.status === 'prohibited');
}

/**
 * The ControlNet model a control type runs on. `hough` is the older spelling of
 * `mlsd` and the reference publishes both, so the name is taken as written.
 */
export function controlnetAssetName(
  controlType: string,
  baseline: string | null,
): string {
  return baseline === 'stable_diffusion_2'
    ? `control_${controlType}_sd2`
    : `control_${controlType}`;
}

/**
 * The detector that draws the control map from the reader's picture. `hough`
 * and `mlsd` are one detector under two spellings and the reference publishes
 * it once.
 */
export function annotatorAssetName(controlType: string): string {
  return `annotator_${controlType === 'hough' ? 'mlsd' : controlType}`;
}

/**
 * Which category a post-processor's record sits in. The reference files each
 * one under the project its weights came from, so the face-fixer control's four
 * choices are split across two categories and every upscaler is an ESRGAN
 * record.
 */
export function postProcessorCategory(name: string): LicensingCategory {
  if (name === 'CodeFormers') {
    return 'codeformer';
  }
  return name.startsWith('GFPGAN') || name === 'RestoreFormer'
    ? 'gfpgan'
    : 'esrgan';
}

/**
 * The explorer's page for one asset, where its licence is set out in full
 * alongside everything else the reference publishes about it.
 */
export function licensingExplorerUrl(
  category: LicensingCategory,
  name: string,
): string {
  return `${EXPLORER_ROOT}/categories/${category}/model/${encodeURIComponent(name)}`;
}

/**
 * One fact as the line a reader sees. `nameAsset` is for the places where the
 * control the line sits under does not itself name the asset, such as a control
 * type that brings both a ControlNet model and a detector with it.
 */
export function licensingLineText(
  transloco: TranslocoService,
  fact: LicensingFact,
  name: string,
  nameAsset: boolean,
): string {
  const line = transloco.translate(`generate.licensing.${fact.status}`, {
    licence: fact.licenseId,
  });
  return nameAsset
    ? transloco.translate('generate.licensing.for_asset', { fact: line, name })
    : line;
}

/**
 * Serves the model reference's licensing export: whether what an asset makes
 * may be used commercially, under which licence, and what that licence asks in
 * return.
 *
 * Nothing is requested until something asks about a category, and each of the
 * six categories is fetched on its own, so a page that only shows models never
 * pays for the upscaler or ControlNet records. A persisted copy is published on
 * construction and refetched once it is older than {@link LICENSING_TTL_MS}.
 *
 * Every failure path is silent and leaves the answer null, which every caller
 * renders as no line at all: a licence fact that could not be fetched must not
 * become a claim about the licence.
 */
@Injectable({ providedIn: 'root' })
export class LicensingService {
  private readonly cache = inject(HordeApiCacheService);
  private readonly db = inject(DatabaseService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Asset identifier to its licensing, across every category loaded so far. */
  private readonly assets = signal<ReadonlyMap<string, AssetLicensing>>(
    new Map(),
  );
  /** Licence id to its definition, for the ids the loaded assets name. */
  private readonly definitions = signal<ReadonlyMap<string, LicenseDefinition>>(
    new Map(),
  );
  /** The categories that have answered, which is what tells unknown from unread. */
  private readonly loaded = signal<ReadonlySet<LicensingCategory>>(new Set());

  /** When the persisted copy was written, or 0 when there is none. */
  private fetchedAt = 0;
  private revision: number | null = null;
  private updatedAt: number | null = null;

  private readonly inFlight = new Set<LicensingCategory>();
  private readonly failedAt = new Map<LicensingCategory, number>();
  private readonly askedDefinitions = new Set<string>();

  /**
   * One signal per asset and per control type, so a template that asks on every
   * change detection gets the same signal back rather than a new one each time.
   */
  private readonly factSignals = new Map<
    string,
    Signal<LicensingFact | null>
  >();
  private readonly controlSignals = new Map<
    string,
    Signal<readonly NamedLicensingFact[]>
  >();

  public constructor() {
    this.restore();
  }

  /**
   * What the reference says about using `name`'s output commercially, or null
   * while the category has not answered. An asset the category does not list
   * reads as not yet reviewed.
   */
  public commercialUse(
    category: LicensingCategory,
    name: string,
  ): Signal<LicensingFact | null> {
    const key = assetKey(category, name);
    this.ensureCategory(category);
    const existing = this.factSignals.get(key);
    if (existing) {
      return existing;
    }
    const fact = computed(() => this.factFor(category, name));
    this.factSignals.set(key, fact);
    return fact;
  }

  /**
   * The facts a chosen control type brings with it: the ControlNet model it
   * runs on, and the detector that draws the map when the worker is the one
   * making it. Only assets the reference lists produce a fact, because the
   * convention that builds the names resolves for the common detectors and not
   * for the rest, and a line about an asset the reference has never heard of
   * would be inventing one.
   */
  public controlTypeFacts(
    controlType: string,
    baseline: string | null,
    imageIsControl: boolean,
  ): Signal<readonly NamedLicensingFact[]> {
    const key = `${controlType}|${baseline ?? ''}|${imageIsControl}`;
    this.ensureCategory('controlnet');
    if (!imageIsControl) {
      this.ensureCategory('controlnet_annotator');
    }
    const existing = this.controlSignals.get(key);
    if (existing) {
      return existing;
    }
    const facts = computed<readonly NamedLicensingFact[]>(() => {
      if (controlType === '') {
        return [];
      }
      const entries: NamedLicensingFact[] = [];
      this.pushListed(
        entries,
        'controlnet',
        controlnetAssetName(controlType, baseline),
      );
      if (!imageIsControl) {
        this.pushListed(
          entries,
          'controlnet_annotator',
          annotatorAssetName(controlType),
        );
      }
      return entries;
    });
    this.controlSignals.set(key, facts);
    return facts;
  }

  /** Add `name`'s fact when the reference lists it and the category has answered. */
  private pushListed(
    entries: NamedLicensingFact[],
    category: LicensingCategory,
    name: string,
  ): void {
    if (!this.assets().has(assetKey(category, name))) {
      return;
    }
    const fact = this.factFor(category, name);
    if (fact !== null) {
      entries.push({ name, category, fact });
    }
  }

  /** One asset's fact, with its licence definition laid over it. */
  private factFor(
    category: LicensingCategory,
    name: string,
  ): LicensingFact | null {
    if (!this.loaded().has(category) || name === '') {
      return null;
    }
    const asset = this.assets().get(assetKey(category, name));
    if (asset === undefined) {
      return {
        status: 'unknown',
        licenseId: '',
        licenseName: null,
        licenseUrl: null,
        obligations: [],
      };
    }
    // An expression naming several licences has no single definition to link,
    // so it is shown as published and left unlinked.
    const only = asset.licenseIds.length === 1 ? asset.licenseIds[0] : null;
    const definition =
      only === null ? null : (this.definitions().get(only) ?? null);
    const path = only === null ? null : (asset.definitionUrls[only] ?? null);
    return {
      status: asset.status,
      licenseId: asset.licenseId,
      licenseName: definition?.name ?? null,
      licenseUrl:
        definition?.canonicalUrl ??
        (path === null ? null : `${API_ROOT}${path}`),
      obligations: asset.obligations,
    };
  }

  /**
   * Start `category` loading if it is not loaded, not in flight, and not inside
   * the backoff a failure leaves behind. Nothing here writes a signal, so this
   * is safe to call from a template binding.
   */
  private ensureCategory(category: LicensingCategory): void {
    if (!this.isBrowser || this.inFlight.has(category)) {
      return;
    }
    const now = this.now();
    if (
      this.loaded().has(category) &&
      now - this.fetchedAt < LICENSING_TTL_MS
    ) {
      return;
    }
    const failed = this.failedAt.get(category);
    if (failed !== undefined && now - failed < LICENSING_RETRY_MS) {
      return;
    }
    this.inFlight.add(category);
    this.fetchPage(category, 0, new Map());
  }

  /**
   * Walk one category's pages. The pages are gathered before anything is
   * published, so a category never appears half-read.
   */
  private fetchPage(
    category: LicensingCategory,
    offset: number,
    gathered: Map<string, AssetLicensing>,
  ): void {
    const url =
      `${LICENSING_URL}/assets?category=${category}` +
      `&limit=${PAGE_LIMIT}&offset=${offset}`;
    this.cache
      .cachedGet<unknown>(url, undefined, REQUEST_CACHE)
      .pipe(catchError(() => of(null)))
      .subscribe((raw) => {
        if (raw === null) {
          this.inFlight.delete(category);
          this.failedAt.set(category, this.now());
          return;
        }
        const page = coerceAssetPage(raw);
        for (const [key, asset] of page) {
          gathered.set(key, asset);
        }
        const total = readTotal(raw);
        const next = offset + PAGE_LIMIT;
        if (
          page.size > 0 &&
          total !== null &&
          next < total &&
          next / PAGE_LIMIT < MAX_PAGES
        ) {
          this.fetchPage(category, next, gathered);
          return;
        }
        this.inFlight.delete(category);
        this.failedAt.delete(category);
        this.publish(category, gathered, readMetadata(raw));
      });
  }

  /** Take one category's assets into the map, persist, and read the licences named. */
  private publish(
    category: LicensingCategory,
    gathered: ReadonlyMap<string, AssetLicensing>,
    metadata: { revision: number | null; updatedAt: number | null },
  ): void {
    const assets = new Map(this.assets());
    for (const [key, asset] of gathered) {
      assets.set(key, asset);
    }
    this.assets.set(assets);
    this.loaded.set(new Set([...this.loaded(), category]));
    this.fetchedAt = this.now();
    this.revision = metadata.revision;
    this.updatedAt = metadata.updatedAt;
    this.persist();
    for (const asset of gathered.values()) {
      if (asset.licenseIds.length === 1) {
        this.fetchDefinition(asset.licenseIds[0], asset.definitionUrls);
      }
    }
  }

  /** Read one licence's name and canonical address, once per licence id. */
  private fetchDefinition(
    licenseId: string,
    definitionUrls: Readonly<Record<string, string>>,
  ): void {
    if (
      !this.isBrowser ||
      this.askedDefinitions.has(licenseId) ||
      this.definitions().has(licenseId)
    ) {
      return;
    }
    this.askedDefinitions.add(licenseId);
    const path = definitionUrls[licenseId];
    const url =
      path === undefined
        ? `${LICENSING_URL}/licenses/${encodeURIComponent(licenseId)}`
        : `${API_ROOT}${path}`;
    this.cache
      .cachedGet<unknown>(url, undefined, REQUEST_CACHE)
      .pipe(catchError(() => of(null)))
      .subscribe((raw) => {
        const definition = coerceLicenseDefinition(raw);
        if (definition === null) {
          this.askedDefinitions.delete(licenseId);
          return;
        }
        this.definitions.set(
          new Map(this.definitions()).set(licenseId, definition),
        );
        this.persist();
      });
  }

  /**
   * Keep a copy for the next visit. A storage box that will not take it costs
   * one refetch, so a refusal is dropped rather than raised.
   */
  private persist(): void {
    try {
      this.db.store(CACHE_KEY, {
        version: CACHE_VERSION,
        fetchedAt: this.fetchedAt,
        revision: this.revision,
        updatedAt: this.updatedAt,
        categories: [...this.loaded()],
        assets: Object.fromEntries(this.assets()),
        licenses: Object.fromEntries(this.definitions()),
      } satisfies CachedLicensing);
    } catch {
      return;
    }
  }

  /** Publish the persisted copy, or nothing when it is absent or of another shape. */
  private restore(): void {
    let raw: unknown;
    try {
      raw = this.db.get(CACHE_KEY);
    } catch {
      return;
    }
    if (typeof raw !== 'object' || raw === null) {
      return;
    }
    const source = raw as Record<string, unknown>;
    if (
      source['version'] !== CACHE_VERSION ||
      typeof source['fetchedAt'] !== 'number' ||
      !Array.isArray(source['categories'])
    ) {
      return;
    }
    const categories = source['categories'].filter(
      (entry): entry is LicensingCategory =>
        (LICENSING_CATEGORIES as readonly string[]).includes(entry as string),
    );
    if (categories.length === 0) {
      return;
    }
    this.fetchedAt = source['fetchedAt'];
    const revision = source['revision'];
    const updatedAt = source['updatedAt'];
    this.revision = typeof revision === 'number' ? revision : null;
    this.updatedAt = typeof updatedAt === 'number' ? updatedAt : null;
    this.assets.set(readCachedAssets(source['assets']));
    this.definitions.set(readCachedDefinitions(source['licenses']));
    this.loaded.set(new Set(categories));
  }

  private now(): number {
    return Date.now();
  }
}

/** Read back the assets of a persisted copy, dropping anything malformed. */
function readCachedAssets(raw: unknown): Map<string, AssetLicensing> {
  const assets = new Map<string, AssetLicensing>();
  if (typeof raw !== 'object' || raw === null) {
    return assets;
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) {
      continue;
    }
    const source = value as Record<string, unknown>;
    const licenseId = source['licenseId'];
    assets.set(key, {
      status: readStatus(source['status']),
      licenseId: typeof licenseId === 'string' ? licenseId : '',
      licenseIds: readIds(source['licenseIds']),
      obligations: readObligations(source['obligations']),
      definitionUrls: readDefinitionUrls(source['definitionUrls']),
    });
  }
  return assets;
}

/**
 * The same for the licence definitions a persisted copy carries. They are read
 * back in the shape they were written in rather than the export's, so a stored
 * copy answers with everything a freshly fetched one does.
 */
function readCachedDefinitions(raw: unknown): Map<string, LicenseDefinition> {
  const definitions = new Map<string, LicenseDefinition>();
  if (typeof raw !== 'object' || raw === null) {
    return definitions;
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) {
      continue;
    }
    const source = value as Record<string, unknown>;
    const name = source['name'];
    const canonicalUrl = source['canonicalUrl'];
    definitions.set(key, {
      name: typeof name === 'string' && name !== '' ? name : null,
      canonicalUrl:
        typeof canonicalUrl === 'string' && canonicalUrl !== ''
          ? canonicalUrl
          : null,
    });
  }
  return definitions;
}
