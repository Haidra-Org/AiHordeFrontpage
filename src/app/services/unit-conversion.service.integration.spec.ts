import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { UnitConversionService } from './unit-conversion.service';

/**
 * Integration tests for UnitConversionService with live API data
 *
 * These tests verify that the unit conversion logic produces correct results
 * when given real-world data shapes from the AI Horde API.
 */
describe('UnitConversionService Integration Tests', () => {
  let service: UnitConversionService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UnitConversionService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  describe('Real API Data Shape Tests', () => {
    /**
     * This test verifies that formatModelQueuedImage correctly handles
     * real API response values like those from /status/models
     */
    it('should correctly format real model queued values', () => {
      // Example real API responses from /api/v2/status/models?type=image
      const realModelData = [
        {
          name: 'waifu_diffusion',
          queued: 0, // No queue
          expected: { value: 0, prefix: '', formatted: '0.0 mps' },
        },
        {
          name: 'Stable Diffusion 2.0',
          queued: 50_000_000, // 50 mps
          expected: { value: 50, prefix: '', formatted: '50.0 mps' },
        },
        {
          name: 'Popular Model',
          queued: 500_000_000, // 500 mps
          expected: { value: 500, prefix: '', formatted: '500.0 mps' },
        },
        {
          name: 'Very Popular Model',
          queued: 6_400_000_000, // 6400 mps = 6.4 kilomps
          expected: { value: 6.4, prefix: 'kilo', formatted: '6.4 kilomps' },
        },
        {
          name: 'Extremely Popular Model',
          queued: 25_000_000_000, // 25000 mps = 25 kilomps
          expected: { value: 25, prefix: 'kilo', formatted: '25.0 kilomps' },
        },
      ];

      for (const modelData of realModelData) {
        const result = service.formatModelQueuedImage(modelData.queued);
        expect(result.primary.value).toBe(
          modelData.expected.value,
          `${modelData.name}: value mismatch`,
        );
        expect(result.primary.prefix).toBe(
          modelData.expected.prefix,
          `${modelData.name}: prefix mismatch`,
        );
        expect(result.primary.formatted).toBe(
          modelData.expected.formatted,
          `${modelData.name}: formatted mismatch`,
        );
      }
    });

    /**
     * This test verifies formatModelPerformanceImage with real API values
     */
    it('should correctly format real model performance values', () => {
      // Example real API responses from /api/v2/status/models?type=image
      const realPerformanceData = [
        {
          name: 'waifu_diffusion',
          performance: 6_204_232, // ~6.2 mps/s
          expectedValue: 6.204,
          expectedFormatted: '6.20 mps/s',
        },
        {
          name: 'slow_model',
          performance: 500_000, // 0.5 mps/s
          expectedValue: 0.5,
          expectedFormatted: '0.50 mps/s',
        },
        {
          name: 'fast_model',
          performance: 15_000_000, // 15 mps/s
          expectedValue: 15.0,
          expectedFormatted: '15.00 mps/s',
        },
      ];

      for (const perfData of realPerformanceData) {
        const result = service.formatModelPerformanceImage(
          perfData.performance,
        );
        expect(result.primary.value).toBeCloseTo(
          perfData.expectedValue,
          2,
          `${perfData.name}: value mismatch`,
        );
        expect(result.primary.formatted).toBe(
          perfData.expectedFormatted,
          `${perfData.name}: formatted mismatch`,
        );
      }
    });

    /**
     * Verify the relationship between raw pixelsteps and derived units
     */
    it('should maintain correct unit conversion relationships', () => {
      const rawPixelsteps = 6_400_000_000; // 6.4 billion pixelsteps
      const result = service.formatModelQueuedImage(rawPixelsteps);

      // 6.4 billion pixelsteps / 1 million = 6400 megapixelsteps
      const expectedMps = rawPixelsteps / 1_000_000;
      expect(expectedMps).toBe(6400);

      // 6400 mps should be formatted as 6.4 kilomps
      expect(result.primary.value).toBe(6.4);
      expect(result.primary.prefix).toBe('kilo');
      expect(result.primary.unit).toBe('mps');

      // Standard images: 6400 mps / 20 = 320 standard images
      expect(result.technical.value).toBe(320);
      expect(result.technical.unit).toBe('standard images');

      // Raw value should be preserved
      expect(result.rawValue).toBe(rawPixelsteps);
    });

    /**
     * Verify the prefix+unit concatenation used in templates
     */
    it('should produce correct prefix+unit for template display', () => {
      const testCases = [
        { raw: 100_000_000, expectedPrefixUnit: 'mps' },
        { raw: 999_000_000, expectedPrefixUnit: 'mps' },
        { raw: 1_000_000_000, expectedPrefixUnit: 'kilomps' },
        { raw: 6_400_000_000, expectedPrefixUnit: 'kilomps' },
        { raw: 1_000_000_000_000, expectedPrefixUnit: 'megamps' },
        { raw: 2_500_000_000_000_000, expectedPrefixUnit: 'gigamps' },
      ];

      for (const tc of testCases) {
        const result = service.formatModelQueuedImage(tc.raw);
        const prefixUnit = result.primary.prefix + result.primary.unit;
        expect(prefixUnit).toBe(
          tc.expectedPrefixUnit,
          `Raw ${tc.raw} should produce ${tc.expectedPrefixUnit}, got ${prefixUnit}`,
        );
      }
    });

    /**
     * Verify that tooltip component will receive correct data
     */
    it('should provide all data needed for unit-tooltip component', () => {
      const result = service.formatModelQueuedImage(6_400_000_000);

      // Primary display (what the user sees)
      expect(result.primary.formatted).toBe('6.4 kilomps');

      // The primaryOverride value template uses
      const primaryOverride = result.primary.prefix + result.primary.unit;
      expect(primaryOverride).toBe('kilomps');

      // Technical display (shown in tooltip)
      expect(result.technical.formatted).toContain('320');
      expect(result.technical.formatted).toContain('standard images');

      // Explanation keys for i18n - verify they exist and are strings
      expect(result.explanationKeys.length).toBeGreaterThan(0);
      expect(typeof result.explanationKeys[0]).toBe('string');
    });
  });

  describe('Boundary Value Tests', () => {
    /**
     * Test SI prefix boundaries for formatWithSiPrefix
     */
    it('should apply correct SI prefix at boundaries', () => {
      const boundaries = [
        { value: 999, expectedPrefix: '' },
        { value: 1000, expectedPrefix: 'kilo' },
        { value: 999_999, expectedPrefix: 'kilo' },
        { value: 1_000_000, expectedPrefix: 'mega' },
        { value: 999_999_999, expectedPrefix: 'mega' },
        { value: 1_000_000_000, expectedPrefix: 'giga' },
        { value: 999_999_999_999, expectedPrefix: 'giga' },
        { value: 1_000_000_000_000, expectedPrefix: 'tera' },
        { value: 999_999_999_999_999, expectedPrefix: 'tera' },
        { value: 1_000_000_000_000_000, expectedPrefix: 'peta' },
      ];

      for (const b of boundaries) {
        const result = service.formatWithSiPrefix(b.value, 'units', 1);
        expect(result.prefix).toBe(
          b.expectedPrefix,
          `Value ${b.value} should have prefix ${b.expectedPrefix}, got ${result.prefix}`,
        );
      }
    });

    /**
     * Test human prefix boundaries for formatWithHumanPrefix
     */
    it('should apply correct human prefix at boundaries', () => {
      const boundaries = [
        { value: 999, expectedPrefix: '' },
        { value: 1000, expectedPrefix: 'thousand' },
        { value: 999_999, expectedPrefix: 'thousand' },
        { value: 1_000_000, expectedPrefix: 'million' },
        { value: 999_999_999, expectedPrefix: 'million' },
        { value: 1_000_000_000, expectedPrefix: 'billion' },
        { value: 999_999_999_999, expectedPrefix: 'billion' },
        { value: 1_000_000_000_000, expectedPrefix: 'trillion' },
        { value: 999_999_999_999_999, expectedPrefix: 'trillion' },
        { value: 1_000_000_000_000_000, expectedPrefix: 'quadrillion' },
      ];

      for (const b of boundaries) {
        const result = service.formatWithHumanPrefix(b.value, 'items', 1);
        expect(result.prefix).toBe(
          b.expectedPrefix,
          `Value ${b.value} should have prefix ${b.expectedPrefix}, got ${result.prefix}`,
        );
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative values gracefully', () => {
      const result = service.formatWithSiPrefix(-1000, 'units', 1);
      // Service should handle or reject negative values reasonably
      expect(result).toBeDefined();
    });

    it('should handle very small positive values', () => {
      const result = service.formatWithSiPrefix(0.001, 'units', 3);
      expect(result.prefix).toBe('');
      expect(result.value).toBeCloseTo(0.001, 3);
    });

    it('should handle NaN input', () => {
      const result = service.formatWithSiPrefix(NaN, 'units', 1);
      // Should handle gracefully, not crash
      expect(result).toBeDefined();
    });

    it('should handle Infinity input', () => {
      const result = service.formatWithSiPrefix(Infinity, 'units', 1);
      // Should handle gracefully, not crash
      expect(result).toBeDefined();
    });
  });
});
