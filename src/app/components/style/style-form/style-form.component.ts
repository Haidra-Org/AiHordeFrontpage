import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
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
  imports: [ReactiveFormsModule, TranslocoPipe],
  templateUrl: './style-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StyleFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);

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

  /** Whether this is an image style. */
  public readonly isImageStyle = computed(() => this.styleType() === 'image');

  ngOnInit(): void {
    this.initializeForm();
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
      models: [initial?.models?.join(', ') ?? ''],
    };

    if (isImage) {
      // Image style params
      const params = (initial as ImageStyle)?.params ?? {};
      this.form = this.fb.group({
        ...baseFields,
        sharedkey: [(initial as ImageStyle)?.sharedkey ?? ''],
        // Image params
        sampler_name: [params.sampler_name ?? ''],
        cfg_scale: [params.cfg_scale ?? 7.5],
        denoising_strength: [params.denoising_strength ?? ''],
        height: [params.height ?? 512],
        width: [params.width ?? 512],
        steps: [params.steps ?? 30],
        karras: [params.karras ?? false],
        tiling: [params.tiling ?? false],
        hires_fix: [params.hires_fix ?? false],
        clip_skip: [params.clip_skip ?? ''],
        facefixer_strength: [params.facefixer_strength ?? ''],
        post_processing: [params.post_processing?.join(', ') ?? ''],
        transparent: [params.transparent ?? false],
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
        temperature: [params.temperature ?? 0.7],
        top_p: [params.top_p ?? 0.9],
        top_k: [params.top_k ?? ''],
        top_a: [params.top_a ?? ''],
        typical: [params.typical ?? ''],
        min_p: [params.min_p ?? ''],
        rep_pen: [params.rep_pen ?? 1.1],
        rep_pen_range: [params.rep_pen_range ?? ''],
        rep_pen_slope: [params.rep_pen_slope ?? ''],
        tfs: [params.tfs ?? ''],
        singleline: [params.singleline ?? false],
        frmtadsnsp: [params.frmtadsnsp ?? false],
        frmtrmblln: [params.frmtrmblln ?? false],
        frmtrmspch: [params.frmtrmspch ?? false],
        frmttriminc: [params.frmttriminc ?? false],
        use_default_badwordsids: [params.use_default_badwordsids ?? false],
        stop_sequence: [params.stop_sequence?.join(', ') ?? ''],
        smoothing_factor: [params.smoothing_factor ?? ''],
        dynatemp_range: [params.dynatemp_range ?? ''],
        dynatemp_exponent: [params.dynatemp_exponent ?? ''],
      });
    }

    // Initialize JSON content
    this.updateJsonFromForm();
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
          cfg_scale: p.cfg_scale ?? 7.5,
          denoising_strength: p.denoising_strength ?? '',
          height: p.height ?? 512,
          width: p.width ?? 512,
          steps: p.steps ?? 30,
          karras: p.karras ?? false,
          tiling: p.tiling ?? false,
          hires_fix: p.hires_fix ?? false,
          clip_skip: p.clip_skip ?? '',
          facefixer_strength: p.facefixer_strength ?? '',
          post_processing: p.post_processing?.join(', ') ?? '',
          transparent: p.transparent ?? false,
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
          temperature: p.temperature ?? 0.7,
          top_p: p.top_p ?? 0.9,
          top_k: p.top_k ?? '',
          top_a: p.top_a ?? '',
          typical: p.typical ?? '',
          min_p: p.min_p ?? '',
          rep_pen: p.rep_pen ?? 1.1,
          rep_pen_range: p.rep_pen_range ?? '',
          rep_pen_slope: p.rep_pen_slope ?? '',
          tfs: p.tfs ?? '',
          singleline: p.singleline ?? false,
          frmtadsnsp: p.frmtadsnsp ?? false,
          frmtrmblln: p.frmtrmblln ?? false,
          frmtrmspch: p.frmtrmspch ?? false,
          frmttriminc: p.frmttriminc ?? false,
          use_default_badwordsids: p.use_default_badwordsids ?? false,
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
      if (f.karras) params.karras = true;
      if (f.tiling) params.tiling = true;
      if (f.hires_fix) params.hires_fix = true;
      const clipSkip = this.parseOptionalNumber(f.clip_skip);
      if (clipSkip !== undefined) params.clip_skip = clipSkip;
      const facefixerStrength = this.parseOptionalNumber(f.facefixer_strength);
      if (facefixerStrength !== undefined)
        params.facefixer_strength = facefixerStrength;
      const postProcessing = this.parseCommaSeparated(f.post_processing);
      if (postProcessing.length > 0)
        params.post_processing =
          postProcessing as ImageStyleParams['post_processing'];
      if (f.transparent) params.transparent = true;
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
      if (f.singleline) params.singleline = true;
      if (f.frmtadsnsp) params.frmtadsnsp = true;
      if (f.frmtrmblln) params.frmtrmblln = true;
      if (f.frmtrmspch) params.frmtrmspch = true;
      if (f.frmttriminc) params.frmttriminc = true;
      if (f.use_default_badwordsids) params.use_default_badwordsids = true;
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

  public onSubmit(): void {
    if (this.showJsonView()) {
      // Parse JSON and submit
      try {
        const parsed = JSON.parse(this.jsonContent());
        this.formSubmit.emit({
          type: this.styleType(),
          payload: parsed,
        });
      } catch {
        this.jsonError.set('Invalid JSON format');
      }
    } else {
      if (this.form.valid) {
        this.formSubmit.emit({
          type: this.styleType(),
          payload: this.buildPayload(),
        });
      }
    }
  }

  public onCancel(): void {
    this.formCancel.emit();
  }
}
