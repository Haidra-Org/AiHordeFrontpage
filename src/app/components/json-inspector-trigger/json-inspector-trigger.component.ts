import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-json-inspector-trigger',
  imports: [IconComponent],
  template: `
    <button
      type="button"
      class="btn-json-inspector"
      [disabled]="disabled()"
      [attr.aria-label]="label()"
      [attr.title]="label()"
      (click)="onClick($event)"
    >
      <app-icon name="arrows-up-down" />
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonInspectorTriggerComponent {
  public readonly label = input('View raw JSON');
  public readonly disabled = input(false);

  public readonly triggered = output<void>();

  public onClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.triggered.emit();
  }
}
