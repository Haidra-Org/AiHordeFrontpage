import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { TextFieldModule } from '@angular/cdk/text-field';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { ModelAutocompleteComponent } from '../../../components/model-autocomplete/model-autocomplete.component';
import { ActiveModel } from '../../../types/active-model';
import { ImagePostProcessor } from '../../../types/style';
import { StyleForcedParams } from '../../../services/horde-styles.service';
import { CivitaiPickerComponent } from '../civitai-picker/civitai-picker.component';
import {
  FACE_FIXERS,
  FormLoraEntry,
  FormTiEntry,
  GenerateFormGroup,
  GenerateMode,
  MAX_BATCH,
  MAX_DIMENSION,
  MAX_FACEFIXER_STRENGTH,
  MAX_HIRES_DENOISE,
  MAX_LORA_STRENGTH,
  MAX_SEED_VARIATION,
  MIN_BATCH,
  MIN_DIMENSION,
  MIN_FACEFIXER_STRENGTH,
  MIN_HIRES_DENOISE,
  MIN_LORA_STRENGTH,
  MIN_SEED_VARIATION,
  DIMENSION_STEP,
  ModelSizeBase,
  PIXEL_WARN_THRESHOLD,
  SAMPLERS,
  STRIP_BACKGROUND,
  UPSCALERS,
  buildAspectPresets,
} from '../generate-form.model';

/** A style category paired with the style names under it, for the picker. */
export interface StylePickerGroup {
  category: string;
  names: string[];
}

