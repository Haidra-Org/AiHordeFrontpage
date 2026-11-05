import type { StoredPromptDraft } from '../../services/prompt-draft-db.service';
import type { PromptDraftOrigin } from '../../services/prompt-draft.service';
import type { StoredSentPrompt } from '../../services/prompt-history-db.service';

/** Which prompts the library lists. */
export type PromptLibraryTab = 'drafts' | 'sent';

/** Where a draft was written, or every place. */
export type PromptLibraryOriginFilter = 'all' | PromptDraftOrigin;

/** How many entries one press of "Show more" adds. */
export const PROMPT_LIBRARY_PAGE_SIZE = 50;

/** What the library hands back when the reader chooses a prompt. */
export interface PromptLibraryUse {
  prompt: string;
  /**
   * The negative to write alongside it. Null leaves the negative box alone,
   * which is what a draft without one asks for; a sent prompt always carries
   * one, empty when it went out without, because it is reused as it was sent.
   */
  negative: string | null;
  source: 'draft' | 'sent';
}

/**
 * A text request that has not landed as a draft yet, shown ahead of the drafts
 * so the reader sees it is still coming.
 */
export interface PromptLibraryLiveRequest {
  id: string;
  /** Translation key for the request's state ("Waiting", "Gave up"). */
  stateKey: string;
  /** The start of what was asked for, so the reader can tell requests apart. */
  preview: string;
  createdAt: number;
}

/**
 * A text request that ended with nothing to use. They are listed under a fold
 * of their own rather than among the requests still coming, and each one can be
 * read, sent again or taken off the list.
 */
export interface PromptLibraryFailedRequest {
  id: string;
  /** Translation key for what became of it ("The horde gave up on this request"). */
  stateKey: string;
  /** What the state line interpolates, the worker that answered among it. */
  stateParams?: Record<string, string>;
  /** A second line saying why nothing came back, where there is one. */
  reasonKey?: string;
  /** The start of what was asked for, so the reader can tell requests apart. */
  preview: string;
  /** When the request was sent. */
  at: number;
}

interface PromptLibraryEntryBase {
  /** The draft's id or the sent prompt's key. */
  id: string;
  prompt: string;
  negative: string;
  model: string;
  /** When the entry was written, or last sent. */
  at: number;
  starred: boolean;
}

export interface PromptLibraryDraftEntry extends PromptLibraryEntryBase {
  source: 'draft';
  record: StoredPromptDraft;
}

export interface PromptLibrarySentEntry extends PromptLibraryEntryBase {
  source: 'sent';
  record: StoredSentPrompt;
}

/** One row of the library, whichever list it came from. */
export type PromptLibraryEntry =
  PromptLibraryDraftEntry | PromptLibrarySentEntry;

export function draftEntry(draft: StoredPromptDraft): PromptLibraryDraftEntry {
  return {
    source: 'draft',
    id: draft.id,
    prompt: draft.text,
    negative: draft.negative ?? '',
    model: draft.model,
    at: draft.createdAt,
    starred: draft.starred === true,
    record: draft,
  };
}

export function sentEntry(sent: StoredSentPrompt): PromptLibrarySentEntry {
  return {
    source: 'sent',
    id: sent.key,
    prompt: sent.prompt,
    negative: sent.negative,
    model: sent.model,
    at: sent.lastSentAt,
    starred: sent.starred === true,
    record: sent,
  };
}

/** What choosing an entry writes into the prompt boxes. */
export function entryUse(entry: PromptLibraryEntry): PromptLibraryUse {
  return entry.source === 'sent'
    ? { prompt: entry.prompt, negative: entry.negative, source: 'sent' }
    : {
        prompt: entry.prompt,
        negative: entry.negative === '' ? null : entry.negative,
        source: 'draft',
      };
}

/**
 * A copy of a stored record with the star set or taken away. Not starred is the
 * field's absence, so an unstarred record reads as one that was never starred.
 */
