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
import { AuthService } from '../../services/auth.service';
import { IconComponent } from '../../components/icon/icon.component';
import { ModeratorStatusPanelComponent } from './moderator/moderator-status-panel.component';
import {
  ComponentStatusValue,
  PublicComponent,
  PublicHistoryDay,
  PublicIncident,
  PublicMaintenance,
} from '../../types/status';

/**
 * Duration thresholds for the 90-day history bars, mirroring the backend's
 * `BucketThresholds`. A day goes major only when hard-down time crosses an
 * absolute floor OR a fraction of the day's observed signal (whichever is
 * larger), and minor likewise for degraded time. Kept in lockstep with
 * `ai-horde-service-alerts`'s defaults so the client- and server-side
 * classifications agree.
 */
const BAR_MAJOR_DOWN_FLOOR_S = 300;
const BAR_MAJOR_DOWN_FRACTION = 0.01;
const BAR_MINOR_DEGRADED_FLOOR_S = 600;
const BAR_MINOR_DEGRADED_FRACTION = 0.05;

/** A history day's rendered bar: its colour modifier, label, and flap marker. */
interface DayBar {
  /** BEM modifier suffix for the bar: `ok` | `minor` | `major` | `maintenance`. */
  modifier: 'ok' | 'minor' | 'major' | 'maintenance';
  /** transloco key for the bar's status label, e.g. `status.history_level.ok`. */
  labelKey: string;
  /**
   * True when the day stayed green but still saw some down/degraded time below
   * the colouring threshold — rendered as a small marker under the tick so brief
   * instability is visible without being escalated to a full outage.
   */
  flapping: boolean;
}

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
  imports: [
    TranslocoPipe,
    DecimalPipe,
    DatePipe,
    IconComponent,
    ModeratorStatusPanelComponent,
  ],
  templateUrl: './status.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusComponent {
  private readonly status = inject(StatusService);
  public readonly ns = inject(NetworkStatusService);
  private readonly auth = inject(AuthService);
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

  /** Gates the inline moderator console; only AI Horde moderators see it. */
  public readonly isModerator = computed(
    () => this.auth.currentUser()?.moderator === true,
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

  /**
   * Classify a day's bar from its raw per-day seconds, mirroring the backend's
   * duration-weighted thresholds ({@link BAR_MAJOR_DOWN_FLOOR_S} et al).
   *
   * This is deliberately independent of the backend's `status_level`: if the
   * backend ever regresses to a worst-observed rollup again, the page still
   * refuses to paint a whole day red over a few seconds of blip. Sub-threshold
   * down/degraded time surfaces as {@link DayBar.flapping} (a small marker)
   * rather than a coloured bar.
   */
  public dayBar(day: PublicHistoryDay): DayBar {
    const signal =
      day.operational_seconds + day.degraded_seconds + day.down_seconds;
    if (signal === 0) {
      const modifier = day.maintenance_seconds > 0 ? 'maintenance' : 'ok';
      return {
        modifier,
        labelKey: `status.history_level.${modifier}`,
        flapping: false,
      };
    }
    const majorCut = Math.max(
      BAR_MAJOR_DOWN_FLOOR_S,
      BAR_MAJOR_DOWN_FRACTION * signal,
    );
    if (day.down_seconds >= majorCut) {
      return {
        modifier: 'major',
        labelKey: 'status.history_level.major',
        flapping: false,
      };
    }
    const minorCut = Math.max(
      BAR_MINOR_DEGRADED_FLOOR_S,
      BAR_MINOR_DEGRADED_FRACTION * signal,
    );
    if (day.degraded_seconds >= minorCut) {
      return {
        modifier: 'minor',
        labelKey: 'status.history_level.minor',
        flapping: false,
      };
    }
    return {
      modifier: 'ok',
      labelKey: 'status.history_level.ok',
      flapping: day.down_seconds > 0 || day.degraded_seconds > 0,
    };
  }

  /** Compact human duration for tooltips: `15s`, `4m`, `1h 32m`. */
  public formatDuration(seconds: number): string {
    if (seconds >= 3600) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.round((seconds % 3600) / 60);
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    if (seconds >= 60) {
      return `${Math.round(seconds / 60)}m`;
    }
    return `${Math.max(0, Math.round(seconds))}s`;
  }
}
