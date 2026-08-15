import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { GsHelpComponent } from '../../../components/gs-help/gs-help.component';
import { TutorialAnchorDirective } from '../../../directives/tutorial-anchor.directive';
import { ImageControlType } from '../../../types/generation';
import { MAX_EXTRA_SOURCE_IMAGES } from '../../../types/generation-job';
import {
  CONTROL_TYPES,
  DEFAULT_EXTRA_SOURCE_STRENGTH,
  DENOISE_STEP,
  EXTRA_SOURCE_STRENGTH_STEP,
  GenerateFormGroup,
  GenerateSourceMode,
  MAX_DENOISE,
  MAX_EXTRA_SOURCE_STRENGTH,
  MIN_DENOISE,
  MIN_EXTRA_SOURCE_STRENGTH,
  SOURCE_MODES,
  rangeFillPercent,
} from '../generate-form.model';
import type { FeatureCompatRuleId, RequestWarning } from '../request-lint';
import {
  SourceImage,
  blobToSourceImage,
  exportMaskFromPaintLayer,
  fileToSourceImage,
} from '../../../helper/source-image';

/** One remix extra source image, in the order it is submitted. */
export interface GenerateSourceExtra {
  blob: Blob;
  strength: number;
}

/**
 * Snapshot the parent page needs to gate Create and hand blobs to the queue.
 * `sourceBlob`/`maskBlob` are the raw blobs (webp source, png mask); `extras`
 * carries the remix blend inputs; `valid` summarises whether the current mode
 * has everything it needs.
 */
export interface GenerateSourceState {
  mode: GenerateSourceMode;
  sourceBlob: Blob | null;
  maskBlob: Blob | null;
  /**
   * Always set by this component (empty outside remix), but optional so a
   * caller can still write a source state literal without it.
   */
  extras?: GenerateSourceExtra[];
  valid: boolean;
}

/** A remix extra held locally, with the object URL its thumbnail renders from. */
interface RemixExtra {
  image: SourceImage;
  strength: number;
  previewUrl: string;
}

const DEFAULT_BRUSH = 40;
const MIN_BRUSH = 5;
const MAX_BRUSH = 200;

/**
 * The /generate source-image section, projected into the form's
 * `[generateSourceImage]` slot. Drives the img2img / controlnet / inpainting /
 * remix controls bound to the parent form, owns the uploaded source blob, the
 * remix extra images, and (for inpainting) a paint-mask canvas, and emits a
 * {@link GenerateSourceState} so the page can gate submission and enqueue the
 * blobs.
 *
 * Browser-only work (decode, canvas, object URLs) is guarded; the page is
 * RenderMode.Client but the guards keep the component inert under SSR.
 */
