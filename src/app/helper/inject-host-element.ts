import { ElementRef, inject } from '@angular/core';

/**
 * Type-safe wrapper for inject(ElementRef).nativeElement.
 *
 * This helper exists for the small number of directives that require
 * direct DOM element access for APIs with no Angular abstraction:
 * - IntersectionObserver (scroll-reveal.directive.ts)
 * - ResizeObserver / getBoundingClientRect (sticky-header.directive.ts
 *   via StickyRegistryService)
 *
 * Do NOT use this for:
 * - Class toggling → use host bindings
 * - Style manipulation → use host bindings
 * - Querying child elements → use viewChild()
 * - Click-outside detection → use viewChild() on wrapper element
 * - Creating overlay elements → use CDK Overlay
 */
export function injectHostElement(): HTMLElement {
  const el: unknown = inject(ElementRef).nativeElement;
  if (!(el instanceof HTMLElement)) {
    throw new Error('Directive/component host is not an HTMLElement');
  }
  return el;
}
