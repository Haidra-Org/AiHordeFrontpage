import { environment } from '../../environments/environment';
import { settingSweepStrip } from './settings';

/**
 * Where the share cards are, and which one a page offers as its link preview.
 *
 * A card is drawn by the evidence library's `promo` command from the same
 * renders a page shows, so a link to a settings entry unfurls as its own
 * comparison strip rather than as a logo. Cards are promotional material
 * rather than evidence, so they are published beside the library under a
 * prefix of their own, and they are addressed by convention rather than
 * looked up: `sweeps/<parameter>.jpg` for a setting's strip and
 * `tutorials/<flow>.jpg` for a worked example, which is what lets a page name
 * its picture at prerender time without fetching anything. The site card
 * stands in for every page that has no picture of its own.
 */
export const SITE_CARD_FILE = 'site.jpg';

function cardsRoot(): string {
  return environment.promoBaseUrl.replace(/\/+$/, '');
}

/** The card for the site as a whole, and for any page without one of its own. */
export function siteCardUrl(): string {
  return `${cardsRoot()}/${SITE_CARD_FILE}`;
}

/** The pages that have a card of their own rather than the site's. */
export type PageCard = 'generate' | 'alchemy' | 'contribute' | 'docs';

/**
 * The card for one of the site's own doors: the studio, alchemy, contribute
 * and the docs landing each say what they are in their own words and picture,
 * where the site card can only say what the horde is.
 */
export function pageCardUrl(page: PageCard): string {
  return `${cardsRoot()}/pages/${page}.jpg`;
}

/** The card drawn from a library strip, by the strip's parameter name. */
export function sweepCardUrl(parameter: string): string {
  return `${cardsRoot()}/sweeps/${parameter}.jpg`;
}

/** The card drawn from a tutorial's published run. */
export function tutorialCardUrl(flowId: string): string {
  return `${cardsRoot()}/tutorials/${flowId}.jpg`;
}

/**
 * The card a settings entry offers: its strip's, or the site's where the entry
 * has no strip to show.
 */
export function settingCardUrl(id: string): string {
  const strip = settingSweepStrip(id);
  return strip ? sweepCardUrl(strip) : siteCardUrl();
}
