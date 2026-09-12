import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';

/** What the reader wants done with a recipe that arrived from elsewhere. */
export type RecipeArrivalChoice = 'replace' | 'prompt' | 'keep';

/**
 * The choice offered when a published example's settings arrive at a studio
 * that is already set up. Three things can be wanted from them and no two are
 * the same, so it is asked rather than guessed: the whole recipe, only the
 * words, or nothing at all.
 */
@Component({
  selector: 'app-recipe-arrival-modal',
  imports: [TranslocoPipe, IconComponent],
  templateUrl: './recipe-arrival-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipeArrivalModalComponent {
  private readonly document = inject(DOCUMENT);
  private readonly firstRow =
    viewChild<ElementRef<HTMLButtonElement>>('firstRow');
  /** Whatever the reader was on when the recipe arrived, to be given back. */
  private readonly returnFocus = this.document
    .activeElement as HTMLElement | null;

  /** What the recipe is a recipe for, so the dialog can name it. */
  public readonly title = input('');

  public readonly chose = output<RecipeArrivalChoice>();

  constructor() {
    // The first choice takes focus, which is also what puts Escape in reach of
    // the dialog's own key handler.
    afterNextRender(() => this.firstRow()?.nativeElement.focus());
  }

  public choose(choice: RecipeArrivalChoice): void {
    this.chose.emit(choice);
    if (choice === 'keep') {
      queueMicrotask(() => this.returnFocus?.focus());
    }
  }

  /** Escape and the backdrop both mean "keep mine": nothing is replaced. */
  public cancel(): void {
    this.choose('keep');
  }

  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancel();
    }
  }

  /** Keep Tab inside the dialog rather than letting it reach the studio. */
  public onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') {
      return;
    }
    const panel = this.panel()?.nativeElement;
    const buttons = panel
      ? Array.from(panel.querySelectorAll<HTMLElement>('button'))
      : [];
    if (buttons.length === 0) {
      return;
    }
    event.preventDefault();
    const at = buttons.indexOf(this.document.activeElement as HTMLElement);
    const step = event.shiftKey ? -1 : 1;
    const next = at < 0 ? 0 : (at + step + buttons.length) % buttons.length;
    buttons.at(next)?.focus();
  }

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
}
