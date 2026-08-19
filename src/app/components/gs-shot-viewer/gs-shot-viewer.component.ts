import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';

/**
 * One evidence picture, at the size a bounded stage cannot give it.
 *
 * The tutorials show their pictures small in three places (the documentation
 * page's rail, the studio pane, the phone sheet) and every one of them offers
 * the same way to see one whole. That offer is this layer, so a reader meets
 * one full-size view with one close affordance wherever they press.
 *
 * Anything the calling surface wants said under the picture is projected: the
 * walkthrough puts what the run cost there, and the documentation page, which
 * says it in the step prose already, puts nothing.
 */
@Component({
  selector: 'app-gs-shot-viewer',
  imports: [TranslocoPipe, IconComponent],
  template: `
    <div
      #panel
      class="gs-tut-viewer-body"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      [attr.aria-label]="
        'generate.tutorials.enlarged_title' | transloco: { name: label() }
      "
      (keydown)="onKeydown($event)"
    >
      <div class="gs-tut-viewer-top">
        <span class="gs-tut-viewer-name">{{ label() }}</span>
        <button
          #close
          type="button"
          class="gs-tut-viewer-x"
          [attr.aria-label]="'generate.tutorials.enlarge_close' | transloco"
          (click)="closed.emit()"
        >
          <app-icon name="x-mark" class="gs-ico-sm" />
        </button>
      </div>
      <div class="gs-tut-viewer-stage">
        <img
          class="gs-tut-viewer-img"
          [class.gs-tut-img--alpha]="alpha()"
          [src]="src()"
          alt=""
        />
      </div>
      <ng-content />
    </div>
  `,
  // Focusable backdrop, so the press outside has a keyboard equivalent rather
  // than leaving one way out that only a pointer has.
  host: {
    class: 'gs-tut-viewer',
    tabindex: '0',
    '(click)': 'onBackdrop($event)',
    '(keydown.escape)': 'closed.emit()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsShotViewerComponent {
  private readonly injector = inject(Injector);

  public readonly src = input.required<string>();
  /** What the picture is, in words: its title band and its accessible name. */
  public readonly label = input.required<string>();
  /** Whether the picture is read through rather than read on the card. */
  public readonly alpha = input(false);

  public readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly close = viewChild<ElementRef<HTMLButtonElement>>('close');

  constructor() {
    // The picture takes focus as it opens, so the key that closes it and the
    // button that dismisses it are where the reader already is.
    afterNextRender(() => this.panel()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /** The backdrop closes; a press that landed on the panel itself does not. */
  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }

  /**
   * Escape closes. Tab is held inside the layer by hand: the panel carries one
   * control, so keeping focus on it is the whole trap.
   */
  public onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closed.emit();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      this.close()?.nativeElement.focus();
    }
  }
}
