import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  OnChanges,
  OnInit,
  output,
  SimpleChanges,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  ImageStyle,
  TextStyle,
  StyleType,
  ImageStyleParams,
  TextStyleParams,
} from '../../../types/style';
import {
  CreateImageStyleInput,
  CreateTextStyleInput,
  UpdateImageStyleInput,
  UpdateTextStyleInput,
} from '../../../types/style-api';
import { AiHordeService } from '../../../services/ai-horde.service';
import { ActiveModel } from '../../../types/active-model';
import { ToggleCheckboxComponent } from '../../toggle-checkbox/toggle-checkbox.component';
import { ModelAutocompleteComponent } from '../../model-autocomplete/model-autocomplete.component';

function divisibleBy64(control: AbstractControl): ValidationErrors | null {
  const v = control.value;
  if (v === null || v === '' || v === undefined) return null;
  return Number(v) % 64 === 0 ? null : { divisibleBy64: true };
}

function requiresAtLeastOneModel(
  control: AbstractControl,
): ValidationErrors | null {
  const v = control.value as string;
  if (!v || !v.trim()) return { requiresModel: true };
  const items = v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.length > 0 ? null : { requiresModel: true };
}

export type StyleFormMode = 'create' | 'edit';

export interface StyleFormSubmitEvent {
  type: StyleType;
  payload:
    | CreateImageStyleInput
    | CreateTextStyleInput
    | UpdateImageStyleInput
    | UpdateTextStyleInput;
}

