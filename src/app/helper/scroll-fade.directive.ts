import {
  Directive,
  ElementRef,
  inject,
  NgZone,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  Renderer2,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Toggles `has-overflow-right` / `has-overflow-left` on the host when
 * horizontally scrollable content extends beyond the visible area.
 *
 * On non-touch devices, injects left/right arrow buttons that scroll
 * the container on click. Buttons are absolutely positioned so they
 * don't affect StickyRegistryService height calculations.
 */
@Directive({ selector: '[appScrollFade]' })
export class ScrollFadeDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly renderer = inject(Renderer2);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private resizeObserver?: ResizeObserver;
  private leftBtn?: HTMLButtonElement;
  private rightBtn?: HTMLButtonElement;

  private readonly onScroll = () => this.check();

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.createArrowButtons();

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
    this.leftBtn?.remove();
    this.rightBtn?.remove();
  }

  private createArrowButtons(): void {
    const host = this.el.nativeElement;

    this.leftBtn = this.renderer.createElement('button') as HTMLButtonElement;
    this.leftBtn.type = 'button';
    this.leftBtn.className = 'details-tabs-arrow details-tabs-arrow--left';
    this.leftBtn.setAttribute('aria-label', 'Scroll tabs left');
    this.leftBtn.setAttribute('tabindex', '-1');
    this.leftBtn.innerHTML = '\u276E'; // ❮
    this.leftBtn.addEventListener('click', () =>
      host.scrollBy({ left: -200, behavior: 'smooth' }),
    );

    this.rightBtn = this.renderer.createElement('button') as HTMLButtonElement;
    this.rightBtn.type = 'button';
    this.rightBtn.className = 'details-tabs-arrow details-tabs-arrow--right';
    this.rightBtn.setAttribute('aria-label', 'Scroll tabs right');
    this.rightBtn.setAttribute('tabindex', '-1');
    this.rightBtn.innerHTML = '\u276F'; // ❯
    this.rightBtn.addEventListener('click', () =>
      host.scrollBy({ left: 200, behavior: 'smooth' }),
    );

    this.renderer.insertBefore(host, this.leftBtn, host.firstChild);
    this.renderer.appendChild(host, this.rightBtn);
  }

  private check(): void {
    const el = this.el.nativeElement;
    const hasOverflowRight =
      el.scrollWidth > el.clientWidth &&
      el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    const hasOverflowLeft = el.scrollLeft > 2;

    el.classList.toggle('has-overflow-right', hasOverflowRight);
    el.classList.toggle('has-overflow-left', hasOverflowLeft);

    this.leftBtn?.classList.toggle('is-visible', hasOverflowLeft);
    this.rightBtn?.classList.toggle('is-visible', hasOverflowRight);
  }
}
