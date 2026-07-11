import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { TextFieldModule } from '@angular/cdk/text-field';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { ModelAutocompleteComponent } from '../../../components/model-autocomplete/model-autocomplete.component';
import { ActiveModel } from '../../../types/active-model';
import { ImagePostProcessor } from '../../../types/style';
import {
  buildAspectPresets,
  GenerateFormGroup,
  MAX_BATCH,
  MAX_DIMENSION,
  MIN_BATCH,
  MIN_DIMENSION,
  DIMENSION_STEP,
  ModelSizeBase,
  PIXEL_WARN_THRESHOLD,
  POST_PROCESSORS,
  SAMPLERS,
} from '../generate-form.model';

/**
 * Presentational request builder. Renders every control bound to the parent's
 * form group; the parent owns the form, kudos estimation, submission, and
 * persistence. The source-image (img2img / controlnet / inpaint) controls are
 * projected through the `[generateSourceImage]` slot by the parent in a later
 * slice.
 */
@Component({
  selector: 'app-generate-form',
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    TextFieldModule,
    TranslocoPipe,
    IconComponent,
    ModelAutocompleteComponent,
  ],
  templateUrl: './generate-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateFormComponent {
  public readonly form = input.required<GenerateFormGroup>();
  public readonly models = input<ActiveModel[]>([]);
  public readonly kudos = input<number | null>(null);
  public readonly estimating = input(false);

  public readonly create = output<void>();

  public readonly samplers = SAMPLERS;
  public readonly postProcessors = POST_PROCESSORS;

  public readonly minBatch = MIN_BATCH;
  public readonly maxBatch = MAX_BATCH;
  public readonly minDimension = MIN_DIMENSION;
  public readonly maxDimension = MAX_DIMENSION;
  public readonly dimensionStep = DIMENSION_STEP;
  public readonly pixelWarnThreshold = PIXEL_WARN_THRESHOLD;

  public readonly negativePromptOpen = signal(false);

  /** Resolution family the aspect presets scale to (SD1.5 512 vs SDXL 1024). */
  public readonly sizeBase = signal<ModelSizeBase>(1024);
  public readonly presets = computed(() => buildAspectPresets(this.sizeBase()));

  public setSizeBase(base: ModelSizeBase): void {
    this.sizeBase.set(base);
  }

  public totalPixels(): number {
    const controls = this.form().controls;
    return controls.width.value * controls.height.value;
  }

  public applyPreset(width: number, height: number): void {
    this.form().patchValue({ width, height });
  }

  public isPresetActive(width: number, height: number): boolean {
    const controls = this.form().controls;
    return controls.width.value === width && controls.height.value === height;
  }

  public isPostProcessorSelected(name: ImagePostProcessor): boolean {
    return this.form().controls.post_processing.value.includes(name);
  }

  public togglePostProcessor(name: ImagePostProcessor, checked: boolean): void {
    const control = this.form().controls.post_processing;
    const current = control.value;
    const next = checked
      ? [...current, name]
      : current.filter((item) => item !== name);
    control.setValue(next);
    control.markAsDirty();
  }

  public onCheckboxChange(event: Event, name: ImagePostProcessor): void {
    this.togglePostProcessor(name, (event.target as HTMLInputElement).checked);
  }

  public toggleNegativePrompt(): void {
    this.negativePromptOpen.update((open) => !open);
  }

  public onCreate(): void {
    this.create.emit();
  }
}
