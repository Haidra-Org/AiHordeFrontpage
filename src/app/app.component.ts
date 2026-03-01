import {
  Component,
  computed,
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
  Scroll,
} from '@angular/router';
import { ViewportScroller, NgOptimizedImage, DOCUMENT } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { FooterColorService } from './services/footer-color.service';
import { ThemeService } from './services/theme.service';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';
import { AuthService } from './services/auth.service';
import { FloatingControlsComponent } from './components/floating-controls/floating-controls.component';
import { NetworkStatusComponent } from './components/network-status/network-status.component';
import { StickyHeaderDirective } from './helper/sticky-header.directive';
import { StickyRegistryService } from './services/sticky-registry.service';
import { NavNotificationService } from './services/nav-notification.service';
import { NeedWorkersNotifierService } from './services/need-workers-notifier.service';
import { scrollToAnchorWhenReady } from './helper/scroll-utils';
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
    FloatingControlsComponent,
    NetworkStatusComponent,
    StickyHeaderDirective,
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
  private readonly stickyRegistry = inject(StickyRegistryService);
  public readonly themeService = inject(ThemeService);
  public readonly auth = inject(AuthService);
  public readonly navNotifications = inject(NavNotificationService);
  // Inject to trigger initialization (watches network status)
  private readonly _needWorkersNotifier = inject(NeedWorkersNotifierService);

  // Reactive signal for footer dark mode
  public darkFooter = this.footerColor.dark;

  // ── Nav notification computed signals ──
  public readonly contributeNotifications = this.navNotifications.notificationsForNavItem('contribute');
  public readonly hasContributeNotification = computed(() => this.contributeNotifications().length > 0);
  public readonly contributeTooltip = computed(() => {
    const items = this.contributeNotifications();
    return items.length > 0 ? items[0].tooltipParams?.['types'] as string ?? '' : '';
  });
  public readonly hasMobileIndicator = computed(() => this.navNotifications.hasPendingMobileIndicator());
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
    // Offset anchor scrolling by the total sticky header height + padding
    this.viewportScroller.setOffset(() => {
      return [0, this.stickyRegistry.totalOffset() + 16];
    });

    // Safety-net: re-scroll with correct offset after Angular's built-in
    // anchor scrolling fires. Uses MutationObserver so it works even when
    // the target is inside a lazily-loaded route component.
    // Relies on CSS scroll-padding-top (on <html>) and scroll-margin-top
    // (on anchor targets) instead of manual offset math.
    this.router.events
      .pipe(filter((e): e is Scroll => e instanceof Scroll))
      .subscribe((e) => {
        if (e.anchor) {
          scrollToAnchorWhenReady(e.anchor, this.document);
        }
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
      this.loadGitHubButtonsScript();
      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;
      // Note: This doesn't change footer, just demonstrates detection
      // Footer dark mode is controlled by individual pages
    }
  }

  private loadGitHubButtonsScript(): void {
    const scriptId = 'github-buttons-script';
    if (this.document.getElementById(scriptId)) {
      return;
    }

    window.setTimeout(() => {
      if (this.document.getElementById(scriptId)) {
        return;
      }

      const script = this.renderer.createElement('script');
      script.id = scriptId;
      script.src = 'https://buttons.github.io/buttons.js';
      script.async = true;
      script.defer = true;
      this.renderer.appendChild(this.document.head, script);
    }, 0);
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
      this.navNotifications.acknowledgeMobile();
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
