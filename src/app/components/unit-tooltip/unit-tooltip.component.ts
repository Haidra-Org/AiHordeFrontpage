import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  OnDestroy,
  signal,
  viewChild,
  PLATFORM_ID,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { SynthesizedUnit } from '../../services/unit-conversion.service';
import { StickyRegistryService } from '../../services/sticky-registry.service';

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
const TOOLTIP_HEIGHT_ESTIMATE = 200;
const VIEWPORT_MARGIN = 16;
const TOOLTIP_OFFSET = 8;

const HIDE_DELAY_MS = 150;
const POPOVER_CLOSE_DELAY_MS = 200;
const CLICK_CLOSE_GUARD_MS = 600;

let nextTooltipId = 0;

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
  imports: [TranslocoPipe],
  template: `
    @if (unit()) {
      <span
        #wrapperEl
        class="tooltip-wrapper tooltip-fixed-mode"
        [class]="positionClasses()"
        [attr.data-tooltip-position]="position()"
        tabindex="0"
        role="button"
        [attr.aria-describedby]="tooltipId"
        (pointerdown)="handlePointerDown()"
        (click)="handleClick($event)"
        (mouseenter)="showTooltip()"
        (mouseleave)="scheduleHide()"
        (focusin)="handleFocusIn()"
        (focusout)="scheduleHide()"
      >
        <span class="dotted-underline">{{ primaryDisplay() }}</span>
        <span
          #tooltipContent
          class="tooltip-text tooltip-text-fixed surface-floating"
          role="tooltip"
          popover="manual"
          [id]="tooltipId"
          [style.position]="tooltipStyles().position"
          [style.top]="tooltipStyles().top"
          [style.bottom]="tooltipStyles().bottom"
          [style.left]="tooltipStyles().left"
          [style.right]="tooltipStyles().right"
          [style.transform]="tooltipStyles().transform"
          [style.visibility]="tooltipStyles().visibility"
          [style.opacity]="tooltipStyles().opacity"
          [style.pointerEvents]="tooltipStyles().pointerEvents"
          (mouseenter)="cancelHide()"
          (mouseleave)="scheduleHide()"
        >
          <span class="tooltip-header">
            <strong class="tooltip-highlight">{{
              tooltipBoldDisplay()
            }}</strong>
            <span class="tooltip-muted">({{ tooltipMutedDisplay() }})</span>
          </span>
          <span class="tooltip-explanation">
            @for (key of unit()!.explanationKeys; track key; let i = $index) {
              <span
                [class]="
                  i === 0 || i === 2
                    ? 'tooltip-math tooltip-explanation-line'
                    : 'tooltip-explanation-line'
                "
              >
                {{ key | transloco }}
              </span>
            }
          </span>
        </span>
      </span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnitTooltipComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly stickyRegistry = inject(StickyRegistryService);

  /** Unique ID for this tooltip instance (deterministic for SSR hydration) */
  public readonly tooltipId = `tooltip-${nextTooltipId++}`;

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

  readonly tooltipContent =
    viewChild<ElementRef<HTMLElement>>('tooltipContent');

  private readonly wrapperEl = viewChild<ElementRef<HTMLElement>>('wrapperEl');

  /** Whether the tooltip is currently visible */
  private readonly isVisible = signal(false);

  /** Automatically detected position based on viewport location */
  private readonly autoDetectedPosition = signal<string>('');

  /** Fixed positioning styles for the tooltip */
  private readonly fixedStyles = signal<Partial<TooltipStyles>>({});

  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private popoverTimer: ReturnType<typeof setTimeout> | null = null;
  private pointerTriggered = false;
  private shownAt = 0;

  constructor() {
    // Detect position after render for SSR compatibility
    afterNextRender(() => {
      this.calculateFixedPosition();
    });
  }

  ngOnDestroy(): void {
    this.clearHideTimer();
    this.clearPopoverTimer();
    this.closePopover();
  }

  /**
   * Shows the tooltip and calculates its fixed position.
   */
  public showTooltip(): void {
    this.clearHideTimer();
    this.clearPopoverTimer();
    this.isVisible.set(true);
    this.shownAt = Date.now();
    this.openPopover();
    this.calculateFixedPosition();

    if (isPlatformBrowser(this.platformId)) {
      requestAnimationFrame(() => {
        if (this.isVisible()) {
          this.calculateFixedPosition();
        }
      });
    }
  }

  public scheduleHide(): void {
    this.clearHideTimer();
    this.hideTimer = setTimeout(() => {
      this.isVisible.set(false);
      this.schedulePopoverClose();
    }, HIDE_DELAY_MS);
  }

  public cancelHide(): void {
    this.clearHideTimer();
    this.clearPopoverTimer();
  }

  public handlePointerDown(): void {
    this.pointerTriggered = true;
  }

  public handleFocusIn(): void {
    if (this.pointerTriggered) return;
    this.showTooltip();
  }

  public handleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.pointerTriggered = false;
    if (this.isVisible() && Date.now() - this.shownAt >= CLICK_CLOSE_GUARD_MS) {
      this.isVisible.set(false);
      this.schedulePopoverClose();
    } else if (!this.isVisible()) {
      this.showTooltip();
    }
  }

  private clearHideTimer(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private clearPopoverTimer(): void {
    if (this.popoverTimer !== null) {
      clearTimeout(this.popoverTimer);
      this.popoverTimer = null;
    }
  }

  private openPopover(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const el = this.tooltipContent()?.nativeElement;
    if (el && 'showPopover' in el) {
      try {
        el.showPopover();
      } catch {
        /* already open */
      }
    }
  }

  private schedulePopoverClose(): void {
    this.clearPopoverTimer();
    this.popoverTimer = setTimeout(
      () => this.closePopover(),
      POPOVER_CLOSE_DELAY_MS,
    );
  }

  private closePopover(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const el = this.tooltipContent()?.nativeElement;
    if (el && 'hidePopover' in el) {
      try {
        el.hidePopover();
      } catch {
        /* already closed */
      }
    }
  }

  /**
   * Calculates the fixed position for the tooltip using two-pass measurement.
   * Pass 1: position off-screen to measure actual rendered dimensions.
   * Pass 2: compute final clamped position using real measurements.
   */
  private calculateFixedPosition(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const wrapper = this.wrapperEl()?.nativeElement;
    if (!wrapper) return;

    const tooltipEl = this.tooltipContent()?.nativeElement;
    const rect = wrapper.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const topObstruction = this.stickyRegistry.totalOffset();

    // === MEASURE TOOLTIP DIMENSIONS ===
    // Use actual measured size when available, fall back to estimates
    let tooltipWidth = Math.min(
      TOOLTIP_WIDTH,
      viewportWidth - VIEWPORT_MARGIN * 2,
    );
    let tooltipHeight = TOOLTIP_HEIGHT_ESTIMATE;

    if (tooltipEl) {
      // Pass 1: temporarily make measurable at origin
      const prev = {
        visibility: tooltipEl.style.visibility,
        opacity: tooltipEl.style.opacity,
        pointerEvents: tooltipEl.style.pointerEvents,
        top: tooltipEl.style.top,
        left: tooltipEl.style.left,
      };
      tooltipEl.style.visibility = 'hidden';
      tooltipEl.style.opacity = '0';
      tooltipEl.style.pointerEvents = 'none';
      tooltipEl.style.top = '0';
      tooltipEl.style.left = '0';
      tooltipEl.style.maxWidth = `${Math.min(TOOLTIP_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2)}px`;

      const measured = tooltipEl.getBoundingClientRect();
      if (measured.width > 0) {
        tooltipWidth = measured.width;
      }
      if (measured.height > 0) {
        tooltipHeight = measured.height;
      }

      // Restore previous styles
      tooltipEl.style.visibility = prev.visibility;
      tooltipEl.style.opacity = prev.opacity;
      tooltipEl.style.pointerEvents = prev.pointerEvents;
      tooltipEl.style.top = prev.top;
      tooltipEl.style.left = prev.left;
      tooltipEl.style.maxWidth = '';
    }

    // === HORIZONTAL POSITIONING ===
    // Anchor to trigger edges instead of cursor-centered placement.
    // Prefer start edge (left), then end edge (right), then full-width fallback.
    const maxLeft = viewportWidth - tooltipWidth - VIEWPORT_MARGIN;
    const canAnchorStart = rect.left <= maxLeft;
    const canAnchorEnd = rect.right - tooltipWidth >= VIEWPORT_MARGIN;

    let anchoredLeft: number;
    let overflowsLeft: boolean;
    let overflowsRight: boolean;

    if (tooltipWidth >= viewportWidth - VIEWPORT_MARGIN * 2) {
      anchoredLeft = VIEWPORT_MARGIN;
      overflowsLeft = true;
      overflowsRight = true;
    } else if (canAnchorStart) {
      anchoredLeft = Math.max(VIEWPORT_MARGIN, rect.left);
      overflowsLeft = true;
      overflowsRight = false;
    } else if (canAnchorEnd) {
      anchoredLeft = Math.min(maxLeft, rect.right - tooltipWidth);
      overflowsLeft = false;
      overflowsRight = true;
    } else {
      anchoredLeft = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft));
      overflowsLeft = true;
      overflowsRight = true;
    }

    // === VERTICAL POSITIONING ===
    const minTop = topObstruction + VIEWPORT_MARGIN;
    const maxTop = viewportHeight - tooltipHeight - VIEWPORT_MARGIN;
    const preferredAboveTop = rect.top - TOOLTIP_OFFSET - tooltipHeight;
    const preferredBelowTop = rect.bottom + TOOLTIP_OFFSET;
    const canFitAbove = preferredAboveTop >= minTop;
    const canFitBelow = preferredBelowTop <= maxTop;
    const spaceAbove = rect.top - topObstruction;
    const spaceBelow = viewportHeight - rect.bottom;

    let needsBottom: boolean;
    if (canFitAbove && !canFitBelow) {
      needsBottom = false;
    } else if (!canFitAbove && canFitBelow) {
      needsBottom = true;
    } else if (canFitAbove && canFitBelow) {
      needsBottom = spaceBelow > spaceAbove;
    } else {
      // Neither side fully fits; choose side with more space, then clamp.
      needsBottom = spaceBelow >= spaceAbove;
    }

    const clampTop = (preferredTop: number): number => {
      // If sticky header + viewport leave no valid range, pin bottom inside viewport.
      if (maxTop < minTop) {
        return maxTop;
      }
      return Math.max(minTop, Math.min(preferredTop, maxTop));
    };

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

    // === CALCULATE FIXED STYLES (Pass 2: clamped) ===
    const styles: Partial<TooltipStyles> = {
      position: 'fixed',
    };

    // Vertical position with viewport clamping
    if (needsBottom) {
      const top = clampTop(preferredBelowTop);
      styles.top = `${top}px`;
      styles.bottom = null;
    } else {
      const top = clampTop(preferredAboveTop);
      styles.top = `${top}px`;
      styles.bottom = null;
    }

    // Horizontal position
    if (overflowsLeft && overflowsRight) {
      styles.left = `${VIEWPORT_MARGIN}px`;
      styles.right = `${VIEWPORT_MARGIN}px`;
      styles.transform = 'none';
    } else {
      styles.left = `${anchoredLeft}px`;
      styles.right = null;
      styles.transform = 'none';
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
