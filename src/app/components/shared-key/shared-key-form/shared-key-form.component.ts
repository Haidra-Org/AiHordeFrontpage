import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  OnInit,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ToggleCheckboxComponent } from '../../toggle-checkbox/toggle-checkbox.component';
import {
  FINITE_FALLBACKS,
  IMAGE_PIXEL_PRESETS,
  LimitField,
  LIMIT_FIELDS,
  SharedKeyFormControls,
  SharedKeyFormGroup,
  SharedKeyFormValue,
  SHARED_KEY_DEFAULTS,
} from '../../../types/shared-key-form';
import { SharedKeyInput } from '../../../types/shared-key';

@Component({
  selector: 'app-shared-key-form',
  imports: [ReactiveFormsModule, TranslocoPipe, ToggleCheckboxComponent],
  templateUrl: './shared-key-form.component.html',
  styleUrl: './shared-key-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedKeyFormComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  /** Initial values to populate the form with. */
  public readonly initialValues =
    input<SharedKeyFormValue>(SHARED_KEY_DEFAULTS);

  /** Text for the submit button. */
  public readonly submitLabel = input<string>('Save');

  /** Text for loading state on submit button. */
  public readonly submittingLabel = input<string>('Saving...');

  /** Whether the form is currently submitting. */
  public readonly submitting = input<boolean>(false);

  /** Whether to show a cancel button. */
  public readonly showCancel = input<boolean>(false);

  /** Text for the cancel button. */
  public readonly cancelLabel = input<string>('Cancel');

  /** Emits when the form is submitted with valid data. */
  public readonly formSubmit = output<SharedKeyInput>();

  /** Emits when the cancel button is clicked. */
  public readonly formCancel = output<void>();

  public readonly form: SharedKeyFormGroup =
    this.createForm(SHARED_KEY_DEFAULTS);
  public readonly imagePixelPresets = IMAGE_PIXEL_PRESETS;

  private finiteCache: Record<LimitField, number> =
    this.createFiniteCache(SHARED_KEY_DEFAULTS);

  constructor() {
    // Re-apply initial values when they change
    effect(() => {
      const values = this.initialValues();
      this.applyFormValues(values);
    });
  }

  ngOnInit(): void {
    this.linkUnlimitedControls();
  }

  /**
   * Computes the square dimension string from a pixel count.
   * E.g., 1048576 -> "1024 x 1024"
   */
  public squareDimensionFromPixels(
    pixels: number | null | undefined,
  ): string | null {
    if (pixels === null || pixels === undefined || pixels <= 0) {
      return null;
    }
    const side = Math.round(Math.sqrt(pixels));
    return `${side} x ${side}`;
  }

  /**
   * Applies a preset pixel value to the max_image_pixels field.
   */
  public applyImagePixelsPreset(preset: number): void {
    const pixelsControl = this.form.controls.max_image_pixels;
    const unlimitedControl = this.form.controls.max_image_pixels_unlimited;
    const options = { emitEvent: false } as const;

    unlimitedControl.setValue(false, options);
    pixelsControl.enable(options);
    pixelsControl.setValue(preset, options);
    this.finiteCache.max_image_pixels = preset;

    pixelsControl.markAsDirty();
    pixelsControl.markAsTouched();
    unlimitedControl.markAsDirty();
    unlimitedControl.markAsTouched();
    this.form.updateValueAndValidity();
  }

  public onSubmit(): void {
    if (!this.form.valid) return;
    const payload = this.buildPayload();
    this.formSubmit.emit(payload);
  }

  public onCancel(): void {
    this.formCancel.emit();
  }

  public getMaxImagePixelsValue(): number | null {
    return this.form.controls.max_image_pixels.getRawValue();
  }

  public isUnlimited(field: LimitField): boolean {
    const control = this.form.controls[`${field}_unlimited`];
    return control?.value ?? false;
  }

  private createForm(initial: SharedKeyFormValue): SharedKeyFormGroup {
    return new FormGroup<SharedKeyFormControls>({
      name: new FormControl(initial.name, {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(255),
        ],
      }),
      kudos: new FormControl(initial.kudos, {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.min(-1),
          Validators.max(50_000_000),
        ],
      }),
      kudos_unlimited: new FormControl(initial.kudos_unlimited, {
        nonNullable: true,
      }),
      expiry: new FormControl(initial.expiry, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(-1)],
      }),
      expiry_unlimited: new FormControl(initial.expiry_unlimited, {
        nonNullable: true,
      }),
      max_image_pixels: new FormControl(initial.max_image_pixels, {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.min(-1),
          Validators.max(4_194_304),
        ],
      }),
      max_image_pixels_unlimited: new FormControl(
        initial.max_image_pixels_unlimited,
        {
          nonNullable: true,
        },
      ),
      max_image_steps: new FormControl(initial.max_image_steps, {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.min(-1),
          Validators.max(500),
        ],
      }),
      max_image_steps_unlimited: new FormControl(
        initial.max_image_steps_unlimited,
        {
          nonNullable: true,
        },
      ),
      max_text_tokens: new FormControl(initial.max_text_tokens, {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.min(-1),
          Validators.max(500),
        ],
      }),
      max_text_tokens_unlimited: new FormControl(
        initial.max_text_tokens_unlimited,
        {
          nonNullable: true,
        },
      ),
    });
  }

  private createFiniteCache(
    initial: SharedKeyFormValue,
  ): Record<LimitField, number> {
    return LIMIT_FIELDS.reduce(
      (acc, field) => {
        const value = initial[field];
        acc[field] = value !== -1 ? value : FINITE_FALLBACKS[field];
        return acc;
      },
      {} as Record<LimitField, number>,
    );
  }

  private seedFiniteCacheFromValues(values: SharedKeyFormValue): void {
    LIMIT_FIELDS.forEach((field) => {
      const value = values[field];
      this.finiteCache[field] =
        value !== -1
          ? value
          : (this.finiteCache[field] ?? FINITE_FALLBACKS[field]);
    });
  }

  private applyUnlimitedState(field: LimitField, isUnlimited: boolean): void {
    const limitControl = this.form.controls[field];
    const setValueOptions = { emitEvent: false } as const;

    if (isUnlimited) {
      const current = limitControl.getRawValue();
      if (typeof current === 'number' && current !== -1) {
        this.finiteCache[field] = current;
      }
      limitControl.disable(setValueOptions);
      limitControl.setValue(-1, setValueOptions);
    } else {
      const nextValue = this.finiteCache[field] ?? FINITE_FALLBACKS[field];
      limitControl.enable(setValueOptions);
      limitControl.setValue(nextValue, setValueOptions);
    }
  }

  private refreshUnlimitedStates(): void {
    LIMIT_FIELDS.forEach((field) => {
      const unlimitedControl = this.form.controls[`${field}_unlimited`];
      this.applyUnlimitedState(field, Boolean(unlimitedControl.value));
    });
  }

  private linkUnlimitedControls(): void {
    LIMIT_FIELDS.forEach((field) => {
      const limitControl = this.form.controls[field];
      const unlimitedControl = this.form.controls[`${field}_unlimited`];

      this.applyUnlimitedState(field, Boolean(unlimitedControl.value));

      unlimitedControl.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((isUnlimited) =>
          this.applyUnlimitedState(field, Boolean(isUnlimited)),
        );

      limitControl.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((value) => {
          if (limitControl.disabled) return;
          if (typeof value === 'number' && value !== -1) {
            this.finiteCache[field] = value;
          }
        });
    });
  }

  private applyFormValues(values: SharedKeyFormValue): void {
    this.form.enable({ emitEvent: false });
    this.form.setValue(values, { emitEvent: false });
    this.seedFiniteCacheFromValues(values);
    this.refreshUnlimitedStates();
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  private buildPayload(): SharedKeyInput {
    const raw = this.form.getRawValue();
    return {
      name: raw.name.trim(),
      kudos: Number(raw.kudos),
      expiry: Number(raw.expiry),
      max_image_pixels: Number(raw.max_image_pixels),
      max_image_steps: Number(raw.max_image_steps),
      max_text_tokens: Number(raw.max_text_tokens),
    };
  }
}
