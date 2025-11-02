import {
  Component,
  signal,
  inject,
  HostListener,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { ThemeService, type Theme } from '../../services/theme.service';
import { InlineSvgComponent } from '../inline-svg/inline-svg.component';

/**
 * Theme toggle component with dropdown menu
 *
 * Displays current theme icon (sun/moon) and allows selection of:
 * - Light mode
 * - Dark mode
 * - System preference
 *
 * Uses Angular Signals for reactive UI updates
 */
@Component({
  selector: 'theme-toggle',
  standalone: true,
  imports: [CommonModule, InlineSvgComponent],
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.css',
})
export class ThemeToggleComponent {
  public readonly themeService = inject(ThemeService);
  private readonly platformId = inject(PLATFORM_ID);

  /**
   * Controls dropdown visibility
   */
  public readonly isOpen = signal(false);

  /**
   * Close dropdown when clicking outside
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (isPlatformBrowser(this.platformId) && this.isOpen()) {
      this.closeDropdown();
    }
  }

  /**
   * Toggle dropdown visibility
   */
  public toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.isOpen.update((value) => !value);
  }

  /**
   * Close dropdown
   */
  public closeDropdown(): void {
    this.isOpen.set(false);
  }

  /**
   * Set theme and close dropdown
   */
  public selectTheme(theme: Theme, event: Event): void {
    event.stopPropagation();
    this.themeService.setTheme(theme);
    this.closeDropdown();
  }

  /**
   * Get display label for current theme
   */
  public getThemeLabel(): string {
    const theme = this.themeService.getTheme();
    switch (theme) {
      case 'light':
        return 'Light';
      case 'dark':
        return 'Dark';
      case 'system':
        return 'System';
    }
  }

  /**
   * Check if a theme option is currently selected
   */
  public isSelected(theme: Theme): boolean {
    return this.themeService.getTheme() === theme;
  }
}
