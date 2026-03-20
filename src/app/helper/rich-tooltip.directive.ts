import {
  Directive,
  inject,
  input,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { TemplatePortal } from '@angular/cdk/portal';
import { OverlayTooltipBase } from './overlay-tooltip-base';

/**
 * Shows rich (template-based) content in a CDK overlay on
 * hover / focus / tap — useful for interactive popovers such
 * as a scrollable model-list.
 *
 * Usage:
 *   <span [appRichTooltip]="modelsTpl">3 models</span>
 *   <ng-template #modelsTpl> … links / lists … </ng-template>
 */
@Directive({
  selector: '[appRichTooltip]',
  host: {
    tabindex: '0',
    '[attr.aria-expanded]': 'visible ? "true" : null',
    '(mouseenter)': 'show()',
    '(mouseleave)': 'scheduleHide()',
    '(pointerdown)': 'onPointerDown()',
    '(click)': 'handleClick($event)',
    '(focusin)': 'onFocusIn()',
    '(focusout)': 'scheduleHide()',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
})
export class RichTooltipDirective extends OverlayTooltipBase {
  private readonly vcr = inject(ViewContainerRef);

  public readonly appRichTooltip = input.required<TemplateRef<unknown>>();

  protected override onAttach(): void {
    const portal = new TemplatePortal(this.appRichTooltip(), this.vcr);
    this.overlayRef!.attach(portal);
  }

  protected override onDetach(): void {
    // Template cleanup handled by CDK detach
  }
}
