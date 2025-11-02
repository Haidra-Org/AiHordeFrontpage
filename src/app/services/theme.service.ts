import {
  Injectable,
  signal,
  effect,
  PLATFORM_ID,
  inject,
  computed,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Theme preference options
 * - 'light': Always use light mode
 * - 'dark': Always use dark mode
 * - 'system': Follow system/OS preference
 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * Service for managing application theme (light/dark mode)
 *
 * Features:
 * - Angular Signals for reactive theme state
 * - System preference detection and synchronization
 * - localStorage persistence with SSR guards
 * - Defaults to 'system' for new users
 *
 * Usage:
 * ```typescript
 * constructor(private themeService: ThemeService) {}
 *
 * // Bind to template
 * <div [class.dark]="themeService.isDark()">
 *
 * // Change theme
 * themeService.setTheme('dark');
 * themeService.setTheme('system');
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly STORAGE_KEY = 'theme-preference';

  /**
   * User's theme preference (light/dark/system)
   */
  public readonly theme = signal<Theme>('system');

  /**
   * Computed signal: true if dark mode should be active
   * Used for [class.dark] binding
   */
  public readonly isDark = computed(() => {
    const themePreference = this.theme();

    if (themePreference === 'system') {
      return this.systemPrefersDark.value;
    }

    return themePreference === 'dark';
  });

  /**
   * Tracks system/OS dark mode preference
   */
  private systemPrefersDark = { value: true }; // Default to dark

  private mediaQueryList?: MediaQueryList;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initializeTheme();
    }
  }

  /**
   * Set the theme preference
   * @param theme - 'light', 'dark', or 'system'
   */
  public setTheme(theme: Theme): void {
    this.theme.set(theme);

    if (isPlatformBrowser(this.platformId)) {
      this.saveThemePreference(theme);
    }
  }

  /**
   * Get the current theme preference
   */
  public getTheme(): Theme {
    return this.theme();
  }

  /**
   * Initialize theme from localStorage and system preference
   */
  private initializeTheme(): void {
    // Load system preference first
    this.updateSystemPreference();
    this.watchSystemPreference();

    // Load saved preference or default to 'system'
    const savedTheme = this.loadThemePreference();
    this.theme.set(savedTheme);

    // Set up effect to apply theme changes to DOM
    effect(() => {
      const isDark = this.isDark();
      this.applyThemeToDocument(isDark);
    });
  }

  /**
   * Update the system preference value
   */
  private updateSystemPreference(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)',
    ).matches;
    this.systemPrefersDark.value = prefersDark;
  }

  /**
   * Watch for system preference changes
   */
  private watchSystemPreference(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');

    // Use modern addEventListener if available, fallback to addListener
    const listener = (e: MediaQueryListEvent) => {
      this.systemPrefersDark.value = e.matches;
      // Trigger effect by accessing the signal
      this.theme();
    };

    if (this.mediaQueryList.addEventListener) {
      this.mediaQueryList.addEventListener('change', listener);
    } else {
      // Fallback for older browsers
      this.mediaQueryList.addListener(listener);
    }
  }

  /**
   * Apply theme to document element
   * This is done in addition to the anti-FOUC script for dynamic changes
   */
  private applyThemeToDocument(isDark: boolean): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  /**
   * Load theme preference from localStorage
   */
  private loadThemePreference(): Theme {
    if (!isPlatformBrowser(this.platformId)) {
      return 'system';
    }

    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    } catch (error) {
      console.warn('Failed to load theme preference:', error);
    }

    return 'system'; // Default for new users
  }

  /**
   * Save theme preference to localStorage
   */
  private saveThemePreference(theme: Theme): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, theme);
    } catch (error) {
      console.warn('Failed to save theme preference:', error);
    }
  }
}
