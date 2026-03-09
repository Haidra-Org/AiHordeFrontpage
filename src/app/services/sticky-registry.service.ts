import { Injectable, PLATFORM_ID, inject, signal, Signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { Observable } from 'rxjs';

interface StickyEntry {
  order: number;
  height: number;
}

/**
 * Tracks all sticky/fixed header elements and exposes the total height they
 * occupy so scroll-to-section logic and CSS can offset content correctly.
 *
 * Each registered element also receives an inline `top` value equal to the
 * sum of heights of all elements with a lower stacking order, so elements
 * position themselves flush beneath the ones above — no hardcoded CSS needed.
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
  // Default to 100px to avoid "jump" on first scroll before registry populates
  private readonly _totalOffset = signal(100);
  private pendingRecalc = false;

  public readonly totalOffset: Signal<number> = this._totalOffset.asReadonly();
  public readonly totalOffset$: Observable<number> = toObservable(
    this._totalOffset,
  );

  register(element: HTMLElement, order: number): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.entries.set(element, { order, height: 0 });

    const ro = new ResizeObserver(() => this.scheduleRecalculate());
    ro.observe(element);
    this.observers.set(element, ro);

    this.scheduleRecalculate();
  }

  unregister(element: HTMLElement): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.entries.delete(element);
    element.style.removeProperty('top');

    const ro = this.observers.get(element);
    if (ro) {
      ro.disconnect();
      this.observers.delete(element);
    }

    this.scheduleRecalculate();
  }

  /** Returns the computed `top` offset for a specific registered element. */
  offsetFor(element: HTMLElement): number {
    const target = this.entries.get(element);
    if (!target) return 0;

    let top = 0;
    for (const [, entry] of this.entries) {
      if (entry.order < target.order) {
        top += entry.height;
      }
    }
    return top;
  }

  /**
   * Coalesce rapid ResizeObserver callbacks into a single recalculation per
   * animation frame to avoid layout thrashing.
   */
  private scheduleRecalculate(): void {
    if (this.pendingRecalc) return;
    this.pendingRecalc = true;
    requestAnimationFrame(() => {
      this.pendingRecalc = false;
      this.recalculate();
    });
  }

  private recalculate(): void {
    // Snapshot heights and sort by stacking order
    const sorted: { element: HTMLElement; entry: StickyEntry }[] = [];
    for (const [element, entry] of this.entries) {
      entry.height = element.getBoundingClientRect().height;
      sorted.push({ element, entry });
    }
    sorted.sort((a, b) => a.entry.order - b.entry.order);

    // Compute per-element top offset and set inline style
    let runningTop = 0;
    for (const { element, entry } of sorted) {
      element.style.top = `${runningTop}px`;
      runningTop += entry.height;
    }

    this._totalOffset.set(runningTop);
    this.document.documentElement.style.setProperty(
      '--sticky-offset',
      `${runningTop}px`,
    );
  }
}
