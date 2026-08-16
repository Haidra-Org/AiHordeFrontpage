import { Directive, effect, inject, input, signal } from '@angular/core';
import { StickyRegistryService } from '../services/sticky-registry.service';
import { injectHostElement } from './inject-host-element';

/**
 * Registers a sticky/fixed element with the StickyRegistryService.
 *
 * Usage:
 *   <header class="nav-shell" [appStickyHeader]="0">
 *   <div class="tools-filter-bar" [appStickyHeader]="10">
 *
 * The numeric value is the stacking order (lower = higher on screen).
 * Use intervals of 10 for future insertability.
 *
 * Pass `null` to opt out of registration while still positioning the
 * element below all registered sticky headers via `--sticky-offset`.
 *
 * The order is read as a signal rather than once at init: an element that only
 * pins at some widths passes `null` at the others, and a window resized across
 * that width must add and remove its height from the published offset rather
 * than leave the pages below it offset for a bar that is no longer pinned.
 */
@Directive({
  selector: '[appStickyHeader]',
  host: {
    '[style.top]': 'topStyle()',
  },
})
export class StickyHeaderDirective {
  private readonly registry = inject(StickyRegistryService);
  // Kept for StickyRegistryService.register() which needs the HTMLElement for ResizeObserver.
  private readonly host = injectHostElement();

  public readonly appStickyHeader = input<number | null>(null);

  protected readonly topStyle = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const order = this.appStickyHeader();
      if (order === null) {
        this.topStyle.set('var(--sticky-offset, 0px)');
        onCleanup(() => this.topStyle.set(null));
        return;
      }
      this.registry.register(this.host, order);
      onCleanup(() => this.registry.unregister(this.host));
    });
  }
}
