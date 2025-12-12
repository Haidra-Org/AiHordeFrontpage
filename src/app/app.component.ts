import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  HostListener,
  Renderer2,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgOptimizedImage } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { DOCUMENT } from '@angular/common';
import { FooterColorService } from './services/footer-color.service';
import { ThemeService } from './services/theme.service';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';
import { AuthService } from './services/auth.service';

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
  public readonly auth = inject(AuthService);

  // Reactive signal for footer dark mode
  public darkFooter = this.footerColor.dark;
  public showMobileMenu = false;
  public showDetailsDropdown = false;
  public showMobileDetailsSubmenu = false;
  public showAccountDropdown = false;
  public showMobileAccountSubmenu = false;

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

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showMobileMenu) {
      this.closeMobileMenu();
    }
    if (this.showDetailsDropdown) {
      this.closeDetailsDropdown();
    }
    if (this.showAccountDropdown) {
      this.closeAccountDropdown();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    // Close dropdowns when clicking outside
    const target = event.target as HTMLElement;

    if (this.showDetailsDropdown) {
      const detailsContainer = target.closest(
        '.nav-dropdown-container[data-dropdown="details"]',
      );
      if (!detailsContainer) {
        this.closeDetailsDropdown();
      }
    }

    if (this.showAccountDropdown) {
      const accountContainer = target.closest(
        '.nav-dropdown-container[data-dropdown="account"]',
      );
      if (!accountContainer) {
        this.closeAccountDropdown();
      }
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

  public toggleDetailsDropdown(): void {
    this.showDetailsDropdown = !this.showDetailsDropdown;
    // Close account dropdown when opening details dropdown
    if (this.showDetailsDropdown) {
      this.showAccountDropdown = false;
    }
  }

  public closeDetailsDropdown(): void {
    this.showDetailsDropdown = false;
  }

  public toggleMobileDetailsSubmenu(): void {
    this.showMobileDetailsSubmenu = !this.showMobileDetailsSubmenu;
  }

  public toggleAccountDropdown(): void {
    this.showAccountDropdown = !this.showAccountDropdown;
    // Close details dropdown when opening account dropdown
    if (this.showAccountDropdown) {
      this.showDetailsDropdown = false;
    }
  }

  public closeAccountDropdown(): void {
    this.showAccountDropdown = false;
  }

  public toggleMobileAccountSubmenu(): void {
    this.showMobileAccountSubmenu = !this.showMobileAccountSubmenu;
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
