import { Component, input, output, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { OnChange, OnTouched } from '../../types/value-accessor';

@Component({
  selector: 'app-toggle-checkbox',
  standalone: true,
  imports: [],
  templateUrl: './toggle-checkbox.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: ToggleCheckboxComponent,
    },
  ],
})
export class ToggleCheckboxComponent implements ControlValueAccessor {
  private onChange: OnChange<boolean> = () => {};
  private onTouched: OnTouched = () => {};

  public value = signal(false);
  public disabled = signal(false);

  public description = input.required<string>();
  public random = signal(Math.random());

  public valueChanged = output<boolean>();

  public writeValue(value: boolean): void {
    this.value.set(Boolean(value));
  }

  public registerOnChange(fn: OnChange<boolean>): void {
    this.onChange = fn;
  }

  public registerOnTouched(fn: OnTouched): void {
    this.onTouched = fn;
  }

  public setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
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
