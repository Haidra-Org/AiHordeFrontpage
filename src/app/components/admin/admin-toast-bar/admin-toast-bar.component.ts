import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { IconComponent } from '../../../components/icon/icon.component';

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
  imports: [IconComponent],
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
                <app-icon name="check" class="toast-icon" />
              } @else if (toast.type === 'error' || toast.type === 'warning') {
                <app-icon name="warning-triangle" class="toast-icon" />
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
