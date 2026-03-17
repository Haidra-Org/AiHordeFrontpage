import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  Renderer2,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { DOCUMENT, NgOptimizedImage } from '@angular/common';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map, startWith } from 'rxjs';
import { ThemeService } from '../../services/theme.service';
import { AuthService } from '../../services/auth.service';
import { NavNotificationService } from '../../services/nav-notification.service';
import { StickyHeaderDirective } from '../../helper/sticky-header.directive';
import { IconComponent } from '../icon/icon.component';
import { NavDropdownComponent } from '../nav-dropdown/nav-dropdown.component';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { NavItem } from './nav-item';
import { NAV_ITEMS } from './nav-items';

@Component({
  selector: 'app-nav-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    NgOptimizedImage,
    TranslocoPipe,
    StickyHeaderDirective,
    IconComponent,
    NavDropdownComponent,
    ThemeToggleComponent,
  ],
  templateUrl: './nav-bar.component.html',
  host: {
    '(window:resize)': 'onWindowResize()',
    '(document:keydown.escape)': 'onEscapeKey()',
  },
})
export class NavBarComponent implements OnInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly renderer = inject(Renderer2);
  public readonly themeService = inject(ThemeService);
  public readonly auth = inject(AuthService);
  public readonly navNotifications = inject(NavNotificationService);

  public readonly navItems = NAV_ITEMS;

  // ── Mobile menu state ──
  public readonly showMobileMenu = signal(false);
  public readonly mobileSubmenus = signal<Record<string, boolean>>({});

  // ── Desktop dropdown coordination ──
  private readonly dropdowns = viewChildren(NavDropdownComponent);

  // ── Route-active state ──
  private readonly currentUrl = toSignal(
    inject(Router).events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(inject(Router).url),
    ),
    { initialValue: inject(Router).url },
  );

  // ── Notification helpers ──
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

  // Close all desktop dropdowns whenever the route changes
  private readonly _closeDropdownsOnNav = effect(() => {
    this.currentUrl();
    untracked(() => {
      for (const dropdown of this.dropdowns()) {
        dropdown.close();
      }
    });
  });

  /** Check whether any child route of a dropdown matches the current URL */
  public isDropdownRouteActive(item: NavItem): boolean {
    const url = this.currentUrl();
    if (item.activeRoutePrefix) {
      return url.startsWith(item.activeRoutePrefix);
    }
    return false;
  }

  /** Get the notification signal for a dropdown (by notificationNavItem key) */
  public hasNotification(item: NavItem): boolean {
    if (!item.notificationNavItem) return false;
    return (
      this.navNotifications.notificationsForNavItem(item.notificationNavItem)()
        .length > 0
    );
  }

  /** Resolve the display label for a child item (supports auth-conditional text) */
  public resolveChildLabel(child: NavItem): string {
    if (child.loggedInLabelKey && this.auth.isLoggedIn()) {
      return child.loggedInLabelKey;
    }
    return child.labelKey;
  }

  /** True only when a notification targets this specific child via navSubItem */
  public hasNotificationForChild(item: NavItem, child: NavItem): boolean {
    if (!item.notificationNavItem || !child.id) return false;
    return this.navNotifications
      .notificationsForNavItem(item.notificationNavItem)()
      .some((n) => n.navSubItem === child.id);
  }

  /** Filter children by auth state */
  public isChildVisible(child: NavItem): boolean {
    if (!child.authState || child.authState === 'any') return true;
    if (child.authState === 'logged-in') return this.auth.isLoggedIn();
    return !this.auth.isLoggedIn();
  }

  // ── Desktop dropdown coordination ──
  public onDropdownOpened(openedId: string): void {
    for (const dropdown of this.dropdowns()) {
      if (dropdown.dropdownId() !== openedId) {
        dropdown.close();
      }
    }
  }

  // ── Mobile menu ──
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

  public toggleMobileSubmenu(dropdownId: string): void {
    this.mobileSubmenus.update((current) => ({
      ...current,
      [dropdownId]: !current[dropdownId],
    }));
  }

  public isMobileSubmenuOpen(dropdownId: string): boolean {
    return !!this.mobileSubmenus()[dropdownId];
  }

  // ── GitHub buttons script ──
  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      this.loadGitHubButtonsScript();
    }
  }

  ngOnDestroy(): void {
    if (this.showMobileMenu()) {
      this.enableBodyScroll();
    }
  }

  public onWindowResize(): void {
    if (
      typeof window !== 'undefined' &&
      window.innerWidth >= 1024 &&
      this.showMobileMenu()
    ) {
      this.closeMobileMenu();
    }
  }

  public onEscapeKey(): void {
    if (this.showMobileMenu()) {
      this.closeMobileMenu();
    }
  }

  private loadGitHubButtonsScript(): void {
    const scriptId = 'github-buttons-script';
    if (this.document.getElementById(scriptId)) return;
    window.setTimeout(() => {
      if (this.document.getElementById(scriptId)) return;
      const script = this.document.createElement('script');
      script.id = scriptId;
      script.src = 'https://buttons.github.io/buttons.js';
      script.async = true;
      script.defer = true;
      this.document.head.appendChild(script);
    }, 0);
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
