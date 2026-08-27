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

/**
 * Image models awaiting reference review. Workers may offer these models on a
 * beta basis before their records join the main reference.
 */
const PENDING_MODEL_REFERENCE_URL =
  'https://models.aihorde.net/api/model_references/v2/pending_queue/changes' +
  '?statuses=pending&categories=image_generation&limit=500';

const ANONYMOUS_API_KEY = '0000000000';

/**
 * The same reference for the models the horde writes text with. It is fetched
 * only when something asks for a text model, because most of the site never
 * does and the text reference is several times the size of the image one.
 */
const TEXT_MODEL_REFERENCE_URL =
  'https://models.aihorde.net/api/model_references/v1/text_generation';

const CACHE_KEY = 'aihorde.generate.model_baselines';

/** Pending records expire independently from the main image reference. */
const PENDING_CACHE_KEY = 'aihorde.generate.pending_model_reference';

/** Where the text reference is kept. The image reference keeps its own key. */
const TEXT_CACHE_KEY = 'aihorde.generate.text_model_reference';

/**
 * Shape version of the persisted payload. A cache written by an older shape is
 * dropped rather than migrated, since a refetch costs one request and the data
 * is not user-owned.
 */
const CACHE_VERSION = 4;

/** How long a persisted copy is served without a background refetch. */
export const MODEL_REFERENCE_TTL_MS = 60 * 60 * 1000;

/** Baselines whose models can serve a `remix` request (Stable Cascade). */
export const REMIX_BASELINES: readonly string[] = ['stable_cascade'];

/** Baselines whose models can serve the `qr_code` workflow (SD 1.5 and SDXL). */
export const QR_CODE_BASELINES: readonly string[] = [
  'stable_diffusion_1',
  'stable_diffusion_xl',
];

/**
 * Baselines the layerdiffuse pipeline has weights for (SD 1.5 and SDXL). The
 * horde does not refuse a transparent request on another baseline, so this is
 * guidance rather than something it would reject on.
 */
export const TRANSPARENT_BASELINES: readonly string[] = [
  'stable_diffusion_1',
  'stable_diffusion_xl',
];

/**
 * Baselines the horde has ControlNet annotators for. The models are SD 1.5
 * ControlNets, so a control_type asked of any other family is dropped or
 * refused rather than guiding the image.
 */
export const CONTROLNET_BASELINES: readonly string[] = ['stable_diffusion_1'];

/**
 * Baselines whose models can be given a mask at all. The worker software picks
 * a model family's own pipeline ahead of the masked ones, and only the
 * checkpoint families have a masked pipeline to pick; on Flux, Cascade, Qwen
 * and Z-Image a mask is dropped without a word and the whole picture is
 * redrawn. Masked image-to-image, inpainting and outpainting share the rule.
 */
