import { Injectable } from '@angular/core';

/**
 * Represents a formatted value with SI prefix
 */
export interface FormattedValue {
  /** The numeric value after scaling */
  value: number;
  /** The SI prefix (e.g., 'kilo', 'mega', 'giga') */
  prefix: string;
  /** Short form of prefix (e.g., 'K', 'M', 'G') */
  prefixShort: string;
  /** The base unit (e.g., 'pixelsteps', 'tokens') */
  unit: string;
  /** Full formatted string (e.g., '2.70 terapixelsteps') */
  formatted: string;
  /** Short formatted string (e.g., '2.70T pixelsteps') */
  formattedShort: string;
}

/**
 * Represents a synthesized "human readable" unit with tooltip explanation
 */
export interface SynthesizedUnit {
  /** The primary display value (synthesized, human-friendly) */
  primary: FormattedValue;
  /** The technical value shown in tooltip */
  technical: FormattedValue;
  /** The raw numeric value before any transformation */
  rawValue: number;
  /** Explanation lines for tooltip */
  explanationKeys: string[];
}

/**
 * SI prefixes with their multipliers
 */
const SI_PREFIXES = [
  { threshold: 1e15, prefix: 'peta', short: 'P' },
  { threshold: 1e12, prefix: 'tera', short: 'T' },
  { threshold: 1e9, prefix: 'giga', short: 'G' },
  { threshold: 1e6, prefix: 'mega', short: 'M' },
  { threshold: 1e3, prefix: 'kilo', short: 'K' },
  { threshold: 1, prefix: '', short: '' },
];

/**
 * Human-readable number words for everyday units like "images" and "requests"
 */
const HUMAN_PREFIXES = [
  { threshold: 1e15, prefix: 'quadrillion', short: 'Q' },
  { threshold: 1e12, prefix: 'trillion', short: 'T' },
  { threshold: 1e9, prefix: 'billion', short: 'B' },
  { threshold: 1e6, prefix: 'million', short: 'M' },
  { threshold: 1e3, prefix: 'thousand', short: 'K' },
  { threshold: 1, prefix: '', short: '' },
];

/**
 * Centralized service for handling unit conversions and formatting
 * across the AI Horde frontend.
 *
 * ## Understanding the API data:
 *
 * ### Performance API (`/v2/status/performance`):
 * - `past_minute_megapixelsteps`: Already in **megapixelsteps** per minute
 * - `past_minute_tokens`: Raw **tokens** per minute
 * - `queued_megapixelsteps`: Already in **megapixelsteps**
 * - `queued_tokens`: Raw **tokens**
 *
 * ### Stats API (`/v2/stats/img/totals`, `/v2/stats/text/totals`):
 * - `ps`: Raw **pixelsteps** (NOT mega!)
 * - `tokens`: Raw **tokens**
 *
 * ## Synthesized units:
 *
 * ### "standard images"
 * - 1 megapixelstep = approximately 1/20th of an standard image
 * - Formula: standard_images = megapixelsteps / 20
 * - Assumes ~20 steps per image at 1024x1024 (1 megapixel)
 *
 * ### "Pages of Text"
 * - 1 token ≈ 0.75 words
 * - 1 page ≈ 500 words ≈ 667 tokens
 * - Formula: pages = tokens * 0.75 / 500
 */
@Injectable({
  providedIn: 'root',
})
export class UnitConversionService {
  /**
   * Formats a number with appropriate SI prefix
   */
  formatWithSiPrefix(
    value: number,
    unit: string,
    decimals: number = 1,
  ): FormattedValue {
    const siPrefix = this.getSiPrefix(value);
    const scaledValue = value / siPrefix.threshold;

    // Build formatted string with proper spacing
    // "164.7 mega" + "pixelsteps" → "164.7 megapixelsteps"
    // "164.7 mega" + "standard images" → "164.7 mega standard images"
    // Use prefix directly attached to unit for compound units like "megapixelsteps"
    // But add a space for multi-word units like "standard images"
    const hasMultiWordUnit = unit.includes(' ');
    const prefixUnitSeparator = hasMultiWordUnit && siPrefix.prefix ? ' ' : '';

    return {
      value: scaledValue,
      prefix: siPrefix.prefix,
      prefixShort: siPrefix.short,
      unit,
      formatted: `${scaledValue.toFixed(decimals)} ${siPrefix.prefix}${prefixUnitSeparator}${unit}`,
      formattedShort: `${scaledValue.toFixed(decimals)}${siPrefix.short} ${unit}`,
    };
  }

