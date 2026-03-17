import {
  Directive,
  inject,
  input,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
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
 */
@Directive({
  selector: '[appStickyHeader]',
  host: {
    '[style.top]': 'topStyle()',
  },
})
export class StickyHeaderDirective implements OnInit, OnDestroy {
  private readonly registry = inject(StickyRegistryService);
  // Kept for StickyRegistryService.register() which needs the HTMLElement for ResizeObserver.
  private readonly host = injectHostElement();

  public readonly appStickyHeader = input<number | null>(null);

  protected readonly topStyle = signal<string | null>(null);
  private registered = false;

  ngOnInit(): void {
    const order = this.appStickyHeader();
    if (order !== null) {
      this.registry.register(this.host, order);
      this.registered = true;
    } else {
      this.topStyle.set('var(--sticky-offset, 0px)');
    }
  }

  ngOnDestroy(): void {
    if (this.registered) {
      this.registry.unregister(this.host);
    } else {
      this.topStyle.set(null);
    }
  }
}
