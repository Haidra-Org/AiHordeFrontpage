import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, PLATFORM_ID, inject } from '@angular/core';

/**
 * The key a covering layer stamps its own history entry with. Only the layer
 * that pushed an entry takes it back, so a Back press that belongs to something
 * else is never answered twice.
 */
const LAYER_KEY = 'aihordeLayer';

let nextLayer = 0;

/**
 * One covering layer's history entry. A layer that takes the screen has to
 * answer the Back gesture, because on a phone that gesture means "put this
 * away" and answering it with a page change loses everything the reader was
 * doing. The entry carries no URL of its own: the layer is a state of the page,
 * not another page, and a link to it would promise something the page cannot
 * restore.
 */
export class BackClose {
  private readonly id = `layer-${nextLayer++}`;
  private held = false;

  constructor(
    private readonly view: (Window & typeof globalThis) | null,
    private readonly onBack: () => void,
  ) {
    this.view?.addEventListener('popstate', this.onPopState);
  }

  private readonly onPopState = (): void => {
    if (!this.held) {
      return;
    }
    this.held = false;
    this.onBack();
  };

  /** Take an entry, so the next Back is answered here. Once per opening. */
  public hold(): void {
    if (this.held || !this.view) {
      return;
    }
    this.held = true;
    this.view.history.pushState(
      { ...(this.view.history.state as object | null), [LAYER_KEY]: this.id },
      '',
    );
  }

  /**
   * Give the entry back, for a layer closed by any other means. Only the
   * layer's own entry is taken back: something followed a link while the layer
   * was up if it is no longer the one showing, and going back then would leave
   * the page rather than tidy the history.
   */
  public release(): void {
    if (!this.held || !this.view) {
      return;
    }
    this.held = false;
    const state = this.view.history.state as Record<string, unknown> | null;
    if (state?.[LAYER_KEY] === this.id) {
      this.view.history.back();
    }
  }

  public detach(): void {
    this.view?.removeEventListener('popstate', this.onPopState);
    this.held = false;
  }
}

/**
 * A Back-closes handle for the calling component, detached when it is
 * destroyed. Call from a field initializer or a constructor, where injection is
 * available. On the server it holds nothing and does nothing.
 */
export function useBackClose(onBack: () => void): BackClose {
  const view = isPlatformBrowser(inject(PLATFORM_ID))
    ? inject(DOCUMENT).defaultView
    : null;
  const layer = new BackClose(view, onBack);
  inject(DestroyRef).onDestroy(() => layer.detach());
  return layer;
}
