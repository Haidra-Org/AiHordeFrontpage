export interface NavItem {
  /** Optional identifier used to match notification sub-item targets */
  id?: string;
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
  /**
   * Decides the trigger's active state where a prefix cannot. A group whose
   * entries share a path with unrelated routes (`/generate` against
   * `/generated-something`) names a predicate instead, so adding an entry to
   * the group never means revisiting the highlighting rule.
   */
  activeRouteMatch?: (url: string) => boolean;
  /**
   * Order in which the entry gives up its place when the bar runs out of room:
   * the highest number goes into the overflow menu first. An entry without one
   * is pinned and always stays on the bar.
   */
  overflowPriority?: number;
  /** Controls visibility based on authentication state */
  authState?: 'logged-in' | 'logged-out' | 'any';
  /**
   * Nav-notification item key — when present, the dropdown
   * shows a notification badge sourced from `NavNotificationService`.
   */
  notificationNavItem?: string;
}
