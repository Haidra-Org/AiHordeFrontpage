import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import {
  AbstractControl,
  FormControl,
  ReactiveFormsModule,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { ModelAutocompleteComponent } from '../../../components/model-autocomplete/model-autocomplete.component';
import { GeneratePresetsService } from '../../../services/generate-presets.service';
import { ToastService } from '../../../services/toast.service';
import { ActiveModel } from '../../../types/active-model';
import { ImagePostProcessor } from '../../../types/style';
import { StyleForcedParams } from '../../../services/horde-styles.service';
import { CivitaiPickerComponent } from '../civitai-picker/civitai-picker.component';
import { StyleBrowserComponent } from '../style-browser/style-browser.component';
import {
  FACE_FIXERS,
  FormLoraEntry,
  FormTiEntry,
  GenerateFormGroup,
  GenerateFormValue,
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
  PanelSize,
  PIXEL_WARN_THRESHOLD,
  SAMPLERS,
  STRIP_BACKGROUND,
  StyleLockSection,
  StylePickerGroup,
  UPSCALERS,
  buildAspectPresets,
  cyclePanelSize,
  detachedStyleSections,
} from '../generate-form.model';

// Re-exported for the parent page, which has always imported the picker group
// type from here; it lives in the form model so the style browser can use it
// without importing this component (which imports the browser in turn).
export type { StylePickerGroup } from '../generate-form.model';

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
    NgTemplateOutlet,
    ReactiveFormsModule,
    TranslocoPipe,
    IconComponent,
    ModelAutocompleteComponent,
    CivitaiPickerComponent,
    StyleBrowserComponent,
  ],
  templateUrl: './generate-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'onDocumentEscape()',
  },
})
export class GenerateFormComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  public readonly presetsSvc = inject(GeneratePresetsService);
  private readonly toast = inject(ToastService);

  public readonly form = input.required<GenerateFormGroup>();
  public readonly models = input<ActiveModel[]>([]);
  public readonly kudos = input<number | null>(null);
  public readonly estimating = input(false);
  /** Style-forced parameters, used to flag controls a style overrides. */
  public readonly forcedParams = input<StyleForcedParams | null>(null);
  /** Curated style presets grouped by category for the styles picker. */
  public readonly styleGroups = input<StylePickerGroup[]>([]);
  /** Current control-panel width; drives the reflow and the expand control. */
  public readonly panelSize = input<PanelSize>('normal');
  /** Whether the expand/collapse control is offered (off when embedded). */
  public readonly expandable = input(true);

  public readonly create = output<void>();
  public readonly panelSizeChange = output<PanelSize>();
  /** Ask the parent to open a preview of the request this form would submit. */
  public readonly preview = output<void>();
  /** Load a saved/recent preset back into the form (via the parent's confirm). */
  public readonly applySettings = output<GenerateFormValue>();

  /** Whether the header presets menu is open, and the pending save-as name. */
  public readonly presetsOpen = signal(false);
  public readonly saveName = signal('');
  /** The presets popover's anchor, used to detect click-away dismissals. */
  private readonly presetsRef =
    viewChild<ElementRef<HTMLElement>>('presetsContainer');
  /** The style select, so clearing the style can hand focus back to it. */
  private readonly styleSelect =
    viewChild<ElementRef<HTMLSelectElement>>('styleSelect');

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
  /** Whether the style preview browser is open. */
  public readonly styleBrowserOpen = signal(false);

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

    const controls = this.form().controls;
    controls.styleName.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onStyleNameChanged());
    // A loaded preset can carry detachments, so mirror the control itself too.
    controls.styleDetach.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncDetachedSections());
    this.syncDetachedSections();
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

  public openStyleBrowser(): void {
    this.styleBrowserOpen.set(true);
  }

  public closeStyleBrowser(): void {
    this.styleBrowserOpen.set(false);
  }

  /**
   * Clear the selected style. The catalogue select is long enough that scrolling
   * back to "None" is a chore, so this writes the control directly; going
   * through it keeps the lock/detach state resetting as it would for any manual
   * style change. Focus returns to the select the button sits beside.
   */
  public clearStyle(): void {
    const control = this.form().controls.styleName;
    if (control.value !== '') {
      control.setValue('');
      control.markAsDirty();
    }
    this.styleSelect()?.nativeElement.focus();
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

  // --- Style locks ---------------------------------------------------------

  /**
   * Sections the user has taken back from the selected style for this request,
   * mirrored from the form's `styleDetach` control: form controls are not
   * signals, so the template cannot depend on the control directly here.
   */
  public readonly detachedSections = signal<readonly StyleLockSection[]>([]);

  /**
   * Keep every style-pinned control disabled while its section is locked. The
   * submitted request is built from `getRawValue()`, so disabling changes
   * nothing about what is sent; it only stops the user editing a value the
   * style would silently override.
   */
  private readonly lockedControlSync = effect(() => {
    const forced = this.forcedParams();
    const detached = this.detachedSections();
    const controls = this.form().controls;
    const pins = (section: StyleLockSection, value: unknown): boolean =>
      value !== undefined && !detached.includes(section);
    this.setDisabled(controls.model, pins('model', forced?.model));
    this.setDisabled(controls.width, pins('dimensions', forced?.width));
    this.setDisabled(controls.height, pins('dimensions', forced?.height));
    this.setDisabled(controls.steps, pins('sampling', forced?.steps));
    this.setDisabled(controls.cfg_scale, pins('sampling', forced?.cfg_scale));
    this.setDisabled(
      controls.sampler_name,
      pins('sampling', forced?.sampler_name),
    );
    this.setDisabled(controls.clip_skip, pins('sampling', forced?.clip_skip));
    this.setDisabled(controls.karras, pins('sampling', forced?.karras));
    this.setDisabled(controls.hires_fix, pins('sampling', forced?.hires_fix));
  });

  private setDisabled(control: AbstractControl, disabled: boolean): void {
    if (control.disabled === disabled) {
      return;
    }
    // Silent: the value never changes here, so re-running the kudos estimate and
    // the style resolution would be wasted work (and would re-enter this sync).
    if (disabled) {
      control.disable({ emitEvent: false });
    } else {
      control.enable({ emitEvent: false });
    }
  }

  /** The style the form currently selects, or '' when none is selected. */
  public selectedStyleName(): string {
    return this.form().controls.styleName.value;
  }

  /** Whether the selected style pins any of `section`'s values. */
  public stylePins(section: StyleLockSection): boolean {
    const forced = this.forcedParams();
    if (!forced) {
      return false;
    }
    switch (section) {
      case 'model':
        return forced.model !== undefined;
      case 'dimensions':
        return forced.width !== undefined || forced.height !== undefined;
      case 'sampling':
        return this.styleSamplingText() !== null;
    }
  }

  public isSectionDetached(section: StyleLockSection): boolean {
    return this.detachedSections().includes(section);
  }

  /** A pinned section the user has not detached: its controls are frozen. */
  public isSectionLocked(section: StyleLockSection): boolean {
    return this.stylePins(section) && !this.isSectionDetached(section);
  }

  /**
   * Take `section` back from the style for this request. The style's own values
   * are written into the controls first so the user edits from what the style
   * chose rather than from whatever the form held before the style was picked.
   */
  public detachSection(section: StyleLockSection): void {
    this.applyStyleValues(section);
    this.setDetachedSections([...this.detachedSections(), section]);
  }

  /** Hand `section` back to the style, restoring the values it pins. */
  public reattachSection(section: StyleLockSection): void {
    this.applyStyleValues(section);
    this.setDetachedSections(
      this.detachedSections().filter((entry) => entry !== section),
    );
  }

  private setDetachedSections(sections: readonly StyleLockSection[]): void {
    const control = this.form().controls.styleDetach;
    control.setValue({
      style: this.selectedStyleName(),
      sections: [...new Set(sections)],
    });
    control.markAsDirty();
    this.syncDetachedSections();
  }

  private applyStyleValues(section: StyleLockSection): void {
    const forced = this.forcedParams();
    if (!forced) {
      return;
    }
    const controls = this.form().controls;
    const set = <T>(control: FormControl<T>, value: T | undefined): void => {
      if (value !== undefined) {
        control.setValue(value);
        control.markAsDirty();
      }
    };
    if (section === 'model') {
      set(controls.model, forced.model);
    }
    if (section === 'dimensions') {
      set(controls.width, forced.width);
      set(controls.height, forced.height);
    }
    if (section === 'sampling') {
      set(controls.steps, forced.steps);
      set(controls.cfg_scale, forced.cfg_scale);
      set(controls.sampler_name, forced.sampler_name);
      set(controls.clip_skip, forced.clip_skip);
      set(controls.karras, forced.karras);
      set(controls.hires_fix, forced.hires_fix);
    }
  }

  private syncDetachedSections(): void {
    const next = detachedStyleSections(this.form().getRawValue());
    const current = this.detachedSections();
    if (
      next.length === current.length &&
      next.every((entry, index) => entry === current[index])
    ) {
      return;
    }
    this.detachedSections.set([...next]);
  }

  /**
   * Drop detachments recorded against a style that is no longer selected, so
   * picking another style (or clearing it) always starts from its own values.
   */
  private onStyleNameChanged(): void {
    const control = this.form().controls.styleDetach;
    if (
      control.value.sections.length > 0 &&
      control.value.style !== this.selectedStyleName()
    ) {
      control.setValue({ style: '', sections: [] }, { emitEvent: false });
    }
    this.syncDetachedSections();
  }

  // --- Style "set by style" hints -----------------------------------------

  /**
   * The concrete model a selected style forces, so the hint can name it rather
   * than only flagging that a model is set (the model field keeps showing the
   * user's own pick, which is what made the forced model easy to miss).
   */
  public styleModelText(): string | null {
    return this.forcedParams()?.model ?? null;
  }

  /** The dimensions a style forces, as `W×H`, or null when it forces neither. */
  public styleDimensionsText(): string | null {
    const forced = this.forcedParams();
    if (
      !forced ||
      (forced.width === undefined && forced.height === undefined)
    ) {
      return null;
    }
    const width = forced.width ?? this.form().controls.width.value;
    const height = forced.height ?? this.form().controls.height.value;
    return `${width}×${height}`;
  }

  /** A compact summary of the sampling params a style forces, or null if none. */
  public styleSamplingText(): string | null {
    const forced = this.forcedParams();
    if (!forced) {
      return null;
    }
    const parts: string[] = [];
    if (forced.sampler_name !== undefined) parts.push(forced.sampler_name);
    if (forced.steps !== undefined) parts.push(`${forced.steps} steps`);
    if (forced.cfg_scale !== undefined) parts.push(`cfg ${forced.cfg_scale}`);
    if (forced.clip_skip !== undefined) parts.push(`clip ${forced.clip_skip}`);
    if (forced.karras !== undefined) {
      parts.push(forced.karras ? 'karras' : 'no karras');
    }
    if (forced.hires_fix !== undefined) {
      parts.push(forced.hires_fix ? 'hires fix' : 'no hires fix');
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  public onCreate(): void {
    this.create.emit();
  }

  /**
   * Ctrl/Cmd+Enter from either prompt box submits, gated on the same condition
   * as the Generate button so the shortcut can never bypass its disabled state.
   */
  public onSubmitShortcut(): void {
    if (this.form().controls.prompt.invalid) {
      return;
    }
    this.create.emit();
  }

  public onPreview(): void {
    this.preview.emit();
  }

  // --- Presets menu --------------------------------------------------------

  public togglePresets(): void {
    this.presetsOpen.update((open) => !open);
  }

  public closePresets(): void {
    this.presetsOpen.set(false);
  }

  /** Dismiss the presets popover when a press lands anywhere outside it. */
  public onDocumentPointerDown(event: PointerEvent): void {
    if (!this.presetsOpen()) {
      return;
    }
    const anchor = this.presetsRef()?.nativeElement;
    if (anchor && !anchor.contains(event.target as Node)) {
      this.closePresets();
    }
  }

  public onDocumentEscape(): void {
    if (this.presetsOpen()) {
      this.closePresets();
    }
  }

  public setSaveName(value: string): void {
    this.saveName.set(value);
  }

  public saveCurrentPreset(): void {
    const name = this.saveName().trim();
    if (!name) {
      return;
    }
    this.presetsSvc.savePreset(name, this.form().getRawValue());
    this.saveName.set('');
    this.toast.success('generate.form.preset_saved', { transloco: true });
  }

  /** Load a saved/recent preset: hand it to the parent for confirm + apply. */
  public loadPreset(value: GenerateFormValue): void {
    this.applySettings.emit(value);
    this.closePresets();
  }

  public deletePreset(id: string, event: Event): void {
    event.stopPropagation();
    this.presetsSvc.deletePreset(id);
  }

  /**
   * Step the panel one width wider, wrapping `full` back to `normal`. Backs the
   * single expand/collapse toggle in the header.
   */
  public cyclePanel(): void {
    this.panelSizeChange.emit(cyclePanelSize(this.panelSize()));
  }
}
