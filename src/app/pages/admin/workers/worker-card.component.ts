import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  inject,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { HordeWorker } from '../../../types/horde-worker';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import { FormatNumberPipe } from '../../../pipes/format-number.pipe';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-worker-card',
  standalone: true,
  imports: [
    TranslocoPipe,
    TranslocoModule,
    FormatNumberPipe,
    RouterLink,
  ],
  templateUrl: './worker-card.component.html',
  styleUrl: './worker-card.component.css',
})
export class WorkerCardComponent {
  private readonly workerService = inject(AdminWorkerService);
  private readonly destroyRef = inject(DestroyRef);
  public readonly auth = inject(AuthService);

  @Input({ required: true }) worker!: HordeWorker;
  @Input() isModerator: boolean = false;
  @Output() workerUpdated = new EventEmitter<void>();

  /**
   * Extract user ID from owner string (format: "username#id")
   */
  public getOwnerUserId(): string | null {
    if (!this.worker.owner) return null;
    const match = this.worker.owner.match(/#(\d+)$/);
    return match ? match[1] : null;
  }

  /**
   * Get the display name for the owner (including the ID discriminator)
   */
  public getOwnerDisplayName(): string {
    if (!this.worker.owner) return 'Unknown';
    return this.worker.owner;
  }

  // Dialog state
  public dialogOpen = signal<boolean>(false);
  public dialogType = signal<'models' | 'maintenance' | 'pause'>('models');
  public maintenanceReason = signal<string>('');
  public isUpdating = signal<boolean>(false);
  public showSuccess = signal<boolean>(false);

  // Helpers
  public isHighSpeed(): boolean {
    if (this.worker.type === 'image') {
      return parseFloat(this.worker.performance) > 3.0;
    }
    return false;
  }

  public isLowSpeed(): boolean {
    if (this.worker.type === 'image') {
      return parseFloat(this.worker.performance) < 0.4;
    }
    return false;
  }

  public hasIssue(): boolean {
    return !this.worker.online || this.worker.paused || this.worker.maintenance_mode || this.worker.flagged;
  }

  public hasImageCapabilities(): boolean {
    return !!(
      this.worker.img2img ||
      this.worker.painting ||
      this.worker['post-processing'] ||
      this.worker.lora ||
      this.worker.controlnet ||
      this.worker.sdxl_controlnet
    );
  }

  public getCardBackground(): string {
    if (this.worker.maintenance_mode || this.worker.paused || this.worker.flagged) {
      return 'worker-card-issue';
    }
    return 'worker-card-normal';
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
  public getParsedBridgeAgent(): { name: string; version: string; contact: string } | null {
    const agent = this.worker.bridge_agent;
    if (!agent) return null;

    // Find the first two colons
    const firstColon = agent.indexOf(':');
    if (firstColon === -1) return null;

    const secondColon = agent.indexOf(':', firstColon + 1);
    if (secondColon === -1) return null;

    const name = agent.substring(0, firstColon);
    const version = agent.substring(firstColon + 1, secondColon);
    const contact = agent.substring(secondColon + 1);

    // Validate we have all three parts
    if (!name || !version || !contact) return null;

    return { name, version, contact };
  }

  public getSortedModels(): string[] {
    return [...(this.worker.models ?? [])].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
  }

  // Dialog actions
  public openModelsDialog(): void {
    this.dialogType.set('models');
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

    const setMaintenance = !this.worker.maintenance_mode;

    this.workerService
      .setMaintenance(this.worker.id, setMaintenance, this.maintenanceReason())
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

    const setPaused = !this.worker.paused;

    this.workerService
      .setPaused(this.worker.id, setPaused)
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
