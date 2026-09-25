/** One organisation or person credited on the sponsors page. */
export interface SponsorEntry {
  readonly name: string;
  /** The part after a spaced hyphen in the source label, where there is one. */
  readonly note: string | null;
  /** Absent when the document carries no usable address for the sponsor. */
  readonly url: string | null;
}

export interface SponsorsDocument {
  readonly sponsors: readonly SponsorEntry[];
  readonly patrons: readonly string[];
}

/** A list item, with or without a link: `* [Name](url)` or `* Name`. */
const LIST_ITEM = /^\s*[*-]\s+(?:\[(.+?)\]\((.*?)\)|(.+?))\s*$/;

/** A setext heading: any line followed by a run of `=`. */
const SETEXT_UNDERLINE = /^=+\s*$/;

/** The heading the patron names follow, with or without a link around it. */
const PATRONS_HEADING = /^\s*(?:\[)?patrons(?:\])?(?:\(.*\))?\s*$/i;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A label may carry its own description after a spaced hyphen. */
function splitLabel(label: string): { name: string; note: string | null } {
  const separator = label.indexOf(' - ');
  if (separator === -1) {
    return { name: label.trim(), note: null };
  }
  return {
    name: label.slice(0, separator).trim(),
    note: label.slice(separator + 3).trim() || null,
  };
}

/**
 * The document is written for a reader, not for a parser, so an entry with no
 * address arrives as the string `None` and is treated as having none.
 */
function readUrl(raw: string | undefined): string | null {
  const url = raw?.trim() ?? '';
  if (!url || url === 'None') {
    return null;
  }
  return /^https?:\/\//i.test(url) ? url : null;
}

/**
 * A patron may be credited by the address they gave rather than by a name.
 * Only the part before the @ is shown, so the credit stands without the page
 * publishing an address that a crawler can lift.
 */
function readPatron(raw: string): string | null {
  const patron = raw.trim();
  if (!patron) {
    return null;
  }
  return EMAIL.test(patron) ? patron.slice(0, patron.indexOf('@')) : patron;
}

/**
 * Reads the horde's sponsors document into the parts the page draws.
 *
 * The page builds its own markup from this rather than rendering the
 * document's markup, because what comes back is shaped for a plain reader: a
 * sponsor with no address still arrives as a link, and the patrons are one
 * comma-separated run that includes at least one email address. Both want
 * handling that markup rendering cannot give.
 */
export function parseSponsorsDocument(markdown: string): SponsorsDocument {
  const lines = markdown.split(/\r?\n/);

  // Everything before the patrons heading is the sponsor list; everything
  // after it is the run of names.
  let patronsAt = lines.length;
  for (let i = 0; i + 1 < lines.length; i++) {
    const heading = lines[i] ?? '';
    const underline = lines[i + 1] ?? '';
    if (PATRONS_HEADING.test(heading) && SETEXT_UNDERLINE.test(underline)) {
      patronsAt = i;
      break;
    }
  }

  const sponsors: SponsorEntry[] = [];
  for (const line of lines.slice(0, patronsAt)) {
    const item = LIST_ITEM.exec(line);
    if (!item) {
      continue;
    }
    const label = item[1] ?? item[3] ?? '';
    const { name, note } = splitLabel(label);
    if (!name) {
      continue;
    }
    sponsors.push({ name, note, url: readUrl(item[2]) });
  }

  const patrons = lines
    .slice(Math.min(patronsAt + 2, lines.length))
    .join(' ')
    .split(',')
    .map(readPatron)
    .filter((patron): patron is string => patron !== null);

  return { sponsors, patrons };
}
