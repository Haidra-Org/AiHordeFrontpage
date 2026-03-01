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
 */
@Directive({ selector: '[appStickyHeader]' })
export class StickyHeaderDirective implements OnInit, OnDestroy {
  private readonly registry = inject(StickyRegistryService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  public readonly appStickyHeader = input.required<number>();

  ngOnInit(): void {
    this.registry.register(
      this.elementRef.nativeElement,
      this.appStickyHeader(),
    );
  }

  ngOnDestroy(): void {
    this.registry.unregister(this.elementRef.nativeElement);
  }
}