  /**
   * Formats a number with human-readable prefix (million, billion, etc.)
   * Use this for synthesized units like "standard images", "pages of text"
   */
  formatWithHumanPrefix(
    value: number,
    unit: string,
    decimals: number = 1,
  ): FormattedValue {
    const prefix = this.getHumanPrefix(value);
    const scaledValue = value / prefix.threshold;

    // Build formatted string with proper spacing: "134.9 million standard images"
    const parts = [scaledValue.toFixed(decimals)];
    if (prefix.prefix) {
      parts.push(prefix.prefix);
    }
    if (unit) {
      parts.push(unit);
    }

    return {
      value: scaledValue,
      prefix: prefix.prefix,
      prefixShort: prefix.short,
      unit,
      formatted: parts.join(' '),
      formattedShort: `${scaledValue.toFixed(decimals)}${prefix.short} ${unit}`,
    };
  }

  /**
   * Get the appropriate SI prefix for a value
   */
  private getSiPrefix(value: number): {
    threshold: number;
    prefix: string;
    short: string;
  } {
    const absValue = Math.abs(value);
    for (const prefix of SI_PREFIXES) {
      if (absValue >= prefix.threshold) {
        return prefix;
      }
    }
    return SI_PREFIXES[SI_PREFIXES.length - 1];
  }

  // ============================================================================
  // IMAGE PERFORMANCE CONVERSIONS
  // ============================================================================

  /**
   * Converts megapixelsteps/minute (from performance API) to per-second metrics.
   *
   * @param megapixelstepsPerMinute - The `past_minute_megapixelsteps` value from API
   * @returns SynthesizedUnit with "standard images/sec" as primary and megapixelsteps/sec as technical
   */
  formatImagePerformanceRate(megapixelstepsPerMinute: number): SynthesizedUnit {
    // Convert to per-second
    const megapixelstepsPerSecond = megapixelstepsPerMinute / 60;

    // Convert to "standard images" (1 standard image = 20 megapixelsteps)
    const standardImagesPerSecond = megapixelstepsPerSecond / 20;

    // For the tooltip, show the megapixelsteps/sec value
    // The API gives us values in megapixelsteps, so that's the "raw" technical unit
    return {
      primary: this.formatWithSiPrefix(
        standardImagesPerSecond,
        'standard images',
        1,
      ),
      technical: {
        value: megapixelstepsPerSecond,
        prefix: 'mega',
        prefixShort: 'M',
        unit: 'pixelsteps/sec',
        formatted: `${megapixelstepsPerSecond.toFixed(2)} megapixelsteps/sec`,
        formattedShort: `${megapixelstepsPerSecond.toFixed(2)} Mpixelsteps/sec`,
      },
      rawValue: megapixelstepsPerMinute,
      explanationKeys: [
        'standard_images.tooltip.line1',
        'standard_images.tooltip.line2',
        'standard_images.tooltip.line3',
      ],
    };
  }

  /**
   * Converts queued megapixelsteps to synthesized unit.
   *
   * @param queuedMegapixelsteps - The `queued_megapixelsteps` value from API
   * @returns SynthesizedUnit with "standard images" as primary
   */
  formatQueuedImageWork(queuedMegapixelsteps: number): SynthesizedUnit {
    const standardImages = queuedMegapixelsteps / 20;

    return {
      primary: this.formatWithSiPrefix(standardImages, 'standard images', 1),
      technical: {
        value: queuedMegapixelsteps,
        prefix: '',
        prefixShort: '',
        unit: 'megapixelsteps',
        formatted: `${queuedMegapixelsteps.toLocaleString(undefined, { maximumFractionDigits: 0 })} megapixelsteps`,
        formattedShort: `${queuedMegapixelsteps.toLocaleString(undefined, { maximumFractionDigits: 0 })} megapixelsteps`,
      },
      rawValue: queuedMegapixelsteps,
      explanationKeys: [
        'standard_images.tooltip.line1',
        'standard_images.tooltip.line2',
        'standard_images.tooltip.line3',
      ],
    };
  }

  /**
   * Converts raw pixelsteps (from stats API totals) to formatted values.
   *
   * @param rawPixelsteps - The `ps` value from stats API (raw pixelsteps, NOT mega)
   * @returns SynthesizedUnit with pixelsteps as primary and standard images as secondary
   */
  formatTotalPixelsteps(rawPixelsteps: number): SynthesizedUnit {
    // Convert raw pixelsteps to megapixelsteps for the "standard images" calculation
    const megapixelsteps = rawPixelsteps / 1e6;
    const standardImages = megapixelsteps / 20;

    // Primary: show pixelsteps with SI prefix (technical unit)
    // Technical: show standard images with human prefix (synthesized unit)
    return {
      primary: this.formatWithSiPrefix(rawPixelsteps, 'pixelsteps', 1),
      technical: this.formatWithHumanPrefix(
        standardImages,
        'standard images',
        1,
      ),
      rawValue: rawPixelsteps,
      explanationKeys: [
        'standard_images.tooltip.line1',
        'standard_images.tooltip.line2',
        'standard_images.tooltip.line3',
      ],
    };
  }
  // ============================================================================
  // TEXT PERFORMANCE CONVERSIONS
  // ============================================================================

