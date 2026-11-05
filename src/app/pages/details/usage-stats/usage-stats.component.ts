import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  Signal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DecimalPipe } from '@angular/common';
import { TranslatorService } from '../../../services/translator.service';
import { AiHordeService } from '../../../services/ai-horde.service';
import { NetworkStatusService } from '../../../services/network-status.service';
import {
  SynthesizedUnit,
  UnitConversionService,
} from '../../../services/unit-conversion.service';
import { ImageTotalStats } from '../../../types/image-total-stats';
import { TextTotalStats } from '../../../types/text-total-stats';
import { setPageTitle } from '../../../helper/page-title';
import { ImageModelStats } from '../../../types/image-model-stats';
import { TextModelStats } from '../../../types/text-model-stats';
import { UnitTooltipComponent } from '../../../components/unit-tooltip/unit-tooltip.component';
import { InfoTooltipComponent } from '../../../components/info-tooltip/info-tooltip.component';
import { IconComponent } from '../../../components/icon/icon.component';

export type UsageTab = 'overview' | 'image' | 'text';
export type TimePeriod = 'day' | 'month' | 'total';
export type ModelSortField = 'name' | 'count';

/** The five windows the totals endpoints answer with, shortest window first. */
const TOTAL_PERIODS = ['minute', 'hour', 'day', 'month', 'total'] as const;

/** One number on a tile. The unit sits in the label or the note, never in the value. */
interface StatTile {
  key: string;
  labelKey: string;
  value: string;
  /** The unit the value is counted in, printed under it. */
  note?: string;
  /** Set where the note names a converted unit the reader can have explained. */
  unit?: SynthesizedUnit;
  /** The glossary entry behind the label, where one explains the figure. */
  termKey?: string;
}

/** The tiles for one part of the horde: image, text or alchemy. */
interface StatGroup {
  key: 'image' | 'text' | 'alchemy';
  titleKey: string;
  tiles: StatTile[];
}

interface ModelUsageEntry {
  name: string;
  count: number;
  /** A worker offers this model but the official reference does not list it. */
  custom: boolean;
  share: string;
}

