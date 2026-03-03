import { Injectable, inject, PLATFORM_ID, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { Signal } from '@angular/core';

const PAGE_GUIDE_KEYS = [
  'help-dismissed-workers',
  'help-dismissed-models',
  'help-dismissed-stats',
  'help-dismissed-teams',
  'help-dismissed-leaderboard',
  'help-dismissed-users',
  'help-dismissed-styles',
  'help-dismissed-profile_guest',
  'beginner-dismissed-tools',
] as const;

@Injectable({ providedIn: 'root' })
export class PageGuideService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private readonly signals = new Map<string, ReturnType<typeof signal<boolean>>>();

  public readonly anyDismissed = computed(() =>
    PAGE_GUIDE_KEYS.some((key) => this.getSignal(key)()),
  );

  public readonly allDismissed = computed(() =>
    PAGE_GUIDE_KEYS.every((key) => this.getSignal(key)()),
  );

  constructor() {
    for (const key of PAGE_GUIDE_KEYS) {
      const dismissed =
        this.isBrowser && localStorage.getItem(key) === 'dismissed';
      this.signals.set(key, signal(dismissed));
    }
  }

  public isDismissed(key: string): Signal<boolean> {
    return this.getSignal(key);
  }

  public dismiss(key: string): void {
    this.getSignal(key).set(true);
    if (this.isBrowser) {
      localStorage.setItem(key, 'dismissed');
    }
  }

  public restore(key: string): void {
    this.getSignal(key).set(false);
    if (this.isBrowser) {
      localStorage.removeItem(key);
    }
  }

  public dismissAll(): void {
    for (const key of PAGE_GUIDE_KEYS) {
      this.dismiss(key);
    }
  }

  public restoreAll(): void {
    for (const key of PAGE_GUIDE_KEYS) {
      this.restore(key);
    }
  }

  private getSignal(key: string): ReturnType<typeof signal<boolean>> {
    let s = this.signals.get(key);
    if (!s) {
      // Dynamically handle keys not in the static registry
      const dismissed =
        this.isBrowser && localStorage.getItem(key) === 'dismissed';
      s = signal(dismissed);
      this.signals.set(key, s);
    }
    return s;
  }
}
