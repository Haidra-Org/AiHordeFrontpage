import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SynthesizedUnit } from '../../services/unit-conversion.service';

/**
 * A reusable component for displaying synthesized units with tooltips.
 *
 * This component provides a consistent way to display values that have both
 * a "human friendly" synthesized unit (like "standard images") and a technical
 * underlying unit (like "megapixelsteps").
 *
 * Usage:
 * ```html
 * <app-unit-tooltip [unit]="unitConversion.formatImagePerformanceRate(value)" />
 * ```
 */
@Component({
  selector: 'app-unit-tooltip',
  imports: [TranslocoPipe],
  template: `
    @if (unit()) {
      <span class="tooltip-wrapper">
        <span class="dotted-underline">{{ primaryDisplay() }}</span>
        <span class="tooltip-text">
          <strong>{{ tooltipBoldDisplay() }}</strong><br />
          <span class="tooltip-muted">({{ tooltipMutedDisplay() }})</span><br /><br />
          @for (key of unit()!.explanationKeys; track key; let i = $index) {
            @if (i === 0 || i === 2) {
              <span class="math-equation">{{ key | transloco }}</span>
            } @else {
              {{ key | transloco }}
            }
            @if (i < unit()!.explanationKeys.length - 1) {
              <br />@if (i === 0 || i === 1) {<br />}
            }
          }
        </span>
      </span>
    }
  `,
  styles: `
    .tooltip-wrapper {
      position: relative;
      display: inline;
      margin-left: 0.125rem;
    }

    .dotted-underline {
      border-bottom: 1px dotted currentColor;
      cursor: help;
    }

    .tooltip-text {
      visibility: hidden;
      width: 300px;
      max-width: calc(100vw - 2rem);
      background-color: #1f2937;
      color: #fff;
      text-align: left;
      border-radius: 6px;
      padding: 10px 14px;
      position: absolute;
      z-index: 1000;
      bottom: 125%;
      left: 50%;
      transform: translateX(-50%);
      opacity: 0;
      transition: opacity 0.3s ease;
      font-size: 0.75rem;
      line-height: 1.5;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      pointer-events: none;
      white-space: normal;
    }

    @media (max-width: 640px) {
      .tooltip-text {
        left: auto;
        right: 0;
        transform: none;
        max-width: calc(100vw - 1rem);
      }

      .tooltip-text::after {
        left: auto;
        right: 1rem;
      }
    }

    .tooltip-text strong {
      color: #60a5fa;
      font-size: 0.8125rem;
    }

    .tooltip-text .math-equation {
      color: #a78bfa;
      font-family: "Courier New", Courier, monospace;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .tooltip-text .tooltip-muted {
      color: #9ca3af;
      font-size: 0.6875rem;
      font-style: italic;
    }

    .tooltip-text::after {
      content: "";
      position: absolute;
      top: 100%;
      left: 50%;
      margin-left: -5px;
      border-width: 5px;
      border-style: solid;
      border-color: #1f2937 transparent transparent transparent;
    }

    .tooltip-wrapper:hover .tooltip-text {
      visibility: visible;
      opacity: 1;
    }

    :host-context(.dark) .tooltip-text {
      background-color: #374151;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    :host-context(.dark) .tooltip-text::after {
      border-color: #374151 transparent transparent transparent;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnitTooltipComponent {
  /** The synthesized unit data to display */
  public readonly unit = input.required<SynthesizedUnit | null>();

  /** Optional override for the primary display text */
  public readonly primaryOverride = input<string | null>(null);

  /**
   * When true, swaps primary and technical displays:
   * - Dotted underline shows technical (e.g., "standard images")
   * - Tooltip shows primary (e.g., "pixelsteps")
   */
  public readonly swapDisplay = input(false);

  /** Computed primary display text (shown with dotted underline) */
  public readonly primaryDisplay = computed(() => {
    const override = this.primaryOverride();
    if (override) return override;

    const u = this.unit();
    if (!u) return '';

    // If swapped, show technical as the clickable text
    return this.swapDisplay() ? u.technical.formatted : u.primary.formatted;
  });

  /** Computed technical display text (shown in tooltip) */
  public readonly technicalDisplay = computed(() => {
    const u = this.unit();
    if (!u) return '';

    // If swapped, show primary in the tooltip
    return this.swapDisplay() ? u.primary.formatted : u.technical.formatted;
  });

  /**
   * Bold line in tooltip - shows the synthesized human-friendly value
   * For normal display: shows primary (e.g., "2.3 standard images/sec")
   * For swapped display: shows primary (e.g., "2.7 petapixelsteps")
   */
  public readonly tooltipBoldDisplay = computed(() => {
    const u = this.unit();
    if (!u) return '';

    // When swapped, the tooltip explains the synthesized unit (which is in technical)
    // So bold should show technical (the synthesized value like "134.9 million standard images")
    // And muted should show primary (the native SI value like "2.7 petapixelsteps")
    return this.swapDisplay() ? u.technical.formatted : u.primary.formatted;
  });

  /**
   * Muted/italic line in tooltip - shows the native SI-prefixed unit
   * This helps users understand the SI prefix system (mega, giga, etc.)
   */
  public readonly tooltipMutedDisplay = computed(() => {
    const u = this.unit();
    if (!u) return '';

    // Always show the technical (native SI) value in the muted line
    // For normal: technical is the SI value (megapixelsteps/sec)
    // For swapped: primary is the SI value (petapixelsteps)
    return this.swapDisplay() ? u.primary.formatted : u.technical.formatted;
  });
}
