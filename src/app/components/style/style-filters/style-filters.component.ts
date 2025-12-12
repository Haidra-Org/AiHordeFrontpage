import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  StyleQueryParams,
  StyleSortOption,
  StyleClientFilters,
  DEFAULT_CLIENT_FILTERS,
} from '../../../types/style-api';

@Component({
  selector: 'app-style-filters',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './style-filters.component.html',
  styleUrl: './style-filters.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StyleFiltersComponent {
  /** Current API query params. */
  public readonly queryParams = input.required<StyleQueryParams>();

  /** Current client-side filters. */
  public readonly clientFilters = input<StyleClientFilters>(DEFAULT_CLIENT_FILTERS);

  /** Available tags for filtering (populated from loaded styles). */
  public readonly availableTags = input<string[]>([]);

  /** Available models for filtering (populated from loaded styles). */
  public readonly availableModels = input<string[]>([]);

  /** Whether filters are loading. */
  public readonly loading = input<boolean>(false);

  /** Emits when API query params change (triggers new API call). */
  public readonly queryParamsChange = output<StyleQueryParams>();

  /** Emits when client-side filters change (local filtering only). */
  public readonly clientFiltersChange = output<StyleClientFilters>();

  /** Local search query for debouncing. */
  public readonly searchQuery = signal('');

  /** Debounce timer for search. */
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Sort options. */
  public readonly sortOptions: { value: StyleSortOption; label: string }[] = [
    { value: 'popular', label: 'styles.filters.sort.popular' },
    { value: 'age', label: 'styles.filters.sort.newest' },
  ];

  /** Current sort value. */
  public readonly currentSort = computed(() => this.queryParams().sort ?? 'popular');

  /** Current tag filter. */
  public readonly currentTag = computed(() => this.queryParams().tag ?? '');

  /** Current model filter. */
  public readonly currentModel = computed(() => this.queryParams().model ?? '');

  /** Whether NSFW is hidden. */
  public readonly hideNsfw = computed(() => this.clientFilters().hideNsfw);

  public onSortChange(sort: StyleSortOption): void {
    this.queryParamsChange.emit({
      ...this.queryParams(),
      sort,
      page: 1, // Reset to page 1 when changing sort
    });
  }

  public onTagChange(tag: string): void {
    const params = { ...this.queryParams(), page: 1 };
    if (tag) {
      params.tag = tag;
    } else {
      delete params.tag;
    }
    this.queryParamsChange.emit(params);
  }

  public onModelChange(model: string): void {
    const params = { ...this.queryParams(), page: 1 };
    if (model) {
      params.model = model;
    } else {
      delete params.model;
    }
    this.queryParamsChange.emit(params);
  }

  public onSearchInput(query: string): void {
    this.searchQuery.set(query);

    // Debounce the search
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    this.searchDebounceTimer = setTimeout(() => {
      this.clientFiltersChange.emit({
        ...this.clientFilters(),
        searchQuery: query.trim(),
      });
    }, 300);
  }

  public onHideNsfwChange(hideNsfw: boolean): void {
    this.clientFiltersChange.emit({
      ...this.clientFilters(),
      hideNsfw,
    });
  }

  public clearFilters(): void {
    this.searchQuery.set('');
    this.queryParamsChange.emit({
      sort: 'popular',
      page: 1,
    });
    this.clientFiltersChange.emit(DEFAULT_CLIENT_FILTERS);
  }

  public hasActiveFilters = computed(() => {
    const params = this.queryParams();
    const client = this.clientFilters();
    return Boolean(
      params.tag ||
      params.model ||
      client.searchQuery ||
      client.hideNsfw
    );
  });
}
