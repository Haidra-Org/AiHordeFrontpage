import { TestBed } from '@angular/core/testing';
import { EnumDisplayService } from './enum-display.service';
import { ItemType, Domain, Platform, FunctionKind } from '../types/item-types';

describe('EnumDisplayService', () => {
  let service: EnumDisplayService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EnumDisplayService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ============================================================================
  // ItemType Tests
  // ============================================================================

  describe('ItemType methods', () => {
    it('should return correct label for GUI_IMAGE', () => {
      expect(service.getItemTypeLabel(ItemType.GUI_IMAGE)).toBe('Image GUI');
    });

    it('should return correct label for GUI_TEXT', () => {
      expect(service.getItemTypeLabel(ItemType.GUI_TEXT)).toBe('Text GUI');
    });

    it('should return correct label for TOOL', () => {
      expect(service.getItemTypeLabel(ItemType.TOOL)).toBe('Tool');
    });

    it('should return capitalized fallback for unknown item type', () => {
      expect(service.getItemTypeLabel('unknown-type')).toBe('Unknown-type');
    });

    it('should return correct translation key for GUI_IMAGE', () => {
      expect(service.getItemTypeTranslationKey(ItemType.GUI_IMAGE)).toBe(
        'guis.image',
      );
    });

    it('should return correct translation key for GUI_TEXT', () => {
      expect(service.getItemTypeTranslationKey(ItemType.GUI_TEXT)).toBe(
        'guis.text',
      );
    });

    it('should return correct translation key for TOOL', () => {
      expect(service.getItemTypeTranslationKey(ItemType.TOOL)).toBe(
        'tools.tool',
      );
    });

    it('should return undefined translation key for unknown item type', () => {
      expect(service.getItemTypeTranslationKey('unknown')).toBeUndefined();
    });

    it('should return correct badge class for GUI_IMAGE', () => {
      expect(service.getItemTypeBadgeClass(ItemType.GUI_IMAGE)).toBe(
        'badge-primary',
      );
    });

    it('should return correct badge class for TOOL', () => {
      expect(service.getItemTypeBadgeClass(ItemType.TOOL)).toBe(
        'badge-warning',
      );
    });

    it('should return fallback badge class for unknown item type', () => {
      expect(service.getItemTypeBadgeClass('unknown')).toBe('badge-secondary');
    });
  });

  // ============================================================================
  // Domain Tests
  // ============================================================================

  describe('Domain methods', () => {
    it('should return correct label for TEXT domain', () => {
      expect(service.getDomainLabel(Domain.TEXT)).toBe('Text');
    });

    it('should return correct label for IMAGE domain', () => {
      expect(service.getDomainLabel(Domain.IMAGE)).toBe('Image');
    });

    it('should return capitalized fallback for unknown domain', () => {
      expect(service.getDomainLabel('other')).toBe('Other');
    });

    it('should return joined label for domain arrays', () => {
      expect(service.getDomainArrayLabel([Domain.IMAGE, Domain.TEXT])).toBe(
        'Image & Text',
      );
    });

    it('should return single label for one-element domain array', () => {
      expect(service.getDomainArrayLabel([Domain.IMAGE])).toBe('Image');
    });

    it('should return N/A for empty domain array', () => {
      expect(service.getDomainArrayLabel([])).toBe('N/A');
    });

    it('should return N/A for undefined domain array', () => {
      expect(service.getDomainArrayLabel(undefined)).toBe('N/A');
    });

    it('should return correct badge class for TEXT domain', () => {
      expect(service.getDomainBadgeClass(Domain.TEXT)).toBe('badge-purple');
    });

    it('should return correct badge class for IMAGE domain', () => {
      expect(service.getDomainBadgeClass(Domain.IMAGE)).toBe('badge-purple');
    });

    it('should return fallback badge class for unknown domain', () => {
      expect(service.getDomainBadgeClass('unknown')).toBe('badge-secondary');
    });
  });

  // ============================================================================
  // Platform Tests
  // ============================================================================

  describe('Platform methods', () => {
    it('should return correct label for WEB platform', () => {
      expect(service.getPlatformLabel(Platform.WEB)).toBe('Web');
    });

    it('should return correct label for WINDOWS platform', () => {
      expect(service.getPlatformLabel(Platform.WINDOWS)).toBe('Windows');
    });

    it('should return correct label for LINUX platform', () => {
      expect(service.getPlatformLabel(Platform.LINUX)).toBe('Linux');
    });

    it('should return correct label for MACOS platform', () => {
      expect(service.getPlatformLabel(Platform.MACOS)).toBe('macOS');
    });

    it('should return correct label for IOS platform', () => {
      expect(service.getPlatformLabel(Platform.IOS)).toBe('iOS');
    });

    it('should return correct label for ANDROID platform', () => {
      expect(service.getPlatformLabel(Platform.ANDROID)).toBe('Android');
    });

    it('should return correct label for FEDIVERSE platform', () => {
      expect(service.getPlatformLabel(Platform.FEDIVERSE)).toBe('Fediverse');
    });

    it('should return capitalized fallback for unknown platform', () => {
      expect(service.getPlatformLabel('unknown')).toBe('Unknown');
    });

    it('should return correct badge class for platforms', () => {
      expect(service.getPlatformBadgeClass(Platform.WEB)).toBe('badge-info');
      expect(service.getPlatformBadgeClass(Platform.WINDOWS)).toBe(
        'badge-info',
      );
      expect(service.getPlatformBadgeClass(Platform.LINUX)).toBe('badge-info');
    });

    it('should return fallback badge class for unknown platform', () => {
      expect(service.getPlatformBadgeClass('unknown')).toBe('badge-secondary');
    });

    it('should convert array of platforms to display labels', () => {
      const platforms = ['web', 'desktop', 'ios'];
      const result = service.getPlatformDisplayArray(platforms);
      expect(result).toEqual(['Web', 'Desktop', 'iOS']);
    });

    it('should handle empty platform array', () => {
      expect(service.getPlatformDisplayArray([])).toEqual([]);
    });

    it('should return desktop platforms list', () => {
      const desktopPlatforms = service.getDesktopPlatforms();
      expect(desktopPlatforms).toEqual([
        Platform.WINDOWS,
        Platform.LINUX,
        Platform.MACOS,
      ]);
    });

    it('should identify desktop platforms', () => {
      expect(service.isDesktopPlatform(Platform.WINDOWS)).toBe(true);
      expect(service.isDesktopPlatform(Platform.LINUX)).toBe(true);
      expect(service.isDesktopPlatform(Platform.MACOS)).toBe(true);
      expect(service.isDesktopPlatform(Platform.WEB)).toBe(false);
      expect(service.isDesktopPlatform(Platform.IOS)).toBe(false);
    });

    it('should group all desktop platforms as "Desktop"', () => {
      const platforms = [Platform.WINDOWS, Platform.LINUX, Platform.MACOS];
      expect(service.getPlatformGroupedLabel(platforms)).toBe('Desktop');
    });

    it('should show individual desktop platforms when not all present', () => {
      const platforms = [Platform.WINDOWS, Platform.LINUX];
      expect(service.getPlatformGroupedLabel(platforms)).toBe('Windows, Linux');
    });

    it('should combine desktop group with other platforms', () => {
      const platforms = [
        Platform.WINDOWS,
        Platform.LINUX,
        Platform.MACOS,
        Platform.WEB,
      ];
      expect(service.getPlatformGroupedLabel(platforms)).toBe('Desktop, Web');
    });

    it('should handle undefined platform array', () => {
      expect(service.getPlatformGroupedLabel(undefined)).toBe('N/A');
    });

    it('should handle empty platform array', () => {
      expect(service.getPlatformGroupedLabel([])).toBe('N/A');
    });
  });

  // ============================================================================
  // FunctionType Tests
  // ============================================================================

  describe('FunctionType methods', () => {
    it('should return correct label for FRONTEND', () => {
      expect(service.getFunctionTypeLabel(FunctionKind.FRONTEND)).toBe(
        'Frontend',
      );
    });

    it('should return correct label for WORKER', () => {
      expect(service.getFunctionTypeLabel(FunctionKind.WORKER)).toBe('Worker');
    });

    it('should return correct label for BOT', () => {
      expect(service.getFunctionTypeLabel(FunctionKind.BOT)).toBe('Bot');
    });

    it('should return correct label for PLUGIN', () => {
      expect(service.getFunctionTypeLabel(FunctionKind.PLUGIN)).toBe('Plugin');
    });

    it('should return correct label for SDK', () => {
      expect(service.getFunctionTypeLabel(FunctionKind.SDK)).toBe('SDK');
    });

    it('should return correct label for CLI_TOOL', () => {
      expect(service.getFunctionTypeLabel(FunctionKind.CLI_TOOL)).toBe('CLI');
    });

    it('should return correct label for INTERFACE', () => {
      expect(service.getFunctionTypeLabel(FunctionKind.INTERFACE)).toBe(
        'Interface',
      );
    });

    it('should return correct label for UTILITY', () => {
      expect(service.getFunctionTypeLabel(FunctionKind.UTILITY)).toBe(
        'Utility',
      );
    });

    it('should return capitalized fallback for unknown function type', () => {
      expect(service.getFunctionTypeLabel('custom-function')).toBe(
        'Custom-function',
      );
    });

    it('should return correct badge class for function types', () => {
      expect(service.getFunctionTypeBadgeClass(FunctionKind.WORKER)).toBe(
        'badge-warning',
      );
      expect(service.getFunctionTypeBadgeClass(FunctionKind.BOT)).toBe(
        'badge-warning',
      );
    });

    it('should return fallback badge class for unknown function type', () => {
      expect(service.getFunctionTypeBadgeClass('unknown')).toBe(
        'badge-secondary',
      );
    });
  });

  // ============================================================================
  // Category Badge Tests
  // ============================================================================

  describe('getCategoryBadgeClass', () => {
    it('should return badge-info for platform categories', () => {
      expect(service.getCategoryBadgeClass('windows')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('linux')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('macos')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('iOS')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('Android')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('Web')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('CLI')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('Server')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('fediverse')).toBe('badge-info');
    });

    it('should return badge-purple for domain categories', () => {
      expect(service.getCategoryBadgeClass('image generation')).toBe(
        'badge-purple',
      );
      expect(service.getCategoryBadgeClass('text generation')).toBe(
        'badge-purple',
      );
      expect(service.getCategoryBadgeClass('Image')).toBe('badge-purple');
      expect(service.getCategoryBadgeClass('Text')).toBe('badge-purple');
    });

    it('should return badge-warning for tool type categories', () => {
      expect(service.getCategoryBadgeClass('worker')).toBe('badge-warning');
      expect(service.getCategoryBadgeClass('Bot')).toBe('badge-warning');
      expect(service.getCategoryBadgeClass('Plugin')).toBe('badge-warning');
      expect(service.getCategoryBadgeClass('SDK')).toBe('badge-warning');
      expect(service.getCategoryBadgeClass('Frontend')).toBe('badge-warning');
    });

    it('should return badge-teal for community categories', () => {
      expect(service.getCategoryBadgeClass('official tools')).toBe(
        'badge-teal',
      );
      expect(service.getCategoryBadgeClass('community bots')).toBe(
        'badge-teal',
      );
      expect(service.getCategoryBadgeClass('community plugins')).toBe(
        'badge-teal',
      );
      expect(service.getCategoryBadgeClass('community sdks')).toBe(
        'badge-teal',
      );
    });

    it('should return badge-indigo for development categories', () => {
      expect(service.getCategoryBadgeClass('development')).toBe('badge-indigo');
      expect(service.getCategoryBadgeClass('accessibility')).toBe(
        'badge-indigo',
      );
    });

    it('should return badge-secondary for unknown categories', () => {
      expect(service.getCategoryBadgeClass('random-category')).toBe(
        'badge-secondary',
      );
    });

    it('should be case-insensitive', () => {
      expect(service.getCategoryBadgeClass('WINDOWS')).toBe('badge-info');
      expect(service.getCategoryBadgeClass('Worker')).toBe('badge-warning');
    });
  });

  // ============================================================================
  // Utility Methods Tests
  // ============================================================================

  describe('Utility methods', () => {
    describe('capitalizeFirst', () => {
      it('should capitalize first letter', () => {
        expect(service.capitalizeFirst('hello')).toBe('Hello');
      });

      it('should handle already capitalized strings', () => {
        expect(service.capitalizeFirst('Hello')).toBe('Hello');
      });

      it('should handle empty string', () => {
        expect(service.capitalizeFirst('')).toBe('');
      });

      it('should handle single character', () => {
        expect(service.capitalizeFirst('a')).toBe('A');
      });

      it('should preserve rest of string', () => {
        expect(service.capitalizeFirst('hello world')).toBe('Hello world');
      });
    });

    describe('isPlatformCategory', () => {
      it('should return true for platform keywords', () => {
        expect(service.isPlatformCategory('windows')).toBe(true);
        expect(service.isPlatformCategory('linux')).toBe(true);
        expect(service.isPlatformCategory('macos')).toBe(true);
        expect(service.isPlatformCategory('iOS')).toBe(true);
        expect(service.isPlatformCategory('Android')).toBe(true);
        expect(service.isPlatformCategory('Web')).toBe(true);
        expect(service.isPlatformCategory('cli')).toBe(true);
        expect(service.isPlatformCategory('server')).toBe(true);
        expect(service.isPlatformCategory('programming')).toBe(true);
        expect(service.isPlatformCategory('fediverse')).toBe(true);
      });

      it('should return false for non-platform categories', () => {
        expect(service.isPlatformCategory('worker')).toBe(false);
        expect(service.isPlatformCategory('text generation')).toBe(false);
        expect(service.isPlatformCategory('desktop')).toBe(false);
      });

      it('should be case-insensitive', () => {
        expect(service.isPlatformCategory('WINDOWS')).toBe(true);
        expect(service.isPlatformCategory('Windows')).toBe(true);
      });
    });

    describe('isDomainCategory', () => {
      it('should return true for domain keywords', () => {
        expect(service.isDomainCategory('image generation')).toBe(true);
        expect(service.isDomainCategory('text generation')).toBe(true);
        expect(service.isDomainCategory('image')).toBe(true);
        expect(service.isDomainCategory('text')).toBe(true);
      });

      it('should return false for non-domain categories', () => {
        expect(service.isDomainCategory('desktop')).toBe(false);
        expect(service.isDomainCategory('worker')).toBe(false);
      });

      it('should be case-insensitive', () => {
        expect(service.isDomainCategory('IMAGE GENERATION')).toBe(true);
        expect(service.isDomainCategory('Text Generation')).toBe(true);
      });
    });
  });
});
