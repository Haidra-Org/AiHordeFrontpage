export interface NavItem {
  /** Translation key for display text */
  labelKey: string;
  /**
   * Translation key shown when the user is logged in.
   * Falls back to `labelKey` when absent.
   */
  loggedInLabelKey?: string;
  /** Internal route path — mutually exclusive with `href` */
  routerLink?: string;
  /** External URL — mutually exclusive with `routerLink` */
  href?: string;
  /** Use exact matching for routerLinkActive */
  exact?: boolean;
  /** Dropdown children — presence makes this a dropdown trigger */
  children?: NavItem[];
  /** Unique identifier for dropdown tracking (required when children exist) */
  dropdownId?: string;
  /** Route prefix used to highlight the dropdown trigger */
  activeRoutePrefix?: string;
  /** Controls visibility based on authentication state */
  authState?: 'logged-in' | 'logged-out' | 'any';
  /**
   * Nav-notification item key — when present, the dropdown
   * shows a notification badge sourced from `NavNotificationService`.
   */
  notificationNavItem?: string;
}
