import { Directive, ElementRef, inject, OnDestroy } from '@angular/core';
import {
  Overlay,
  OverlayRef,
  FlexibleConnectedPositionStrategy,
} from '@angular/cdk/overlay';
import { StickyRegistryService } from '../services/sticky-registry.service';

const VIEWPORT_MARGIN = 12;
const TOOLTIP_OFFSET = 4;
const HIDE_DELAY_MS = 150;
const SHOW_DELAY_MS = 400;
const CLICK_CLOSE_GUARD_MS = 600;

/**
 * Shared base for CDK-Overlay-based tooltips / popovers.
 *
 * Handles:
 *  - Lazy overlay creation with smart positioning (above/below).
 *  - Hover, focus, touch and click show/hide behaviour.
 *  - Sticky-header viewport-margin compensation.
 *  - Outside-click dismissal.
 *
 * Subclasses implement `onAttach()` / `onDetach()` to control
 * what content is rendered inside the overlay.
 */
@Directive()
export abstract class OverlayTooltipBase implements OnDestroy {
  protected readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly overlay = inject(Overlay);
  private readonly stickyRegistry = inject(StickyRegistryService);

  protected overlayRef: OverlayRef | null = null;
  protected visible = false;
  protected preferBelow = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private shownAt = 0;
  private pointerTriggered = false;

  /** Attach content to `this.overlayRef`. Called once per show cycle. */
  protected abstract onAttach(): void;

  /** Clean up content references after detach. */
  protected abstract onDetach(): void;

  ngOnDestroy(): void {
    this.clearHideTimer();
    this.clearShowTimer();
    this.overlayRef?.dispose();
    this.overlayRef = null;
  }

  protected scheduleShow(): void {
    this.clearShowTimer();
    this.clearHideTimer();
    this.showTimer = setTimeout(() => this.show(), SHOW_DELAY_MS);
  }

  protected show(): void {
    this.clearShowTimer();
    this.clearHideTimer();

    if (!this.overlayRef) {
      this.overlayRef = this.createOverlay();
      this.setupOverlayEvents();
    }

    const stickyOffset = this.stickyRegistry.totalOffset();
    (
      this.overlayRef.getConfig()
        .positionStrategy as FlexibleConnectedPositionStrategy
    ).withViewportMargin(Math.max(VIEWPORT_MARGIN, stickyOffset));

    if (!this.overlayRef.hasAttached()) {
      this.onAttach();
    }

    this.overlayRef.updatePosition();
    this.visible = true;
    this.shownAt = Date.now();
  }

  protected hide(): void {
    this.visible = false;
    this.clearHideTimer();
    this.clearShowTimer();
    if (this.overlayRef?.hasAttached()) {
      this.overlayRef.detach();
      this.onDetach();
    }
  }

  protected scheduleHide(): void {
    this.clearHideTimer();
    this.hideTimer = setTimeout(() => this.hide(), HIDE_DELAY_MS);
  }

  protected onPointerDown(): void {
    this.pointerTriggered = true;
  }

  protected handleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.pointerTriggered = false;

    if (this.visible && Date.now() - this.shownAt >= CLICK_CLOSE_GUARD_MS) {
      this.hide();
    } else if (!this.visible) {
      this.show();
    }
  }

  protected onFocusIn(): void {
    if (this.pointerTriggered) return;
    this.show();
  }

  protected onDocumentPointerDown(event: Event): void {
    if (!this.visible) return;
    const target = event.target as Node;
    const hostEl = this.elementRef.nativeElement;
    if (hostEl.contains(target)) return;
    if (this.overlayRef?.overlayElement?.contains(target)) return;
    this.hide();
  }

  private clearHideTimer(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private clearShowTimer(): void {
    if (this.showTimer !== null) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }

  private createOverlay(): OverlayRef {
    const above = {
      originX: 'center' as const,
      originY: 'top' as const,
      overlayX: 'center' as const,
      overlayY: 'bottom' as const,
      offsetY: -TOOLTIP_OFFSET,
    };
    const below = {
      originX: 'center' as const,
      originY: 'bottom' as const,
      overlayX: 'center' as const,
      overlayY: 'top' as const,
      offsetY: TOOLTIP_OFFSET,
    };
    const positions = this.preferBelow ? [below, above] : [above, below];

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(this.elementRef)
      .withPositions(positions)
      .withViewportMargin(VIEWPORT_MARGIN)
      .withPush(true);

    return this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
    });
  }

  private setupOverlayEvents(): void {
    if (!this.overlayRef) return;
    const pane = this.overlayRef.overlayElement;
    pane.addEventListener('mouseenter', () => this.clearHideTimer());
    pane.addEventListener('mouseleave', () => this.scheduleHide());
    // Keep overlay open while interactive content inside has focus
    pane.addEventListener('focusin', () => this.clearHideTimer());
    pane.addEventListener('focusout', (e: FocusEvent) => {
      const related = e.relatedTarget as Node | null;
      if (
        related &&
        (pane.contains(related) ||
          this.elementRef.nativeElement.contains(related))
      ) {
        return;
      }
      this.scheduleHide();
    });
  }
}