@Component({
  selector: 'app-generate-source-image',
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    IconComponent,
    GsHelpComponent,
    TutorialAnchorDirective,
  ],
  templateUrl: './generate-source-image.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateSourceImageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  public readonly form = input.required<GenerateFormGroup>();
  /** When true, show a validation hint for whatever the current mode lacks. */
  public readonly showValidation = input(false);
  public readonly disabled = input(false);
  /**
   * Whether the selected model's baseline can serve a remix request. Null means
   * the caller has no answer (no model picked, or the model reference has not
   * loaded), in which case the mode stays offered: gating is guidance, and an
   * unknown baseline must not lock the user out of it.
   */
  public readonly remixSupported = input<boolean | null>(null);
  /**
   * This section's share of the request's warnings, evaluated by the page from
   * the shared lint table. Advisory: nothing here gates the mode or the submit.
   */
  public readonly lintWarnings = input<readonly RequestWarning[]>([]);

  public readonly stateChange = output<GenerateSourceState>();

  /** Whether a named compatibility rule is currently firing for this section. */
  public hasWarning(id: FeatureCompatRuleId): boolean {
    return this.lintWarnings().some((warning) => warning.id === id);
  }

  public readonly modes = SOURCE_MODES;
  public readonly controlTypes = CONTROL_TYPES;
  public readonly minDenoise = MIN_DENOISE;
  public readonly maxDenoise = MAX_DENOISE;
  public readonly denoiseStep = DENOISE_STEP;
  public readonly minBrush = MIN_BRUSH;
  public readonly maxBrush = MAX_BRUSH;
  public readonly maxExtras = MAX_EXTRA_SOURCE_IMAGES;
  public readonly minExtraStrength = MIN_EXTRA_SOURCE_STRENGTH;
  public readonly maxExtraStrength = MAX_EXTRA_SOURCE_STRENGTH;
  public readonly extraStrengthStep = EXTRA_SOURCE_STRENGTH_STEP;
  /** Where a slider's thumb sits, as the percentage its track fills to. */
  public readonly rangeFill = rangeFillPercent;

  public readonly sourceImage = signal<SourceImage | null>(null);
  public readonly previewUrl = signal<string | null>(null);
  public readonly encoding = signal(false);
  public readonly error = signal<string | null>(null);
  public readonly dragActive = signal(false);

  public readonly extras = signal<RemixExtra[]>([]);
  public readonly extraEncoding = signal(false);
  public readonly extraDragActive = signal(false);

  public readonly maskPainted = signal(false);
  public readonly maskBlob = signal<Blob | null>(null);
  public readonly brushSize = signal(DEFAULT_BRUSH);
  public readonly eraser = signal(false);

  private readonly paintCanvasRef =
    viewChild<ElementRef<HTMLCanvasElement>>('paintCanvas');

  /** The source dimensions the paint canvas is currently sized for. */
  private paintCanvasFor: SourceImage | null = null;
  private drawing = false;

  public readonly mode = signal<GenerateSourceMode>('none');
  /**
   * Reactive mirror of the form's `control_type` value. The form control itself
   * is not a signal, so the validity computeds cannot depend on it directly in
   * this zoneless app; the `control_type.valueChanges` subscription keeps this
   * in sync so selecting a control type re-evaluates the local bindings.
   */
  private readonly controlType = signal<ImageControlType | ''>('');

  public readonly valid = computed(() => this.computeValid());

  /** Whether remix may be selected at all; unknown support reads as allowed. */
  public readonly remixAllowed = computed(
    () => this.remixSupported() !== false,
  );

  /** Whether another extra source image still fits. */
  public readonly canAddExtra = computed(
    () => this.extras().length < MAX_EXTRA_SOURCE_IMAGES,
  );

  /** Transloco key for the current validation failure, or null when valid. */
  public readonly validationMessage = computed(() => {
    if (this.valid()) {
      return null;
    }
    const mode = this.mode();
    if (!this.sourceImage()) {
      return 'generate.source.error_no_image';
    }
    if (mode === 'controlnet' && this.controlType() === '') {
      return 'generate.source.error_no_control_type';
    }
    if (mode === 'inpainting' && !this.maskPainted()) {
      return 'generate.source.error_no_mask';
    }
    if (mode === 'remix' && !this.remixAllowed()) {
      return 'generate.source.remix_unsupported';
    }
    return null;
  });

  constructor() {
    // Keep the paint canvas sized to the current source image. Re-sizing a
    // canvas clears it, which is exactly the reset we want on a new image.
    // This reads only signals (never the form input), so it is safe at
    // construction time before inputs are bound.
    effect(() => {
      const ref = this.paintCanvasRef();
      const image = this.sourceImage();
      if (!ref || !image || this.mode() !== 'inpainting') {
        return;
      }
      if (this.paintCanvasFor !== image) {
        const canvas = ref.nativeElement;
        canvas.width = image.width;
        canvas.height = image.height;
        this.paintCanvasFor = image;
        this.maskPainted.set(false);
        this.maskBlob.set(null);
      }
    });

    // The parent gates submission on the last emitted state, and validity
    // depends on `remixSupported`, which flips when the user changes model —
    // an event this component never sees. Re-emit so the parent's snapshot
    // cannot go stale on a model switch while remix is active.
    effect(() => {
      this.remixAllowed();
      this.emitState();
    });

    this.destroyRef.onDestroy(() => {
      this.revokePreview();
      this.revokeExtraPreviews();
    });
  }

  public ngOnInit(): void {
    const controls = this.form().controls;
    this.mode.set(controls.sourceMode.value);
    this.controlType.set(controls.control_type.value);
    controls.sourceMode.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((mode) => this.onModeChanged(mode));
    controls.control_type.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((controlType) => {
        this.controlType.set(controlType);
        this.emitState();
      });
    this.emitState();
  }

  public setMode(mode: GenerateSourceMode): void {
    if (mode === 'remix' && !this.remixAllowed()) {
      return;
    }
    if (this.form().controls.sourceMode.value === mode) {
      return;
    }
    this.form().controls.sourceMode.setValue(mode);
  }

  public onExtraFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // The picker is reset so re-choosing the same file still fires a change.
    input.value = '';
    void this.encodeExtras(files);
  }

  public onExtraDrop(event: DragEvent): void {
    event.preventDefault();
    this.extraDragActive.set(false);
    if (this.disabled()) {
      return;
    }
    void this.encodeExtras(Array.from(event.dataTransfer?.files ?? []));
  }

  public onExtraDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.disabled()) {
      this.extraDragActive.set(true);
    }
  }

  public onExtraDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.extraDragActive.set(false);
  }

  public removeExtra(index: number): void {
    const current = this.extras();
    const doomed = current[index];
    if (!doomed) {
      return;
    }
    if (this.isBrowser) {
      URL.revokeObjectURL(doomed.previewUrl);
    }
    this.extras.set(current.filter((_, position) => position !== index));
    this.emitState();
  }

  public setExtraStrength(index: number, value: number): void {
    const strength = Math.min(
      MAX_EXTRA_SOURCE_STRENGTH,
      Math.max(MIN_EXTRA_SOURCE_STRENGTH, value),
    );
    this.extras.update((current) =>
      current.map((extra, position) =>
        position === index ? { ...extra, strength } : extra,
      ),
    );
    this.emitState();
  }

  public onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      void this.encodeFile(file);
    }
  }

  public onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    if (this.disabled()) {
      return;
    }
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void this.encodeFile(file);
    }
  }

  public onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.disabled()) {
      this.dragActive.set(true);
    }
  }

  public onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
  }

  /**
   * Adopt a file handed over from the page (an image pasted onto the studio or
   * dropped on the workspace), taking the same decode/downscale/encode path as a
   * file picked here so the size cap and error handling apply identically.
   */
  public applyFile(file: File): Promise<void> {
    return this.encodeFile(file);
  }

  /**
   * Adopt an already-encoded blob as the source image, e.g. when loading a past
   * generation's settings back into the form. Replaces any current source and
   * clears the mask; the caller is responsible for setting the source mode.
   */
  public async applySource(blob: Blob): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    try {
      const image = await blobToSourceImage(blob);
      this.revokePreview();
      this.sourceImage.set(image);
      this.previewUrl.set(URL.createObjectURL(image.blob));
      this.paintCanvasFor = null;
      this.maskPainted.set(false);
      this.maskBlob.set(null);
      this.emitState();
    } catch {
      this.error.set('generate.source.encode_failed');
    }
  }

  public clearImage(): void {
    this.revokePreview();
    this.sourceImage.set(null);
    this.previewUrl.set(null);
    this.error.set(null);
    this.paintCanvasFor = null;
    this.maskPainted.set(false);
    this.maskBlob.set(null);
    this.emitState();
  }

  public setBrushSize(value: number): void {
    this.brushSize.set(
      Math.min(MAX_BRUSH, Math.max(MIN_BRUSH, Math.round(value))),
    );
  }

  public toggleEraser(): void {
    this.eraser.update((on) => !on);
  }

  public clearMask(): void {
    const canvas = this.paintCanvasRef()?.nativeElement;
    if (canvas) {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    }
    this.maskPainted.set(false);
    this.maskBlob.set(null);
    this.emitState();
  }

  public onPaintPointerDown(event: PointerEvent): void {
    if (this.disabled()) {
      return;
    }
    const canvas = this.paintCanvasRef()?.nativeElement;
    if (!canvas) {
      return;
    }
    this.drawing = true;
    canvas.setPointerCapture(event.pointerId);
    this.paintAt(event);
  }

  public onPaintPointerMove(event: PointerEvent): void {
    if (this.drawing) {
      this.paintAt(event);
    }
  }

  public onPaintPointerUp(event: PointerEvent): void {
    if (!this.drawing) {
      return;
    }
    this.drawing = false;
    const canvas = this.paintCanvasRef()?.nativeElement;
    canvas?.releasePointerCapture(event.pointerId);
    void this.refreshMask();
  }

  private paintAt(event: PointerEvent): void {
    const canvas = this.paintCanvasRef()?.nativeElement;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const radius = (this.brushSize() / 2) * (canvas.width / rect.width);

    ctx.globalCompositeOperation = this.eraser()
      ? 'destination-out'
      : 'source-over';
    // A translucent tint keeps the underlying image visible while painting; the
    // stroke's alpha channel is what the mask export reads, not this colour.
    ctx.fillStyle = 'rgba(220, 38, 38, 0.6)';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, radius), 0, Math.PI * 2);
    ctx.fill();
  }

  private async refreshMask(): Promise<void> {
    const canvas = this.paintCanvasRef()?.nativeElement;
    if (!canvas || !this.isBrowser) {
      return;
    }
    const result = await exportMaskFromPaintLayer(canvas);
    this.maskPainted.set(result.painted);
    this.maskBlob.set(result.blob);
    this.emitState();
  }

  private async encodeFile(file: File): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    this.error.set(null);
    this.encoding.set(true);
    try {
      const image = await fileToSourceImage(file);
      this.revokePreview();
      this.sourceImage.set(image);
      this.previewUrl.set(URL.createObjectURL(image.blob));
      this.paintCanvasFor = null;
      this.maskPainted.set(false);
      this.maskBlob.set(null);
      this.emitState();
    } catch {
      this.error.set('generate.source.encode_failed');
    } finally {
      this.encoding.set(false);
    }
  }

  /**
   * Decode and attach as many of `files` as still fit, skipping anything that
   * fails to decode. A partial batch is kept rather than discarded: the user
   * sees which images landed and can retry the rest.
   */
  private async encodeExtras(files: readonly File[]): Promise<void> {
    if (!this.isBrowser || files.length === 0) {
      return;
    }
    this.error.set(null);
    this.extraEncoding.set(true);
    let failed = false;
    try {
      for (const file of files) {
        if (!this.canAddExtra()) {
          break;
        }
        try {
          const image = await fileToSourceImage(file);
          this.extras.update((current) => [
            ...current,
            {
              image,
              strength: DEFAULT_EXTRA_SOURCE_STRENGTH,
              previewUrl: URL.createObjectURL(image.blob),
            },
          ]);
        } catch {
          failed = true;
        }
      }
    } finally {
      this.extraEncoding.set(false);
    }
    if (failed) {
      this.error.set('generate.source.encode_failed');
    }
    this.emitState();
  }

  private clearExtras(): void {
    if (this.extras().length === 0) {
      return;
    }
    this.revokeExtraPreviews();
    this.extras.set([]);
  }

  private revokeExtraPreviews(): void {
    if (!this.isBrowser) {
      return;
    }
    for (const extra of this.extras()) {
      URL.revokeObjectURL(extra.previewUrl);
    }
  }

  private onModeChanged(mode: GenerateSourceMode): void {
    this.mode.set(mode);
    if (mode === 'none') {
      this.clearImage();
    }
    if (mode !== 'controlnet') {
      this.resetControlFields();
    }
    if (mode !== 'inpainting') {
      this.clearMask();
    }
    if (mode !== 'remix') {
      this.clearExtras();
    }
    this.emitState();
  }

  private resetControlFields(): void {
    const controls = this.form().controls;
    if (controls.control_type.value !== '') {
      controls.control_type.setValue('');
    }
    if (controls.image_is_control.value) {
      controls.image_is_control.setValue(false);
    }
    if (controls.return_control_map.value) {
      controls.return_control_map.setValue(false);
    }
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url && this.isBrowser) {
      URL.revokeObjectURL(url);
    }
  }

  private computeValid(): boolean {
    const mode = this.mode();
    const hasImage = this.sourceImage() !== null;
    switch (mode) {
      case 'none':
        return true;
      case 'img2img':
        return hasImage;
      case 'controlnet':
        return hasImage && this.controlType() !== '';
      case 'inpainting':
        return hasImage && this.maskPainted();
      // Extras are optional: a remix with only a primary image is a valid
      // request, so the gate is the same as img2img — plus the baseline gate,
      // because a remix the model cannot serve is rejected by the horde even
      // though the section itself is complete.
      case 'remix':
        return hasImage && this.remixAllowed();
    }
  }

  private emitState(): void {
    const mode = this.mode();
    this.stateChange.emit({
      mode,
      sourceBlob: this.sourceImage()?.blob ?? null,
      maskBlob: mode === 'inpainting' ? this.maskBlob() : null,
      extras:
        mode === 'remix'
          ? this.extras().map((extra) => ({
              blob: extra.image.blob,
              strength: extra.strength,
            }))
          : [],
      valid: this.computeValid(),
    });
  }
}
