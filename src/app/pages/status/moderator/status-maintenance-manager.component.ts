import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { AdminDialogComponent } from '../../../components/admin/admin-dialog/admin-dialog.component';
import { StatusAdminService } from '../../../services/status-admin.service';
import { ToastService } from '../../../services/toast.service';
import { extractApiError } from '../../../helper/extract-api-error';
import { AdminComponent, AdminMaintenance } from '../../../types/status';
import { datetimeLocalToIso } from './status-moderator.constants';

/**
 * Lists scheduled maintenance windows and lets a moderator schedule a new
 * window or cancel an existing one.
 */
@Component({
  selector: 'app-status-maintenance-manager',
  imports: [
    TranslocoPipe,
    DatePipe,
    FormsModule,
    IconComponent,
    AdminDialogComponent,
  ],
  templateUrl: './status-maintenance-manager.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusMaintenanceManagerComponent {
  private readonly admin = inject(StatusAdminService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  public readonly components = input<AdminComponent[]>([]);
  public readonly reloadToken = input<number>(0);
  public readonly changed = output<void>();

  public readonly windows = signal<AdminMaintenance[]>([]);
  public readonly loaded = signal(false);

  public readonly creating = signal(false);
  public readonly submitting = signal(false);
  public readonly cancellingId = signal<string | null>(null);

  public readonly formTitle = signal('');
  public readonly formBody = signal('');
  public readonly formStartsAt = signal('');
  public readonly formEndsAt = signal('');
  public readonly formAffected = signal<Set<string>>(new Set());

  constructor() {
    effect(() => {
      this.reloadToken();
      if (isPlatformBrowser(this.platformId)) {
        this.load();
      }
    });
  }

  public load(): void {
    this.admin
      .getMaintenance()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (windows) => {
          this.windows.set(windows);
          this.loaded.set(true);
        },
        error: (err: unknown) => {
          this.loaded.set(true);
          this.toast.show(
            'error',
            extractApiError(err, 'Failed to load maintenance windows'),
          );
        },
      });
  }

  public isAffected(componentId: string): boolean {
    return this.formAffected().has(componentId);
  }

  public toggleAffected(componentId: string): void {
    this.formAffected.update((current) => {
      const next = new Set(current);
      if (next.has(componentId)) {
        next.delete(componentId);
      } else {
        next.add(componentId);
      }
      return next;
    });
  }

  public openCreate(): void {
    this.formTitle.set('');
    this.formBody.set('');
    this.formStartsAt.set('');
    this.formEndsAt.set('');
    this.formAffected.set(new Set());
    this.creating.set(true);
  }

  public closeDialog(): void {
    if (this.submitting()) return;
    this.creating.set(false);
  }

  public submit(): void {
    const startsAt = datetimeLocalToIso(this.formStartsAt());
    const endsAt = datetimeLocalToIso(this.formEndsAt());
    if (!startsAt || !endsAt) {
      this.toast.show('error', 'status.moderator.maintenance.window_required', {
        transloco: true,
      });
      return;
    }

    this.submitting.set(true);
    this.admin
      .createMaintenance({
        title: this.formTitle().trim(),
        body: this.formBody().trim() || undefined,
        starts_at: startsAt,
        ends_at: endsAt,
        affected_components: [...this.formAffected()],
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.creating.set(false);
          this.toast.show(
            'success',
            'status.moderator.maintenance.create_success',
            { transloco: true },
          );
          this.changed.emit();
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.toast.show(
            'error',
            extractApiError(err, 'Failed to schedule maintenance'),
          );
        },
      });
  }

  public cancel(window: AdminMaintenance): void {
    this.cancellingId.set(window.id);
    this.admin.cancelMaintenance(window.id).subscribe({
      next: () => {
        this.cancellingId.set(null);
        this.toast.show(
          'success',
          'status.moderator.maintenance.cancel_success',
          { transloco: true },
        );
        this.changed.emit();
      },
      error: (err: unknown) => {
        this.cancellingId.set(null);
        this.toast.show(
          'error',
          extractApiError(err, 'Failed to cancel maintenance'),
        );
      },
    });
  }
}
