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
import { Observable } from 'rxjs';
import { IconComponent } from '../../../components/icon/icon.component';
import { AdminDialogComponent } from '../../../components/admin/admin-dialog/admin-dialog.component';
import { StatusAdminService } from '../../../services/status-admin.service';
import { ToastService } from '../../../services/toast.service';
import { extractApiError } from '../../../helper/extract-api-error';
import {
  AdminComponent,
  AdminIncident,
  IncidentSeverity,
  IncidentStatus,
} from '../../../types/status';
import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  INCIDENT_UPDATE_STATUSES,
  severityBadgeClass,
} from './status-moderator.constants';

/** Which incident dialog is currently open, if any. */
type IncidentDialogMode = 'create' | 'update' | 'edit' | 'resolve' | null;

/**
 * Full incident lifecycle management: create incidents, post timeline updates,
 * edit descriptive fields, and resolve. Status transitions deliberately flow
 * through the timeline/resolve actions (not the edit form), matching the
 * backend's `IncidentUpdateRequest` which only patches title/severity/affects.
 */
@Component({
  selector: 'app-status-incident-manager',
  imports: [
    TranslocoPipe,
    DatePipe,
    FormsModule,
    IconComponent,
    AdminDialogComponent,
  ],
  templateUrl: './status-incident-manager.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusIncidentManagerComponent {
  private readonly admin = inject(StatusAdminService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  public readonly components = input<AdminComponent[]>([]);
  /** Bumped by the parent panel after any write to trigger a refetch. */
  public readonly reloadToken = input<number>(0);
  public readonly changed = output<void>();

  public readonly severities = INCIDENT_SEVERITIES;
  public readonly statuses = INCIDENT_STATUSES;
  public readonly updateStatuses = INCIDENT_UPDATE_STATUSES;
  public readonly severityBadgeClass = severityBadgeClass;

  public readonly incidents = signal<AdminIncident[]>([]);
  public readonly loaded = signal(false);
  public readonly includeResolved = signal(false);

  public readonly dialogMode = signal<IncidentDialogMode>(null);
  public readonly activeIncident = signal<AdminIncident | null>(null);
  public readonly submitting = signal(false);

  // Shared form fields, reused across the create/edit/update/resolve dialogs.
  public readonly formTitle = signal('');
  public readonly formSeverity = signal<IncidentSeverity>('minor');
  public readonly formStatus = signal<IncidentStatus>('investigating');
  public readonly formBody = signal('');
  public readonly formAffected = signal<Set<string>>(new Set());

  constructor() {
    effect(() => {
      // Re-run on every reloadToken change (and once on init).
      this.reloadToken();
      if (isPlatformBrowser(this.platformId)) {
        this.load();
      }
    });
  }

  public load(): void {
    this.admin
      .getIncidents(this.includeResolved())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (incidents) => {
          this.incidents.set(incidents);
          this.loaded.set(true);
        },
        error: (err: unknown) => {
          this.loaded.set(true);
          this.toast.show(
            'error',
            extractApiError(err, 'Failed to load incidents'),
          );
        },
      });
  }

  public toggleResolved(value: boolean): void {
    this.includeResolved.set(value);
    this.load();
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
    this.formSeverity.set('minor');
    this.formStatus.set('investigating');
    this.formBody.set('');
    this.formAffected.set(new Set());
    this.activeIncident.set(null);
    this.dialogMode.set('create');
  }

  public openUpdate(incident: AdminIncident): void {
    this.formBody.set('');
    this.formStatus.set('investigating');
    this.activeIncident.set(incident);
    this.dialogMode.set('update');
  }

  public openEdit(incident: AdminIncident): void {
    this.formTitle.set(incident.title);
    this.formSeverity.set(incident.severity);
    this.formAffected.set(new Set(incident.affects));
    this.activeIncident.set(incident);
    this.dialogMode.set('edit');
  }

  public openResolve(incident: AdminIncident): void {
    this.formBody.set('');
    this.activeIncident.set(incident);
    this.dialogMode.set('resolve');
  }

  public closeDialog(): void {
    if (this.submitting()) return;
    this.dialogMode.set(null);
    this.activeIncident.set(null);
  }

  public submit(): void {
    const mode = this.dialogMode();
    if (!mode) return;

    const affected = [...this.formAffected()];
    const incident = this.activeIncident();

    let request$: Observable<AdminIncident> | null = null;
    switch (mode) {
      case 'create':
        request$ = this.admin.createIncident({
          title: this.formTitle().trim(),
          severity: this.formSeverity(),
          status: this.formStatus(),
          affected_components: affected,
          body: this.formBody().trim(),
        });
        break;
      case 'update':
        if (!incident) return;
        request$ = this.admin.postIncidentUpdate(incident.id, {
          body: this.formBody().trim(),
          new_status: this.formStatus(),
        });
        break;
      case 'edit':
        if (!incident) return;
        request$ = this.admin.patchIncident(incident.id, {
          title: this.formTitle().trim(),
          severity: this.formSeverity(),
          affected_components: affected,
        });
        break;
      case 'resolve':
        if (!incident) return;
        request$ = this.admin.resolveIncident(incident.id, {
          body: this.formBody().trim(),
        });
        break;
    }

    if (!request$) return;
    this.submitting.set(true);
    request$.subscribe({
      next: () => {
        this.submitting.set(false);
        this.dialogMode.set(null);
        this.activeIncident.set(null);
        this.toast.show(
          'success',
          `status.moderator.incidents.${mode}_success`,
          {
            transloco: true,
          },
        );
        this.changed.emit();
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.toast.show(
          'error',
          extractApiError(err, 'Incident action failed'),
        );
      },
    });
  }
}
