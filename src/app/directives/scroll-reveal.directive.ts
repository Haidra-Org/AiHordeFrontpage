import {
  afterNextRender,
  Directive,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Adds a fade-and-slide entrance animation when an element scrolls into view.
 *
 * Usage:
 *   <div scrollReveal>…</div>
 *   <div scrollReveal [scrollRevealDelay]="2">…</div>   ← stagger slot 1-6
 *
 * Elements already above the fold at hydration time are left untouched so
 * there is no flash-of-invisible content.
 */
@Directive({
  selector: '[scrollReveal]',
})
export class ScrollRevealDirective {
  private readonly el = inject(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);

  /** Stagger slot (1-6). Maps to .scroll-reveal-delay-{n} utility class. */
  public scrollRevealDelay = input(0);

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;

      const element = this.el.nativeElement as HTMLElement;

      // Skip elements that are already in the viewport — avoids a visible
      // hide→show flicker on first paint.
      const rect = element.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) return;

      element.classList.add('scroll-reveal');

      const delay = this.scrollRevealDelay();
      if (delay > 0 && delay <= 6) {
        element.classList.add(`scroll-reveal-delay-${delay}`);
      }

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              element.classList.add('scroll-reveal--visible');
              observer.disconnect();
            }
          }
        },
        { threshold: 0.08, rootMargin: '0px 0px -32px 0px' },
      );

      observer.observe(element);
    });
  }
}
