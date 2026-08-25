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
 *
 * A surface with a set of pictures rather than one hands over how many there
 * are and where in the set this one is, and the band grows a step back, a step
 * on and a count. The arrows move the same way from the keyboard. A surface
 * that opens a single picture says none of that and meets the layer it always
 * met.
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
        <span class="gs-tut-viewer-name" aria-live="polite">{{ label() }}</span>
        @if (count() > 1) {
          <div class="gs-tut-viewer-steps">
            <button
              type="button"
              class="gs-tut-viewer-step"
              [attr.aria-label]="'generate.tutorials.enlarge_prev' | transloco"
              (click)="previous.emit()"
            >
              <app-icon name="chevron-left" class="gs-ico-sm" />
            </button>
            <span class="gs-tut-viewer-count">
              {{
                'generate.tutorials.enlarge_step'
                  | transloco: { at: at(), count: count() }
              }}
            </span>
            <button
              type="button"
              class="gs-tut-viewer-step"
              [attr.aria-label]="'generate.tutorials.enlarge_next' | transloco"
              (click)="next.emit()"
            >
              <app-icon name="chevron-right" class="gs-ico-sm" />
            </button>
          </div>
        }
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
  /**
   * How many pictures the calling surface is offering, and which of them this
   * one is, counting from one. A surface that opens one picture leaves both
   * alone and the layer carries nothing but its close.
   */
  public readonly count = input(0);
  public readonly at = input(0);

  public readonly closed = output<void>();
  public readonly previous = output<void>();
  public readonly next = output<void>();

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
   * Escape closes, the arrows step where the caller offers more than one
   * picture, and Tab is held inside the layer by hand: it cycles the band's
   * own controls and never reaches the surface that opened it.
   */
  public onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closed.emit();
      return;
    }
    if (
      this.count() > 1 &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      event.preventDefault();
      event.stopPropagation();
      (event.key === 'ArrowLeft' ? this.previous : this.next).emit();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    event.preventDefault();
    const panel = this.panel()?.nativeElement;
    const buttons = panel
      ? Array.from(panel.querySelectorAll<HTMLElement>('button'))
      : [];
    if (buttons.length === 0) {
      return;
    }
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    const step = event.shiftKey ? -1 : 1;
    const next = at < 0 ? 0 : (at + step + buttons.length) % buttons.length;
    buttons[next].focus();
  }
}