export const MASK_BASELINES: readonly string[] = [
  'stable_diffusion_1',
  'stable_diffusion_2',
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

/** One file a worker downloads to serve a model. */
export interface ModelDownloadFile {
  file_name: string | null;
  file_url: string | null;
}

/**
 * One image model as the reference describes it. Every field the reference may
 * leave out is null or empty here rather than absent, so a page can read it
 * without asking whether the key is there.
 *
 * The checksums under `config.files` are dropped: they belong to the worker
 * that downloads the weights, and nothing a reader is shown depends on them.
 */
export interface ModelReferenceRecord {
  name: string;
  /** Normalised by {@link normalizeBaseline}; null when the record has none. */
  baseline: string | null;
  type: string | null;
  description: string | null;
  version: string | null;
  style: string | null;
  nsfw: boolean;
  inpainting: boolean;
  homepage: string | null;
  /** Addresses of the published sample pictures, in the reference's order. */
  showcases: string[];
  /** Words the model was trained to answer to. */
  trigger: string[];
  tags: string[];
  size_on_disk_bytes: number | null;
  min_bridge_version: number | null;
  requirements: ModelRequirements | null;
  downloads: ModelDownloadFile[];
  optimization: string | null;
}

/** The sampling settings a text model's publisher recommends. */
export interface TextModelSettings {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  rep_pen?: number;
}

/**
 * One text model as the reference describes it. Its `baseline` is the family
 * the model was trained from ("StableLM-3B-4E1T") rather than one of the image
 * baselines, so it is kept as published rather than normalised.
 */
export interface TextModelReferenceRecord {
  name: string;
  display_name: string | null;
  model_name: string | null;
  baseline: string | null;
  /** Weight count, as a plain number of parameters. */
  parameters: number | null;
  description: string | null;
  version: string | null;
  style: string | null;
  nsfw: boolean;
  tags: string[];
  url: string | null;
  instruct_format: string | null;
  settings: TextModelSettings | null;
}

/** Model name -> its full record. */
export type ModelRecordMap = ReadonlyMap<string, ModelReferenceRecord>;

/** Text model name -> its full record. */
export type TextModelRecordMap = ReadonlyMap<string, TextModelReferenceRecord>;

interface CachedReference {
  version: number;
  fetchedAt: number;
  records: Record<string, ModelReferenceRecord>;
}

interface PendingQueuePage {
  items?: unknown;
}

interface CachedTextReference {
  version: number;
  fetchedAt: number;
  records: Record<string, TextModelReferenceRecord>;
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

/** A string field, or null when the reference left it out or left it empty. */
function readText(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** A number field, or null when it is missing or not a finite number. */
function readNumber(
  source: Record<string, unknown>,
  key: string,
): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The non-empty strings of a list field, or an empty list. */
function readTextList(source: Record<string, unknown>, key: string): string[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is string => typeof entry === 'string' && entry !== '',
  );
}

/**
 * The files a worker fetches to serve the model. The list is read from the
 * record's `config.download`, and from a flat `downloads` when the record is
 * being re-read from the cache, which keeps the already-parsed shape.
 */
function readDownloads(source: Record<string, unknown>): ModelDownloadFile[] {
  const config = source['config'];
  const fromConfig =
    typeof config === 'object' && config !== null
      ? (config as Record<string, unknown>)['download']
      : undefined;
  const raw = fromConfig ?? source['downloads'];
  if (!Array.isArray(raw)) {
    return [];
  }
  const files: ModelDownloadFile[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const file: ModelDownloadFile = {
      file_name: readText(record, 'file_name'),
      file_url: readText(record, 'file_url'),
    };
    if (file.file_name !== null || file.file_url !== null) {
      files.push(file);
    }
  }
  return files;
}

/** Read one image record, keeping the fields the site shows. */
export function coerceRecord(
  name: string,
  raw: unknown,
): ModelReferenceRecord | null {
  if (typeof raw !== 'object' || raw === null || name === '') {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const baseline = readText(source, 'baseline');
  return {
    name,
    baseline: baseline === null ? null : normalizeBaseline(baseline),
    type: readText(source, 'type'),
    description: readText(source, 'description'),
    version: readText(source, 'version'),
    style: readText(source, 'style'),
    nsfw: source['nsfw'] === true,
    inpainting: source['inpainting'] === true,
    homepage: readText(source, 'homepage'),
    showcases: readTextList(source, 'showcases'),
    trigger: readTextList(source, 'trigger'),
    tags: readTextList(source, 'tags'),
    size_on_disk_bytes: readNumber(source, 'size_on_disk_bytes'),
    min_bridge_version: readNumber(source, 'min_bridge_version'),
    requirements: coerceRequirements(source['requirements']),
    downloads: readDownloads(source),
    optimization: readText(source, 'optimization'),
  };
}

/** Read every image record in a reference payload, or in a cached copy of one. */
export function coerceRecordMap(
  raw: unknown,
): Map<string, ModelReferenceRecord> {
  const map = new Map<string, ModelReferenceRecord>();
  if (typeof raw !== 'object' || raw === null) {
    return map;
  }
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const record = coerceRecord(name, value);
    if (record) {
      map.set(name, record);
    }
  }
  return map;
}

/**
 * Read the full model payloads carried by pending image-reference changes.
 * Deletions and changes for other reference categories cannot describe a beta
 * image model and are ignored. When several changes name one model, the newest
 * monotonic change id wins regardless of response ordering.
 */
export function coercePendingRecordMap(
  raw: unknown,
): Map<string, ModelReferenceRecord> {
  const records = new Map<string, ModelReferenceRecord>();
  const changeIds = new Map<string, number>();
  if (typeof raw !== 'object' || raw === null) {
    return records;
  }
  const items = (raw as PendingQueuePage).items;
  if (!Array.isArray(items)) {
    return records;
  }
  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const change = item as Record<string, unknown>;
    if (
      change['status'] !== 'pending' ||
      change['resource_kind'] !== 'model_reference' ||
      change['category'] !== 'image_generation' ||
      change['operation'] === 'delete'
    ) {
      continue;
    }
    const name = readText(change, 'model_name');
    const changeId = readNumber(change, 'change_id');
    if (name === null || changeId === null) {
      continue;
    }
    const record = coerceRecord(name, change['payload']);
    if (record && changeId > (changeIds.get(name) ?? -1)) {
      records.set(name, record);
      changeIds.set(name, changeId);
    }
  }
  return records;
}

/** Read a text record's recommended sampling settings, or null when it has none. */
function coerceTextSettings(raw: unknown): TextModelSettings | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const settings: TextModelSettings = {};
  let found = false;
  for (const key of ['temperature', 'top_p', 'top_k', 'rep_pen'] as const) {
    const value = readNumber(source, key);
    if (value !== null) {
      settings[key] = value;
      found = true;
    }
  }
  return found ? settings : null;
}

