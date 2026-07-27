import { Injectable, signal, untracked } from '@angular/core';

/**
 * The CSS hook an addressed anchor wears while something is pointing at it.
 *
 * It lives beside the registry rather than with either of the things that set
 * it: the follow-along tutorial holds it for as long as a step is current, and
 * a try-it chip holds it for a couple of seconds after writing a value, and the
 * reader is meant to read both as the same gesture.
 */
export const HIGHLIGHT_CLASS = 'gs-tut-target';

/**
 * Where the studio's tutorial-addressable controls are on the page.
 *
 * The follow-along tutorial has to point at a field the control panel owns, and
 * the two live in different component trees (the tutorial renders in the results
 * pane). Rather than thread element references up and back down, each field
 * registers itself under a stable id and the tutorial looks it up.
 *
 * Ids reuse the `generate.help.<topic>` vocabulary wherever the field carries a
 * `?` note, so a step can address the field and open its note with one name.
 */
@Injectable({ providedIn: 'root' })
export class TutorialAnchorService {
  private readonly elements = signal<ReadonlyMap<string, HTMLElement>>(
    new Map(),
  );

  /**
   * Registration runs from a directive effect, and reading the map to update it
   * would make that effect depend on its own write. Every mutation here is
   * therefore untracked; only the readers below are reactive.
   */
  public register(id: string, element: HTMLElement): void {
    untracked(() => {
      this.elements.update((current) => {
        const next = new Map(current);
        next.set(id, element);
        return next;
      });
    });
  }

  /**
   * Drop a registration. The element is checked because a field that re-renders
   * registers its replacement before the outgoing one is torn down, and the
   * later cleanup must not remove the live entry.
   */
  public deregister(id: string, element: HTMLElement): void {
    untracked(() => {
      if (this.elements().get(id) !== element) {
        return;
      }
      this.elements.update((current) => {
        const next = new Map(current);
        next.delete(id);
        return next;
      });
    });
  }

  public element(id: string): HTMLElement | null {
    return this.elements().get(id) ?? null;
  }

  public has(id: string): boolean {
    return this.elements().has(id);
  }
}
