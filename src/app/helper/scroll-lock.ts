import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { BlockScrollStrategy, Overlay } from '@angular/cdk/overlay';

/**
 * The one place the page behind a covering layer is frozen. Anything that takes
 * the whole screen (the bottom sheet at full, the prompt editor, the style
 * browser) has the same problem: a drag that starts on the layer's own chrome
 * otherwise scrolls the page underneath, which on a phone reads as the layer
 * dragging the form about.
 *
 * CDK's block strategy is what the overlay layer uses, so every layer locks and
 * restores the page the same way, scroll position included. The holder count is
 * what a single strategy instance cannot do on its own: two layers open at once
 * would otherwise have the first to close unlock the page under the second.
 */
@Injectable({ providedIn: 'root' })
export class ScrollLockService {
  private readonly overlay = inject(Overlay);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private strategy: BlockScrollStrategy | null = null;
  private holders = 0;

  public acquire(): void {
    if (!this.isBrowser) {
      return;
    }
    this.holders++;
    if (this.holders === 1) {
      this.strategy ??= this.overlay.scrollStrategies.block();
      this.strategy.enable();
    }
  }

  public release(): void {
    if (!this.isBrowser || this.holders === 0) {
      return;
    }
    this.holders--;
    if (this.holders === 0) {
      this.strategy?.disable();
    }
  }
}

/**
 * One layer's hold on the page. It counts for at most one holder however often
 * it is asked, so a component may call `enable()` from an effect that reruns
 * and still owe exactly one `disable()`.
 */
export class ScrollLock {
  private held = false;

  constructor(private readonly service: ScrollLockService) {}

  public enable(): void {
    if (this.held) {
      return;
    }
    this.held = true;
    this.service.acquire();
  }

  public disable(): void {
    if (!this.held) {
      return;
    }
    this.held = false;
    this.service.release();
  }
}

/**
 * A scroll lock for the calling component, released when it is destroyed. Call
 * from a field initializer or a constructor, where injection is available.
 */
export function useScrollLock(): ScrollLock {
  const lock = new ScrollLock(inject(ScrollLockService));
  inject(DestroyRef).onDestroy(() => lock.disable());
  return lock;
}
