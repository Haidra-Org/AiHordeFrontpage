import { Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NgOptimizedImage } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { InlineSvgComponent } from './components/inline-svg/inline-svg.component';
import { FooterColorService } from './services/footer-color.service';
import { ThemeService } from './services/theme.service';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    NgOptimizedImage,
    TranslocoPipe,
    RouterLink,
    InlineSvgComponent,
    ThemeToggleComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  private readonly footerColor = inject(FooterColorService);
  public readonly themeService = inject(ThemeService);

  // Reactive signal for footer dark mode
  public darkFooter = this.footerColor.dark;
  public showMobileMenu = false;

  ngOnInit(): void {
    // Optional: Detect user's color scheme preference
    if (typeof window !== 'undefined') {
      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;
      // Note: This doesn't change footer, just demonstrates detection
      // Footer dark mode is controlled by individual pages
    }
  }

  public toggleMobileMenu(): void {
    this.showMobileMenu = !this.showMobileMenu;
  }

  public closeMobileMenu(): void {
    this.showMobileMenu = false;
  }
}
