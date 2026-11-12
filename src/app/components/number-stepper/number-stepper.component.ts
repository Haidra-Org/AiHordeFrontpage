import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-number-stepper',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hd-number-stepper', '(input)': 'readDraft($event)' },
  template: `
    <button
      type="button"
      class="hd-btn hd-btn--ghost hd-number-step"
      [disabled]="disabled() || currentValue() <= min()"
      [attr.aria-label]="
        'number_stepper.decrease' | transloco: { label: label(), step: step() }
      "
      (click)="nudge(-1)"
    >
      <span aria-hidden="true">&minus;</span>
    </button>
    <ng-content />
    <button
      type="button"
      class="hd-btn hd-btn--ghost hd-number-step"
      [disabled]="disabled() || currentValue() >= max()"
      [attr.aria-label]="
        'number_stepper.increase' | transloco: { label: label(), step: step() }
      "
      (click)="nudge(1)"
    >
      <span aria-hidden="true">&plus;</span>
    </button>
  `,
})
export class NumberStepperComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  public readonly value = input.required<number>();
  public readonly min = input.required<number>();
  public readonly max = input.required<number>();
  public readonly step = input.required<number>();
  public readonly label = input.required<string>();
  public readonly disabled = input(false);
  public readonly valueChange = output<number>();
  private readonly draft = signal<number | null>(null);
  public readonly currentValue = computed(() => this.draft() ?? this.value());
  private readonly resetDraft = effect(() => {
    this.value();
    this.draft.set(null);
  });

  public readDraft(event: Event): void {
    const field = event.target;
    if (field instanceof HTMLInputElement && field.type === 'number') {
      this.draft.set(
        Number.isFinite(field.valueAsNumber) ? field.valueAsNumber : null,
      );
    }
  }

  public nudge(direction: -1 | 1): void {
    if (this.disabled()) return;
    // Blur and click can share a render cycle; the field already holds the edit
    // even when the parent's value has not reached this component yet.
    const typed = this.host.nativeElement.querySelector('input')?.valueAsNumber;
    const current =
      typed !== undefined && Number.isFinite(typed) ? typed : this.value();
    if (!Number.isFinite(current)) return;
    // Decimal steps must not accumulate binary rounding errors in a saved request.
    const next = Number((current + direction * this.step()).toFixed(8));
    this.valueChange.emit(Math.max(this.min(), Math.min(this.max(), next)));
  }
}
