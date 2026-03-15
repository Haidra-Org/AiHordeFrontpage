import {
  Directive,
  ElementRef,
  inject,
  input,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { StickyRegistryService } from '../services/sticky-registry.service';

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
@Directive({ selector: '[appStickyHeader]' })
export class StickyHeaderDirective implements OnInit, OnDestroy {
  private readonly registry = inject(StickyRegistryService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  public readonly appStickyHeader = input<number | null>(null);

  private registered = false;

  ngOnInit(): void {
    const order = this.appStickyHeader();
    if (order !== null) {
      this.registry.register(this.elementRef.nativeElement, order);
      this.registered = true;
    } else {
      // Position below all registered sticky elements without contributing
      this.elementRef.nativeElement.style.top = 'var(--sticky-offset, 0px)';
    }
  }

  ngOnDestroy(): void {
    if (this.registered) {
      this.registry.unregister(this.elementRef.nativeElement);
    } else {
      this.elementRef.nativeElement.style.removeProperty('top');
    }
  }
}
