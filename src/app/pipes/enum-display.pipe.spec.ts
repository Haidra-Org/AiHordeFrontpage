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
    pipe = new EnumDisplayPipe(service);
  });

  it('should create', () => {
    expect(pipe).toBeTruthy();
  });

  // ============================================================================
  // ItemType Transformation Tests
  // ============================================================================

  describe('ItemType transformations', () => {
    it('should transform itemType to label', () => {
      expect(pipe.transform(ItemType.GUI_IMAGE, 'itemType', 'label')).toBe(
        'Image GUI',
      );
      expect(pipe.transform(ItemType.GUI_TEXT, 'itemType', 'label')).toBe(
        'Text GUI',
      );
      expect(pipe.transform(ItemType.TOOL, 'itemType', 'label')).toBe('Tool');
    });

    it('should transform itemType to badge class', () => {
      expect(pipe.transform(ItemType.GUI_IMAGE, 'itemType', 'badge')).toBe(
        'badge-primary',
      );
      expect(pipe.transform(ItemType.TOOL, 'itemType', 'badge')).toBe(
        'badge-warning',
      );
    });

    it('should transform itemType to translation key', () => {
      expect(
        pipe.transform(ItemType.GUI_IMAGE, 'itemType', 'translation'),
      ).toBe('guis.image');
      expect(pipe.transform(ItemType.GUI_TEXT, 'itemType', 'translation')).toBe(
        'guis.text',
      );
      expect(pipe.transform(ItemType.TOOL, 'itemType', 'translation')).toBe(
        'tools.tool',
      );
    });

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

  // ============================================================================
  // Domain Transformation Tests
  // ============================================================================

  describe('Domain transformations', () => {
    it('should transform domain to label', () => {
      expect(pipe.transform(Domain.TEXT, 'domain', 'label')).toBe('Text');
      expect(pipe.transform(Domain.IMAGE, 'domain', 'label')).toBe('Image');
    });

    it('should transform domain to badge class', () => {
      expect(pipe.transform(Domain.TEXT, 'domain', 'badge')).toBe(
        'badge-purple',
      );
      expect(pipe.transform(Domain.IMAGE, 'domain', 'badge')).toBe(
        'badge-purple',
      );
    });

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

  // ============================================================================
  // Platform Transformation Tests
  // ============================================================================

  describe('Platform transformations', () => {
    it('should transform platform to label', () => {
      expect(pipe.transform(Platform.WEB, 'platform', 'label')).toBe('Web');
      expect(pipe.transform(Platform.WINDOWS, 'platform', 'label')).toBe(
        'Windows',
      );
      expect(pipe.transform(Platform.LINUX, 'platform', 'label')).toBe('Linux');
      expect(pipe.transform(Platform.MACOS, 'platform', 'label')).toBe('macOS');
      expect(pipe.transform(Platform.IOS, 'platform', 'label')).toBe('iOS');
      expect(pipe.transform(Platform.ANDROID, 'platform', 'label')).toBe(
        'Android',
      );
      expect(pipe.transform(Platform.FEDIVERSE, 'platform', 'label')).toBe(
        'Fediverse',
      );
    });

    it('should transform platform to badge class', () => {
      expect(pipe.transform(Platform.WEB, 'platform', 'badge')).toBe(
        'badge-info',
      );
      expect(pipe.transform(Platform.WINDOWS, 'platform', 'badge')).toBe(
        'badge-info',
      );
    });

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

  // ============================================================================
  // FunctionType Transformation Tests
  // ============================================================================

  describe('FunctionType transformations', () => {
    it('should transform functionType to label', () => {
      expect(
        pipe.transform(FunctionKind.FRONTEND, 'functionType', 'label'),
      ).toBe('Frontend');
      expect(pipe.transform(FunctionKind.WORKER, 'functionType', 'label')).toBe(
        'Worker',
      );
      expect(pipe.transform(FunctionKind.BOT, 'functionType', 'label')).toBe(
        'Bot',
      );
      expect(pipe.transform(FunctionKind.PLUGIN, 'functionType', 'label')).toBe(
        'Plugin',
      );
      expect(pipe.transform(FunctionKind.SDK, 'functionType', 'label')).toBe(
        'SDK',
      );
      expect(
        pipe.transform(FunctionKind.CLI_TOOL, 'functionType', 'label'),
      ).toBe('CLI');
    });

    it('should transform functionType to badge class', () => {
      expect(pipe.transform(FunctionKind.WORKER, 'functionType', 'badge')).toBe(
        'badge-warning',
      );
      expect(pipe.transform(FunctionKind.BOT, 'functionType', 'badge')).toBe(
        'badge-warning',
      );
    });

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

  // ============================================================================
  // Generic Category Transformation Tests
  // ============================================================================

  describe('Category transformations', () => {
    it('should capitalize category labels', () => {
      expect(pipe.transform('worker', 'category', 'label')).toBe('Worker');
      expect(pipe.transform('development', 'category', 'label')).toBe(
        'Development',
      );
    });

    it('should transform category to appropriate badge class', () => {
      expect(pipe.transform('windows', 'category', 'badge')).toBe('badge-info');
      expect(pipe.transform('worker', 'category', 'badge')).toBe(
        'badge-warning',
      );
      expect(pipe.transform('image generation', 'category', 'badge')).toBe(
        'badge-purple',
      );
      expect(pipe.transform('official tools', 'category', 'badge')).toBe(
        'badge-teal',
      );
      expect(pipe.transform('development', 'category', 'badge')).toBe(
        'badge-indigo',
      );
      expect(pipe.transform('unknown', 'category', 'badge')).toBe(
        'badge-secondary',
      );
    });

    it('should return undefined for category translation (not supported)', () => {
      expect(
        pipe.transform('worker', 'category', 'translation'),
      ).toBeUndefined();
    });

    it('should default to category when enumCategory not specified', () => {
      expect(pipe.transform('worker')).toBe('Worker');
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge cases', () => {
    it('should return empty string for null value', () => {
      expect(pipe.transform(null as any, 'category', 'label')).toBe('');
    });

    it('should return empty string for undefined value', () => {
      expect(pipe.transform(undefined as any, 'category', 'label')).toBe('');
    });

    it('should return empty string for empty string value', () => {
      expect(pipe.transform('', 'category', 'label')).toBe('');
    });

    it('should handle numeric enum values', () => {
      // Even though our enums are string-based, the pipe should handle any input
      expect(pipe.transform('123', 'category', 'label')).toBe('123');
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration with EnumDisplayService', () => {
    it('should use service for itemType labels', () => {
      spyOn(service, 'getItemTypeLabel').and.returnValue('Mocked Label');
      pipe.transform(ItemType.GUI_IMAGE, 'itemType', 'label');
      expect(service.getItemTypeLabel).toHaveBeenCalledWith(ItemType.GUI_IMAGE);
    });

    it('should use service for domain badge classes', () => {
      spyOn(service, 'getDomainBadgeClass').and.returnValue('mocked-class');
      pipe.transform(Domain.TEXT, 'domain', 'badge');
      expect(service.getDomainBadgeClass).toHaveBeenCalledWith(Domain.TEXT);
    });

    it('should use service for platform labels', () => {
      spyOn(service, 'getPlatformLabel').and.returnValue('Mocked Platform');
      pipe.transform(Platform.WEB, 'platform', 'label');
      expect(service.getPlatformLabel).toHaveBeenCalledWith(Platform.WEB);
    });

    it('should use service for functionType labels', () => {
      spyOn(service, 'getFunctionTypeLabel').and.returnValue('Mocked Function');
      pipe.transform(FunctionKind.WORKER, 'functionType', 'label');
      expect(service.getFunctionTypeLabel).toHaveBeenCalledWith(
        FunctionKind.WORKER,
      );
    });

    it('should use service for category badge classes', () => {
      spyOn(service, 'getCategoryBadgeClass').and.returnValue('mocked-badge');
      pipe.transform('worker', 'category', 'badge');
      expect(service.getCategoryBadgeClass).toHaveBeenCalledWith('worker');
    });

    it('should use service capitalizeFirst for category labels', () => {
      spyOn(service, 'capitalizeFirst').and.returnValue('Capitalized');
      pipe.transform('test', 'category', 'label');
      expect(service.capitalizeFirst).toHaveBeenCalledWith('test');
    });
  });
});