  /**
   * Converts tokens/minute (from performance API) to per-second metrics.
   *
   * @param tokensPerMinute - The `past_minute_tokens` value from API
   * @returns SynthesizedUnit with pages/sec as primary and tokens/sec as technical
   */
  formatTextPerformanceRate(tokensPerMinute: number): SynthesizedUnit {
    const tokensPerSecond = tokensPerMinute / 60;

    // 1 token ≈ 0.75 words, 1 page ≈ 500 words → 1 page ≈ 667 tokens
    const pagesPerSecond = (tokensPerSecond * 0.75) / 500;

    return {
      primary: this.formatWithSiPrefix(pagesPerSecond, 'pages/sec', 2),
      technical: this.formatWithSiPrefix(tokensPerSecond, 'tokens/sec', 1),
      rawValue: tokensPerMinute,
      explanationKeys: [
        'pages_of_text.tooltip.line1',
        'pages_of_text.tooltip.line2',
        'pages_of_text.tooltip.line3',
      ],
    };
  }

  /**
   * Converts raw tokens to formatted value with "pages of text" synthesis.
   *
   * @param rawTokens - Raw token count
   * @returns SynthesizedUnit with tokens as primary and pages as secondary
   */
  formatTotalTokens(rawTokens: number): SynthesizedUnit {
    // 1 token ≈ 0.75 words, 1 page ≈ 500 words
    const pagesOfText = (rawTokens * 0.75) / 500;

    return {
      primary: this.formatWithSiPrefix(rawTokens, 'tokens', 1),
      technical: this.formatWithHumanPrefix(pagesOfText, 'pages of text', 1),
      rawValue: rawTokens,
      explanationKeys: [
        'pages_of_text.tooltip.line1',
        'pages_of_text.tooltip.line2',
        'pages_of_text.tooltip.line3',
      ],
    };
  }

  /**
   * Formats queued tokens with pages synthesis.
   *
   * @param queuedTokens - The `queued_tokens` value from API
   * @returns SynthesizedUnit
   */
  formatQueuedTokens(queuedTokens: number): SynthesizedUnit {
    const pagesOfText = (queuedTokens * 0.75) / 500;

    return {
      primary: this.formatWithSiPrefix(queuedTokens, 'tokens', 1),
      technical: this.formatWithHumanPrefix(pagesOfText, 'pages of text', 1),
      rawValue: queuedTokens,
      explanationKeys: [
        'pages_of_text.tooltip.line1',
        'pages_of_text.tooltip.line2',
        'pages_of_text.tooltip.line3',
      ],
    };
  }

  /**
   * Alias for formatQueuedTokens - used by homepage for consistency
   */
  formatQueuedTextWork(queuedTokens: number): SynthesizedUnit {
    return this.formatQueuedTokens(queuedTokens);
  }

  // ============================================================================
  // GENERAL FORMATTING UTILITIES
  // ============================================================================

  /**
   * Formats a large number with human-readable prefix (million, billion, etc.)
   * Use this for everyday units like "images", "requests"
   */
  formatLargeNumber(
    value: number,
    unit: string = '',
    decimals: number = 1,
  ): string {
    const prefix = this.getHumanPrefix(value);
    const scaledValue = value / prefix.threshold;

    // Use proper English: "164.7 million images" not "164.7 megaimages"
    const parts = [scaledValue.toFixed(decimals)];
    if (prefix.prefix) {
      parts.push(prefix.prefix);
    }
    if (unit) {
      parts.push(unit);
    }
    return parts.join(' ');
  }

  /**
   * Formats a large number with SI prefix (kilo, mega, giga)
   * Use this for technical units like "pixelsteps", "tokens/sec"
   */
  formatLargeNumberTechnical(
    value: number,
    unit: string = '',
    decimals: number = 1,
  ): string {
    const formatted = this.formatWithSiPrefix(value, unit, decimals);
    return formatted.formatted;
  }

