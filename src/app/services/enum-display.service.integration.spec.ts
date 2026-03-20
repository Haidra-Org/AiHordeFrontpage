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

  // ==========================================================================
  // Desktop platform grouping
  // ==========================================================================

  describe('Desktop Platform Grouping', () => {
    it('should display "Desktop" label when all three OS platforms are present', () => {
      expect(
        service.getPlatformGroupedLabel([
          Platform.WINDOWS,
          Platform.LINUX,
          Platform.MACOS,
        ]),
      ).toBe('Desktop');
    });

    it('should display individual OS labels when not all desktop platforms present', () => {
      expect(service.getPlatformGroupedLabel([Platform.WINDOWS])).toBe(
        'Windows',
      );
      expect(
        service.getPlatformGroupedLabel([Platform.WINDOWS, Platform.LINUX]),
      ).toBe('Windows, Linux');
    });

    it('should handle mixed desktop and non-desktop platforms', () => {
      expect(
        service.getPlatformGroupedLabel([
          Platform.WINDOWS,
          Platform.LINUX,
          Platform.MACOS,
          Platform.WEB,
        ]),
      ).toBe('Desktop, Web');
    });

    it('should preserve order when not grouping desktop platforms', () => {
      expect(
        service.getPlatformGroupedLabel([
          Platform.WEB,
          Platform.ANDROID,
          Platform.IOS,
        ]),
      ).toBe('Web, Android, iOS');
    });
  });

  // ==========================================================================
  // Multi-domain support
  // ==========================================================================

  describe('Domain Array Handling', () => {
    it('should handle items supporting both image and text domains', () => {
      expect(service.getDomainArrayLabel([Domain.IMAGE, Domain.TEXT])).toBe(
        'Image & Text',
      );
    });

    it('should handle single domain items', () => {
      expect(service.getDomainArrayLabel([Domain.IMAGE])).toBe('Image');
      expect(service.getDomainArrayLabel([Domain.TEXT])).toBe('Text');
    });

    it('should handle empty domain arrays gracefully', () => {
      expect(service.getDomainArrayLabel([])).toBe('N/A');
    });

    it('should use ampersand separator for domain arrays (not comma)', () => {
      const label = service.getDomainArrayLabel([Domain.IMAGE, Domain.TEXT]);
      expect(label).toContain('&');
      expect(label).not.toContain(',');
    });
  });

  // ==========================================================================
  // Category badge classification
  // ==========================================================================

  describe('Category Badge Classification', () => {
    it('should classify platform categories correctly', () => {
      expect(service.getCategoryBadgeClass('Windows')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('iOS')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('Web')).toBe('badge-info');
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

    it('should use default badge for unrecognized categories', () => {
      expect(service.getCategoryBadgeClass('Unknown Category')).toBe(
        'badge-secondary',
      );
    });

    it('should NOT classify "desktop" as a platform category', () => {
      expect(service.isPlatformCategory('desktop')).toBe(false);
      expect(service.getCategoryBadgeClass('Desktop')).toBe('badge-secondary');
    });
  });

  // ==========================================================================
  // Real-world item scenarios
  // ==========================================================================

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
      expect(service.getDomainArrayLabel(item.domain)).toBe('Image');
      expect(service.getPlatformGroupedLabel(item.platform)).toBe(
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
      expect(service.getDomainArrayLabel(item.domain)).toBe('Image');
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

      expect(service.getDomainArrayLabel(item.domain)).toBe('Image & Text');
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

      expect(service.getPlatformGroupedLabel(item.platform)).toBe('Desktop');
      expect(service.getFunctionTypeLabel(item.functionKind!)).toBe('Plugin');
    });

    it('should correctly identify a web-only GUI (Artbot pattern)', () => {
      expect(service.getPlatformGroupedLabel([Platform.WEB])).toBe('Web');
      expect(service.getCategoryBadgeClass('Web')).toBe('badge-info');
    });

    it('should correctly identify a CLI tool', () => {
      expect(service.getPlatformLabel(Platform.CLI)).toBe('CLI');
      expect(service.getFunctionTypeLabel(FunctionKind.CLI_TOOL)).toBe('CLI');
    });

    it('should correctly identify an SDK (programming tool)', () => {
      expect(service.getPlatformLabel(Platform.PROGRAMMING)).toBe(
        'Programming',
      );
      expect(service.getFunctionTypeLabel(FunctionKind.SDK)).toBe('SDK');
      expect(service.getCategoryBadgeClass('Development')).toBe('badge-indigo');
    });
  });

  // ==========================================================================
  // Edge cases and data integrity
  // ==========================================================================

  describe('Edge Cases and Data Integrity', () => {
    it('should handle empty platform arrays gracefully', () => {
      expect(service.getPlatformGroupedLabel([])).toBe('N/A');
    });

    it('should handle single-item arrays without extra separators', () => {
      expect(service.getDomainArrayLabel([Domain.IMAGE])).toBe('Image');
      expect(service.getPlatformGroupedLabel([Platform.WEB])).toBe('Web');
    });

    it('should maintain consistent case handling across all enum types', () => {
      expect(service.getDomainLabel(Domain.IMAGE)).toBe('Image');
      expect(service.getPlatformLabel(Platform.IOS)).toBe('iOS');
      expect(service.getPlatformLabel(Platform.MACOS)).toBe('macOS');
      expect(service.getFunctionTypeLabel(FunctionKind.CLI_TOOL)).toBe('CLI');
    });
  });

  // ==========================================================================
  // Migration validation
  // ==========================================================================

  describe('Migration Validation', () => {
    it('should handle items that previously used "desktop" category', () => {
      expect(service.isPlatformCategory('Desktop')).toBe(false);
      expect(service.isPlatformCategory('Windows')).toBe(true);
      expect(service.isPlatformCategory('Linux')).toBe(true);
      expect(service.isPlatformCategory('macOS')).toBe(true);
    });

    it('should handle multi-domain items that previously used "both"', () => {
      const label = service.getDomainArrayLabel([Domain.IMAGE, Domain.TEXT]);
      expect(label).toBe('Image & Text');
      expect(label).not.toBe('Both');
    });

    it('should verify platform grouping produces semantically equivalent output', () => {
      expect(
        service.getPlatformGroupedLabel([
          Platform.WINDOWS,
          Platform.LINUX,
          Platform.MACOS,
        ]),
      ).toBe('Desktop');
      expect(service.getPlatformGroupedLabel([Platform.WINDOWS])).toBe(
        'Windows',
      );
    });
  });

  // ==========================================================================
  // Platform label formatting
  // ==========================================================================

  describe('Platform Label Formatting', () => {
    it.each([
      [Platform.IOS, 'iOS'],
      [Platform.MACOS, 'macOS'],
      [Platform.ANDROID, 'Android'],
      [Platform.WEB, 'Web'],
      [Platform.CLI, 'CLI'],
      [Platform.SERVER, 'Server'],
      [Platform.PROGRAMMING, 'Programming'],
      [Platform.SOCIAL, 'Social'],
      [Platform.FEDIVERSE, 'Fediverse'],
      [Platform.WINDOWS, 'Windows'],
      [Platform.LINUX, 'Linux'],
    ] as const)('should format %s as "%s"', (input, expected) => {
      expect(service.getPlatformLabel(input)).toBe(expected);
    });
  });
});
