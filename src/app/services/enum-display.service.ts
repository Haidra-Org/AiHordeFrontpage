import { Injectable } from '@angular/core';
import { ItemType, Domain, Platform, FunctionType } from '../types/item-types';

/**
 * Configuration for how an enum value should be displayed
 */
export interface DisplayConfig {
  /** Human-readable label */
  label: string;
  /** Optional translation key for i18n */
  translationKey?: string;
  /** Optional CSS class for badges/styling */
  badgeClass?: string;
}

/**
 * Mapping type for enum values to their display configurations
 */
type EnumDisplayMap<T extends string | number> = Record<T, DisplayConfig>;

/**
 * Service for centralizing enum-to-display-string mapping logic.
 * Provides type-safe, reusable methods for converting enum values to human-readable strings,
 * translation keys, and CSS classes.
 *
 * Following Angular best practices:
 * - Injectable with providedIn: 'root' for singleton pattern
 * - Type-safe using TypeScript generics
 * - Immutable configuration objects
 * - Pure functions without side effects
 *
 * @example
 * // In component:
 * constructor(private enumDisplay: EnumDisplayService) {}
 *
 * getLabel() {
 *   return this.enumDisplay.getItemTypeLabel(ItemType.GUI_IMAGE);
 * }
 */
@Injectable({
  providedIn: 'root',
})
export class EnumDisplayService {
  /**
   * Mapping for ItemType enum values
   */
  private readonly itemTypeMap: EnumDisplayMap<ItemType> = {
    [ItemType.GUI_IMAGE]: {
      label: 'Image GUI',
      translationKey: 'guis.image',
      badgeClass: 'badge-primary',
    },
    [ItemType.GUI_TEXT]: {
      label: 'Text GUI',
      translationKey: 'guis.text',
      badgeClass: 'badge-primary',
    },
    [ItemType.TOOL]: {
      label: 'Tool',
      translationKey: 'tools.tool',
      badgeClass: 'badge-warning',
    },
  };

  /**
   * Mapping for Domain enum values
   */
  private readonly domainMap: EnumDisplayMap<Domain> = {
    [Domain.TEXT]: {
      label: 'Text',
      badgeClass: 'badge-purple',
    },
    [Domain.IMAGE]: {
      label: 'Image',
      badgeClass: 'badge-purple',
    },
    [Domain.BOTH]: {
      label: 'Both',
      badgeClass: 'badge-purple',
    },
  };

  /**
   * Mapping for Platform enum values
   */
  private readonly platformMap: EnumDisplayMap<Platform> = {
    [Platform.WEB]: {
      label: 'Web',
      badgeClass: 'badge-info',
    },
    [Platform.DESKTOP]: {
      label: 'Desktop',
      badgeClass: 'badge-info',
    },
    [Platform.IOS]: {
      label: 'iOS',
      badgeClass: 'badge-info',
    },
    [Platform.ANDROID]: {
      label: 'Android',
      badgeClass: 'badge-info',
    },
    [Platform.CLI]: {
      label: 'CLI',
      badgeClass: 'badge-info',
    },
    [Platform.SERVER]: {
      label: 'Server',
      badgeClass: 'badge-info',
    },
    [Platform.PROGRAMMING]: {
      label: 'Programming',
      badgeClass: 'badge-info',
    },
  };

  /**
   * Mapping for FunctionType enum values
   */
  private readonly functionTypeMap: EnumDisplayMap<FunctionType> = {
    [FunctionType.FRONTEND]: {
      label: 'Frontend',
      badgeClass: 'badge-warning',
    },
    [FunctionType.WORKER]: {
      label: 'Worker',
      badgeClass: 'badge-warning',
    },
    [FunctionType.BOT]: {
      label: 'Bot',
      badgeClass: 'badge-warning',
    },
    [FunctionType.PLUGIN]: {
      label: 'Plugin',
      badgeClass: 'badge-warning',
    },
    [FunctionType.SDK]: {
      label: 'SDK',
      badgeClass: 'badge-warning',
    },
    [FunctionType.CLI_TOOL]: {
      label: 'CLI',
      badgeClass: 'badge-warning',
    },
    [FunctionType.TOOL]: {
      label: 'Tool',
      badgeClass: 'badge-warning',
    },
  };

  /**
   * Generic method to get display configuration for any enum value
   */
  private getDisplayConfig<T extends string | number>(
    value: T,
    map: EnumDisplayMap<T>,
  ): DisplayConfig | null {
    return map[value] || null;
  }

  // ============================================================================
  // ItemType Methods
  // ============================================================================

