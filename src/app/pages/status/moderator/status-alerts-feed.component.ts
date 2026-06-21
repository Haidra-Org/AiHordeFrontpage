import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
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
import { AdminDialogComponent } from '../../../components/admin/admin-dialog/admin-dialog.component';
import { StatusAdminService } from '../../../services/status-admin.service';
import { ToastService } from '../../../services/toast.service';
import { extractApiError } from '../../../helper/extract-api-error';
import {
  AdminAlertSummary,
  AdminComponent,
  IncidentSeverity,
} from '../../../types/status';
import { INCIDENT_SEVERITIES } from './status-moderator.constants';

/**
 * Surfaces the moderator alert summary feed (active Alertmanager alerts) and
 * lets a moderator promote an alert into a public/internal incident. Already
 * promoted alerts are flagged and can be hidden via the unpromoted-only toggle.
 */
@Component({
  selector: 'app-status-alerts-feed',
  imports: [TranslocoPipe, DatePipe, FormsModule, AdminDialogComponent],
  templateUrl: './status-alerts-feed.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusAlertsFeedComponent {
  private readonly admin = inject(StatusAdminService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  public readonly components = input<AdminComponent[]>([]);
  public readonly reloadToken = input<number>(0);
  public readonly changed = output<void>();

  public readonly severities = INCIDENT_SEVERITIES;

  public readonly alerts = signal<AdminAlertSummary[]>([]);
  public readonly loaded = signal(false);
  public readonly unpromotedOnly = signal(false);

  public readonly visibleAlerts = computed(() => {
    const all = this.alerts();
    return this.unpromotedOnly()
      ? all.filter((alert) => !alert.promoted_incident_id)
      : all;
  });

  public readonly promoting = signal<AdminAlertSummary | null>(null);
  public readonly submitting = signal(false);

  public readonly formTitle = signal('');
  public readonly formSeverity = signal<IncidentSeverity>('minor');
  public readonly formBody = signal('');
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
      .getAlertSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (alerts) => {
          this.alerts.set(alerts);
          this.loaded.set(true);
        },
        error: (err: unknown) => {
          this.loaded.set(true);
          this.toast.show(
            'error',
            extractApiError(err, 'Failed to load alerts'),
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

  public openPromote(alert: AdminAlertSummary): void {
    this.formTitle.set(alert.summary || alert.alertname);
    this.formSeverity.set(mapAlertSeverity(alert.severity));
    this.formBody.set(alert.summary ?? '');
    const preselected = new Set<string>();
    if (alert.component) {
      preselected.add(alert.component);
    }
    this.formAffected.set(preselected);
    this.promoting.set(alert);
  }

  public closeDialog(): void {
    if (this.submitting()) return;
    this.promoting.set(null);
  }

  public submit(): void {
    const alert = this.promoting();
    if (!alert) return;

    this.submitting.set(true);
    this.admin
      .promoteAlert(alert.fingerprint, {
        title: this.formTitle().trim(),
        severity: this.formSeverity(),
        body: this.formBody().trim(),
        affected_components: [...this.formAffected()],
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.promoting.set(null);
          this.toast.show(
            'success',
            'status.moderator.alerts.promote_success',
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
            extractApiError(err, 'Failed to promote alert'),
          );
        },
      });
  }
}

/** Best-effort map from an Alertmanager severity label to an incident severity. */
function mapAlertSeverity(severity: string | null): IncidentSeverity {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'major';
    case 'info':
    case 'none':
      return 'info';
    default:
      return 'minor';
  }
}