@Component({
  selector: 'app-usage-stats',
  imports: [
    TranslocoPipe,
    DecimalPipe,
    UnitTooltipComponent,
    InfoTooltipComponent,
    IconComponent,
  ],
  templateUrl: './usage-stats.component.html',
  styleUrl: './usage-stats.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageStatsComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly transloco = inject(TranslocoService);
  private readonly aiHorde = inject(AiHordeService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  public readonly units = inject(UnitConversionService);

  /** Route parameters as signals. */
  private readonly params: Signal<Record<string, string>> = toSignal(
    this.route.params,
    {
      initialValue: {},
    },
  );

  /** Tab from route (overview, image, text). */
  private readonly routeTab = computed<UsageTab | null>(() => {
    const tab = this.params()['tab'] as string | undefined;
    if (tab === 'overview' || tab === 'image' || tab === 'text') {
      return tab;
    }
    return null;
  });

  /** Current active tab. */
  public readonly activeTab = signal<UsageTab>('overview');

  /** Selected time period for model stats. */
  public readonly timePeriod = signal<TimePeriod>('day');

  /** Loading state. */
  public readonly loading = signal(false);

  /** Error message. */
  public readonly error = signal<string | null>(null);

  /** Performance stats (from shared NetworkStatusService). */
  public readonly performance = this.networkStatus.performance;

  /** Image stats. */
  public readonly imageStats = signal<ImageTotalStats | null>(null);

  /** Text stats. */
  public readonly textStats = signal<TextTotalStats | null>(null);

  /** Image model stats for the models the official reference lists. */
  public readonly imageModelStats = signal<ImageModelStats | null>(null);

  /** Image model stats for the models only a worker offers. */
  public readonly customImageModelStats = signal<ImageModelStats | null>(null);

  /** Text model stats. */
  public readonly textModelStats = signal<TextModelStats | null>(null);

  /** Search query for filtering models. */
  public readonly searchQuery = signal('');

  /** Which column the model tables are ordered by. */
  public readonly sortField = signal<ModelSortField>('count');

  /** Sort direction for model tables. */
  public readonly sortDirection = signal<'asc' | 'desc'>('desc');

  /** The counts behind the image table, models only a worker offers folded in. */
  private readonly imageCounts = computed<Record<string, number>>(() => {
    const known = this.imageModelStats();
    if (!known) return {};
    const period = this.timePeriod();
    return {
      ...(known[period] ?? {}),
      ...(this.customImageModelStats()?.[period] ?? {}),
    };
  });

  private readonly textCounts = computed<Record<string, number>>(
    () => this.textModelStats()?.[this.timePeriod()] ?? {},
  );

  /** How many image models ran at all in the window, whatever the search says. */
  public readonly imageModelsUsed = computed(() =>
    this.countUsed(this.imageCounts()),
  );

  /** How many text models ran at all in the window. */
  public readonly textModelsUsed = computed(() =>
    this.countUsed(this.textCounts()),
  );

  /** What every image model in the period accounts for together. */
  public readonly totalImageModelRequests = computed(() =>
    this.sumCounts(this.imageCounts()),
  );

  /** What every text model in the period accounts for together. */
  public readonly totalTextModelRequests = computed(() =>
    this.sumCounts(this.textCounts()),
  );

  /** Computed: sorted image models for selected period. */
  public readonly sortedImageModels = computed(() =>
    this.buildRows(
      this.imageCounts(),
      new Set(
        Object.keys(this.customImageModelStats()?.[this.timePeriod()] ?? {}),
      ),
      this.totalImageModelRequests(),
    ),
  );

  /** Computed: sorted text models for selected period. */
  public readonly sortedTextModels = computed(() =>
    this.buildRows(
      this.textCounts(),
      new Set<string>(),
      this.totalTextModelRequests(),
    ),
  );

  /** Computed: top 10 image models. */
  public readonly topImageModels = computed(() => {
    return this.sortedImageModels().slice(0, 10);
  });

  /** Computed: top 10 text models. */
  public readonly topTextModels = computed(() => {
    return this.sortedTextModels().slice(0, 10);
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

  /**
   * What the horde is carrying right now, split the way a reader picks a part
   * of it: how many volunteers, how many jobs they can take at once, how many
   * requests are waiting, and how much work that queue holds.
   */
  public readonly liveGroups = computed<StatGroup[]>(() => {
    const perf = this.performance();
    if (!perf) return [];

    const queuedImages = this.queuedImageWork();
    const queuedText = this.queuedTextWork();
    const imageRate = this.imagePerformanceRate();
    const textRate = this.textPerformanceRate();

    return [
      {
        key: 'image',
        titleKey: 'details.usage.group.image',
        tiles: [
          this.countTile(
            'image-workers',
            'details.usage.stat.workers',
            perf.worker_count,
            'help.stats.tooltip.worker_count',
          ),
          this.countTile(
            'image-threads',
            'details.usage.stat.threads',
            perf.thread_count,
          ),
          this.countTile(
            'image-queued',
            'details.usage.stat.queued_requests',
            perf.queued_requests,
            'help.stats.tooltip.queued_requests',
          ),
          this.scaledTile(
            'image-work',
            'details.usage.stat.queued_work',
            queuedImages,
            { termKey: 'help.stats.tooltip.queued_work' },
          ),
          this.scaledTile('image-rate', 'details.usage.stat.rate', imageRate),
        ],
      },
      {
        key: 'text',
        titleKey: 'details.usage.group.text',
        tiles: [
          this.countTile(
            'text-workers',
            'details.usage.stat.workers',
            perf.text_worker_count,
            'help.stats.tooltip.worker_count',
          ),
          this.countTile(
            'text-threads',
            'details.usage.stat.threads',
            perf.text_thread_count,
          ),
          this.countTile(
            'text-queued',
            'details.usage.stat.queued_requests',
            perf.queued_text_requests,
            'help.stats.tooltip.queued_requests',
          ),
          this.scaledTile(
            'text-work',
            'details.usage.stat.queued_work',
            queuedText,
            { termKey: 'help.stats.tooltip.queued_work' },
          ),
          // The pages-per-second figure rounds to nothing at horde scale, so
          // the text rate is read out in tokens.
          this.scaledTile('text-rate', 'details.usage.stat.rate', textRate, {
            useTechnical: true,
          }),
        ],
      },
      {
        key: 'alchemy',
        titleKey: 'details.usage.group.alchemy',
        tiles: [
          this.countTile(
            'alchemy-workers',
            'details.usage.stat.workers',
            perf.interrogator_count,
            'help.stats.tooltip.worker_count',
          ),
          this.countTile(
            'alchemy-threads',
            'details.usage.stat.threads',
            perf.interrogator_thread_count,
          ),
          this.countTile(
            'alchemy-queued',
            'details.usage.stat.queued_forms',
            perf.queued_forms,
          ),
        ],
      },
    ];
  });

  /** Images made in each of the five windows the totals endpoint answers with. */
  public readonly imagePeriodTiles = computed<StatTile[]>(() => {
    const stats = this.imageStats();
    if (!stats) return [];
    return TOTAL_PERIODS.map((period) => {
      const pixelsteps = this.units.formatTotalPixelsteps(stats[period].ps);
      return {
        key: period,
        labelKey: `details.usage.period.${period}`,
        value: this.units.formatCompactNumber(stats[period].images),
        note: pixelsteps.primary.formatted,
        unit: pixelsteps,
      };
    });
  });

  /** Text requests answered in each of the same five windows. */
  public readonly textPeriodTiles = computed<StatTile[]>(() => {
    const stats = this.textStats();
    if (!stats) return [];
    return TOTAL_PERIODS.map((period) => {
      const tokens = this.units.formatTotalTokens(stats[period].tokens);
      return {
        key: period,
        labelKey: `details.usage.period.${period}`,
        value: this.units.formatCompactNumber(stats[period].requests),
        note: tokens.primary.formatted,
        unit: tokens,
      };
    });
  });

  constructor() {
    // Apply initial tab from route.
    effect(() => {
      const routeTab = this.routeTab();
      if (routeTab && this.activeTab() !== routeTab) {
        this.activeTab.set(routeTab);
      }
    });

    // Fetch stats only in the browser after rendering completes.
    // This prevents stale prerendered data from appearing during static builds.
    afterNextRender(() => {
      this.loadStats();
    });
  }

  ngOnInit(): void {
    setPageTitle(
      this.translator,
      this.title,
      this.destroyRef,
      'details.usage.title',
    );
  }

  public setActiveTab(tab: UsageTab): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.searchQuery.set('');
    void this.router.navigate(['/details/usage', tab], { replaceUrl: true });
  }

  public setTimePeriod(period: TimePeriod): void {
    this.timePeriod.set(period);
  }

  /** Pressing the column that is already ordered on turns it around. */
  public setSortField(field: ModelSortField): void {
    if (this.sortField() === field) {
      this.sortDirection.set(this.sortDirection() === 'desc' ? 'asc' : 'desc');
      return;
    }
    this.sortField.set(field);
    this.sortDirection.set(field === 'name' ? 'asc' : 'desc');
  }

  public onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  public loadStats(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      imageStats: this.aiHorde.imageStats,
      textStats: this.aiHorde.textStats,
      imageModelStats: this.aiHorde.getImageModelStats('known'),
      // Asked for on its own rather than taking 'all', because the answer is
      // also what says which models the reference has never heard of.
      customImageModelStats: this.aiHorde.getImageModelStats('custom'),
      textModelStats: this.aiHorde.getTextModelStats(),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (data) => {
          this.imageStats.set(data.imageStats);
          this.textStats.set(data.textStats);
          this.imageModelStats.set(data.imageModelStats);
          this.customImageModelStats.set(data.customImageModelStats);
          this.textModelStats.set(data.textModelStats);
        },
        error: () => {
          this.error.set(this.transloco.translate('details.usage.error'));
        },
      });
  }

  /**
   * A share rounded to whole percent prints most of a long tail as 0%, which
   * reads as "never used" for a model that ran thousands of jobs, so the small
   * end keeps a decimal and anything under a tenth of a percent says so.
   */
  public formatShare(value: number, total: number): string {
    if (total <= 0) return '-';
    const percent = (value / total) * 100;
    if (percent > 0 && percent < 0.1) return '<0.1%';
    if (percent < 10) return `${percent.toFixed(1)}%`;
    return `${Math.round(percent)}%`;
  }

  private countTile(
    key: string,
    labelKey: string,
    value: number,
    termKey?: string,
  ): StatTile {
    return { key, labelKey, value: value.toLocaleString(), termKey };
  }

  /**
   * A converted figure keeps its scale letter with the number and its unit on
   * the note line, so the tile still reads as one number under one label.
   */
  private scaledTile(
    key: string,
    labelKey: string,
    unit: SynthesizedUnit | null,
    options: { useTechnical?: boolean; termKey?: string } = {},
  ): StatTile {
    if (!unit) {
      return { key, labelKey, value: '-', termKey: options.termKey };
    }
    const figure = options.useTechnical ? unit.technical : unit.primary;
    return {
      key,
      labelKey,
      value: `${figure.value.toFixed(1)}${figure.prefixShort}`,
      note: figure.unit,
      unit,
      termKey: options.termKey,
    };
  }

  private countUsed(counts: Record<string, number>): number {
    return Object.entries(counts).filter(
      ([name, count]) => name !== '' && count > 0,
    ).length;
  }

  private sumCounts(counts: Record<string, number>): number {
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
  }

  /** The search and the ordering, applied once for whichever table asks. */
  private buildRows(
    counts: Record<string, number>,
    customNames: ReadonlySet<string>,
    total: number,
  ): ModelUsageEntry[] {
    const query = this.searchQuery().toLowerCase().trim();
    const field = this.sortField();
    const direction = this.sortDirection() === 'desc' ? -1 : 1;

    const entries = Object.entries(counts)
      // A model that ran nothing in the window is not usage, and the horde
      // answers with hundreds of them: every model any worker has ever
      // offered is in the reply, most of them at zero.
      .filter(([name, count]) => name !== '' && count > 0)
      .filter(([name]) => query === '' || name.toLowerCase().includes(query))
      .map(([name, count]) => ({
        name,
        count,
        custom: customNames.has(name),
        share: this.formatShare(count, total),
      }));

    entries.sort((a, b) => {
      const diff =
        field === 'name' ? a.name.localeCompare(b.name) : a.count - b.count;
      return diff * direction;
    });

    return entries;
  }
}
