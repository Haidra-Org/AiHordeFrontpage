import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { IconRegistryService } from '../../services/icon-registry.service';

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'icon',
    '[attr.aria-hidden]': 'ariaLabel() ? null : "true"',
    '[attr.aria-label]': 'ariaLabel()',
    '[attr.role]': 'ariaLabel() ? "img" : null',
  },
  template: `<svg
    #svg
    [attr.viewBox]="viewBox()"
    fill="none"
    stroke="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  ></svg>`,
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly ariaLabel = input<string>();
  readonly viewBox = input('0 0 24 24');

  private readonly registry = inject(IconRegistryService);
  private readonly svgRef =
    viewChild.required<ElementRef<SVGSVGElement>>('svg');

  constructor() {
    // SVG innerHTML is not supported by the server-side DOM.
    // afterRenderEffect only runs on the client and re-runs when tracked signals change.
    afterRenderEffect(() => {
      const content = this.registry.get(this.name());
      const el = this.svgRef().nativeElement;
      if (!content) {
        console.warn(`[IconComponent] Unknown icon: "${this.name()}"`);
        el.innerHTML = '';
        return;
      }
      el.innerHTML = content;
    });
  }
}
