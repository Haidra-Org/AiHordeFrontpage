import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';
import {
  FullscreenService,
  restoreFocusOnFullscreenExit,
} from '../../services/fullscreen.service';

/**
 * The studio's way onto the whole screen, drawn with the other header tools.
 * It carries its word like the rest of them: a glyph alone in that row is a
 * guess, and on touch there is no tooltip to resolve the guess with.
 *
 * It is the same button both ways round: pressed means the studio has the
 * screen, and pressing it again gives it back. On a browser that only ever
 * shows video that way, a phone still gets the control: the page fills the
 * screen on its own there. Wide, with no browser support at all, nothing is
 * drawn rather than a control that would do nothing.
 *
 * Leaving by the floating button takes that button off the page with it, so
 * focus would land on nothing; this one takes it back when that happens.
 */
@Component({
  selector: 'app-fullscreen-toggle',
  imports: [TranslocoPipe, IconComponent],
  host: { class: 'contents' },
  template: `
    @if (fullscreen.available || fullscreen.phone()) {
      <button
        #toggle
        type="button"
        class="gs-mini-btn"
        (click)="fullscreen.toggle()"
        [attr.aria-pressed]="fullscreen.filling()"
        [attr.aria-label]="labelKey() | transloco"
        [title]="labelKey() | transloco"
      >
        <app-icon
          [name]="
            fullscreen.filling() ? 'arrows-pointing-in' : 'arrows-pointing-out'
          "
          class="gs-ico-sm"
        />
        <span class="gs-mini-btn-label">{{ labelKey() | transloco }}</span>
      </button>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FullscreenToggleComponent {
  public readonly fullscreen = inject(FullscreenService);

  private readonly toggle = viewChild<ElementRef<HTMLButtonElement>>('toggle');

  constructor() {
    restoreFocusOnFullscreenExit(() => this.toggle()?.nativeElement);
  }

  labelKey(): string {
    return this.fullscreen.filling()
      ? 'generate.shell.fullscreen_exit'
      : 'generate.shell.fullscreen';
  }
}
