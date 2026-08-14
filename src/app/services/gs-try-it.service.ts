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
import { ImagePostProcessor } from '../types/style';
import { SettingApply, settingSection } from '../content/settings';
import { sectionIdentity } from '../content/sections';
import { TutorialAnchorService } from './tutorial-anchor.service';

/**
 * What a try-it chip needs the studio to do on its behalf. The studio page
 * registers itself; nothing here reaches into the form.
 */
export interface TryItHost {
  /**
   * Write the named fields, leaving everything else alone, and switch on any
   * post-processors the value needs. Those are added to what the form already
   * runs, never written over it: which of them are genuinely missing is a
   * question only the studio holding the form can answer.
   */
  applyFields(
    fields: Partial<GenerateFormValue>,
    addPostProcessors?: readonly ImagePostProcessor[],
  ): void;
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
  private armedApply: SettingApply | null = null;

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
  public arm(entry: SettingApply): void {
    this.armedApply = entry;
  }

  public consumeArmed(): SettingApply | null {
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
  public apply(entry: SettingApply): void {
    if (!this.host) {
      return;
    }
    if (this.host.currentMode() !== 'advanced') {
      this.host.setMode('advanced');
    }
    this.host.applyFields(entry.fields, entry.addPostProcessors ?? []);
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
   * Ring the row a value landed in. Short-lived on purpose: this is a receipt
   * for something the reader just did, not a step they are being held at. The
   * ringing itself lives with the anchor registry, so a try-it chip and the
   * glossary point at a control the same way and for the same length of time.
   */
  private flash(anchorId: string): void {
    const element = this.anchors.element(anchorId);
    if (!element) {
      return;
    }
    this.anchors.flash(
      element,
      sectionIdentity(settingSection(anchorId))?.className,
    );
  }
}
