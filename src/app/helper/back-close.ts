import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, PLATFORM_ID, inject } from '@angular/core';

/**
 * The key a covering layer stamps its own history entry with. Only the layer
 * that pushed an entry takes it back, so a Back press that belongs to something
 * else is never answered twice, and an entry some other navigation has already
 * moved past is never unwound by mistake.
 */
const LAYER_KEY = 'aihordeLayer';

/**
 * How long the page is held where it was after a history move this helper
 * answered. The router restores a scroll position for every entry it knows, a
 * task or two after the move, so the hold has to outlast that rather than fire
 * once.
 */
const HOLD_MS = 200;

let nextLayer = 0;

type View = Window & typeof globalThis;

/**
 * Keep the page where the reader left it across a history move that was not a
 * move through the page. Taking a cover off the screen is a change of size, and
 * a page that jumps to the top under it loses the control the reader was at.
 */
function holdScroll(view: View): void {
  const x = view.scrollX;
  const y = view.scrollY;
  const until = Date.now() + HOLD_MS;
  const again = (): void => {
    view.scrollTo(x, y);
    if (Date.now() < until) {
      view.requestAnimationFrame(again);
    }
  };
  again();
}

/**
 * One covering layer's claim on the system Back gesture.
 *
 * On a phone, Back is the way out of anything covering the screen, and a
 * surface that ignores it costs the reader the whole page and everything they
 * had set up on it. While armed, the layer holds one history entry at the same
 * address and answers the pop itself. The entry carries no URL of its own: the
 * layer is a state of the page, not another page, and a link to it would
 * promise something the page cannot restore.
 *
 * `onBack` says what became of the layer. Returning nothing means it closed,
 * and the claim ends with it. Returning true means it took the gesture but is
 * still on the page (a sheet that came down to its bar), so a fresh entry is
 * pushed and the next Back is answered here too. Returning false declines the
 * gesture, for a layer that covers nothing at the moment; the move then
 * carries on out of the page, so one press by the reader is one step for the
 * reader however many the page took to serve it.
 */
export class BackClose {
  private readonly id = `layer-${nextLayer++}`;
  private armed = false;
  /** Set while the pop about to arrive is this layer's own removal. */
  private unwinding = false;

  constructor(
    private readonly view: View | null,
    private readonly onBack: () => boolean | void,
  ) {
    this.view?.addEventListener('popstate', this.onPopState);
  }

  private readonly onPopState = (): void => {
    if (!this.view) {
      return;
    }
    if (this.unwinding) {
      this.unwinding = false;
      holdScroll(this.view);
      return;
    }
    if (!this.armed) {
      return;
    }
    this.armed = false;
    const taken = this.onBack();
    if (taken === false) {
      this.view.history.back();
      return;
    }
    holdScroll(this.view);
    if (taken === true) {
      this.push();
    }
  };

  private push(): void {
    if (!this.view) {
      return;
    }
    this.armed = true;
    // The router keeps its own bookkeeping in history.state, so the mark is
    // added to what is there rather than written over it.
    this.view.history.pushState(
      { ...(this.view.history.state as object | null), [LAYER_KEY]: this.id },
      '',
    );
  }

  /** Take an entry, so the next Back is answered here. Once per opening. */
  public arm(): void {
    if (this.armed || !this.view) {
      return;
    }
    this.push();
  }

  /**
   * Give the entry back, for a layer closed by any other means. Only the
   * layer's own entry is taken back: something followed a link while the layer
   * was up if it is no longer the one showing, and going back then would leave
   * the page rather than tidy the history.
   */
  public disarm(): void {
    if (!this.armed || !this.view) {
      return;
    }
    this.armed = false;
    const state = this.view.history.state as Record<string, unknown> | null;
    if (state?.[LAYER_KEY] === this.id) {
      this.unwinding = true;
      holdScroll(this.view);
      this.view.history.back();
    }
  }

  public detach(): void {
    this.view?.removeEventListener('popstate', this.onPopState);
    this.disarm();
  }
}

/**
 * A Back-closes handle for the calling component, detached when it is
 * destroyed. Call from a field initializer or a constructor, where injection is
 * available. On the server it holds nothing and does nothing.
 */
export function useBackClose(onBack: () => boolean | void): BackClose {
  const view = isPlatformBrowser(inject(PLATFORM_ID))
    ? inject(DOCUMENT).defaultView
    : null;
  const layer = new BackClose(view, onBack);
  inject(DestroyRef).onDestroy(() => layer.detach());
  return layer;
}
