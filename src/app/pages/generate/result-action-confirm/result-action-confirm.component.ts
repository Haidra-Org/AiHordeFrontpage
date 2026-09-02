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
import { ResultControlAction } from '../result-control-action';

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ACTION_KEYS: Record<
  ResultControlAction,
  Record<'title' | 'body' | 'confirm', string>
> = {
  variation: {
    title: 'generate.results.confirm_variation_title',
    body: 'generate.results.confirm_variation_body',
    confirm: 'generate.results.confirm_variation_confirm',
  },
  source: {
    title: 'generate.results.confirm_source_title',
    body: 'generate.results.confirm_source_body',
    confirm: 'generate.results.confirm_source_confirm',
  },
  settings: {
    title: 'generate.results.confirm_settings_title',
    body: 'generate.results.confirm_settings_body',
    confirm: 'generate.results.confirm_settings_confirm',
  },
};

/** Confirms an action that will replace part of the current studio request. */
@Component({
  selector: 'app-result-action-confirm',
  imports: [TranslocoPipe, IconComponent],
  templateUrl: './result-action-confirm.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultActionConfirmComponent {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly returnFocus = this.document
    .activeElement as HTMLElement | null;

  public readonly action = input.required<ResultControlAction>();
  public readonly confirmed = output<{ dontAskAgain: boolean }>();
  public readonly cancelled = output<void>();
  public readonly dontAskAgain = signal(false);

  constructor() {
    const onKeydown = (event: KeyboardEvent): void => this.handleKey(event);
    this.document.addEventListener('keydown', onKeydown);
    this.destroyRef.onDestroy(() =>
      this.document.removeEventListener('keydown', onKeydown),
    );
    afterNextRender(() => this.panel()?.nativeElement.focus());
  }

  public key(part: 'title' | 'body' | 'confirm'): string {
    return ACTION_KEYS[this.action()][part];
  }

  public toggleDontAskAgain(): void {
    this.dontAskAgain.update((value) => !value);
  }

  public cancel(): void {
    this.cancelled.emit();
    queueMicrotask(() => this.returnFocus?.focus());
  }

  public confirm(): void {
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
