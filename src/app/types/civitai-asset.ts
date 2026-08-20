import type { StyleLoraConfig, StyleTextualInversionConfig } from './style';

/**
 * The LoRA and textual-inversion selections the studio and the style editor
 * both edit, and the rules the horde enforces on them.
 *
 * This lives apart from the studio's form model so one picker can serve both
 * surfaces: a style editor that imported the generate form model to add a LoRA
 * would drag the entire request builder along with it.
 */

/** Which resource kind a selection is; maps to a CivitAI model type. */
export type CivitaiAssetKind = 'lora' | 'ti';

/**
 * Where a selection came from. Absent means CivitAI, so nothing already stored
 * needs rewriting and the coercer needs no branch for it.
 */
export type CivitaiAssetOrigin = 'civitai' | 'manual';

/** Most LoRAs a single generation may carry; the horde refuses a sixth. */
export const HORDE_MAX_LORAS = 5;

/** Most textual inversions a single generation may carry. */
export const HORDE_MAX_TIS = 20;

/** The horde's schema bound on `inject_trigger`. */
export const MAX_INJECT_TRIGGER_LENGTH = 30;

/** The horde's schema bound on an asset `name`. */
export const MAX_ASSET_NAME_LENGTH = 255;

/** The `inject_trigger` wildcard: let the horde pick the first trigger. */
export const INJECT_TRIGGER_ANY = 'any';

export const MIN_LORA_STRENGTH = -5;
export const MAX_LORA_STRENGTH = 5;
export const DEFAULT_LORA_STRENGTH = 1;

/** Where the horde may auto-inject a textual inversion trigger. */
export const TI_INJECT_TARGETS = ['prompt', 'negprompt'] as const;
export type TiInjectTarget = (typeof TI_INJECT_TARGETS)[number];

/**
 * Everything a selection remembers for the reader's benefit. None of it is ever
 * submitted: the horde is told an identifier and a strength, and the rest is
 * what stops the panel showing a bare number.
 */
export interface CivitaiAssetDisplay {
  origin?: CivitaiAssetOrigin;
  /** The model's name on CivitAI. */
  label?: string;
  /** The pinned version's own name, for example "v2.0". */
  versionLabel?: string;
  /** The CivitAI base-model label the version was published for. */
  baseModel?: string;
  thumbnailUrl?: string;
  /** The model page a pinned version belongs to, for the detail panel. */
  modelId?: number;
  /** The version's trigger words, so a card can offer them without a fetch. */
  triggerWords?: readonly string[];
}

/**
 * A persisted LoRA selection. `name` is the horde LoRA identifier: an exact
 * name or CivitAI model-page ID, or a CivitAI version ID when `is_version` is
 * set. `model` and `clip` are strengths in the -5..5 range.
 */
export interface LoraSelection extends CivitaiAssetDisplay {
  name: string;
  model: number;
  clip: number;
  inject_trigger?: string;
  is_version?: boolean;
  /** Style editor only; a generation request never carries this. */
  sha256?: string;
}

/**
 * A persisted textual-inversion selection. `strength` is in the -5..5 range;
 * `inject_ti` asks the horde to add the embedding to the given prompt half.
 *
 * A textual inversion has no version pin: the horde's payload carries no
 * `is_version` field, so `name` is always a model-page ID or an exact name.
 */
export interface TiSelection extends CivitaiAssetDisplay {
  name: string;
  strength: number;
  inject_ti?: TiInjectTarget;
}

function clampStrength(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(MAX_LORA_STRENGTH, Math.max(MIN_LORA_STRENGTH, value));
  }
  return DEFAULT_LORA_STRENGTH;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** Whether an identifier is a CivitAI numeric id rather than a horde asset name. */
export function isNumericAssetId(name: string): boolean {
  return /^\d+$/.test(name);
}

