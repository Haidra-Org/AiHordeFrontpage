import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ActiveModel } from '../../types/active-model';

@Component({
  selector: 'app-model-autocomplete',
  imports: [TranslocoPipe],
  templateUrl: './model-autocomplete.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ModelAutocompleteComponent),
      multi: true,
    },
  ],
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class ModelAutocompleteComponent implements ControlValueAccessor {
  private readonly elRef = inject(ElementRef<HTMLElement>);

  public readonly models = input<ActiveModel[]>([]);
  public readonly inputId = input.required<string>();
  public readonly placeholderKey = input.required<string>();
  public readonly listAriaLabelKey = input.required<string>();
  public readonly toggleAriaLabelKey = input.required<string>();
  public readonly hiddenCountKey = input.required<string>();
  public readonly emptyKey = input.required<string>();
  public readonly invalid = input(false);
  public readonly allowMultiple = input(true);

  public readonly value = signal('');
  public readonly dropdownOpen = signal(false);

  public readonly isDisabled = signal(false);
  private dropdownPinned = false;

  public readonly filteredModels = computed(() => {
    const search = this.getSearchSegment(this.value()).toLowerCase();
    const all = this.models();

    if (!search) {
      return all;
    }

    return all.filter((model) => model.name.toLowerCase().includes(search));
  });

  public readonly hiddenModelCount = computed(
    () => this.models().length - this.filteredModels().length,
  );

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  public writeValue(value: string | null | undefined): void {
    this.value.set(value ?? '');
  }

  public registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  public registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  public setDisabledState(disabled: boolean): void {
    this.isDisabled.set(disabled);
  }

  public onInput(event: Event): void {
    if (this.isDisabled()) {
      return;
    }

    const target = event.target as HTMLInputElement;
    this.setValue(target.value, true);
  }

  public onFocus(): void {
    if (this.isDisabled()) {
      return;
    }

    this.dropdownOpen.set(true);
  }

  public onBlur(): void {
    this.onTouched();

    if (!this.dropdownPinned) {
      this.dropdownOpen.set(false);
    }
  }

  public toggleModelDropdown(): void {
    if (this.isDisabled()) {
      return;
    }

    const next = !this.dropdownOpen();
    this.dropdownPinned = next;
    this.dropdownOpen.set(next);
  }

  public selectModel(name: string): void {
    if (this.isDisabled()) {
      return;
    }

    if (!this.allowMultiple()) {
      this.setValue(name, true);
      this.dropdownPinned = false;
      this.dropdownOpen.set(false);
      return;
    }

    const current = this.value();
    const parts = current.split(',');
    const completed = parts
      .slice(0, -1)
      .map((part) => part.trim())
      .filter(Boolean);

    if (!completed.includes(name)) {
      completed.push(name);
    }

    this.setValue(completed.join(', '), true);
    this.dropdownPinned = false;
    this.dropdownOpen.set(false);
  }

  public onDocumentClick(event: MouseEvent): void {
    if (this.elRef.nativeElement.contains(event.target as Node)) {
      return;
    }

    this.dropdownPinned = false;
    this.dropdownOpen.set(false);
  }

  private setValue(nextValue: string, emit: boolean): void {
    this.value.set(nextValue);

    if (emit) {
      this.onChange(nextValue);
    }

    if (nextValue.length > 0 && !this.dropdownOpen()) {
      this.dropdownOpen.set(true);
    }
  }

  private getSearchSegment(rawValue: string): string {
    if (!this.allowMultiple()) {
      return rawValue.trim();
    }

    if (!rawValue.includes(',')) {
      return rawValue.trim();
    }

    return rawValue.substring(rawValue.lastIndexOf(',') + 1).trim();
  }
}
