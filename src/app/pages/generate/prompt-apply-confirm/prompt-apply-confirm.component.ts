import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Asks before a prompt from elsewhere replaces what the reader has written,
 * showing both so the choice is made on the words rather than on a warning.
 */
@Component({
  selector: 'app-prompt-apply-confirm',
  imports: [TranslocoPipe, IconComponent],
  templateUrl: './prompt-apply-confirm.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromptApplyConfirmComponent {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  /**
   * Read once the dialog has rendered rather than when it is built: a prompt
   * chosen in a list that closes in the same pass hands focus back to that
   * list's opener only after this component exists, and that opener is where
   * a cancel should land.
   */
  private returnFocus: HTMLElement | null = null;
  private answered = false;

  /** The prompt in the box now. */
  public readonly current = input.required<string>();
  /** The prompt that would take its place. */
  public readonly incoming = input.required<string>();
  public readonly confirmed = output<{ dontAskAgain: boolean }>();
  public readonly cancelled = output<void>();
  public readonly dontAskAgain = signal(false);

  constructor() {
    const onKeydown = (event: KeyboardEvent): void => this.handleKey(event);
    this.document.addEventListener('keydown', onKeydown);
    this.destroyRef.onDestroy(() =>
      this.document.removeEventListener('keydown', onKeydown),
    );
    afterNextRender(() => {
      const active = this.document.activeElement;
      this.returnFocus =
        active instanceof HTMLElement && active !== this.document.body
          ? active
          : null;
      this.panel()?.nativeElement.focus();
    });
  }

  public toggleDontAskAgain(): void {
    this.dontAskAgain.update((value) => !value);
  }

  public cancel(): void {
    // Escape reaches both the overlay and the document listener that keeps
    // working once focus has wandered out of the dialog.
    if (this.answered) {
      return;
    }
    this.answered = true;
    const target = this.returnFocus;
    this.cancelled.emit();
    queueMicrotask(() => {
      if (target?.isConnected) {
        target.focus();
      }
    });
  }

  public confirm(): void {
    if (this.answered) {
      return;
    }
    this.answered = true;
    this.confirmed.emit({ dontAskAgain: this.dontAskAgain() });
  }

  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancel();
    }
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const panel = this.panel()?.nativeElement;
    if (!panel) {
      return;
    }
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      return;
    }
    if (
      event.shiftKey &&
      (this.document.activeElement === first ||
        this.document.activeElement === panel)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && this.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
