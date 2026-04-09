import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { HordeWorker } from '../../../types/horde-worker';
import { WorkerStatusIconComponent } from './worker-status-icon.component';
import { IconComponent } from '../../../components/icon/icon.component';
import { ToastService } from '../../../services/toast.service';
import { AuthService } from '../../../services/auth.service';
import {
  UnitConversionService,
  SynthesizedUnit,
} from '../../../services/unit-conversion.service';
import { UnitTooltipComponent } from '../../../components/unit-tooltip/unit-tooltip.component';

@Component({
  selector: 'app-worker-row',
  imports: [
    TranslocoPipe,
    WorkerStatusIconComponent,
    IconComponent,
    UnitTooltipComponent,
  ],
  templateUrl: './worker-row.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkerRowComponent {
  private readonly toastService = inject(ToastService);
  public readonly auth = inject(AuthService);
  private readonly unitConversion = inject(UnitConversionService);

  public worker = input.required<HordeWorker>();
  public isModerator = input(false);
  public viewMode = input<'admin' | 'public'>('admin');
  public highlighted = input(false);

  public openDetail = output<HordeWorker>();

  public readonly statusType = computed<'online' | 'offline' | 'issue'>(() => {
    const worker = this.worker();
    const showModeratorStates = this.isModerator();
    const hasActiveIssues =
      worker.maintenance_mode ||
      (showModeratorStates && (worker.paused || worker.flagged));

    if (hasActiveIssues) return 'issue';
    if (!worker.online) return 'offline';
    return 'online';
  });

  public readonly modelsCount = computed(
    () => this.worker().models?.length ?? 0,
  );

  public readonly queuedJobs = computed(
    () => this.worker().uncompleted_jobs ?? 0,
  );

  public readonly fulfilledRequests = computed(
    () => this.worker().requests_fulfilled ?? 0,
  );

  public readonly workerThreads = computed(() => this.worker().threads ?? 0);

  public readonly teamLabel = computed(
    () => this.worker().team?.name ?? this.worker().team?.id ?? null,
  );

  public readonly performanceUnit = computed<SynthesizedUnit | null>(() => {
    const worker = this.worker();
    const performanceValue = this.unitConversion.parseWorkerPerformance(
      worker.performance,
    );
    if (performanceValue === 0) return null;
    if (worker.type === 'image') {
      return this.unitConversion.formatWorkerPerformanceImage(performanceValue);
    } else if (worker.type === 'text') {
      return this.unitConversion.formatWorkerPerformanceText(performanceValue);
    }
    return null;
  });

  public readonly isLowSpeed = computed(() => {
    if (this.worker().type !== 'image') return false;
    return (
      this.unitConversion.parseWorkerPerformance(this.worker().performance) <
      0.4
    );
  });

  public readonly isHighSpeed = computed(() => {
    if (this.worker().type !== 'image') return false;
    return (
      this.unitConversion.parseWorkerPerformance(this.worker().performance) >
      3.0
    );
  });

  public readonly activeFlags = computed(() => {
    const worker = this.worker();
    const showModeratorStates = this.isModerator();
    const flags: { type: string; labelKey: string }[] = [];

    if (worker.trusted) {
      flags.push({
        type: 'trusted',
        labelKey: 'admin.workers.card.trusted',
      });
    }
    if (worker.maintenance_mode) {
      flags.push({
        type: 'maintenance',
        labelKey: 'admin.workers.card.maintenance',
      });
    }
    if (showModeratorStates && worker.paused) {
      flags.push({
        type: 'paused',
        labelKey: 'admin.workers.card.paused',
      });
    }
    if (showModeratorStates && worker.flagged) {
      flags.push({
        type: 'flagged',
        labelKey: 'admin.workers.card.flagged',
      });
    }

    return flags;
  });

  public readonly rowClasses = computed(() => {
    const worker = this.worker();
    let classes = 'worker-row';

    if (
      worker.maintenance_mode ||
      worker.paused ||
      worker.flagged ||
      !worker.online
    ) {
      classes += ' worker-row--issue';
    }

    if (this.highlighted()) {
      classes += ' worker-row--highlighted';
    }

    // Domain color tint
    switch (worker.type) {
      case 'image':
        classes += ' worker-row--image';
        break;
      case 'text':
        classes += ' worker-row--text';
        break;
      case 'interrogation':
        classes += ' worker-row--interrogation';
        break;
    }

    return classes;
  });

  public formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  public truncateName(name: string, length = 24): string {
    return name.length > length ? name.substring(0, length) + '…' : name;
  }

  public compactWorkerId(id: string): string {
    if (id.length <= 18) return id;
    return `${id.slice(0, 8)}...${id.slice(-6)}`;
  }

  public formatMetricNumber(value: number): string {
    if (!Number.isFinite(value)) return '—';

    if (Math.abs(value) < 1000) {
      return Math.round(value).toString();
    }

    return new Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }

  public getWorkerTypeIcon(): string {
    switch (this.worker().type) {
      case 'image':
        return 'type_image';
      case 'text':
        return 'type_text';
      case 'interrogation':
        return 'type_interrogation';
      default:
        return 'type_image';
    }
  }

  public getWorkerTypeLabelKey(): string {
    switch (this.worker().type) {
      case 'image':
        return 'admin.workers.type.image';
      case 'text':
        return 'admin.workers.type.text';
      case 'interrogation':
        return 'admin.workers.type.interrogation';
      default:
        return 'admin.workers.type.image';
    }
  }

  public onRowClick(): void {
    this.openDetail.emit(this.worker());
  }

  public onRowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.openDetail.emit(this.worker());
    }
  }

  public async copyName(event: Event): Promise<void> {
    event.stopPropagation();
    const success = await this.copyToClipboard(this.worker().name);
    if (success) {
      this.toastService.success('admin.workers.toast.name_copied', {
        transloco: true,
        messageParams: { name: this.worker().name },
      });
    }
  }

  public async copyId(event: Event): Promise<void> {
    event.stopPropagation();
    const success = await this.copyToClipboard(this.worker().id);
    if (success) {
      this.toastService.success('admin.workers.toast.id_copied', {
        transloco: true,
        messageParams: { id: this.worker().id },
      });
    }
  }

  private async copyToClipboard(text: string): Promise<boolean> {
    try {
      const clipboard = globalThis.navigator?.clipboard;
      if (globalThis.isSecureContext && clipboard?.writeText) {
        await clipboard.writeText(text);
        return true;
      }
    } catch {
      // Async clipboard failed, try fallback
    }

    const body = globalThis.document?.body;
    if (!body) return false;

    const textArea = globalThis.document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.opacity = '0';
    body.append(textArea);
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    try {
      return globalThis.document.execCommand('copy');
    } catch {
      return false;
    } finally {
      textArea.remove();
    }
  }
}
