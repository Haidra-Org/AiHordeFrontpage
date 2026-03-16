import { NavItem } from './nav-item';

export const NAV_ITEMS: NavItem[] = [
  { labelKey: 'home', routerLink: '/', exact: true },
  { labelKey: 'mission.nav_link', routerLink: '/mission/' },
  { labelKey: 'news', routerLink: '/news/' },
  { labelKey: 'guis_and_tools', routerLink: '/guis/' },
  {
    labelKey: 'joining',
    dropdownId: 'contribute',
    activeRoutePrefix: '/contribute',
    notificationNavItem: 'contribute',
    children: [
      {
        labelKey: 'nav.contribute.become_worker',
        routerLink: '/contribute/workers',
      },
      { labelKey: 'nav.contribute.donate', routerLink: '/contribute/donate' },
    ],
  },
  { labelKey: 'faq', routerLink: '/faq/' },
  { labelKey: 'api', href: '/api/' },
  {
    labelKey: 'nav.active_details',
    dropdownId: 'details',
    activeRoutePrefix: '/details',
    children: [
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
