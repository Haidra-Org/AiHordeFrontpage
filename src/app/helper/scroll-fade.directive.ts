import {
  Directive,
  ElementRef,
  inject,
  NgZone,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Toggles `has-overflow-right` on the host when horizontally
 * scrollable content extends beyond the visible area to the right.
 * Used by `.details-tabs` to show/hide the trailing fade hint.
 */
@Directive({ selector: '[appScrollFade]' })
export class ScrollFadeDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private resizeObserver?: ResizeObserver;

  private readonly onScroll = () => this.check();

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.zone.runOutsideAngular(() => {
      this.el.nativeElement.addEventListener('scroll', this.onScroll, {
        passive: true,
      });
      this.resizeObserver = new ResizeObserver(() => this.check());
      this.resizeObserver.observe(this.el.nativeElement);
    });
    this.check();
  }

  ngOnDestroy(): void {
    this.el.nativeElement.removeEventListener('scroll', this.onScroll);
    this.resizeObserver?.disconnect();
  }

  private check(): void {
    const el = this.el.nativeElement;
    const hasOverflow =
      el.scrollWidth > el.clientWidth &&
      el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    el.classList.toggle('has-overflow-right', hasOverflow);
  }
}
