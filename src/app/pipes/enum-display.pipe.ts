import { Pipe, PipeTransform } from '@angular/core';
import { EnumDisplayService } from '../services/enum-display.service';
import { ItemType, Domain, Platform, FunctionType } from '../types/item-types';

/**
 * Type of display information to retrieve
 */
export type DisplayType = 'label' | 'badge' | 'translation';

/**
 * Category of enum to process
 */
export type EnumCategory =
  | 'itemType'
  | 'domain'
  | 'platform'
  | 'functionType'
  | 'category';

/**
 * Pipe for converting enum values to display strings in templates.
 * Provides a clean, declarative way to use EnumDisplayService in Angular templates.
 *
 * Following Angular best practices:
 * - Standalone pipe for easy reusability
 * - Pure pipe for optimal performance (default)
 * - Type-safe parameters
 * - Clear, descriptive naming
 *
 * @example
 * // Get label for item type
 * {{ 'gui-image' | enumDisplay:'itemType' }}
 * // Output: "Image GUI"
 *
 * @example
 * // Get badge class for domain
 * <span [class]="'image' | enumDisplay:'domain':'badge'">Image</span>
 * // Applies class: "badge-purple"
 *
 * @example
 * // Get translation key
 * {{ ('gui-image' | enumDisplay:'itemType':'translation') || 'itemType' | transloco }}
 */
@Pipe({
  name: 'enumDisplay',
  standalone: true,
})
export class EnumDisplayPipe implements PipeTransform {
  constructor(private enumDisplayService: EnumDisplayService) {}

  /**
   * Transform enum value to display information
   *
   * @param value - The enum value to transform
   * @param enumCategory - Category of enum (itemType, domain, platform, functionType, category)
   * @param displayType - Type of display info to retrieve ('label' | 'badge' | 'translation')
   * @returns Display string (label, CSS class, or translation key)
   */
  transform(
    value: string | ItemType | Domain | Platform | FunctionType,
    enumCategory: EnumCategory = 'category',
    displayType: DisplayType = 'label',
  ): string | undefined {
    if (!value) {
      return '';
    }

    const stringValue = String(value);

    switch (enumCategory) {
      case 'itemType':
        return this.transformItemType(stringValue, displayType);

      case 'domain':
        return this.transformDomain(stringValue, displayType);

      case 'platform':
        return this.transformPlatform(stringValue, displayType);

      case 'functionType':
        return this.transformFunctionType(stringValue, displayType);

      case 'category':
        return this.transformCategory(stringValue, displayType);

      default:
        return this.enumDisplayService.capitalizeFirst(stringValue);
    }
  }

  /**
   * Transform ItemType value
   */
  private transformItemType(
    value: string,
    displayType: DisplayType,
  ): string | undefined {
    switch (displayType) {
      case 'label':
        return this.enumDisplayService.getItemTypeLabel(value as ItemType);
      case 'badge':
        return this.enumDisplayService.getItemTypeBadgeClass(value as ItemType);
      case 'translation':
        return this.enumDisplayService.getItemTypeTranslationKey(
          value as ItemType,
        );
      default:
        return this.enumDisplayService.getItemTypeLabel(value as ItemType);
    }
  }

  /**
   * Transform Domain value
   */
  private transformDomain(
    value: string,
    displayType: DisplayType,
  ): string | undefined {
    switch (displayType) {
      case 'label':
        return this.enumDisplayService.getDomainLabel(value as Domain);
      case 'badge':
        return this.enumDisplayService.getDomainBadgeClass(value as Domain);
      case 'translation':
        return undefined; // Domains don't have translation keys currently
      default:
        return this.enumDisplayService.getDomainLabel(value as Domain);
    }
  }

  /**
   * Transform Platform value
   */
  private transformPlatform(
    value: string,
    displayType: DisplayType,
  ): string | undefined {
    switch (displayType) {
      case 'label':
        return this.enumDisplayService.getPlatformLabel(value as Platform);
      case 'badge':
        return this.enumDisplayService.getPlatformBadgeClass(value as Platform);
      case 'translation':
        return undefined; // Platforms don't have translation keys currently
      default:
        return this.enumDisplayService.getPlatformLabel(value as Platform);
    }
  }

  /**
   * Transform FunctionType value
   */
  private transformFunctionType(
    value: string,
    displayType: DisplayType,
  ): string | undefined {
    switch (displayType) {
      case 'label':
        return this.enumDisplayService.getFunctionTypeLabel(
          value as FunctionType,
        );
      case 'badge':
        return this.enumDisplayService.getFunctionTypeBadgeClass(
          value as FunctionType,
        );
      case 'translation':
        return undefined; // Function types don't have translation keys currently
      default:
        return this.enumDisplayService.getFunctionTypeLabel(
          value as FunctionType,
        );
    }
  }

  /**
   * Transform generic category value
   */
  private transformCategory(
    value: string,
    displayType: DisplayType,
  ): string | undefined {
    switch (displayType) {
      case 'label':
        return this.enumDisplayService.capitalizeFirst(value);
      case 'badge':
        return this.enumDisplayService.getCategoryBadgeClass(value);
      case 'translation':
        return undefined; // Generic categories don't have translation keys
      default:
        return this.enumDisplayService.capitalizeFirst(value);
    }
  }
}
