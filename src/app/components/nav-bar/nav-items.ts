import { environment } from '../../../environments/environment';
import { NavItem } from './nav-item';

export const NAV_ITEMS: NavItem[] = [
  { labelKey: 'home', routerLink: '/', exact: true },
  // The two things a reader can do on this site, reachable in one press. They
  // used to sit under the GUIs list, where the label promised other people's
  // software and the entries were ours.
  { labelKey: 'generate.nav_link', routerLink: '/generate/image' },
  { labelKey: 'alchemy.nav_link', routerLink: '/generate/alchemy' },
  { labelKey: 'mission.nav_link', routerLink: '/mission/' },
  { labelKey: 'news', routerLink: '/news/' },
  { labelKey: 'guis_and_tools', routerLink: '/guis/' },
  {
    labelKey: 'docs.nav_link',
    dropdownId: 'docs',
    activeRoutePrefix: '/docs',
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
    ? [{ labelKey: 'rate', routerLink: '/rate/' } as NavItem]
    : []),
  {
    labelKey: 'nav.active_details',
    dropdownId: 'details',
    activeRoutePrefix: '/details',
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

/**
 * Whether a URL is inside one of the studios. The studios stack their own
 * chrome under the site bar and are worked in rather than read, so the bar is
 * drawn a size down over them; a route that merely starts with the same letters
 * (`/generated-something`) is not one of them.
 */
export function isStudioRoute(url: string): boolean {
  return /^\/(generate|alchemy)(\/|$|\?|#)/.test(url);
}