function readDisplay(source: Record<string, unknown>): CivitaiAssetDisplay {
  const display: CivitaiAssetDisplay = {};
  if (source['origin'] === 'manual') {
    display.origin = 'manual';
  }
  const label = readString(source['label']);
  if (label) {
    display.label = label;
  }
  const versionLabel = readString(source['versionLabel']);
  if (versionLabel) {
    display.versionLabel = versionLabel;
  }
  const baseModel = readString(source['baseModel']);
  if (baseModel) {
    display.baseModel = baseModel;
  }
  const thumbnailUrl = readString(source['thumbnailUrl']);
  if (thumbnailUrl) {
    display.thumbnailUrl = thumbnailUrl;
  }
  const modelId = source['modelId'];
  if (typeof modelId === 'number' && Number.isFinite(modelId)) {
    display.modelId = modelId;
  }
  const triggerWords = source['triggerWords'];
  if (Array.isArray(triggerWords)) {
    const words = triggerWords.filter(
      (word): word is string => typeof word === 'string',
    );
    if (words.length > 0) {
      display.triggerWords = words;
    }
  }
  return display;
}

/** Validate one persisted LoRA selection, returning null if it is malformed. */
export function coerceLoraSelection(raw: unknown): LoraSelection | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const name = readString(source['name'])?.slice(0, MAX_ASSET_NAME_LENGTH);
  if (!name) {
    return null;
  }
  const entry: LoraSelection = {
    ...readDisplay(source),
    name,
    model: clampStrength(source['model']),
    clip: clampStrength(source['clip']),
  };
  const trigger = readString(source['inject_trigger']);
  // A longer trigger is refused by the schema outright, so keeping it would
  // trade a missing trigger for a rejected request.
  if (trigger && trigger.length <= MAX_INJECT_TRIGGER_LENGTH) {
    entry.inject_trigger = trigger;
  }
  // The horde refuses `is_version` on a non-numeric name. The flag is what is
  // wrong in that pairing, not the name, so the flag is dropped rather than the
  // whole entry.
  if (source['is_version'] === true && isNumericAssetId(name)) {
    entry.is_version = true;
  }
  const sha256 = readString(source['sha256']);
  if (sha256 && /^[0-9a-fA-F]{64}$/.test(sha256)) {
    entry.sha256 = sha256;
  }
  return entry;
}

/** Validate one persisted textual-inversion selection, or null if malformed. */
export function coerceTiSelection(raw: unknown): TiSelection | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const name = readString(source['name'])?.slice(0, MAX_ASSET_NAME_LENGTH);
  if (!name) {
    return null;
  }
  const entry: TiSelection = {
    ...readDisplay(source),
    name,
    strength: clampStrength(source['strength']),
  };
  if (
    (TI_INJECT_TARGETS as readonly string[]).includes(
      source['inject_ti'] as string,
    )
  ) {
    entry.inject_ti = source['inject_ti'] as TiInjectTarget;
  }
  return entry;
}

/** Build a hand-entered LoRA selection, validated like any other. */
export function manualLoraSelection(input: {
  name: string;
  isVersion?: boolean;
  model?: number;
  clip?: number;
  injectTrigger?: string;
}): LoraSelection | null {
  return coerceLoraSelection({
    origin: 'manual',
    name: input.name.trim(),
    model: input.model ?? DEFAULT_LORA_STRENGTH,
    clip: input.clip ?? DEFAULT_LORA_STRENGTH,
    is_version: input.isVersion === true,
    inject_trigger: input.injectTrigger,
  });
}

/** Build a hand-entered textual-inversion selection, validated like any other. */
export function manualTiSelection(input: {
  name: string;
  strength?: number;
  injectTi?: TiInjectTarget;
}): TiSelection | null {
  return coerceTiSelection({
    origin: 'manual',
    name: input.name.trim(),
    strength: input.strength ?? DEFAULT_LORA_STRENGTH,
    inject_ti: input.injectTi,
  });
}

/**
 * What the horde is told a LoRA is. A hand-typed id and a picked version id
 * naming the same asset are one selection to the horde, so `origin` is not part
 * of it: letting both stand would spend two of the five slots on one LoRA.
 */
function loraIdentity(entry: LoraSelection): string {
  return `${entry.is_version === true}:${entry.name}`;
}

function takeUnique<T>(
  entries: readonly T[],
  identity: (entry: T) => string,
  limit: number,
): readonly T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const entry of entries) {
    const key = identity(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    kept.push(entry);
    if (kept.length === limit) {
      break;
    }
  }
  return kept;
}

/**
 * The LoRAs a generation actually carries: de-duplicated, then capped.
 *
 * Every reader of "which ones count" goes through here — the request builder,
 * the inactive rows, the kudos line and the warnings — because the moment two of
 * them work it out separately they disagree, and the panel starts promising
 * something the request does not do. De-duplication runs first so a repeated
 * selection never spends one of the five slots.
 */
