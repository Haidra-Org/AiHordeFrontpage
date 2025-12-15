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
import { combineLatest, finalize } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { DecimalPipe } from '@angular/common';
import { TranslatorService } from '../../../services/translator.service';
import { AiHordeService } from '../../../services/ai-horde.service';
import { ActiveModel } from '../../../types/active-model';
import {
  SynthesizedUnit,
  UnitConversionService,
} from '../../../services/unit-conversion.service';
import { UnitTooltipComponent } from '../../../components/unit-tooltip/unit-tooltip.component';

export type ModelsTab = 'image' | 'text';

@Component({
  selector: 'app-models-list',
  imports: [TranslocoPipe, DecimalPipe, UnitTooltipComponent],
  templateUrl: './models-list.component.html',
  styleUrl: './models-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelsListComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly aiHorde = inject(AiHordeService);
  private readonly destroyRef = inject(DestroyRef);
  public readonly unitConversion = inject(UnitConversionService);

  /** Current active tab. */
  public readonly activeTab = signal<ModelsTab>('image');

  /** Loading state. */
  public readonly loading = signal(false);

  /** Error message. */
  public readonly error = signal<string | null>(null);

  /** Image models. */
  public readonly imageModels = signal<ActiveModel[]>([]);

  /** Text models. */
  public readonly textModels = signal<ActiveModel[]>([]);

  /** Search query for filtering models. */
  public readonly searchQuery = signal('');

  /** Sort field. */
  public readonly sortField = signal<'name' | 'count' | 'queued' | 'jobs' | 'eta' | 'performance'>(
    'count',
  );

  /** Sort direction. */
  public readonly sortDirection = signal<'asc' | 'desc'>('desc');

  /** Currently displayed models based on active tab. */
  public readonly currentModels = computed(() => {
    return this.activeTab() === 'image'
      ? this.imageModels()
      : this.textModels();
  });

  /** Filtered and sorted models. */
  public readonly filteredModels = computed(() => {
    const models = this.currentModels();
    const query = this.searchQuery().toLowerCase().trim();
    const field = this.sortField();
    const direction = this.sortDirection();

    // Filter
    let filtered = models;
    if (query) {
      filtered = models.filter((m) => m.name.toLowerCase().includes(query));
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      if (field === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (field === 'count') {
        comparison = (a.count ?? 0) - (b.count ?? 0);
      } else if (field === 'queued') {
        comparison = (a.queued ?? 0) - (b.queued ?? 0);
      } else if (field === 'jobs') {
        comparison = (a.jobs ?? 0) - (b.jobs ?? 0);
      } else if (field === 'eta') {
        comparison = (a.eta ?? 0) - (b.eta ?? 0);
      } else if (field === 'performance') {
        comparison = (a.performance ?? 0) - (b.performance ?? 0);
      }
      return direction === 'asc' ? comparison : -comparison;
    });

    return sorted;
  });

  /** Total worker count for current tab. */
  public readonly totalWorkers = computed(() => {
    return this.currentModels().reduce((sum, m) => sum + (m.count ?? 0), 0);
  });

  /** Total queued jobs for current tab. */
  public readonly totalQueued = computed(() => {
    return this.currentModels().reduce((sum, m) => sum + (m.queued ?? 0), 0);
  });

  /** Total queued formatted with units (megapixelsteps for image, tokens for text). */
  public readonly totalQueuedUnit = computed(() => {
    const total = this.totalQueued();
    if (this.activeTab() === 'image') {
      return this.unitConversion.formatModelQueuedImage(total);
    } else {
      return this.unitConversion.formatModelQueuedText(total);
    }
  });

  /**
   * Get the formatted queued value for a model.
   */
  public getModelQueuedUnit(model: ActiveModel): SynthesizedUnit {
    if (this.activeTab() === 'image') {
      return this.unitConversion.formatModelQueuedImage(model.queued ?? 0);
    } else {
      return this.unitConversion.formatModelQueuedText(model.queued ?? 0);
    }
  }

  /**
   * Get the formatted performance value for a model.
   */
  public getModelPerformanceUnit(model: ActiveModel): SynthesizedUnit | null {
    if (!model.performance || model.performance <= 0) {
      return null;
    }
    if (this.activeTab() === 'image') {
      return this.unitConversion.formatModelPerformanceImage(model.performance);
    } else {
      return this.unitConversion.formatModelPerformanceText(model.performance);
    }
  }

  ngOnInit(): void {
    combineLatest([
      this.translator.get('details.models.title'),
      this.translator.get('app_title'),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([modelsTitle, appTitle]) => {
        this.title.setTitle(`${modelsTitle} | ${appTitle}`);
      });

    // Load initial data
    this.loadModels();
  }

  public setActiveTab(tab: ModelsTab): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.searchQuery.set('');

    // Load models for the new tab if not already loaded
    if (tab === 'image' && this.imageModels().length === 0) {
      this.loadModels();
    } else if (tab === 'text' && this.textModels().length === 0) {
      this.loadModels();
    }
  }

  public loadModels(): void {
    const tab = this.activeTab();
    this.loading.set(true);
    this.error.set(null);

    const observable =
      tab === 'image'
        ? this.aiHorde.getImageModels()
        : this.aiHorde.getTextModels();

    observable
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (models) => {
          if (tab === 'image') {
            this.imageModels.set(models);
          } else {
            this.textModels.set(models);
          }
        },
        error: (err: { message?: string }) => {
          this.error.set(
            err.message ||
              (tab === 'image'
                ? 'Failed to load image models'
                : 'Failed to load text models'),
          );
        },
      });
  }

  public onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  public setSortField(field: 'name' | 'count' | 'queued' | 'jobs' | 'eta' | 'performance'): void {
    if (this.sortField() === field) {
      // Toggle direction
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDirection.set('desc');
    }
  }

  public formatEta(seconds: number | undefined): string {
    if (!seconds || seconds <= 0) return '-';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  }

  public formatNumber(num: number | undefined): string {
    if (num === undefined || num === null) return '-';
    return num.toLocaleString();
  }
}
