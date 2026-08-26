import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnInit,
  AfterViewInit,
  OnDestroy,
  signal,
  viewChild,
  ChangeDetectionStrategy,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { DataService } from '../../services/data.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { GuiItem } from '../../types/gui-item';
import { ToolItem } from '../../types/tool-item';
import { Platform, FunctionKind } from '../../types/item-types';
import { TranslatorService } from '../../services/translator.service';
import { FooterColorService } from '../../services/footer-color.service';
import { setPageTitle } from '../../helper/page-title';
import { StickyRegistryService } from '../../services/sticky-registry.service';
import {
  ItemListSectionComponent,
  DisplayItem,
} from '../../components/item-list-section/item-list-section.component';
import { scrollToElement } from '../../helper/scroll-utils';
import { BeginnerHeaderComponent } from '../../components/beginner-header/beginner-header.component';
import { IconComponent } from '../../components/icon/icon.component';
import { StickyHeaderDirective } from '../../helper/sticky-header.directive';
import { ItemType } from '../../types/item-types';

interface ExtendedItem extends GuiItem {
  uniqueId: string;
  categories: string[]; // Always an array after normalization
  hasFrontend?: boolean;
}

export type ViewMode = 'table' | 'grid';

/** Section definition for TOC and rendering */
export interface SectionInfo {
  id: string;
  titleKey: string;
  items: () => DisplayItem[];
  tooltipKey?: string;
  tooltipGlossaryId?: string;
  /** When set, this section is a child of the named parent in the TOC. */
  parentId?: string;
}

