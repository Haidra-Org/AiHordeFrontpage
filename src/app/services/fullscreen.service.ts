import {
  EffectRef,
  Injectable,
  PLATFORM_ID,
  Signal,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

/** The prefixed half of the API, which is all iPad Safari answers to. */
interface FullscreenCapableElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenCapableDocument extends Document {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

/**
 * Puts one element on the whole screen and says whether it is there.
 *
 * The studio shell hands over its own element, so both panes go with it and the
 * site's header, footer and the browser's own chrome step aside. Every DOM call
 * the feature makes lives here: the standard names with the WebKit ones behind
 * them, since iPad Safari only answers to the prefixed pair.
 *
 * An iPhone puts nothing but video on the screen, so `available` is false there
 * and the controls that offer this are simply not drawn. Leaving is always
 * possible without them: Escape and the system gesture both end it, and the
 * browser's own change event is what this state follows, so it stays true
 * however the reader got out.
 */
@Injectable({ providedIn: 'root' })
export class FullscreenService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT) as FullscreenCapableDocument;

  private readonly _target = signal<HTMLElement | null>(null);
  private readonly _active = signal(false);

  /**
   * The element that would go on the whole screen. A caller borrowing the
   * screen for something of its own reads this first so it can hand back what
   * was here rather than guess at it.
   */
  public readonly target: Signal<HTMLElement | null> =
    this._target.asReadonly();

  /** Whether the shell is on the whole screen right now. */
  public readonly active: Signal<boolean> = this._active.asReadonly();

  /** Whether this browser puts an ordinary element on the whole screen at all. */
  public readonly available: boolean;

  constructor() {
    const browser = isPlatformBrowser(this.platformId);
    this.available =
      browser &&
      (this.document.fullscreenEnabled === true ||
        this.document.webkitFullscreenEnabled === true);

    if (!browser) return;

    this.document.addEventListener('fullscreenchange', this.sync);
    this.document.addEventListener('webkitfullscreenchange', this.sync);
  }

  /** The element that goes on screen. The shell owns it and clears it on the way out. */
  setTarget(element: HTMLElement | null): void {
    this._target.set(element);
  }

  async toggle(): Promise<void> {
    if (this._active()) {
      await this.exit();
      return;
    }
    await this.enter();
  }

  async enter(): Promise<void> {
    const element = this._target() as FullscreenCapableElement | null;
    if (!this.available || !element) return;

    const request =
      element.requestFullscreen?.bind(element) ??
      element.webkitRequestFullscreen?.bind(element);
    if (!request) return;

    // A refused request (a gesture the browser did not count as one) leaves the
    // page as it was; the change event never fires and the state stays false.
    try {
      await request();
    } catch {
      /* empty */
    }
    this.sync();
  }

  async exit(): Promise<void> {
    const doc = this.document;
    const leave =
      doc.exitFullscreen?.bind(doc) ?? doc.webkitExitFullscreen?.bind(doc);
    if (!leave) return;

    try {
      await leave();
    } catch {
      /* empty */
    }
    this.sync();
  }

  private readonly sync = (): void => {
    const current =
      this.document.fullscreenElement ??
      this.document.webkitFullscreenElement ??
      null;
    const target = this._target();
    this._active.set(
      current !== null &&
        target !== null &&
        (current === target || target.contains(current)),
    );
  };
}

/**
 * Put focus back on `element` when the screen is given up.
 *
 * Leaving fullscreen often takes the control that was pressed away with it: a
 * floating button disappears, a menu row closes with its list. Focus then falls
 * to the document body and a keyboard has nowhere to carry on from. This puts
 * it on the given control, and only when it did fall to the body, so it never
 * takes focus back off something the reader moved to themselves.
 *
 * Call from an injection context; the returned handle follows that context's
 * lifetime.
 */
export function restoreFocusOnFullscreenExit(
  element: () => HTMLElement | null | undefined,
): EffectRef {
  const fullscreen = inject(FullscreenService);
  const document = inject(DOCUMENT);
  let wasActive = false;
  return effect(() => {
    const active = fullscreen.active();
    const left = wasActive && !active;
    wasActive = active;
    if (!left) return;

    const target = element();
    if (target && document.activeElement === document.body) {
      target.focus();
    }
  });
}
