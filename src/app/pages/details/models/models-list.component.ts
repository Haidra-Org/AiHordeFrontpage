import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
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

/** Represents an autocomplete suggestion for model search. */
interface ModelSuggestion {
  name: string;
  type: ModelsTab;
  count: number;
}

@Component({
  selector: 'app-models-list',
  imports: [TranslocoPipe, DecimalPipe, UnitTooltipComponent],
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  public readonly unitConversion = inject(UnitConversionService);

  /** Route parameters as signals. */
  private readonly params = toSignal(this.route.params, { initialValue: {} as Record<string, string> });

  /** Model type from route (image or text). */
  private readonly routeModelType = computed<ModelsTab | null>(() => {
    const type = this.params()['modelType'];
    if (type === 'image' || type === 'text') {
      return type;
    }
    return null;
  });

  /** Model name to highlight/filter from route. */
  public readonly highlightModelName = computed<string | null>(() => {
    const modelName = this.params()['modelName'];
    return modelName ? decodeURIComponent(modelName) : null;
  });

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

  /** Track whether initial type has been applied. */
  private initialTypeApplied = false;

  /** Track whether we're searching for a model without type. */
  private searchingForModel = false;

  /** Autocomplete dropdown open state. */
  public readonly autocompleteOpen = signal(false);

  /** Currently active suggestion index for keyboard navigation. */
  public readonly activeSuggestionIndex = signal(-1);

  /** Autocomplete suggestions based on current search query. */
  public readonly autocompleteSuggestions = computed<ModelSuggestion[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query || query.length < 1) return [];

    const imageModels = this.imageModels();
    const textModels = this.textModels();

    const suggestions: ModelSuggestion[] = [];

    // Search through image models
    for (const model of imageModels) {
      if (model.name.toLowerCase().includes(query)) {
        suggestions.push({
          name: model.name,
          type: 'image',
          count: model.count ?? 0,
        });
      }
    }

    // Search through text models
    for (const model of textModels) {
      if (model.name.toLowerCase().includes(query)) {
        suggestions.push({
          name: model.name,
          type: 'text',
          count: model.count ?? 0,
        });
      }
    }

    // Sort by worker count (descending) then name
    suggestions.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });

    // Limit to 10 suggestions
    return suggestions.slice(0, 10);
  });

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
    const highlightName = this.highlightModelName();

    // Filter
    let filtered = models;
    if (query) {
      filtered = models.filter((m) => m.name.toLowerCase().includes(query));
    }

    // Sort - put highlighted model first
    const sorted = [...filtered].sort((a, b) => {
      // Always put highlighted model first
      if (highlightName) {
        if (a.name === highlightName) return -1;
        if (b.name === highlightName) return 1;
      }

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

  /** Check if a model is highlighted (for styling). */
  public isModelHighlighted(modelName: string): boolean {
    return this.highlightModelName() === modelName;
  }

  /** Reference to highlighted row element for scrolling. */
  private readonly highlightedRow = viewChild<ElementRef<HTMLElement>>('highlightedRow');

  /**
   * Clear the highlighted model and navigate to the base models route.
   * Uses replaceUrl so back button goes to previous page instead of re-highlighting.
   */
  public clearHighlight(): void {
    const currentType = this.activeTab();
    this.router.navigate(['/details/models', currentType], { replaceUrl: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  constructor() {
    // Effect to apply initial model type from route
    effect(() => {
      const routeType = this.routeModelType();
      if (routeType && !this.initialTypeApplied) {
        this.activeTab.set(routeType);
        this.initialTypeApplied = true;
      }
    });

    // Effect to find model when only name is provided (no type)
    effect(() => {
      const modelName = this.highlightModelName();
      const routeType = this.routeModelType();
      const imageModels = this.imageModels();
      const textModels = this.textModels();

      // Only search if we have a model name but no type in the route
      if (modelName && !routeType && !this.searchingForModel) {
        // Check if model is in image models
        const foundInImage = imageModels.some(m => m.name === modelName);
        if (foundInImage) {
          this.activeTab.set('image');
          this.initialTypeApplied = true;
          return;
        }

        // Check if model is in text models
        const foundInText = textModels.some(m => m.name === modelName);
        if (foundInText) {
          this.activeTab.set('text');
          this.initialTypeApplied = true;
        }
      }
    });

    // Fetch models only in the browser after rendering completes.
    // This prevents stale prerendered data from appearing during static builds.
    afterNextRender(() => {
      this.loadModelsForSearch();
    });

    // Effect to scroll highlighted model into view after data loads
    effect(() => {
      const highlightName = this.highlightModelName();
      const models = this.filteredModels();
      const rowEl = this.highlightedRow();
      
      if (highlightName && models.length > 0 && rowEl) {
        // Use setTimeout to ensure DOM has updated
        setTimeout(() => {
          rowEl.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    });
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
  }

  public setActiveTab(tab: ModelsTab): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.searchQuery.set('');

    // Update URL if we have a route type
    if (this.routeModelType()) {
      this.router.navigate(['/details/models', tab], { replaceUrl: true });
    }

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

  /**
   * Load models with special handling for searching by name when type is unknown.
   * If a model name is in the route but no type, load both sets to find it.
   */
  private loadModelsForSearch(): void {
    const modelName = this.highlightModelName();
    const routeType = this.routeModelType();

    // If we have a type from the route or no model name, just load normally
    if (routeType || !modelName) {
      this.loadModels();
      return;
    }

    // We have a model name but no type - load both to find the model
    this.searchingForModel = true;
    this.loading.set(true);
    this.error.set(null);

    combineLatest([
      this.aiHorde.getImageModels(),
      this.aiHorde.getTextModels(),
    ])
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.loading.set(false);
          this.searchingForModel = false;
        }),
      )
      .subscribe({
        next: ([imageModels, textModels]) => {
          this.imageModels.set(imageModels);
          this.textModels.set(textModels);

          // Determine which tab to activate based on where we find the model
          const foundInImage = imageModels.some(m => m.name === modelName);
          const foundInText = textModels.some(m => m.name === modelName);

          if (foundInImage) {
            this.activeTab.set('image');
          } else if (foundInText) {
            this.activeTab.set('text');
          }
          // If not found in either, stay on current tab
          this.initialTypeApplied = true;
        },
        error: (err: { message?: string }) => {
          this.error.set(err.message || 'Failed to load models');
        },
      });
  }

  public onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
    this.activeSuggestionIndex.set(-1);
    // Open autocomplete if there's a query
    if (input.value.trim()) {
      this.autocompleteOpen.set(true);
    }
  }

  /**
   * Handle search input focus - open autocomplete if there's a query.
   */
  public onSearchFocus(): void {
    if (this.searchQuery().trim()) {
      this.autocompleteOpen.set(true);
    }
  }

  /**
   * Handle keyboard navigation in the autocomplete.
   */
  public onSearchKeydown(event: KeyboardEvent): void {
    const suggestions = this.autocompleteSuggestions();
    if (!this.autocompleteOpen() || suggestions.length === 0) {
      // Allow Enter to submit search even without autocomplete open
      if (event.key === 'Escape') {
        this.autocompleteOpen.set(false);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeSuggestionIndex.update(idx =>
          idx < suggestions.length - 1 ? idx + 1 : 0
        );
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.activeSuggestionIndex.update(idx =>
          idx > 0 ? idx - 1 : suggestions.length - 1
        );
        break;

      case 'Enter':
        event.preventDefault();
        const activeIdx = this.activeSuggestionIndex();
        if (activeIdx >= 0 && activeIdx < suggestions.length) {
          this.selectSuggestion(suggestions[activeIdx]);
        } else if (suggestions.length > 0) {
          // Select first suggestion if none is highlighted
          this.selectSuggestion(suggestions[0]);
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.autocompleteOpen.set(false);
        this.activeSuggestionIndex.set(-1);
        break;

      case 'Tab':
        // Close autocomplete on Tab
        this.autocompleteOpen.set(false);
        break;
    }
  }

  /**
   * Select a suggestion from the autocomplete dropdown.
   */
  public selectSuggestion(suggestion: ModelSuggestion): void {
    // Switch to the appropriate tab if different
    if (this.activeTab() !== suggestion.type) {
      this.activeTab.set(suggestion.type);
    }
    // Set the search query to exactly match the model name
    this.searchQuery.set(suggestion.name);
    // Close the dropdown
    this.autocompleteOpen.set(false);
    this.activeSuggestionIndex.set(-1);
  }

  /**
   * Handle clicks outside the autocomplete to close it.
   */
  public onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    // Check if click is inside the autocomplete container
    if (!target.closest('.filter-search-autocomplete')) {
      this.autocompleteOpen.set(false);
    }
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

  /**
   * Handle model lookup search.
   */
  public onModelSearch(value: string): void {
    const trimmed = value.trim();
    if (trimmed) {
      this.router.navigate(['/details/models/name', trimmed]);
    }
  }
}
