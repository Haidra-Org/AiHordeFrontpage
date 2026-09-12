/**
 * How well one phrase of a prompt turned up in what the picture was read as.
 *
 * `partly` is its own answer rather than a rounded-down `missing`: a phrase of
 * several words that lands half of them is a different thing to one that lands
 * none, and the reader is asked to act on them differently.
 */
export type PromptPhraseState = 'found' | 'partly' | 'missing';

/** One comma-separated phrase of the prompt, against the reading. */
export interface PromptPhraseCheck {
  /** The phrase as it stands in the prompt, stripped of weighting syntax. */
  text: string;
  state: PromptPhraseState;
  /** The words of the reading that answered for it, in the order they matched. */
  matchedBy: string[];
}

/** The whole comparison, as the panel draws it. */
export interface PromptCheckReport {
  phrases: PromptPhraseCheck[];
  /** Tags the picture was read as that nothing in the prompt asked for. */
  extra: string[];
  counts: { found: number; partly: number; missing: number };
}

/** What a picture was read as: alchemy's caption and its strongest tags. */
export interface PromptCheckReading {
  caption: string | null;
  tags: string | null;
}

/**
 * Words that carry no picture of their own. Dropping them keeps "a cat under a
 * red umbrella" a question about cats, red and umbrellas, so a caption that
 * words the same scene differently still answers it.
 */
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'onto',
  'or',
  'over',
  'the',
  'their',
  'there',
  'this',
  'to',
  'under',
  'up',
  'very',
  'with',
  'within',
  'without',
]);

/** Where the prompt stops and the negative prompt begins. */
const NEGATIVE_MARKER = '###';

/**
 * A phrase without the syntax that only tells the sampler how hard to push:
 * weighting brackets and their numbers, LoRA and embedding references, and the
 * stray operators a prompt picks up between them.
 */
