import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { setPageTitle } from '../../helper/page-title';
import { TranslatorService } from '../../services/translator.service';
import { StatusService } from '../../services/status.service';
import { NetworkStatusService } from '../../services/network-status.service';
import { IconComponent } from '../../components/icon/icon.component';
import {
  ComponentStatusValue,
  PublicComponent,
  PublicHistoryDay,
  PublicIncident,
  PublicMaintenance,
} from '../../types/status';

/** How a status value reads in the UI: a translation key and a CSS modifier. */
interface StatusView {
  /** transloco key for the human label, e.g. `status.state.operational`. */
  labelKey: string;
  /** BEM modifier suffix used across pills, dots and banner, e.g. `operational`. */
  modifier: string;
  /** Icon name (from `app-icon`) for the headline banner. */
  icon: string;
}

const STATUS_VIEWS: Record<ComponentStatusValue, StatusView> = {
  operational: {
    labelKey: 'status.state.operational',
    modifier: 'operational',
    icon: 'check-circle-filled',
  },
  degraded: {
    labelKey: 'status.state.degraded',
    modifier: 'degraded',
    icon: 'warning-triangle-filled',
  },
  partial: {
    labelKey: 'status.state.partial',
    modifier: 'partial',
    icon: 'warning-triangle-filled',
  },
  down: {
    labelKey: 'status.state.down',
    modifier: 'down',
    icon: 'x-circle-filled',
  },
  maintenance: {
    labelKey: 'status.state.maintenance',
    modifier: 'maintenance',
    icon: 'clock-alt',
  },
  unknown: {
    labelKey: 'status.state.unknown',
    modifier: 'unknown',
    icon: 'question-mark-circle',
  },
};

@Component({
  selector: 'app-status',
  imports: [TranslocoPipe, DecimalPipe, DatePipe, IconComponent],
  templateUrl: './status.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusComponent {
  private readonly status = inject(StatusService);
  public readonly ns = inject(NetworkStatusService);
  private readonly translator = inject(TranslatorService);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  /** Distinguishes "still loading" from "loaded but the backend is down". */
  public readonly loaded = signal(false);
  public readonly components = signal<PublicComponent[] | null>(null);
  public readonly overall = signal<ComponentStatusValue>('unknown');
  public readonly generatedAt = signal<string | null>(null);

  public readonly activeIncidents = signal<PublicIncident[]>([]);
  public readonly resolvedIncidents = signal<PublicIncident[]>([]);
  public readonly maintenance = signal<PublicMaintenance[]>([]);

  /** Per-component 90-day daily buckets, keyed by component id. */
  private readonly histories = signal<Record<string, PublicHistoryDay[]>>({});

  /** True once the components call has returned without any data to show. */
  public readonly backendUnavailable = computed(
    () => this.loaded() && this.components() === null,
  );

  public readonly hasIncidents = computed(
    () => this.activeIncidents().length > 0,
  );

  public readonly hasResolvedIncidents = computed(
    () => this.resolvedIncidents().length > 0,
  );

  constructor() {
    afterNextRender(() => {
      setPageTitle(
        this.translator,
        this.title,
        this.destroyRef,
        'status.title',
      );
      this.load();
    });
  }

  private load(): void {
    this.status
      .getComponents()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => {
        this.loaded.set(true);
        if (!response) return;
        this.components.set(response.components);
        this.overall.set(response.overall);
        this.generatedAt.set(response.generated_at);
        for (const component of response.components) {
          this.loadHistory(component.id);
        }
      });

    this.status
      .getIncidents()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => {
        if (!response) return;
        this.activeIncidents.set(response.active);
        this.resolvedIncidents.set(response.recent_resolved);
      });

    this.status
      .getMaintenance()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => {
        if (!response) return;
        this.maintenance.set(response.windows);
      });
  }

  private loadHistory(componentId: string): void {
    this.status
      .getHistory(componentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => {
        if (!response) return;
        this.histories.update((current) => ({
          ...current,
          [componentId]: response.buckets,
        }));
      });
  }

  public statusView(value: ComponentStatusValue): StatusView {
    return STATUS_VIEWS[value] ?? STATUS_VIEWS.unknown;
  }

  /** Maps an incident severity onto the shared design-system badge class. */
  public severityBadgeClass(severity: string): string {
    const map: Record<string, string> = {
      info: 'badge-info',
      minor: 'badge-warning',
      major: 'badge-danger',
      critical: 'badge-danger',
    };
    return map[severity] ?? 'badge-secondary';
  }

  /** transloco key for the headline banner sentence. */
  public overallSummaryKey(): string {
    return `status.summary.${this.statusView(this.overall()).modifier}`;
  }

  public historyFor(componentId: string): PublicHistoryDay[] {
    return this.histories()[componentId] ?? [];
  }

  /** A day's bar modifier: `ok` | `minor` | `major` | `maintenance`. */
  public historyLevelModifier(level: number): string {
    return ['ok', 'minor', 'major', 'maintenance'][level] ?? 'ok';
  }

  /** transloco key for a history bar's status, e.g. `status.history_level.ok`. */
  public historyLevelLabelKey(level: number): string {
    return `status.history_level.${this.historyLevelModifier(level)}`;
  }
}
