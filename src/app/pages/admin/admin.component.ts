import {
  Component,
  DestroyRef,
  HostListener,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { filter } from 'rxjs/operators';
import { TranslatorService } from '../../services/translator.service';
import { FooterColorService } from '../../services/footer-color.service';
import { AuthService } from '../../services/auth.service';
import { HordeStatusService } from '../../services/horde-status.service';
import { HordeStatusModes } from '../../types/horde-status';

/** Breakpoint at which sidebar becomes permanently visible (lg breakpoint) */
const DESKTOP_BREAKPOINT = 1024;

@Component({
  selector: 'app-admin',
  imports: [
    TranslocoPipe,
    TranslocoModule,
    RouterLink,
    RouterOutlet,
  ],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css',
})
export class AdminComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly footerColor = inject(FooterColorService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hordeStatus = inject(HordeStatusService);
  private readonly platformId = inject(PLATFORM_ID);
  public readonly auth = inject(AuthService);

  public statusModes = signal<HordeStatusModes | null>(null);
  /** Sidebar visibility state - starts closed on mobile, open on desktop */
  public sidebarOpen = signal<boolean>(false);
  /** Whether we're on a desktop-sized screen */
  public isDesktop = signal<boolean>(false);

  ngOnInit(): void {
    this.translator
      .get('admin.title')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((adminTitle) => {
        this.translator.get('app_title').subscribe((appTitle) => {
          this.title.setTitle(`${adminTitle} | ${appTitle}`);
        });
      });

    this.footerColor.setDarkMode(true);

    // Initialize sidebar state based on screen size (only in browser)
    if (isPlatformBrowser(this.platformId)) {
      this.updateScreenSize();
    }

    // Load status modes
    this.hordeStatus
      .getStatusModes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((modes) => {
        this.statusModes.set(modes);
      });

    // Close sidebar on navigation (mobile only)
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        if (!this.isDesktop()) {
          this.sidebarOpen.set(false);
        }
      });
  }

  @HostListener('window:resize')
  onResize(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.updateScreenSize();
    }
  }

  private updateScreenSize(): void {
    const isNowDesktop = window.innerWidth >= DESKTOP_BREAKPOINT;
    const wasDesktop = this.isDesktop();
    this.isDesktop.set(isNowDesktop);

    // Auto-open sidebar when transitioning to desktop
    if (isNowDesktop && !wasDesktop) {
      this.sidebarOpen.set(true);
    }
    // Auto-close sidebar when transitioning to mobile
    if (!isNowDesktop && wasDesktop) {
      this.sidebarOpen.set(false);
    }
  }

  public toggleSidebar(): void {
    this.sidebarOpen.set(!this.sidebarOpen());
  }

  public closeSidebarOnMobile(): void {
    if (!this.isDesktop()) {
      this.sidebarOpen.set(false);
    }
  }

  public isActive(path: string): boolean {
    return this.router.url === path || this.router.url.startsWith(path + '/');
  }
}
