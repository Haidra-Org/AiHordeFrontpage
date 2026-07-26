import { Directive, ElementRef, effect, inject, input } from '@angular/core';
import { TutorialAnchorService } from '../services/tutorial-anchor.service';

/**
 * Marks the row or card a follow-along tutorial step can point at, publishing it
 * to {@link TutorialAnchorService} under the id given as the attribute value.
 *
 * It goes on the wrapping element rather than the input itself: a step scrolls
 * to the control *and its label*, and highlighting a bare `<input>` would ring
 * half of what the reader is being asked to look at.
 */
@Directive({
  selector: '[appTutAnchor]',
})
export class TutorialAnchorDirective {
  private readonly anchors = inject(TutorialAnchorService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  public readonly appTutAnchor = input.required<string>();

  constructor() {
    effect((onCleanup) => {
      const id = this.appTutAnchor();
      const element = this.host.nativeElement;
      this.anchors.register(id, element);
      onCleanup(() => this.anchors.deregister(id, element));
    });
  }
}
