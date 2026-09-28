/**
 * Where the review lists sit beside their detail rather than above it. Kept in
 * step with the `.review-split` breakpoint in `_admin.css`.
 */
export const REVIEW_SPLIT_MEDIA = '(min-width: 1024px)';

/**
 * Whether list and detail share the screen. On a narrower screen opening an
 * item replaces the list, so focus has to follow it there.
 */
export function isSplitView(document: Document): boolean {
  const view = document.defaultView;
  if (!view || typeof view.matchMedia !== 'function') return true;
  return view.matchMedia(REVIEW_SPLIT_MEDIA).matches;
}

/**
 * The item to open once `currentId` has been decided and is about to leave
 * the list: the one after it, else the one before it.
 */
export function nextAfter<K>(ids: readonly K[], currentId: K): K | null {
  const index = ids.indexOf(currentId);
  if (index < 0) return ids.at(0) ?? null;
  return ids[index + 1] ?? ids[index - 1] ?? null;
}
