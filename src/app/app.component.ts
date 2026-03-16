import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  OnDestroy,
  Renderer2,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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
import { filter, map, startWith } from 'rxjs/operators';
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
import { IconComponent } from './components/icon/icon.component';
import { scrollToAnchorWhenReady } from './helper/scroll-utils';

@Component({
  selector: 'app-root',
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
    IconComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:resize)': 'onWindowResize()',
    '(document:keydown.escape)': 'onEscapeKey()',
    '(document:click)': 'onDocumentClick($event)',
  },
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
  private readonly destroyRef = inject(DestroyRef);

  // Reactive signal for footer dark mode
  public darkFooter = this.footerColor.dark;

  // ── Nav notification computed signals ──
  public readonly contributeNotifications =
    this.navNotifications.notificationsForNavItem('contribute');
  public readonly hasContributeNotification = computed(
    () => this.contributeNotifications().length > 0,
  );
  public readonly contributeTooltip = computed(() => {
    const items = this.contributeNotifications();
    return items.length > 0
      ? ((items[0].tooltipParams?.['types'] as string) ?? '')
      : '';
  });
  public readonly hasMobileIndicator = computed(() =>
    this.navNotifications.hasPendingMobileIndicator(),
  );

  // ── Navigation UI state (signals) ──
  public readonly showMobileMenu = signal(false);
  public readonly showDetailsDropdown = signal(false);
  public readonly showMobileDetailsSubmenu = signal(false);
  public readonly showContributeDropdown = signal(false);
  public readonly showMobileContributeSubmenu = signal(false);
  public readonly showAccountDropdown = signal(false);
  public readonly showMobileAccountSubmenu = signal(false);

  // ── Route-active state (toSignal + computed) ──
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  public readonly isContributeRouteActive = computed(() =>
    this.currentUrl().startsWith('/contribute'),
  );
  public readonly isDetailsRouteActive = computed(() =>
    this.currentUrl().startsWith('/details'),
  );

  // ── Derived state ──
  public readonly anyDropdownOpen = computed(
    () =>
      this.showDetailsDropdown() ||
      this.showContributeDropdown() ||
      this.showAccountDropdown(),
  );

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
      .pipe(
        filter((e): e is Scroll => e instanceof Scroll),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        if (e.anchor) {
          scrollToAnchorWhenReady(e.anchor, this.document);
        }
      });

    if (typeof window !== 'undefined') {
      this.loadGitHubButtonsScript();
      // Note: prefers-color-scheme detection available via window.matchMedia
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
    if (this.showMobileMenu()) {
      this.enableBodyScroll();
    }
  }

  onWindowResize(): void {
    // Close mobile menu on desktop breakpoint
    if (window.innerWidth >= 1024 && this.showMobileMenu()) {
      this.closeMobileMenu();
    }
  }

  onEscapeKey(): void {
    if (this.showMobileMenu()) {
      this.closeMobileMenu();
      return;
    }
    this.showDetailsDropdown.set(false);
    this.showContributeDropdown.set(false);
    this.showAccountDropdown.set(false);
  }

  onDocumentClick(event: Event): void {
    // Close dropdowns when clicking outside
    const target = event.target as HTMLElement;

    if (this.showDetailsDropdown()) {
      const detailsContainer = target.closest(
        '.nav-dropdown-container[data-dropdown="details"]',
      );
      if (!detailsContainer) {
        this.showDetailsDropdown.set(false);
      }
    }

    if (this.showContributeDropdown()) {
      const contributeContainer = target.closest(
        '.nav-dropdown-container[data-dropdown="contribute"]',
      );
      if (!contributeContainer) {
        this.showContributeDropdown.set(false);
      }
    }

    if (this.showAccountDropdown()) {
      const accountContainer = target.closest(
        '.nav-dropdown-container[data-dropdown="account"]',
      );
      if (!accountContainer) {
        this.showAccountDropdown.set(false);
      }
    }
  }

  public toggleMobileMenu(): void {
    this.showMobileMenu.update((v) => !v);

    if (this.showMobileMenu()) {
      this.navNotifications.acknowledgeMobile();
      this.disableBodyScroll();
    } else {
      this.enableBodyScroll();
    }
  }

  public closeMobileMenu(): void {
    if (this.showMobileMenu()) {
      this.showMobileMenu.set(false);
      this.enableBodyScroll();
    }
  }

  public toggleDetailsDropdown(): void {
    const opening = !this.showDetailsDropdown();
    this.showDetailsDropdown.set(opening);
    if (opening) {
      this.showAccountDropdown.set(false);
      this.showContributeDropdown.set(false);
    }
  }

  public closeDetailsDropdown(): void {
    this.showDetailsDropdown.set(false);
  }

  public toggleMobileDetailsSubmenu(): void {
    this.showMobileDetailsSubmenu.update((v) => !v);
  }

  public toggleAccountDropdown(): void {
    const opening = !this.showAccountDropdown();
    this.showAccountDropdown.set(opening);
    if (opening) {
      this.showDetailsDropdown.set(false);
      this.showContributeDropdown.set(false);
    }
  }

  public closeAccountDropdown(): void {
    this.showAccountDropdown.set(false);
  }

  public toggleMobileAccountSubmenu(): void {
    this.showMobileAccountSubmenu.update((v) => !v);
  }

  public toggleContributeDropdown(): void {
    const opening = !this.showContributeDropdown();
    this.showContributeDropdown.set(opening);
    if (opening) {
      this.showDetailsDropdown.set(false);
      this.showAccountDropdown.set(false);
    }
  }

  public closeContributeDropdown(): void {
    this.showContributeDropdown.set(false);
  }

  public toggleMobileContributeSubmenu(): void {
    this.showMobileContributeSubmenu.update((v) => !v);
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