@Component({
  selector: 'app-style-form',
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    ToggleCheckboxComponent,
    ModelAutocompleteComponent,
  ],
  templateUrl: './style-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StyleFormComponent implements OnInit, OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly aiHorde = inject(AiHordeService);
  private readonly destroyRef = inject(DestroyRef);

  /** Form mode: create or edit. */
  public readonly mode = input<StyleFormMode>('create');

  /** Style type: image or text. */
  public readonly styleType = input.required<StyleType>();

  /** Initial values for edit mode. */
  public readonly initialValues = input<ImageStyle | TextStyle | null>(null);

  /** Whether the form is currently submitting. */
  public readonly saving = input<boolean>(false);

  /** Emits when form is submitted. */
  public readonly formSubmit = output<StyleFormSubmitEvent>();

  /** Emits when form is cancelled. */
  public readonly formCancel = output<void>();

  /** Whether to show JSON view instead of form fields. */
  public readonly showJsonView = signal(false);

  /** Raw JSON content for JSON view. */
  public readonly jsonContent = signal('');

  /** JSON parse error if any. */
  public readonly jsonError = signal<string | null>(null);

  /** The reactive form. */
  public form!: FormGroup;
  private initialPayloadSnapshot = '';

  /** Whether this is an image style. */
  public readonly isImageStyle = computed(() => this.styleType() === 'image');

  /** All available models fetched from the API. */
  public readonly availableModels = signal<ActiveModel[]>([]);

  /** Confirm modal state. */
  public readonly confirmModalOpen = signal(false);
  public readonly pendingPayload = signal<StyleFormSubmitEvent | null>(null);
  private readonly confirmDialog =
    viewChild<ElementRef<HTMLDialogElement>>('confirmDialog');

  public readonly confirmPayloadJson = computed(() => {
    const p = this.pendingPayload();
    return p ? JSON.stringify(p.payload, null, 2) : '';
  });

  public readonly confirmPayloadEntries = computed(() => {
    const p = this.pendingPayload();
    if (!p) return [];
    const entries: { key: string; value: string }[] = [];
    for (const [key, value] of Object.entries(p.payload)) {
      if (value === undefined) continue;
      if (key === 'params' && typeof value === 'object' && value !== null) {
        for (const [pKey, pValue] of Object.entries(
          value as Record<string, unknown>,
        )) {
          entries.push({ key: pKey, value: JSON.stringify(pValue) });
        }
      } else {
        entries.push({
          key,
          value:
            typeof value === 'object' ? JSON.stringify(value) : String(value),
        });
      }
    }
    return entries;
  });

  ngOnInit(): void {
    this.initializeForm();
    this.loadModels();
    this.initialPayloadSnapshot = this.getCurrentPayloadSnapshot();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.form) {
      return;
    }

    if (changes['styleType'] || changes['initialValues']) {
      this.initializeForm();
      this.loadModels();
      this.showJsonView.set(false);
      this.jsonError.set(null);
      this.submitAttempted.set(false);
      this.pendingPayload.set(null);
      this.closeConfirmDialog();
      this.initialPayloadSnapshot = this.getCurrentPayloadSnapshot();
    }
  }

  private normalizeForSnapshot(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeForSnapshot(item));
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const normalized: Record<string, unknown> = {};

      for (const key of Object.keys(record).sort()) {
        const child = this.normalizeForSnapshot(record[key]);
        if (child === undefined) continue;
        if (Array.isArray(child) && child.length === 0) continue;
        if (
          child &&
          typeof child === 'object' &&
          !Array.isArray(child) &&
          Object.keys(child as Record<string, unknown>).length === 0
        ) {
          continue;
        }
        normalized[key] = child;
      }

      return normalized;
    }

    return value;
  }

  private getCurrentPayloadSnapshot(): string {
    if (this.showJsonView()) {
      try {
        const parsed = JSON.parse(this.jsonContent());
        return JSON.stringify(this.normalizeForSnapshot(parsed));
      } catch {
        return `__invalid_json__:${this.jsonContent().trim()}`;
      }
    }

    return JSON.stringify(this.normalizeForSnapshot(this.buildPayload()));
  }

  public hasUnsavedMeaningfulChanges(): boolean {
    return this.getCurrentPayloadSnapshot() !== this.initialPayloadSnapshot;
  }

  private loadModels(): void {
    const models$ = this.isImageStyle()
      ? this.aiHorde.getImageModels()
      : this.aiHorde.getTextModels();

    models$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((models) => {
      this.availableModels.set(
        models
          .filter((m) => m.name)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
  }

  private initializeForm(): void {
    const isImage = this.styleType() === 'image';
    const initial = this.initialValues();

    // Base form fields
    const baseFields = {
      name: [
        initial?.name ?? '',
        [
          Validators.required,
          Validators.minLength(1),
          Validators.maxLength(100),
        ],
      ],
      info: [
        initial?.info ?? '',
        [Validators.minLength(10), Validators.maxLength(1000)],
      ],
      prompt: [
        initial?.prompt ?? (isImage ? '{p}{np}' : '{p}'),
        [Validators.required],
      ],
      public: [initial?.public ?? true],
      nsfw: [initial?.nsfw ?? false],
      tags: [initial?.tags?.join(', ') ?? ''],
      models: [initial?.models?.join(', ') ?? '', [requiresAtLeastOneModel]],
    };

    if (isImage) {
      // Image style params
      const params = (initial as ImageStyle)?.params ?? {};
      this.form = this.fb.group({
        ...baseFields,
        sharedkey: [(initial as ImageStyle)?.sharedkey ?? ''],
        // Image params
        sampler_name: [params.sampler_name ?? ''],
        cfg_scale: [params.cfg_scale ?? null],
        denoising_strength: [params.denoising_strength ?? ''],
        height: [params.height ?? null, [divisibleBy64]],
        width: [params.width ?? null, [divisibleBy64]],
        steps: [params.steps ?? null],
        karras: [params.karras ?? null],
        tiling: [params.tiling ?? null],
        hires_fix: [params.hires_fix ?? null],
        clip_skip: [params.clip_skip ?? ''],
        facefixer_strength: [params.facefixer_strength ?? ''],
        post_processing: [params.post_processing?.join(', ') ?? ''],
        transparent: [params.transparent ?? null],
        loras_json: [params.loras ? JSON.stringify(params.loras, null, 2) : ''],
        tis_json: [params.tis ? JSON.stringify(params.tis, null, 2) : ''],
        workflow: [params.workflow ?? ''],
      });
    } else {
      // Text style params
      const params = (initial as TextStyle)?.params ?? {};
      this.form = this.fb.group({
        ...baseFields,
        // Text params
        temperature: [params.temperature ?? null],
        top_p: [params.top_p ?? null],
        top_k: [params.top_k ?? ''],
        top_a: [params.top_a ?? ''],
        typical: [params.typical ?? ''],
        min_p: [params.min_p ?? ''],
        rep_pen: [params.rep_pen ?? null],
        rep_pen_range: [params.rep_pen_range ?? ''],
        rep_pen_slope: [params.rep_pen_slope ?? ''],
        tfs: [params.tfs ?? ''],
        singleline: [params.singleline ?? null],
        frmtadsnsp: [params.frmtadsnsp ?? null],
        frmtrmblln: [params.frmtrmblln ?? null],
        frmtrmspch: [params.frmtrmspch ?? null],
        frmttriminc: [params.frmttriminc ?? null],
        use_default_badwordsids: [params.use_default_badwordsids ?? null],
        stop_sequence: [params.stop_sequence?.join(', ') ?? ''],
        smoothing_factor: [params.smoothing_factor ?? ''],
        dynatemp_range: [params.dynatemp_range ?? ''],
        dynatemp_exponent: [params.dynatemp_exponent ?? ''],
      });
    }

    // Initialize JSON content
    this.updateJsonFromForm();

    // Keep formInvalid signal in sync with the reactive form so computed signals react
    this.formInvalid.set(this.form.invalid);
    this.form.statusChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.formInvalid.set(this.form.invalid));
  }

  public toggleJsonView(): void {
    const newValue = !this.showJsonView();
    if (newValue) {
      // Switching to JSON view - update JSON from form
      this.updateJsonFromForm();
    } else {
      // Switching to form view - try to parse JSON
      this.updateFormFromJson();
    }
    this.showJsonView.set(newValue);
  }

  private updateJsonFromForm(): void {
    const payload = this.buildPayload();
    this.jsonContent.set(JSON.stringify(payload, null, 2));
    this.jsonError.set(null);
  }

  private updateFormFromJson(): void {
    try {
      const parsed = JSON.parse(this.jsonContent());
      this.jsonError.set(null);

      // Update form fields from parsed JSON
      if (parsed.name !== undefined)
        this.form.patchValue({ name: parsed.name });
      if (parsed.info !== undefined)
        this.form.patchValue({ info: parsed.info });
      if (parsed.prompt !== undefined)
        this.form.patchValue({ prompt: parsed.prompt });
      if (parsed.public !== undefined)
        this.form.patchValue({ public: parsed.public });
      if (parsed.nsfw !== undefined)
        this.form.patchValue({ nsfw: parsed.nsfw });
      if (parsed.tags !== undefined)
        this.form.patchValue({ tags: parsed.tags.join(', ') });
      if (parsed.models !== undefined)
        this.form.patchValue({ models: parsed.models.join(', ') });

      if (this.isImageStyle() && parsed.params) {
        const p = parsed.params as ImageStyleParams;
        this.form.patchValue({
          sampler_name: p.sampler_name ?? '',
          cfg_scale: p.cfg_scale ?? null,
          denoising_strength: p.denoising_strength ?? '',
          height: p.height ?? null,
          width: p.width ?? null,
          steps: p.steps ?? null,
          karras: p.karras ?? null,
          tiling: p.tiling ?? null,
          hires_fix: p.hires_fix ?? null,
          clip_skip: p.clip_skip ?? '',
          facefixer_strength: p.facefixer_strength ?? '',
          post_processing: p.post_processing?.join(', ') ?? '',
          transparent: p.transparent ?? null,
          loras_json: p.loras ? JSON.stringify(p.loras, null, 2) : '',
          tis_json: p.tis ? JSON.stringify(p.tis, null, 2) : '',
          workflow: p.workflow ?? '',
        });
        if (parsed.sharedkey !== undefined) {
          this.form.patchValue({ sharedkey: parsed.sharedkey });
        }
      } else if (!this.isImageStyle() && parsed.params) {
        const p = parsed.params as TextStyleParams;
        this.form.patchValue({
          temperature: p.temperature ?? null,
          top_p: p.top_p ?? null,
          top_k: p.top_k ?? '',
          top_a: p.top_a ?? '',
          typical: p.typical ?? '',
          min_p: p.min_p ?? '',
          rep_pen: p.rep_pen ?? null,
          rep_pen_range: p.rep_pen_range ?? '',
          rep_pen_slope: p.rep_pen_slope ?? '',
          tfs: p.tfs ?? '',
          singleline: p.singleline ?? null,
          frmtadsnsp: p.frmtadsnsp ?? null,
          frmtrmblln: p.frmtrmblln ?? null,
          frmtrmspch: p.frmtrmspch ?? null,
          frmttriminc: p.frmttriminc ?? null,
          use_default_badwordsids: p.use_default_badwordsids ?? null,
          stop_sequence: p.stop_sequence?.join(', ') ?? '',
          smoothing_factor: p.smoothing_factor ?? '',
          dynatemp_range: p.dynatemp_range ?? '',
          dynatemp_exponent: p.dynatemp_exponent ?? '',
        });
      }
    } catch {
      this.jsonError.set('Invalid JSON format');
    }
  }

  public onJsonInput(value: string): void {
    this.jsonContent.set(value);
    try {
      JSON.parse(value);
      this.jsonError.set(null);
    } catch {
      this.jsonError.set('Invalid JSON format');
    }
  }

  private parseCommaSeparated(value: string): string[] {
    if (!value || !value.trim()) return [];
    return value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  private parseOptionalNumber(
    value: string | number | null | undefined,
  ): number | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    const num = typeof value === 'number' ? value : parseFloat(value);
    return isNaN(num) ? undefined : num;
  }

  private buildPayload():
    | CreateImageStyleInput
    | CreateTextStyleInput
    | UpdateImageStyleInput
    | UpdateTextStyleInput {
    const f = this.form.value;
    const isImage = this.isImageStyle();

    const base = {
      name: f.name,
      info: f.info || undefined,
      prompt: f.prompt,
      public: f.public,
      nsfw: f.nsfw,
      tags: this.parseCommaSeparated(f.tags),
      models: this.parseCommaSeparated(f.models),
    };

    // Remove empty arrays
    if (base.tags.length === 0)
      delete (base as Record<string, unknown>)['tags'];
    if (base.models.length === 0)
      delete (base as Record<string, unknown>)['models'];

    if (isImage) {
      const params: ImageStyleParams = {};

      if (f.sampler_name) params.sampler_name = f.sampler_name;
      const cfgScale = this.parseOptionalNumber(f.cfg_scale);
      if (cfgScale !== undefined) params.cfg_scale = cfgScale;
      const denoisingStrength = this.parseOptionalNumber(f.denoising_strength);
      if (denoisingStrength !== undefined)
        params.denoising_strength = denoisingStrength;
      const height = this.parseOptionalNumber(f.height);
      if (height !== undefined) params.height = height;
      const width = this.parseOptionalNumber(f.width);
      if (width !== undefined) params.width = width;
      const steps = this.parseOptionalNumber(f.steps);
      if (steps !== undefined) params.steps = steps;
      if (f.karras === true) params.karras = true;
      else if (f.karras === false) params.karras = false;
      if (f.tiling === true) params.tiling = true;
      else if (f.tiling === false) params.tiling = false;
      if (f.hires_fix === true) params.hires_fix = true;
      else if (f.hires_fix === false) params.hires_fix = false;
      const clipSkip = this.parseOptionalNumber(f.clip_skip);
      if (clipSkip !== undefined) params.clip_skip = clipSkip;
      const facefixerStrength = this.parseOptionalNumber(f.facefixer_strength);
      if (facefixerStrength !== undefined)
        params.facefixer_strength = facefixerStrength;
      const postProcessing = this.parseCommaSeparated(f.post_processing);
      if (postProcessing.length > 0)
        params.post_processing =
          postProcessing as ImageStyleParams['post_processing'];
      if (f.transparent === true) params.transparent = true;
      else if (f.transparent === false) params.transparent = false;
      if (f.workflow) params.workflow = f.workflow;

      // Parse LoRAs and TIs from JSON
      if (f.loras_json) {
        try {
          params.loras = JSON.parse(f.loras_json);
        } catch {
          // Invalid JSON, skip
        }
      }
      if (f.tis_json) {
        try {
          params.tis = JSON.parse(f.tis_json);
        } catch {
          // Invalid JSON, skip
        }
      }

      const payload: CreateImageStyleInput = {
        ...base,
        params: Object.keys(params).length > 0 ? params : undefined,
        sharedkey: f.sharedkey || undefined,
      };

      return payload;
    } else {
      const params: TextStyleParams = {};

      const temperature = this.parseOptionalNumber(f.temperature);
      if (temperature !== undefined) params.temperature = temperature;
      const topP = this.parseOptionalNumber(f.top_p);
      if (topP !== undefined) params.top_p = topP;
      const topK = this.parseOptionalNumber(f.top_k);
      if (topK !== undefined) params.top_k = topK;
      const topA = this.parseOptionalNumber(f.top_a);
      if (topA !== undefined) params.top_a = topA;
      const typical = this.parseOptionalNumber(f.typical);
      if (typical !== undefined) params.typical = typical;
      const minP = this.parseOptionalNumber(f.min_p);
      if (minP !== undefined) params.min_p = minP;
      const repPen = this.parseOptionalNumber(f.rep_pen);
      if (repPen !== undefined) params.rep_pen = repPen;
      const repPenRange = this.parseOptionalNumber(f.rep_pen_range);
      if (repPenRange !== undefined) params.rep_pen_range = repPenRange;
      const repPenSlope = this.parseOptionalNumber(f.rep_pen_slope);
      if (repPenSlope !== undefined) params.rep_pen_slope = repPenSlope;
      const tfs = this.parseOptionalNumber(f.tfs);
      if (tfs !== undefined) params.tfs = tfs;
      if (f.singleline === true) params.singleline = true;
      else if (f.singleline === false) params.singleline = false;
      if (f.frmtadsnsp === true) params.frmtadsnsp = true;
      else if (f.frmtadsnsp === false) params.frmtadsnsp = false;
      if (f.frmtrmblln === true) params.frmtrmblln = true;
      else if (f.frmtrmblln === false) params.frmtrmblln = false;
      if (f.frmtrmspch === true) params.frmtrmspch = true;
      else if (f.frmtrmspch === false) params.frmtrmspch = false;
      if (f.frmttriminc === true) params.frmttriminc = true;
      else if (f.frmttriminc === false) params.frmttriminc = false;
      if (f.use_default_badwordsids === true)
        params.use_default_badwordsids = true;
      else if (f.use_default_badwordsids === false)
        params.use_default_badwordsids = false;
      const stopSequence = this.parseCommaSeparated(f.stop_sequence);
      if (stopSequence.length > 0) params.stop_sequence = stopSequence;
      const smoothingFactor = this.parseOptionalNumber(f.smoothing_factor);
      if (smoothingFactor !== undefined)
        params.smoothing_factor = smoothingFactor;
      const dynatempRange = this.parseOptionalNumber(f.dynatemp_range);
      if (dynatempRange !== undefined) params.dynatemp_range = dynatempRange;
      const dynatempExponent = this.parseOptionalNumber(f.dynatemp_exponent);
      if (dynatempExponent !== undefined)
        params.dynatemp_exponent = dynatempExponent;

      const payload: CreateTextStyleInput = {
        ...base,
        params: Object.keys(params).length > 0 ? params : undefined,
      };

      return payload;
    }
  }

  /** Whether the prompt template is missing a {p} placeholder. */
  public readonly promptMissingPlaceholder = computed(() => {
    const prompt = this.form?.controls['prompt']?.value ?? '';
    return prompt.length > 0 && !prompt.includes('{p}');
  });

  /** Set true after first failed submit attempt — drives error styling on the button. */
  public readonly submitAttempted = signal(false);

  /** Tracks form validity reactively so computed signals can respond to changes. */
  private readonly formInvalid = signal(false);

  /** True when a submit was attempted and the form is still invalid. */
  public readonly showSubmitError = computed(
    () => this.submitAttempted() && this.formInvalid(),
  );

  public onSubmit(): void {
    if (this.showJsonView()) {
      try {
        const parsed = JSON.parse(this.jsonContent());
        this.pendingPayload.set({
          type: this.styleType(),
          payload: parsed,
        });
        this.openConfirmDialog();
      } catch {
        this.jsonError.set('Invalid JSON format');
      }
    } else {
      this.form.markAllAsTouched();
      if (this.form.valid) {
        this.submitAttempted.set(false);
        this.pendingPayload.set({
          type: this.styleType(),
          payload: this.buildPayload(),
        });
        this.openConfirmDialog();
      } else {
        this.submitAttempted.set(true);
      }
    }
  }

  private openConfirmDialog(): void {
    this.confirmModalOpen.set(true);
    const dialog = this.confirmDialog()?.nativeElement;
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }

  private closeConfirmDialog(): void {
    const dialog = this.confirmDialog()?.nativeElement;
    if (dialog?.open) {
      dialog.close();
    }
    this.confirmModalOpen.set(false);
  }

  public onConfirmSubmit(): void {
    const payload = this.pendingPayload();
    if (payload) {
      this.formSubmit.emit(payload);
      this.closeConfirmDialog();
      this.pendingPayload.set(null);
    }
  }

  public onConfirmCancel(): void {
    this.closeConfirmDialog();
    this.pendingPayload.set(null);
  }

  public onCancel(): void {
    this.formCancel.emit();
  }
}
