import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { OnChange, OnTouched } from '../../types/value-accessor';

@Component({
  selector: 'app-toggle-checkbox',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './toggle-checkbox.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: ToggleCheckboxComponent,
    },
  ],
})
export class ToggleCheckboxComponent implements ControlValueAccessor {
  private onChange: OnChange<boolean | null> = () => undefined;
  private onTouched: OnTouched = () => undefined;

  public value = signal<boolean | null>(null);
  public disabled = signal(false);

  public description = input.required<string>();
  public random = signal(Math.random());

  /** Enable three-state cycling: null → true → false → null. */
  public triState = input(false);

  public valueChanged = output<boolean | null>();

  public isNull = computed(() => this.value() === null);
  public isChecked = computed(() => this.value() === true);

  public writeValue(value: boolean | null): void {
    if (this.triState()) {
      this.value.set(value ?? null);
    } else {
      this.value.set(Boolean(value));
    }
  }

  public registerOnChange(fn: OnChange<boolean | null>): void {
    this.onChange = fn;
  }

  public registerOnTouched(fn: OnTouched): void {
    this.onTouched = fn;
  }

  public setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  public cycle(): void {
    if (this.disabled()) return;
    let next: boolean | null;
    if (this.triState()) {
      const cur = this.value();
      if (cur === null) next = true;
      else if (cur === true) next = false;
      else next = null;
    } else {
      next = !this.value();
    }
    this.value.set(next);
    this.onChange(next);
    this.valueChanged.emit(next);
  }

  /** Intercepts the native click so the browser never toggles the DOM checked
   * state in triState mode — keeps [checked] authoritative and avoids the
   * CSS input:checked pseudo-class conflicting with Angular's binding. */
  public onCheckboxClick(event: MouseEvent): void {
    if (!this.triState()) return;
    event.preventDefault();
    this.cycle();
  }

  public onInputChange(checked: boolean): void {
    this.value.set(checked);
    this.onChange(checked);
    this.valueChanged.emit(checked);
  }

  public onBlur(): void {
    this.onTouched();
  }
}
