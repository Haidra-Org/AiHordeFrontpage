import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  Directive,
  ElementRef,
  inject,
  input,
  OnDestroy,
  signal,
  ViewContainerRef,
} from '@angular/core';
import {
  Overlay,
  OverlayRef,
  FlexibleConnectedPositionStrategy,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { TranslocoService } from '@jsverse/transloco';
import { StickyRegistryService } from '../services/sticky-registry.service';

const VIEWPORT_MARGIN = 12;
const TOOLTIP_OFFSET = 8;
const HIDE_DELAY_MS = 150;
const CLICK_CLOSE_GUARD_MS = 600;

let nextTooltipId = 0;

/**
 * Tooltip content rendered inside a CDK overlay portal.
 */
@Component({
  selector: 'app-touch-tooltip-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (desc()) {
      <strong class="touch-tooltip-title">{{ title() }}</strong>
      <span class="touch-tooltip-desc">{{ desc() }}</span>
    } @else {
      {{ title() }}
    }
  `,
  host: {
    class: 'touch-tooltip surface-floating',
    role: 'tooltip',
  },
})
export class TouchTooltipContentComponent {
  readonly title = input.required<string>();
  readonly desc = input<string>();
}

/**
 * Adds a tap/hover/focus tooltip to any element, replacing inaccessible
 * native `[title]` attributes. Uses CDK Overlay for positioning and
 * DOM management.
 *
 * Usage:
 *   <div [appTouchTooltip]="'admin.workers.card.online'">
 */
@Directive({
  selector: '[appTouchTooltip]',
  host: {
    tabindex: '0',
    role: 'img',
    '[style.cursor]': '"help"',
    '[attr.aria-describedby]': 'tooltipId()',
    '(mouseenter)': 'show()',
    '(mouseleave)': 'scheduleHide()',
    '(pointerdown)': 'onPointerDown()',
    '(click)': 'handleClick($event)',
    '(focusin)': 'onFocusIn()',
    '(focusout)': 'scheduleHide()',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
})
export class TouchTooltipDirective implements OnDestroy {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly transloco = inject(TranslocoService);
  private readonly stickyRegistry = inject(StickyRegistryService);

  public readonly appTouchTooltip = input.required<string>();
  public readonly appTouchTooltipDesc = input<string>();

  protected readonly tooltipId = signal<string | null>(null);

  private overlayRef: OverlayRef | null = null;
  private contentRef: ComponentRef<TouchTooltipContentComponent> | null = null;
  private visible = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private shownAt = 0;
  private pointerTriggered = false;

  ngOnDestroy(): void {
    this.clearHideTimer();
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.contentRef = null;
  }

  protected show(): void {
    this.clearHideTimer();

    if (!this.overlayRef) {
      this.overlayRef = this.createOverlay();
      this.setupOverlayEvents();
    }

    // Adjust viewport margin to account for sticky header
    const stickyOffset = this.stickyRegistry.totalOffset();
    (
      this.overlayRef.getConfig()
        .positionStrategy as FlexibleConnectedPositionStrategy
    ).withViewportMargin(Math.max(VIEWPORT_MARGIN, stickyOffset));

    if (!this.overlayRef.hasAttached()) {
      const portal = new ComponentPortal(
        TouchTooltipContentComponent,
        this.vcr,
      );
      this.contentRef = this.overlayRef.attach(portal);
      const id = `touch-tooltip-${nextTooltipId++}`;
      (this.contentRef.location.nativeElement as HTMLElement).id = id;
      this.tooltipId.set(id);
    }

    const title = this.transloco.translate(this.appTouchTooltip());
    this.contentRef!.setInput('title', title);
    const descKey = this.appTouchTooltipDesc();
    this.contentRef!.setInput(
      'desc',
      descKey ? this.transloco.translate(descKey) : undefined,
    );

    this.overlayRef.updatePosition();
    this.visible = true;
    this.shownAt = Date.now();
  }

  protected hide(): void {
    this.visible = false;
    this.clearHideTimer();
    if (this.overlayRef?.hasAttached()) {
      this.overlayRef.detach();
      this.contentRef = null;
      this.tooltipId.set(null);
    }
  }

  protected scheduleHide(): void {
    this.clearHideTimer();
    this.hideTimer = setTimeout(() => this.hide(), HIDE_DELAY_MS);
  }

  protected onPointerDown(): void {
    this.pointerTriggered = true;
  }

  protected handleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.pointerTriggered = false;

    if (this.visible && Date.now() - this.shownAt >= CLICK_CLOSE_GUARD_MS) {
      this.hide();
    } else if (!this.visible) {
      this.show();
    }
  }

  protected onFocusIn(): void {
    if (this.pointerTriggered) return;
    this.show();
  }

  protected onDocumentPointerDown(event: Event): void {
    if (!this.visible) return;
    const target = event.target as Node;
    const hostEl = this.elementRef.nativeElement;
    if (hostEl.contains(target)) return;
    if (this.overlayRef?.overlayElement?.contains(target)) return;
    this.hide();
  }

  private clearHideTimer(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private createOverlay(): OverlayRef {
    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(this.elementRef)
      .withPositions([
        {
          originX: 'center',
          originY: 'top',
          overlayX: 'center',
          overlayY: 'bottom',
          offsetY: -TOOLTIP_OFFSET,
        },
        {
          originX: 'center',
          originY: 'bottom',
          overlayX: 'center',
          overlayY: 'top',
          offsetY: TOOLTIP_OFFSET,
        },
      ])
      .withViewportMargin(VIEWPORT_MARGIN)
      .withPush(true);

    return this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
    });
  }

  private setupOverlayEvents(): void {
    if (!this.overlayRef) return;
    const pane = this.overlayRef.overlayElement;
    pane.addEventListener('mouseenter', () => this.clearHideTimer());
    pane.addEventListener('mouseleave', () => this.scheduleHide());
  }
}
