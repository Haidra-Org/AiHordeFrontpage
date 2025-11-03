import { TestBed } from '@angular/core/testing';
import { EnumDisplayService } from './enum-display.service';
import { ItemType, Domain, Platform, FunctionKind } from '../types/item-types';
import { GuiItem } from '../types/gui-item';
import { ToolItem } from '../types/tool-item';

describe('EnumDisplayService Integration Tests', () => {
  let service: EnumDisplayService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EnumDisplayService);
  });

  // ============================================================================
  // Real-world data pattern tests
  // ============================================================================

  describe('Desktop Platform Grouping', () => {
    it('should identify cross-platform desktop applications (Lucid Creations pattern)', () => {
      const platforms: Platform[] = [
        Platform.WINDOWS,
        Platform.LINUX,
        Platform.MACOS,
        Platform.WEB,
      ];

      // Should recognize desktop platforms within the array
      expect(service.isDesktopPlatform(Platform.WINDOWS)).toBe(true);
      expect(service.isDesktopPlatform(Platform.LINUX)).toBe(true);
      expect(service.isDesktopPlatform(Platform.MACOS)).toBe(true);
      expect(service.isDesktopPlatform(Platform.WEB)).toBe(false);

      // Should return all desktop platforms for grouping
      const desktopPlatforms = service.getDesktopPlatforms();
      expect(desktopPlatforms).toEqual([
        Platform.WINDOWS,
        Platform.LINUX,
        Platform.MACOS,
      ]);
    });

    it('should display "Desktop" label when all three OS platforms are present', () => {
      const allDesktopPlatforms: Platform[] = [
        Platform.WINDOWS,
        Platform.LINUX,
        Platform.MACOS,
      ];

      const label = service.getPlatformGroupedLabel(allDesktopPlatforms);
      expect(label).toBe('Desktop');
    });

    it('should display individual OS labels when not all desktop platforms present', () => {
      const windowsOnly: Platform[] = [Platform.WINDOWS];
      expect(service.getPlatformGroupedLabel(windowsOnly)).toBe('Windows');

      const windowsLinux: Platform[] = [Platform.WINDOWS, Platform.LINUX];
      expect(service.getPlatformGroupedLabel(windowsLinux)).toBe(
        'Windows, Linux',
      );
    });

    it('should handle mixed desktop and non-desktop platforms', () => {
      const mixed: Platform[] = [
        Platform.WINDOWS,
        Platform.LINUX,
        Platform.MACOS,
        Platform.WEB,
      ];

      const label = service.getPlatformGroupedLabel(mixed);
      expect(label).toBe('Desktop, Web');
    });

    it('should preserve order when not grouping desktop platforms', () => {
      const platforms: Platform[] = [
        Platform.WEB,
        Platform.ANDROID,
        Platform.IOS,
      ];

      const label = service.getPlatformGroupedLabel(platforms);
      expect(label).toBe('Web, Android, iOS');
    });
  });

  // ============================================================================
  // Multi-domain support tests
  // ============================================================================

  describe('Domain Array Handling', () => {
    it('should handle items supporting both image and text domains (multi-modal tools)', () => {
      const domains: Domain[] = [Domain.IMAGE, Domain.TEXT];

      const label = service.getDomainArrayLabel(domains);
      expect(label).toBe('Image & Text');
    });

    it('should handle single domain items', () => {
      const imageOnly: Domain[] = [Domain.IMAGE];
      expect(service.getDomainArrayLabel(imageOnly)).toBe('Image');

      const textOnly: Domain[] = [Domain.TEXT];
      expect(service.getDomainArrayLabel(textOnly)).toBe('Text');
    });

    it('should handle empty domain arrays gracefully', () => {
      const emptyDomains: Domain[] = [];
      const label = service.getDomainArrayLabel(emptyDomains);
      expect(label).toBe('N/A');
    });

    it('should use ampersand separator for domain arrays (not comma)', () => {
      const domains: Domain[] = [Domain.IMAGE, Domain.TEXT];
      const label = service.getDomainArrayLabel(domains);

      expect(label).toContain('&');
      expect(label).not.toContain(',');
    });
  });

  // ============================================================================
  // Category badge classification tests
  // ============================================================================

  describe('Category Badge Classification', () => {
    it('should classify worker-related categories correctly', () => {
      expect(service.getCategoryBadgeClass('Worker')).toBe('badge-warning');
      expect(service.getCategoryBadgeClass('worker')).toBe('badge-warning');
    });

    it('should classify platform categories correctly', () => {
      // Desktop platforms
      expect(service.getCategoryBadgeClass('Windows')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('Linux')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('macOS')).toBe('badge-info');

      // Mobile platforms
      expect(service.getCategoryBadgeClass('iOS')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('Android')).toBe('badge-info');

      // Other platforms
      expect(service.getCategoryBadgeClass('Web')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('CLI')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('Server')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('Fediverse')).toBe('badge-info');
    });

    it('should classify domain categories correctly', () => {
      expect(service.getCategoryBadgeClass('Image Generation')).toBe(
        'badge-purple',
      );
      expect(service.getCategoryBadgeClass('Text Generation')).toBe(
        'badge-purple',
      );
    });

    it('should classify function-type categories correctly', () => {
      expect(service.getCategoryBadgeClass('Bot')).toBe('badge-warning');
      expect(service.getCategoryBadgeClass('Plugin')).toBe('badge-warning');
      expect(service.getCategoryBadgeClass('Development')).toBe('badge-indigo');
    });

    it('should use default badge for unrecognized categories', () => {
      expect(service.getCategoryBadgeClass('Unknown Category')).toBe(
        'badge-secondary',
      );
    });

    it('should NOT classify "desktop" as a platform category after refactoring', () => {
      // Verifies that old "desktop" category is no longer recognized
      expect(service.isPlatformCategory('desktop')).toBe(false);
      expect(service.getCategoryBadgeClass('Desktop')).toBe('badge-secondary');
    });
  });

  // ============================================================================
  // Real-world item scenarios
  // ============================================================================

  describe('Real-world Item Scenarios', () => {
    it('should correctly identify a cross-platform GUI (Lucid Creations pattern)', () => {
      const item: Partial<GuiItem> = {
        itemType: ItemType.GUI_IMAGE,
        domain: [Domain.IMAGE],
        platform: [
          Platform.WINDOWS,
          Platform.LINUX,
          Platform.MACOS,
          Platform.WEB,
        ],
        functionKind: FunctionKind.FRONTEND,
        categories: ['Web', 'Desktop'],
      };

      expect(service.getItemTypeLabel(item.itemType!)).toBe('Image GUI');
      expect(service.getDomainArrayLabel(item.domain!)).toBe('Image');
      expect(service.getPlatformGroupedLabel(item.platform!)).toBe(
        'Desktop, Web',
      );
      expect(service.getFunctionTypeLabel(item.functionKind!)).toBe('Frontend');
    });

    it('should correctly identify a server-side worker (horde-worker-reGen pattern)', () => {
      const item: Partial<ToolItem> = {
        itemType: ItemType.TOOL,
        domain: [Domain.IMAGE],
        platform: [Platform.SERVER],
        functionKind: FunctionKind.WORKER,
        categories: ['Worker', 'Image Generation'],
      };

      expect(service.getItemTypeLabel(item.itemType!)).toBe('Tool');
      expect(service.getDomainArrayLabel(item.domain!)).toBe('Image');
      expect(service.getPlatformLabel(Platform.SERVER)).toBe('Server');
      expect(service.getFunctionTypeLabel(item.functionKind!)).toBe('Worker');
      expect(service.getCategoryBadgeClass('Worker')).toBe('badge-warning');
      expect(service.getCategoryBadgeClass('Image Generation')).toBe(
        'badge-purple',
      );
    });

    it('should correctly identify a multi-domain discord bot', () => {
      const item: Partial<ToolItem> = {
        itemType: ItemType.TOOL,
        domain: [Domain.IMAGE, Domain.TEXT],
        platform: [Platform.SERVER],
        functionKind: FunctionKind.BOT,
        categories: ['Bot', 'Image Generation', 'Text Generation'],
      };

      expect(service.getDomainArrayLabel(item.domain!)).toBe('Image & Text');
      expect(service.getFunctionTypeLabel(item.functionKind!)).toBe('Bot');
      expect(service.getCategoryBadgeClass('Bot')).toBe('badge-warning');
    });

    it('should correctly identify a desktop plugin (Godot pattern)', () => {
      const item: Partial<ToolItem> = {
        itemType: ItemType.TOOL,
        domain: [Domain.IMAGE],
        platform: [Platform.WINDOWS, Platform.LINUX, Platform.MACOS],
        functionKind: FunctionKind.PLUGIN,
        categories: ['Plugin', 'Image Generation'],
      };

      expect(service.getPlatformGroupedLabel(item.platform!)).toBe('Desktop');
      expect(service.getFunctionTypeLabel(item.functionKind!)).toBe('Plugin');
      expect(service.getCategoryBadgeClass('Plugin')).toBe('badge-warning');
    });

    it('should correctly identify a web-only GUI (Artbot pattern)', () => {
      const item: Partial<GuiItem> = {
        itemType: ItemType.GUI_IMAGE,
        domain: [Domain.IMAGE],
        platform: [Platform.WEB],
        functionKind: FunctionKind.FRONTEND,
        categories: ['Web'],
      };

      expect(service.getPlatformGroupedLabel(item.platform!)).toBe('Web');
      expect(service.getCategoryBadgeClass('Web')).toBe('badge-info');
    });

    it('should correctly identify a CLI tool', () => {
      const item: Partial<ToolItem> = {
        itemType: ItemType.TOOL,
        platform: [Platform.CLI],
        functionKind: FunctionKind.CLI_TOOL,
      };

      expect(service.getPlatformLabel(Platform.CLI)).toBe('CLI');
      expect(service.getFunctionTypeLabel(FunctionKind.CLI_TOOL)).toBe('CLI');
    });

    it('should correctly identify an SDK (programming tool)', () => {
      const item: Partial<ToolItem> = {
        itemType: ItemType.TOOL,
        platform: [Platform.PROGRAMMING],
        functionKind: FunctionKind.SDK,
        categories: ['Development'],
      };

      expect(service.getPlatformLabel(Platform.PROGRAMMING)).toBe(
        'Programming',
      );
      expect(service.getFunctionTypeLabel(FunctionKind.SDK)).toBe('SDK');
      expect(service.getCategoryBadgeClass('Development')).toBe('badge-indigo');
    });
  });

  // ============================================================================
  // Edge cases and data integrity
  // ============================================================================

  describe('Edge Cases and Data Integrity', () => {
    it('should handle undefined or null platform arrays gracefully', () => {
      const emptyPlatforms: Platform[] = [];
      expect(service.getPlatformGroupedLabel(emptyPlatforms)).toBe('N/A');
    });

    it('should handle single-item arrays without adding extra separators', () => {
      expect(service.getDomainArrayLabel([Domain.IMAGE])).toBe('Image');
      expect(service.getPlatformGroupedLabel([Platform.WEB])).toBe('Web');
    });

    it('should maintain consistent case handling across all enum types', () => {
      // All label methods should return properly formatted strings
      expect(service.getDomainLabel(Domain.IMAGE)).toBe('Image');
      expect(service.getPlatformLabel(Platform.IOS)).toBe('iOS');
      expect(service.getPlatformLabel(Platform.MACOS)).toBe('macOS');
      expect(service.getFunctionTypeLabel(FunctionKind.CLI_TOOL)).toBe('CLI');
    });

    it('should verify no "BOTH" domain exists (removed in refactoring)', () => {
      // This test ensures the Domain enum doesn't have a BOTH value
      const domainValues = Object.values(Domain);
      // Should only have IMAGE and TEXT, not BOTH
      expect(domainValues).toContain(Domain.IMAGE);
      expect(domainValues).toContain(Domain.TEXT);
      expect(domainValues.length).toBe(2);
    });

    it('should verify no "DESKTOP" platform exists (removed in refactoring)', () => {
      // This test ensures the Platform enum doesn't have a DESKTOP value
      const platformValues = Object.values(Platform);
      expect(platformValues).toContain(Platform.WINDOWS);
      expect(platformValues).toContain(Platform.LINUX);
      expect(platformValues).toContain(Platform.MACOS);
      // Verify we have the expected desktop platforms, not a single DESKTOP value
      expect(
        platformValues.filter(
          (p) =>
            p === Platform.WINDOWS ||
            p === Platform.LINUX ||
            p === Platform.MACOS,
        ).length,
      ).toBe(3);
    });

    it('should verify new platforms exist (added in refactoring)', () => {
      const platformValues = Object.values(Platform);
      expect(platformValues).toContain(Platform.FEDIVERSE);
      expect(platformValues).toContain(Platform.SOCIAL);
    });

    it('should verify new function kinds exist (added in refactoring)', () => {
      const functionKindValues = Object.values(FunctionKind);
      expect(functionKindValues).toContain(FunctionKind.INTERFACE);
      expect(functionKindValues).toContain(FunctionKind.UTILITY);
    });
  });

  // ============================================================================
  // Backwards compatibility and migration validation
  // ============================================================================

  describe('Migration Validation', () => {
    it('should handle items that previously used "desktop" category', () => {
      // Old pattern: categories: ["Desktop"]
      // New pattern: platform: ["windows", "linux", "macos"], categories: ["Desktop"]

      // The category "Desktop" should no longer be recognized as a platform
      expect(service.isPlatformCategory('Desktop')).toBe(false);

      // But individual OS platforms should be recognized
      expect(service.isPlatformCategory('Windows')).toBe(true);
      expect(service.isPlatformCategory('Linux')).toBe(true);
      expect(service.isPlatformCategory('macOS')).toBe(true);
    });

    it('should handle multi-domain items that previously used "both"', () => {
      // Old pattern: domain: "both"
      // New pattern: domain: ["image", "text"]

      const multiDomain: Domain[] = [Domain.IMAGE, Domain.TEXT];
      expect(service.getDomainArrayLabel(multiDomain)).toBe('Image & Text');

      // Verify we're using array join logic, not a single "Both" label
      expect(service.getDomainArrayLabel(multiDomain)).not.toBe('Both');
    });

    it('should verify platform grouping produces semantically equivalent output', () => {
      // Old: A desktop app might show "Desktop"
      // New: A cross-platform desktop app shows "Desktop" when all 3 OS platforms present

      const allDesktopPlatforms: Platform[] = [
        Platform.WINDOWS,
        Platform.LINUX,
        Platform.MACOS,
      ];

      expect(service.getPlatformGroupedLabel(allDesktopPlatforms)).toBe(
        'Desktop',
      );

      // But if it's only on some platforms, show the specific ones
      const windowsOnly: Platform[] = [Platform.WINDOWS];
      expect(service.getPlatformGroupedLabel(windowsOnly)).not.toBe('Desktop');
      expect(service.getPlatformGroupedLabel(windowsOnly)).toBe('Windows');
    });
  });

  // ============================================================================
  // Platform-specific label formatting
  // ============================================================================

  describe('Platform Label Formatting', () => {
    it('should use correct capitalization for all platforms', () => {
      expect(service.getPlatformLabel(Platform.IOS)).toBe('iOS');
      expect(service.getPlatformLabel(Platform.MACOS)).toBe('macOS');
      expect(service.getPlatformLabel(Platform.ANDROID)).toBe('Android');
      expect(service.getPlatformLabel(Platform.WEB)).toBe('Web');
      expect(service.getPlatformLabel(Platform.CLI)).toBe('CLI');
      expect(service.getPlatformLabel(Platform.SERVER)).toBe('Server');
      expect(service.getPlatformLabel(Platform.PROGRAMMING)).toBe(
        'Programming',
      );
      expect(service.getPlatformLabel(Platform.SOCIAL)).toBe('Social');
      expect(service.getPlatformLabel(Platform.FEDIVERSE)).toBe('Fediverse');
    });

    it('should format desktop OS labels correctly', () => {
      expect(service.getPlatformLabel(Platform.WINDOWS)).toBe('Windows');
      expect(service.getPlatformLabel(Platform.LINUX)).toBe('Linux');
      expect(service.getPlatformLabel(Platform.MACOS)).toBe('macOS');
    });
  });
});
