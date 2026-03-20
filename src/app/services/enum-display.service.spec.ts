import { TestBed } from '@angular/core/testing';
import { EnumDisplayService } from './enum-display.service';
import { ItemType, Domain, Platform, FunctionKind } from '../types/item-types';

describe('EnumDisplayService', () => {
  let service: EnumDisplayService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EnumDisplayService);
  });

  // ==========================================================================
  // ItemType methods
  // ==========================================================================

  describe('ItemType methods', () => {
    describe('getItemTypeLabel', () => {
      it.each([
        [ItemType.GUI_IMAGE, 'Image GUI'],
        [ItemType.GUI_TEXT, 'Text GUI'],
        [ItemType.TOOL, 'Tool'],
      ] as const)('should return "%s" for %s', (input, expected) => {
        expect(service.getItemTypeLabel(input)).toBe(expected);
      });

      it('should return capitalized fallback for unknown item type', () => {
        expect(service.getItemTypeLabel('unknown-type')).toBe('Unknown-type');
      });
    });

    describe('getItemTypeTranslationKey', () => {
      it.each([
        [ItemType.GUI_IMAGE, 'guis.image'],
        [ItemType.GUI_TEXT, 'guis.text'],
        [ItemType.TOOL, 'tools.tool'],
      ] as const)('should return "%s" for %s', (input, expected) => {
        expect(service.getItemTypeTranslationKey(input)).toBe(expected);
      });

      it('should return undefined for unknown item type', () => {
        expect(service.getItemTypeTranslationKey('unknown')).toBeUndefined();
      });
    });

    describe('getItemTypeBadgeClass', () => {
      it.each([
        [ItemType.GUI_IMAGE, 'badge-primary'],
        [ItemType.TOOL, 'badge-warning'],
      ] as const)('should return "%s" for %s', (input, expected) => {
        expect(service.getItemTypeBadgeClass(input)).toBe(expected);
      });

      it('should return fallback badge class for unknown item type', () => {
        expect(service.getItemTypeBadgeClass('unknown')).toBe(
          'badge-secondary',
        );
      });
    });
  });

  // ==========================================================================
  // Domain methods
  // ==========================================================================

  describe('Domain methods', () => {
    describe('getDomainLabel', () => {
      it.each([
        [Domain.TEXT, 'Text'],
        [Domain.IMAGE, 'Image'],
      ] as const)('should return "%s" for %s', (input, expected) => {
        expect(service.getDomainLabel(input)).toBe(expected);
      });

      it('should return capitalized fallback for unknown domain', () => {
        expect(service.getDomainLabel('other')).toBe('Other');
      });
    });

    describe('getDomainArrayLabel', () => {
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
    });

    describe('getDomainBadgeClass', () => {
      it.each([
        [Domain.TEXT, 'badge-purple'],
        [Domain.IMAGE, 'badge-purple'],
      ] as const)('should return "%s" for %s', (input, expected) => {
        expect(service.getDomainBadgeClass(input)).toBe(expected);
      });

      it('should return fallback badge class for unknown domain', () => {
        expect(service.getDomainBadgeClass('unknown')).toBe('badge-secondary');
      });
    });
  });

  // ==========================================================================
  // Platform methods
  // ==========================================================================

  describe('Platform methods', () => {
    describe('getPlatformLabel', () => {
      it.each([
        [Platform.WEB, 'Web'],
        [Platform.WINDOWS, 'Windows'],
        [Platform.LINUX, 'Linux'],
        [Platform.MACOS, 'macOS'],
        [Platform.IOS, 'iOS'],
        [Platform.ANDROID, 'Android'],
        [Platform.FEDIVERSE, 'Fediverse'],
      ] as const)('should return "%s" for %s', (input, expected) => {
        expect(service.getPlatformLabel(input)).toBe(expected);
      });

      it('should return capitalized fallback for unknown platform', () => {
        expect(service.getPlatformLabel('unknown')).toBe('Unknown');
      });
    });

    describe('getPlatformBadgeClass', () => {
      it.each([
        [Platform.WEB, 'badge-info'],
        [Platform.WINDOWS, 'badge-info'],
        [Platform.LINUX, 'badge-info'],
      ] as const)('should return "%s" for %s', (input, expected) => {
        expect(service.getPlatformBadgeClass(input)).toBe(expected);
      });

      it('should return fallback badge class for unknown platform', () => {
        expect(service.getPlatformBadgeClass('unknown')).toBe(
          'badge-secondary',
        );
      });
    });

    describe('getPlatformDisplayArray', () => {
      it('should convert array of platforms to display labels', () => {
        expect(
          service.getPlatformDisplayArray(['web', 'desktop', 'ios']),
        ).toEqual(['Web', 'Desktop', 'iOS']);
      });

      it('should handle empty platform array', () => {
        expect(service.getPlatformDisplayArray([])).toEqual([]);
      });
    });

    describe('getDesktopPlatforms', () => {
      it('should return desktop platforms list', () => {
        expect(service.getDesktopPlatforms()).toEqual([
          Platform.WINDOWS,
          Platform.LINUX,
          Platform.MACOS,
        ]);
      });
    });

    describe('isDesktopPlatform', () => {
      it.each([
        [Platform.WINDOWS, true],
        [Platform.LINUX, true],
        [Platform.MACOS, true],
        [Platform.WEB, false],
        [Platform.IOS, false],
      ] as const)('should return %s for %s', (input, expected) => {
        expect(service.isDesktopPlatform(input)).toBe(expected);
      });
    });

    describe('getPlatformGroupedLabel', () => {
      it('should group all desktop platforms as "Desktop"', () => {
        expect(
          service.getPlatformGroupedLabel([
            Platform.WINDOWS,
            Platform.LINUX,
            Platform.MACOS,
          ]),
        ).toBe('Desktop');
      });

      it('should show individual desktop platforms when not all present', () => {
        expect(
          service.getPlatformGroupedLabel([Platform.WINDOWS, Platform.LINUX]),
        ).toBe('Windows, Linux');
      });

      it('should combine desktop group with other platforms', () => {
        expect(
          service.getPlatformGroupedLabel([
            Platform.WINDOWS,
            Platform.LINUX,
            Platform.MACOS,
            Platform.WEB,
          ]),
        ).toBe('Desktop, Web');
      });

      it('should handle undefined platform array', () => {
        expect(service.getPlatformGroupedLabel(undefined)).toBe('N/A');
      });

      it('should handle empty platform array', () => {
        expect(service.getPlatformGroupedLabel([])).toBe('N/A');
      });
    });
  });

  // ==========================================================================
  // FunctionType methods
  // ==========================================================================

  describe('FunctionType methods', () => {
    describe('getFunctionTypeLabel', () => {
      it.each([
        [FunctionKind.FRONTEND, 'Frontend'],
        [FunctionKind.WORKER, 'Worker'],
        [FunctionKind.BOT, 'Bot'],
        [FunctionKind.PLUGIN, 'Plugin'],
        [FunctionKind.SDK, 'SDK'],
        [FunctionKind.CLI_TOOL, 'CLI'],
        [FunctionKind.INTERFACE, 'Interface'],
        [FunctionKind.UTILITY, 'Utility'],
      ] as const)('should return "%s" for %s', (input, expected) => {
        expect(service.getFunctionTypeLabel(input)).toBe(expected);
      });

      it('should return capitalized fallback for unknown function type', () => {
        expect(service.getFunctionTypeLabel('custom-function')).toBe(
          'Custom-function',
        );
      });
    });

    describe('getFunctionTypeBadgeClass', () => {
      it.each([
        [FunctionKind.WORKER, 'badge-warning'],
        [FunctionKind.BOT, 'badge-warning'],
      ] as const)('should return "%s" for %s', (input, expected) => {
        expect(service.getFunctionTypeBadgeClass(input)).toBe(expected);
      });

      it('should return fallback badge class for unknown function type', () => {
        expect(service.getFunctionTypeBadgeClass('unknown')).toBe(
          'badge-secondary',
        );
      });
    });
  });

  // ==========================================================================
  // Category badge classification
  // ==========================================================================

  describe('getCategoryBadgeClass', () => {
    it.each([
      ['windows', 'badge-info'],
      ['linux', 'badge-info'],
      ['macos', 'badge-info'],
      ['iOS', 'badge-info'],
      ['Android', 'badge-info'],
      ['Web', 'badge-info'],
      ['CLI', 'badge-info'],
      ['Server', 'badge-info'],
      ['fediverse', 'badge-info'],
    ] as const)(
      'should return badge-info for platform category "%s"',
      (input, expected) => {
        expect(service.getCategoryBadgeClass(input)).toBe(expected);
      },
    );

    it.each([
      ['image generation', 'badge-purple'],
      ['text generation', 'badge-purple'],
      ['Image', 'badge-purple'],
      ['Text', 'badge-purple'],
    ] as const)(
      'should return badge-purple for domain category "%s"',
      (input, expected) => {
        expect(service.getCategoryBadgeClass(input)).toBe(expected);
      },
    );

    it.each([
      ['worker', 'badge-warning'],
      ['Bot', 'badge-warning'],
      ['Plugin', 'badge-warning'],
      ['SDK', 'badge-warning'],
      ['Frontend', 'badge-warning'],
    ] as const)(
      'should return badge-warning for tool type category "%s"',
      (input, expected) => {
        expect(service.getCategoryBadgeClass(input)).toBe(expected);
      },
    );

    it.each([
      ['official tools', 'badge-teal'],
      ['community bots', 'badge-teal'],
      ['community plugins', 'badge-teal'],
      ['community sdks', 'badge-teal'],
    ] as const)(
      'should return badge-teal for community category "%s"',
      (input, expected) => {
        expect(service.getCategoryBadgeClass(input)).toBe(expected);
      },
    );

    it.each([
      ['development', 'badge-indigo'],
      ['accessibility', 'badge-indigo'],
    ] as const)(
      'should return badge-indigo for dev category "%s"',
      (input, expected) => {
        expect(service.getCategoryBadgeClass(input)).toBe(expected);
      },
    );

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

  // ==========================================================================
  // Utility methods
  // ==========================================================================

  describe('Utility methods', () => {
    describe('capitalizeFirst', () => {
      it.each([
        ['hello', 'Hello'],
        ['Hello', 'Hello'],
        ['', ''],
        ['a', 'A'],
        ['hello world', 'Hello world'],
      ] as const)('should capitalize "%s" → "%s"', (input, expected) => {
        expect(service.capitalizeFirst(input)).toBe(expected);
      });
    });

    describe('isPlatformCategory', () => {
      it.each([
        ['windows', true],
        ['linux', true],
        ['macos', true],
        ['iOS', true],
        ['Android', true],
        ['Web', true],
        ['cli', true],
        ['server', true],
        ['programming', true],
        ['fediverse', true],
        ['worker', false],
        ['text generation', false],
        ['desktop', false],
      ] as const)('should return %s for "%s"', (input, expected) => {
        expect(service.isPlatformCategory(input)).toBe(expected);
      });

      it('should be case-insensitive', () => {
        expect(service.isPlatformCategory('WINDOWS')).toBe(true);
        expect(service.isPlatformCategory('Windows')).toBe(true);
      });
    });

    describe('isDomainCategory', () => {
      it.each([
        ['image generation', true],
        ['text generation', true],
        ['image', true],
        ['text', true],
        ['desktop', false],
        ['worker', false],
      ] as const)('should return %s for "%s"', (input, expected) => {
        expect(service.isDomainCategory(input)).toBe(expected);
      });

      it('should be case-insensitive', () => {
        expect(service.isDomainCategory('IMAGE GENERATION')).toBe(true);
        expect(service.isDomainCategory('Text Generation')).toBe(true);
      });
    });
  });

  // ==========================================================================
  // Platform display service integration (absorbed from item-list-section spec)
  // ==========================================================================

  describe('Platform display integration', () => {
    it('should group desktop platforms when all three OS platforms present', () => {
      expect(
        service.getPlatformGroupedLabel([
          Platform.WINDOWS,
          Platform.LINUX,
          Platform.MACOS,
        ]),
      ).toBe('Desktop');
    });

    it('should display individual platforms when not all desktop OSes present', () => {
      expect(
        service.getPlatformGroupedLabel([Platform.WINDOWS, Platform.LINUX]),
      ).toBe('Windows, Linux');
    });

    it('should mix desktop grouping with other platforms', () => {
      expect(
        service.getPlatformGroupedLabel([
          Platform.WINDOWS,
          Platform.LINUX,
          Platform.MACOS,
          Platform.WEB,
        ]),
      ).toBe('Desktop, Web');
    });
  });

  describe('Domain display integration', () => {
    it('should join multiple domains with ampersand', () => {
      expect(service.getDomainArrayLabel([Domain.IMAGE, Domain.TEXT])).toBe(
        'Image & Text',
      );
    });

    it('should display single domain without separator', () => {
      expect(service.getDomainArrayLabel([Domain.IMAGE])).toBe('Image');
    });
  });
});
