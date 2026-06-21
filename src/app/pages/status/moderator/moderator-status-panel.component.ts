import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { StatusAdminService } from '../../../services/status-admin.service';
import { ToastService } from '../../../services/toast.service';
import { extractApiError } from '../../../helper/extract-api-error';
import { AdminComponent } from '../../../types/status';
import { StatusComponentOverridesComponent } from './status-component-overrides.component';
import { StatusIncidentManagerComponent } from './status-incident-manager.component';
import { StatusMaintenanceManagerComponent } from './status-maintenance-manager.component';
import { StatusAlertsFeedComponent } from './status-alerts-feed.component';

/**
 * Moderator-only console rendered inline on the public `/status` page when an
 * AI Horde moderator is logged in. It owns the shared component list (used as
 * the affected-component picker by every child surface) and hosts the four
 * privileged surfaces: component overrides, incident management, maintenance
 * windows, and the alert feed.
 *
 * A `reloadToken` is bumped whenever any child performs a write, which the
 * children watch to refetch; writes also invalidate the shared cache, so the
 * public sections above update on their next read.
 */
@Component({
  selector: 'app-moderator-status-panel',
  imports: [
    TranslocoPipe,
    IconComponent,
    StatusComponentOverridesComponent,
    StatusIncidentManagerComponent,
    StatusMaintenanceManagerComponent,
    StatusAlertsFeedComponent,
  ],
  templateUrl: './moderator-status-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModeratorStatusPanelComponent {
  private readonly admin = inject(StatusAdminService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly components = signal<AdminComponent[]>([]);
  public readonly componentsLoaded = signal(false);

  /** Bumped after any child write so every surface refetches fresh data. */
  public readonly reloadToken = signal(0);

  constructor() {
    afterNextRender(() => this.loadComponents());
  }

  public loadComponents(): void {
    this.admin
      .getComponents()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (components) => {
          this.components.set(components);
          this.componentsLoaded.set(true);
        },
        error: (err: unknown) => {
          this.componentsLoaded.set(true);
          this.toast.show(
            'error',
            extractApiError(err, 'Failed to load status components'),
          );
        },
      });
  }

  /** A child wrote something; refresh shared components and signal children. */
  public onChanged(): void {
    this.loadComponents();
    this.reloadToken.update((value) => value + 1);
  }
}
