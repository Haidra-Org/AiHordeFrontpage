import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/** Which style family the surface around the trigger is drawn in. */
export type JsonInspectorTriggerVariant = 'glass' | 'hd';

@Component({
  selector: 'app-json-inspector-trigger',
  imports: [IconComponent],
  template: `
    <button
      type="button"
      [class]="buttonClass()"
      [disabled]="disabled()"
      [attr.aria-label]="label()"
      [attr.title]="label()"
      (click)="onClick($event)"
    >
      <app-icon name="arrows-up-down" [class.icon-sm]="variant() === 'hd'" />
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonInspectorTriggerComponent {
  public readonly label = input('View raw JSON');
  public readonly disabled = input(false);
  /**
   * The two families are never mixed on one element, so a page on HD asks
   * for the HD weight rather than getting a glass control in an HD header.
   */
  public readonly variant = input<JsonInspectorTriggerVariant>('glass');

  public readonly triggered = output<void>();

  public readonly buttonClass = computed(() =>
    this.variant() === 'hd'
      ? 'hd-btn hd-btn--ghost hd-btn--icon'
      : 'btn-json-inspector',
  );

  public onClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.triggered.emit();
  }
}
