import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { combineLatest, finalize, forkJoin } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { DecimalPipe } from '@angular/common';
import { TranslatorService } from '../../../services/translator.service';
import { AiHordeService } from '../../../services/ai-horde.service';
import { UnitConversionService } from '../../../services/unit-conversion.service';
import { HordePerformance } from '../../../types/horde-performance';
import { ImageTotalStats } from '../../../types/image-total-stats';
import { TextTotalStats } from '../../../types/text-total-stats';
import { ImageModelStats } from '../../../types/image-model-stats';
import { TextModelStats } from '../../../types/text-model-stats';
import { UnitTooltipComponent } from '../../../components/unit-tooltip/unit-tooltip.component';

export type UsageTab = 'overview' | 'image' | 'text';
export type TimePeriod = 'day' | 'month' | 'total';

interface ModelUsageEntry {
  name: string;
  count: number;
}

@Component({
  selector: 'app-usage-stats',
  imports: [TranslocoPipe, DecimalPipe, UnitTooltipComponent],
  templateUrl: './usage-stats.component.html',
  styleUrl: './usage-stats.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageStatsComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly aiHorde = inject(AiHordeService);
  private readonly destroyRef = inject(DestroyRef);
  public readonly units = inject(UnitConversionService);

  /** Current active tab. */
  public readonly activeTab = signal<UsageTab>('overview');

  /** Selected time period for model stats. */
  public readonly timePeriod = signal<TimePeriod>('day');

  /** Loading state. */
  public readonly loading = signal(false);

  /** Error message. */
  public readonly error = signal<string | null>(null);

  /** Performance stats. */
  public readonly performance = signal<HordePerformance | null>(null);

  /** Image stats. */
  public readonly imageStats = signal<ImageTotalStats | null>(null);

  /** Text stats. */
  public readonly textStats = signal<TextTotalStats | null>(null);

  /** Image model stats. */
  public readonly imageModelStats = signal<ImageModelStats | null>(null);

  /** Text model stats. */
  public readonly textModelStats = signal<TextModelStats | null>(null);

  /** Search query for filtering models. */
  public readonly searchQuery = signal('');

  /** Sort direction for model tables. */
  public readonly sortDirection = signal<'asc' | 'desc'>('desc');

  /** Computed: sorted image models for selected period. */
  public readonly sortedImageModels = computed(() => {
    const stats = this.imageModelStats();
    if (!stats) return [];

    const period = this.timePeriod();
    const periodData = stats[period] ?? {};
    const query = this.searchQuery().toLowerCase().trim();
    const direction = this.sortDirection();

    let entries: ModelUsageEntry[] = Object.entries(periodData).map(
      ([name, count]) => ({ name, count }),
    );

    // Filter
    if (query) {
      entries = entries.filter((e) => e.name.toLowerCase().includes(query));
    }

    // Sort by count
    entries.sort((a, b) => {
      const diff = a.count - b.count;
      return direction === 'desc' ? -diff : diff;
    });

    return entries;
  });

  /** Computed: sorted text models for selected period. */
  public readonly sortedTextModels = computed(() => {
    const stats = this.textModelStats();
    if (!stats) return [];

    const period = this.timePeriod();
    const periodData = stats[period] ?? {};
    const query = this.searchQuery().toLowerCase().trim();
    const direction = this.sortDirection();

    let entries: ModelUsageEntry[] = Object.entries(periodData).map(
      ([name, count]) => ({ name, count }),
    );

    // Filter
    if (query) {
      entries = entries.filter((e) => e.name.toLowerCase().includes(query));
    }

    // Sort by count
    entries.sort((a, b) => {
      const diff = a.count - b.count;
      return direction === 'desc' ? -diff : diff;
    });

    return entries;
  });

  /** Computed: top 10 image models. */
  public readonly topImageModels = computed(() => {
    return this.sortedImageModels().slice(0, 10);
  });

  /** Computed: top 10 text models. */
  public readonly topTextModels = computed(() => {
    return this.sortedTextModels().slice(0, 10);
  });

  /** Computed: total image model requests for period. */
  public readonly totalImageModelRequests = computed(() => {
    return this.sortedImageModels().reduce((sum, m) => sum + m.count, 0);
  });

  /** Computed: total text model requests for period. */
  public readonly totalTextModelRequests = computed(() => {
    return this.sortedTextModels().reduce((sum, m) => sum + m.count, 0);
  });

  /** Computed: label for current time period. */
  public readonly timePeriodLabel = computed(() => {
    switch (this.timePeriod()) {
      case 'day':
        return 'details.usage.period.day';
      case 'month':
        return 'details.usage.period.month';
      case 'total':
        return 'details.usage.period.total';
    }
  });

  // ============================================================================
  // COMPUTED UNIT CONVERSIONS
  // ============================================================================

  /** Image performance rate (standard images/sec) */
  public readonly imagePerformanceRate = computed(() => {
    const perf = this.performance();
    if (!perf) return null;
    return this.units.formatImagePerformanceRate(
      perf.past_minute_megapixelsteps,
    );
  });

  /** Text performance rate (tokens/sec) */
  public readonly textPerformanceRate = computed(() => {
    const perf = this.performance();
    if (!perf) return null;
    return this.units.formatTextPerformanceRate(perf.past_minute_tokens);
  });

  /** Queued image work (standard images) */
  public readonly queuedImageWork = computed(() => {
    const perf = this.performance();
    if (!perf) return null;
    return this.units.formatQueuedImageWork(perf.queued_megapixelsteps);
  });

  /** Queued text work (tokens) */
  public readonly queuedTextWork = computed(() => {
    const perf = this.performance();
    if (!perf) return null;
    return this.units.formatQueuedTokens(perf.queued_tokens);
  });

  /** Total pixelsteps */
  public readonly totalPixelsteps = computed(() => {
    const stats = this.imageStats();
    if (!stats) return null;
    return this.units.formatTotalPixelsteps(stats.total.ps);
  });

  /** Total tokens */
  public readonly totalTokens = computed(() => {
    const stats = this.textStats();
    if (!stats) return null;
    return this.units.formatTotalTokens(stats.total.tokens);
  });

  ngOnInit(): void {
    combineLatest([
      this.translator.get('details.usage.title'),
      this.translator.get('app_title'),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([usageTitle, appTitle]) => {
        this.title.setTitle(`${usageTitle} | ${appTitle}`);
      });

    this.loadStats();
  }

  public setActiveTab(tab: UsageTab): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.searchQuery.set('');
  }

  public setTimePeriod(period: TimePeriod): void {
    this.timePeriod.set(period);
  }

  public toggleSortDirection(): void {
    this.sortDirection.set(this.sortDirection() === 'desc' ? 'asc' : 'desc');
  }

  public onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  public loadStats(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      performance: this.aiHorde.performance,
      imageStats: this.aiHorde.imageStats,
      textStats: this.aiHorde.textStats,
      imageModelStats: this.aiHorde.getImageModelStats('known'),
      textModelStats: this.aiHorde.getTextModelStats(),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (data) => {
          this.performance.set(data.performance);
          this.imageStats.set(data.imageStats);
          this.textStats.set(data.textStats);
          this.imageModelStats.set(data.imageModelStats);
          this.textModelStats.set(data.textModelStats);
        },
        error: () => {
          this.error.set('Failed to load usage statistics');
        },
      });
  }

  public formatNumber(num: number | undefined): string {
    if (num === undefined || num === null) return '-';
    return num.toLocaleString();
  }

  public getPercentage(value: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  }
}