  /**
   * Get the appropriate human-readable prefix for a value
   */
  private getHumanPrefix(value: number): {
    threshold: number;
    prefix: string;
    short: string;
  } {
    const absValue = Math.abs(value);
    for (const prefix of HUMAN_PREFIXES) {
      if (absValue >= prefix.threshold) {
        return prefix;
      }
    }
    return HUMAN_PREFIXES[HUMAN_PREFIXES.length - 1];
  }

  /**
   * Formats a number with commas for thousands
   */
  formatWithCommas(value: number, decimals: number = 0): string {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  // ============================================================================
  // MODEL-SPECIFIC UNIT FORMATTING (for /v2/status/models endpoint)
  // ============================================================================

  /**
   * Formats queued pixelsteps (from image model API) to megapixelsteps.
   *
   * The `/v2/status/models` endpoint returns `queued` as raw pixelsteps for image models.
   * This converts to megapixelsteps (mps) for display.
   *
   * @param queuedPixelsteps - Raw pixelsteps from the model API
   * @returns SynthesizedUnit with megapixelsteps as primary and standard images as technical
   */
  formatModelQueuedImage(queuedPixelsteps: number): SynthesizedUnit {
    // Convert raw pixelsteps to megapixelsteps
    const megapixelsteps = queuedPixelsteps / 1e6;
    // Convert to standard images (1 standard image = 20 megapixelsteps)
    const standardImages = megapixelsteps / 20;

    return {
      primary: this.formatWithSiPrefix(megapixelsteps, 'mps', 1),
      technical: this.formatWithHumanPrefix(
        standardImages,
        'standard images',
        1,
      ),
      rawValue: queuedPixelsteps,
      explanationKeys: [
        'mps.tooltip.line1',
        'mps.tooltip.line2',
        'standard_images.tooltip.line3',
      ],
    };
  }

  /**
   * Formats queued tokens (from text model API).
   *
   * The `/v2/status/models` endpoint returns `queued` as raw tokens for text models.
   *
   * @param queuedTokens - Raw tokens from the model API
   * @returns SynthesizedUnit with tokens as primary and pages as technical
   */
  formatModelQueuedText(queuedTokens: number): SynthesizedUnit {
    const pagesOfText = (queuedTokens * 0.75) / 500;

    return {
      primary: this.formatWithSiPrefix(queuedTokens, 'tokens', 1),
      technical: this.formatWithHumanPrefix(pagesOfText, 'pages of text', 1),
      rawValue: queuedTokens,
      explanationKeys: [
        'pages_of_text.tooltip.line1',
        'pages_of_text.tooltip.line2',
        'pages_of_text.tooltip.line3',
      ],
    };
  }

  /**
   * Formats image model performance rate.
   *
   * The `/v2/status/models` endpoint returns `performance` as megapixelsteps/second for image models.
   *
   * @param megapixelstepsPerSecond - Performance rate from the model API (mps/s)
   * @returns SynthesizedUnit with mps/s as primary and standard images/s as technical
   */
  formatModelPerformanceImage(
    megapixelstepsPerSecond: number,
  ): SynthesizedUnit {
    // Convert to standard images per second (1 standard image = 20 megapixelsteps)
    const standardImagesPerSecond = megapixelstepsPerSecond / 20;

    return {
      primary: {
        value: megapixelstepsPerSecond,
        prefix: '',
        prefixShort: '',
        unit: 'mps/s',
        formatted: `${megapixelstepsPerSecond.toFixed(2)} mps/s`,
        formattedShort: `${megapixelstepsPerSecond.toFixed(2)} mps/s`,
      },
      technical: this.formatWithSiPrefix(
        standardImagesPerSecond,
        'std img/s',
        2,
      ),
      rawValue: megapixelstepsPerSecond,
      explanationKeys: [
        'mps.tooltip.line1',
        'mps.tooltip.line2',
        'standard_images.tooltip.line3',
      ],
    };
  }

  /**
   * Formats text model performance rate.
   *
   * The `/v2/status/models` endpoint returns `performance` as tokens/second for text models.
   *
   * @param tokensPerSecond - Performance rate from the model API (tokens/s)
   * @returns SynthesizedUnit with tokens/s as primary and pages/s as technical
   */
  formatModelPerformanceText(tokensPerSecond: number): SynthesizedUnit {
    // Convert to pages per second
    const pagesPerSecond = (tokensPerSecond * 0.75) / 500;

    return {
      primary: this.formatWithSiPrefix(tokensPerSecond, 'tokens/s', 1),
      technical: this.formatWithSiPrefix(pagesPerSecond, 'pages/s', 3),
      rawValue: tokensPerSecond,
      explanationKeys: [
        'pages_of_text.tooltip.line1',
        'pages_of_text.tooltip.line2',
        'pages_of_text.tooltip.line3',
      ],
    };
  }
}
