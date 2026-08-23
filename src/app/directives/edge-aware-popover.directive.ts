import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Directive,
  ElementRef,
  PLATFORM_ID,
  inject,
  input,
} from '@angular/core';

/** How close to the edge of the screen a popover may come. */
const GUTTER_PX = 12;

/**
 * Keeps an anchored popover on the screen. The stylesheet says which of the
 * anchor's edges the panel hangs from and how far above or below it sits; this
 * only answers the horizontal question the stylesheet cannot: a panel wider
 * than the room on that side is moved to the other side, and one that still
 * does not fit is pushed in until it clears the gutter.
 *
 * The element it is put on must be positioned against its own parent, which is
 * how every studio popover is drawn: the parent is the anchor, and the offset
 * written back is measured from the anchor's own left edge.
 */
@Directive({
  selector: '[appEdgeAware]',
  host: { '(window:resize)': 'reposition()' },
})
export class EdgeAwarePopoverDirective implements AfterViewInit {
  /** The anchor edge the panel hangs from while it fits there. */
  public readonly edgeAlign = input<'start' | 'end'>('start');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  public ngAfterViewInit(): void {
    this.reposition();
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
    // A panel the stylesheet pins to the screen carries its own gutters and has
    // no anchor to hang from, so there is nothing here to decide.
    if (window.getComputedStyle(element).position === 'fixed') {
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
}
