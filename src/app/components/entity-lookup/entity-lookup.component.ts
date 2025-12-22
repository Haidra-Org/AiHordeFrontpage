import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-entity-lookup',
  imports: [FormsModule, TranslocoPipe],
  template: `
    <div class="entity-lookup">
      <form (submit)="onSubmit($event)" class="entity-lookup-form">
        <div class="entity-lookup-input-wrapper">
          <label [for]="inputId" class="sr-only">{{ label() }}</label>
          <input
            [id]="inputId"
            type="text"
            class="form-input entity-lookup-input"
            [placeholder]="placeholder() | transloco"
            [(ngModel)]="searchValue"
            name="searchValue"
            [attr.aria-describedby]="hintText() ? hintId : null"
          />
          <button
            type="submit"
            class="btn btn-primary entity-lookup-button"
            [disabled]="!searchValue().trim()"
          >
            {{ 'lookup.submit' | transloco }}
          </button>
          @if (searchValue().trim() && showClearButton()) {
            <button
              type="button"
              class="btn btn-secondary entity-lookup-clear-button"
              (click)="onClear()"
            >
              {{ 'lookup.clear' | transloco }}
            </button>
          }
        </div>
        @if (hintText()) {
          <p [id]="hintId" class="form-hint entity-lookup-hint">
            {{ hintText()! | transloco }}
          </p>
        }
      </form>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntityLookupComponent {
  /** Label for screen readers. */
  public readonly label = input<string>('lookup.label');

  /** Placeholder text for the input (transloco key). */
  public readonly placeholder = input<string>('lookup.placeholder');

  /** Hint text displayed below the input (transloco key). */
  public readonly hintText = input<string | null>(null);

  /** Initial value to pre-fill the input (raw value, not transloco key). */
  public readonly initialValue = input<string | null>(null);

  /** Whether to show a clear button when there's a value. */
  public readonly showClearButton = input<boolean>(false);

  /** Emits when the user submits a search. */
  public readonly search = output<string>();

  /** Emits when the user clears the search. */
  public readonly cleared = output<void>();

  /** The current input value. */
  public readonly searchValue = signal('');

  /** Unique ID for the input element. */
  public readonly inputId = `entity-lookup-${Math.random().toString(36).substring(2, 9)}`;

  /** Unique ID for the hint element. */
  public readonly hintId = `${this.inputId}-hint`;

  constructor() {
    // Effect to sync initialValue input to searchValue signal
    effect(() => {
      const initial = this.initialValue();
      if (initial !== null && initial !== '') {
        this.searchValue.set(initial);
      }
    });
  }

  public onSubmit(event: Event): void {
    event.preventDefault();
    const value = this.searchValue().trim();
    if (value) {
      this.search.emit(value);
    }
  }

  public onClear(): void {
    this.searchValue.set('');
    this.cleared.emit();
  }
}
