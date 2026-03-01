import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  afterNextRender,
  inject,
  NgZone,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { GlossaryModalComponent } from '../glossary-modal/glossary-modal.component';
import { GlossaryService } from '../../services/glossary.service';

@Component({
  selector: 'app-floating-controls',
  imports: [TranslocoPipe, GlossaryModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="floating-controls">
      <ng-content />

      <!-- Glossary FAB -->
      <button
        type="button"
        class="glossary-fab"
        (click)="glossary.open()"
        [attr.aria-label]="'help.open_glossary' | transloco"
      >
        ?
      </button>

      <!-- Scroll to Top -->
      @if (showScrollToTop()) {
        <button
          type="button"
          (click)="scrollToTop()"
          class="scroll-to-top-btn"
          aria-label="Scroll to top"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 10l7-7m0 0l7 7m-7-7v18"
            />
          </svg>
        </button>
      }
    </div>

    <!-- Glossary Modal -->
    <app-glossary-modal />
  `,
})
export class FloatingControlsComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  public readonly glossary = inject(GlossaryService);
  public readonly showScrollToTop = signal(false);

  private rafId = 0;
  private removeScrollListener: (() => void) | null = null;

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;

      const handleScroll = () => {
        if (this.rafId) return;
        this.rafId = requestAnimationFrame(() => {
          this.rafId = 0;
          const scrollPosition =
            window.pageYOffset ||
            document.documentElement.scrollTop ||
            document.body.scrollTop ||
            0;
          const shouldShow = scrollPosition > 300;
          if (this.showScrollToTop() === shouldShow) return;
          this.zone.run(() => this.showScrollToTop.set(shouldShow));
        });
      };

      this.zone.runOutsideAngular(() => {
        window.addEventListener('scroll', handleScroll, { passive: true });
      });

      this.removeScrollListener = () => {
        window.removeEventListener('scroll', handleScroll);
        if (this.rafId) {
          cancelAnimationFrame(this.rafId);
          this.rafId = 0;
        }
      };

      // Initialize visibility for restored scroll positions (e.g., back/forward cache or anchor restore).
      handleScroll();
    });
  }

  ngOnDestroy(): void {
    this.removeScrollListener?.();
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
