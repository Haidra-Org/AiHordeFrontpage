import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { HordeWorker } from '../../../types/horde-worker';
import { Team } from '../../../types/team';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { FormatNumberPipe } from '../../../pipes/format-number.pipe';
import { AuthService } from '../../../services/auth.service';
import {
  UnitConversionService,
  SynthesizedUnit,
} from '../../../services/unit-conversion.service';
import { UnitTooltipComponent } from '../../../components/unit-tooltip/unit-tooltip.component';

@Component({
  selector: 'app-worker-card',
  imports: [
    TranslocoPipe,
    TranslocoModule,
    FormatNumberPipe,
    RouterLink,
    UnitTooltipComponent,
  ],
  templateUrl: './worker-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkerCardComponent {
  private readonly workerService = inject(AdminWorkerService);
  private readonly destroyRef = inject(DestroyRef);
  public readonly auth = inject(AuthService);
  private readonly unitConversion = inject(UnitConversionService);

  public worker = input.required<HordeWorker>();
  public isModerator = input(false);
  public viewMode = input<'admin' | 'public'>('admin');
  public availableTeams = input<Team[]>([]);
  public highlighted = input(false);
  public workerUpdated = output<void>();
  public workerDeleted = output<string>();
  public clearHighlight = output<void>();

  // Dialog state
  public dialogOpen = signal<boolean>(false);
  public dialogType = signal<
    'models' | 'maintenance' | 'pause' | 'delete' | 'team'
  >('models');
  public maintenanceReason = signal<string>('');
  public modelSearch = signal<string>('');
  public isUpdating = signal<boolean>(false);
  public showSuccess = signal<boolean>(false);
  public deleteError = signal<string | null>(null);
  public selectedTeamId = signal<string>('');

  /**
   * Check if the current user is a moderator
   */
  public get isUserModerator(): boolean {
    return this.auth.currentUser()?.moderator ?? false;
  }

  /**
   * Extract user ID from owner string (format: "username#id")
   */
  public getOwnerUserId(): string | null {
    const owner = this.worker().owner;
    if (!owner) return null;
    const match = owner.match(/#(\d+)$/);
    return match ? match[1] : null;
  }

  /**
   * Check if the current authenticated user owns this worker.
   * First checks if the worker ID is in the current user's worker_ids array,
   * then falls back to parsing the owner field (for admin/moderator views).
   */
  public isOwnedByCurrentUser(): boolean {
    const currentUser = this.auth.currentUser();
    if (!currentUser) return false;

    const workerId = this.worker().id;

    // Primary check: Is this worker in the current user's worker_ids list?
    if (currentUser.worker_ids?.includes(workerId)) {
      return true;
    }

    // Fallback: Parse the owner field (for cases where worker_ids isn't available)
    const ownerId = this.getOwnerUserId();
    return !!ownerId && ownerId === `${currentUser.id}`;
  }

  /**
   * Maintenance actions are hidden for public view
   */
  public canToggleMaintenance(): boolean {
    return this.isOwnedByCurrentUser() || this.isModerator();
  }

  public canTogglePause(): boolean {
    return this.viewMode() === 'admin' && this.isUserModerator;
  }

  /**
   * Check if the current user can delete this worker
   * Only moderators or the worker owner can delete
   */
  public canDelete(): boolean {
    return this.isOwnedByCurrentUser() || this.isModerator();
  }

  /**
   * Check if the current user can change this worker's team assignment
   * Only moderators or the worker owner can change team
   */
  public canChangeTeam(): boolean {
    return this.isOwnedByCurrentUser() || this.isModerator();
  }

  public hasOwnerName(): boolean {
    return !!this.worker().owner;
  }

  /**
   * Get the display name for the owner (including the ID discriminator)
   */
  public getOwnerDisplayName(): string {
    return this.worker().owner ?? 'Unknown';
  }

  /**
   * Get the model type for routing based on worker type
   * Image and interrogation workers use image models, text workers use text models
   */
  public getModelType(): 'image' | 'text' {
    return this.worker().type === 'text' ? 'text' : 'image';
  }

  /**
   * Generate the router link path for a model
   */
  public getModelLink(modelName: string): string[] {
    return ['/details/models', this.getModelType(), modelName];
  }

  public isHighSpeed(): boolean {
    if (this.worker().type === 'image') {
      return parseFloat(this.worker().performance) > 3.0;
    }
    return false;
  }

  public isLowSpeed(): boolean {
    if (this.worker().type === 'image') {
      return parseFloat(this.worker().performance) < 0.4;
    }
    return false;
  }

  public hasIssue(): boolean {
    const worker = this.worker();
    return (
      !worker.online ||
      worker.paused ||
      worker.maintenance_mode ||
      worker.flagged
    );
  }

  public hasImageCapabilities(): boolean {
    const worker = this.worker();
    return !!(
      worker.img2img ||
      worker.painting ||
      worker['post-processing'] ||
      worker.lora ||
      worker.controlnet ||
      worker.sdxl_controlnet
    );
  }

  public getCardBackground(): string {
    const worker = this.worker();
    let classes = '';

    if (worker.maintenance_mode || worker.paused || worker.flagged) {
      classes = 'worker-card-issue';
    } else {
      classes = 'worker-card-normal';
    }

    if (this.highlighted()) {
      classes += ' worker-card-highlighted';
    }

    return classes;
  }

  /**
   * Emit event to clear the highlight (parent will handle navigation)
   */
  public onClearHighlight(): void {
    this.clearHighlight.emit();
  }

  public formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  public truncateName(name: string, length: number = 30): string {
    return name.length > length ? name.substring(0, length) + '...' : name;
  }

  /**
   * Parse bridge agent string into components.
   * Format: "software_name:version:contact_or_url"
   * Only parses if there are at least 2 colons (3 parts).
   * The contact/URL part may contain additional colons (e.g., https://).
   */
  public getParsedBridgeAgent(): {
    name: string;
    version: string;
    contact: string;
  } | null {
    const agent = this.worker().bridge_agent;
    if (!agent) return null;

    const firstColon = agent.indexOf(':');
    if (firstColon === -1) return null;

    const secondColon = agent.indexOf(':', firstColon + 1);
    if (secondColon === -1) return null;

    const name = agent.substring(0, firstColon);
    const version = agent.substring(firstColon + 1, secondColon);
    const contact = agent.substring(secondColon + 1);

    if (!name || !version || !contact) return null;

    return { name, version, contact };
  }

  public getSortedModels(): string[] {
    return [...(this.worker().models ?? [])].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
  }

  public getFilteredModels(): string[] {
    const search = this.modelSearch().toLowerCase().trim();
    if (!search) {
      return this.getSortedModels();
    }
    return this.getSortedModels().filter((model) =>
      model.toLowerCase().includes(search),
    );
  }

  public onModelSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.modelSearch.set(target.value);
  }

  // Dialog actions
  public openModelsDialog(): void {
    this.dialogType.set('models');
    this.modelSearch.set('');
    this.dialogOpen.set(true);
  }

  public openMaintenanceDialog(): void {
    this.dialogType.set('maintenance');
    this.maintenanceReason.set('');
    this.dialogOpen.set(true);
  }

  public openPauseDialog(): void {
    this.dialogType.set('pause');
    this.dialogOpen.set(true);
  }

  public closeDialog(): void {
    this.dialogOpen.set(false);
  }

  public onMaintenanceReasonChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.maintenanceReason.set(target.value);
  }

  public confirmMaintenance(): void {
    this.isUpdating.set(true);

    const setMaintenance = !this.worker().maintenance_mode;

    this.workerService
      .setMaintenance(
        this.worker().id,
        setMaintenance,
        this.maintenanceReason(),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.isUpdating.set(false);
        if (result) {
          this.showSuccess.set(true);
          setTimeout(() => this.showSuccess.set(false), 3000);
          this.workerUpdated.emit();
        }
        this.closeDialog();
      });
  }

  public confirmPause(): void {
    this.isUpdating.set(true);

    const setPaused = !this.worker().paused;

    this.workerService
      .setPaused(this.worker().id, setPaused)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.isUpdating.set(false);
        if (result) {
          this.showSuccess.set(true);
          setTimeout(() => this.showSuccess.set(false), 3000);
          this.workerUpdated.emit();
        }
        this.closeDialog();
      });
  }

  public openDeleteDialog(): void {
    this.dialogType.set('delete');
    this.deleteError.set(null);
    this.dialogOpen.set(true);
  }

  public confirmDelete(): void {
    this.isUpdating.set(true);
    this.deleteError.set(null);

    this.workerService
      .deleteWorker(this.worker().id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.isUpdating.set(false);
        if (result) {
          this.workerDeleted.emit(this.worker().id);
          this.closeDialog();
        } else {
          this.deleteError.set('delete_failed');
        }
      });
  }

  // ============================================================================
  // UNIT CONVERSION METHODS
  // ============================================================================

  /**
   * Get the performance unit for the worker based on its type.
   * Image workers use mps/s, text workers use tokens/s.
   */
  public getPerformanceUnit(): SynthesizedUnit | null {
    const worker = this.worker();
    const performanceValue = parseFloat(worker.performance);

    if (isNaN(performanceValue) || performanceValue === 0) {
      return null;
    }

    if (worker.type === 'image') {
      return this.unitConversion.formatWorkerPerformanceImage(performanceValue);
    } else if (worker.type === 'text') {
      return this.unitConversion.formatWorkerPerformanceText(performanceValue);
    }

    return null;
  }

  /**
   * Get the megapixelsteps generated unit for image workers.
   */
  public getMpsGeneratedUnit(): SynthesizedUnit | null {
    const worker = this.worker();
    if (
      worker.type !== 'image' ||
      worker.megapixelsteps_generated === undefined
    ) {
      return null;
    }

    return this.unitConversion.formatWorkerMegapixelstepsGenerated(
      worker.megapixelsteps_generated,
    );
  }

  /**
   * Get the tokens generated unit for text workers.
   */
  public getTokensGeneratedUnit(): SynthesizedUnit | null {
    const worker = this.worker();
    if (worker.type !== 'text' || worker.tokens_generated === undefined) {
      return null;
    }

    return this.unitConversion.formatWorkerTokensGenerated(
      worker.tokens_generated,
    );
  }

  // ============================================================================
  // TEAM ASSIGNMENT METHODS
  // ============================================================================

  /**
   * Open the team assignment dialog
   */
  public openTeamDialog(): void {
    if (!this.canChangeTeam()) return;

    this.dialogType.set('team');
    this.selectedTeamId.set(this.worker().team?.id ?? '');
    this.dialogOpen.set(true);
  }

  /**
   * Handle team selection change
   */
  public onTeamSelectChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.selectedTeamId.set(target.value);
  }

  /**
   * Confirm team assignment change
   */
  public confirmTeamChange(): void {
    this.isUpdating.set(true);

    // Empty string removes from team, otherwise assign to selected team
    const teamId = this.selectedTeamId();

    this.workerService
      .updateWorker(this.worker().id, { team: teamId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.isUpdating.set(false);
        if (result) {
          this.showSuccess.set(true);
          setTimeout(() => this.showSuccess.set(false), 3000);
          this.workerUpdated.emit();
        }
        this.closeDialog();
      });
  }
}
