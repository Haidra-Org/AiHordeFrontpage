import { Component, inject, OnInit, OnDestroy, HostListener, Renderer2 } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgOptimizedImage } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { DOCUMENT } from '@angular/common';
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
    RouterLinkActive,
    ThemeToggleComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly footerColor = inject(FooterColorService);
  private readonly document = inject(DOCUMENT);
  private readonly renderer = inject(Renderer2);
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

  ngOnDestroy(): void {
    // Ensure body scroll is restored if component is destroyed while menu is open
    if (this.showMobileMenu) {
      this.enableBodyScroll();
    }
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize(): void {
    // Close mobile menu on desktop breakpoint
    if (window.innerWidth >= 1024 && this.showMobileMenu) {
      this.closeMobileMenu();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(): void {
    if (this.showMobileMenu) {
      this.closeMobileMenu();
    }
  }

  public toggleMobileMenu(): void {
    this.showMobileMenu = !this.showMobileMenu;
    
    if (this.showMobileMenu) {
      this.disableBodyScroll();
    } else {
      this.enableBodyScroll();
    }
  }

  public closeMobileMenu(): void {
    if (this.showMobileMenu) {
      this.showMobileMenu = false;
      this.enableBodyScroll();
    }
  }

  private disableBodyScroll(): void {
    this.renderer.addClass(this.document.body, 'overflow-hidden');
    this.renderer.addClass(this.document.body, 'lg:overflow-auto');
  }

  private enableBodyScroll(): void {
    this.renderer.removeClass(this.document.body, 'overflow-hidden');
    this.renderer.removeClass(this.document.body, 'lg:overflow-auto');
  }
}
