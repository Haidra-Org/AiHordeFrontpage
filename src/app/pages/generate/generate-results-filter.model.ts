import { splitCombinedPrompt } from './generate-form.model';

/**
 * The search over the results grid: a typed query cut into terms, and the
 * filters a term can be aimed at with `key:value`.
 *
 * Each filter is a definition in `RESULT_FILTERS`. A filter over another
 * setting (sampler, size, seed) is one more definition here; the parser learns
 * its key from the list, and the grid keeps asking `matchesResultQuery` whether
 * a tile stays, so the tile pipeline in the results panel does not change.
 *
 * A key the list does not know is read as part of an ordinary term, because a
 * colon is ordinary prompt text ("style: watercolor") and a reader searching
 * for it should find it rather than find nothing.
 *
 * Everything here is plain functions over plain data, so the matching can be
 * tested without building the panel.
 */

/**
 * The parts of a results tile a search reads. Declared here rather than taken
 * from the panel's tile type so this file stays independent of the component.
 */
export interface ResultQuerySubject {
  /** The positive prompt, which a tile adopted from elsewhere may carry alone. */
  prompt?: string;
  /** The model a finished image reports it was made with. */
  model?: string;
  /** The request as submitted: the combined prompt and the models asked for. */
  request?: { prompt: string; models?: string[] };
}

/** One filter a `key:value` term can be aimed at. */
export interface ResultFilterDefinition {
  /** What the reader types before the colon. Lowercase. */
  key: string;
  /** Whether the tile passes for a term that is already lowercase. */
  matches(tile: ResultQuerySubject, term: string): boolean;
}

/** One term of a parsed query; `key` is null for a term aimed at no filter. */
export interface ResultQueryTerm {
  key: string | null;
  value: string;
}

export type ParsedResultQuery = readonly ResultQueryTerm[];

function positiveOf(tile: ResultQuerySubject): string {
  if (tile.prompt !== undefined) {
    return tile.prompt;
  }
  return tile.request ? splitCombinedPrompt(tile.request.prompt)[0] : '';
}

function negativeOf(tile: ResultQuerySubject): string {
  return tile.request ? splitCombinedPrompt(tile.request.prompt)[1] : '';
}

function contains(haystack: string | undefined, term: string): boolean {
  return !!haystack && haystack.toLowerCase().includes(term);
}

export const RESULT_FILTERS: readonly ResultFilterDefinition[] = [
  {
    key: 'prompt',
    matches: (tile, term) => contains(positiveOf(tile), term),
  },
  {
    key: 'negative',
    matches: (tile, term) => contains(negativeOf(tile), term),
  },
  {
    // An adopted tile has no request behind it, so the model the image
    // reports is the only one there is to match.
    key: 'model',
    matches: (tile, term) =>
      contains(tile.model, term) ||
      (tile.request?.models ?? []).some((model) => contains(model, term)),
  },
];

/**
 * The places a keyed term can look, written the way a reader types them
 * (`prompt:`), so the hint that lists them follows the registry.
 */
export const RESULT_FILTER_PLACES: readonly string[] = RESULT_FILTERS.map(
  (filter) => `${filter.key}:`,
);

const FILTERS_BY_KEY = new Map(
  RESULT_FILTERS.map((filter) => [filter.key, filter]),
);

/**
 * Read one whitespace-delimited token starting at `start`. A double quote opens
 * a run that whitespace does not end, so `"red fox"` and `prompt:"red fox"`
 * each stay one token; the quotes themselves are dropped. An unclosed quote
 * runs to the end, which is where the caret is while the reader is typing it.
 */
function readToken(text: string, start: number): [string, number] {
  let out = '';
  let at = start;
  while (at < text.length && !/\s/.test(text.charAt(at))) {
    if (text.charAt(at) === '"') {
      const close = text.indexOf('"', at + 1);
      const end = close === -1 ? text.length : close;
      out += text.slice(at + 1, end);
      at = close === -1 ? text.length : close + 1;
    } else {
      out += text.charAt(at);
      at += 1;
    }
  }
  return [out, at];
}

/**
 * Cut a query into terms. Bare words and quoted phrases become unkeyed terms;
 * `key:value` becomes a keyed term when `key` is a registered filter. A known
 * key with nothing after it yet adds no term, so the grid does not empty while
 * the reader is still typing the value. Values are lowercased here, once.
 */
export function parseResultQuery(text: string): ParsedResultQuery {
  const terms: ResultQueryTerm[] = [];
  let at = 0;
  while (at < text.length) {
    if (/\s/.test(text.charAt(at))) {
      at += 1;
      continue;
    }
    // A token that opens with a quote is a phrase even if it holds a colon.
    const quoted = text.charAt(at) === '"';
    const [token, next] = readToken(text, at);
    at = next;
    const raw = token.trim().toLowerCase();
    if (!quoted) {
      const colon = token.indexOf(':');
      const key = colon > 0 ? token.slice(0, colon).toLowerCase() : '';
      if (FILTERS_BY_KEY.has(key)) {
        const value = token
          .slice(colon + 1)
          .trim()
          .toLowerCase();
        if (value) {
          terms.push({ key, value });
        }
        continue;
      }
    }
    if (raw) {
      terms.push({ key: null, value: raw });
    }
  }
  return terms;
}

/**
 * Whether a tile passes every term. An unkeyed term looks in both halves of
 * the prompt; a keyed term looks only where its filter does. An empty query
 * passes everything.
 */
export function matchesResultQuery(
  tile: ResultQuerySubject,
  query: ParsedResultQuery,
): boolean {
  return query.every((term) => {
    if (term.key === null) {
      return (
        contains(positiveOf(tile), term.value) ||
        contains(negativeOf(tile), term.value)
      );
    }
    return FILTERS_BY_KEY.get(term.key)?.matches(tile, term.value) ?? false;
  });
}
