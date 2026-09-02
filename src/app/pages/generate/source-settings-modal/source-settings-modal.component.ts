import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';

/** What the reader wants taken from a picture that carries its own settings. */
export type SourceSettingsChoice = 'source' | 'both' | 'settings';

/**
 * The choice offered when a picture handed to the source card turns out to
 * carry the settings that made it. Three things can be wanted from it and no
 * two of them are the same, so it is asked rather than guessed.
 */
@Component({
  selector: 'app-source-settings-modal',
  imports: [TranslocoPipe, IconComponent],
  templateUrl: './source-settings-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourceSettingsModalComponent {
  private readonly document = inject(DOCUMENT);
  private readonly firstRow =
    viewChild<ElementRef<HTMLButtonElement>>('firstRow');
  /** Whatever the reader was on when the picture arrived, to be given back. */
  private readonly returnFocus = this.document
    .activeElement as HTMLElement | null;

  public readonly chose = output<SourceSettingsChoice>();
  public readonly cancelled = output<void>();

  constructor() {
    // The first choice takes focus, which is also what puts Escape in reach of
    // the dialog's own key handler.
    afterNextRender(() => this.firstRow()?.nativeElement.focus());
  }

  public choose(choice: SourceSettingsChoice): void {
    this.chose.emit(choice);
  }

  public cancel(): void {
    this.cancelled.emit();
    queueMicrotask(() => this.returnFocus?.focus());
  }

  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancel();
    }
  }
}
