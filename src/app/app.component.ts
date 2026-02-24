import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  HostListener,
  Renderer2,
} from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { ViewportScroller, NgOptimizedImage, DOCUMENT } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { FooterColorService } from './services/footer-color.service';
import { ThemeService } from './services/theme.service';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';
import { AuthService } from './services/auth.service';
import { GlossaryModalComponent } from './components/glossary-modal/glossary-modal.component';
import { GlossaryService } from './services/glossary.service';
import { filter } from 'rxjs/operators';

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
    GlossaryModalComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly footerColor = inject(FooterColorService);
  private readonly document = inject(DOCUMENT);
  private readonly renderer = inject(Renderer2);
  private readonly viewportScroller = inject(ViewportScroller);
  private readonly router = inject(Router);
  public readonly themeService = inject(ThemeService);
  public readonly auth = inject(AuthService);
  public readonly glossary = inject(GlossaryService);

  // Reactive signal for footer dark mode
  public darkFooter = this.footerColor.dark;
  public showMobileMenu = false;
  public showDetailsDropdown = false;
  public showMobileDetailsSubmenu = false;
  public showContributeDropdown = false;
  public showMobileContributeSubmenu = false;
  public showAccountDropdown = false;
  public showMobileAccountSubmenu = false;
  public isContributeRouteActive = false;
  public isDetailsRouteActive = false;

  ngOnInit(): void {
    // Offset anchor scrolling by the fixed nav bar height
    this.viewportScroller.setOffset(() => {
      const nav = this.document.querySelector('.nav-shell');
      return [0, nav ? nav.getBoundingClientRect().height : 0];
    });

    // Track route changes to highlight dropdown triggers
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.isContributeRouteActive =
          e.urlAfterRedirects.startsWith('/contribute');
        this.isDetailsRouteActive = e.urlAfterRedirects.startsWith('/details');
      });

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
    if (this.showContributeDropdown) {
      this.closeContributeDropdown();
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

    if (this.showContributeDropdown) {
      const contributeContainer = target.closest(
        '.nav-dropdown-container[data-dropdown="contribute"]',
      );
      if (!contributeContainer) {
        this.closeContributeDropdown();
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
    if (this.showDetailsDropdown) {
      this.showAccountDropdown = false;
      this.showContributeDropdown = false;
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
    if (this.showAccountDropdown) {
      this.showDetailsDropdown = false;
      this.showContributeDropdown = false;
    }
  }

  public closeAccountDropdown(): void {
    this.showAccountDropdown = false;
  }

  public toggleMobileAccountSubmenu(): void {
    this.showMobileAccountSubmenu = !this.showMobileAccountSubmenu;
  }

  public toggleContributeDropdown(): void {
    this.showContributeDropdown = !this.showContributeDropdown;
    if (this.showContributeDropdown) {
      this.showDetailsDropdown = false;
      this.showAccountDropdown = false;
    }
  }

  public closeContributeDropdown(): void {
    this.showContributeDropdown = false;
  }

  public toggleMobileContributeSubmenu(): void {
    this.showMobileContributeSubmenu = !this.showMobileContributeSubmenu;
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
