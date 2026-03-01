import {
  Injectable,
  PLATFORM_ID,
  inject,
  signal,
  Signal,
} from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';

interface StickyEntry {
  order: number;
  height: number;
}

/**
 * Tracks all sticky/fixed header elements and exposes the total height they
 * occupy so scroll-to-section logic and CSS can offset content correctly.
 *
 * Sticky elements register themselves via StickyHeaderDirective. The service
 * observes each element with a ResizeObserver so the offset updates
 * automatically when elements resize (e.g. filter panel expands).
 *
 * The live total is also written to the CSS custom property `--sticky-offset`
 * on <html>, enabling pure-CSS solutions like `scroll-padding-top`.
 */
@Injectable({ providedIn: 'root' })
export class StickyRegistryService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);

  private readonly entries = new Map<HTMLElement, StickyEntry>();
  private readonly observers = new Map<HTMLElement, ResizeObserver>();
  private readonly _totalOffset = signal(100); // Default to 100px to avoid "jump" on first scroll before registry populates

  public readonly totalOffset: Signal<number> = this._totalOffset.asReadonly();

  register(element: HTMLElement, order: number): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.entries.set(element, { order, height: 0 });

    const ro = new ResizeObserver(() => this.recalculate());
    ro.observe(element);
    this.observers.set(element, ro);

    this.recalculate();
  }

  unregister(element: HTMLElement): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.entries.delete(element);

    const ro = this.observers.get(element);
    if (ro) {
      ro.disconnect();
      this.observers.delete(element);
    }

    this.recalculate();
  }

  private recalculate(): void {
    let total = 0;
    for (const [element, entry] of this.entries) {
      const height = element.getBoundingClientRect().height;
      entry.height = height;
      total += height;
    }

    this._totalOffset.set(total);
    this.document.documentElement.style.setProperty(
      '--sticky-offset',
      `${total}px`,
    );
  }
}
