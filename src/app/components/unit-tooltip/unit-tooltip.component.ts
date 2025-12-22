import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  PLATFORM_ID,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser, NgStyle } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { SynthesizedUnit } from '../../services/unit-conversion.service';

/**
 * Interface for fixed tooltip positioning styles.
 * Used when the tooltip needs to escape parent overflow boundaries.
 */
interface TooltipStyles {
  position: 'fixed';
  top: string | null;
  bottom: string | null;
  left: string | null;
  right: string | null;
  transform: string;
  visibility: 'visible' | 'hidden';
  opacity: string;
  pointerEvents: 'auto' | 'none';
}

/**
 * Position hints for tooltip placement.
 * Used to handle edge cases where the tooltip would overflow the viewport.
 *
 * - 'auto': Default responsive behavior with dynamic edge detection
 * - 'left': Aligns tooltip's left edge with trigger (for elements near right viewport edge)
 * - 'right': Aligns tooltip's right edge with trigger (for elements near left viewport edge)
 * - 'bottom': Shows tooltip below trigger (for elements near top of viewport)
 * - 'bottom-left': Combines bottom and left positioning
 * - 'bottom-right': Combines bottom and right positioning
 */
export type TooltipPosition =
  | 'auto'
  | 'left'
  | 'right'
  | 'bottom'
  | 'bottom-left'
  | 'bottom-right';

/**
 * Tooltip dimension constants for edge detection.
 * These values are used to calculate whether the tooltip would overflow
 * the viewport when centered on the trigger element.
 */
const TOOLTIP_WIDTH = 300;
const TOOLTIP_HEIGHT_ESTIMATE = 280;
const VIEWPORT_MARGIN = 16;
const TOOLTIP_OFFSET = 8;

/**
 * A reusable component for displaying synthesized units with tooltips.
 *
 * This component provides a consistent way to display values that have both
 * a "human friendly" synthesized unit (like "standard images") and a technical
 * underlying unit (like "megapixelsteps").
 *
 * The tooltip uses fixed positioning to escape parent overflow boundaries,
 * ensuring it's never clipped by cards or other containers.
 *
 * The tooltip automatically adapts to different viewport sizes and positions:
 * - Dynamically detects viewport edges and adjusts positioning
 * - Supports both mouse hover (desktop) and focus (keyboard/touch)
 * - Re-calculates position on each interaction to handle scrolling
 *
 * Use the `position` input to override automatic positioning for edge cases.
 *
 * @example
 * ```html
 * <app-unit-tooltip [unit]="unitConversion.formatImagePerformanceRate(value)" />
 *
 * <!-- For elements near right edge -->
 * <app-unit-tooltip [unit]="value" position="left" />
 *
 * <!-- For elements near top of page -->
 * <app-unit-tooltip [unit]="value" position="bottom" />
 * ```
 */
