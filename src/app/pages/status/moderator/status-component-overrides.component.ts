import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { AdminDialogComponent } from '../../../components/admin/admin-dialog/admin-dialog.component';
import { StatusAdminService } from '../../../services/status-admin.service';
import { ToastService } from '../../../services/toast.service';
import { extractApiError } from '../../../helper/extract-api-error';
import { AdminComponent, ComponentStatusValue } from '../../../types/status';
import { COMPONENT_STATUS_VALUES } from './status-moderator.constants';

/**
 * Lists the privileged component records and lets a moderator force a component
 * into a given status (with an optional reason and expiry), or clear an active
 * override. Reads come from the parent panel; writes go straight to the backend
 * and emit `changed` so the panel refetches.
 */
@Component({
  selector: 'app-status-component-overrides',
  imports: [
    TranslocoPipe,
    DatePipe,
    FormsModule,
    IconComponent,
    AdminDialogComponent,
  ],
  templateUrl: './status-component-overrides.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusComponentOverridesComponent {
  private readonly admin = inject(StatusAdminService);
  private readonly toast = inject(ToastService);

  public readonly components = input<AdminComponent[]>([]);
  public readonly loaded = input<boolean>(false);
  public readonly changed = output<void>();

  public readonly statusOptions = COMPONENT_STATUS_VALUES;

  /** The component currently being edited in the override dialog, if any. */
  public readonly editing = signal<AdminComponent | null>(null);
  public readonly submitting = signal(false);
  public readonly clearingId = signal<string | null>(null);

  public readonly formStatus = signal<ComponentStatusValue>('degraded');
  public readonly formReason = signal('');
  /** Empty string means "no expiry"; otherwise a `datetime-local` value. */
  public readonly formExpiresAt = signal('');

  public openOverride(component: AdminComponent): void {
    this.formStatus.set(component.override_status ?? 'degraded');
    this.formReason.set(component.override_reason ?? '');
    this.formExpiresAt.set(toDatetimeLocal(component.override_expires_at));
    this.editing.set(component);
  }

  public closeDialog(): void {
    if (this.submitting()) return;
    this.editing.set(null);
  }

  public submitOverride(): void {
    const component = this.editing();
    if (!component) return;

    const expires = this.formExpiresAt().trim();
    this.submitting.set(true);
    this.admin
      .setComponentOverride(component.id, {
        target_status: this.formStatus(),
        reason: this.formReason().trim() || undefined,
        expires_at: expires ? new Date(expires).toISOString() : null,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.editing.set(null);
          this.toast.show('success', 'status.moderator.overrides.set_success', {
            transloco: true,
          });
          this.changed.emit();
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.toast.show(
            'error',
            extractApiError(err, 'Failed to set component override'),
          );
        },
      });
  }

  public clearOverride(component: AdminComponent): void {
    this.clearingId.set(component.id);
    this.admin.clearComponentOverride(component.id).subscribe({
      next: () => {
        this.clearingId.set(null);
        this.toast.show('success', 'status.moderator.overrides.clear_success', {
          transloco: true,
        });
        this.changed.emit();
      },
      error: (err: unknown) => {
        this.clearingId.set(null);
        this.toast.show(
          'error',
          extractApiError(err, 'Failed to clear component override'),
        );
      },
    });
  }
}

/** Convert an ISO timestamp (or null) to a `datetime-local` input value. */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  // datetime-local wants local wall-clock time with no timezone suffix.
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
