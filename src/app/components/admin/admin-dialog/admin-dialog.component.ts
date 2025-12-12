import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  PLATFORM_ID,
  signal,
  effect,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Reusable confirmation dialog for admin actions.
 * Implements focus trap and returns focus to trigger on close.
 */
@Component({
  selector: 'app-admin-dialog',
  imports: [],
  template: `
    @if (open()) {
      <div class="modal">
        <div
          class="modal-backdrop"
          (click)="onBackdropClick()"
          aria-hidden="true"
        ></div>
        <div
          #dialogPanel
          class="dialog-panel"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="titleId"
          tabindex="-1"
        >
          <h3 [id]="titleId" class="admin-heading-card mb-4">
            {{ title() }}
          </h3>

          <div class="dialog-content mb-6">
            <ng-content />
          </div>

          <div class="flex justify-end gap-3">
            <button
              #cancelButton
              (click)="cancel.emit()"
              class="btn-muted"
              type="button"
              [disabled]="loading()"
            >
              {{ cancelLabel() }}
            </button>
            <button
              #confirmButton
              (click)="confirm.emit()"
              [disabled]="loading()"
              class="btn-primary"
              [class.btn-danger]="variant() === 'danger'"
              type="button"
            >
              @if (loading()) {
                <span class="inline-flex items-center gap-2">
                  <svg
                    class="animate-spin h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      class="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="4"
                    ></circle>
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {{ loadingLabel() || confirmLabel() }}
                </span>
              } @else {
                {{ confirmLabel() }}
              }
            </button>
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDialogComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);

  /** Element that had focus before dialog opened. */
  private previousActiveElement: Element | null = null;

  /** Reference to the dialog panel for focus management. */
  private readonly dialogPanel = viewChild<ElementRef>('dialogPanel');

  // ─────────────────────────────────────────────────────────────────────────
  // INPUTS
  // ─────────────────────────────────────────────────────────────────────────

  /** Whether the dialog is open. */
  public readonly open = input<boolean>(false);

  /** Dialog title. */
  public readonly title = input.required<string>();

  /** Confirm button label. */
  public readonly confirmLabel = input<string>('Confirm');

  /** Cancel button label. */
  public readonly cancelLabel = input<string>('Cancel');

  /** Whether the confirm action is in progress. */
  public readonly loading = input<boolean>(false);

  /** Label to show while loading. */
  public readonly loadingLabel = input<string | undefined>(undefined);

  /** Visual variant: default or danger. */
  public readonly variant = input<'default' | 'danger'>('default');

  /** Whether clicking the backdrop should close the dialog. */
  public readonly closeOnBackdrop = input<boolean>(true);

  // ─────────────────────────────────────────────────────────────────────────
  // OUTPUTS
  // ─────────────────────────────────────────────────────────────────────────

  /** Emits when the confirm button is clicked. */
  public readonly confirm = output<void>();

  /** Emits when the cancel button is clicked or backdrop is clicked. */
  public readonly cancel = output<void>();

  // ─────────────────────────────────────────────────────────────────────────
  // INTERNAL
  // ─────────────────────────────────────────────────────────────────────────

  /** Unique ID for the title element. */
  public readonly titleId = `admin-dialog-title-${Math.random().toString(36).substr(2, 9)}`;

  /** Keyboard event handler reference. */
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    // Effect to manage focus when dialog opens/closes
    effect(() => {
      const isOpen = this.open();
      if (!isPlatformBrowser(this.platformId)) return;

      if (isOpen) {
        this.onOpen();
      } else {
        this.onClose();
      }
    });
  }

  ngOnDestroy(): void {
    this.removeKeyboardHandler();
  }

  public onBackdropClick(): void {
    if (this.closeOnBackdrop() && !this.loading()) {
      this.cancel.emit();
    }
  }

  private onOpen(): void {
    // Store the currently focused element
    this.previousActiveElement = document.activeElement;

    // Add keyboard handler for Escape and focus trap
    this.keydownHandler = (e: KeyboardEvent) => this.handleKeydown(e);
    document.addEventListener('keydown', this.keydownHandler);

    // Focus the dialog panel after a tick to ensure it's rendered
    setTimeout(() => {
      const panel = this.dialogPanel();
      panel?.nativeElement?.focus();
    }, 0);
  }

  private onClose(): void {
    this.removeKeyboardHandler();

    // Return focus to the element that triggered the dialog
    if (
      this.previousActiveElement &&
      this.previousActiveElement instanceof HTMLElement
    ) {
      this.previousActiveElement.focus();
    }
    this.previousActiveElement = null;
  }

  private handleKeydown(event: KeyboardEvent): void {
    // Close on Escape
    if (event.key === 'Escape' && !this.loading()) {
      event.preventDefault();
      this.cancel.emit();
      return;
    }

    // Focus trap on Tab
    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const panel = this.dialogPanel();
    if (!panel) return;

    const focusableElements = panel.nativeElement.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[
      focusableElements.length - 1
    ] as HTMLElement;

    if (event.shiftKey) {
      // Shift+Tab: if on first element, go to last
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab: if on last element, go to first
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  private removeKeyboardHandler(): void {
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
  }
}
