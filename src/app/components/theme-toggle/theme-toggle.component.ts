import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  signal,
  inject,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService, type Theme } from '../../services/theme.service';
import { InlineSvgComponent } from '../inline-svg/inline-svg.component';
import { IconComponent } from '../icon/icon.component';

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
  selector: 'app-theme-toggle, theme-toggle',
  imports: [CommonModule, InlineSvgComponent, IconComponent],
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class ThemeToggleComponent {
  public readonly themeService = inject(ThemeService);
  private readonly wrapper = viewChild<ElementRef<HTMLElement>>('wrapper');

  public readonly isOpen = signal(false);

  onDocumentClick(event: Event): void {
    if (!this.isOpen()) return;
    if (!this.wrapper()?.nativeElement.contains(event.target as Node)) {
      this.closeDropdown();
    }
  }

  public toggleDropdown(): void {
    this.isOpen.update((value) => !value);
  }

  public closeDropdown(): void {
    this.isOpen.set(false);
  }

  public selectTheme(theme: Theme): void {
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