  /**
   * Get human-readable label for ItemType
   * @param itemType - The ItemType enum value
   * @returns Display label or fallback string
   */
  getItemTypeLabel(itemType: ItemType | string): string {
    if (this.isItemType(itemType)) {
      return this.itemTypeMap[itemType].label;
    }
    return this.capitalizeFirst(itemType);
  }

  /**
   * Get translation key for ItemType
   * @param itemType - The ItemType enum value
   * @returns Translation key or undefined
   */
  getItemTypeTranslationKey(itemType: ItemType | string): string | undefined {
    if (this.isItemType(itemType)) {
      return this.itemTypeMap[itemType].translationKey;
    }
    return undefined;
  }

  /**
   * Get badge CSS class for ItemType
   * @param itemType - The ItemType enum value
   * @returns CSS class name
   */
  getItemTypeBadgeClass(itemType: ItemType | string): string {
    if (this.isItemType(itemType)) {
      return this.itemTypeMap[itemType].badgeClass || 'badge-secondary';
    }
    return 'badge-secondary';
  }

  // ============================================================================
  // Domain Methods
  // ============================================================================

  /**
   * Get human-readable label for Domain
   * @param domain - The Domain enum value
   * @returns Display label or fallback string
   */
  getDomainLabel(domain: Domain | string): string {
    if (this.isDomain(domain)) {
      return this.domainMap[domain].label;
    }
    return this.capitalizeFirst(domain);
  }

  /**
   * Get badge CSS class for Domain
   * @param domain - The Domain enum value
   * @returns CSS class name
   */
  getDomainBadgeClass(domain: Domain | string): string {
    if (this.isDomain(domain)) {
      return this.domainMap[domain].badgeClass || 'badge-secondary';
    }
    return 'badge-secondary';
  }

  // ============================================================================
  // Platform Methods
  // ============================================================================

  /**
   * Get human-readable label for Platform
   * @param platform - The Platform enum value
   * @returns Display label or fallback string
   */
  getPlatformLabel(platform: Platform | string): string {
    if (this.isPlatform(platform)) {
      return this.platformMap[platform].label;
    }
    return this.capitalizeFirst(platform);
  }

  /**
   * Get badge CSS class for Platform
   * @param platform - The Platform enum value
   * @returns CSS class name
   */
  getPlatformBadgeClass(platform: Platform | string): string {
    if (this.isPlatform(platform)) {
      return this.platformMap[platform].badgeClass || 'badge-secondary';
    }
    return 'badge-secondary';
  }

  // ============================================================================
  // FunctionType Methods
  // ============================================================================

  /**
   * Get human-readable label for FunctionType
   * @param functionType - The FunctionType enum value
   * @returns Display label or fallback string
   */
  getFunctionTypeLabel(functionType: FunctionType | string): string {
    if (this.isFunctionType(functionType)) {
      return this.functionTypeMap[functionType].label;
    }
    return this.capitalizeFirst(functionType);
  }

  /**
   * Get badge CSS class for FunctionType
   * @param functionType - The FunctionType enum value
   * @returns CSS class name
   */
  getFunctionTypeBadgeClass(functionType: FunctionType | string): string {
    if (this.isFunctionType(functionType)) {
      return this.functionTypeMap[functionType].badgeClass || 'badge-secondary';
    }
    return 'badge-secondary';
  }

  // ============================================================================
  // Category/Generic Badge Methods
  // ============================================================================

  /**
   * Get badge CSS class for generic category strings
   * Provides fallback logic for non-enum categories
   * @param category - Category string (can be any category name)
   * @returns CSS class name
   */
  getCategoryBadgeClass(category: string): string {
    const categoryLower = category.toLowerCase();

    // Platform types
    if (
      [
        'desktop',
        'ios',
        'android',
        'web',
        'cli',
        'server',
        'programming',
      ].includes(categoryLower)
    ) {
      return 'badge-info';
    }

    // Domain types
    if (
      ['image generation', 'text generation', 'image', 'text'].includes(
        categoryLower,
      )
    ) {
      return 'badge-purple';
    }

    // Tool types
    if (
      ['worker', 'bot', 'plugin', 'sdk', 'cli', 'frontend'].includes(
        categoryLower,
      )
    ) {
      return 'badge-warning';
    }

    // Categories
    if (
      [
        'official tools',
        'community bots',
        'community plugins',
        'community sdks',
      ].includes(categoryLower)
    ) {
      return 'badge-teal';
    }

    // Development related
    if (['development', 'accessibility'].includes(categoryLower)) {
      return 'badge-indigo';
    }

    return 'badge-secondary';
  }

  // ============================================================================
  // Type Guards
  // ============================================================================

