import {
  Component,
  input,
  output,
  signal,
  WritableSignal,
  ElementRef,
  viewChild,
  effect,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { EnumDisplayService } from '../../services/enum-display.service';
import { EnumDisplayPipe } from '../../pipes/enum-display.pipe';
import {
  ItemType,
  Domain,
  Platform,
  FunctionType,
} from '../../types/item-types';

export interface DisplayItem {
  name: string;
  description: string;
  image: string;
  link: string;
  uniqueId: string;
  itemType: string;
  categories: string[];
  domain?: string;
  platform?: string[];
  functionType?: string;
  downloadButtonText?: string | null;
}

@Component({
  selector: 'app-item-list-section',
  standalone: true,
  imports: [CommonModule, TranslocoModule, EnumDisplayPipe],
  templateUrl: './item-list-section.component.html',
  styleUrl: './item-list-section.component.css',
})
export class ItemListSectionComponent {
  private readonly platformId = inject(PLATFORM_ID);
  
  constructor(private enumDisplayService: EnumDisplayService) {
    // Set up IntersectionObserver when header element is available (browser only)
    effect(() => {
      if (isPlatformBrowser(this.platformId)) {
        const headerElement = this.sectionHeader();
        if (headerElement) {
          this.setupStickyObserver(headerElement);
        }
      }
    });
  }
  
  // View child for the section header element
  readonly sectionHeader = viewChild<ElementRef<HTMLElement>>('sectionHeader');
  
  // Signal to track if header is stuck
  readonly isStuck = signal(false);
  
  // Inputs
  readonly items = input.required<DisplayItem[]>();
  readonly sectionName = input.required<string>();
  readonly title = input.required<string>();
  readonly expandedRows = input.required<WritableSignal<Set<string>>>();
  readonly collapsedSections = input.required<WritableSignal<Set<string>>>();

  // Outputs
  readonly rowToggle = output<string>();
  readonly sectionToggle = output<string>();

  public toggleRow(itemName: string): void {
    this.rowToggle.emit(itemName);
  }

  public toggleSection(): void {
    this.sectionToggle.emit(this.sectionName());
  }

  public isExpanded(itemName: string): boolean {
    return this.expandedRows()().has(itemName);
  }

  public isSectionCollapsed(): boolean {
    return this.collapsedSections()().has(this.sectionName());
  }

  public getItemTypeLabel(itemType: string): string {
    return (
      this.enumDisplayService.getItemTypeTranslationKey(itemType as ItemType) ||
      itemType
    );
  }

  public getBadgeClass(category: string): string {
    return this.enumDisplayService.getCategoryBadgeClass(category);
  }

  public getFilteredCategories(item: DisplayItem): string[] {
    return item.categories.filter(
      (cat) =>
        !this.enumDisplayService.isPlatformCategory(cat) &&
        !this.enumDisplayService.isDomainCategory(cat),
    );
  }

  public getPrimaryFunction(item: DisplayItem): string {
    // Use explicit functionType if available
    if (item.functionType) {
      return this.enumDisplayService.getFunctionTypeLabel(
        item.functionType as FunctionType,
      );
    }

    // Fallback to GUI detection
    if (
      item.itemType === ItemType.GUI_IMAGE ||
      item.itemType === ItemType.GUI_TEXT
    ) {
      return this.enumDisplayService.getFunctionTypeLabel(
        FunctionType.FRONTEND,
      );
    }

    // Fallback to category-based inference
    const categoryLower = item.categories.map((c) => c.toLowerCase());

    if (categoryLower.includes('worker'))
      return this.enumDisplayService.getFunctionTypeLabel(FunctionType.WORKER);
    if (categoryLower.includes('bot'))
      return this.enumDisplayService.getFunctionTypeLabel(FunctionType.BOT);
    if (categoryLower.includes('plugin'))
      return this.enumDisplayService.getFunctionTypeLabel(FunctionType.PLUGIN);
    if (categoryLower.includes('sdk'))
      return this.enumDisplayService.getFunctionTypeLabel(FunctionType.SDK);
    if (categoryLower.includes('cli'))
      return this.enumDisplayService.getFunctionTypeLabel(
        FunctionType.CLI_TOOL,
      );

    return this.enumDisplayService.getFunctionTypeLabel(FunctionType.TOOL);
  }

  public getDomainDisplay(item: DisplayItem): string {
    // Use explicit domain if available
    if (item.domain) {
      return this.enumDisplayService.getDomainLabel(item.domain as Domain);
    }

    // Fallback to item type inference
    if (item.itemType === ItemType.GUI_IMAGE)
      return this.enumDisplayService.getDomainLabel(Domain.IMAGE);
    if (item.itemType === ItemType.GUI_TEXT)
      return this.enumDisplayService.getDomainLabel(Domain.TEXT);

    // Fallback to category-based inference
    const categoryLower = item.categories.map((c) => c.toLowerCase());
    if (categoryLower.includes('image generation'))
      return this.enumDisplayService.getDomainLabel(Domain.IMAGE);
    if (categoryLower.includes('text generation'))
      return this.enumDisplayService.getDomainLabel(Domain.TEXT);

    return 'N/A';
  }

  public getPlatformDisplay(item: DisplayItem): string[] {
    // Use explicit platform if available
    if (item.platform && item.platform.length > 0) {
      return this.enumDisplayService.getPlatformDisplayArray(item.platform);
    }

    // Fallback to category-based extraction
    const platforms: string[] = item.categories.filter((cat) =>
      this.enumDisplayService.isPlatformCategory(cat),
    );

    return this.enumDisplayService.getPlatformDisplayArray(platforms);
  }

  public getButtonText(item: DisplayItem): string {
    if (item.downloadButtonText) {
      return item.downloadButtonText;
    }
    // Default translation key can be handled by parent or transloco pipe
    return 'Visit';
  }

  private setupStickyObserver(headerRef: ElementRef<HTMLElement>): void {
    const header = headerRef.nativeElement;
    
    // Get the parent container
    const parent = header.parentElement;
    if (!parent) return;
    
    // Create a sentinel element to detect when sticky activates
    // The sentinel should be positioned right where the header starts sticking
    const sentinel = document.createElement('div');
    sentinel.className = 'sticky-sentinel';
    sentinel.style.position = 'absolute';
    sentinel.style.left = '0';
    sentinel.style.right = '0';
    sentinel.style.height = '1px';
    sentinel.style.top = '0';
    sentinel.style.pointerEvents = 'none';
    sentinel.style.visibility = 'hidden';
    
    // Insert sentinel at the beginning of the parent
    parent.insertBefore(sentinel, parent.firstChild);
    
    // Observe the sentinel to detect when it leaves viewport (header becomes stuck)
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Use requestAnimationFrame for smoother updates on mobile
        requestAnimationFrame(() => {
          // When sentinel is not intersecting, header is stuck
          this.isStuck.set(!entry.isIntersecting);
        });
      },
      { 
        threshold: [0],
        // Root margin set to detect when top edge crosses viewport top
        rootMargin: '0px 0px 0px 0px',
      }
    );
    
    observer.observe(sentinel);
  }
}