/** Read one text record, keeping the fields the site shows. */
export function coerceTextRecord(
  name: string,
  raw: unknown,
): TextModelReferenceRecord | null {
  if (typeof raw !== 'object' || raw === null || name === '') {
    return null;
  }
  const source = raw as Record<string, unknown>;
  return {
    name,
    display_name: readText(source, 'display_name'),
    model_name: readText(source, 'model_name'),
    baseline: readText(source, 'baseline'),
    parameters: readNumber(source, 'parameters'),
    description: readText(source, 'description'),
    version: readText(source, 'version'),
    style: readText(source, 'style'),
    nsfw: source['nsfw'] === true,
    tags: readTextList(source, 'tags'),
    url: readText(source, 'url'),
    instruct_format: readText(source, 'instruct_format'),
    settings: coerceTextSettings(source['settings']),
  };
}

/** Read every text record in a reference payload, or in a cached copy of one. */
export function coerceTextRecordMap(
  raw: unknown,
): Map<string, TextModelReferenceRecord> {
  const map = new Map<string, TextModelReferenceRecord>();
  if (typeof raw !== 'object' || raw === null) {
    return map;
  }
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const record = coerceTextRecord(name, value);
    if (record) {
      map.set(name, record);
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

export function baselineSupportsTransparent(baseline: string | null): boolean {
  return baselineSupports(baseline, TRANSPARENT_BASELINES);
}

export function baselineSupportsControlNet(baseline: string | null): boolean {
  return baselineSupports(baseline, CONTROLNET_BASELINES);
}

export function baselineSupportsMask(baseline: string | null): boolean {
  return baselineSupports(baseline, MASK_BASELINES);
}

/**
 * Serves the official model reference: the models the horde knows about, the
 * baseline each was trained from, the settings its publisher recommends, and
 * everything else the reference publishes about it.
 *
 * The generate studio reads the baselines to gate the features that only some
 * families implement (Stable Cascade remix, the SD 1.5 / SDXL QR-code
 * workflow); the model pages read the whole record.
 *
 * Nothing is requested until {@link load} is called, and the text reference not
 * until {@link loadText} is. A persisted copy is published immediately and
 * refetched in the background once it is older than
 * {@link MODEL_REFERENCE_TTL_MS}. Every failure path is silent and leaves the
 * baselines signal null, which the `supports*` helpers read as "allow".
 */
@Injectable({ providedIn: 'root' })
export class ModelReferenceService {
  private readonly http = inject(HttpClient);
  private readonly db = inject(DatabaseService);

  /**
   * Every image model the reference lists, or null while nothing has been
   * loaded yet. This is what the model pickers offer, with the horde's worker
   * counts laid over it, which `mergeModelList` in `types/active-model` does.
   */
  public readonly names = signal<string[] | null>(null);
  /** Known model baselines, or null while nothing has been loaded yet. */
  public readonly baselines = signal<ModelBaselineMap | null>(null);
  /** Recommended settings per model; null until something has been loaded. */
  public readonly requirements = signal<ModelRequirementsMap | null>(null);
  /** The full image record per model; null until something has been loaded. */
  public readonly records = signal<ModelRecordMap | null>(null);
  /** Beta model records awaiting acceptance into the main image reference. */
  public readonly pendingRecords = signal<ModelRecordMap | null>(null);
  /** Whether a network round trip is in flight. */
  public readonly loading = signal(false);

  /** Every text model the reference lists; null until {@link loadText}. */
  public readonly textNames = signal<string[] | null>(null);
  /** The full text record per model; null until {@link loadText}. */
  public readonly textRecords = signal<TextModelRecordMap | null>(null);
  /** Whether a text round trip is in flight. */
  public readonly textLoading = signal(false);

  private started = false;
  private textStarted = false;

  /**
   * Publish any cached image reference and revalidate when it is stale. Safe to
   * call repeatedly; only the first call does any work.
   */
  public load(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const cached = this.readCache();
    const pendingCached = this.readPendingCache();
    if (cached) {
      this.publish(coerceRecordMap(cached.records));
    }
    if (pendingCached) {
      this.pendingRecords.set(coerceRecordMap(pendingCached.records));
    }
    if (!cached || this.now() - cached.fetchedAt >= MODEL_REFERENCE_TTL_MS) {
      this.fetch();
    }
    if (
      !pendingCached ||
      this.now() - pendingCached.fetchedAt >= MODEL_REFERENCE_TTL_MS
    ) {
      this.fetchPending();
    }
  }

  /**
   * The same for the text reference. It is kept apart from {@link load} because
   * most of the site never asks for a text model.
   */
  public loadText(): void {
    if (this.textStarted) {
      return;
    }
    this.textStarted = true;
    const cached = this.readTextCache();
    if (cached) {
      this.publishText(coerceTextRecordMap(cached.records));
      if (this.now() - cached.fetchedAt < MODEL_REFERENCE_TTL_MS) {
        return;
      }
    }
    this.fetchText();
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
    return (
      this.baselines()?.[name] ??
      this.pendingRecords()?.get(name)?.baseline ??
      null
    );
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
    return (
      this.requirements()?.[name] ??
      this.pendingRecords()?.get(name)?.requirements ??
      null
    );
  }

  /**
   * Everything the reference publishes about `modelName`, or null when it lists
   * no such model or has not loaded.
   */
  public recordFor(modelName: string): ModelReferenceRecord | null {
    const name = modelName.trim();
    if (name === '') {
      return null;
    }
    return (
      this.records()?.get(name) ?? this.pendingRecords()?.get(name) ?? null
    );
  }

  /** Whether a beta record supplies the details for an otherwise unknown model. */
  public isPendingModel(modelName: string): boolean {
    const name = modelName.trim();
    return (
      name !== '' &&
      !this.records()?.has(name) &&
      (this.pendingRecords()?.has(name) ?? false)
    );
  }

  /** The same for a text model; null until {@link loadText} has answered. */
  public textRecordFor(modelName: string): TextModelReferenceRecord | null {
    const name = modelName.trim();
    if (name === '') {
      return null;
    }
    return this.textRecords()?.get(name) ?? null;
  }

  /** Whether `modelName` can serve a remix request; permissive when unknown. */
  public supportsRemix(modelName: string): boolean {
    return baselineSupportsRemix(this.baselineFor(modelName));
  }

  /** Whether `modelName` can serve the QR-code workflow; permissive when unknown. */
  public supportsQrCode(modelName: string): boolean {
    return baselineSupportsQrCode(this.baselineFor(modelName));
  }

  /** Whether `modelName` can render a transparent background; permissive when unknown. */
  public supportsTransparent(modelName: string): boolean {
    return baselineSupportsTransparent(this.baselineFor(modelName));
  }

  /**
   * Publish one parsed reference. The names, the baselines and the recommended
   * settings are read back out of the records rather than parsed a second time,
   * so the four signals cannot disagree about the same model.
   */
  private publish(records: ModelRecordMap): void {
    const baselines: ModelBaselineMap = {};
    const requirements: ModelRequirementsMap = {};
    for (const record of records.values()) {
      if (record.baseline !== null) {
        baselines[record.name] = record.baseline;
      }
      if (record.requirements !== null) {
        requirements[record.name] = record.requirements;
      }
    }
    this.names.set([...records.keys()]);
    this.baselines.set(baselines);
    this.requirements.set(requirements);
    this.records.set(records);
  }

  private publishText(records: TextModelRecordMap): void {
    this.textNames.set([...records.keys()]);
    this.textRecords.set(records);
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
        const records = coerceRecordMap(raw);
        if (records.size === 0) {
          return;
        }
        this.publish(records);
        this.persist(CACHE_KEY, {
          version: CACHE_VERSION,
          fetchedAt: this.now(),
          records: Object.fromEntries(records),
        } satisfies CachedReference);
      });
  }

  private fetchText(): void {
    this.textLoading.set(true);
    this.http
      .get<unknown>(TEXT_MODEL_REFERENCE_URL)
      .pipe(catchError(() => of(null)))
      .subscribe((raw) => {
        this.textLoading.set(false);
        if (raw === null) {
          return;
        }
        const records = coerceTextRecordMap(raw);
        if (records.size === 0) {
          return;
        }
        this.publishText(records);
        this.persist(TEXT_CACHE_KEY, {
          version: CACHE_VERSION,
          fetchedAt: this.now(),
          records: Object.fromEntries(records),
        } satisfies CachedTextReference);
      });
  }

  private fetchPending(): void {
    this.http
      .get<unknown>(PENDING_MODEL_REFERENCE_URL, {
        headers: { apikey: ANONYMOUS_API_KEY },
      })
      .pipe(catchError(() => of(null)))
      .subscribe((raw) => {
        if (raw === null) {
          return;
        }
        const records = coercePendingRecordMap(raw);
        this.pendingRecords.set(records);
        this.persist(PENDING_CACHE_KEY, {
          version: CACHE_VERSION,
          fetchedAt: this.now(),
          records: Object.fromEntries(records),
        } satisfies CachedReference);
      });
  }

  /**
   * Keep a copy for the next visit. A storage box that will not take it costs
   * one refetch, so a refusal is dropped rather than raised.
   */
  private persist(key: string, value: unknown): void {
    try {
      this.db.store(key, value);
    } catch {
      return;
    }
  }

  /** The stored envelope, or null when it is absent or written by an older shape. */
  private readEnvelope(key: string): Record<string, unknown> | null {
    let raw: unknown;
    try {
      raw = this.db.get(key);
    } catch {
      return null;
    }
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
    return source;
  }

  private readCache(): CachedReference | null {
    const source = this.readEnvelope(CACHE_KEY);
    if (source === null) {
      return null;
    }
    const records = coerceRecordMap(source['records']);
    if (records.size === 0) {
      return null;
    }
    return {
      version: CACHE_VERSION,
      fetchedAt: source['fetchedAt'] as number,
      records: Object.fromEntries(records),
    };
  }

  private readTextCache(): CachedTextReference | null {
    const source = this.readEnvelope(TEXT_CACHE_KEY);
    if (source === null) {
      return null;
    }
    const records = coerceTextRecordMap(source['records']);
    if (records.size === 0) {
      return null;
    }
    return {
      version: CACHE_VERSION,
      fetchedAt: source['fetchedAt'] as number,
      records: Object.fromEntries(records),
    };
  }

  private readPendingCache(): CachedReference | null {
    const source = this.readEnvelope(PENDING_CACHE_KEY);
    if (source === null || typeof source['records'] !== 'object') {
      return null;
    }
    const records = coerceRecordMap(source['records']);
    return {
      version: CACHE_VERSION,
      fetchedAt: source['fetchedAt'] as number,
      records: Object.fromEntries(records),
    };
  }

  private now(): number {
    return Date.now();
  }
}
