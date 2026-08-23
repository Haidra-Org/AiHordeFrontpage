import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';
import { FullscreenService } from '../../services/fullscreen.service';

/**
 * The studio's way onto the whole screen, drawn with the other header tools.
 *
 * It is the same button both ways round: pressed means the studio has the
 * screen, and pressing it again gives it back. On a browser that only ever
 * shows video that way, nothing is drawn at all rather than a control that
 * would do nothing.
 *
 * Leaving by the floating button takes that button off the page with it, so
 * focus would land on nothing; this one takes it back when that happens.
 */
@Component({
  selector: 'app-fullscreen-toggle',
  imports: [TranslocoPipe, IconComponent],
  host: { class: 'contents' },
  template: `
    @if (fullscreen.available) {
      <button
        #toggle
        type="button"
        class="gs-mini-btn"
        (click)="fullscreen.toggle()"
        [attr.aria-pressed]="fullscreen.active()"
        [attr.aria-label]="labelKey() | transloco"
        [title]="labelKey() | transloco"
      >
        <app-icon
          [name]="
            fullscreen.active() ? 'arrows-pointing-in' : 'arrows-pointing-out'
          "
          class="gs-ico-sm"
        />
      </button>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FullscreenToggleComponent {
  public readonly fullscreen = inject(FullscreenService);

  private readonly document = inject(DOCUMENT);
  private readonly toggle = viewChild<ElementRef<HTMLButtonElement>>('toggle');

  private wasActive = false;

  constructor() {
    effect(() => {
      const active = this.fullscreen.active();
      const left = this.wasActive && !active;
      this.wasActive = active;
      if (!left) return;

      const button = this.toggle()?.nativeElement;
      if (button && this.document.activeElement === this.document.body) {
        button.focus();
      }
    });
  }

  labelKey(): string {
    return this.fullscreen.active()
      ? 'generate.shell.fullscreen_exit'
      : 'generate.shell.fullscreen';
  }
}
