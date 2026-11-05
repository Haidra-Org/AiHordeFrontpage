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
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, expand, finalize, Observable } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { TranslatorService } from '../../../services/translator.service';
import { StyleService } from '../../../services/style.service';
import { AuthService } from '../../../services/auth.service';
import { setPageTitle } from '../../../helper/page-title';
import { StickyRegistryService } from '../../../services/sticky-registry.service';
import { ImageStyle, TextStyle, Style, StyleType } from '../../../types/style';
import { StyleCollection } from '../../../types/style-collection';
import {
  StyleQueryParams,
  StyleClientFilters,
  DEFAULT_CLIENT_FILTERS,
  DEFAULT_QUERY_PARAMS,
} from '../../../types/style-api';
import { StyleCardComponent } from '../../../components/style/style-card/style-card.component';
import { StyleFiltersComponent } from '../../../components/style/style-filters/style-filters.component';
import { EntityLookupComponent } from '../../../components/entity-lookup/entity-lookup.component';
import { IconComponent } from '../../../components/icon/icon.component';
import { scrollToElementCentered } from '../../../helper/scroll-utils';

export type StylesTab = 'image' | 'text' | 'collections';

type StyleList = ImageStyle[] | TextStyle[] | StyleCollection[];

@Component({
  selector: 'app-styles-list',
  imports: [
    TranslocoPipe,
    StyleCardComponent,
    StyleFiltersComponent,
    EntityLookupComponent,
    RouterLink,
    IconComponent,
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
  private readonly stickyRegistry = inject(StickyRegistryService);
  private readonly pageSize = 25;
  /**
   * A ceiling on the fetch loop. The horde ends a list with a short page, so
   * this only bites if it ever stops doing so: without it a full page every
   * time would keep the loop asking indefinitely.
   */
  private readonly maxPages = 40;

  /** Route parameters as signals. */
  private readonly params: Signal<Record<string, string>> = toSignal(
    this.route.params,
    {
      initialValue: {},
    },
  );

  /** Style ID to highlight from route. */
  public readonly highlightStyleId = computed<string | null>(() => {
    return this.params()['highlightStyleId'] ?? null;
  });

  /** Style type from route (image, text, collections) — used both for tab selection and highlight navigation. */
  public readonly highlightStyleType = computed<StylesTab | null>(() => {
    const type = this.params()['type'] as string | undefined;
    if (type === 'image' || type === 'text' || type === 'collections') {
      return type;
    }
    return null;
  });

  /** Reference to highlighted style element for scrolling. */
  /**
   * The element id one style's card carries, so the card a link points at can
   * be found among all of them. A template reference cannot do this: every card
   * would answer to the same name and the first one would always win.
   */
  public styleCardId(styleId: string): string {
    return `style-card-${styleId}`;
  }

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
  public readonly clientFilters = signal<StyleClientFilters>(
    DEFAULT_CLIENT_FILTERS,
  );

  /** Whether user is logged in. */
  public readonly isLoggedIn = computed(() => this.auth.isLoggedIn());

  /** Get available tags from current styles. */
  public readonly availableTags = computed(() => {
    const styles =
      this.activeTab() === 'image' ? this.imageStyles() : this.textStyles();
    const tagSet = new Set<string>();
    styles.forEach((s) => s.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  });

  /** Get available models from current styles. */
  public readonly availableModels = computed(() => {
    const styles =
      this.activeTab() === 'image' ? this.imageStyles() : this.textStyles();
    const modelSet = new Set<string>();
    styles.forEach((s) => s.models?.forEach((m) => modelSet.add(m)));
    return Array.from(modelSet).sort();
  });

  /** Filtered styles based on client-side filters. */
  public readonly filteredStyles = computed(() => {
    const tab = this.activeTab();
    const filters = this.clientFilters();
    const highlightId = this.highlightStyleId();
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

    // Sort highlighted style first
    if (highlightId) {
      styles = [...styles].sort((a, b) => {
        if (a.id === highlightId) return -1;
        if (b.id === highlightId) return 1;
        return 0;
      });
    }

    return styles;
  });

  /** Check if a style is highlighted (for styling). */
  public isStyleHighlighted(styleId: string): boolean {
    return this.highlightStyleId() === styleId;
  }

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

  constructor() {
    // Effect to switch to correct tab when highlighting
    effect(() => {
      const highlightType = this.highlightStyleType();
      if (highlightType && this.activeTab() !== highlightType) {
        this.activeTab.set(highlightType);
      }
    });

    // Effect to scroll highlighted style into view after data loads
    effect(() => {
      const highlightId = this.highlightStyleId();
      const styles = this.filteredStyles();

      if (highlightId && styles.length > 0 && typeof document !== 'undefined') {
        // Use setTimeout to ensure DOM has updated
        setTimeout(() => {
          const card = document.getElementById(this.styleCardId(highlightId));
          if (card) {
            scrollToElementCentered(card, this.stickyRegistry.totalOffset());
          }
        }, 100);
      }
    });

    // Fetch styles only in the browser after rendering completes.
    // This prevents stale prerendered data from appearing during static builds.
    afterNextRender(() => {
      this.loadStyles();
    });
  }

  ngOnInit(): void {
    setPageTitle(this.translator, this.title, this.destroyRef, 'styles.title');
  }

  public setActiveTab(tab: StylesTab): void {
    if (this.activeTab() === tab) return;

    this.activeTab.set(tab);
    this.queryParams.set(DEFAULT_QUERY_PARAMS);
    this.clientFilters.set(DEFAULT_CLIENT_FILTERS);
    this.loadStyles();
    void this.router.navigate(['/details/styles', tab], { replaceUrl: true });
  }

  public onQueryParamsChange(params: StyleQueryParams): void {
    this.queryParams.set(params);
    this.loadStyles();
  }

  public onClientFiltersChange(filters: StyleClientFilters): void {
    this.clientFilters.set(filters);
  }

  /**
   * Fetch the whole tab before showing it. The search runs over what is held
   * here, so a list that stopped at the pages someone had paged through would
   * answer for part of the catalogue and stay silent about the rest.
   */
  public loadStyles(): void {
    const tab = this.activeTab();

    this.clearAllStyles();
    this.loading.set(true);
    this.error.set(null);

    this.fetchPage(tab, 1)
      .pipe(
        expand((items: StyleList, index: number) => {
          const dedupe = this.appendPageResults(tab, items);
          const exhausted =
            items.length !== this.pageSize ||
            dedupe.addedCount === 0 ||
            dedupe.duplicates > 1 ||
            index + 1 >= this.maxPages;
          return exhausted ? EMPTY : this.fetchPage(tab, index + 2);
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        error: (err: unknown) =>
          this.error.set(
            err instanceof Error ? err.message : this.getLoadError(tab),
          ),
      });
  }

  public navigateToStyle(style: Style, type: StyleType): void {
    void this.router.navigate(['/details/styles', type, style.id]);
  }

  public goToCreateStyle(): void {
    const targetType = this.activeTab() === 'text' ? 'text' : 'image';
    void this.router.navigate(['/profile/styles'], {
      queryParams: {
        from: 'details',
        create: 'true',
        type: targetType,
      },
    });
  }

  private clearAllStyles(): void {
    this.imageStyles.set([]);
    this.textStyles.set([]);
    this.collections.set([]);
  }

  private fetchPage(tab: StylesTab, page: number): Observable<StyleList> {
    const params = this.queryParams();

    if (tab === 'image') {
      return this.styleService.getImageStyles({
        ...params,
        page,
      });
    }

    if (tab === 'text') {
      return this.styleService.getTextStyles({
        ...params,
        page,
      });
    }

    return this.styleService.getCollections({
      sort: params.sort,
      page,
    });
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

  /**
   * Open one style from the lookup field. An id and a name lead to the same
   * page: the detail page asks the horde by whichever of the two it was given.
   */
  public onStyleSearch(value: string): void {
    const trimmed = value.trim();
    if (!trimmed) return;

    const type = this.activeTab() === 'text' ? 'text' : 'image';
    void this.router.navigate(['/details/styles', type, trimmed]);
  }

  /**
   * Clear the highlighted style and return to the styles list.
   * Uses replaceUrl so back button goes to previous page instead of re-highlighting.
   */
  public clearHighlight(): void {
    void this.router.navigate(['/details/styles'], { replaceUrl: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
