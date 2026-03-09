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
      expect(result.primary.unit).toBe('standard images/sec');
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

  // ============================================================================
  // parseWorkerPerformance Tests
  // ============================================================================

  describe('parseWorkerPerformance', () => {
    it('should parse a valid numeric string', () => {
      expect(service.parseWorkerPerformance('1.5')).toBe(1.5);
    });

    it('should parse an integer string', () => {
      expect(service.parseWorkerPerformance('42')).toBe(42);
    });

    it('should parse a string with trailing text', () => {
      // parseFloat handles "1.5 megapixelsteps per second" → 1.5
      expect(
        service.parseWorkerPerformance('1.5 megapixelsteps per second'),
      ).toBe(1.5);
    });

    it('should return 0 for an empty string', () => {
      expect(service.parseWorkerPerformance('')).toBe(0);
    });

    it('should return 0 for non-numeric text', () => {
      expect(service.parseWorkerPerformance('not a number')).toBe(0);
    });

    it('should return 0 for "NaN"', () => {
      expect(service.parseWorkerPerformance('NaN')).toBe(0);
    });

    it('should handle zero', () => {
      expect(service.parseWorkerPerformance('0')).toBe(0);
    });

    it('should handle negative values', () => {
      expect(service.parseWorkerPerformance('-1.5')).toBe(-1.5);
    });

    it('should handle very small decimal values', () => {
      expect(service.parseWorkerPerformance('0.001')).toBe(0.001);
    });
  });

  // ============================================================================
  // formatAggregateWorkerPerformance Tests
  // ============================================================================

  describe('formatAggregateWorkerPerformance', () => {
    it('should return null for zero performance', () => {
      expect(service.formatAggregateWorkerPerformance(0, 'image')).toBeNull();
      expect(service.formatAggregateWorkerPerformance(0, 'text')).toBeNull();
      expect(
        service.formatAggregateWorkerPerformance(0, 'interrogation'),
      ).toBeNull();
    });

    it('should format image aggregate as mps/s', () => {
      const result = service.formatAggregateWorkerPerformance(25.5, 'image')!;
      expect(result).not.toBeNull();
      expect(result.primary.value).toBe(25.5);
      expect(result.primary.unit).toBe('mps/s');
      expect(result.primary.formatted).toBe('25.50 mps/s');
    });

    it('should calculate standard images/s for image aggregate', () => {
      // 20 mps/s = 1 std img/s
      const result = service.formatAggregateWorkerPerformance(20, 'image')!;
      expect(result.technical.value).toBe(1);
      expect(result.technical.unit).toBe('std img/s');
    });

    it('should format text aggregate with SI prefix', () => {
      const result = service.formatAggregateWorkerPerformance(1500, 'text')!;
      expect(result).not.toBeNull();
      expect(result.primary.value).toBe(1.5);
      expect(result.primary.prefix).toBe('kilo');
      expect(result.primary.unit).toBe('tokens/s');
    });

    it('should calculate pages/s for text aggregate', () => {
      // 1000 tokens/s * 0.75 / 500 = 1.5 pages/s
      const result = service.formatAggregateWorkerPerformance(1000, 'text')!;
      expect(result.technical.value).toBeCloseTo(1.5, 1);
      expect(result.technical.unit).toBe('pages/s');
    });

    it('should format interrogation aggregate as seconds/form', () => {
      const result = service.formatAggregateWorkerPerformance(
        3.75,
        'interrogation',
      )!;
      expect(result).not.toBeNull();
      expect(result.primary.value).toBe(3.75);
      expect(result.primary.unit).toBe('seconds/form');
      expect(result.primary.formatted).toBe('3.75 seconds/form');
    });

    // Verify aggregate uses the same formatting as individual workers
    it('should produce identical result to formatWorkerPerformanceImage for image type', () => {
      const totalMps = 15.7;
      const aggregate = service.formatAggregateWorkerPerformance(
        totalMps,
        'image',
      )!;
      const direct = service.formatWorkerPerformanceImage(totalMps);

      expect(aggregate.primary.value).toBe(direct.primary.value);
      expect(aggregate.primary.unit).toBe(direct.primary.unit);
      expect(aggregate.primary.formatted).toBe(direct.primary.formatted);
      expect(aggregate.technical.value).toBe(direct.technical.value);
      expect(aggregate.rawValue).toBe(direct.rawValue);
    });

    it('should produce identical result to formatWorkerPerformanceText for text type', () => {
      const totalTokens = 850;
      const aggregate = service.formatAggregateWorkerPerformance(
        totalTokens,
        'text',
      )!;
      const direct = service.formatWorkerPerformanceText(totalTokens);

      expect(aggregate.primary.value).toBe(direct.primary.value);
      expect(aggregate.primary.unit).toBe(direct.primary.unit);
      expect(aggregate.technical.value).toBe(direct.technical.value);
      expect(aggregate.rawValue).toBe(direct.rawValue);
    });
  });

  // ============================================================================
  // Cross-Format Consistency Tests
  // ============================================================================

  describe('Cross-format consistency', () => {
    it('should produce consistent mps/s between homepage and worker aggregate', () => {
      // Scenario: network has total capacity of 25 mps/s
      // Homepage API returns past_minute_megapixelsteps = 25 * 60 = 1500 mps/min
      // Worker list sums individual worker.performance values to 25 mps/s
      const totalMpsPerSecond = 25;
      const apiMpsPerMinute = totalMpsPerSecond * 60;

      const homepageResult =
        service.formatImagePerformanceRate(apiMpsPerMinute);
      const workerAggregate = service.formatAggregateWorkerPerformance(
        totalMpsPerSecond,
        'image',
      )!;

      // Homepage technical value should be mps/sec
      expect(homepageResult.technical.value).toBeCloseTo(totalMpsPerSecond, 5);

      // Worker aggregate primary value should also be mps/sec
      expect(workerAggregate.primary.value).toBeCloseTo(totalMpsPerSecond, 5);

      // Both should yield the same standard images/sec
      const expectedStdImgPerSec = totalMpsPerSecond / 20;
      expect(homepageResult.primary.value).toBeCloseTo(expectedStdImgPerSec, 5);
      expect(workerAggregate.technical.value).toBeCloseTo(
        expectedStdImgPerSec,
        5,
      );
    });

    it('should produce consistent tokens/s between homepage and worker aggregate', () => {
      // Scenario: network has total capacity of 5000 tokens/s
      // Homepage API returns past_minute_tokens = 5000 * 60 = 300000 tokens/min
      // Worker list sums individual worker.performance values to 5000 tokens/s
      const totalTokensPerSecond = 5000;
      const apiTokensPerMinute = totalTokensPerSecond * 60;

      const homepageResult =
        service.formatTextPerformanceRate(apiTokensPerMinute);
      const workerAggregate = service.formatAggregateWorkerPerformance(
        totalTokensPerSecond,
        'text',
      )!;

      // Both raw values should trace back to tokens/sec (homepage stores tokens/min as raw)
      expect(homepageResult.rawValue / 60).toBeCloseTo(totalTokensPerSecond, 5);
      expect(workerAggregate.rawValue).toBeCloseTo(totalTokensPerSecond, 5);

      // Both should yield the same pages/sec
      const expectedPagesPerSec = (totalTokensPerSecond * 0.75) / 500;
      expect(homepageResult.primary.value).toBeCloseTo(expectedPagesPerSec, 3);
      expect(workerAggregate.technical.value).toBeCloseTo(
        expectedPagesPerSec,
        3,
      );
    });

    it('should use consistent standard image conversion factor (÷ 20) everywhere', () => {
      const mps = 100;

      // Worker performance (mps/s → std img/s)
      const workerResult = service.formatWorkerPerformanceImage(mps);
      expect(workerResult.technical.value).toBeCloseTo(mps / 20, 5);

      // Homepage performance (mps/min → mps/s → std img/s)
      const homepageResult = service.formatImagePerformanceRate(mps * 60);
      expect(homepageResult.primary.value).toBeCloseTo(mps / 20, 5);

      // Model performance (ps/s → mps/s → std img/s)
      const modelResult = service.formatModelPerformanceImage(mps * 1e6);
      expect(modelResult.technical.value).toBeCloseTo(mps / 20, 5);

      // Queued work (mps → std img)
      const queuedResult = service.formatQueuedImageWork(mps);
      expect(queuedResult.primary.value).toBeCloseTo(mps / 20, 5);

      // Total pixelsteps (ps → mps → std img)
      const totalResult = service.formatTotalPixelsteps(mps * 1e6);
      expect(totalResult.technical.value).toBeCloseTo(mps / 20, 5);
    });

    it('should use consistent pages of text conversion factor everywhere', () => {
      const tokens = 10000;
      const expectedPages = (tokens * 0.75) / 500; // = 15

      // Worker text performance
      const workerResult = service.formatWorkerPerformanceText(tokens);
      expect(workerResult.technical.value).toBeCloseTo(expectedPages, 3);

      // Homepage text performance (tokens/min → tokens/s → pages/s)
      const homepageResult = service.formatTextPerformanceRate(tokens * 60);
      expect(homepageResult.primary.value).toBeCloseTo(expectedPages, 3);

      // Model text performance
      const modelResult = service.formatModelPerformanceText(tokens);
      expect(modelResult.technical.value).toBeCloseTo(expectedPages, 3);

      // Total tokens
      const totalResult = service.formatTotalTokens(tokens);
      expect(totalResult.technical.value).toBeCloseTo(expectedPages, 3);

      // Queued tokens
      const queuedResult = service.formatQueuedTokens(tokens);
      expect(queuedResult.technical.value).toBeCloseTo(expectedPages, 3);
    });
  });
});
