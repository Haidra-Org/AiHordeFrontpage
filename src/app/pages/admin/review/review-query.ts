import { ParamMap } from '@angular/router';

/** The queues the review page shows, as the `tab` query parameter names them. */
export type ReviewTab = 'promotions' | 'paused';

export const REVIEW_TABS: readonly ReviewTab[] = ['promotions', 'paused'];

export interface ReviewQuery {
  /** The tab the address names, or null when it names none or an unknown one. */
  tab: ReviewTab | null;
}

/**
 * Read the review page's address. Anything unrecognised falls back to the
 * default, so a hand-edited or stale link still opens a working page.
 */
export function parseReviewQuery(params: ParamMap): ReviewQuery {
  const tab = params.get('tab');
  return {
    tab: REVIEW_TABS.includes(tab as ReviewTab) ? (tab as ReviewTab) : null,
  };
}
