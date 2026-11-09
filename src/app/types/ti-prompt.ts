import type {
  LoraSelection,
  TiInjectTarget,
  TiSelection,
} from './civitai-asset';
export type PromptInsertion =
  | string
  | {
      text: string;
      target: TiInjectTarget;
      ti?: TiSelection;
      lora?: LoraSelection;
      previousLoraName?: string;
    };
export function tiReference(name: string, strength?: number): string {
  return strength === undefined
    ? `embedding:${name}`
    : `(embedding:${name}:${strength})`;
}
export function tiReferences(prompt: string): string[] {
  return [...prompt.matchAll(/(?:^|[\s(])embedding:([^\s(),:;[\]{}]+)/g)].map(
    (match) => (match[1] ?? '').replace(/\.(?:safetensors|pt|bin)$/i, ''),
  );
}
/** One written use of a TI's trigger, located so its weight can be rewritten. */
export interface TiWeightSite {
  start: number;
  end: number;
  weight: number;
  extension: string;
}

/**
 * The places `name` is written in `prompt`, with the weight each one applies.
 * Matches the same boundaries as {@link tiReferences}. A trigger in its own
 * parentheses without a number is weighted 1.1, as the prompt syntax reads
 * any parenthesised text.
 */
export function tiWeightSites(prompt: string, name: string): TiWeightSite[] {
  const id = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ext = '(\\.(?:safetensors|pt|bin))?';
  const end = '(?![^\\s(),:;[\\]{}])';
  const pattern = new RegExp(
    `\\(embedding:${id}${ext}${end}(?::(-?\\d*\\.?\\d+))?\\)|(?<=^|[\\s(])embedding:${id}${ext}${end}`,
    'g',
  );
  return [...prompt.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    weight:
      match[2] !== undefined
        ? Number(match[2])
        : match[0].startsWith('(')
          ? 1.1
          : 1,
    extension: match[1] ?? match[3] ?? '',
  }));
}

/** Rewrites one site found by {@link tiWeightSites} with an explicit weight. */
export function setTiWeight(
  prompt: string,
  name: string,
  site: TiWeightSite,
  weight: number,
): string {
  return (
    prompt.slice(0, site.start) +
    `(embedding:${name}${site.extension}:${Number(weight.toFixed(2))})` +
    prompt.slice(site.end)
  );
}

/**
 * Whether a trigger word is written in `prompt`. The worker sends the whole
 * prompt to the text encoder and does not look for triggers, so a trigger
 * applies wherever it appears, inside a longer phrase or parentheses too.
 * Text joined to the word encodes as different tokens, hence the word
 * boundaries.
 */
export function promptHasWord(prompt: string, word: string): boolean {
  return findPromptWord(prompt, word) !== null;
}

/** A span of one prompt half, for a host to scroll to and select. */
export interface PromptRange {
  target: TiInjectTarget;
  start: number;
  end: number;
}

function wordPattern(word: string): string | null {
  const text = word.trim();
  if (!text) return null;
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`;
}

/** The first whole-word occurrence of `word`, by the rule of {@link promptHasWord}. */
export function findPromptWord(
  prompt: string,
  word: string,
): { start: number; end: number } | null {
  return findPromptWords(prompt, word)[0] ?? null;
}

/**
 * Every whole-word occurrence of `word`. Trigger words are often common words,
 * so some occurrences can belong to the user's own phrases.
 */
export function findPromptWords(
  prompt: string,
  word: string,
): { start: number; end: number }[] {
  const pattern = wordPattern(word);
  if (!pattern) return [];
  return [...prompt.matchAll(new RegExp(pattern, 'giu'))].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/**
 * Removes every whole-word occurrence of `word`, with the weight group around
 * it when the group holds nothing else, then tidies the commas and spaces
 * left behind.
 */
export function removePromptWord(prompt: string, word: string): string {
  const pattern = wordPattern(word);
  if (!pattern) return prompt;
  return prompt
    .replace(
      new RegExp(`\\(\\s*${pattern}\\s*(?::\\s*-?\\d*\\.?\\d+)?\\s*\\)`, 'giu'),
      '',
    )
    .replace(new RegExp(pattern, 'giu'), '')
    .replace(/\(\s*\)/g, '')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+,/g, ',')
    .replace(/,(\s*,)+/g, ',')
    .replace(/^[\s,]+|[\s,]+$/g, '');
}

/**
 * Removes comma-separated entries that are exactly `word`. Returns null when
 * there is no such entry.
 */
export function removePromptEntry(prompt: string, word: string): string | null {
  const target = word.trim().toLowerCase();
  const parts = prompt.split(',');
  const kept = parts.filter((part) => part.trim().toLowerCase() !== target);
  if (kept.length === parts.length) return null;
  return kept.join(',').replace(/^\s+/, '');
}

export function insertPromptReference(current: string, text: string): string {
  if (current.split(',').some((part) => part.trim() === text.trim()))
    return current;
  const refs = tiReferences(text);
  if (refs.length && refs.every((id) => tiReferences(current).includes(id)))
    return current;
  return current.trim() ? `${current.trimEnd()}, ${text}` : text;
}
/** The delimiter defines the negative half independently of placeholders. */
export function insertStyleReference(
  current: string,
  text: string,
  target: TiInjectTarget,
): string {
  const marker = current.indexOf('###');
  const positive = marker < 0 ? current : current.slice(0, marker).trimEnd();
  const negative = marker < 0 ? '' : current.slice(marker + 3).trimStart();
  if (target === 'negprompt')
    return `${positive} ### ${insertPromptReference(negative, text)}`;
  return `${insertPromptReference(positive, text)}${marker < 0 ? '' : ` ### ${negative}`}`;
}

/** Replacing in place preserves which entries fall inside the request cap. */
export function selectManualTi(
  selections: readonly TiSelection[],
  entry: TiSelection,
): TiSelection[] {
  const manual = { ...entry };
  delete manual.inject_ti;
  return selections.some((ti) => ti.name === entry.name)
    ? selections.map((ti) => (ti.name === entry.name ? manual : ti))
    : [...selections, manual];
}

export interface AssetPrompts {
  prompt: string;
  negativePrompt: string;
  template?: boolean;
}
export interface PromptEdit {
  target: TiInjectTarget;
  text: string;
}

/** An insertion changes placement without moving a selected LoRA past the request cap. */
export function selectManualLora(
  selections: readonly LoraSelection[],
  entry: LoraSelection,
  previousName?: string,
): LoraSelection[] {
  const manual = { ...entry };
  delete manual.inject_trigger;
  const index = selections.findIndex(
    (lora) => lora.name === (previousName ?? entry.name),
  );
  return index < 0
    ? [...selections, manual]
    : selections.map((lora, i) => (i === index ? manual : lora));
}