@Component({
  selector: 'app-guis-and-tools',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoModule,
    ItemListSectionComponent,
    BeginnerHeaderComponent,
    IconComponent,
    StickyHeaderDirective,
  ],
  templateUrl: './guis-and-tools.component.html',
  styleUrl: './guis-and-tools.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuisAndToolsComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly footerColor = inject(FooterColorService);
  private readonly dataService = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stickyRegistry = inject(StickyRegistryService);

  private sectionObserver: IntersectionObserver | null = null;

  readonly sectionsScroll =
    viewChild<ElementRef<HTMLElement>>('sectionsScroll');

  private imageGuis = toSignal(this.dataService.imageGuis);
  private textGuis = toSignal(this.dataService.textGuis);
  private tools = toSignal(this.dataService.tools);
  private resources = toSignal(this.dataService.resources);
  private games = toSignal(this.dataService.games);

  // Search and filter signals
  public searchQuery = signal<string>('');
  public selectedTypes = signal<Set<string>>(new Set());
  public selectedCategories = signal<Set<string>>(new Set());
  public expandedRows = signal<Set<string>>(new Set());
  public collapsedSections = signal<Set<string>>(new Set());
  public showFiltersPanel = signal<boolean>(false);
  public viewMode = signal<ViewMode>('grid');
  public activeSection = signal<string>('guis-image');

  /** Sections configuration for TOC and rendering */
  public readonly sections: SectionInfo[] = [
    {
      id: 'guis-image',
      titleKey: 'guis_and_tools_page.guis_image_section_title',
      items: () => this.filteredImageGuis(),
      tooltipKey: 'help.tools.tooltip.guis',
      tooltipGlossaryId: 'gui',
      parentId: 'guis',
    },
    {
      id: 'guis-text',
      titleKey: 'guis_and_tools_page.guis_text_section_title',
      items: () => this.filteredTextGuis(),
      tooltipKey: 'help.tools.tooltip.guis',
      tooltipGlossaryId: 'gui',
      parentId: 'guis',
    },
    {
      id: 'workers',
      titleKey: 'guis_and_tools_page.workers_section_title',
      items: () => this.filteredWorkers(),
      tooltipKey: 'help.tools.tooltip.workers',
      tooltipGlossaryId: 'worker',
    },
    {
      id: 'resources',
      titleKey: 'guis_and_tools_page.resources_section_title',
      items: () => this.filteredResources(),
      tooltipKey: 'help.tools.tooltip.resources',
    },
    {
      id: 'utilities',
      titleKey: 'guis_and_tools_page.utilities_section_title',
      items: () => this.filteredUtilities(),
      tooltipKey: 'help.tools.tooltip.utilities',
      tooltipGlossaryId: 'utility',
    },
    {
      id: 'bots',
      titleKey: 'guis_and_tools_page.bots_section_title',
      items: () => this.filteredBots(),
      tooltipKey: 'help.tools.tooltip.bots',
      tooltipGlossaryId: 'bot',
    },
    {
      id: 'developer_tools',
      titleKey: 'guis_and_tools_page.developer_tools_section_title',
      items: () => this.filteredDeveloperTools(),
      tooltipKey: 'help.tools.tooltip.developer_tools',
      tooltipGlossaryId: 'sdk',
    },
    {
      id: 'games',
      titleKey: 'guis_and_tools_page.games_section_title',
      items: () => this.filteredGames(),
      tooltipKey: 'help.tools.tooltip.games',
    },
  ];

  /** Get visible sections (those with items after filtering) */
  public visibleSections = computed(() => {
    return this.sections.filter((section) => section.items().length > 0);
  });

  /** True until every data file the page draws from has arrived. */
  public loading = computed(
    () =>
      this.imageGuis() === undefined ||
      this.textGuis() === undefined ||
      this.tools() === undefined ||
      this.resources() === undefined ||
      this.games() === undefined,
  );

  // Combined items (GUIs, Tools, and Resources)
  public allItems = computed(() => {
    const imageGuis = this.imageGuis();
    const textGuis = this.textGuis();
    const tools = this.tools();
    const resources = this.resources();
    const games = this.games();

    if (
      imageGuis === undefined ||
      textGuis === undefined ||
      tools === undefined ||
      resources === undefined ||
      games === undefined
    ) {
      return [];
    }

    const result: ExtendedItem[] = [];
    const seenGuisImage = new Set<string>();
    const seenGuisText = new Set<string>();
    const seenTools = new Set<string>();
    const seenResources = new Set<string>();
    const seenGames = new Set<string>();

    // Add image GUIs (deduplicate by name)
    imageGuis.forEach((items) => {
      items.forEach((item) => {
        if (!seenGuisImage.has(item.name)) {
          result.push({
            ...item,
            categories: Array.isArray(item.categories)
              ? item.categories
              : [item.categories],
            uniqueId: `gui-image-${item.name}`,
          });
          seenGuisImage.add(item.name);
        }
      });
    });

    // Add text GUIs (deduplicate by name)
    textGuis.forEach((items) => {
      items.forEach((item) => {
        if (!seenGuisText.has(item.name)) {
          result.push({
            ...item,
            categories: Array.isArray(item.categories)
              ? item.categories
              : [item.categories],
            uniqueId: `gui-text-${item.name}`,
          });
          seenGuisText.add(item.name);
        }
      });
    });

    // Add tools (flatten and deduplicate by name)
    if (tools) {
      tools.forEach((toolArray) => {
        toolArray.forEach((tool: ToolItem) => {
          if (!seenTools.has(tool.name)) {
            result.push({
              ...tool,
              categories: Array.isArray(tool.categories)
                ? tool.categories
                : tool.categories
                  ? [tool.categories]
                  : [],
              uniqueId: `tool-${tool.name}`,
            });
            seenTools.add(tool.name);
          }
        });
      });
    }

    // Add resources (flatten and deduplicate by name)
    if (resources) {
      resources.forEach((resourceArray) => {
        resourceArray.forEach((resource: GuiItem) => {
          if (!seenResources.has(resource.name)) {
            result.push({
              ...resource,
              categories: Array.isArray(resource.categories)
                ? resource.categories
                : resource.categories
                  ? [resource.categories]
                  : [],
              uniqueId: `resource-${resource.name}`,
            });
            seenResources.add(resource.name);
          }
        });
      });
    }

    // Add games (flatten and deduplicate by name)
    if (games) {
      games.forEach((gameArray) => {
        gameArray.forEach((game: GuiItem) => {
          if (!seenGames.has(game.name)) {
            result.push({
              ...game,
              categories: Array.isArray(game.categories)
                ? game.categories
                : game.categories
                  ? [game.categories]
                  : [],
              uniqueId: `game-${game.name}`,
            });
            seenGames.add(game.name);
          }
        });
      });
    }

    return result;
  });

  public filteredItems = computed(() => {
    const items = this.allItems();
    const types = this.selectedTypes();
    const categories = this.selectedCategories();
    const query = this.searchQuery().toLowerCase().trim();

    return items.filter((item) => {
      // Filter by search query (name or description)
      if (query) {
        const nameMatch = item.name.toLowerCase().includes(query);
        const descMatch =
          item.description?.toLowerCase().includes(query) ?? false;
        const categoryMatch = item.categories.some((cat) =>
          cat.toLowerCase().includes(query),
        );
        if (!nameMatch && !descMatch && !categoryMatch) {
          return false;
        }
      }

      // Filter by type categories (check if item has any of the selected type categories)
      if (types.size > 0) {
        const hasTypeMatch = item.categories.some((cat) => types.has(cat));
        if (!hasTypeMatch) {
          return false;
        }
      }

      // Filter by additional categories (platforms/tags)
      if (categories.size > 0) {
        const hasMatch = item.categories.some((cat) => categories.has(cat));
        if (!hasMatch) {
          return false;
        }
      }

      return true;
    });
  });

  /** Count of active filters */
  public activeFilterCount = computed(() => {
    return this.selectedTypes().size + this.selectedCategories().size;
  });

  /**
   * A reader looking for somewhere to start is best served by the two entries
   * that need no install at all, so they lead their section; the entries the
   * project recommends follow, and everything else keeps the order of the
   * data file.
   */
  private static byStartingPoint(a: ExtendedItem, b: ExtendedItem): number {
    const here = (b.onThisSite ? 1 : 0) - (a.onThisSite ? 1 : 0);
    if (here !== 0) return here;
    return (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0);
  }

  // Separate items by category for grouped display
  public filteredImageGuis = computed(() => {
    return this.filteredItems()
      .filter((item) => item.itemType === ItemType.GUI_IMAGE)
      .sort(GuisAndToolsComponent.byStartingPoint);
  });

  public filteredTextGuis = computed(() => {
    return this.filteredItems()
      .filter((item) => item.itemType === ItemType.GUI_TEXT)
      .sort(GuisAndToolsComponent.byStartingPoint);
  });

  /** Combined GUIs (kept for total filteredItems counting). */
  public filteredGuis = computed(() => {
    return [...this.filteredImageGuis(), ...this.filteredTextGuis()];
  });

  public filteredBots = computed(() => {
    return this.filteredItems().filter(
      (item) => item.functionKind === FunctionKind.BOT,
    );
  });

  public filteredDeveloperTools = computed(() => {
    return this.filteredItems().filter(
      (item) =>
        item.functionKind === FunctionKind.SDK ||
        item.functionKind === FunctionKind.CLI_TOOL ||
        item.functionKind === FunctionKind.PLUGIN ||
        (item.platform && item.platform.includes(Platform.PROGRAMMING)),
    );
  });

  public filteredUtilities = computed(() => {
    return this.filteredItems().filter(
      (item) =>
        item.functionKind === FunctionKind.UTILITY ||
        item.functionKind === FunctionKind.INTERFACE ||
        item.functionKind === FunctionKind.TOOL,
    );
  });

  public filteredResources = computed(() => {
    return this.filteredItems().filter(
      (item) =>
        item.functionKind === FunctionKind.RESOURCE_COLLECTION ||
        item.functionKind === FunctionKind.INFORMATIONAL ||
        item.functionKind === FunctionKind.COMMUNITY ||
        item.itemType === ItemType.RESOURCE ||
        item.itemType === ItemType.DATASET,
    );
  });

  public filteredWorkers = computed(() => {
    return this.filteredItems().filter(
      (item) => item.functionKind === FunctionKind.WORKER,
    );
  });

  public filteredGames = computed(() => {
    return this.filteredItems().filter(
      (item) => item.itemType === ItemType.GAME,
    );
  });

  public availableCategories = computed(() => {
    const items = this.allItems();
    const categoriesSet = new Set<string>();

    items.forEach((item) => {
      item.categories.forEach((cat) => {
        if (cat) categoriesSet.add(cat);
      });
    });

    return Array.from(categoriesSet).sort();
  });

  // Organize categories into primary filters (shown first) and secondary filters
  public primaryCategories = computed(() => {
    const primary = [
      'Web',
      'Desktop',
      'iOS',
      'Android',
      'Image Generation',
      'Text Generation',
    ];
    return this.availableCategories().filter((cat) => primary.includes(cat));
  });

  public secondaryCategories = computed(() => {
    const primary = [
      'Web',
      'Desktop',
      'iOS',
      'Android',
      'Image Generation',
      'Text Generation',
    ];
    return this.availableCategories().filter((cat) => !primary.includes(cat));
  });

  /** Set of section ids that the user has scrolled past. */
  public passedSections = computed(() => {
    const active = this.activeSection();
    const visible = this.visibleSections();
    const activeIdx = visible.findIndex((s) => s.id === active);
    const passed = new Set<string>();
    for (let i = 0; i < activeIdx; i++) {
      passed.add(visible[i].id);
    }
    return passed;
  });

  /** Unique parent ids that have visible children. */
  public visibleParents = computed(() => {
    const parents = new Set<string>();
    for (const s of this.visibleSections()) {
      if (s.parentId) parents.add(s.parentId);
    }
    return parents;
  });

  private scrollSpyReady = false;

  constructor() {
    // The section row only moves when the reader has scrolled to a new
    // section, so bringing the current one into view never fights a swipe.
    effect(() => {
      const active = this.activeSection();
      if (!isPlatformBrowser(this.platformId)) return;
      setTimeout(() => this.centerActiveSectionTab(active), 60);
    });

    // Rebuild IntersectionObserver when sticky offset changes
    effect(() => {
      const offset = this.stickyRegistry.totalOffset();
      if (!this.scrollSpyReady) return;
      this.rebuildScrollSpy(offset);
    });
  }

  ngOnInit(): void {
    this.footerColor.setDarkMode(false);
    setPageTitle(
      this.translator,
      this.title,
      this.destroyRef,
      'guis_and_tools_page.title',
    );
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.scrollSpyReady = true;
      this.rebuildScrollSpy(this.stickyRegistry.totalOffset());
    }
  }

  ngOnDestroy(): void {
    if (this.sectionObserver) {
      this.sectionObserver.disconnect();
    }
  }

  private rebuildScrollSpy(offset: number): void {
    this.sectionObserver?.disconnect();

    this.sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const sectionId = entry.target.id.replace('section-', '');
            this.activeSection.set(sectionId);
          }
        });
      },
      {
        root: null,
        rootMargin: `${-offset}px 0px -60% 0px`,
        threshold: 0,
      },
    );

    this.sections.forEach((section) => {
      const element = document.getElementById(`section-${section.id}`);
      if (element) {
        this.sectionObserver?.observe(element);
      }
    });
  }

  public toggleType(type: string): void {
    const types = new Set(this.selectedTypes());
    if (types.has(type)) {
      types.delete(type);
    } else {
      types.add(type);
    }
    this.selectedTypes.set(types);
  }

  public isTypeSelected(type: string): boolean {
    return this.selectedTypes().has(type);
  }

  public toggleCategory(category: string): void {
    const categories = new Set(this.selectedCategories());
    if (categories.has(category)) {
      categories.delete(category);
    } else {
      categories.add(category);
    }
    this.selectedCategories.set(categories);
  }

  public isCategorySelected(category: string): boolean {
    return this.selectedCategories().has(category);
  }

  public clearAllCategories(): void {
    this.selectedCategories.set(new Set());
  }

  public selectAllTypes(): void {
    this.selectedTypes.set(new Set(this.availableCategories()));
  }

  public clearAllFilters(): void {
    this.selectedTypes.set(new Set());
    this.selectedCategories.set(new Set());
    this.searchQuery.set('');
  }

  public toggleFiltersPanel(): void {
    this.showFiltersPanel.update((v) => !v);
  }

  public setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  /** Scroll to a section, or to the first child if it's a parent id. */
  public scrollToSection(sectionId: string): void {
    // If sectionId is a parent (e.g. 'guis'), resolve to first visible child
    const firstChild = this.sections.find((s) => s.parentId === sectionId);
    const resolvedId = firstChild ? firstChild.id : sectionId;

    const element = document.getElementById(`section-${resolvedId}`);
    if (element) {
      scrollToElement(element, this.stickyRegistry.totalOffset());
      this.activeSection.set(resolvedId);
      if (isPlatformBrowser(this.platformId)) {
        history.replaceState(null, '', `/guis#section-${resolvedId}`);
      }
    }
  }

  /** Whether a section has been scrolled past. */
  public isSectionPassed(sectionId: string): boolean {
    return this.passedSections().has(sectionId);
  }

  public toggleRow(itemName: string): void {
    const expanded = new Set(this.expandedRows());
    if (expanded.has(itemName)) {
      expanded.delete(itemName);
    } else {
      expanded.add(itemName);
    }
    this.expandedRows.set(expanded);
  }

  public isExpanded(itemName: string): boolean {
    return this.expandedRows().has(itemName);
  }

  public toggleSection(sectionName: string): void {
    const collapsed = new Set(this.collapsedSections());
    if (collapsed.has(sectionName)) {
      collapsed.delete(sectionName);
    } else {
      collapsed.add(sectionName);
    }
    this.collapsedSections.set(collapsed);
  }

  public isSectionCollapsed(sectionName: string): boolean {
    return this.collapsedSections().has(sectionName);
  }

  /** Bring the tab for the current section into the middle of its row. */
  private centerActiveSectionTab(activeSectionId: string): void {
    const container = this.sectionsScroll()?.nativeElement;
    if (!container) return;

    const tab = container.querySelector(
      `[data-section-id="${activeSectionId}"]`,
    );
    if (!tab) return;

    // Scrolling the container horizontally rather than calling scrollIntoView
    // keeps the browser from also adjusting the page's vertical position,
    // which it does on touch devices when sticky elements are in the page.
    const containerRect = container.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const deltaLeft =
      tabRect.left -
      containerRect.left -
      (container.clientWidth / 2 - tab.clientWidth / 2);
    const maxLeft = container.scrollWidth - container.clientWidth;
    const targetLeft = Math.max(
      0,
      Math.min(maxLeft, container.scrollLeft + deltaLeft),
    );

    container.scrollTo({ left: targetLeft, behavior: 'smooth' });
  }

  // Convert ExtendedItem to DisplayItem for the sub-component
  public toDisplayItem(item: ExtendedItem): DisplayItem {
    return {
      name: item.name,
      description: item.description,
      image: item.image,
      link: item.link,
      uniqueId: item.uniqueId,
      itemType: item.itemType,
      categories: item.categories,
      domain: item.domain,
      platform: item.platform,
      functionKind: item.functionKind,
      downloadButtonText: item.downloadButtonText,
      sourceControlLink: item.sourceControlLink,
      recommended: item.recommended,
      easyToUse: item.easyToUse,
      onThisSite: item.onThisSite,
      lastVerified: item.lastVerified,
    };
  }
}
