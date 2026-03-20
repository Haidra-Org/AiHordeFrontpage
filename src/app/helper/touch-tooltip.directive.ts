import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  Directive,
  effect,
  inject,
  input,
  signal,
  ViewContainerRef,
} from '@angular/core';
import { ComponentPortal } from '@angular/cdk/portal';
import { TranslocoService } from '@jsverse/transloco';
import { OverlayTooltipBase } from './overlay-tooltip-base';

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
    '(mouseenter)': 'onMouseEnter()',
    '(mouseleave)': 'scheduleHide()',
    '(pointerdown)': 'onPointerDown()',
    '(click)': 'handleClick($event)',
    '(focusin)': 'onFocusIn()',
    '(focusout)': 'scheduleHide()',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
})
export class TouchTooltipDirective extends OverlayTooltipBase {
  private readonly vcr = inject(ViewContainerRef);
  private readonly transloco = inject(TranslocoService);

  public readonly appTouchTooltip = input.required<string>();
  public readonly appTouchTooltipDesc = input<string>();
  public readonly appTouchTooltipPreferBelow = input(false);
  public readonly appTouchTooltipDisabled = input(false);

  protected readonly tooltipId = signal<string | null>(null);

  private contentRef: ComponentRef<TouchTooltipContentComponent> | null = null;

  private readonly _disableEffect = effect(() => {
    if (this.appTouchTooltipDisabled()) {
      this.hide();
    }
  });

  protected onMouseEnter(): void {
    if (this.appTouchTooltipDisabled()) return;
    this.scheduleShow();
  }

  protected override handleClick(event: MouseEvent): void {
    if (this.appTouchTooltipDisabled()) return;
    super.handleClick(event);
  }

  protected override onFocusIn(): void {
    if (this.appTouchTooltipDisabled()) return;
    super.onFocusIn();
  }

  protected override show(): void {
    if (this.appTouchTooltipDisabled()) return;
    this.preferBelow = this.appTouchTooltipPreferBelow();
    super.show();
    if (this.contentRef) {
      this.updateContent();
    }
  }

  protected override onAttach(): void {
    const portal = new ComponentPortal(TouchTooltipContentComponent, this.vcr);
    this.contentRef = this.overlayRef!.attach(portal);
    const id = `touch-tooltip-${nextTooltipId++}`;
    (this.contentRef.location.nativeElement as HTMLElement).id = id;
    this.tooltipId.set(id);
    this.updateContent();
  }

  protected override onDetach(): void {
    this.contentRef = null;
    this.tooltipId.set(null);
  }

  private updateContent(): void {
    if (!this.contentRef) return;
    this.contentRef.setInput(
      'title',
      this.transloco.translate(this.appTouchTooltip()),
    );
    const descKey = this.appTouchTooltipDesc();
    this.contentRef.setInput(
      'desc',
      descKey ? this.transloco.translate(descKey) : undefined,
    );
  }
}
