import { GLOSSARY_TERMS } from '../services/glossary.service';
import { settingEntry } from '../content/settings';

/**
 * One piece of a translated body, in the order it is read.
 *
 * Prose is cut into these rather than handed to the DOM as markup: a body can
 * carry an interpolated prompt somebody typed, and a string that is parsed into
 * elements is a string that can grow elements nobody wrote.
 */
export type ProseRun =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'term'; readonly text: string; readonly termId: string }
  | { readonly kind: 'setting'; readonly settingId: string };

/**
 * The grammar, in one expression:
 *
 * - `[[gl:term_id|shown text]]` names a dictionary word and what to call it
 *   here, because the sentence rarely wants the word in the shape the
 *   dictionary files it under.
 * - `[[set:setting_id]]` names a setting, and nothing else: the chip says what
 *   the setting is called, so a body that also spelled the name would say it
 *   twice.
 * - Paired backticks quote a literal: a prompt fragment, a value, an API field.
 *
 * The alternation is deliberate. Anything that does not match one of these
 * whole is text, so a sentence about `[[` or about a lone backtick reads as
 * itself.
 */
const TOKEN = /\[\[(gl|set):([a-z0-9_]+)(?:\|([^\]|]*))?\]\]|`([^`\n]+)`/g;

const TERM_IDS = new Set(GLOSSARY_TERMS.map((term) => term.id));

/**
 * Whether a token names something the app actually has.
 *
 * A token that names a word not in the dictionary, or a setting the studio does
 * not know, is left as the text it was written as. The alternative is a chip
 * reading "this" or a button that opens an empty modal, and a reader is better
 * served by the plain sentence than by a control that does nothing.
 */
function known(kind: string, id: string): boolean {
  return kind === 'gl' ? TERM_IDS.has(id) : settingEntry(id) !== undefined;
}

/**
 * A translated body cut into its runs.
 *
 * Runs of plain text arrive merged, so a body with no tokens in it is a single
 * run and renders as the one string it was written as.
 */
export function tokenizeProse(source: string): ProseRun[] {
  const runs: ProseRun[] = [];
  let plain = '';

  const flush = (): void => {
    if (plain !== '') {
      runs.push({ kind: 'text', text: plain });
      plain = '';
    }
  };

  TOKEN.lastIndex = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN.exec(source)) !== null) {
    const [whole, kind, id, shown, code] = match;
    plain += source.slice(cursor, match.index);
    cursor = match.index + whole.length;

    if (code !== undefined) {
      flush();
      runs.push({ kind: 'code', text: code });
      continue;
    }
    if (!known(kind, id)) {
      plain += whole;
      continue;
    }
    if (kind === 'gl') {
      // A word with nothing to show would have to borrow its title from the
      // dictionary, and the dictionary's phrasing is a heading rather than a
      // clause. The author names it or it stays text.
      if (shown === undefined || shown.trim() === '') {
        plain += whole;
        continue;
      }
      flush();
      runs.push({ kind: 'term', text: shown, termId: id });
      continue;
    }
    // A setting chip carries the name itself, so a shown half is a
    // contradiction rather than an override.
    if (shown !== undefined) {
      plain += whole;
      continue;
    }
    flush();
    runs.push({ kind: 'setting', settingId: id });
  }

  plain += source.slice(cursor);
  flush();
  return runs;
}

/**
 * One block of a body: a paragraph, or a bulleted list of items.
 *
 * Both hold source text still to be cut into runs, so a list item carries the
 * same marks a paragraph does.
 */
export type ProseBlock =
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'list'; readonly items: readonly string[] };

const LIST_ITEM = /^[ \t]*-[ \t]+(.*)$/;

/**
 * The body cut into blocks. Blank lines separate blocks, and within a block a
 * run of lines each starting with `- ` is a list; lines before or after such a
 * run are their own paragraphs, so an intro line and its bullets can share one
 * block.
 *
 * Long teaching bodies read as walls of text when they are one paragraph, and
 * a reader skimming for the one thing they need cannot find it. Paragraphs and
 * bullets are the two shapes that fix that without asking the translator to
 * write markup, and they are the only block marks the grammar has.
 */
export function splitProseBlocks(source: string): ProseBlock[] {
  const blocks: ProseBlock[] = [];
  for (const chunk of source.split(/\n[ \t]*\n/)) {
    let paragraph: string[] = [];
    let items: string[] = [];
    const flushParagraph = (): void => {
      const text = paragraph.join('\n').trim();
      if (text !== '') blocks.push({ kind: 'paragraph', text });
      paragraph = [];
    };
    const flushList = (): void => {
      if (items.length > 0) blocks.push({ kind: 'list', items });
      items = [];
    };
    for (const line of chunk.split('\n')) {
      const item = LIST_ITEM.exec(line);
      if (item) {
        flushParagraph();
        items.push(item[1].trim());
      } else {
        flushList();
        paragraph.push(line);
      }
    }
    flushParagraph();
    flushList();
  }
  return blocks;
}

/**
 * The stand-in a parameter is translated as, so its value cannot become syntax.
 *
 * Bodies interpolate values the reader supplied: a prompt, a model name, a
 * seed. Those are put back after the string has been cut into runs, which is
 * what makes a prompt containing a bracket pair or a stray backtick read as the
 * characters someone typed rather than as a control the page grew.
 */
const MARK = String.fromCharCode(0);

/** One stand-in per parameter, keyed the way the translation names them. */
export function proseParamSentinels(
  names: readonly string[],
): Record<string, string> {
  const sentinels: Record<string, string> = {};
  names.forEach((name, index) => {
    sentinels[name] = `${MARK}${index}${MARK}`;
  });
  return sentinels;
}

const SENTINEL = new RegExp(`${MARK}(\\d+)${MARK}`, 'g');

/** The values back in their places, as text and only as text. */
export function restoreProseParams(
  text: string,
  values: readonly string[],
): string {
  return text.replace(SENTINEL, (whole, index: string) => {
    const value = values[Number(index)];
    return value === undefined ? whole : value;
  });
}