@Component({
  selector: 'app-unit-tooltip',
  imports: [TranslocoPipe, NgStyle],
  template: `
    @if (unit()) {
      <span
        class="tooltip-wrapper tooltip-fixed-mode"
        [class]="positionClasses()"
        [attr.data-tooltip-position]="position()"
        tabindex="0"
        role="button"
        aria-describedby="tooltip-content"
        (mouseenter)="showTooltip()"
        (mouseleave)="hideTooltip()"
        (focusin)="showTooltip()"
        (focusout)="hideTooltip()"
      >
        <span class="dotted-underline">{{ primaryDisplay() }}</span>
        <span
          class="tooltip-text tooltip-text-fixed"
          role="tooltip"
          id="tooltip-content"
          [ngStyle]="tooltipStyles()"
        >
          <strong class="tooltip-highlight">{{ tooltipBoldDisplay() }}</strong
          ><br />
          <span class="tooltip-muted">({{ tooltipMutedDisplay() }})</span
          ><br /><br />
          @for (key of unit()!.explanationKeys; track key; let i = $index) {
            @if (i === 0 || i === 2) {
              <span class="tooltip-math">{{ key | transloco }}</span>
            } @else {
              {{ key | transloco }}
            }
            @if (i < unit()!.explanationKeys.length - 1) {
              <br />
              @if (i === 0 || i === 1) {
                <br />
              }
            }
          }
        </span>
      </span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnitTooltipComponent {
  private readonly elementRef = inject(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);

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

  /**
   * Position hint for tooltip placement.
   * Use this to override automatic positioning for edge cases.
   * - 'auto': Default responsive behavior with dynamic edge detection
   * - 'left': For elements near right viewport edge
   * - 'right': For elements near left viewport edge
   * - 'bottom': For elements near top of viewport
   * - 'bottom-left', 'bottom-right': Combined positioning
   */
  public readonly position = input<TooltipPosition>('auto');

  /** Whether the tooltip is currently visible */
  private readonly isVisible = signal(false);

  /** Automatically detected position based on viewport location */
  private readonly autoDetectedPosition = signal<string>('');

  /** Fixed positioning styles for the tooltip */
  private readonly fixedStyles = signal<Partial<TooltipStyles>>({});

  constructor() {
    // Detect position after render for SSR compatibility
    afterNextRender(() => {
      this.calculateFixedPosition();
    });
  }

  /**
   * Shows the tooltip and calculates its fixed position.
   */
  public showTooltip(): void {
    this.isVisible.set(true);
    this.calculateFixedPosition();
  }

  /**
   * Hides the tooltip.
   */
  public hideTooltip(): void {
    this.isVisible.set(false);
  }

  /**
   * Calculates the fixed position for the tooltip based on the trigger's
   * location relative to the viewport. Uses position: fixed to escape
   * parent overflow boundaries.
   */
  private calculateFixedPosition(): void {
    // Guard against SSR - only run in browser
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const element = this.elementRef.nativeElement as HTMLElement;
    const wrapper = element.querySelector('.tooltip-wrapper');
    if (!wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Use responsive tooltip width based on viewport
    const tooltipWidth = Math.min(
      TOOLTIP_WIDTH,
      viewportWidth - VIEWPORT_MARGIN * 2,
    );

    // === HORIZONTAL POSITIONING ===
    const triggerCenter = rect.left + rect.width / 2;
    const tooltipLeft = triggerCenter - tooltipWidth / 2;
    const tooltipRight = triggerCenter + tooltipWidth / 2;

    // Detect horizontal overflow with margin
    const overflowsLeft = tooltipLeft < VIEWPORT_MARGIN;
    const overflowsRight = tooltipRight > viewportWidth - VIEWPORT_MARGIN;

    // === VERTICAL POSITIONING ===
    const spaceAbove = rect.top;
    const spaceBelow = viewportHeight - rect.bottom;

    // Prefer bottom positioning when not enough space above
    const needsBottom =
      spaceAbove < TOOLTIP_HEIGHT_ESTIMATE + VIEWPORT_MARGIN &&
      spaceBelow > spaceAbove;

    // === BUILD POSITION CLASSES ===
    const classes: string[] = [];
    if (needsBottom) {
      classes.push('tooltip-pos-bottom');
    }
    if (overflowsLeft && !overflowsRight) {
      classes.push('tooltip-pos-left');
    } else if (overflowsRight && !overflowsLeft) {
      classes.push('tooltip-pos-right');
    } else if (overflowsLeft && overflowsRight) {
      classes.push('tooltip-pos-left');
    }
    this.autoDetectedPosition.set(classes.join(' '));

    // === CALCULATE FIXED STYLES ===
    const styles: Partial<TooltipStyles> = {
      position: 'fixed',
    };

    // Vertical position
    if (needsBottom) {
      // Position below trigger
      styles.top = `${rect.bottom + TOOLTIP_OFFSET}px`;
      styles.bottom = null;
    } else {
      // Position above trigger
      styles.bottom = `${viewportHeight - rect.top + TOOLTIP_OFFSET}px`;
      styles.top = null;
    }

    // Horizontal position
    if (overflowsLeft && !overflowsRight) {
      // Align left edge with trigger left
      styles.left = `${Math.max(VIEWPORT_MARGIN, rect.left)}px`;
      styles.right = null;
      styles.transform = 'none';
    } else if (overflowsRight && !overflowsLeft) {
      // Align right edge with trigger right
      styles.right = `${Math.max(VIEWPORT_MARGIN, viewportWidth - rect.right)}px`;
      styles.left = null;
      styles.transform = 'none';
    } else if (overflowsLeft && overflowsRight) {
      // Very narrow viewport - center and let it fill
      styles.left = `${VIEWPORT_MARGIN}px`;
      styles.right = `${VIEWPORT_MARGIN}px`;
      styles.transform = 'none';
    } else {
      // Center on trigger
      styles.left = `${triggerCenter}px`;
      styles.right = null;
      styles.transform = 'translateX(-50%)';
    }

    this.fixedStyles.set(styles);
  }

  /**
   * Computed CSS classes for position variants (arrow positioning).
   */
  public readonly positionClasses = computed(() => {
    const pos = this.position();

    // If explicit position is set (not 'auto'), use it
    if (pos !== 'auto') {
      const classes: string[] = [];
      if (pos.includes('bottom')) {
        classes.push('tooltip-pos-bottom');
      }
      if (pos.includes('left') || pos === 'left') {
        classes.push('tooltip-pos-left');
      }
      if (pos.includes('right') || pos === 'right') {
        classes.push('tooltip-pos-right');
      }
      return classes.join(' ');
    }

    // Use auto-detected position for 'auto' mode
    return this.autoDetectedPosition();
  });

  /**
   * Computed inline styles for the fixed-position tooltip.
   */
  public readonly tooltipStyles = computed(() => {
    const visible = this.isVisible();
    const styles = this.fixedStyles();

    return {
      position: 'fixed' as const,
      top: styles.top ?? 'auto',
      bottom: styles.bottom ?? 'auto',
      left: styles.left ?? 'auto',
      right: styles.right ?? 'auto',
      transform: styles.transform ?? 'none',
      visibility: visible ? 'visible' : 'hidden',
      opacity: visible ? '1' : '0',
      pointerEvents: visible ? 'auto' : 'none',
    };
  });

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
