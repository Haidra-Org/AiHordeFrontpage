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
  EXTENDED_CONTROL_TYPES,
  LEGACY_CONTROL_TYPES,
  DEFAULT_EXTRA_SOURCE_STRENGTH,
  DENOISE_STEP,
  EXTRA_SOURCE_STRENGTH_STEP,
  GenerateFormGroup,
  GenerateOutpaintAnchor,
  GenerateSourceMode,
  MAX_DENOISE,
  MAX_EXTRA_SOURCE_STRENGTH,
  MIN_DENOISE,
  MIN_EXTRA_SOURCE_STRENGTH,
  OUTPAINT_ANCHORS,
  SOURCE_MODES,
  rangeFillPercent,
} from '../generate-form.model';
import type {
  FeatureCompatRuleId,
  FieldAnchorId,
  FieldRejection,
  RequestWarning,
} from '../request-lint';
import {
  OutpaintCanvas,
  SourceImage,
  blobToSourceImage,
  composeOutpaintCanvas,
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
   * The attached picture's own size, or null when nothing is attached. Growing
   * a canvas is the one thing the panel composes rather than sends, so it has
   * to know how much of the requested size is already covered.
   */
  sourceWidth?: number | null;
  sourceHeight?: number | null;
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
  /**
   * The horde's own answer to the last submit it refused, where it named a
   * control in this card. Shown as written, under the control it names.
   */
  public readonly fieldRejection = input<FieldRejection | null>(null);

  public readonly stateChange = output<GenerateSourceState>();

  /** The horde's refusal for one control, or null when it named another. */
  public rejectionFor(anchor: FieldAnchorId): string | null {
    const rejection = this.fieldRejection();
    return rejection?.anchor === anchor ? rejection.message : null;
  }

  /** Whether a named compatibility rule is currently firing for this section. */
  public hasWarning(id: FeatureCompatRuleId): boolean {
    return this.lintWarnings().some((warning) => warning.id === id);
  }

  public readonly modes = SOURCE_MODES;
  public readonly legacyControlTypes = LEGACY_CONTROL_TYPES;
  public readonly extendedControlTypes = EXTENDED_CONTROL_TYPES;
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
  /** Which outpaint composition is current, so a late reply can be dropped. */
  private outpaintToken = 0;

  public readonly mode = signal<GenerateSourceMode>('none');
  /**
   * Reactive mirror of the form's `control_type` value. The form control itself
   * is not a signal, so the validity computeds cannot depend on it directly in
   * this zoneless app; the `control_type.valueChanges` subscription keeps this
   * in sync so selecting a control type re-evaluates the local bindings.
   */
  private readonly controlType = signal<ImageControlType | ''>('');

  /** Reactive mirrors of the two masked choices, kept in sync the same way. */
  public readonly maskEnabled = signal(false);
  public readonly outpaintEnabled = signal(false);
  /** And of the size the canvas is being grown to, and where the picture sits. */
  private readonly targetWidth = signal(0);
  private readonly targetHeight = signal(0);
  public readonly outpaintAnchor = signal<GenerateOutpaintAnchor>('center');

  /**
   * The picture pasted into the larger canvas, with the border that is about to
   * be painted. Recomputed whenever the ask changes, because this is the one
   * request the panel composes rather than describes.
   */
  public readonly outpaintCanvas = signal<OutpaintCanvas | null>(null);

  public readonly anchors = OUTPAINT_ANCHORS;

  /**
   * The composed canvas as percentages of itself, for the preview to lay the
   * picture out inside the frame it is about to grow into. Null whenever the
   * canvas is not being grown, or has no room to grow into yet.
   */
  public readonly outpaintPreview = computed(() => {
    const canvas = this.outpaintCanvas();
    const image = this.sourceImage();
    if (!canvas || !image || !this.outpaintHasRoom()) {
      return null;
    }
    return {
      width: canvas.width,
      height: canvas.height,
      left: (canvas.x / canvas.width) * 100,
      top: (canvas.y / canvas.height) * 100,
      widthShare: (image.width / canvas.width) * 100,
      heightShare: (image.height / canvas.height) * 100,
    };
  });

  /** Whether the size being asked for leaves any room around the picture. */
  public readonly outpaintHasRoom = computed(() => {
    const image = this.sourceImage();
    if (!image) {
      return false;
    }
    return (
      this.targetWidth() > image.width || this.targetHeight() > image.height
    );
  });

  /**
   * Whether the brush is on show. Image-to-image paints only when asked to;
   * inpainting always does, except while it is growing the canvas, where the
   * mask is the border the panel works out rather than anything drawn.
   */
  public readonly brushActive = computed(() => {
    const mode = this.mode();
    if (mode === 'inpainting') {
      return !this.outpaintEnabled();
    }
    return mode === 'img2img' && this.maskEnabled();
  });

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
    if (mode === 'inpainting' && this.outpaintEnabled()) {
      return 'generate.source.error_no_room';
    }
    if (this.brushActive() && !this.maskPainted()) {
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
      if (!ref || !image || !this.brushActive()) {
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

    // Growing the canvas is composed here rather than described to the horde,
    // so the padded picture and its border are rebuilt whenever the ask moves.
    effect(() => {
      const image = this.sourceImage();
      const width = this.targetWidth();
      const height = this.targetHeight();
      const anchor = this.outpaintAnchor();
      const growing = this.mode() === 'inpainting' && this.outpaintEnabled();
      if (!growing || !image || !this.isBrowser) {
        this.outpaintCanvas.set(null);
        return;
      }
      void this.rebuildOutpaintCanvas(image, width, height, anchor);
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
    this.maskEnabled.set(controls.maskEnabled.value);
    this.outpaintEnabled.set(controls.outpaintEnabled.value);
    controls.sourceMode.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((mode) => this.onModeChanged(mode));
    controls.control_type.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((controlType) => {
        this.controlType.set(controlType);
        this.emitState();
      });
    controls.maskEnabled.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((enabled) => {
        this.maskEnabled.set(enabled);
        // Turning masking off throws the strokes away rather than keeping them
        // for a request that no longer carries a mask.
        if (!enabled) {
          this.clearMask();
        }
        this.emitState();
      });
    controls.outpaintEnabled.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((enabled) => {
        this.outpaintEnabled.set(enabled);
        // The two are different masks: one is painted, one is the border around
        // the picture. Neither survives a switch to the other.
        this.clearMask();
        this.emitState();
      });

    // The canvas being grown into is the request's own size, so the composition
    // follows width and height rather than having controls of its own.
    this.targetWidth.set(controls.width.value);
    this.targetHeight.set(controls.height.value);
    this.outpaintAnchor.set(controls.outpaintAnchor.value);
    controls.width.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((width) => this.targetWidth.set(width));
    controls.height.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((height) => this.targetHeight.set(height));
    controls.outpaintAnchor.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((anchor) => this.outpaintAnchor.set(anchor));

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

  /**
   * Recompose the padded picture and its border, dropping a reply that a later
   * change has already overtaken so a slow encode cannot land on top of a
   * newer one.
   */
  private async rebuildOutpaintCanvas(
    image: SourceImage,
    width: number,
    height: number,
    anchor: GenerateOutpaintAnchor,
  ): Promise<void> {
    const token = ++this.outpaintToken;
    try {
      const composed = await composeOutpaintCanvas(
        image,
        width,
        height,
        anchor,
      );
      if (token !== this.outpaintToken) {
        return;
      }
      this.outpaintCanvas.set(composed);
    } catch {
      if (token === this.outpaintToken) {
        this.outpaintCanvas.set(null);
        this.error.set('generate.source.encode_failed');
      }
    }
    this.emitState();
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
    if (mode !== 'inpainting' && mode !== 'img2img') {
      this.clearMask();
    }
    // The two masked choices belong to one mode each, so leaving that mode
    // stands them down rather than carrying them into a request that would
    // read them differently.
    if (mode !== 'img2img' && this.form().controls.maskEnabled.value) {
      this.form().controls.maskEnabled.setValue(false);
    }
    if (mode !== 'inpainting' && this.form().controls.outpaintEnabled.value) {
      this.form().controls.outpaintEnabled.setValue(false);
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
      // Growing the canvas needs somewhere to grow rather than a painted mask:
      // the border is worked out from the size being asked for, and a target no
      // larger than the picture leaves nothing to add.
      case 'inpainting':
        return this.outpaintEnabled()
          ? hasImage && this.outpaintHasRoom()
          : hasImage && this.maskPainted();
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
    const image = this.sourceImage();
    // While the canvas is being grown, what the request carries is the padded
    // picture and the border around it, not the attachment as it came in.
    const grown =
      mode === 'inpainting' && this.outpaintEnabled()
        ? this.outpaintCanvas()
        : null;
    this.stateChange.emit({
      mode,
      sourceBlob: grown ? grown.source : (image?.blob ?? null),
      maskBlob: grown
        ? grown.mask
        : this.brushActive()
          ? this.maskBlob()
          : null,
      // The attachment's own size, not the canvas composed around it: what a
      // caller wants to know is how much the reader brought, so it can say
      // whether the size being asked for leaves anything to add.
      sourceWidth: image?.width ?? null,
      sourceHeight: image?.height ?? null,
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
