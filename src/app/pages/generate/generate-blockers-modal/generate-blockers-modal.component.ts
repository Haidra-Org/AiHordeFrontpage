import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import type { FieldAnchorId, SubmitBlocker } from '../request-lint';

/** What a focus trap counts as somewhere to land. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Why a press of Generate sent nothing. Generate stays live whatever state the
 * panel is in, so this is where the answer is given: one row per thing standing
 * in the way, each with the way to the control that answers it.
 *
 * The rows are handed in already worded and already pointed at a control. This
 * dialog neither judges the request nor knows what the panel looks like.
 */
@Component({
  selector: 'app-generate-blockers-modal',
  imports: [TranslocoPipe, IconComponent],
  templateUrl: './generate-blockers-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateBlockersModalComponent {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  public readonly blockers = input.required<readonly SubmitBlocker[]>();

  /** The control the reader chose to be taken to. */
  public readonly goTo = output<FieldAnchorId>();
  public readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    const onKeydown = (event: KeyboardEvent): void => this.handleKey(event);
    this.document.addEventListener('keydown', onKeydown);
    this.destroyRef.onDestroy(() =>
      this.document.removeEventListener('keydown', onKeydown),
    );

    // The dialog itself takes focus rather than the first row's action: the
    // press that opened this must not carry into a jump somewhere else.
    afterNextRender(() => this.panel()?.nativeElement.focus());
  }

  public close(): void {
    this.closed.emit();
  }

  public goToField(anchor: FieldAnchorId): void {
    this.goTo.emit(anchor);
  }

  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const panel = this.panel()?.nativeElement;
    if (!panel) {
      return;
    }
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE),
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (!first || !last) {
      return;
    }
    const active = this.document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
