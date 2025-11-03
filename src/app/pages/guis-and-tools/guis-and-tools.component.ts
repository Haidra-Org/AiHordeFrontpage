import {
  Component,
  computed,
  DestroyRef,
  HostListener,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
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

@Component({
  selector: 'app-guis-and-tools',
  standalone: true,
  imports: [
    CommonModule,
    TranslocoModule,
    ItemListSectionComponent,
    BeginnerHeaderComponent,
  ],
  templateUrl: './guis-and-tools.component.html',
  styleUrl: './guis-and-tools.component.css',
})
export class GuisAndToolsComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly footerColor = inject(FooterColorService);
  private readonly dataService = inject(DataService);
  private readonly translocoService = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly enumDisplayService = inject(EnumDisplayService);

  private imageGuis = toSignal(this.dataService.imageGuis);
  private textGuis = toSignal(this.dataService.textGuis);
  private tools = toSignal(this.dataService.tools);
  private resources = toSignal(this.dataService.resources);

  // Filter signals - multi-select
  public selectedTypes = signal<Set<string>>(new Set());
  public selectedCategories = signal<Set<string>>(new Set());
  public expandedRows = signal<Set<string>>(new Set());
  public collapsedSections = signal<Set<string>>(new Set());
  public showScrollToTop = signal<boolean>(false);

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

    return items.filter((item) => {
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
