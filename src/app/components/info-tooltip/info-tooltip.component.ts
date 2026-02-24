import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  OnDestroy,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { GlossaryService } from '../../services/glossary.service';
import { TooltipPosition } from '../unit-tooltip/unit-tooltip.component';

const TOOLTIP_WIDTH = 280;
const TOOLTIP_HEIGHT_ESTIMATE = 120;
const VIEWPORT_MARGIN = 16;
const TOOLTIP_OFFSET = 8;
const HIDE_DELAY_MS = 150;
const POPOVER_CLOSE_DELAY_MS = 200;
const CLICK_CLOSE_GUARD_MS = 600;

interface TooltipStyles {
  position: 'fixed';
  top: string | null;
  bottom: string | null;
  left: string | null;
  right: string | null;
  transform: string;
}

@Component({
  selector: 'app-info-tooltip',
  imports: [TranslocoPipe],
  template: `
    <span
      class="info-tooltip-trigger tooltip-wrapper tooltip-fixed-mode"
      [class]="positionClasses()"
      tabindex="0"
      [attr.aria-describedby]="tooltipId()"
      (pointerdown)="handlePointerDown()"
      (click)="handleClick($event)"
      (mouseenter)="showTooltip()"
      (mouseleave)="scheduleHide()"
      (focusin)="handleFocusIn()"
      (focusout)="scheduleHide()"
    >
      <svg
        class="info-tooltip-icon"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span
        #tooltipContent
        class="tooltip-text tooltip-text-fixed"
        role="tooltip"
        popover="manual"
        [id]="tooltipId()"
        [style]="tooltipStyles()"
        (mouseenter)="cancelHide()"
        (mouseleave)="scheduleHide()"
      >
        @if (labelKey()) {
          <strong class="tooltip-highlight">{{
            labelKey()! | transloco
          }}</strong
          ><br />
        }
        <span>{{ termKey() | transloco }}</span>
        @if (glossaryId()) {
          <br /><button
            type="button"
            class="info-tooltip-glossary-link"
            (mousedown)="openGlossary($event)"
          >
            {{ 'help.learn_more' | transloco }}
          </button>
        }
      </span>
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfoTooltipComponent implements OnDestroy {
  private readonly elementRef = inject(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly glossary = inject(GlossaryService);

  /** i18n key for the tooltip body text */
  public readonly termKey = input.required<string>();

  /** Optional i18n key for a bold title line */
  public readonly labelKey = input<string | undefined>(undefined);

  /** Optional glossary term ID to link to */
  public readonly glossaryId = input<string | undefined>(undefined);

  /** Position hint for tooltip placement */
  public readonly position = input<TooltipPosition>('auto');

  private static nextId = 0;
  private readonly instanceId = InfoTooltipComponent.nextId++;

  public readonly tooltipId = computed(() => `info-tooltip-${this.instanceId}`);

  readonly tooltipContent =
    viewChild<ElementRef<HTMLElement>>('tooltipContent');

  private readonly isVisible = signal(false);
  private readonly autoDetectedPosition = signal('');
  private readonly fixedStyles = signal<Partial<TooltipStyles>>({});
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private popoverTimer: ReturnType<typeof setTimeout> | null = null;
  private pointerTriggered = false;
  private shownAt = 0;

  constructor() {
    afterNextRender(() => {
      this.calculateFixedPosition();
    });
  }

  ngOnDestroy(): void {
    this.clearHideTimer();
    this.clearPopoverTimer();
    this.closePopover();
  }

  public showTooltip(): void {
    this.clearHideTimer();
    this.clearPopoverTimer();
    this.isVisible.set(true);
    this.shownAt = Date.now();
    this.calculateFixedPosition();
    this.openPopover();
  }

  /** Delays hiding so the user can move the cursor to the tooltip content. */
  public scheduleHide(): void {
    this.clearHideTimer();
    this.hideTimer = setTimeout(() => {
      this.isVisible.set(false);
      this.schedulePopoverClose();
    }, HIDE_DELAY_MS);
  }

  /** Cancels a pending hide (called when cursor enters the tooltip content). */
  public cancelHide(): void {
    this.clearHideTimer();
    this.clearPopoverTimer();
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
    this.popoverTimer = setTimeout(() => {
      this.closePopover();
    }, POPOVER_CLOSE_DELAY_MS);
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

  /** Flags that the next focusin was caused by a pointer so handleFocusIn can skip it. */
  public handlePointerDown(): void {
    this.pointerTriggered = true;
  }

  /** Shows tooltip on keyboard focus only; pointer-triggered focus is handled by handleClick. */
  public handleFocusIn(): void {
    if (this.pointerTriggered) return;
    this.showTooltip();
  }

  /** Toggles tooltip on click and stops event from bubbling to parent (e.g. sortable column headers). */
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

  public openGlossary(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.clearHideTimer();
    this.isVisible.set(false);
    const id = this.glossaryId();
    if (id) {
      this.glossary.open(id);
    }
  }

  private calculateFixedPosition(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const element = this.elementRef.nativeElement as HTMLElement;
    const wrapper = element.querySelector('.info-tooltip-trigger') ?? element;
    const rect = wrapper.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const tooltipWidth = Math.min(
      TOOLTIP_WIDTH,
      viewportWidth - VIEWPORT_MARGIN * 2,
    );

    const triggerCenter = rect.left + rect.width / 2;
    const tooltipLeft = triggerCenter - tooltipWidth / 2;
    const tooltipRight = triggerCenter + tooltipWidth / 2;

    const overflowsLeft = tooltipLeft < VIEWPORT_MARGIN;
    const overflowsRight = tooltipRight > viewportWidth - VIEWPORT_MARGIN;

    // Account for sticky/fixed elements at the top of the viewport
    // (e.g. nav bar, filter bar) that reduce usable space above the trigger
    const topObstruction = this.getTopObstructionBottom();
    const spaceAbove = rect.top - topObstruction;
    const spaceBelow = viewportHeight - rect.bottom;
    const needsBottom =
      spaceAbove < TOOLTIP_HEIGHT_ESTIMATE + VIEWPORT_MARGIN &&
      spaceBelow > spaceAbove;

    const classes: string[] = [];
    if (needsBottom) classes.push('tooltip-pos-bottom');
    if (overflowsLeft && !overflowsRight) classes.push('tooltip-pos-left');
    else if (overflowsRight && !overflowsLeft)
      classes.push('tooltip-pos-right');
    else if (overflowsLeft && overflowsRight) classes.push('tooltip-pos-left');
    this.autoDetectedPosition.set(classes.join(' '));

    const styles: Partial<TooltipStyles> = { position: 'fixed' };

    if (needsBottom) {
      styles.top = `${rect.bottom + TOOLTIP_OFFSET}px`;
      styles.bottom = null;
    } else {
      styles.bottom = `${viewportHeight - rect.top + TOOLTIP_OFFSET}px`;
      styles.top = null;
    }

    if (overflowsLeft && !overflowsRight) {
      styles.left = `${Math.max(VIEWPORT_MARGIN, rect.left)}px`;
      styles.right = null;
      styles.transform = 'none';
    } else if (overflowsRight && !overflowsLeft) {
      styles.right = `${Math.max(VIEWPORT_MARGIN, viewportWidth - rect.right)}px`;
      styles.left = null;
      styles.transform = 'none';
    } else if (overflowsLeft && overflowsRight) {
      styles.left = `${VIEWPORT_MARGIN}px`;
      styles.right = `${VIEWPORT_MARGIN}px`;
      styles.transform = 'none';
    } else {
      styles.left = `${triggerCenter}px`;
      styles.right = null;
      styles.transform = 'translateX(-50%)';
    }

    this.fixedStyles.set(styles);
  }

  /**
   * Finds the bottom edge of sticky/fixed elements at the top of the viewport
   * so the tooltip can avoid overlapping them.
   */
  private getTopObstructionBottom(): number {
    const candidates = document.querySelectorAll<HTMLElement>(
      '.tools-filter-bar, nav, [class*="nav-shell"]',
    );
    let maxBottom = 0;
    candidates.forEach((el) => {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') {
        const rect = el.getBoundingClientRect();
        if (rect.top < VIEWPORT_MARGIN && rect.bottom > maxBottom) {
          maxBottom = rect.bottom;
        }
      }
    });
    return maxBottom;
  }

  public readonly positionClasses = computed(() => {
    const pos = this.position();
    if (pos !== 'auto') {
      const classes: string[] = [];
      if (pos.includes('bottom')) classes.push('tooltip-pos-bottom');
      if (pos.includes('left') || pos === 'left')
        classes.push('tooltip-pos-left');
      if (pos.includes('right') || pos === 'right')
        classes.push('tooltip-pos-right');
      return classes.join(' ');
    }
    return this.autoDetectedPosition();
  });

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
      margin: '0',
      visibility: visible ? ('visible' as const) : ('hidden' as const),
      opacity: visible ? '1' : '0',
      pointerEvents: visible ? ('auto' as const) : ('none' as const),
    };
  });
}
