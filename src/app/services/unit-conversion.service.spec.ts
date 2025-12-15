import { TestBed } from '@angular/core/testing';
import {
  UnitConversionService,
  FormattedValue,
  SynthesizedUnit,
} from './unit-conversion.service';

describe('UnitConversionService', () => {
  let service: UnitConversionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UnitConversionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ============================================================================
  // formatWithSiPrefix Tests
  // ============================================================================

  describe('formatWithSiPrefix', () => {
    it('should format values below 1000 with no prefix', () => {
      const result = service.formatWithSiPrefix(500, 'mps', 1);
      expect(result.value).toBe(500);
      expect(result.prefix).toBe('');
      expect(result.prefixShort).toBe('');
      expect(result.formatted).toBe('500.0 mps');
    });

    it('should format values >= 1000 with kilo prefix', () => {
      const result = service.formatWithSiPrefix(6400, 'mps', 1);
      expect(result.value).toBe(6.4);
      expect(result.prefix).toBe('kilo');
      expect(result.prefixShort).toBe('K');
      expect(result.formatted).toBe('6.4 kilomps');
    });

    it('should format values >= 1,000,000 with mega prefix', () => {
      const result = service.formatWithSiPrefix(2500000, 'mps', 1);
      expect(result.value).toBe(2.5);
      expect(result.prefix).toBe('mega');
      expect(result.prefixShort).toBe('M');
      expect(result.formatted).toBe('2.5 megamps');
    });

    it('should format values >= 1 billion with giga prefix', () => {
      const result = service.formatWithSiPrefix(3200000000, 'mps', 1);
      expect(result.value).toBe(3.2);
      expect(result.prefix).toBe('giga');
      expect(result.prefixShort).toBe('G');
      expect(result.formatted).toBe('3.2 gigamps');
    });

    it('should format values >= 1 trillion with tera prefix', () => {
      const result = service.formatWithSiPrefix(1500000000000, 'mps', 1);
      expect(result.value).toBe(1.5);
      expect(result.prefix).toBe('tera');
      expect(result.prefixShort).toBe('T');
      expect(result.formatted).toBe('1.5 teramps');
    });

    it('should format values >= 1 quadrillion with peta prefix', () => {
      const result = service.formatWithSiPrefix(2700000000000000, 'mps', 1);
      expect(result.value).toBe(2.7);
      expect(result.prefix).toBe('peta');
      expect(result.prefixShort).toBe('P');
      expect(result.formatted).toBe('2.7 petamps');
    });

    it('should respect decimal precision', () => {
      const result = service.formatWithSiPrefix(6543, 'mps', 2);
      expect(result.value).toBeCloseTo(6.543, 3);
      expect(result.formatted).toBe('6.54 kilomps');
    });

    it('should add space for multi-word units', () => {
      const result = service.formatWithSiPrefix(1500, 'standard images', 1);
      expect(result.formatted).toBe('1.5 kilo standard images');
    });

    it('should handle zero value', () => {
      const result = service.formatWithSiPrefix(0, 'mps', 1);
      expect(result.value).toBe(0);
      expect(result.prefix).toBe('');
      expect(result.formatted).toBe('0.0 mps');
    });

    it('should handle small decimal values', () => {
      const result = service.formatWithSiPrefix(0.5, 'mps', 2);
      expect(result.value).toBe(0.5);
      expect(result.prefix).toBe('');
      expect(result.formatted).toBe('0.50 mps');
    });
  });

  // ============================================================================
  // formatWithHumanPrefix Tests
  // ============================================================================

  describe('formatWithHumanPrefix', () => {
    it('should format values below 1000 with no prefix', () => {
      const result = service.formatWithHumanPrefix(500, 'images', 1);
      expect(result.value).toBe(500);
      expect(result.prefix).toBe('');
      expect(result.formatted).toBe('500.0 images');
    });

    it('should format values >= 1000 with thousand prefix', () => {
      const result = service.formatWithHumanPrefix(5000, 'images', 1);
      expect(result.value).toBe(5);
      expect(result.prefix).toBe('thousand');
      expect(result.formatted).toBe('5.0 thousand images');
    });

    it('should format values >= 1 million with million prefix', () => {
      const result = service.formatWithHumanPrefix(2500000, 'images', 1);
      expect(result.value).toBe(2.5);
      expect(result.prefix).toBe('million');
      expect(result.formatted).toBe('2.5 million images');
    });

    it('should format values >= 1 billion with billion prefix', () => {
      const result = service.formatWithHumanPrefix(3200000000, 'images', 1);
      expect(result.value).toBe(3.2);
      expect(result.prefix).toBe('billion');
      expect(result.formatted).toBe('3.2 billion images');
    });

    it('should format values >= 1 trillion with trillion prefix', () => {
      const result = service.formatWithHumanPrefix(1500000000000, 'images', 1);
      expect(result.value).toBe(1.5);
      expect(result.prefix).toBe('trillion');
      expect(result.formatted).toBe('1.5 trillion images');
    });
  });

  // ============================================================================
  // formatModelQueuedImage Tests - THE BUG REGRESSION TESTS
  // ============================================================================

  describe('formatModelQueuedImage', () => {
    it('should convert raw pixelsteps to megapixelsteps', () => {
      // 100 million pixelsteps = 100 mps
      const result = service.formatModelQueuedImage(100_000_000);
      expect(result.primary.value).toBe(100);
      expect(result.primary.prefix).toBe('');
      expect(result.primary.unit).toBe('mps');
      expect(result.primary.formatted).toBe('100.0 mps');
    });

    it('should use kilo prefix for >= 1000 mps (BUG REGRESSION TEST)', () => {
      // 6.4 billion pixelsteps = 6400 mps = 6.4 kilomps
      const result = service.formatModelQueuedImage(6_400_000_000);
      expect(result.primary.value).toBe(6.4);
      expect(result.primary.prefix).toBe('kilo');
      expect(result.primary.unit).toBe('mps');
      expect(result.primary.formatted).toBe('6.4 kilomps');
      // The bug was showing "6.4 mps" instead of "6.4 kilomps"
    });

    it('should use mega prefix for >= 1,000,000 mps', () => {
      // 2.5 trillion pixelsteps = 2.5 million mps = 2.5 megamps
      const result = service.formatModelQueuedImage(2_500_000_000_000);
      expect(result.primary.value).toBe(2.5);
      expect(result.primary.prefix).toBe('mega');
      expect(result.primary.formatted).toBe('2.5 megamps');
    });

    it('should calculate standard images correctly', () => {
      // 100 million pixelsteps = 100 mps = 5 standard images
      const result = service.formatModelQueuedImage(100_000_000);
      expect(result.technical.value).toBe(5);
      expect(result.technical.unit).toBe('standard images');
    });

    it('should handle zero queued', () => {
      const result = service.formatModelQueuedImage(0);
      expect(result.primary.value).toBe(0);
      expect(result.primary.formatted).toBe('0.0 mps');
    });

    it('should store raw value for reference', () => {
      const result = service.formatModelQueuedImage(500_000_000);
      expect(result.rawValue).toBe(500_000_000);
    });

    it('should handle real-world API value example', () => {
      // From screenshot: 6.4 kilomps total queued
      // This means ~6.4 billion pixelsteps raw
      const rawPixelsteps = 6_400_000_000;
      const result = service.formatModelQueuedImage(rawPixelsteps);

      expect(result.primary.value).toBe(6.4);
      expect(result.primary.prefix).toBe('kilo');
      expect(result.primary.unit).toBe('mps');
      expect(result.primary.formatted).toBe('6.4 kilomps');

      // Technical should show standard images
      // 6400 mps / 20 = 320 standard images
      expect(result.technical.value).toBe(320);
      expect(result.technical.unit).toBe('standard images');
    });

    it('should handle boundary value at exactly 1000 mps', () => {
      // 1 billion pixelsteps = 1000 mps
      const result = service.formatModelQueuedImage(1_000_000_000);
      expect(result.primary.value).toBe(1);
      expect(result.primary.prefix).toBe('kilo');
      expect(result.primary.formatted).toBe('1.0 kilomps');
    });

    it('should handle value just below 1000 mps', () => {
      // 999 million pixelsteps = 999 mps (no prefix)
      const result = service.formatModelQueuedImage(999_000_000);
      expect(result.primary.value).toBe(999);
      expect(result.primary.prefix).toBe('');
      expect(result.primary.formatted).toBe('999.0 mps');
    });
  });

  // ============================================================================
  // formatModelPerformanceImage Tests
  // ============================================================================

  describe('formatModelPerformanceImage', () => {
    it('should convert raw pixelsteps/s to mps/s', () => {
      // 1 million pixelsteps/s = 1 mps/s
      const result = service.formatModelPerformanceImage(1_000_000);
      expect(result.primary.value).toBe(1);
      expect(result.primary.unit).toBe('mps/s');
      expect(result.primary.formatted).toBe('1.00 mps/s');
    });

    it('should calculate standard images/s correctly', () => {
      // 1 million pixelsteps/s = 1 mps/s = 0.05 std img/s
      const result = service.formatModelPerformanceImage(1_000_000);
      expect(result.technical.value).toBe(0.05);
      expect(result.technical.unit).toBe('std img/s');
    });

    it('should handle high performance values', () => {
      // 6.2 million pixelsteps/s = 6.2 mps/s
      const result = service.formatModelPerformanceImage(6_200_000);
      expect(result.primary.value).toBeCloseTo(6.2, 1);
      expect(result.primary.formatted).toBe('6.20 mps/s');
    });

    it('should handle real API value', () => {
      // From API: waifu_diffusion has performance: 6204232.4
      const result = service.formatModelPerformanceImage(6_204_232);
      expect(result.primary.value).toBeCloseTo(6.204, 2);
      // Standard images per second: 6.204 / 20 = 0.31
      expect(result.technical.value).toBeCloseTo(0.31, 1);
    });

    it('should handle zero performance', () => {
      const result = service.formatModelPerformanceImage(0);
      expect(result.primary.value).toBe(0);
      expect(result.primary.formatted).toBe('0.00 mps/s');
    });
  });

  // ============================================================================
  // formatModelQueuedText Tests
  // ============================================================================

  describe('formatModelQueuedText', () => {
    it('should format raw tokens with SI prefix', () => {
      const result = service.formatModelQueuedText(5000);
      expect(result.primary.value).toBe(5);
      expect(result.primary.prefix).toBe('kilo');
      expect(result.primary.formatted).toBe('5.0 kilotokens');
    });

    it('should calculate pages of text', () => {
      // 10000 tokens * 0.75 / 500 = 15 pages
      const result = service.formatModelQueuedText(10000);
      expect(result.technical.value).toBe(15);
      expect(result.technical.unit).toBe('pages of text');
    });

    it('should handle large token values', () => {
      // 1 million tokens
      const result = service.formatModelQueuedText(1_000_000);
      expect(result.primary.value).toBe(1);
      expect(result.primary.prefix).toBe('mega');
      expect(result.primary.formatted).toBe('1.0 megatokens');
    });
  });

  // ============================================================================
  // formatModelPerformanceText Tests
  // ============================================================================

  describe('formatModelPerformanceText', () => {
    it('should format tokens/s with SI prefix', () => {
      const result = service.formatModelPerformanceText(1500);
      expect(result.primary.value).toBe(1.5);
      expect(result.primary.prefix).toBe('kilo');
      expect(result.primary.formatted).toBe('1.5 kilotokens/s');
    });

    it('should calculate pages/s', () => {
      // 1000 tokens/s * 0.75 / 500 = 1.5 pages/s
      const result = service.formatModelPerformanceText(1000);
      expect(result.technical.value).toBeCloseTo(1.5, 1);
      expect(result.technical.unit).toBe('pages/s');
    });
  });

  // ============================================================================
  // Integration Tests - SynthesizedUnit Structure
  // ============================================================================

  describe('SynthesizedUnit structure', () => {
    it('should have all required properties for image queued', () => {
      const result = service.formatModelQueuedImage(100_000_000);

      // Primary
      expect(result.primary).toBeDefined();
      expect(result.primary.value).toBeDefined();
      expect(result.primary.prefix).toBeDefined();
      expect(result.primary.prefixShort).toBeDefined();
      expect(result.primary.unit).toBeDefined();
      expect(result.primary.formatted).toBeDefined();
      expect(result.primary.formattedShort).toBeDefined();

      // Technical
      expect(result.technical).toBeDefined();
      expect(result.technical.value).toBeDefined();
      expect(result.technical.formatted).toBeDefined();

      // Meta
      expect(result.rawValue).toBe(100_000_000);
      expect(result.explanationKeys).toBeDefined();
      expect(result.explanationKeys.length).toBeGreaterThan(0);
    });

    it('should provide correct prefix+unit combination for tooltip', () => {
      // This is how the template will use it
      const result = service.formatModelQueuedImage(6_400_000_000);
      const displayUnit = result.primary.prefix + result.primary.unit;
      expect(displayUnit).toBe('kilomps');
    });

    it('should provide correct prefix+unit for small values', () => {
      const result = service.formatModelQueuedImage(500_000_000);
      const displayUnit = result.primary.prefix + result.primary.unit;
      expect(displayUnit).toBe('mps');
    });
  });

  // ============================================================================
  // Worker-Specific Unit Formatting Tests
  // ============================================================================

  describe('formatWorkerPerformanceImage', () => {
    it('should format worker mps/s correctly', () => {
      // Worker API gives mps/s directly (already in megapixelsteps)
      const result = service.formatWorkerPerformanceImage(1.5);
      expect(result.primary.value).toBe(1.5);
      expect(result.primary.formatted).toBe('1.50 mps/s');
    });

    it('should calculate standard images/s from mps/s', () => {
      // 1.5 mps/s = 0.075 std img/s
      const result = service.formatWorkerPerformanceImage(1.5);
      expect(result.technical.value).toBeCloseTo(0.075, 3);
    });
  });

  describe('formatWorkerMegapixelstepsGenerated', () => {
    it('should format total mps generated', () => {
      // 5000 mps
      const result = service.formatWorkerMegapixelstepsGenerated(5000);
      expect(result.primary.value).toBe(5);
      expect(result.primary.prefix).toBe('kilo');
      expect(result.primary.formatted).toBe('5.0 kilomps');
    });

    it('should calculate standard images from mps', () => {
      // 5000 mps / 20 = 250 standard images
      const result = service.formatWorkerMegapixelstepsGenerated(5000);
      expect(result.technical.value).toBe(250);
    });
  });

  // ============================================================================
  // Performance API Formatting Tests
  // ============================================================================

  describe('formatImagePerformanceRate', () => {
    it('should convert mps/min to standard images/sec', () => {
      // 1200 mps/min = 20 mps/sec = 1 std img/sec
      const result = service.formatImagePerformanceRate(1200);
      expect(result.primary.value).toBe(1);
      expect(result.primary.unit).toBe('standard images');
    });

    it('should provide technical mps/sec value', () => {
      // 1200 mps/min = 20 mps/sec
      const result = service.formatImagePerformanceRate(1200);
      expect(result.technical.value).toBeCloseTo(20, 0);
      expect(result.technical.formatted).toContain('megapixelsteps/sec');
    });
  });

  describe('formatQueuedImageWork', () => {
    it('should convert queued mps to standard images', () => {
      // 100 mps / 20 = 5 standard images
      const result = service.formatQueuedImageWork(100);
      expect(result.primary.value).toBe(5);
      expect(result.primary.unit).toBe('standard images');
    });

    it('should use kilo prefix for large standard image counts', () => {
      // 40000 mps / 20 = 2000 standard images
      const result = service.formatQueuedImageWork(40000);
      expect(result.primary.value).toBe(2);
      expect(result.primary.prefix).toBe('kilo');
      expect(result.primary.formatted).toBe('2.0 kilo standard images');
    });
  });

  // ============================================================================
  // Stats API Formatting Tests
  // ============================================================================

  describe('formatTotalPixelsteps', () => {
    it('should format raw pixelsteps with SI prefix', () => {
      // 2.7e15 pixelsteps = 2.7 petapixelsteps
      const result = service.formatTotalPixelsteps(2_700_000_000_000_000);
      expect(result.primary.value).toBe(2.7);
      expect(result.primary.prefix).toBe('peta');
      expect(result.primary.formatted).toBe('2.7 petapixelsteps');
    });

    it('should calculate standard images from pixelsteps', () => {
      // 2.7e15 ps / 1e6 = 2.7e9 mps / 20 = 135 million std images
      const result = service.formatTotalPixelsteps(2_700_000_000_000_000);
      expect(result.technical.value).toBe(135);
      expect(result.technical.prefix).toBe('million');
      expect(result.technical.formatted).toBe('135.0 million standard images');
    });
  });

  describe('formatTotalTokens', () => {
    it('should format tokens with SI prefix', () => {
      const result = service.formatTotalTokens(5_000_000_000);
      expect(result.primary.value).toBe(5);
      expect(result.primary.prefix).toBe('giga');
      expect(result.primary.formatted).toBe('5.0 gigatokens');
    });

    it('should calculate pages of text', () => {
      // 5e9 tokens * 0.75 / 500 = 7.5 million pages
      const result = service.formatTotalTokens(5_000_000_000);
      expect(result.technical.value).toBe(7.5);
      expect(result.technical.prefix).toBe('million');
    });
  });

  // ============================================================================
  // Utility Method Tests
  // ============================================================================

  describe('formatLargeNumber', () => {
    it('should format with human-readable prefix', () => {
      expect(service.formatLargeNumber(5_000_000, 'images')).toBe(
        '5.0 million images',
      );
    });

    it('should handle no unit', () => {
      expect(service.formatLargeNumber(1_000_000_000, '')).toBe('1.0 billion');
    });
  });

  describe('formatLargeNumberTechnical', () => {
    it('should format with SI prefix', () => {
      expect(service.formatLargeNumberTechnical(5_000_000, 'bytes')).toBe(
        '5.0 megabytes',
      );
    });
  });

  describe('formatWithCommas', () => {
    it('should add thousand separators', () => {
      expect(service.formatWithCommas(1234567)).toBe('1,234,567');
    });

    it('should respect decimal places', () => {
      expect(service.formatWithCommas(1234.567, 2)).toBe('1,234.57');
    });
  });
});
