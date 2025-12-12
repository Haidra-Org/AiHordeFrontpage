import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

/**
 * Reusable expandable section component for admin panels.
 * Provides consistent accordion-style UI with toggle functionality.
 */
@Component({
  selector: 'app-expandable-section',
  imports: [],
  template: `
    <div class="admin-border-t">
      <button (click)="toggle.emit()" class="expandable-header" type="button">
        <span class="admin-text-light">
          {{ title() }}
          @if (count() !== undefined) {
            <span class="text-sm admin-text-muted">({{ count() }})</span>
          }
        </span>
        <svg
          class="expandable-icon"
          [class.expanded]="expanded()"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      @if (expanded()) {
        <div class="p-4" [class.pt-0]="noPaddingTop()">
          <ng-content />
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpandableSectionComponent {
  /** Section title text. */
  public readonly title = input.required<string>();

  /** Whether the section is currently expanded. */
  public readonly expanded = input<boolean>(false);

  /** Optional count to display next to the title. */
  public readonly count = input<number | undefined>(undefined);

  /** Whether to remove top padding from content area. */
  public readonly noPaddingTop = input<boolean>(false);

  /** Emits when the header is clicked to toggle expansion. */
  public readonly toggle = output<void>();
}
