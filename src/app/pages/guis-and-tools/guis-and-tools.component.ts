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
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
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
import { EnumDisplayService } from '../../services/enum-display.service';
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
  host: {
    '(window:scroll)': 'onWindowScroll()',
  },
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
  private readonly stickyRegistry = inject(StickyRegistryService);

  private sectionObserver: IntersectionObserver | null = null;

  /** Tracks whether the user manually scrolled the pills container. */
  private userOverriddenAt = 0;
  /** The vertical scroll position when auto-centering last engaged. */
  private lastAutoEngageScrollY = 0;
  private static readonly REENGAGE_THRESHOLD = 100;

  readonly pillsScroll = viewChild<ElementRef<HTMLElement>>('pillsScroll');

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
  public showFiltersPanel = signal<boolean>(false);
  public viewMode = signal<ViewMode>('grid');
  public activeSection = signal<string>('guis-image');
  /** 0–100 scroll progress through the currently active section. */
  public activeSectionProgress = signal<number>(0);

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
  ];

  /** Get visible sections (those with items after filtering) */
  public visibleSections = computed(() => {
    return this.sections.filter((section) => section.items().length > 0);
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

  // Separate items by category for grouped display
  public filteredImageGuis = computed(() => {
    return this.filteredItems()
      .filter((item) => item.itemType === ItemType.GUI_IMAGE)
      .sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
  });

  public filteredTextGuis = computed(() => {
    return this.filteredItems()
      .filter((item) => item.itemType === ItemType.GUI_TEXT)
      .sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
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
    // Auto-center the active pill when the active section changes
    effect(() => {
      const active = this.activeSection();
      if (!isPlatformBrowser(this.platformId)) return;
      setTimeout(() => this.autoCenterActivePill(active), 60);
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

  onWindowScroll(): void {
    const scrollPosition =
      window.pageYOffset ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;
    // Re-engage auto-centering after enough vertical scroll
    if (
      this.userOverriddenAt > 0 &&
      Math.abs(scrollPosition - this.lastAutoEngageScrollY) >
        GuisAndToolsComponent.REENGAGE_THRESHOLD
    ) {
      this.userOverriddenAt = 0;
    }

    // Calculate scroll progress through the active section
    const activeSectionEl = document.getElementById(
      `section-${this.activeSection()}`,
    );
    if (activeSectionEl) {
      const rect = activeSectionEl.getBoundingClientRect();
      const sectionHeight = rect.height;
      if (sectionHeight > 0) {
        const scrolled = -rect.top;
        const progress = Math.min(
          100,
          Math.max(0, (scrolled / sectionHeight) * 100),
        );
        this.activeSectionProgress.set(Math.round(progress));
      }
    }
  }

  /** Called by the pills scroll container on horizontal scroll. */
  public onPillsManualScroll(): void {
    this.userOverriddenAt = Date.now();
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

  /** Returns an inline background style for the active pill's progressive fill. */
  public pillBackground(sectionId: string): string | null {
    if (this.activeSection() !== sectionId) return null;
    const p = this.activeSectionProgress();
    return `linear-gradient(to right, var(--pill-fill) ${p}%, var(--pill-empty) ${p}%)`;
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

  /** Programmatically center the active pill unless the user recently swiped. */
  private autoCenterActivePill(activeSectionId: string): void {
    if (this.userOverriddenAt > 0) return;

    const container = this.pillsScroll()?.nativeElement;
    if (!container) return;

    const pill = container.querySelector(
      `[data-section-id="${activeSectionId}"]`,
    );
    if (!pill) return;

    // Use horizontal-only scrolling to avoid browser vertical adjustments that
    // can happen with scrollIntoView on mobile when sticky elements are present.
    const containerRect = container.getBoundingClientRect();
    const pillRect = pill.getBoundingClientRect();
    const currentLeft = container.scrollLeft;
    const deltaLeft =
      pillRect.left -
      containerRect.left -
      (container.clientWidth / 2 - pill.clientWidth / 2);
    const maxLeft = container.scrollWidth - container.clientWidth;
    const targetLeft = Math.max(0, Math.min(maxLeft, currentLeft + deltaLeft));

    container.scrollTo({
      left: targetLeft,
      behavior: 'smooth',
    });

    this.lastAutoEngageScrollY =
      window.pageYOffset ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;
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
    };
  }
}
