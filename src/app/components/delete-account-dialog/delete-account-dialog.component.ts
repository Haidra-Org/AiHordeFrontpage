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
  computed,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Delete account confirmation dialog.
 * Requires user to type their full username (with discriminator) to confirm.
 */
@Component({
  selector: 'app-delete-account-dialog',
  imports: [FormsModule, TranslocoPipe],
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
          class="dialog-panel dialog-panel-md"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="titleId()"
          tabindex="-1"
        >
          <h3 [id]="titleId()" class="admin-heading-card mb-4">
            {{ title() }}
          </h3>

          <div class="dialog-content mb-6">
            <!-- Warning message -->
            <div class="mb-4 p-4 rounded-lg" [class]="isAlreadyDeleted() ? 'bg-red-900/30 border border-red-700' : 'bg-yellow-900/30 border border-yellow-700'">
              @if (isAlreadyDeleted()) {
                <p class="text-red-300 text-sm">
                  {{ 'profile.delete_account_warning_permanent' | transloco }}
                </p>
              } @else {
                <p class="text-yellow-300 text-sm">
                  {{ 'profile.delete_account_warning_30_days' | transloco }}
                </p>
              }
            </div>

            <!-- Username confirmation input -->
            <div class="mb-4">
              <label for="confirm-username" class="form-label">
                {{ 'profile.delete_account_enter_username' | transloco }}
              </label>
              <p class="text-sm text-gray-400 mb-2">
                {{ 'profile.delete_account_username_hint' | transloco: { username: expectedUsername() } }}
              </p>
              <input
                #usernameInput
                id="confirm-username"
                type="text"
                class="form-input w-full"
                [placeholder]="expectedUsername()"
                [(ngModel)]="inputUsername"
                (input)="onInputChange()"
                autocomplete="off"
              />
            </div>
          </div>

          <div class="flex justify-end gap-3">
            <button
              (click)="cancel.emit()"
              class="btn-muted"
              type="button"
              [disabled]="loading()"
            >
              {{ cancelLabel() }}
            </button>
            <button
              (click)="onConfirm()"
              [disabled]="loading() || !canConfirm()"
              class="btn-primary btn-danger"
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
export class DeleteAccountDialogComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);

  /** Element that had focus before dialog opened. */
  private previousActiveElement: Element | null = null;

  /** Reference to the dialog panel for focus management. */
  private readonly dialogPanel = viewChild<ElementRef>('dialogPanel');

  /** Reference to the username input for focus. */
  private readonly usernameInput = viewChild<ElementRef>('usernameInput');

  // ─────────────────────────────────────────────────────────────────────────
  // INPUTS
  // ─────────────────────────────────────────────────────────────────────────

  /** Whether the dialog is open. */
  public readonly open = input<boolean>(false);

  /** Dialog title. */
  public readonly title = input.required<string>();

  /** Expected username with discriminator (e.g., "Username#12345"). */
  public readonly expectedUsername = input.required<string>();

  /** Whether the user is already marked for deletion. */
  public readonly isAlreadyDeleted = input<boolean>(false);

  /** Confirm button label. */
  public readonly confirmLabel = input<string>('Delete');

  /** Cancel button label. */
  public readonly cancelLabel = input<string>('Cancel');

  /** Whether the confirm action is in progress. */
  public readonly loading = input<boolean>(false);

  /** Label to show while loading. */
  public readonly loadingLabel = input<string | undefined>(undefined);

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

  /**
   * Stable ID for the title element. Derived from the expected username to avoid
   * SSR/client hydration mismatches while still remaining unique per user.
   */
  public readonly titleId = computed(() => {
    const expected = this.expectedUsername();
    const normalized = expected.replace(/[^a-zA-Z0-9_-]/g, '-');
    return `delete-dialog-title-${normalized}`;
  });

  /** Keyboard event handler reference. */
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  /** The username typed by the user. */
  public inputUsername = '';

  /** Whether the confirm button can be clicked. */
  public canConfirm = signal<boolean>(false);

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
    if (!this.loading()) {
      this.cancel.emit();
    }
  }

  public onInputChange(): void {
    // Case-insensitive comparison
    const matches =
      this.inputUsername.toLowerCase() === this.expectedUsername().toLowerCase();
    this.canConfirm.set(matches);
  }

  public onConfirm(): void {
    if (this.canConfirm() && !this.loading()) {
      this.confirm.emit();
    }
  }

  private onOpen(): void {
    // Reset input
    this.inputUsername = '';
    this.canConfirm.set(false);

    // Store the currently focused element
    this.previousActiveElement = document.activeElement;

    // Add keyboard handler for Escape and focus trap
    this.keydownHandler = (e: KeyboardEvent) => this.handleKeydown(e);
    document.addEventListener('keydown', this.keydownHandler);

    // Focus the username input after a tick to ensure it's rendered
    setTimeout(() => {
      const input = this.usernameInput();
      input?.nativeElement?.focus();
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
