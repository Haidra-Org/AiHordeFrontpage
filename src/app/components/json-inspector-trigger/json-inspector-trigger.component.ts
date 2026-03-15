import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'app-json-inspector-trigger',
  template: `
    <button
      type="button"
      class="btn-json-inspector"
      [disabled]="disabled()"
      [attr.aria-label]="label()"
      [attr.title]="label()"
      (click)="onClick($event)"
    >
      <svg
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.8"
          d="M4.75 8.5L8 5.25M8 5.25L11.25 8.5M8 5.25V18.75M19.25 15.5L16 18.75M16 18.75L12.75 15.5M16 18.75V5.25"
        />
      </svg>
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
