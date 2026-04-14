import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { vi } from 'vitest';
import { PageGuideService } from './page-guide.service';

describe('PageGuideService', () => {
  function setup(platform: 'browser' | 'server' = 'browser') {
    const platformId = platform === 'browser' ? 'browser' : 'server';
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: platformId }],
    });
    return TestBed.inject(PageGuideService);
  }

  afterEach(() => localStorage.clear());

  it('initializes all guides as not dismissed when storage is empty', () => {
    const svc = setup();
    expect(svc.isDismissed('help-dismissed-workers')()).toBe(false);
    expect(svc.anyDismissed()).toBe(false);
    expect(svc.allDismissed()).toBe(false);
  });

  it('reads dismissed state from localStorage on construction', () => {
    localStorage.setItem('help-dismissed-workers', 'dismissed');
    const svc = setup();
    expect(svc.isDismissed('help-dismissed-workers')()).toBe(true);
    expect(svc.anyDismissed()).toBe(true);
    expect(svc.allDismissed()).toBe(false);
  });

  it('dismiss() sets signal and writes to localStorage', () => {
    const svc = setup();
    svc.dismiss('help-dismissed-models');
    expect(svc.isDismissed('help-dismissed-models')()).toBe(true);
    expect(localStorage.getItem('help-dismissed-models')).toBe('dismissed');
  });

  it('restore() clears signal and removes from localStorage', () => {
    const svc = setup();
    svc.dismiss('help-dismissed-stats');
    svc.restore('help-dismissed-stats');
    expect(svc.isDismissed('help-dismissed-stats')()).toBe(false);
    expect(localStorage.getItem('help-dismissed-stats')).toBeNull();
  });

  it('dismissAll() dismisses every known guide', () => {
    const svc = setup();
    svc.dismissAll();
    expect(svc.allDismissed()).toBe(true);
    expect(svc.anyDismissed()).toBe(true);
  });

  it('restoreAll() restores every known guide', () => {
    const svc = setup();
    svc.dismissAll();
    svc.restoreAll();
    expect(svc.allDismissed()).toBe(false);
    expect(svc.anyDismissed()).toBe(false);
  });

  it('handles dynamically created keys not in the static registry', () => {
    const svc = setup();
    // A key that isn't in PAG_GUIDE_KEYS
    const sig = svc.isDismissed('custom-dynamic-key');
    expect(sig()).toBe(false);
    svc.dismiss('custom-dynamic-key');
    expect(sig()).toBe(true);
  });

  it('skips localStorage reads and writes when running on server', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const svc = setup('server');
    svc.dismiss('help-dismissed-workers');
    expect(svc.isDismissed('help-dismissed-workers')()).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
