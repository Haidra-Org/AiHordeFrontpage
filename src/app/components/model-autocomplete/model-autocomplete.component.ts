import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  input,
  signal,
  viewChild,
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
  private readonly wrapper = viewChild<ElementRef<HTMLElement>>('wrapper');

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
  public readonly activeOptionIndex = signal(-1);

  public readonly isDisabled = signal(false);
  private dropdownPinned = false;

  public readonly listboxId = computed(() => `${this.inputId()}-listbox`);
  public readonly activeOptionId = computed(() => {
    const active = this.activeOptionIndex();
    return active >= 0 ? this.getOptionId(active) : null;
  });

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
    this.resetActiveOption();
  }

  public onFocus(): void {
    if (this.isDisabled()) {
      return;
    }

    this.dropdownOpen.set(true);
    this.resetActiveOption();
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
    if (next) {
      this.resetActiveOption();
    } else {
      this.activeOptionIndex.set(-1);
    }
  }

  public onInputKeydown(event: KeyboardEvent): void {
    if (this.isDisabled()) {
      return;
    }

    const options = this.filteredModels();
    const hasOptions = options.length > 0;

    if (event.key === 'Escape') {
      this.dropdownPinned = false;
      this.dropdownOpen.set(false);
      this.activeOptionIndex.set(-1);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.dropdownOpen()) {
        this.dropdownOpen.set(true);
      }
      if (!hasOptions) {
        this.activeOptionIndex.set(-1);
        return;
      }
      const current = this.activeOptionIndex();
      this.activeOptionIndex.set(
        current < options.length - 1 ? current + 1 : 0,
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.dropdownOpen()) {
        this.dropdownOpen.set(true);
      }
      if (!hasOptions) {
        this.activeOptionIndex.set(-1);
        return;
      }
      const current = this.activeOptionIndex();
      this.activeOptionIndex.set(
        current > 0 ? current - 1 : options.length - 1,
      );
      return;
    }

    if (event.key === 'Enter' && this.dropdownOpen()) {
      const current = this.activeOptionIndex();
      if (current >= 0 && current < options.length) {
        event.preventDefault();
        this.selectModel(options[current].name);
      }
    }
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
    this.activeOptionIndex.set(-1);
  }

  public onOptionKeydown(event: Event, name: string): void {
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
      keyEvent.preventDefault();
      this.selectModel(name);
    }
  }

  public onOptionMouseEnter(index: number): void {
    this.activeOptionIndex.set(index);
  }

  public onDocumentClick(event: MouseEvent): void {
    if (this.wrapper()?.nativeElement.contains(event.target as Node)) {
      return;
    }

    this.dropdownPinned = false;
    this.dropdownOpen.set(false);
    this.activeOptionIndex.set(-1);
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

  public getOptionId(index: number): string {
    return `${this.inputId()}-option-${index}`;
  }

  private resetActiveOption(): void {
    this.activeOptionIndex.set(this.filteredModels().length > 0 ? 0 : -1);
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
