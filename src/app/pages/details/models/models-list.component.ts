import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { DecimalPipe } from '@angular/common';
import { ScrollFadeComponent } from '../../../helper/scroll-fade.component';
import { StickyHeaderDirective } from '../../../helper/sticky-header.directive';
import { TranslatorService } from '../../../services/translator.service';
import { AiHordeService } from '../../../services/ai-horde.service';
import {
  baselineSupportsControlNet,
  baselineSupportsMask,
  baselineSupportsQrCode,
  baselineSupportsRemix,
  baselineSupportsTransparent,
  ModelReferenceService,
} from '../../../services/model-reference.service';
import { ActiveModel, mergeModelList } from '../../../types/active-model';
import { setPageTitle } from '../../../helper/page-title';
import {
  SynthesizedUnit,
  UnitConversionService,
} from '../../../services/unit-conversion.service';
import { UnitTooltipComponent } from '../../../components/unit-tooltip/unit-tooltip.component';
import { PageIntroComponent } from '../../../components/page-intro/page-intro.component';
import { InfoTooltipComponent } from '../../../components/info-tooltip/info-tooltip.component';
import { IconComponent } from '../../../components/icon/icon.component';
import { baselineLabel, formatParameterCount } from './model-labels';

export type ModelsTab = 'image' | 'text';

/** The columns a reader can order the list by. */
export type ModelsSortField =
  | 'name'
  | 'count'
  | 'queued'
  | 'usage'
  | 'eta'
  | 'performance';

/** Represents an autocomplete suggestion for model search. */
interface ModelSuggestion {
  name: string;
  type: ModelsTab;
  count: number;
}

/** One extra thing a model can do, drawn as a small chip on its row. */
interface ModelCapability {
  id: string;
  labelKey: string;
  icon: string;
}

/** One row of the list: a model, and everything the row prints about it. */
export interface ModelRow {
  model: ActiveModel;
  /** Empty when the reference lists no baseline, or knows no such model. */
  baseline: string;
  /** The family a text model was trained from, as the reference publishes it. */
  family: string;
  /** Weight count of a text model, already shortened for printing. */
  parameters: string;
  nsfw: boolean;
  inpainting: boolean;
  /** How many pictures or texts this model made in the last month. */
  usage: number;
  capabilities: ModelCapability[];
}

/**
 * What a baseline adds beyond making a picture. Each is read from the same
 * table the studio gates its own controls with, so the row and the studio
 * cannot disagree about what a model will accept.
 */
const CAPABILITY_RULES: readonly (ModelCapability & {
  supports: (baseline: string | null) => boolean;
})[] = [
  {
    id: 'controlnet',
    labelKey: 'details.models.capability.controlnet',
    icon: 'adjustments-horizontal',
    supports: baselineSupportsControlNet,
  },
  {
    id: 'mask',
    labelKey: 'details.models.capability.mask',
    icon: 'paintbrush',
    supports: baselineSupportsMask,
  },
  {
    id: 'remix',
    labelKey: 'details.models.capability.remix',
    icon: 'refresh-alt',
    supports: baselineSupportsRemix,
  },
  {
    id: 'qr_code',
    labelKey: 'details.models.capability.qr_code',
    icon: 'squares-2x2',
    supports: baselineSupportsQrCode,
  },
  {
    id: 'transparent',
    labelKey: 'details.models.capability.transparent',
    icon: 'photo-alt',
    supports: baselineSupportsTransparent,
  },
];

