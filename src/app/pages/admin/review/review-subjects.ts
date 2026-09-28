import { extractApiErrorField } from '../../../helper/extract-api-error';
import {
  ModerationSubjectKind,
  PromptModerationEventQuery,
  PromptModerationReason,
  SubjectIdentity,
} from '../../../types/moderation';

export const PROMPT_REASONS: readonly PromptModerationReason[] = [
  'filter_rejection',
  'model_rejection',
  'worker_csam',
];

/** The horde keeps an event note of at most this many characters. */
export const EVENT_NOTE_LIMIT = 2000;

/** Which account, proxied account or address a set of reports is about. */
export interface SubjectRef {
  kind: ModerationSubjectKind;
  user_id: number | null;
  proxied_account: string | null;
  ipaddr: string | null;
}

/** The identity fields the horde reads for a subject's kind, for decisions. */
export function identityOf(ref: SubjectRef): SubjectIdentity {
  switch (ref.kind) {
    case 'account':
      return { user_id: ref.user_id ?? undefined };
    case 'proxied_account':
      return {
        user_id: ref.user_id ?? undefined,
        proxied_account: ref.proxied_account ?? undefined,
      };
    case 'ip':
      return { ipaddr: ref.ipaddr ?? undefined };
  }
}

/** The prompt log filters that select a subject's events. */
export function eventFilterOf(ref: SubjectRef): PromptModerationEventQuery {
  const identity = identityOf(ref);
  return Object.fromEntries(
    Object.entries(identity).filter(([, value]) => value !== undefined),
  ) as PromptModerationEventQuery;
}

/** A length of time as a translation key and the count it takes. */
export interface DurationLabel {
  key: string;
  count: number;
}

/**
 * A number of seconds in the largest whole unit that divides it, so a rule
 * reads as "1 hour" or "30 days" rather than a count of seconds.
 */
export function durationLabel(seconds: number): DurationLabel {
  const units: [number, string][] = [
    [86_400, 'day'],
    [3_600, 'hour'],
    [60, 'minute'],
  ];
  for (const [size, unit] of units) {
    if (seconds >= size && seconds % size === 0) {
      const count = seconds / size;
      return { key: pluralKey(`admin.review.duration.${unit}`, count), count };
    }
  }
  return {
    key: pluralKey('admin.review.duration.second', seconds),
    count: seconds,
  };
}

/** The `_one` or `_other` form of a key for a count. */
export function pluralKey(stem: string, count: number): string {
  return `${stem}_${count === 1 ? 'one' : 'other'}`;
}

/**
 * The moderation refusals a moderator can meet from this page, each with a
 * message that says what to do. The horde's own message stays in the
 * toast's details.
 */
const REFUSALS: Readonly<Record<string, string>> = {
  InvalidModerationNote: 'admin.review.refusal.note',
  InvalidModerationHold: 'admin.review.refusal.hold',
  ModerationEventNotFound: 'admin.review.refusal.event_not_found',
  InvalidModerationReason: 'admin.review.refusal.reason',
  InvalidSuspicionID: 'admin.review.refusal.suspicion_id',
};

/** The message for a failed moderation request: a known refusal's, else `fallback`. */
export function refusalKey(error: unknown, fallback: string): string {
  const rc = extractApiErrorField(error, 'rc');
  return (rc !== undefined ? REFUSALS[rc] : undefined) ?? fallback;
}

export function positiveInt(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** An instant as the horde's time bounds take it, with an explicit zone. */
export function hordeInstant(date: Date): string {
  return date.toISOString().replace(/(\.\d{3})?Z$/, '+00:00');
}
