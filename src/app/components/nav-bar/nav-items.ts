import { environment } from '../../../environments/environment';
import { NavItem } from './nav-item';

/**
 * Whether a URL is inside one of the studios. The studios stack their own
 * chrome under the site bar and are worked in rather than read, so the bar is
 * drawn a size down over them; a route that merely starts with the same letters
 * (`/generated-something`) is not one of them.
 */
export function isStudioRoute(url: string): boolean {
  return /^\/(generate|alchemy)(\/|$|\?|#)/.test(url);
}

export const NAV_ITEMS: NavItem[] = [
  { labelKey: 'home', routerLink: '/', exact: true },
  {
    // The making end of the site behind one word. The studios used to sit on
    // the bar as two separate entries, which spent two of the bar's places on
    // one idea and left nowhere for the video and audio studios to go; as a
    // group each of them costs a line of a menu instead.
    labelKey: 'nav.generate',
    dropdownId: 'generate',
    activeRoutePrefix: '/generate',
    activeRouteMatch: isStudioRoute,
    children: [
      { labelKey: 'generate.nav_link', routerLink: '/generate/image' },
      { labelKey: 'alchemy.nav_link', routerLink: '/generate/alchemy' },
      // Worked examples: what the horde made, and the settings behind each
      // one. It belongs with the making rather than with the reading.
      { labelKey: 'gallery.nav_link', routerLink: '/gallery' },
      // What both studios have kept in this browser. A result card links here
      // once something has been made; from the bar it is reachable before.
      { labelKey: 'studio.storage.title', routerLink: '/generate/storage' },
    ],
  },
  {
    labelKey: 'mission.nav_link',
    routerLink: '/mission/',
    overflowPriority: 40,
  },
  { labelKey: 'news', routerLink: '/news/', overflowPriority: 60 },
  { labelKey: 'guis_and_tools', routerLink: '/guis/', overflowPriority: 50 },
  {
    labelKey: 'docs.nav_link',
    dropdownId: 'docs',
    activeRoutePrefix: '/docs',
    overflowPriority: 10,
    // The FAQ and the API reference are documentation too, and folding them in
    // here keeps the desktop bar within its width on a 1440px screen; as
    // top-level entries they ran into the theme control.
    children: [
      { labelKey: 'docs.area_image', routerLink: '/docs/image/' },
      { labelKey: 'docs.area_alchemy', routerLink: '/docs/alchemy/' },
      { labelKey: 'docs.nav_settings', routerLink: '/docs/image/settings/' },
      { labelKey: 'faq', routerLink: '/faq/' },
      { labelKey: 'api', href: '/api/' },
    ],
  },
  {
    labelKey: 'joining',
    dropdownId: 'contribute',
    activeRoutePrefix: '/contribute',
    notificationNavItem: 'contribute',
    // Pinned: the project runs on volunteers and donations, so the door to
    // contributing is never folded into the overflow menu.
    children: [
      {
        id: 'become-worker',
        labelKey: 'nav.contribute.become_worker',
        routerLink: '/contribute/workers',
      },
      { labelKey: 'nav.contribute.donate', routerLink: '/contribute/donate' },
    ],
  },
  ...(environment.features.ratingsPage
    ? [
        {
          labelKey: 'rate',
          routerLink: '/rate/',
          overflowPriority: 70,
        } as NavItem,
      ]
    : []),
  {
    labelKey: 'nav.active_details',
    dropdownId: 'details',
    activeRoutePrefix: '/details',
    overflowPriority: 20,
    children: [
      { labelKey: 'status.nav_link', routerLink: '/status/' },
      {
        labelKey: 'nav.active_details.workers',
        routerLink: '/details/workers/',
      },
      {
        labelKey: 'nav.active_details.models',
        routerLink: '/details/models/',
      },
      {
        labelKey: 'nav.active_details.usage_stats',
        routerLink: '/details/usage/',
      },
      {
        labelKey: 'nav.active_details.styles',
        routerLink: '/details/styles/',
      },
      { labelKey: 'nav.active_details.users', routerLink: '/details/users/' },
      { labelKey: 'nav.active_details.teams', routerLink: '/details/teams/' },
      {
        labelKey: 'nav.active_details.leaderboard',
        routerLink: '/details/leaderboard/',
      },
    ],
  },
  {
    labelKey: 'nav.account',
    dropdownId: 'account',
    children: [
      {
        labelKey: 'profile.nav_login',
        loggedInLabelKey: 'profile.nav_profile',
        routerLink: '/profile/',
      },
      {
        labelKey: 'register_account',
        href: 'https://aihorde.net/register',
        authState: 'logged-out',
      },
      { labelKey: 'transfer.title', routerLink: '/v2-transfer/' },
    ],
  },
];

/** The dropdown that holds whatever the bar could not fit. */
export const NAV_OVERFLOW_DROPDOWN_ID = 'more';

/** One bar entry as the overflow calculation sees it: a name and a width. */
export interface NavEntryMeasurement {
  /** The entry's `labelKey`, which identifies it in the rendered list. */
  key: string;
  /** Rendered width in pixels. */
  width: number;
  /** `NavItem.overflowPriority`; absent means the entry is pinned. */
  overflowPriority?: number;
}

/**
 * Decides which bar entries have to move into the overflow menu.
 *
 * The bar is guarded by measurement rather than by a count, so an entry added
 * later needs no breakpoint of its own: either the width in front of the reader
 * pays for it or it is in the menu. Entries leave in descending
 * `overflowPriority`, a declared order rather than the order they happen to sit
 * in, and a pinned entry stays whatever the width.
 *
 * Returns the keys to hide; an empty set means everything fits.
 */
export function planNavOverflow(
  entries: readonly NavEntryMeasurement[],
  budget: number,
  gap: number,
  overflowTriggerWidth: number,
): ReadonlySet<string> {
  const laidOut = (
    visible: readonly NavEntryMeasurement[],
    trigger: number,
  ): number => {
    const count = visible.length + (trigger > 0 ? 1 : 0);
    if (count === 0) return 0;
    const widths = visible.reduce((sum, entry) => sum + entry.width, 0);
    return widths + trigger + gap * (count - 1);
  };

  if (laidOut(entries, 0) <= budget) return new Set<string>();

  // Highest priority first, with a stable tie-break on the bar's own order so
  // two entries given the same number cannot swap between measurements.
  const movable = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.overflowPriority !== undefined)
    .sort(
      (a, b) =>
        (b.entry.overflowPriority ?? 0) - (a.entry.overflowPriority ?? 0) ||
        b.index - a.index,
    );

  const hidden = new Set<string>();
  for (const { entry } of movable) {
    hidden.add(entry.key);
    const visible = entries.filter((candidate) => !hidden.has(candidate.key));
    if (laidOut(visible, overflowTriggerWidth) <= budget) break;
  }
  return hidden;
}