/**
 * The /generate left control panel. Presentational: every control binds to the
 * parent's form group and the parent owns kudos estimation, submission,
 * persistence, and style resolution. The panel renders a Simple/Advanced
 * segmented header, a scrollable body of control cards (advanced cards are
 * hidden in simple mode), and a sticky footer with the batch stepper, live
 * dimensions/kudos readout, and the Generate button. The source-image
 * (img2img / controlnet / inpaint) controls are projected through the
 * `[generateSourceImage]` slot by the parent and only shown in advanced mode.
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
    CivitaiPickerComponent,
  ],
  templateUrl: './generate-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateFormComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  public readonly form = input.required<GenerateFormGroup>();
  public readonly models = input<ActiveModel[]>([]);
  public readonly kudos = input<number | null>(null);
  public readonly estimating = input(false);
  /** Style-forced parameters, used to flag controls a style overrides. */
  public readonly forcedParams = input<StyleForcedParams | null>(null);
  /** Curated style presets grouped by category for the styles picker. */
  public readonly styleGroups = input<StylePickerGroup[]>([]);

  public readonly create = output<void>();

  public readonly samplers = SAMPLERS;
  public readonly upscalers = UPSCALERS;
  public readonly faceFixers = FACE_FIXERS;

  public readonly minBatch = MIN_BATCH;
  public readonly maxBatch = MAX_BATCH;
  public readonly minDimension = MIN_DIMENSION;
  public readonly maxDimension = MAX_DIMENSION;
  public readonly dimensionStep = DIMENSION_STEP;
  public readonly pixelWarnThreshold = PIXEL_WARN_THRESHOLD;
  public readonly minFacefixer = MIN_FACEFIXER_STRENGTH;
  public readonly maxFacefixer = MAX_FACEFIXER_STRENGTH;
  public readonly minHiresDenoise = MIN_HIRES_DENOISE;
  public readonly maxHiresDenoise = MAX_HIRES_DENOISE;
  public readonly minSeedVariation = MIN_SEED_VARIATION;
  public readonly maxSeedVariation = MAX_SEED_VARIATION;
  public readonly minLoraStrength = MIN_LORA_STRENGTH;
  public readonly maxLoraStrength = MAX_LORA_STRENGTH;

  public readonly negativePromptOpen = signal(false);
  public readonly customSizeOpen = signal(false);
  /** Whether the CivitAI browse-and-add modal is open. */
  public readonly civitOpen = signal(false);

  /** Transloco keys for the planned-but-unavailable extras, one badge each. */
  public readonly plannedExtras = [
    'generate.form.extra_qr',
    'generate.form.extra_webhook',
    'generate.form.extra_worker_target',
    'generate.form.extra_remix',
  ];

  /** Deterministic gradient for a LoRA/TI chip, cycled by list position. */
  public addonGradient(index: number): string {
    const grads = [
      'linear-gradient(135deg,#c7d2fe,#a5b4fc)',
      'linear-gradient(135deg,#e9d5ff,#c4b5fd)',
      'linear-gradient(135deg,#bfdbfe,#93c5fd)',
      'linear-gradient(135deg,#fbcfe8,#f0abfc)',
    ];
    return grads[index % grads.length];
  }

  /** Worker count for the selected model, or null when "any model". */
  public selectedModelCount(): number | null {
    const name = this.form().controls.model.value.trim();
    if (!name) {
      return null;
    }
    const match = this.models().find((model) => model.name === name);
    return match ? match.count : null;
  }

  /**
   * Reactive mirror of the form's `mode` control. The form control is not a
   * signal, so template `@if` blocks cannot depend on it directly in this
   * zoneless app; the segmented toggle and a `mode.valueChanges` subscription
   * keep this in sync so switching modes shows/hides the advanced controls.
   */
  public readonly mode = signal<GenerateMode>('simple');
  public readonly isAdvanced = computed(() => this.mode() === 'advanced');

  /** Resolution family the aspect presets scale to (SD1.5 512 vs SDXL 1024). */
  public readonly sizeBase = signal<ModelSizeBase>(1024);
  public readonly presets = computed(() => buildAspectPresets(this.sizeBase()));

  public ngOnInit(): void {
    const modeControl = this.form().controls.mode;
    this.mode.set(modeControl.value);
    modeControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((mode) => this.mode.set(mode));
  }

  public setMode(mode: GenerateMode): void {
    const control = this.form().controls.mode;
    if (control.value !== mode) {
      control.setValue(mode);
      control.markAsDirty();
    }
  }

  public setSizeBase(base: ModelSizeBase): void {
    this.sizeBase.set(base);
  }

  public totalPixels(): number {
    const controls = this.form().controls;
    return controls.width.value * controls.height.value;
  }

  public applyPreset(width: number, height: number): void {
    this.form().patchValue({ width, height });
    this.form().controls.width.markAsDirty();
  }

  public isPresetActive(width: number, height: number): boolean {
    const controls = this.form().controls;
    return controls.width.value === width && controls.height.value === height;
  }

  public toggleNegativePrompt(): void {
    this.negativePromptOpen.update((open) => !open);
  }

  public toggleCustomSize(): void {
    this.customSizeOpen.update((open) => !open);
  }

  // --- Post-processing single-choice controls -----------------------------

  /** The upscaler currently in `post_processing`, or '' when none is selected. */
  public selectedUpscaler(): ImagePostProcessor | '' {
    return (
      this.form().controls.post_processing.value.find((processor) =>
        UPSCALERS.includes(processor),
      ) ?? ''
    );
  }

  public setUpscaler(value: ImagePostProcessor | ''): void {
    this.replaceInGroup(UPSCALERS, value === '' ? null : value);
  }

  /** The face fixer currently in `post_processing`, or '' when none. */
  public selectedFaceFixer(): ImagePostProcessor | '' {
    return (
      this.form().controls.post_processing.value.find((processor) =>
        FACE_FIXERS.includes(processor),
      ) ?? ''
    );
  }

  public setFaceFixer(value: ImagePostProcessor | ''): void {
    this.replaceInGroup(FACE_FIXERS, value === '' ? null : value);
  }

  public usesFaceFixer(): boolean {
    return this.selectedFaceFixer() !== '';
  }

  public stripBackground(): boolean {
    return this.form().controls.post_processing.value.includes(
      STRIP_BACKGROUND,
    );
  }

  public onStripBackgroundChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.replaceInGroup([STRIP_BACKGROUND], checked ? STRIP_BACKGROUND : null);
  }

  public onUpscalerChange(event: Event): void {
    this.setUpscaler(
      (event.target as HTMLSelectElement).value as ImagePostProcessor | '',
    );
  }

  public onFaceFixerChange(event: Event): void {
    this.setFaceFixer(
      (event.target as HTMLSelectElement).value as ImagePostProcessor | '',
    );
  }

  /**
   * Replace every member of `group` in `post_processing` with `value` (or remove
   * them all when `value` is null), preserving processors outside the group and
   * their relative order.
   */
  private replaceInGroup(
    group: readonly ImagePostProcessor[],
    value: ImagePostProcessor | null,
  ): void {
    const control = this.form().controls.post_processing;
    const next = control.value.filter(
      (processor) => !group.includes(processor),
    );
    if (value !== null) {
      next.push(value);
    }
    control.setValue(next);
    control.markAsDirty();
  }

  // --- Persisted LoRA / TI rows -------------------------------------------

  public loras(): FormLoraEntry[] {
    return this.form().controls.loras.value;
  }

  public tis(): FormTiEntry[] {
    return this.form().controls.tis.value;
  }

  /** Friendly display name for an addon row: its label, falling back to the id. */
  public addonLabel(entry: FormLoraEntry | FormTiEntry): string {
    return entry.label ?? entry.name;
  }

  public loraSub(lora: FormLoraEntry): string {
    return lora.inject_trigger
      ? `trigger: ${lora.inject_trigger}`
      : 'no trigger word';
  }

  public removeLora(index: number): void {
    const control = this.form().controls.loras;
    control.setValue(control.value.filter((_, i) => i !== index));
    control.markAsDirty();
  }

  public removeTi(index: number): void {
    const control = this.form().controls.tis;
    control.setValue(control.value.filter((_, i) => i !== index));
    control.markAsDirty();
  }

  /** Patch one numeric strength field of the LoRA at `index` in place. */
  public setLoraStrength(
    index: number,
    field: 'model' | 'clip',
    value: number,
  ): void {
    const control = this.form().controls.loras;
    control.setValue(
      control.value.map((lora, i) =>
        i === index ? { ...lora, [field]: value } : lora,
      ),
    );
    control.markAsDirty();
  }

  public setTiStrength(index: number, value: number): void {
    const control = this.form().controls.tis;
    control.setValue(
      control.value.map((ti, i) =>
        i === index ? { ...ti, strength: value } : ti,
      ),
    );
    control.markAsDirty();
  }

  public openCivit(): void {
    this.civitOpen.set(true);
  }

  public closeCivit(): void {
    this.civitOpen.set(false);
  }

  /** Read a range/number input's value as a float, for slider change handlers. */
  public rangeValue(event: Event): number {
    return +(event.target as HTMLInputElement).value;
  }

  // --- Seed / batch helpers -----------------------------------------------

  /** Clear the seed so the horde picks a fresh random seed for the request. */
  public clearSeed(): void {
    const control = this.form().controls.seed;
    control.setValue('');
    control.markAsDirty();
  }

  public stepBatch(delta: number): void {
    const control = this.form().controls.n;
    const next = Math.min(
      MAX_BATCH,
      Math.max(MIN_BATCH, control.value + delta),
    );
    if (next !== control.value) {
      control.setValue(next);
      control.markAsDirty();
    }
  }

  // --- Style "set by style" hints -----------------------------------------

  public styleForcesModel(): boolean {
    return this.forcedParams()?.model !== undefined;
  }

  public styleForcesDimensions(): boolean {
    const forced = this.forcedParams();
    return forced?.width !== undefined || forced?.height !== undefined;
  }

  public styleForcesSampling(): boolean {
    const forced = this.forcedParams();
    if (!forced) {
      return false;
    }
    return (
      forced.steps !== undefined ||
      forced.cfg_scale !== undefined ||
      forced.sampler_name !== undefined ||
      forced.clip_skip !== undefined ||
      forced.karras !== undefined ||
      forced.hires_fix !== undefined
    );
  }

  public onCreate(): void {
    this.create.emit();
  }
}