  /**
   * Type guard to check if a string is a valid ItemType
   */
  private isItemType(value: string): value is ItemType {
    return Object.values(ItemType).includes(value as ItemType);
  }

  /**
   * Type guard to check if a string is a valid Domain
   */
  private isDomain(value: string): value is Domain {
    return Object.values(Domain).includes(value as Domain);
  }

  /**
   * Type guard to check if a string is a valid Platform
   */
  private isPlatform(value: string): value is Platform {
    return Object.values(Platform).includes(value as Platform);
  }

  /**
   * Type guard to check if a string is a valid FunctionType
   */
  private isFunctionType(value: string): value is FunctionType {
    return Object.values(FunctionType).includes(value as FunctionType);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Capitalize the first letter of a string
   * @param str - String to capitalize
   * @returns Capitalized string
   */
  capitalizeFirst(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Convert string to kebab-case
   * @param str - String to convert
   * @returns Kebab-cased string
   * @example toKebabCase('Hello World') => 'hello-world'
   */
  toKebabCase(str: string): string {
    if (!str) return '';
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }

  /**
   * Convert string to snake_case
   * @param str - String to convert
   * @returns Snake_cased string
   * @example toSnakeCase('Hello World') => 'hello_world'
   */
  toSnakeCase(str: string): string {
    if (!str) return '';
    return str
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
  }

  /**
   * Truncate string with ellipsis
   * @param str - String to truncate
   * @param maxLength - Maximum length before truncation
   * @param ellipsis - Ellipsis string to append (default: '...')
   * @returns Truncated string
   * @note For simple truncation without ellipsis, Angular's SlicePipe can be used: {{ value | slice:0:maxLength }}
   * This method adds ellipsis, which SlicePipe doesn't provide.
   */
  truncate(str: string, maxLength: number, ellipsis: string = '...'): string {
    if (!str || str.length <= maxLength) return str;
    return str.substring(0, maxLength - ellipsis.length) + ellipsis;
  }

  /**
   * Simple pluralize (adds 's' or uses custom plural form)
   * @param count - Count of items
   * @param singular - Singular form
   * @param plural - Optional custom plural form
   * @returns Pluralized string
   * @example pluralize(1, 'item') => 'item'
   * @example pluralize(2, 'item') => 'items'
   * @example pluralize(2, 'child', 'children') => 'children'
   */
  pluralize(count: number, singular: string, plural?: string): string {
    if (count === 1) return singular;
    return plural || singular + 's';
  }

  /**
   * Convert array of platform strings to display labels
   * @param platforms - Array of platform strings
   * @returns Array of capitalized platform labels
   */
  getPlatformDisplayArray(platforms: string[]): string[] {
    return platforms.map((p) => this.getPlatformLabel(p as Platform));
  }

  /**
   * Check if a category string represents a platform
   * @param category - Category string to check
   * @returns True if category is a platform keyword
   */
  isPlatformCategory(category: string): boolean {
    const platformKeywords = [
      'desktop',
      'ios',
      'android',
      'web',
      'server',
      'cli',
      'programming',
    ];
    return platformKeywords.includes(category.toLowerCase());
  }

  /**
   * Check if a category string represents a domain
   * @param category - Category string to check
   * @returns True if category is a domain keyword
   */
  isDomainCategory(category: string): boolean {
    const domainKeywords = [
      'image generation',
      'text generation',
      'image',
      'text',
    ];
    return domainKeywords.includes(category.toLowerCase());
  }

  /**
   * Check if a category string represents a function type
   * @param category - Category string to check
   * @returns True if category is a function type keyword
   */
  isFunctionTypeCategory(category: string): boolean {
    const functionKeywords = [
      'worker',
      'bot',
      'plugin',
      'sdk',
      'cli',
      'frontend',
      'tool',
    ];
    return functionKeywords.includes(category.toLowerCase());
  }

  /**
   * Check if a string is empty or only whitespace
   * @param str - String to check
   * @returns True if empty or whitespace
   */
  isEmpty(str: string | null | undefined): boolean {
    return !str || str.trim().length === 0;
  }

  /**
   * Check if a string is a valid URL
   * @param str - String to check
   * @returns True if valid URL
   */
  isValidUrl(str: string): boolean {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a string is a valid email format
   * @param str - String to check
   * @returns True if valid email format
   */
  isValidEmail(str: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(str);
  }

  /**
   * Check if a string is numeric
   * @param str - String to check
   * @returns True if numeric
   */
  isNumeric(str: string): boolean {
    return !isNaN(Number(str)) && !isNaN(parseFloat(str));
  }
}
