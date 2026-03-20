import { TestBed } from '@angular/core/testing';
import { EnumDisplayPipe } from './enum-display.pipe';
import { EnumDisplayService } from '../services/enum-display.service';
import { ItemType, Domain, Platform, FunctionKind } from '../types/item-types';

describe('EnumDisplayPipe', () => {
  let pipe: EnumDisplayPipe;
  let service: EnumDisplayService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EnumDisplayService],
    });
    service = TestBed.inject(EnumDisplayService);
    pipe = TestBed.runInInjectionContext(() => new EnumDisplayPipe());
  });

  // ==========================================================================
  // ItemType — golden-file regression guards
  // ==========================================================================

  describe('ItemType transformations', () => {
    it.each([
      [ItemType.GUI_IMAGE, 'label', 'Image GUI'],
      [ItemType.GUI_TEXT, 'label', 'Text GUI'],
      [ItemType.TOOL, 'label', 'Tool'],
    ] as const)(
      'should return "%s" label → "%s"',
      (value, displayType, expected) => {
        expect(pipe.transform(value, 'itemType', displayType)).toBe(expected);
      },
    );

    it.each([
      [ItemType.GUI_IMAGE, 'badge', 'badge-primary'],
      [ItemType.TOOL, 'badge', 'badge-warning'],
    ] as const)(
      'should return "%s" badge → "%s"',
      (value, displayType, expected) => {
        expect(pipe.transform(value, 'itemType', displayType)).toBe(expected);
      },
    );

    it.each([
      [ItemType.GUI_IMAGE, 'guis.image'],
      [ItemType.GUI_TEXT, 'guis.text'],
      [ItemType.TOOL, 'tools.tool'],
    ] as const)(
      'should return translation key "%s" for %s',
      (value, expected) => {
        expect(pipe.transform(value, 'itemType', 'translation')).toBe(expected);
      },
    );

    it('should default to label when displayType not specified', () => {
      expect(pipe.transform(ItemType.GUI_IMAGE, 'itemType')).toBe('Image GUI');
    });

    it('should handle unknown itemType values', () => {
      expect(pipe.transform('unknown-type', 'itemType', 'label')).toBe(
        'Unknown-type',
      );
      expect(pipe.transform('unknown-type', 'itemType', 'badge')).toBe(
        'badge-secondary',
      );
    });
  });

  // ==========================================================================
  // Domain — golden-file regression guards
  // ==========================================================================

  describe('Domain transformations', () => {
    it.each([
      [Domain.TEXT, 'label', 'Text'],
      [Domain.IMAGE, 'label', 'Image'],
      [Domain.TEXT, 'badge', 'badge-purple'],
      [Domain.IMAGE, 'badge', 'badge-purple'],
    ] as const)(
      'should return %s %s → "%s"',
      (value, displayType, expected) => {
        expect(pipe.transform(value, 'domain', displayType)).toBe(expected);
      },
    );

    it('should return undefined for domain translation (not supported)', () => {
      expect(
        pipe.transform(Domain.TEXT, 'domain', 'translation'),
      ).toBeUndefined();
    });

    it('should handle unknown domain values', () => {
      expect(pipe.transform('other', 'domain', 'label')).toBe('Other');
      expect(pipe.transform('other', 'domain', 'badge')).toBe(
        'badge-secondary',
      );
    });
  });

  // ==========================================================================
  // Platform — golden-file regression guards
  // ==========================================================================

  describe('Platform transformations', () => {
    it.each([
      [Platform.WEB, 'Web'],
      [Platform.WINDOWS, 'Windows'],
      [Platform.LINUX, 'Linux'],
      [Platform.MACOS, 'macOS'],
      [Platform.IOS, 'iOS'],
      [Platform.ANDROID, 'Android'],
      [Platform.FEDIVERSE, 'Fediverse'],
    ] as const)(
      'should return label "%s" for platform %s',
      (value, expected) => {
        expect(pipe.transform(value, 'platform', 'label')).toBe(expected);
      },
    );

    it.each([
      [Platform.WEB, 'badge-info'],
      [Platform.WINDOWS, 'badge-info'],
    ] as const)(
      'should return badge "%s" for platform %s',
      (value, expected) => {
        expect(pipe.transform(value, 'platform', 'badge')).toBe(expected);
      },
    );

    it('should return undefined for platform translation (not supported)', () => {
      expect(
        pipe.transform(Platform.WEB, 'platform', 'translation'),
      ).toBeUndefined();
    });

    it('should handle unknown platform values', () => {
      expect(pipe.transform('unknown', 'platform', 'label')).toBe('Unknown');
      expect(pipe.transform('unknown', 'platform', 'badge')).toBe(
        'badge-secondary',
      );
    });
  });

  // ==========================================================================
  // FunctionType — golden-file regression guards
  // ==========================================================================

  describe('FunctionType transformations', () => {
    it.each([
      [FunctionKind.FRONTEND, 'Frontend'],
      [FunctionKind.WORKER, 'Worker'],
      [FunctionKind.BOT, 'Bot'],
      [FunctionKind.PLUGIN, 'Plugin'],
      [FunctionKind.SDK, 'SDK'],
      [FunctionKind.CLI_TOOL, 'CLI'],
    ] as const)(
      'should return label "%s" for functionType %s',
      (value, expected) => {
        expect(pipe.transform(value, 'functionType', 'label')).toBe(expected);
      },
    );

    it.each([
      [FunctionKind.WORKER, 'badge-warning'],
      [FunctionKind.BOT, 'badge-warning'],
    ] as const)(
      'should return badge "%s" for functionType %s',
      (value, expected) => {
        expect(pipe.transform(value, 'functionType', 'badge')).toBe(expected);
      },
    );

    it('should return undefined for functionType translation (not supported)', () => {
      expect(
        pipe.transform(FunctionKind.FRONTEND, 'functionType', 'translation'),
      ).toBeUndefined();
    });

    it('should handle unknown functionType values', () => {
      expect(pipe.transform('custom', 'functionType', 'label')).toBe('Custom');
      expect(pipe.transform('custom', 'functionType', 'badge')).toBe(
        'badge-secondary',
      );
    });
  });

  // ==========================================================================
  // Category — golden-file regression guards
  // ==========================================================================

  describe('Category transformations', () => {
    it.each([
      ['worker', 'label', 'Worker'],
      ['development', 'label', 'Development'],
      ['windows', 'badge', 'badge-info'],
      ['worker', 'badge', 'badge-warning'],
      ['image generation', 'badge', 'badge-purple'],
      ['official tools', 'badge', 'badge-teal'],
      ['development', 'badge', 'badge-indigo'],
      ['unknown', 'badge', 'badge-secondary'],
    ] as const)(
      'should return %s %s → "%s"',
      (value, displayType, expected) => {
        expect(pipe.transform(value, 'category', displayType)).toBe(expected);
      },
    );

    it('should return undefined for category translation (not supported)', () => {
      expect(
        pipe.transform('worker', 'category', 'translation'),
      ).toBeUndefined();
    });

    it('should default to category when enumCategory not specified', () => {
      expect(pipe.transform('worker')).toBe('Worker');
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge cases', () => {
    it('should return empty string for null value', () => {
      expect(
        pipe.transform(null as unknown as string, 'category', 'label'),
      ).toBe('');
    });

    it('should return empty string for undefined value', () => {
      expect(
        pipe.transform(undefined as unknown as string, 'category', 'label'),
      ).toBe('');
    });

    it('should return empty string for empty string value', () => {
      expect(pipe.transform('', 'category', 'label')).toBe('');
    });

    it('should handle numeric enum values', () => {
      expect(pipe.transform('123', 'category', 'label')).toBe('123');
    });
  });

  // ==========================================================================
  // Integration — service delegation
  // ==========================================================================

  describe('Integration with EnumDisplayService', () => {
    it('should use service for itemType labels', () => {
      vi.spyOn(service, 'getItemTypeLabel').mockReturnValue('Mocked Label');
      pipe.transform(ItemType.GUI_IMAGE, 'itemType', 'label');
      expect(service.getItemTypeLabel).toHaveBeenCalledWith(ItemType.GUI_IMAGE);
    });

    it('should use service for domain badge classes', () => {
      vi.spyOn(service, 'getDomainBadgeClass').mockReturnValue('mocked-class');
      pipe.transform(Domain.TEXT, 'domain', 'badge');
      expect(service.getDomainBadgeClass).toHaveBeenCalledWith(Domain.TEXT);
    });

    it('should use service for platform labels', () => {
      vi.spyOn(service, 'getPlatformLabel').mockReturnValue('Mocked Platform');
      pipe.transform(Platform.WEB, 'platform', 'label');
      expect(service.getPlatformLabel).toHaveBeenCalledWith(Platform.WEB);
    });

    it('should use service for functionType labels', () => {
      vi.spyOn(service, 'getFunctionTypeLabel').mockReturnValue(
        'Mocked Function',
      );
      pipe.transform(FunctionKind.WORKER, 'functionType', 'label');
      expect(service.getFunctionTypeLabel).toHaveBeenCalledWith(
        FunctionKind.WORKER,
      );
    });

    it('should use service for category badge classes', () => {
      vi.spyOn(service, 'getCategoryBadgeClass').mockReturnValue(
        'mocked-badge',
      );
      pipe.transform('worker', 'category', 'badge');
      expect(service.getCategoryBadgeClass).toHaveBeenCalledWith('worker');
    });

    it('should use service capitalizeFirst for category labels', () => {
      vi.spyOn(service, 'capitalizeFirst').mockReturnValue('Capitalized');
      pipe.transform('test', 'category', 'label');
      expect(service.capitalizeFirst).toHaveBeenCalledWith('test');
    });
  });
});
