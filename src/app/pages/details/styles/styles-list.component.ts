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
import { Router, ActivatedRoute } from '@angular/router';
import { combineLatest, concatMap, EMPTY, finalize, from, tap, Observable } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslatorService } from '../../../services/translator.service';
import { StyleService } from '../../../services/style.service';
import { AuthService } from '../../../services/auth.service';
import {
  ImageStyle,
  TextStyle,
  Style,
  StyleType,
  isImageStyle,
} from '../../../types/style';
import { StyleCollection } from '../../../types/style-collection';
import {
  StyleQueryParams,
  StyleClientFilters,
  DEFAULT_CLIENT_FILTERS,
  DEFAULT_QUERY_PARAMS,
} from '../../../types/style-api';
import { StyleCardComponent } from '../../../components/style/style-card/style-card.component';
import { StyleFiltersComponent } from '../../../components/style/style-filters/style-filters.component';
import { StyleFormComponent, StyleFormSubmitEvent } from '../../../components/style/style-form/style-form.component';

export type StylesTab = 'image' | 'text' | 'collections';

type StyleList = ImageStyle[] | TextStyle[] | StyleCollection[];

@Component({
  selector: 'app-styles-list',
  imports: [
    TranslocoPipe,
    StyleCardComponent,
    StyleFiltersComponent,
    StyleFormComponent,
  ],
  templateUrl: './styles-list.component.html',
  styleUrl: './styles-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StylesListComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly styleService = inject(StyleService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly initialPageBatchCount = 2;
  private readonly pageSize = 25;

  /** Current active tab. */
  public readonly activeTab = signal<StylesTab>('image');

  /** Loading state. */
  public readonly loading = signal(false);

  /** Error message. */
  public readonly error = signal<string | null>(null);

  /** Image styles. */
  public readonly imageStyles = signal<ImageStyle[]>([]);

  /** Text styles. */
  public readonly textStyles = signal<TextStyle[]>([]);

  /** Collections. */
  public readonly collections = signal<StyleCollection[]>([]);

  /** API query params. */
  public readonly queryParams = signal<StyleQueryParams>(DEFAULT_QUERY_PARAMS);

  /** Client-side filters. */
  public readonly clientFilters = signal<StyleClientFilters>(DEFAULT_CLIENT_FILTERS);

  /** Whether to show create form. */
  public readonly showCreateForm = signal(false);

  /** Note to show when no further pages are available (i18n key). */
  public readonly exhaustionNote = signal<string | null>(null);

  /** Creating state. */
  public readonly creating = signal(false);

  /** Loading additional pages. */
  public readonly loadingMore = signal(false);

  /** Whether more pages are available. */
  public readonly hasMore = signal(true);

  /** Next page number to request. */
  public readonly nextPageToLoad = signal(1);

  /** Whether user is logged in. */
  public readonly isLoggedIn = computed(() => this.auth.isLoggedIn());

  /** Get available tags from current styles. */
  public readonly availableTags = computed(() => {
    const styles = this.activeTab() === 'image' ? this.imageStyles() : this.textStyles();
    const tagSet = new Set<string>();
    styles.forEach((s) => s.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  });

  /** Get available models from current styles. */
  public readonly availableModels = computed(() => {
    const styles = this.activeTab() === 'image' ? this.imageStyles() : this.textStyles();
    const modelSet = new Set<string>();
    styles.forEach((s) => s.models?.forEach((m) => modelSet.add(m)));
    return Array.from(modelSet).sort();
  });

  /** Filtered styles based on client-side filters. */
  public readonly filteredStyles = computed(() => {
    const tab = this.activeTab();
    const filters = this.clientFilters();
    let styles: Style[];

    if (tab === 'image') {
      styles = this.imageStyles();
    } else if (tab === 'text') {
      styles = this.textStyles();
    } else {
      return []; // Collections handled separately
    }

    // Apply client-side filters
    if (filters.hideNsfw) {
      styles = styles.filter((s) => !s.nsfw);
    }

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      styles = styles.filter((s) => {
        const nameMatch = s.name.toLowerCase().includes(query);
        const creatorMatch = s.creator.toLowerCase().includes(query);
        const tagMatch = s.tags?.some((t) => t.toLowerCase().includes(query));
        const infoMatch = s.info?.toLowerCase().includes(query);
        return nameMatch || creatorMatch || tagMatch || infoMatch;
      });
    }

    return styles;
  });

  /** Filtered collections. */
  public readonly filteredCollections = computed(() => {
    const filters = this.clientFilters();
    let colls = this.collections();

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      colls = colls.filter((c) => {
        const nameMatch = c.name.toLowerCase().includes(query);
        const infoMatch = c.info?.toLowerCase().includes(query);
        return nameMatch || infoMatch;
      });
    }

    return colls;
  });

  ngOnInit(): void {
    // Set page title
    combineLatest([
      this.translator.get('styles.title'),
      this.translator.get('app_title'),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([stylesTitle, appTitle]) => {
        this.title.setTitle(`${stylesTitle} | ${appTitle}`);
      });

    // Check for tab in query params
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        if (params['tab'] === 'text') {
          this.activeTab.set('text');
        } else if (params['tab'] === 'collections') {
          this.activeTab.set('collections');
        }
      });

    // Load initial data
    this.loadStyles();
  }

  public setActiveTab(tab: StylesTab): void {
    if (this.activeTab() === tab) return;

    this.activeTab.set(tab);
    this.queryParams.set(DEFAULT_QUERY_PARAMS);
    this.clientFilters.set(DEFAULT_CLIENT_FILTERS);
    this.showCreateForm.set(false);
    this.resetPaginationState();
    this.loadStyles();
  }

  public onQueryParamsChange(params: StyleQueryParams): void {
    this.queryParams.set(params);
    this.resetPaginationState();
    this.loadStyles();
  }

  public onClientFiltersChange(filters: StyleClientFilters): void {
    this.clientFilters.set(filters);
  }

  public loadStyles(): void {
    const tab = this.activeTab();

    this.resetPaginationState();
    this.clearAllStyles();
    this.exhaustionNote.set(null);
    this.loading.set(true);
    this.error.set(null);

    from(Array.from({ length: this.initialPageBatchCount }))
      .pipe(
        concatMap(() => {
          if (!this.hasMore()) {
            return EMPTY;
          }

          const page = this.nextPageToLoad();
          return this.fetchPage(tab, page).pipe(
            tap((items: StyleList) => {
              const dedupe = this.appendPageResults(tab, items);
              this.nextPageToLoad.set(page + 1);
              if (dedupe.duplicates > 1) {
                this.hasMore.set(false);
                this.exhaustionNote.set('styles.all_loaded');
              } else {
                this.hasMore.set(items.length === this.pageSize && dedupe.addedCount > 0);
              }
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        error: (err: { message?: string }) => this.error.set(err.message || this.getLoadError(tab)),
      });
  }

  public loadMore(): void {
    if (!this.hasMore() || this.loadingMore() || this.loading()) {
      return;
    }

    const tab = this.activeTab();
    const page = this.nextPageToLoad();

    this.loadingMore.set(true);
    this.error.set(null);

    this.fetchPage(tab, page)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingMore.set(false)),
      )
      .subscribe({
        next: (items: StyleList) => {
          const dedupe = this.appendPageResults(tab, items);
          this.nextPageToLoad.set(page + 1);
          if (dedupe.duplicates > 1) {
            this.hasMore.set(false);
            this.exhaustionNote.set('styles.all_loaded');
          } else {
            this.hasMore.set(items.length === this.pageSize && dedupe.addedCount > 0);
          }
        },
        error: (err: { message?: string }) => this.error.set(err.message || this.getLoadError(tab)),
      });
  }

  public navigateToStyle(style: Style, type: StyleType): void {
    this.router.navigate(['/details/styles', type, style.id]);
  }

  public openCreateForm(): void {
    this.showCreateForm.set(true);
  }

  public closeCreateForm(): void {
    this.showCreateForm.set(false);
  }

  public onCreateStyle(event: StyleFormSubmitEvent): void {
    this.creating.set(true);

    const observable = event.type === 'image'
      ? this.styleService.createImageStyle(event.payload as Parameters<typeof this.styleService.createImageStyle>[0])
      : this.styleService.createTextStyle(event.payload as Parameters<typeof this.styleService.createTextStyle>[0]);

    observable
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.creating.set(false)),
      )
      .subscribe({
        next: (response) => {
          this.showCreateForm.set(false);
          // Navigate to the new style
          this.router.navigate(['/details/styles', event.type, response.id]);
        },
        error: (err) => {
          this.error.set(err.message || 'Failed to create style');
        },
      });
  }

  /** Get current style type for the form. */
  public readonly currentStyleType = computed((): StyleType => {
    const tab = this.activeTab();
    return tab === 'text' ? 'text' : 'image';
  });

  private resetPaginationState(): void {
    this.hasMore.set(true);
    this.loadingMore.set(false);
    this.nextPageToLoad.set(1);
    this.exhaustionNote.set(null);
  }

  private clearAllStyles(): void {
    this.imageStyles.set([]);
    this.textStyles.set([]);
    this.collections.set([]);
  }

  private fetchPage(
    tab: StylesTab,
    page: number,
  ): Observable<StyleList> {
    const params = this.queryParams();

    if (tab === 'image') {
      return this.styleService.getImageStyles({ ...params, page }) as Observable<StyleList>;
    }

    if (tab === 'text') {
      return this.styleService.getTextStyles({ ...params, page }) as Observable<StyleList>;
    }

    return this.styleService.getCollections({ sort: params.sort, page }) as Observable<StyleList>;
  }

  private appendPageResults(
    tab: StylesTab,
    items: StyleList,
  ): { addedCount: number; duplicates: number } {
    if (tab === 'image') {
      return this.appendUnique(this.imageStyles, items as ImageStyle[]);
    }

    if (tab === 'text') {
      return this.appendUnique(this.textStyles, items as TextStyle[]);
    }

    return this.appendUnique(this.collections, items as StyleCollection[]);
  }

  private appendUnique<T extends { id: string }>(
    target: ReturnType<typeof signal<T[]>>,
    items: T[],
  ): { addedCount: number; duplicates: number } {
    const existing = target();
    const seen = new Set(existing.map((item) => item.id));
    let duplicates = 0;
    const uniqueToAdd = items.filter((item) => {
      if (seen.has(item.id)) {
        duplicates += 1;
        return false;
      }
      seen.add(item.id);
      return true;
    });

    if (uniqueToAdd.length > 0) {
      target.update((current) => [...current, ...uniqueToAdd]);
    }

    return { addedCount: uniqueToAdd.length, duplicates };
  }

  private getLoadError(tab: StylesTab): string {
    if (tab === 'image') {
      return 'Failed to load image styles';
    }

    if (tab === 'text') {
      return 'Failed to load text styles';
    }

    return 'Failed to load collections';
  }
}
