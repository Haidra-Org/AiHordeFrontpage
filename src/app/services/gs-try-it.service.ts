import { isPlatformBrowser } from '@angular/common';
import {
  Injectable,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  inject,
} from '@angular/core';
import {
  GenerateFormValue,
  GenerateMode,
} from '../pages/generate/generate-form.model';
import { ReferenceApply } from '../pages/generate/reference-data';
import {
  SECTION_IDENTITIES,
  sectionFor,
} from '../pages/generate/section-identity';
import {
  HIGHLIGHT_CLASS,
  TutorialAnchorService,
} from './tutorial-anchor.service';

/** How long an applied field wears the highlight before it is taken off. */
const FLASH_MS = 2500;

/**
 * What a try-it chip needs the studio to do on its behalf. The studio page
 * registers itself; nothing here reaches into the form.
 */
export interface TryItHost {
  /** Write the named fields, leaving everything else alone. */
  applyFields(fields: Partial<GenerateFormValue>): void;
  currentMode(): GenerateMode;
  setMode(mode: GenerateMode): void;
}

/**
 * The reference's "try this value" chips, and what happens when one is pressed.
 *
 * A chip in the dock or the mobile sheet writes its value straight into the
 * form and lights up the row it landed in, borrowing the follow-along
 * tutorial's anchor registry and highlight so the two gestures read as one
 * language. A chip on the routed reference page has no studio to write to, so
 * it arms the value and the studio applies it on arrival: the same one-shot
 * hand-off the Learn page uses to start a tutorial.
 */
@Injectable({ providedIn: 'root' })
export class GsTryItService {
  private readonly anchors = inject(TutorialAnchorService);
  private readonly injector = inject(Injector);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private host: TryItHost | null = null;

  /** The value the reference page asked for, consumed once by the studio. */
  private armedApply: ReferenceApply | null = null;

  private flashed: HTMLElement | null = null;
  /** The `gs-sec--*` class put on {@link flashed}, to take off again. */
  private flashedSection: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  public registerHost(host: TryItHost): void {
    this.host = host;
  }

  public unregisterHost(host: TryItHost): void {
    if (this.host === host) {
      this.host = null;
    }
  }

  /**
   * Ask for a value to be written once the studio is on screen. Held in memory
   * only: a reload should land on the studio the reader left, not on one that
   * silently re-applies a setting they read about days ago.
   */
  public arm(entry: ReferenceApply): void {
    this.armedApply = entry;
  }

  public consumeArmed(): ReferenceApply | null {
    const entry = this.armedApply;
    this.armedApply = null;
    return entry;
  }

  /**
   * Write a value and show where it went. Every field the reference offers
   * lives in the advanced panel, so a reader in simple mode is moved there
   * first: applying a setting into a section they cannot see would leave the
   * chip looking broken.
   */
  public apply(entry: ReferenceApply): void {
    if (!this.host) {
      return;
    }
    if (this.host.currentMode() !== 'advanced') {
      this.host.setMode('advanced');
    }
    this.host.applyFields(entry.fields);
    if (!this.isBrowser) {
      return;
    }
    // The row may only have come into existence with the mode change (or with
    // the toggle the value itself turned on), so the pointing waits a render.
    afterNextRender(() => this.flash(entry.anchorId), {
      injector: this.injector,
    });
  }

  /**
   * Ring the row a value landed in, then let it go again. Short-lived on
   * purpose: this is a receipt for something the reader just did, not a step
   * they are being held at.
   */
  private flash(anchorId: string): void {
    this.clearFlash();
    const element = this.anchors.element(anchorId);
    if (!element) {
      return;
    }
    element.scrollIntoView({
      behavior: this.scrollBehavior(),
      block: 'center',
    });
    // A running tutorial may already be pointing at this very row. Its
    // highlight outlives the flash, so the flash leaves it alone rather than
    // taking it down on its way out.
    if (element.classList.contains(HIGHLIGHT_CLASS)) {
      return;
    }
    element.classList.add(HIGHLIGHT_CLASS);
    const section = sectionFor('help', anchorId);
    if (section) {
      this.flashedSection = SECTION_IDENTITIES[section].className;
      element.classList.add(this.flashedSection);
    }
    this.flashed = element;
    this.timer = setTimeout(() => this.clearFlash(), FLASH_MS);
  }

  /** Take the highlight off, and cancel a pending removal of an earlier one. */
  private clearFlash(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flashed?.classList.remove(HIGHLIGHT_CLASS);
    if (this.flashedSection) {
      this.flashed?.classList.remove(this.flashedSection);
      this.flashedSection = null;
    }
    this.flashed = null;
  }

  private scrollBehavior(): ScrollBehavior {
    const reduced =
      this.isBrowser &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return reduced ? 'auto' : 'smooth';
  }
}