export function activeLoras(
  entries: readonly LoraSelection[],
): readonly LoraSelection[] {
  return takeUnique(entries, loraIdentity, HORDE_MAX_LORAS);
}

/** The textual inversions a generation carries; see {@link activeLoras}. */
export function activeTis(
  entries: readonly TiSelection[],
): readonly TiSelection[] {
  return takeUnique(entries, (entry) => entry.name, HORDE_MAX_TIS);
}

/**
 * The fields {@link pickDefaultVersion} reads. Declared structurally so this
 * module stays a leaf: the CivitAI service's richer version type satisfies it
 * without this file importing the service.
 */
export interface VersionCandidate {
  id: number;
  baseModel?: string;
  /** ISO 8601 publish date; the ordering key for "newest". */
  publishedAt?: string | null;
  /** CivitAI's own position in the model's version list; 0 is newest. */
  index?: number | null;
  availability?: string | null;
  paidAccess?: boolean;
}

/** Whether a worker could actually download this version's file. */
function isFetchable(version: VersionCandidate): boolean {
  const availability = version.availability ?? null;
  return (
    version.paidAccess !== true &&
    (availability === null || availability === 'Public')
  );
}

function newestFirst(a: VersionCandidate, b: VersionCandidate): number {
  const aDate = Date.parse(a.publishedAt ?? '');
  const bDate = Date.parse(b.publishedAt ?? '');
  if (!Number.isNaN(aDate) && !Number.isNaN(bDate) && aDate !== bDate) {
    return bDate - aDate;
  }
  const aIndex = a.index ?? Number.MAX_SAFE_INTEGER;
  const bIndex = b.index ?? Number.MAX_SAFE_INTEGER;
  return aIndex !== bIndex ? aIndex - bIndex : b.id - a.id;
}

/**
 * The version to pin when a model is picked: the newest one a worker can fetch
 * and the selected model can load, falling back a step at a time rather than
 * refusing. A pin is always better than none, because leaving the choice to the
 * horde means the request quietly changes meaning when the author publishes an
 * update.
 */
export function pickDefaultVersion<T extends VersionCandidate>(
  versions: readonly T[],
  suits: (baseModel: string | undefined) => boolean,
): T | null {
  if (versions.length === 0) {
    return null;
  }
  const sorted = [...versions].sort(newestFirst);
  const fetchable = sorted.filter(isFetchable);
  return (
    fetchable.find((version) => suits(version.baseModel)) ??
    fetchable[0] ??
    sorted.find((version) => suits(version.baseModel)) ??
    sorted[0] ??
    null
  );
}

// --- Style-editor adapters -------------------------------------------------
//
// A style stores the same two shapes the horde accepts, so the only difference
// is which fields survive the trip. `sha256` is the one asymmetry: a style may
// pin a LoRA to a file hash, and a generation request never does.

export function loraConfigToSelection(config: StyleLoraConfig): LoraSelection {
  return (
    coerceLoraSelection(config) ?? {
      name: config.name,
      model: DEFAULT_LORA_STRENGTH,
      clip: DEFAULT_LORA_STRENGTH,
    }
  );
}

/** Unlike the studio's mapper, this keeps `sha256`: a style may pin a hash. */
export function selectionToLoraConfig(entry: LoraSelection): StyleLoraConfig {
  const config: StyleLoraConfig = {
    name: entry.name,
    model: entry.model,
    clip: entry.clip,
  };
  if (entry.inject_trigger) {
    config.inject_trigger = entry.inject_trigger;
  }
  if (entry.is_version) {
    config.is_version = entry.is_version;
  }
  if (entry.sha256) {
    config.sha256 = entry.sha256;
  }
  return config;
}

export function tiConfigToSelection(
  config: StyleTextualInversionConfig,
): TiSelection {
  return (
    coerceTiSelection(config) ?? {
      name: config.name,
      strength: DEFAULT_LORA_STRENGTH,
    }
  );
}

export function selectionToTiConfig(
  entry: TiSelection,
): StyleTextualInversionConfig {
  const config: StyleTextualInversionConfig = {
    name: entry.name,
    strength: entry.strength,
  };
  if (entry.inject_ti) {
    config.inject_ti = entry.inject_ti;
  }
  return config;
}