export function stripPromptSyntax(phrase: string): string {
  return phrase
    .replace(/<[^>]*>/g, ' ')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/:\s*-?\d+(\.\d+)?/g, ' ')
    .replace(/[+|]/g, ' ')
    .replace(/(^|\s)-(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A word reduced to the part two forms of it share. It is deliberately blunt:
 * the comparison is between a prompt and a caption written by two different
 * models, so "umbrellas" answering "umbrella" matters more than the handful of
 * words a light stem runs together.
 */
export function stemWord(word: string): string {
  const lower = word.toLowerCase();
  if (lower.endsWith('ies') && lower.length > 4) {
    return `${lower.slice(0, -3)}y`;
  }
  let stem = lower;
  if (stem.endsWith('s') && !stem.endsWith('ss') && stem.length > 3) {
    stem = stem.slice(0, -1);
  }
  // A trailing e goes whether or not a plural just left, so the two spellings
  // of one word meet: "houses" reaches "hous" by way of "house", and "house"
  // reaches it directly. Stemming the plural alone would leave them apart.
  if (stem.endsWith('e') && stem.length > 3) {
    stem = stem.slice(0, -1);
  }
  if (stem.endsWith('ing') && stem.length - 3 >= 4) {
    return stem.slice(0, -3);
  }
  if (stem.endsWith('ed') && stem.length - 2 >= 4) {
    return stem.slice(0, -2);
  }
  return stem;
}

/** The words of a piece of text that say something, lowercased and stemmed. */
function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .map((word) => word.replace(/^'+|'+$/g, ''))
    .filter((word) => word.length > 0)
    .filter((word) => !STOPWORDS.has(word))
    .filter((word) => !/^\d+$/.test(word));
}

/**
 * The tags as written, one per entry, without the confidence a reading puts on
 * each of them. The number is how sure the reader was, which says nothing about
 * whether the prompt asked for it.
 */
export function splitTags(tags: string | null): string[] {
  if (!tags) return [];
  return tags
    .split(',')
    .map((tag) => tag.replace(/:\s*-?\d+(\.\d+)?\s*$/, '').trim())
    .filter((tag) => tag.length > 0);
}

/** The phrases of a prompt, with the negative half and the syntax taken off. */
export function promptPhrases(prompt: string): string[] {
  const positive = prompt.split(NEGATIVE_MARKER)[0] ?? '';
  return positive
    .split(',')
    .map((phrase) => stripPromptSyntax(phrase))
    .filter((phrase) => phrase.length > 0);
}

/** Where an emphasis starts, how far each press moves it, and where it stops. */
const EMPHASIS_START = 1.2;
const EMPHASIS_STEP = 0.1;
const EMPHASIS_MAX = 1.5;

/** The phrase as a pattern that matches it and nothing longer. */
function phrasePattern(phrase: string, flags: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\w])(${escaped})(?![\\w])`, flags);
}

/** A weight as a prompt writes it: one decimal place, no trailing zero fuss. */
function formatWeight(weight: number): string {
  return (Math.round(weight * 10) / 10).toFixed(1);
}

/**
 * Push the sampler harder on one phrase of a prompt.
 *
 * A phrase that is already weighted moves up a step, to a ceiling past which
 * the weighting starts to cost the rest of the picture. One that is in the
 * prompt unweighted is wrapped. One that is not there at all is added, because
 * a phrase the reader asked to emphasise is a phrase they want in the picture.
 */
export function emphasizePhrase(prompt: string, phrase: string): string {
  const text = phrase.trim();
  if (!text) return prompt;
  const cut = prompt.indexOf(NEGATIVE_MARKER);
  const positive = cut === -1 ? prompt : prompt.slice(0, cut);
  const rest = cut === -1 ? '' : prompt.slice(cut);

  const weighted = new RegExp(
    `\\(\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*(\\d+(?:\\.\\d+)?)\\s*\\)`,
    'i',
  );
  const found = weighted.exec(positive);
  if (found) {
    const current = Number.parseFloat(found[1] ?? '1');
    const raised = Math.min(EMPHASIS_MAX, current + EMPHASIS_STEP);
    return `${positive.replace(weighted, `(${text}:${formatWeight(raised)})`)}${rest}`;
  }

  const plain = phrasePattern(text, 'i');
  if (plain.test(positive)) {
    return `${positive.replace(plain, (_match, before: string) => `${before}(${text}:${formatWeight(EMPHASIS_START)})`)}${rest}`;
  }

  const trimmed = positive.trimEnd();
  const separator = trimmed.length === 0 ? '' : ', ';
  const spacer = rest && !trimmed.endsWith(' ') ? ' ' : '';
  return `${trimmed}${separator}(${text}:${formatWeight(EMPHASIS_START)})${spacer}${rest}`;
}

/**
 * Whether the negative prompt already names something, comparing the phrases
 * either side rather than the letters, so "blurry" is not added twice because
 * the spacing differs.
 */
export function negativeHasPhrase(negative: string, phrase: string): boolean {
  const wanted = phrase.trim().toLowerCase();
  if (!wanted) return true;
  return negative
    .split(',')
    .map((part) => stripPromptSyntax(part).toLowerCase())
    .includes(wanted);
}

/**
 * Compare a prompt with what the finished picture was read as.
 *
 * Both sides are reduced to stems before they meet, so the comparison is about
 * what was asked for rather than how either side spelled it. Nothing here is
 * stored: the report is built from the prompt and the reading every time the
 * block is drawn, so an edited prompt is answered against the same reading
 * without paying for another one.
 */
export function buildPromptCheck(
  prompt: string,
  reading: PromptCheckReading,
): PromptCheckReport {
  const tagList = splitTags(reading.tags);
  const readingWords = [
    ...contentWords(reading.caption ?? ''),
    ...tagList.flatMap((tag) => contentWords(tag)),
  ];
  const readingStems = new Map<string, string>();
  for (const word of readingWords) {
    const stem = stemWord(word);
    if (!readingStems.has(stem)) readingStems.set(stem, word);
  }

  const phrases: PromptPhraseCheck[] = [];
  const promptStems = new Set<string>();
  for (const text of promptPhrases(prompt)) {
    const words = contentWords(text);
    if (words.length === 0) continue;
    const matchedBy: string[] = [];
    let hits = 0;
    for (const word of words) {
      const stem = stemWord(word);
      promptStems.add(stem);
      const match = readingStems.get(stem);
      if (match === undefined) continue;
      hits += 1;
      if (!matchedBy.includes(match)) matchedBy.push(match);
    }
    const state: PromptPhraseState =
      hits === words.length ? 'found' : hits === 0 ? 'missing' : 'partly';
    phrases.push({ text, state, matchedBy });
  }

  const extra = tagList.filter((tag) => {
    const words = contentWords(tag);
    if (words.length === 0) return false;
    return words.every((word) => !promptStems.has(stemWord(word)));
  });

  return {
    phrases,
    extra,
    counts: {
      found: phrases.filter((phrase) => phrase.state === 'found').length,
      partly: phrases.filter((phrase) => phrase.state === 'partly').length,
      missing: phrases.filter((phrase) => phrase.state === 'missing').length,
    },
  };
}
