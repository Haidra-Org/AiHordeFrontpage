import {
  Component,
  input,
  output,
  WritableSignal,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { EnumDisplayService } from '../../services/enum-display.service';
import { InfoTooltipComponent } from '../info-tooltip/info-tooltip.component';
import { IconComponent } from '../icon/icon.component';
import {
  ItemType,
  Domain,
  Platform,
  FunctionKind,
} from '../../types/item-types';

export type ViewMode = 'table' | 'grid';

export interface DisplayItem {
  name: string;
  description: string;
  image?: string;
  link: string;
  uniqueId: string;
  itemType: ItemType;
  categories: string[];
  domain?: Domain[];
  platform?: Platform[];
  functionKind: FunctionKind;
  downloadButtonText?: string | null;
  sourceControlLink?: string;
  recommended?: boolean;
  easyToUse?: boolean;
  /** The entry is one of this site's own pages: it opens without an install. */
  onThisSite?: boolean;
  /** ISO date on which the entry was last checked against its own site. */
  lastVerified?: string;
}

@Component({
  selector: 'app-item-list-section',
  imports: [RouterLink, TranslocoModule, InfoTooltipComponent, IconComponent],
  templateUrl: './item-list-section.component.html',
  styleUrl: './item-list-section.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemListSectionComponent {
  private readonly enumDisplayService = inject(EnumDisplayService);

  private readonly translocoService = inject(TranslocoService);

  // Inputs
  readonly items = input.required<DisplayItem[]>();
  readonly sectionName = input.required<string>();
  readonly title = input.required<string>();
  readonly expandedRows = input.required<WritableSignal<Set<string>>>();
  readonly collapsedSections = input.required<WritableSignal<Set<string>>>();
  readonly viewMode = input<ViewMode>('table');

  /** Optional i18n key for an info-tooltip shown next to the section heading. */
  readonly tooltipKey = input<string | undefined>(undefined);

  /** Optional glossary term ID for the section tooltip's "Learn more" link. */
  readonly tooltipGlossaryId = input<string | undefined>(undefined);

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

  public getFilteredCategories(item: DisplayItem): string[] {
    return item.categories.filter(
      (cat) =>
        !this.enumDisplayService.isPlatformCategory(cat) &&
        !this.enumDisplayService.isDomainCategory(cat),
    );
  }

  public getPrimaryFunction(item: DisplayItem): string {
    return this.enumDisplayService.getFunctionTypeLabel(item.functionKind);
  }

  public getDomainDisplay(item: DisplayItem): string {
    return this.enumDisplayService.getDomainArrayLabel(item.domain);
  }

  public getPlatformDisplay(item: DisplayItem): string {
    return this.enumDisplayService.getPlatformGroupedLabel(item.platform);
  }

  public getButtonText(item: DisplayItem): string {
    if (item.downloadButtonText) {
      return item.downloadButtonText;
    }
    return this.translocoService.translate('guis_and_tools.visit');
  }

  /**
   * The month and year an entry was last checked, in the reader's language.
   * The date is read in UTC so a server render and a browser render of the
   * same entry cannot disagree across a timezone boundary.
   */
  public verifiedLabel(isoDate: string): string {
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return isoDate;
    return new Intl.DateTimeFormat(this.translocoService.getActiveLang(), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(parsed);
  }

  public getSourceControlDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      if (hostname.includes('github.com')) return 'GitHub';
      if (hostname.includes('gitlab.com')) return 'GitLab';
      if (hostname.includes('bitbucket.org')) return 'Bitbucket';
      if (hostname.includes('codeberg.org')) return 'Codeberg';
      if (hostname.includes('sourceforge.net')) return 'SourceForge';

      // Fallback: extract domain without TLD
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        const domain = parts.at(-2);
        if (domain) {
          return domain.charAt(0).toUpperCase() + domain.slice(1);
        }
      }

      return 'Source';
    } catch {
      return 'Source';
    }
  }

  /** Links into this site are routed in the same tab rather than opened out. */
  public isInternalLink(url: string): boolean {
    return url.startsWith('/');
  }

  public isDiscordLink(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return (
        hostname === 'discord.com' ||
        hostname === 'discord.gg' ||
        hostname.endsWith('.discord.com')
      );
    } catch {
      return false;
    }
  }
}
