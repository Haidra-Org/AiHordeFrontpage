export interface NavNotification {
  /** Unique identifier for this notification (e.g. 'need_workers') */
  id: string;
  /** Category of notification for filtering (e.g. 'network', 'account') */
  type: string;
  /** Transloco key for the short display message */
  message: string;
  /** Transloco interpolation params for the message */
  messageParams?: Record<string, unknown>;
  /** Transloco key for the longer hover/tooltip text */
  tooltip?: string;
  /** Transloco interpolation params for the tooltip */
  tooltipParams?: Record<string, unknown>;
  /** Which top-level nav item to highlight (e.g. 'contribute', 'details', 'account') */
  navItem?: string;
  /** Which sub-item within the dropdown to highlight (e.g. 'become-worker') */
  navSubItem?: string;
  /** Optional router link for the notification's target page */
  routerLink?: string;
  /** Higher priority notifications are shown first */
  priority: number;
  /**
   * Opaque hash of the underlying state that triggered this notification.
   * When this changes, a previously-dismissed notification re-appears.
   */
  stateHash?: string;
}

export interface DismissedNotification {
  stateHash: string | null;
  timestamp: number;
}