@Component({
  selector: 'app-models-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    DecimalPipe,
    UnitTooltipComponent,
    PageIntroComponent,
    InfoTooltipComponent,
    ScrollFadeComponent,
    StickyHeaderDirective,
    IconComponent,
  ],
  templateUrl: './models-list.component.html',
  styleUrl: './models-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class ModelsListComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly aiHorde = inject(AiHordeService);
  private readonly reference = inject(ModelReferenceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  public readonly unitConversion = inject(UnitConversionService);

  /** Route parameters as signals. */
  private readonly params = toSignal(this.route.params, {
    initialValue: {} as Record<string, string>,
  });

  /** Model type from route (image or text). */
  private readonly routeModelType = computed<ModelsTab | null>(() => {
    const type = this.params()['modelType'] as string | undefined;
    if (type === 'image' || type === 'text') {
      return type;
    }
    return null;
  });

  /** Current active tab. */
  public readonly activeTab = signal<ModelsTab>('image');

  /** Loading state. */
  public readonly loading = signal(false);

  /** Error message. */
  public readonly error = signal<string | null>(null);

  /** What the horde says its workers are carrying, per model type. */
  private readonly imageStatus = signal<ActiveModel[]>([]);
  private readonly textStatus = signal<ActiveModel[]>([]);

  /** Requests served in the last month, per model name. */
  private readonly imageUsage = signal<Record<string, number>>({});
  private readonly textUsage = signal<Record<string, number>>({});

  /** Search query for filtering models. */
  public readonly searchQuery = signal('');

  /** The chosen baseline, or null for every baseline. */
  public readonly baselineFilter = signal<string | null>(null);

  /** Whether models nobody is running are left out. */
  public readonly workersOnly = signal(false);

  /** Whether models marked adult are left out. */
  public readonly hideAdult = signal(false);

  /** Sort field. */
  public readonly sortField = signal<ModelsSortField>('count');

  /** Sort direction. */
  public readonly sortDirection = signal<'asc' | 'desc'>('desc');

  /** Track whether initial type has been applied. */
  private initialTypeApplied = false;

  /** Autocomplete dropdown open state. */
  public readonly autocompleteOpen = signal(false);

  /** Currently active suggestion index for keyboard navigation. */
  public readonly activeSuggestionIndex = signal(-1);

  /**
   * The whole image reference with the horde's live counts laid over it, so a
   * model nobody is running is still listed and a model the reference has never
   * heard of is marked as one somebody added themselves.
   */
  private readonly imageModels = computed(() =>
    mergeModelList(this.reference.names(), this.imageStatus()),
  );

  private readonly textModels = computed(() =>
    mergeModelList(this.reference.textNames(), this.textStatus()),
  );

  /** Autocomplete suggestions based on current search query. */
  public readonly autocompleteSuggestions = computed<ModelSuggestion[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return [];

    const suggestions: ModelSuggestion[] = [];
    for (const model of this.imageModels()) {
      if (model.name.toLowerCase().includes(query)) {
        suggestions.push({
          name: model.name,
          type: 'image',
          count: model.count,
        });
      }
    }
    for (const model of this.textModels()) {
      if (model.name.toLowerCase().includes(query)) {
        suggestions.push({
          name: model.name,
          type: 'text',
          count: model.count,
        });
      }
    }

    suggestions.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });

    return suggestions.slice(0, 10);
  });

  /** Every row of the current tab, before any filter. */
  public readonly allRows = computed<ModelRow[]>(() => {
    const tab = this.activeTab();
    const models = tab === 'image' ? this.imageModels() : this.textModels();
    const usage = tab === 'image' ? this.imageUsage() : this.textUsage();
    return models.map((model) =>
      tab === 'image'
        ? this.imageRow(model, usage[model.name] ?? 0)
        : this.textRow(model, usage[model.name] ?? 0),
    );
  });

  /** The baselines the current tab can be narrowed to, most common first. */
  public readonly baselineOptions = computed<string[]>(() => {
    if (this.activeTab() !== 'image') {
      return [];
    }
    const counts = new Map<string, number>();
    for (const row of this.allRows()) {
      if (row.baseline !== '') {
        counts.set(row.baseline, (counts.get(row.baseline) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([baseline]) => baseline);
  });

  /** Filtered and sorted rows. */
  public readonly filteredRows = computed<ModelRow[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const baseline = this.baselineFilter();
    const workersOnly = this.workersOnly();
    const hideAdult = this.hideAdult();
    const field = this.sortField();
    const direction = this.sortDirection();

    const filtered = this.allRows().filter((row) => {
      if (query && !row.model.name.toLowerCase().includes(query)) return false;
      if (baseline !== null && row.baseline !== baseline) return false;
      if (workersOnly && row.model.count === 0) return false;
      if (hideAdult && row.nsfw) return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      if (field === 'name') {
        comparison = a.model.name.localeCompare(b.model.name);
      } else if (field === 'count') {
        comparison = a.model.count - b.model.count;
      } else if (field === 'queued') {
        comparison = (a.model.queued ?? 0) - (b.model.queued ?? 0);
      } else if (field === 'usage') {
        comparison = a.usage - b.usage;
      } else if (field === 'eta') {
        comparison = (a.model.eta ?? 0) - (b.model.eta ?? 0);
      } else if (field === 'performance') {
        comparison = (a.model.performance ?? 0) - (b.model.performance ?? 0);
      }
      if (comparison === 0) {
        comparison = a.model.name.localeCompare(b.model.name);
      }
      return direction === 'asc' ? comparison : -comparison;
    });

    return sorted;
  });

  /** How many models the current tab holds, before any filter. */
  public readonly totalModels = computed(() => this.allRows().length);

  /** Total queued jobs for current tab. */
  public readonly totalQueued = computed(() =>
    this.allRows().reduce((sum, row) => sum + (row.model.queued ?? 0), 0),
  );

  /** Total queued formatted with units (megapixelsteps for image, tokens for text). */
  public readonly totalQueuedUnit = computed(() => {
    const total = this.totalQueued();
    return this.activeTab() === 'image'
      ? this.unitConversion.formatModelQueuedImage(total)
      : this.unitConversion.formatModelQueuedText(total);
  });

  /** Whether anything is narrowing the list. */
  public readonly filtersActive = computed(
    () =>
      this.baselineFilter() !== null ||
      this.workersOnly() ||
      this.hideAdult() ||
      this.searchQuery().trim() !== '',
  );

  private imageRow(model: ActiveModel, usage: number): ModelRow {
    const record = this.reference.recordFor(model.name);
    const baseline = record?.baseline ?? '';
    return {
      model,
      baseline,
      family: '',
      parameters: '',
      nsfw: record?.nsfw ?? false,
      inpainting: record?.inpainting ?? false,
      usage,
      // A model the reference has never heard of has no baseline to read, and
      // the capability rules answer "allow" for an unknown one, so a chip is
      // only drawn where the reference actually says which family it is.
      capabilities:
        baseline === ''
          ? []
          : CAPABILITY_RULES.filter((rule) => rule.supports(baseline)).map(
              ({ id, labelKey, icon }) => ({ id, labelKey, icon }),
            ),
    };
  }

  private textRow(model: ActiveModel, usage: number): ModelRow {
    const record = this.reference.textRecordFor(model.name);
    return {
      model,
      baseline: '',
      family: record?.baseline ?? '',
      parameters: formatParameterCount(record?.parameters ?? null),
      nsfw: record?.nsfw ?? false,
      inpainting: false,
      usage,
      capabilities: [],
    };
  }

  /** The printed name of a baseline token. */
  public readonly baselineLabel = baselineLabel;

  /** Where a row's name links to. */
  public detailLink(row: ModelRow): unknown[] {
    return ['/details/models', this.activeTab(), row.model.name];
  }

  /** Get the formatted queued value for a model. */
  public getModelQueuedUnit(model: ActiveModel): SynthesizedUnit {
    return this.activeTab() === 'image'
      ? this.unitConversion.formatModelQueuedImage(model.queued ?? 0)
      : this.unitConversion.formatModelQueuedText(model.queued ?? 0);
  }

  /** Get the formatted performance value for a model. */
  public getModelPerformanceUnit(model: ActiveModel): SynthesizedUnit | null {
    if (!model.performance || model.performance <= 0) {
      return null;
    }
    return this.activeTab() === 'image'
      ? this.unitConversion.formatModelPerformanceImage(model.performance)
      : this.unitConversion.formatModelPerformanceText(model.performance);
  }

  constructor() {
    effect(() => {
      const routeType = this.routeModelType();
      if (routeType && !this.initialTypeApplied) {
        this.activeTab.set(routeType);
        this.initialTypeApplied = true;
        if (routeType === 'text') {
          this.reference.loadText();
        }
      }
    });

    // Fetch only in the browser after rendering completes, so a static build
    // does not bake a moment of the horde's traffic into the page.
    afterNextRender(() => {
      this.reference.load();
      if (this.activeTab() === 'text') {
        this.reference.loadText();
      }
      this.loadModels();
    });
  }

  ngOnInit(): void {
    setPageTitle(
      this.translator,
      this.title,
      this.destroyRef,
      'details.models.title',
    );
  }

  public setActiveTab(tab: ModelsTab): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.searchQuery.set('');
    // The columns carry different units on the two tabs, so an order chosen for
    // one of them says nothing about the other.
    this.baselineFilter.set(null);
    this.sortField.set('count');
    this.sortDirection.set('desc');
    void this.router.navigate(['/details/models', tab], { replaceUrl: true });

    if (tab === 'text') {
      this.reference.loadText();
    }
    this.loadModels();
  }

  public loadModels(): void {
    const tab = this.activeTab();
    this.loading.set(true);
    this.error.set(null);

    const models =
      tab === 'image'
        ? this.aiHorde.getImageModels('all')
        : this.aiHorde.getTextModels('all');

    models
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (list) => {
          if (tab === 'image') {
            this.imageStatus.set(list);
          } else {
            this.textStatus.set(list);
          }
        },
        error: (err: unknown) => {
          // An empty string stands for "it failed and said nothing useful",
          // which the page prints as its own sentence.
          const message = err instanceof Error ? err.message : '';
          this.error.set(message);
        },
      });

    // The counts are asked for over every model, not only the ones the horde
    // publishes, so a model somebody added themselves still reports its month.
    const stats =
      tab === 'image'
        ? this.aiHorde.getImageModelStats('all')
        : this.aiHorde.getTextModelStats();

    stats.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (periods) => {
        if (tab === 'image') {
          this.imageUsage.set(periods.month);
        } else {
          this.textUsage.set(periods.month);
        }
      },
      error: () => {
        // The list reads without the counts; a column of zeroes is honest.
      },
    });
  }

  public onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
    this.activeSuggestionIndex.set(-1);
    if (input.value.trim()) {
      this.autocompleteOpen.set(true);
    }
  }

  /** Handle search input focus - open autocomplete if there's a query. */
  public onSearchFocus(): void {
    if (this.searchQuery().trim()) {
      this.autocompleteOpen.set(true);
    }
  }

  /** Handle keyboard navigation in the autocomplete. */
  public onSearchKeydown(event: KeyboardEvent): void {
    const suggestions = this.autocompleteSuggestions();
    if (!this.autocompleteOpen() || suggestions.length === 0) {
      if (event.key === 'Escape') {
        this.autocompleteOpen.set(false);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeSuggestionIndex.update((idx) =>
          idx < suggestions.length - 1 ? idx + 1 : 0,
        );
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.activeSuggestionIndex.update((idx) =>
          idx > 0 ? idx - 1 : suggestions.length - 1,
        );
        break;

      case 'Enter': {
        event.preventDefault();
        const activeIdx = this.activeSuggestionIndex();
        if (activeIdx >= 0 && activeIdx < suggestions.length) {
          this.selectSuggestion(suggestions[activeIdx]);
        } else if (suggestions.length > 0) {
          this.selectSuggestion(suggestions[0]);
        }
        break;
      }

      case 'Escape':
        event.preventDefault();
        this.autocompleteOpen.set(false);
        this.activeSuggestionIndex.set(-1);
        break;

      case 'Tab':
        this.autocompleteOpen.set(false);
        break;
    }
  }

  /** Open the page of the model somebody picked out of the suggestions. */
  public selectSuggestion(suggestion: ModelSuggestion): void {
    this.autocompleteOpen.set(false);
    this.activeSuggestionIndex.set(-1);
    void this.router.navigate([
      '/details/models',
      suggestion.type,
      suggestion.name,
    ]);
  }

  /** Handle clicks outside the autocomplete to close it. */
  public onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.filter-search-autocomplete')) {
      this.autocompleteOpen.set(false);
    }
  }

  public setBaselineFilter(baseline: string | null): void {
    this.baselineFilter.update((current) =>
      current === baseline ? null : baseline,
    );
  }

  public clearFilters(): void {
    this.baselineFilter.set(null);
    this.workersOnly.set(false);
    this.hideAdult.set(false);
    this.searchQuery.set('');
  }

  public setSortField(field: ModelsSortField): void {
    if (this.sortField() === field) {
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
