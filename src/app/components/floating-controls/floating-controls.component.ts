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
import { GlossaryService } from '../../services/glossary.service';
import { FloatingActionService } from '../../services/floating-action.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-floating-controls',
  imports: [TranslocoPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(focusin)': 'onFocusIn()',
    '(focusout)': 'onFocusOut($event)',
  },
  template: `
    <div
      class="floating-controls"
      [class.floating-controls--retreated]="retreated()"
    >
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
          <app-icon name="arrow-up" class="scroll-icon" />
        </button>
      }

      <!-- Registered floating actions -->
      @for (action of floatingActions.actions(); track action.id) {
        @if (action.visible()) {
          <button
            type="button"
            [class]="action.cssClass"
            [disabled]="action.disabled()"
            (click)="action.action()"
          >
            {{ action.labelKey | transloco }}
          </button>
        }
      }
    </div>
  `,
})
export class FloatingControlsComponent implements OnDestroy {
  /** Wide enough that the controls stand in the page's margin, covering nothing. */
  private static readonly PARKED_QUERY = '(min-width: 90rem)';
  /** How long the page has to settle before the controls come back on their own. */
  private static readonly IDLE_RETURN_MS = 1000;
  /** Below this, a scroll is momentum or a rubber-band rather than a reader moving. */
  private static readonly MOVEMENT_THRESHOLD_PX = 8;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);
  public readonly glossary = inject(GlossaryService);
  public readonly floatingActions = inject(FloatingActionService);
  public readonly showScrollToTop = signal(false);
  /** Stepped off the bottom edge so the page can be read past them. */
  public readonly retreated = signal(false);

  private rafId = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastScrollPosition = 0;
  private parked = false;
  private focusWithin = false;
  private removeScrollListener: (() => void) | null = null;
  private removeParkedListener: (() => void) | null = null;

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;

      const parkedQuery = window.matchMedia(
        FloatingControlsComponent.PARKED_QUERY,
      );
      const applyParked = (matches: boolean) => {
        this.parked = matches;
        if (matches) this.zone.run(() => this.retreated.set(false));
      };
      applyParked(parkedQuery.matches);
      const onParkedChange = (event: MediaQueryListEvent) =>
        applyParked(event.matches);
      parkedQuery.addEventListener('change', onParkedChange);
      this.removeParkedListener = () =>
        parkedQuery.removeEventListener('change', onParkedChange);

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
          const shouldRetreat = this.readRetreat(scrollPosition);
          if (
            this.showScrollToTop() === shouldShow &&
            this.retreated() === shouldRetreat
          ) {
            return;
          }
          this.zone.run(() => {
            this.showScrollToTop.set(shouldShow);
            this.retreated.set(shouldRetreat);
          });
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
      this.lastScrollPosition =
        window.pageYOffset || document.documentElement.scrollTop || 0;
      handleScroll();
    });
  }

  ngOnDestroy(): void {
    this.removeScrollListener?.();
    this.removeParkedListener?.();
    this.clearIdleTimer();
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** A control taking focus brings the row back, retreated or not. */
  onFocusIn(): void {
    this.focusWithin = true;
    this.retreated.set(false);
  }

  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && (event.currentTarget as Node).contains(next)) {
      return;
    }
    this.focusWithin = false;
  }

  /**
   * Where the row should stand for this scroll position: away while the reader
   * is moving down the page, back on the way up. Movement under the threshold
   * leaves it where it is, and every move restarts the timer that returns it
   * once the page settles.
   */
  private readRetreat(scrollPosition: number): boolean {
    const movement = scrollPosition - this.lastScrollPosition;
    if (Math.abs(movement) < FloatingControlsComponent.MOVEMENT_THRESHOLD_PX) {
      return this.retreated();
    }
    this.lastScrollPosition = scrollPosition;
    this.startIdleTimer();
    if (this.parked || this.focusWithin) return false;
    return movement > 0;
  }

  private startIdleTimer(): void {
    this.clearIdleTimer();
    this.zone.runOutsideAngular(() => {
      this.idleTimer = setTimeout(() => {
        this.idleTimer = null;
        if (!this.retreated()) return;
        this.zone.run(() => this.retreated.set(false));
      }, FloatingControlsComponent.IDLE_RETURN_MS);
    });
  }

  private clearIdleTimer(): void {
    if (this.idleTimer === null) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}
