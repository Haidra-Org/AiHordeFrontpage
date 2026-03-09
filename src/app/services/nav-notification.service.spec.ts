import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { NavNotificationService } from './nav-notification.service';
import { NavNotification } from '../types/nav-notification';

function makeNotification(
  overrides: Partial<NavNotification> = {},
): NavNotification {
  return {
    id: 'test',
    type: 'network',
    message: 'msg.key',
    priority: 50,
    ...overrides,
  };
}

describe('NavNotificationService', () => {
  let service: NavNotificationService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });
    service = TestBed.inject(NavNotificationService);
  });

  afterEach(() => localStorage.clear());

  // ===================================================================
  // add / remove
  // ===================================================================

  describe('add and remove', () => {
    it('should add a notification and expose it as active', () => {
      service.add(makeNotification());
      expect(service.activeNotifications().length).toBe(1);
      expect(service.hasActiveNotifications()).toBe(true);
    });

    it('should remove a notification by id', () => {
      service.add(makeNotification({ id: 'a' }));
      service.add(makeNotification({ id: 'b' }));
      expect(service.activeNotifications().length).toBe(2);

      service.remove('a');
      expect(service.activeNotifications().length).toBe(1);
      expect(service.activeNotifications()[0].id).toBe('b');
    });

    it('should be a no-op to remove a non-existent id', () => {
      service.add(makeNotification());
      service.remove('does-not-exist');
      expect(service.activeNotifications().length).toBe(1);
    });

    it('should sort active notifications by priority descending', () => {
      service.add(makeNotification({ id: 'low', priority: 10 }));
      service.add(makeNotification({ id: 'high', priority: 90 }));
      service.add(makeNotification({ id: 'mid', priority: 50 }));

      const ids = service.activeNotifications().map((n) => n.id);
      expect(ids).toEqual(['high', 'mid', 'low']);
    });
  });

  // ===================================================================
  // dismiss
  // ===================================================================

  describe('dismiss', () => {
    it('should hide a dismissed notification from activeNotifications', () => {
      service.add(makeNotification({ id: 'x' }));
      service.dismiss('x');
      expect(service.activeNotifications().length).toBe(0);
      expect(service.hasActiveNotifications()).toBe(false);
    });

    it('should persist dismissal in localStorage', () => {
      service.add(makeNotification({ id: 'x', stateHash: 'h1' }));
      service.dismiss('x');

      const raw = localStorage.getItem('nav_notification_dismissed');
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed['x']).toBeDefined();
      expect(parsed['x'].stateHash).toBe('h1');
    });

    it('should re-show notification when stateHash changes', () => {
      service.add(makeNotification({ id: 'x', stateHash: 'h1' }));
      service.dismiss('x');
      expect(service.activeNotifications().length).toBe(0);

      // Simulate the source updating the notification with a new hash
      service.add(makeNotification({ id: 'x', stateHash: 'h2' }));
      expect(service.activeNotifications().length).toBe(1);
    });

    it('should expire dismissal after 24 hours', () => {
      service.add(makeNotification({ id: 'x' }));
      service.dismiss('x');
      expect(service.activeNotifications().length).toBe(0);

      // Manually tamper with the stored timestamp to simulate 25 hours ago
      const all = JSON.parse(
        localStorage.getItem('nav_notification_dismissed')!,
      );
      all['x'].timestamp = Date.now() - 25 * 60 * 60 * 1000;
      localStorage.setItem('nav_notification_dismissed', JSON.stringify(all));

      // Re-add triggers recomputation
      service.add(makeNotification({ id: 'x' }));
      expect(service.activeNotifications().length).toBe(1);
    });
  });

  // ===================================================================
  // mobile indicator
  // ===================================================================

  describe('mobile indicator', () => {
    it('should signal pending when there are active notifications', () => {
      service.add(makeNotification());
      expect(service.hasPendingMobileIndicator()).toBe(true);
    });

    it('should clear after acknowledgeMobile()', () => {
      service.add(makeNotification());
      service.acknowledgeMobile();
      expect(service.hasPendingMobileIndicator()).toBe(false);
    });

    it('should re-show when stateHash changes after acknowledgement', () => {
      service.add(makeNotification({ id: 'x', stateHash: 'h1' }));
      service.acknowledgeMobile();
      expect(service.hasPendingMobileIndicator()).toBe(false);

      // New state from the same source clears the ack
      service.add(makeNotification({ id: 'x', stateHash: 'h2' }));
      expect(service.hasPendingMobileIndicator()).toBe(true);
    });
  });

  // ===================================================================
  // notificationsForNavItem
  // ===================================================================

  describe('notificationsForNavItem', () => {
    it('should return only notifications matching the navItem', () => {
      service.add(makeNotification({ id: 'a', navItem: 'contribute' }));
      service.add(makeNotification({ id: 'b', navItem: 'details' }));
      service.add(makeNotification({ id: 'c', navItem: 'contribute' }));

      const contribute = service.notificationsForNavItem('contribute');
      expect(contribute().length).toBe(2);
      expect(contribute().every((n) => n.navItem === 'contribute')).toBe(true);
    });
  });
});
