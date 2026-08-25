import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet,
  Scroll,
} from '@angular/router';
import { ViewportScroller, NgOptimizedImage, DOCUMENT } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map, startWith } from 'rxjs';
import { FooterColorService } from './services/footer-color.service';
import { FloatingControlsComponent } from './components/floating-controls/floating-controls.component';
import { GlossaryModalComponent } from './components/glossary-modal/glossary-modal.component';
import { NetworkStatusComponent } from './components/network-status/network-status.component';
import { StickyRegistryService } from './services/sticky-registry.service';
import { NeedWorkersNotifierService } from './services/need-workers-notifier.service';
import { NavBarComponent } from './components/nav-bar/nav-bar.component';
import { isStudioRoute } from './components/nav-bar/nav-items';
import { ToastBarComponent } from './components/toast-bar/toast-bar.component';
import { scrollToAnchorWhenReady } from './helper/scroll-utils';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    NgOptimizedImage,
    TranslocoPipe,
    FloatingControlsComponent,
    GlossaryModalComponent,
    NetworkStatusComponent,
    NavBarComponent,
    ToastBarComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private readonly footerColor = inject(FooterColorService);
  private readonly document = inject(DOCUMENT);
  private readonly viewportScroller = inject(ViewportScroller);
  private readonly router = inject(Router);
  private readonly stickyRegistry = inject(StickyRegistryService);
  private readonly _needWorkersNotifier = inject(NeedWorkersNotifierService);
  private readonly destroyRef = inject(DestroyRef);

  public darkFooter = this.footerColor.dark;

  /** Current post-redirect URL, for chrome that depends on the active route. */
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /**
   * The `/generate` workspace is a full-height, self-contained studio, so two
   * bits of site chrome are dropped on `/generate/*`:
   *  - the footer (link tree, logo, network status) reads as a strange second
   *    page below it, and every link is reachable elsewhere;
   *  - the floating jump-to-top / glossary controls overlap the studio's own
   *    on-canvas controls and add nothing on a single-screen tool.
   */
  private readonly onStudioRoute = computed(() =>
    isStudioRoute(this.currentUrl()),
  );
  /**
   * The installed app's front screen is four presses; the link tree and the
   * floating controls would make it a page with a start menu on top.
   */
  private readonly onAppLanding = computed(
    () => this.currentUrl().split('?')[0].replace(/\/$/, '') === '/app',
  );
  public readonly hideFooter = computed(
    () => this.onStudioRoute() || this.onAppLanding(),
  );
  public readonly hideFloatingControls = computed(
    () => this.onStudioRoute() || this.onAppLanding(),
  );

  ngOnInit(): void {
    this.viewportScroller.setOffset(() => {
      return [0, this.stickyRegistry.totalOffset() + 16];
    });

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
  }
}
