import { TestBed } from '@angular/core/testing';
import {
  ItemListSectionComponent,
  DisplayItem,
} from './item-list-section.component';
import { EnumDisplayService } from '../../services/enum-display.service';
import {
  ItemType,
  Domain,
  Platform,
  FunctionKind,
} from '../../types/item-types';

describe('ItemListSectionComponent - Data Structure Validation', () => {
  let enumDisplayService: EnumDisplayService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ItemListSectionComponent],
    }).compileComponents();

    enumDisplayService = TestBed.inject(EnumDisplayService);
  });

  // ============================================================================
  // DisplayItem interface validation - ensuring refactoring correctness
  // ============================================================================

  describe('DisplayItem Structure Requirements', () => {
    it('should require itemType field (not inferred)', () => {
      const validDisplayItem: DisplayItem = {
        name: 'Test GUI',
        description: 'Test description',
        link: 'https://test.com',
        uniqueId: 'test-gui',
        categories: ['Web'],
        itemType: ItemType.GUI_IMAGE,
        functionKind: FunctionKind.FRONTEND,
      };

      // itemType must be explicitly defined
      expect(validDisplayItem.itemType).toBeDefined();
      expect(validDisplayItem.itemType).toBe(ItemType.GUI_IMAGE);
    });

    it('should require functionKind field (not functionType)', () => {
      const validDisplayItem: DisplayItem = {
        name: 'Test Tool',
        description: 'Test description',
        link: 'https://test.com',
        uniqueId: 'test-tool',
        categories: ['Worker'],
        itemType: ItemType.TOOL,
        functionKind: FunctionKind.WORKER,
      };

      // functionKind must be explicitly defined (renamed from functionType)
      expect(validDisplayItem.functionKind).toBeDefined();
      expect(validDisplayItem.functionKind).toBe(FunctionKind.WORKER);
    });

    it('should have domain as optional array (not single value)', () => {
      const withDomain: DisplayItem = {
        name: 'Multi-Domain Tool',
        description: 'Supports multiple domains',
        link: 'https://test.com',
        uniqueId: 'multi-tool',
        categories: ['Bot'],
        itemType: ItemType.TOOL,
        functionKind: FunctionKind.BOT,
        domain: [Domain.IMAGE, Domain.TEXT],
      };

      // domain should be an array
      expect(Array.isArray(withDomain.domain)).toBe(true);
      expect(withDomain.domain).toContain(Domain.IMAGE);
      expect(withDomain.domain).toContain(Domain.TEXT);
    });

    it('should have platform as optional array (not single value)', () => {
      const withPlatform: DisplayItem = {
        name: 'Cross-Platform GUI',
        description: 'Works on multiple platforms',
        link: 'https://test.com',
        uniqueId: 'cross-platform-gui',
        categories: ['Desktop'],
        itemType: ItemType.GUI_IMAGE,
        functionKind: FunctionKind.FRONTEND,
        platform: [Platform.WINDOWS, Platform.LINUX, Platform.MACOS],
      };

      // platform should be an array
      expect(Array.isArray(withPlatform.platform)).toBe(true);
      expect(withPlatform.platform).toContain(Platform.WINDOWS);
      expect(withPlatform.platform).toContain(Platform.LINUX);
      expect(withPlatform.platform).toContain(Platform.MACOS);
    });

    it('should have categories as required array (always)', () => {
      const withCategories: DisplayItem = {
        name: 'Test Item',
        description: 'Has categories',
        link: 'https://test.com',
        uniqueId: 'test-item',
        categories: ['Web', 'Desktop'],
        itemType: ItemType.GUI_IMAGE,
        functionKind: FunctionKind.FRONTEND,
      };

      // categories must always be an array
      expect(Array.isArray(withCategories.categories)).toBe(true);
      expect(withCategories.categories.length).toBeGreaterThan(0);
    });
  });

  describe('Platform Display Service Integration', () => {
    it('should group desktop platforms when all three OS platforms present', () => {
      const desktopPlatforms: Platform[] = [
        Platform.WINDOWS,
        Platform.LINUX,
        Platform.MACOS,
      ];

      const label =
        enumDisplayService.getPlatformGroupedLabel(desktopPlatforms);
      expect(label).toBe('Desktop');
    });

    it('should display individual platforms when not all desktop OSes present', () => {
      const partialDesktop: Platform[] = [Platform.WINDOWS, Platform.LINUX];

      const label = enumDisplayService.getPlatformGroupedLabel(partialDesktop);
      expect(label).toBe('Windows, Linux');
    });

    it('should mix desktop grouping with other platforms', () => {
      const mixedPlatforms: Platform[] = [
        Platform.WINDOWS,
        Platform.LINUX,
        Platform.MACOS,
        Platform.WEB,
      ];

      const label = enumDisplayService.getPlatformGroupedLabel(mixedPlatforms);
      expect(label).toBe('Desktop, Web');
    });
  });

  describe('Domain Display Service Integration', () => {
    it('should join multiple domains with ampersand', () => {
      const domains: Domain[] = [Domain.IMAGE, Domain.TEXT];

      const label = enumDisplayService.getDomainArrayLabel(domains);
      expect(label).toBe('Image & Text');
    });

    it('should display single domain without separator', () => {
      const singleDomain: Domain[] = [Domain.IMAGE];

      const label = enumDisplayService.getDomainArrayLabel(singleDomain);
      expect(label).toBe('Image');
    });
  });

  describe('Real-world DisplayItem Patterns', () => {
    it('should represent Lucid Creations pattern (cross-platform desktop + web)', () => {
      const lucidCreations: DisplayItem = {
        name: 'Lucid Creations',
        description: 'Cross-platform GUI',
        link: 'https://test.com',
        uniqueId: 'lucid-creations',
        categories: ['Web', 'Desktop'],
        itemType: ItemType.GUI_IMAGE,
        domain: [Domain.IMAGE],
        platform: [
          Platform.WINDOWS,
          Platform.LINUX,
          Platform.MACOS,
          Platform.WEB,
        ],
        functionKind: FunctionKind.FRONTEND,
      };

      expect(lucidCreations.itemType).toBe(ItemType.GUI_IMAGE);
      expect(
        enumDisplayService.getPlatformGroupedLabel(lucidCreations.platform!),
      ).toBe('Desktop, Web');
    });

    it('should represent worker pattern (server-side tool)', () => {
      const worker: DisplayItem = {
        name: 'horde-worker-reGen',
        description: 'GPU worker',
        link: 'https://test.com',
        uniqueId: 'horde-worker-regen',
        categories: ['Worker', 'Image Generation'],
        itemType: ItemType.TOOL,
        domain: [Domain.IMAGE],
        platform: [Platform.SERVER],
        functionKind: FunctionKind.WORKER,
      };

      expect(worker.functionKind).toBe(FunctionKind.WORKER);
      expect(worker.platform).toEqual([Platform.SERVER]);
    });

    it('should represent multi-domain bot pattern', () => {
      const bot: DisplayItem = {
        name: 'Discord Bot',
        description: 'Multi-domain bot',
        link: 'https://test.com',
        uniqueId: 'discord-bot',
        categories: ['Bot'],
        itemType: ItemType.TOOL,
        domain: [Domain.IMAGE, Domain.TEXT],
        platform: [Platform.SERVER],
        functionKind: FunctionKind.BOT,
      };

      expect(bot.domain).toEqual([Domain.IMAGE, Domain.TEXT]);
      expect(enumDisplayService.getDomainArrayLabel(bot.domain!)).toBe(
        'Image & Text',
      );
    });
  });

  describe('Migration Validation', () => {
    it('should not use "BOTH" domain value (removed in refactoring)', () => {
      const multiDomainItem: DisplayItem = {
        name: 'Multi-Domain Item',
        description: 'Supports both domains',
        link: 'https://test.com',
        uniqueId: 'multi-domain',
        categories: ['Test'],
        itemType: ItemType.TOOL,
        domain: [Domain.IMAGE, Domain.TEXT],
        functionKind: FunctionKind.TOOL,
      };

      // Should use array of domains, not a "BOTH" value
      expect(Array.isArray(multiDomainItem.domain)).toBe(true);
      expect(multiDomainItem.domain).not.toContain('both' as any);
    });

    it('should not use "DESKTOP" platform value (removed in refactoring)', () => {
      const desktopItem: DisplayItem = {
        name: 'Desktop App',
        description: 'Desktop application',
        link: 'https://test.com',
        uniqueId: 'desktop-app',
        categories: ['Desktop'],
        itemType: ItemType.GUI_IMAGE,
        platform: [Platform.WINDOWS, Platform.LINUX, Platform.MACOS],
        functionKind: FunctionKind.FRONTEND,
      };

      // Should use specific OS platforms, not a "DESKTOP" value
      expect(Array.isArray(desktopItem.platform)).toBe(true);
      expect(desktopItem.platform).not.toContain('desktop' as any);
      expect(desktopItem.platform).toContain(Platform.WINDOWS);
      expect(desktopItem.platform).toContain(Platform.LINUX);
      expect(desktopItem.platform).toContain(Platform.MACOS);
    });
  });
});
