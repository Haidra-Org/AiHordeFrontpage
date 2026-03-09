import {
  Injectable,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  NavNotification,
  DismissedNotification,
} from '../types/nav-notification';

const STORAGE_KEY = 'nav_notification_dismissed';
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable({ providedIn: 'root' })
export class NavNotificationService {
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _notifications = signal<Map<string, NavNotification>>(
    new Map(),
  );

  /** Session-level flag: true once the user has opened the mobile menu */
  private readonly _mobileAcknowledged = signal(false);

  // ── Public read-only signals ────────────────────────────────────

  public readonly activeNotifications = computed(() => {
    const all = [...this._notifications().values()];
    return all
      .filter((n) => !this.isDismissed(n))
      .sort((a, b) => b.priority - a.priority);
  });

  public readonly hasActiveNotifications = computed(
    () => this.activeNotifications().length > 0,
  );

  /**
   * True when there are active notifications AND the user hasn't
   * opened the mobile menu yet this session.
   */
  public readonly hasPendingMobileIndicator = computed(
    () => this.hasActiveNotifications() && !this._mobileAcknowledged(),
  );

  // ── Mutation API (called by notification sources) ───────────────

  public add(notification: NavNotification): void {
    this._notifications.update((map) => {
      const next = new Map(map);
      const existing = next.get(notification.id);

      // If the state hash changed, clear any stale dismissal
      if (existing && notification.stateHash !== existing.stateHash) {
        this.clearDismissal(notification.id);
        // Reset mobile ack so the dot reappears for the new state
        this._mobileAcknowledged.set(false);
      }

      next.set(notification.id, notification);
      return next;
    });
  }

  public remove(id: string): void {
    this._notifications.update((map) => {
      if (!map.has(id)) return map;
      const next = new Map(map);
      next.delete(id);
      return next;
    });
  }

  public dismiss(id: string): void {
    const notification = this._notifications().get(id);
    if (!notification) return;
    this.storeDismissal(id, {
      stateHash: notification.stateHash ?? null,
      timestamp: Date.now(),
    });
    // Force recomputation by writing the same map reference through update
    this._notifications.update((map) => new Map(map));
  }

  /** Mark mobile indicator as seen for this session. */
  public acknowledgeMobile(): void {
    this._mobileAcknowledged.set(true);
  }

  // ── Query helpers ───────────────────────────────────────────────

  public notificationsForNavItem(navItem: string) {
    return computed(() =>
      this.activeNotifications().filter((n) => n.navItem === navItem),
    );
  }

  // ── Private persistence helpers ─────────────────────────────────

  private isDismissed(notification: NavNotification): boolean {
    const record = this.loadDismissal(notification.id);
    if (!record) return false;

    const expired = Date.now() - record.timestamp > DISMISS_TTL_MS;
    if (expired) {
      this.clearDismissal(notification.id);
      return false;
    }

    // If the source provides a stateHash, the dismissal is only valid
    // while the hash matches (i.e. the underlying condition hasn't changed).
    if (notification.stateHash != null) {
      return record.stateHash === notification.stateHash;
    }

    return true;
  }

  private storeDismissal(id: string, record: DismissedNotification): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const all = this.loadAllDismissals();
      all[id] = record;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // localStorage may be full or unavailable — silently ignore
    }
  }

  private loadDismissal(id: string): DismissedNotification | null {
    const all = this.loadAllDismissals();
    return all[id] ?? null;
  }

  private clearDismissal(id: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const all = this.loadAllDismissals();
      delete all[id];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // silently ignore
    }
  }

  private loadAllDismissals(): Record<string, DismissedNotification> {
    if (!isPlatformBrowser(this.platformId)) return {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
}
