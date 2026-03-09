import {
  Directive,
  ElementRef,
  inject,
  input,
  OnDestroy,
  afterNextRender,
  PLATFORM_ID,
  Renderer2,
} from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { TranslocoService } from '@jsverse/transloco';
import { StickyRegistryService } from '../services/sticky-registry.service';

const VIEWPORT_MARGIN = 12;
const TOOLTIP_OFFSET = 8;
const HIDE_DELAY_MS = 150;
const CLICK_CLOSE_GUARD_MS = 600;

/**
 * Adds a tap/hover/focus tooltip to any element, replacing inaccessible
 * native `[title]` attributes. The tooltip is dynamically created and
 * appended to document.body using the Popover API to escape overflow
 * containers and layer correctly above sticky headers.
 *
 * Usage:
 *   <div [appTouchTooltip]="'admin.workers.card.online'">
 */
@Directive({ selector: '[appTouchTooltip]' })
export class TouchTooltipDirective implements OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly renderer = inject(Renderer2);
  private readonly transloco = inject(TranslocoService);
  private readonly stickyRegistry = inject(StickyRegistryService);

  public readonly appTouchTooltip = input.required<string>();
  public readonly appTouchTooltipDesc = input<string>();

  private tooltipEl: HTMLElement | null = null;
  private visible = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private shownAt = 0;
  private pointerTriggered = false;
  private removeListeners: (() => void)[] = [];

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      this.setup();
    });
  }

  ngOnDestroy(): void {
    this.clearHideTimer();
    this.destroyTooltip();
    this.removeListeners.forEach((fn) => fn());
    this.removeListeners = [];
  }

  private setup(): void {
    const host = this.el.nativeElement;

    if (!host.getAttribute('tabindex')) {
      this.renderer.setAttribute(host, 'tabindex', '0');
    }
    this.renderer.setAttribute(host, 'role', 'img');
    this.renderer.setStyle(host, 'cursor', 'help');

    const listen = (event: string, handler: (e: Event) => void) => {
      const unlisten = this.renderer.listen(host, event, handler);
      this.removeListeners.push(unlisten);
    };

    listen('mouseenter', () => this.show());
    listen('mouseleave', () => this.scheduleHide());
    listen('pointerdown', () => {
      this.pointerTriggered = true;
    });
    listen('click', (e: Event) => this.handleClick(e as MouseEvent));
    listen('focusin', () => {
      if (this.pointerTriggered) return;
      this.show();
    });
    listen('focusout', () => this.scheduleHide());

    const outsideClick = this.renderer.listen(
      this.document,
      'pointerdown',
      (e: Event) => {
        if (!this.visible) return;
        const target = e.target as Node;
        if (host.contains(target)) return;
        if (this.tooltipEl?.contains(target)) return;
        this.hide();
      },
    );
    this.removeListeners.push(outsideClick);
  }

  private handleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.pointerTriggered = false;

    if (this.visible && Date.now() - this.shownAt >= CLICK_CLOSE_GUARD_MS) {
      this.hide();
    } else if (!this.visible) {
      this.show();
    }
  }

  private show(): void {
    this.clearHideTimer();
    this.visible = true;
    this.shownAt = Date.now();
    this.ensureTooltip();
    this.updateContent();

    const el = this.tooltipEl!;

    // Open the popover *before* measuring so the element is in the
    // top-layer and has a proper layout box.
    if ('showPopover' in el) {
      try {
        (el as HTMLElement & { showPopover: () => void }).showPopover();
      } catch {
        /* already open */
      }
    }

    this.positionTooltip();

    el.style.visibility = 'visible';
    el.style.opacity = '1';
    el.style.pointerEvents = 'auto';
  }

  private hide(): void {
    this.visible = false;
    this.clearHideTimer();
    if (this.tooltipEl) {
      this.tooltipEl.style.visibility = 'hidden';
      this.tooltipEl.style.opacity = '0';
      this.tooltipEl.style.pointerEvents = 'none';
      if ('hidePopover' in this.tooltipEl) {
        try {
          (
            this.tooltipEl as HTMLElement & { hidePopover: () => void }
          ).hidePopover();
        } catch {
          /* already closed */
        }
      }
    }
  }

  private scheduleHide(): void {
    this.clearHideTimer();
    this.hideTimer = setTimeout(() => this.hide(), HIDE_DELAY_MS);
  }

  private clearHideTimer(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private ensureTooltip(): void {
    if (this.tooltipEl) return;

    const el = this.document.createElement('span');
    el.className = 'touch-tooltip';
    el.setAttribute('role', 'tooltip');
    el.setAttribute('popover', 'manual');
    el.style.visibility = 'hidden';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';

    el.addEventListener('mouseenter', () => this.clearHideTimer());
    el.addEventListener('mouseleave', () => this.scheduleHide());

    this.document.body.appendChild(el);
    this.tooltipEl = el;

    const id = `touch-tooltip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    el.id = id;
    this.renderer.setAttribute(this.el.nativeElement, 'aria-describedby', id);
  }

  private updateContent(): void {
    if (!this.tooltipEl) return;
    const key = this.appTouchTooltip();
    const descKey = this.appTouchTooltipDesc();
    const title = this.transloco.translate(key);

    if (descKey) {
      const desc = this.transloco.translate(descKey);
      this.tooltipEl.innerHTML = '';
      const titleEl = this.document.createElement('strong');
      titleEl.className = 'touch-tooltip-title';
      titleEl.textContent = title;
      this.tooltipEl.appendChild(titleEl);
      const descEl = this.document.createElement('span');
      descEl.className = 'touch-tooltip-desc';
      descEl.textContent = desc;
      this.tooltipEl.appendChild(descEl);
    } else {
      this.tooltipEl.textContent = title;
    }
  }

  private positionTooltip(): void {
    if (!this.tooltipEl || !isPlatformBrowser(this.platformId)) return;

    const el = this.tooltipEl;
    const host = this.el.nativeElement;
    const triggerRect = host.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // ── Pass 1: place at origin so the browser can lay out the
    //    tooltip at its natural max-content width and we can measure it.
    el.style.top = '0';
    el.style.left = '0';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = 'none';
    // Cap width: respect the CSS --tooltip-width (300px) but never exceed viewport minus margins
    el.style.maxWidth = `min(300px, ${vw - VIEWPORT_MARGIN * 2}px)`;

    // Force synchronous layout so getBoundingClientRect is accurate
    const tooltipRect = el.getBoundingClientRect();
    const tw = tooltipRect.width;
    const th = tooltipRect.height;

    // ── Pass 2: compute final clamped position ──

    // Vertical: prefer above the trigger; fall below if not enough room
    const topObstruction = this.stickyRegistry.totalOffset();
    const spaceAbove = triggerRect.top - topObstruction;
    const spaceBelow = vh - triggerRect.bottom;
    const placeBelow =
      spaceAbove < th + VIEWPORT_MARGIN && spaceBelow > spaceAbove;

    let top: number;
    if (placeBelow) {
      top = triggerRect.bottom + TOOLTIP_OFFSET;
    } else {
      top = triggerRect.top - th - TOOLTIP_OFFSET;
    }
    // Clamp vertically so the tooltip doesn't overflow above/below viewport
    top = Math.max(
      topObstruction + VIEWPORT_MARGIN,
      Math.min(top, vh - th - VIEWPORT_MARGIN),
    );

    // Horizontal: center on the trigger, then clamp to viewport edges
    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    let left = triggerCenter - tw / 2;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - tw - VIEWPORT_MARGIN));

    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }

  private destroyTooltip(): void {
    if (this.tooltipEl) {
      this.renderer.removeAttribute(this.el.nativeElement, 'aria-describedby');
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }
  }
}
