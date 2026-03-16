import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, IconComponent],
  template: `
    @if (toastService.toasts().length > 0) {
      <div class="toast-container" aria-label="Notifications">
        @for (toast of toastService.toasts(); track toast.id) {
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
                <app-icon name="check" class="toast-icon" aria-hidden="true" />
              } @else {
                <app-icon
                  name="warning-triangle"
                  class="toast-icon"
                  aria-hidden="true"
                />
              }
              <span class="toast-message">
                @if (toast.transloco) {
                  {{ toast.message | transloco: toast.messageParams }}
                } @else {
                  {{ toast.message }}
                }
              </span>
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
              <button
                class="toast-close"
                type="button"
                (click)="toastService.dismiss(toast.id)"
                aria-label="Dismiss notification"
              >
                <app-icon name="x-mark" aria-hidden="true" />
              </button>
            </div>
            @if (toast.details && expandedIds().has(toast.id)) {
              <pre class="toast-details">{{ toast.details }}</pre>
            }
          </div>
        }
      </div>
    }
  `,
})
export class ToastBarComponent {
  public readonly toastService = inject(ToastService);
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
