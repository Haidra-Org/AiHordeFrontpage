import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Directive,
  ElementRef,
  OnChanges,
  PLATFORM_ID,
  inject,
  input,
} from '@angular/core';

/** How close to the edge of the screen a popover may come. */
const GUTTER_PX = 12;
const ANCHOR_GAP_PX = 6;

export interface ViewportPoint {
  x: number;
  y: number;
}

export interface ViewportAnchor {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface OverlaySize {
  width: number;
  height: number;
}

/**
 * Keeps a popover on the screen. Parent-anchored panels are flipped or pushed
 * horizontally until they clear the gutter. A fixed panel opened at a viewport
 * point is measured, clamped on both axes, and made internally scrollable when
 * it is taller or wider than the available viewport. A fixed panel can instead
 * receive a trigger rectangle, which keeps it aligned with that trigger and
 * flips it above when the space below runs out.
 *
 * In anchored mode, the element must be positioned against its own parent. In
 * fixed mode, pass `viewportPoint`; the offsets are then viewport coordinates.
 */
@Directive({
  selector: '[appEdgeAware]',
  host: {
    '(window:resize)': 'reposition()',
    '(window:scroll)': 'reposition()',
  },
})
export class EdgeAwarePopoverDirective implements AfterViewInit, OnChanges {
  /** The anchor edge the panel hangs from while it fits there. */
  public readonly edgeAlign = input<'start' | 'end'>('start');

  /** Pointer coordinates for a fixed-position overlay. */
  public readonly viewportPoint = input<ViewportPoint | null>(null);

  /** Trigger bounds for a fixed overlay that should open from that trigger. */
  public readonly viewportAnchor = input<Element | ViewportAnchor | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  public ngAfterViewInit(): void {
    this.reposition();
  }

  public ngOnChanges(): void {
    if (this.isBrowser) {
      queueMicrotask(() => this.reposition());
    }
  }

  public reposition(): void {
    if (!this.isBrowser) {
      return;
    }
    const element = this.host.nativeElement;
    const anchor = element.parentElement;
    if (!anchor) {
      return;
    }
    if (window.getComputedStyle(element).position === 'fixed') {
      const fixedAnchor = this.viewportAnchor();
      if (fixedAnchor) {
        this.placeFixedFromAnchor(
          element,
          fixedAnchor instanceof Element
            ? fixedAnchor.getBoundingClientRect()
            : fixedAnchor,
        );
        return;
      }
      const point = this.viewportPoint();
      if (point) {
        this.placeFixedAtPoint(element, point);
        return;
      }
      // A fixed panel with no opening point carries its own positioning rules.
      element.style.removeProperty('left');
      element.style.removeProperty('right');
      return;
    }

    const width = element.getBoundingClientRect().width;
    const anchorRect = anchor.getBoundingClientRect();
    const rightMost = window.innerWidth - GUTTER_PX - width;
    const preferred =
      this.edgeAlign() === 'end' ? anchorRect.right - width : anchorRect.left;

    let left = preferred;
    if (left < GUTTER_PX || left > rightMost) {
      const flipped =
        this.edgeAlign() === 'end' ? anchorRect.left : anchorRect.right - width;
      if (flipped >= GUTTER_PX && flipped <= rightMost) {
        left = flipped;
      }
    }
    left = Math.min(Math.max(left, GUTTER_PX), Math.max(GUTTER_PX, rightMost));

    element.style.left = `${Math.round(left - anchorRect.left)}px`;
    element.style.right = 'auto';
  }

  private prepareFixed(element: HTMLElement): OverlaySize {
    const availableWidth = Math.max(0, window.innerWidth - GUTTER_PX * 2);
    const availableHeight = Math.max(0, window.innerHeight - GUTTER_PX * 2);
    element.style.maxWidth = `${availableWidth}px`;
    element.style.maxHeight = `${availableHeight}px`;
    element.style.overflow = 'auto';
    element.style.overscrollBehavior = 'contain';
    return this.layoutSize(element);
  }

  private placeFixedAtPoint(element: HTMLElement, point: ViewportPoint): void {
    const rect = this.prepareFixed(element);
    const rightMost = Math.max(
      GUTTER_PX,
      window.innerWidth - GUTTER_PX - rect.width,
    );
    const bottomMost = Math.max(
      GUTTER_PX,
      window.innerHeight - GUTTER_PX - rect.height,
    );
    const left = Math.min(Math.max(point.x, GUTTER_PX), rightMost);
    const top = Math.min(Math.max(point.y, GUTTER_PX), bottomMost);

    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
    element.dataset['edgePlacement'] = 'point';
  }

  private placeFixedFromAnchor(
    element: HTMLElement,
    anchor: ViewportAnchor,
  ): void {
    let rect = this.prepareFixed(element);
    const rightMost = Math.max(
      GUTTER_PX,
      window.innerWidth - GUTTER_PX - rect.width,
    );
    const preferredLeft =
      this.edgeAlign() === 'end' ? anchor.right - rect.width : anchor.left;
    const alternateLeft =
      this.edgeAlign() === 'end' ? anchor.left : anchor.right - rect.width;
    const leftCandidate =
      preferredLeft >= GUTTER_PX && preferredLeft <= rightMost
        ? preferredLeft
        : alternateLeft;
    const left = Math.min(Math.max(leftCandidate, GUTTER_PX), rightMost);

    const roomBelow =
      window.innerHeight - GUTTER_PX - anchor.bottom - ANCHOR_GAP_PX;
    const roomAbove = anchor.top - ANCHOR_GAP_PX - GUTTER_PX;
    const opensBelow = rect.height <= roomBelow || roomBelow >= roomAbove;
    // The panel must fit wholly on the side it chose. Without this second cap,
    // clamping a tall panel back into the viewport can push it over its trigger.
    element.style.maxHeight = `${Math.max(
      0,
      opensBelow ? roomBelow : roomAbove,
    )}px`;
    rect = this.layoutSize(element);
    const preferredTop = opensBelow
      ? anchor.bottom + ANCHOR_GAP_PX
      : anchor.top - ANCHOR_GAP_PX - rect.height;
    const bottomMost = Math.max(
      GUTTER_PX,
      window.innerHeight - GUTTER_PX - rect.height,
    );
    const top = Math.min(Math.max(preferredTop, GUTTER_PX), bottomMost);

    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
    element.dataset['edgePlacement'] = opensBelow ? 'bottom' : 'top';
  }

  private layoutSize(element: HTMLElement): OverlaySize {
    const transformed = element.getBoundingClientRect();
    // Placement runs while the opening animation is scaling the panel. Layout
    // dimensions stay stable, so the fully-open edge cannot grow over its
    // trigger after the measurement has already been taken.
    return {
      width: element.offsetWidth || transformed.width,
      height: element.offsetHeight || transformed.height,
    };
  }
}
