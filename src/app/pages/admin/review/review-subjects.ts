import { extractApiErrorField } from '../../../helper/extract-api-error';

/**
 * The moderation refusals a moderator can meet from this page, each with a
 * message that says what to do. The horde's own message stays in the
 * toast's details.
 */
const REFUSALS: Readonly<Record<string, string>> = {
  InvalidSuspicionID: 'admin.review.refusal.suspicion_id',
};

/** The message for a failed moderation request: a known refusal's, else `fallback`. */
export function refusalKey(error: unknown, fallback: string): string {
  const rc = extractApiErrorField(error, 'rc');
  return (rc !== undefined ? REFUSALS[rc] : undefined) ?? fallback;
}
