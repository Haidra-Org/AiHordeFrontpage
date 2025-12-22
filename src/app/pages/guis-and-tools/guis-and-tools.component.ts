import {
  Component,
  computed,
  DestroyRef,
  HostListener,
  inject,
  OnInit,
  AfterViewInit,
  OnDestroy,
  signal,
  ChangeDetectionStrategy,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { DataService } from '../../services/data.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { GuiItem } from '../../types/gui-item';
import { ToolItem } from '../../types/tool-item';
import { Domain, Platform, FunctionKind } from '../../types/item-types';
import { TranslatorService } from '../../services/translator.service';
import { FooterColorService } from '../../services/footer-color.service';
import {
  ItemListSectionComponent,
  DisplayItem,
} from '../../components/item-list-section/item-list-section.component';
import { EnumDisplayService } from '../../services/enum-display.service';
import { BeginnerHeaderComponent } from '../../components/beginner-header/beginner-header.component';
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
}

@Component({
  selector: 'app-guis-and-tools',
  imports: [
    CommonModule,
    FormsModule,
    TranslocoModule,
    ItemListSectionComponent,
    BeginnerHeaderComponent,
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
  private readonly translocoService = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly enumDisplayService = inject(EnumDisplayService);

  private sectionObserver: IntersectionObserver | null = null;

  private imageGuis = toSignal(this.dataService.imageGuis);
  private textGuis = toSignal(this.dataService.textGuis);
  private tools = toSignal(this.dataService.tools);
  private resources = toSignal(this.dataService.resources);

  // Search and filter signals
  public searchQuery = signal<string>('');
  public selectedTypes = signal<Set<string>>(new Set());
  public selectedCategories = signal<Set<string>>(new Set());
  public expandedRows = signal<Set<string>>(new Set());
  public collapsedSections = signal<Set<string>>(new Set());
  public showScrollToTop = signal<boolean>(false);
  public showFiltersPanel = signal<boolean>(false);
  public viewMode = signal<ViewMode>('table');
  public activeSection = signal<string>('guis');

  /** Sections configuration for TOC and rendering */
  public readonly sections: SectionInfo[] = [
    { id: 'guis', titleKey: 'guis_and_tools_page.guis_section_title', items: () => this.filteredGuis() },
    { id: 'workers', titleKey: 'guis_and_tools_page.workers_section_title', items: () => this.filteredWorkers() },
    { id: 'resources', titleKey: 'guis_and_tools_page.resources_section_title', items: () => this.filteredResources() },
    { id: 'utilities', titleKey: 'guis_and_tools_page.utilities_section_title', items: () => this.filteredUtilities() },
    { id: 'bots', titleKey: 'guis_and_tools_page.bots_section_title', items: () => this.filteredBots() },
    { id: 'developer_tools', titleKey: 'guis_and_tools_page.developer_tools_section_title', items: () => this.filteredDeveloperTools() },
  ];

  /** Get visible sections (those with items after filtering) */
  public visibleSections = computed(() => {
    return this.sections.filter(section => section.items().length > 0);
  });

  // Combined items (GUIs, Tools, and Resources)
  public allItems = computed(() => {
    const imageGuis = this.imageGuis();
    const textGuis = this.textGuis();
    const tools = this.tools();
    const resources = this.resources();

    if (
      imageGuis === undefined ||
      textGuis === undefined ||
      tools === undefined ||
      resources === undefined
    ) {
      return [];
    }

    const result: ExtendedItem[] = [];
    const seenGuisImage = new Set<string>();
    const seenGuisText = new Set<string>();
    const seenTools = new Set<string>();
    const seenResources = new Set<string>();

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
        const descMatch = item.description?.toLowerCase().includes(query) ?? false;
        const categoryMatch = item.categories.some(cat => cat.toLowerCase().includes(query));
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

  // Separate items by category for grouped display
  public filteredGuis = computed(() => {
    return this.filteredItems().filter(
      (item) =>
        item.itemType === ItemType.GUI_IMAGE ||
        item.itemType === ItemType.GUI_TEXT,
    );
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

  ngOnInit(): void {
    this.footerColor.setDarkMode(false);

    // Set title reactively with automatic cleanup
    this.translator
      .get('guis_and_tools_page.title')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((title) => this.title.setTitle(title));
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.setupScrollSpy();
    }
  }

  ngOnDestroy(): void {
    if (this.sectionObserver) {
      this.sectionObserver.disconnect();
    }
  }

  private setupScrollSpy(): void {
    // Set up IntersectionObserver to track which section is in view
    const options: IntersectionObserverInit = {
      root: null,
      rootMargin: '-20% 0px -60% 0px', // Trigger when section is in upper portion of viewport
      threshold: 0,
    };

    this.sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.id.replace('section-', '');
          this.activeSection.set(sectionId);
        }
      });
    }, options);

    // Observe all section elements
    this.sections.forEach((section) => {
      const element = document.getElementById(`section-${section.id}`);
      if (element) {
        this.sectionObserver?.observe(element);
      }
    });
  }

  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    // Show button after scrolling down 300px
    const scrollPosition =
      window.pageYOffset ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;
    this.showScrollToTop.set(scrollPosition > 300);
  }

  public scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    this.showFiltersPanel.update(v => !v);
  }

  public setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  public scrollToSection(sectionId: string, event?: Event): void {
    if (event) {
      event.preventDefault();
    }
    const element = document.getElementById(`section-${sectionId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.activeSection.set(sectionId);
    }
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

  public getButtonText(item: ExtendedItem): string {
    if (item.downloadButtonText) {
      // The downloadButtonText already has the name interpolated from context-replacer
      return item.downloadButtonText;
    }
    if (item.itemType === ItemType.TOOL) {
      return this.translocoService.translate('guis_and_tools.go_to_tool', {
        toolName: item.name,
      });
    }
    return this.translocoService.translate('guis_and_tools.go_to', {
      name: item.name,
    });
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
    };
  }
}
