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

/** How long a flashed element wears {@link HIGHLIGHT_CLASS} before it is taken off. */
export const FLASH_MS = 2500;

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

  private flashed: HTMLElement | null = null;
  /** The hue class put on {@link flashed}, to take off again. */
  private flashedHue: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

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

  /**
   * Bring an element onto the screen and ring it for a moment.
   *
   * This is the whole of the flash gesture, and everything that points at
   * something from off-page goes through it: a try-it chip writing a value, the
   * glossary sending a reader to the card a word names. Keeping it here with the
   * class it sets is what stops the two drifting into different lengths and
   * different scroll behaviour.
   *
   * `hueClass` is the section identity the ring should take, where the caller
   * knows one; a highlight the follow-along tutorial is already holding is left
   * exactly as it is, because that one outlives the flash.
   */
  public flash(element: HTMLElement, hueClass?: string): void {
    this.clearFlash();
    element.scrollIntoView({
      behavior: this.scrollBehavior(),
      block: 'center',
    });
    if (element.classList.contains(HIGHLIGHT_CLASS)) {
      return;
    }
    element.classList.add(HIGHLIGHT_CLASS);
    if (hueClass) {
      element.classList.add(hueClass);
      this.flashedHue = hueClass;
    }
    this.flashed = element;
    this.timer = setTimeout(() => this.clearFlash(), FLASH_MS);
  }

  /** Take the ring off, and cancel a pending removal of an earlier one. */
  private clearFlash(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flashed?.classList.remove(HIGHLIGHT_CLASS);
    if (this.flashedHue) {
      this.flashed?.classList.remove(this.flashedHue);
      this.flashedHue = null;
    }
    this.flashed = null;
  }

  private scrollBehavior(): ScrollBehavior {
    const reduced = globalThis.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    return reduced ? 'auto' : 'smooth';
  }
}
