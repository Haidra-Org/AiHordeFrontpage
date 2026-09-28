import { ListCount } from '../types/moderation';

/**
 * The count of a list the horde returned under a `limit`. The moderation
 * endpoints answer pages, not totals, so a list shorter than the limit is the
 * whole of it and a full one says only that there are at least that many. The
 * dashboard, its tabs and the header badge all read counts through this, so
 * none of them claims an exact number the horde never gave.
 */
export function listCount(length: number, limit: number): ListCount {
  const cap = Math.max(0, Math.trunc(limit));
  if (length < cap) {
    return { count: Math.max(0, length), atLeast: false };
  }
  return { count: cap, atLeast: true };
}
