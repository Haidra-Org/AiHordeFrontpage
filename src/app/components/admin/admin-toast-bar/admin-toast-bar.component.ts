import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * Toast notification type.
 */
export interface AdminToast {
  id: string;
  type: 'success' | 'error' | 'warning';
  message: string;
  details?: string;
}

/**
 * Toast notification bar for admin pages.
 * Displays a stack of dismissible toast messages with appropriate styling.
 */
@Component({
  selector: 'app-admin-toast-bar',
  template: `
    @if (toasts().length > 0) {
      <div class="toast-container">
        @for (toast of toasts(); track toast.id) {
          <div
            class="toast-wrapper"
            [class.toast-success]="toast.type === 'success'"
            [class.toast-error]="toast.type === 'error'"
            [class.toast-warning]="toast.type === 'warning'"
            [attr.role]="toast.type === 'error' ? 'alert' : 'status'"
            [attr.aria-live]="toast.type === 'error' ? 'assertive' : 'polite'"
          >
            <div class="toast">
              @if (toast.type === 'success') {
                <svg
                  class="toast-icon"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              } @else if (toast.type === 'error' || toast.type === 'warning') {
                <svg
                  class="toast-icon"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              }
              <span class="toast-message">{{ toast.message }}</span>
              @if (toast.details) {
                <button
                  class="toast-details-btn"
                  type="button"
                  (click)="toggleDetails(toast.id)"
                  [attr.aria-expanded]="expandedIds().has(toast.id)"
                >
                  {{ expandedIds().has(toast.id) ? 'Hide' : 'Details' }}
                </button>
              }
              @if (showDismiss()) {
                <button
                  class="toast-close"
                  type="button"
                  (click)="dismiss.emit(toast.id)"
                  aria-label="Dismiss"
                >
                  Dismiss
                </button>
              }
            </div>
            @if (toast.details && expandedIds().has(toast.id)) {
              <pre class="toast-details">{{ toast.details }}</pre>
            }
          </div>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminToastBarComponent {
  /** List of toasts to display. */
  public readonly toasts = input<AdminToast[]>([]);

  /** Whether to show dismiss buttons on each toast. */
  public readonly showDismiss = input<boolean>(true);

  /** Emits the toast ID when user clicks dismiss. */
  public readonly dismiss = output<string>();

  /** Tracks which toast IDs have their details expanded. */
  public readonly expandedIds = signal(new Set<string>());

  public toggleDetails(id: string): void {
    this.expandedIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }
}
