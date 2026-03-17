import {
  afterNextRender,
  Directive,
  inject,
  input,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { injectHostElement } from '../helper/inject-host-element';

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
  selector: '[appScrollReveal], [scrollReveal]',
  host: {
    '[class.scroll-reveal]': 'shouldAnimate()',
    '[class.scroll-reveal--visible]': 'isVisible()',
    '[class]': 'delayClass()',
  },
})
export class ScrollRevealDirective {
  // Kept for IntersectionObserver.observe() and getBoundingClientRect() — no Angular abstraction exists.
  private readonly host = injectHostElement();
  private readonly platformId = inject(PLATFORM_ID);

  /** Stagger slot (1-6). Maps to .scroll-reveal-delay-{n} utility class. */
  public scrollRevealDelay = input(0);

  protected readonly shouldAnimate = signal(false);
  protected readonly isVisible = signal(false);
  protected readonly delayClass = signal('');

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;

      const element = this.host;

      // Skip elements that are already in the viewport — avoids a visible
      // hide→show flicker on first paint.
      const rect = element.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) return;

      this.shouldAnimate.set(true);

      const delay = this.scrollRevealDelay();
      if (delay > 0 && delay <= 6) {
        this.delayClass.set(`scroll-reveal-delay-${delay}`);
      }

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              this.isVisible.set(true);
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