export function withStar<T extends { starred?: true }>(
  record: T,
  starred: boolean,
): T {
  if (starred) {
    return { ...record, starred: true };
  }
  const next = { ...record };
  delete next.starred;
  return next;
}

export interface PromptLibraryFilters {
  query: string;
  origin: PromptLibraryOriginFilter;
  /** Empty for every model. */
  model: string;
  starredOnly: boolean;
}

/**
 * The entries that survive the search and filters, newest day first with the
 * starred entries of each day ahead of the rest, then newest first. The search
 * runs over the prompt, the negative and the model, case-insensitively; the
 * place a prompt was written only narrows drafts, which are the only entries
 * that record one.
 */
export function filterEntries(
  entries: readonly PromptLibraryEntry[],
  filters: PromptLibraryFilters,
): PromptLibraryEntry[] {
  const query = filters.query.trim().toLowerCase();
  return entries
    .filter((entry) => {
      if (filters.starredOnly && !entry.starred) {
        return false;
      }
      if (filters.model !== '' && entry.model !== filters.model) {
        return false;
      }
      if (
        filters.origin !== 'all' &&
        entry.source === 'draft' &&
        entry.record.origin !== filters.origin
      ) {
        return false;
      }
      if (query === '') {
        return true;
      }
      return (
        entry.prompt.toLowerCase().includes(query) ||
        entry.negative.toLowerCase().includes(query) ||
        entry.model.toLowerCase().includes(query)
      );
    })
    .sort(
      (a, b) =>
        startOfDay(b.at) - startOfDay(a.at) ||
        Number(b.starred) - Number(a.starred) ||
        b.at - a.at,
    );
}

/** Every model the entries name, alphabetically, without blanks. */
export function modelsOf(entries: readonly PromptLibraryEntry[]): string[] {
  return [
    ...new Set(entries.map((entry) => entry.model).filter((m) => m !== '')),
  ].sort((a, b) => a.localeCompare(b));
}

/** One day's entries, in the order they were given. */
export interface PromptLibraryDay {
  /** Local midnight the day starts at; unique per group. */
  start: number;
  kind: 'today' | 'yesterday' | 'earlier';
  entries: PromptLibraryEntry[];
}

function startOfDay(at: number): number {
  const date = new Date(at);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

/**
 * Split entries already ordered newest day first into local calendar days. Days
 * are counted by the reader's clock, so "Yesterday" means the date before
 * today's rather than anything within 48 hours.
 */
export function groupByDay(
  entries: readonly PromptLibraryEntry[],
  now: number,
): PromptLibraryDay[] {
  const today = startOfDay(now);
  const reference = new Date(today);
  const yesterday = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate() - 1,
  ).getTime();
  const days: PromptLibraryDay[] = [];
  for (const entry of entries) {
    const start = startOfDay(entry.at);
    let day = days.at(-1);
    if (day?.start !== start) {
      day = {
        start,
        kind:
          start >= today
            ? 'today'
            : start === yesterday
              ? 'yesterday'
              : 'earlier',
        entries: [],
      };
      days.push(day);
    }
    day.entries.push(entry);
  }
  return days;
}

/**
 * Which take of its request a draft is, counted among the drafts still kept.
 * Null when the draft stands alone.
 */
export function takeOf(
  draft: StoredPromptDraft,
  drafts: readonly StoredPromptDraft[],
): { index: number; total: number } | null {
  if (draft.requestId === undefined) {
    return null;
  }
  // Ordered by the take each one was, then counted by position, so a deleted
  // take never leaves the reader looking at "take 3 of 2".
  const siblings = drafts
    .filter((other) => other.requestId === draft.requestId)
    .sort((a, b) => (a.takeIndex ?? 0) - (b.takeIndex ?? 0));
  if (siblings.length < 2) {
    return null;
  }
  return {
    index: siblings.findIndex((other) => other.id === draft.id) + 1,
    total: siblings.length,
  };
}
