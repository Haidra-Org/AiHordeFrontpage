import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';

/** A key that is fixed for the page, or read from what the page is showing. */
export type DocsReturnLabel = string | (() => string | null);

/**
 * What the documentation page on screen calls itself, for anything that has to
 * offer the way back to it.
 *
 * A setting chip pressed on a documentation page sends the reader to that
 * setting's entry, and the entry offers the way back by name. That name used to
 * be cut out of the document title, which is a string built for a browser tab:
 * it carries whatever suffix the site appends, it is already translated, and it
 * is nothing the page chose. A page declaring its own key here names itself in
 * the words its nav entry and its heading use, and the offer is translated
 * where it is read rather than where it was stowed.
 *
 * A page declares on construction and the declaration is dropped when the page
 * leaves, so a page that declares nothing reads as having no name to go back to
 * rather than inheriting the last page's.
 */
@Injectable({ providedIn: 'root' })
export class DocsPageContextService {
  /** The key naming the page on screen, or null away from the documentation. */
  public readonly returnLabelKey = signal<string | null>(null);

  /**
   * Say what this page is called. Call from a page's constructor: the effect
   * and the destroy hook are the caller's, so the declaration lives exactly as
   * long as the page does.
   */
  public declare(key: DocsReturnLabel): void {
    const destroyRef = inject(DestroyRef);
    effect(() => {
      this.returnLabelKey.set(typeof key === 'string' ? key : key());
    });
    destroyRef.onDestroy(() => this.returnLabelKey.set(null));
  }
}
