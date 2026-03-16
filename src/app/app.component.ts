import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterOutlet, Scroll } from '@angular/router';
import { ViewportScroller, NgOptimizedImage, DOCUMENT } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs/operators';
import { FooterColorService } from './services/footer-color.service';
import { FloatingControlsComponent } from './components/floating-controls/floating-controls.component';
import { NetworkStatusComponent } from './components/network-status/network-status.component';
import { StickyRegistryService } from './services/sticky-registry.service';
import { NeedWorkersNotifierService } from './services/need-workers-notifier.service';
import { NavBarComponent } from './components/nav-bar/nav-bar.component';
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
