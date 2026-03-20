import { Directive, ElementRef, inject, OnDestroy } from '@angular/core';
import {
  Overlay,
  OverlayRef,
  FlexibleConnectedPositionStrategy,
} from '@angular/cdk/overlay';

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
 *  - Outside-click dismissal.
 *
 * Subclasses implement `onAttach()` / `onDetach()` to control
 * what content is rendered inside the overlay.
 */
@Directive()
export abstract class OverlayTooltipBase implements OnDestroy {
  protected readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly overlay = inject(Overlay);

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

    // NOTE: Previously used stickyOffset as a uniform viewport margin, but CDK
    // applies it to ALL sides equally. On a 320px-wide viewport with a 64px
    // navbar, that left only 192px of horizontal space — less than a 200px
    // tooltip — so no position could fit and push was disabled.
    // The prefer-below position ordering already avoids sticky header overlap.
    (
      this.overlayRef.getConfig()
        .positionStrategy as FlexibleConnectedPositionStrategy
    ).withViewportMargin(VIEWPORT_MARGIN);

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
    // Center-aligned positions (preferred — clean centering on trigger)
    const aboveCenter = {
      originX: 'center' as const,
      originY: 'top' as const,
      overlayX: 'center' as const,
      overlayY: 'bottom' as const,
      offsetY: -TOOLTIP_OFFSET,
    };
    const belowCenter = {
      originX: 'center' as const,
      originY: 'bottom' as const,
      overlayX: 'center' as const,
      overlayY: 'top' as const,
      offsetY: TOOLTIP_OFFSET,
    };

    // End-aligned fallbacks (overlay's right edge aligns with trigger's right —
    // used when the trigger is near the right viewport edge)
    const aboveEnd = {
      originX: 'end' as const,
      originY: 'top' as const,
      overlayX: 'end' as const,
      overlayY: 'bottom' as const,
      offsetY: -TOOLTIP_OFFSET,
    };
    const belowEnd = {
      originX: 'end' as const,
      originY: 'bottom' as const,
      overlayX: 'end' as const,
      overlayY: 'top' as const,
      offsetY: TOOLTIP_OFFSET,
    };

    // Start-aligned fallbacks (overlay's left edge aligns with trigger's left —
    // used when the trigger is near the left viewport edge)
    const aboveStart = {
      originX: 'start' as const,
      originY: 'top' as const,
      overlayX: 'start' as const,
      overlayY: 'bottom' as const,
      offsetY: -TOOLTIP_OFFSET,
    };
    const belowStart = {
      originX: 'start' as const,
      originY: 'bottom' as const,
      overlayX: 'start' as const,
      overlayY: 'top' as const,
      offsetY: TOOLTIP_OFFSET,
    };

    // CDK tries positions in order, selecting the first that fits the viewport.
    // Center first for aesthetics, then end-aligned (right-edge triggers),
    // then start-aligned (left-edge triggers).
    const positions = this.preferBelow
      ? [belowCenter, aboveCenter, belowEnd, aboveEnd, belowStart, aboveStart]
      : [aboveCenter, belowCenter, aboveEnd, belowEnd, aboveStart, belowStart];

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(this.elementRef)
      .withPositions(positions)
      .withViewportMargin(VIEWPORT_MARGIN)
      .withPush(true)
      .withFlexibleDimensions(false)
      .withGrowAfterOpen(false);

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
