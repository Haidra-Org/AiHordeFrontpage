import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  ElementRef,
  OnInit,
  Renderer2,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { DecimalPipe, DOCUMENT, NgOptimizedImage } from '@angular/common';
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
import { ModerationCountsService } from '../../services/moderation-counts.service';
import { StickyHeaderDirective } from '../../helper/sticky-header.directive';
import { IconComponent } from '../icon/icon.component';
import { NavDropdownComponent } from '../nav-dropdown/nav-dropdown.component';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { ModerationCountComponent } from '../admin/moderation-count/moderation-count.component';
import { NavItem } from './nav-item';
import { ListCount } from '../../types/moderation';
import {
  MODERATION_NAV_ID,
  NAV_ITEMS,
  NAV_OVERFLOW_DROPDOWN_ID,
  NavEntryMeasurement,
  isStudioRoute,
  planNavOverflow,
} from './nav-items';

const GITHUB_REPO_API = 'https://api.github.com/repos/Haidra-Org/AI-Horde';
const GITHUB_STARS_STORAGE_KEY = 'aihorde.nav.github_stars';

function readStoredStars(): number | null {
  try {
    const raw = sessionStorage.getItem(GITHUB_STARS_STORAGE_KEY);
    if (raw === null) return null;
    const stars = Number(raw);
    return Number.isFinite(stars) ? stars : null;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-nav-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    NgOptimizedImage,
    DecimalPipe,
    TranslocoPipe,
    StickyHeaderDirective,
    IconComponent,
    NavDropdownComponent,
    ThemeToggleComponent,
    ModerationCountComponent,
  ],
  templateUrl: './nav-bar.component.html',
  host: {
    '(window:resize)': 'onWindowResize()',
    '(document:keydown.escape)': 'onEscapeKey()',
  },
})
export class NavBarComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly renderer = inject(Renderer2);
  public readonly themeService = inject(ThemeService);
  public readonly auth = inject(AuthService);
  public readonly navNotifications = inject(NavNotificationService);
  private readonly moderationCounts = inject(ModerationCountsService);

  // ── GitHub star link ──
  /**
   * The repository's star count, or null until it is known. A plain link
   * replaces GitHub's buttons script, whose injected iframe put two unlabelled
   * tab stops ahead of the navigation.
   */
  public readonly githubStars = signal<number | null>(null);
  public readonly githubStarLabelKey = computed(() => {
    const stars = this.githubStars();
    if (stars === null) return 'nav.github_star_label';
    return stars === 1
      ? 'nav.github_star_label_count_one'
      : 'nav.github_star_label_count_other';
  });

  public readonly navItems = NAV_ITEMS;
  public readonly overflowDropdownId = NAV_OVERFLOW_DROPDOWN_ID;

  // ── Desktop overflow ("More") ──
  private readonly navMenu = viewChild<ElementRef<HTMLElement>>('navMenu');
  private readonly overflowedKeys = signal<ReadonlySet<string>>(new Set());
  private resizeObserver?: ResizeObserver;
  private remeasureHandle = 0;

  /** The entries the bar could not pay for, in the order they sit on the bar. */
  public readonly overflowItems = computed(() => {
    const hidden = this.overflowedKeys();
    return this.navItems.filter((item) => hidden.has(item.labelKey));
  });
  public readonly hasOverflow = computed(() => this.overflowItems().length > 0);

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

  /**
   * Whether the nav is over a studio. The studios are worked in rather than
   * read: their own chrome (the tool row, the panel head, the foot) stacks
   * under this one, and every band it takes is a band of the panel the reader
   * is actually using. Same bar, drawn a size down.
   */
  public readonly compact = computed(() => isStudioRoute(this.currentUrl()));

  /** Whether an entry has been moved off the bar and into the overflow menu. */
  public isOverflowed(item: NavItem): boolean {
    return this.overflowedKeys().has(item.labelKey);
  }

  // ── Notification helpers ──
  public readonly contributeNotifications =
    this.navNotifications.notificationsForNavItem('contribute');
  public readonly hasContributeNotification = computed(
    () => this.contributeNotifications().length > 0,
  );
  public readonly contributeTooltip = computed(() => {
    const items = this.contributeNotifications();
    return (items.at(0)?.tooltipParams?.['types'] as string) ?? '';
  });
  public readonly hasMobileIndicator = computed(() =>
    this.navNotifications.hasPendingMobileIndicator(),
  );

  /**
   * A label that changes with sign-in state, or an attention dot appearing on a
   * trigger, changes what the bar costs without changing what it is given, so
   * the width observer never hears about it.
   */
  private readonly _remeasureOnLabelChange = effect(() => {
    this.auth.isLoggedIn();
    this.hasContributeNotification();
    untracked(() => this.scheduleMeasure());
  });

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
    if (item.activeRouteMatch) {
      return item.activeRouteMatch(url);
    }
    if (item.activeRoutePrefix && url.startsWith(item.activeRoutePrefix)) {
      return true;
    }
    // Children may live under routes unrelated to the trigger's prefix (the
    // docs menu holds /faq alongside /docs), so fall back to matching any child
    // link rather than a single shared prefix.
    return (item.children ?? []).some(
      (child) => child.routerLink && url.startsWith(child.routerLink),
    );
  }

  /**
   * The overflow trigger stands in for whatever it holds, so it carries the
   * active mark and the attention dot of any entry now behind it. Otherwise an
   * entry that moves off the bar takes its signal with it.
   */
  public isOverflowRouteActive(): boolean {
    return this.overflowItems().some((item) =>
      item.children
        ? this.isDropdownRouteActive(item)
        : this.isItemActive(item),
    );
  }

  public overflowNeedsAttention(): boolean {
    return this.overflowItems().some((item) => this.hasNotification(item));
  }

  /** Route-active test for a plain link, matching `routerLinkActive`. */
  private isItemActive(item: NavItem): boolean {
    if (!item.routerLink) return false;
    const url = this.currentUrl();
    return item.exact
      ? url === item.routerLink
      : url.startsWith(item.routerLink);
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

  /** The waiting-work count an entry carries, when it carries one and it is above zero. */
  public childCount(child: NavItem): ListCount | null {
    if (child.id !== MODERATION_NAV_ID) return null;
    const total = this.moderationCounts.total();
    return total && total.count > 0 ? total : null;
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
    if (child.authState === 'moderator') {
      return this.moderationCounts.anyAvailable();
    }
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

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      void this.loadGitHubStars();
    }
  }

  ngAfterViewInit(): void {
    this.observeBarWidth();
  }

  ngOnDestroy(): void {
    if (this.showMobileMenu()) {
      this.enableBodyScroll();
    }
    this.resizeObserver?.disconnect();
    if (this.remeasureHandle) {
      cancelAnimationFrame(this.remeasureHandle);
    }
  }

  /**
   * Watches the width the bar is actually given rather than the width of the
   * viewport, so a longer word or a new entry is caught by the same guard as a
   * narrower window. The menu grows to fill the space between the logo and the
   * controls, which keeps the measured width independent of how many entries
   * are currently on show and stops the observer chasing its own changes.
   */
  private observeBarWidth(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure());
    const menu = this.navMenu()?.nativeElement;
    if (menu) this.resizeObserver.observe(menu);
  }

  private scheduleMeasure(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (this.remeasureHandle) return;
    this.remeasureHandle = requestAnimationFrame(() => {
      this.remeasureHandle = 0;
      this.measureOverflow();
    });
  }

  /**
   * An overflowed entry is taken out of flow rather than removed, so every
   * entry stays measurable at its natural width whichever side of the fold it
   * is on and the widths are read fresh at each breakpoint, where the padding
   * and the gaps differ.
   */
  private measureOverflow(): void {
    const menu = this.navMenu()?.nativeElement;
    if (!menu || menu.clientWidth === 0) return;

    const gap = parseFloat(getComputedStyle(menu).columnGap) || 0;
    const entries: NavEntryMeasurement[] = [];
    for (const item of this.navItems) {
      const element = menu.querySelector<HTMLElement>(
        `[data-nav-entry="${item.labelKey}"]`,
      );
      if (!element) continue;
      entries.push({
        key: item.labelKey,
        width: element.getBoundingClientRect().width,
        overflowPriority: item.overflowPriority,
      });
    }
    const trigger = menu.querySelector<HTMLElement>('[data-nav-overflow]');
    const next = planNavOverflow(
      entries,
      menu.clientWidth,
      gap,
      trigger ? trigger.getBoundingClientRect().width : 0,
    );

    const current = this.overflowedKeys();
    if (
      next.size === current.size &&
      [...next].every((key) => current.has(key))
    ) {
      return;
    }
    this.overflowedKeys.set(next);
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

  /**
   * Reads the star count once per browser session. The unauthenticated GitHub
   * API allows sixty requests an hour per address, so the count is kept in
   * session storage rather than asked for on every page load. Any failure
   * leaves the count out; the link works without it.
   */
  private async loadGitHubStars(): Promise<void> {
    const cached = readStoredStars();
    if (cached !== null) {
      this.githubStars.set(cached);
      return;
    }
    try {
      const response = await fetch(GITHUB_REPO_API);
      if (!response.ok) return;
      const body = (await response.json()) as { stargazers_count?: unknown };
      const stars = body.stargazers_count;
      if (typeof stars !== 'number' || !Number.isFinite(stars)) return;
      this.githubStars.set(stars);
      try {
        sessionStorage.setItem(GITHUB_STARS_STORAGE_KEY, String(stars));
      } catch {
        // Storage can be unavailable (private modes, blocked site data).
      }
    } catch {
      // Offline or blocked: the link renders without a count.
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
