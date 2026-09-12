import { ImageGenerationRequest } from './generation';

/**
 * What the promotional gallery publishes about one picture.
 *
 * The manifest is written by the evidence library's gallery command from the
 * runs it made, so every field here is a fact recorded at the time rather than
 * a description written afterwards. `request` is the exact body that was sent
 * to the horde, which is what makes a picture a worked example rather than an
 * illustration: a reader can take it into the studio and have the same
 * settings. It is the newest field and a picture published before it existed
 * carries none, so every surface that reads it degrades to showing the picture
 * alone.
 */
export interface PromoGalleryImage {
  id: string;
  /** Path to the picture relative to the promo root, slashes included. */
  file: string;
  prompt: string;
  tags: string[];
  /** The model the horde actually served it with. */
  model: string;
  seed: string;
  /** How long the run took, in seconds. */
  seconds: number;
  kudos: number;
  width: number;
  height: number;
  /** What alchemy was run against it, keyed by form; absent where none was. */
  alchemy?: Record<string, PromoGalleryAlchemy>;
  /** The request body the picture was made with, where one was published. */
  request?: ImageGenerationRequest;
}

/** One alchemy run published beside a picture. */
export interface PromoGalleryAlchemy {
  seconds: number;
  file?: string;
  text?: string;
  width?: number;
  height?: number;
}

/** The manifest as published. */
export interface PromoGalleryManifest {
  schema_version: number;
  generated_against?: string;
  images: PromoGalleryImage[];
  /**
   * Ids that are published in the bucket but must never be shown. They are
   * listed rather than removed so the library can keep the run that made them.
   */
  censored?: string[];
}

/** Words that would start a title with nothing in them. */
const LEADING_ARTICLES = new Set(['a', 'an', 'the']);

/** Words a cut title must not end on, or the name reads as a broken sentence. */
const TRAILING_JOINERS = new Set([
  'a',
  'an',
  'the',
  'and',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'over',
  'through',
  'to',
  'under',
  'with',
  'whose',
]);

/** How long a name can run before it stops reading as one. */
const TITLE_LIMIT = 48;

/**
 * A short name for a picture, taken from the prompt that made it. The manifest
 * publishes no titles: a prompt's opening clause is what the picture is of, so
 * it names the picture as well as anything written separately would and it
 * cannot drift from it. A clause too long to read as a name is cut at a word,
 * and never on a word that leaves the name hanging.
 */
export function galleryTitle(prompt: string): string {
  const clause = prompt.split(',')[0]?.trim() ?? '';
  const words = clause.split(/\s+/).filter(Boolean);
  const first = words[0];
  if (words.length > 1 && first && LEADING_ARTICLES.has(first.toLowerCase())) {
    words.shift();
  }
  const kept: string[] = [];
  let length = 0;
  for (const word of words) {
    const next = length === 0 ? word.length : length + 1 + word.length;
    if (next > TITLE_LIMIT && kept.length > 0) {
      break;
    }
    kept.push(word);
    length = next;
  }
  for (;;) {
    const last = kept[kept.length - 1];
    if (
      kept.length <= 1 ||
      kept.length >= words.length ||
      !last ||
      !TRAILING_JOINERS.has(last.toLowerCase())
    ) {
      break;
    }
    kept.pop();
  }
  const name = kept.join(' ');
  const cut = kept.length < words.length ? '…' : '';
  return name ? name.charAt(0).toUpperCase() + name.slice(1) + cut : '';
}
