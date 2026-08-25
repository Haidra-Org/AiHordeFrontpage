import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { GsHelpComponent } from '../../../components/gs-help/gs-help.component';
import { GsGroupComponent } from '../generate-form/gs-group/gs-group.component';
import { DatabaseService } from '../../../services/database.service';
import { TutorialAnchorDirective } from '../../../directives/tutorial-anchor.directive';
import {
  AnnotationControlType,
  ImageControlType,
} from '../../../types/generation';
import {
  annotationDetectorDescriptionKey,
  annotationDetectorNameKey,
} from '../../../content/alchemy-usecases';
import {
  DOCS_IMAGE_CONTROL_TYPES,
  docsControlTypeAnchor,
} from '../../../content/docs-links';
import { MAX_EXTRA_SOURCE_IMAGES } from '../../../types/generation-job';
import {
  CONTROL_STRENGTH_STEP,
  DEFAULT_CONTROL_STRENGTH,
  EXTENDED_CONTROL_TYPES,
  LEGACY_CONTROL_TYPES,
  DEFAULT_EXTRA_SOURCE_STRENGTH,
  DENOISE_STEP,
  EXTRA_SOURCE_STRENGTH_STEP,
  GenerateFormGroup,
  GenerateOutpaintAnchor,
  GenerateSourceMode,
  MAX_CONTROL_STRENGTH,
  MAX_DENOISE,
  MAX_EXTRA_SOURCE_STRENGTH,
  MIN_CONTROL_STRENGTH,
  MIN_DENOISE,
  MIN_EXTRA_SOURCE_STRENGTH,
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
  fileToSourceImage,
} from '../../../helper/source-image';
import {
  SourceEditorComponent,
  type SourceEditorDoc,
  type SourceEditorResult,
} from '../source-editor/source-editor.component';

/** Where the reader's choice to fold this card away is remembered. */
const SOURCE_OPEN_KEY = 'aihorde.generate.source_open';

/** The separator the folded card reads its values between. */
const SUMMARY_SEPARATOR = ' · ';

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

/**
 * The /generate source-image section, projected into the form's
 * `[generateSourceImage]` slot. Drives the img2img / controlnet / inpainting /
 * remix controls bound to the parent form, owns the uploaded source blob, the
 * remix extra images and the mask the editor painted, and emits a
 * {@link GenerateSourceState} so the page can gate submission and enqueue the
 * blobs.
 *
 * Browser-only work (decode, canvas, object URLs) is guarded; the page is
 * RenderMode.Client but the guards keep the component inert under SSR.
 */
@Component({
  selector: 'app-generate-source-image',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    IconComponent,
    GsHelpComponent,
    GsGroupComponent,
    TutorialAnchorDirective,
    SourceEditorComponent,
  ],
  templateUrl: './generate-source-image.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateSourceImageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly db = inject(DatabaseService);
  private readonly transloco = inject(TranslocoService);

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

  /** What the chosen guidance mode reads, in the words the picker uses for it. */
  public controlTypeNoteKey(type: ImageControlType): string {
    return annotationDetectorDescriptionKey(canonicalControlType(type));
  }

  /** The place on that page where the chosen mode is shown against the others. */
  public controlTypeAnchor(type: ImageControlType): string {
    return docsControlTypeAnchor(canonicalControlType(type));
  }

  /** The page every guidance mode is shown on. */
  public readonly controlTypesLink = DOCS_IMAGE_CONTROL_TYPES;

  public readonly legacyControlTypes = LEGACY_CONTROL_TYPES;
  public readonly extendedControlTypes = EXTENDED_CONTROL_TYPES;
  public readonly minControlStrength = MIN_CONTROL_STRENGTH;
  public readonly maxControlStrength = MAX_CONTROL_STRENGTH;
  public readonly controlStrengthStep = CONTROL_STRENGTH_STEP;
  public readonly defaultControlStrength = DEFAULT_CONTROL_STRENGTH;
  public readonly minDenoise = MIN_DENOISE;
  public readonly maxDenoise = MAX_DENOISE;
  public readonly denoiseStep = DENOISE_STEP;
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
  public readonly maskPreviewUrl = signal<string | null>(null);

  /** Which outpaint composition is current, so a late reply can be dropped. */
  private outpaintToken = 0;

  public readonly mode = signal<GenerateSourceMode>('none');
  /**
   * Reactive mirror of the form's `control_type` value. The form control itself
   * is not a signal, so the validity computeds cannot depend on it directly in
   * this zoneless app; the `control_type.valueChanges` subscription keeps this
   * in sync so selecting a control type re-evaluates the local bindings.
   */
  public readonly controlType = signal<ImageControlType | ''>('');
  /**
   * Mirror of the form's `control_strength`, kept in sync the same way, so the
   * slider and the line reading it repaint in this zoneless app. Null is the
   * unset state: the request carries no strength and the worker uses its own.
   */
  public readonly controlStrength = signal<number | null>(null);
  /**
   * Mirrors of the three remaining values the folded card reads, kept in sync
   * the same way, so its line repaints when one of them moves.
   */
  public readonly denoise = signal(1);
  public readonly imageIsControl = signal(false);
  public readonly returnControlMap = signal(false);

  /** The ways of starting from a picture the card offers. */
  public readonly modes = SOURCE_MODES;

  /** Reactive mirrors of the two masked choices, kept in sync the same way. */
  public readonly maskEnabled = signal(false);
  public readonly outpaintEnabled = signal(false);
  /** And of the size the canvas is being grown to, and where the picture sits. */
  private readonly targetWidth = signal(0);
  private readonly targetHeight = signal(0);
  public readonly outpaintAnchor = signal<GenerateOutpaintAnchor>('center');
  /**
   * Where the editor's frame last put the picture inside the canvas being grown.
   * A hand placement is finer than the nine-way anchor can say, so it takes
   * precedence while it stands; the anchor is still written alongside it so a
   * past generation can be reproduced from its settings alone.
   */
  public readonly outpaintOffset = signal<{ x: number; y: number } | null>(
    null,
  );

  /**
   * The picture pasted into the larger canvas, with the border that is about to
   * be painted. Recomputed whenever the ask changes, because this is the one
   * request the panel composes rather than describes.
   */
  public readonly outpaintCanvas = signal<OutpaintCanvas | null>(null);

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

  // --- Folding --------------------------------------------------------------

  /** The reader's own choice, whether or not the card can currently act on it. */
  private readonly foldOpen = signal(true);

  /**
   * Whether the card may be folded away. The picker is the only way to give the
   * card a picture, so a card with none stays open: folding it would put the
   * one control it is asking for out of reach. A mode that takes no picture has
   * nothing to fold either.
   */
  public readonly canFold = computed(
    () => this.mode() !== 'none' && this.sourceImage() !== null,
  );

  /**
   * Whether a problem is on show inside the card. A fold is the reader's own
   * and stands for nothing having been dealt with, so a refusal or a missing
   * value keeps the card open until it is answered.
   */
  private readonly hasProblem = computed(
    () =>
      this.rejectionFor('source') !== null ||
      (this.showValidation() && this.validationMessage() !== null),
  );

  /** Whether the card is currently showing its controls. */
  public readonly open = computed(
    () => !this.canFold() || this.hasProblem() || this.foldOpen(),
  );

  /** Hold the reader's choice, and remember it for the next visit. */
  private setFoldOpen(open: boolean): void {
    this.foldOpen.set(open);
    this.db.store(SOURCE_OPEN_KEY, open);
  }

  /** Fold the card away, or open it, and remember which for the next visit. */
  public toggleFold(): void {
    this.setFoldOpen(!this.open());
  }

  /**
   * Fold the card away with the rest of the panel. A card that cannot fold on
   * its own is left alone, so folding everything never puts the picker out of
   * reach; a problem on show still keeps the card open until it is answered.
   */
  public fold(): void {
    if (!this.canFold()) {
      return;
    }
    this.setFoldOpen(false);
  }

  /** How many of this card's warnings the folded head has to report. */
  public lintCount(): number {
    return this.lintWarnings().length;
  }

  /** What that count says aloud, worded for the number. */
  public lintLabel(): string {
    const count = this.lintCount();
    if (count === 0) {
      return '';
    }
    const group: string = this.transloco.translate('generate.source.section');
    return this.transloco.translate(
      `generate.groups.lint_count${count === 1 ? '_one' : '_other'}`,
      { count, group },
    );
  }

  /** Pressed the count on the folded head: show the controls it is about. */
  public openForLint(): void {
    this.setFoldOpen(true);
  }

  /**
   * What the card is doing, in one line: the way it is starting from a picture,
   * then the values that are in play for that way. Read by sighted readers off
   * the folded head and by everyone else as part of the press that opens it.
   */
  public readonly foldSummary = computed(() => {
    const mode = this.mode();
    if (mode === 'none' || !this.sourceImage()) {
      return '';
    }
    const parts: (string | null)[] = [this.modePhrase(mode)];
    if (mode === 'img2img' || mode === 'controlnet') {
      parts.push(
        this.transloco.translate('generate.groups.source_denoise', {
          value: this.denoise(),
        }),
      );
    }
    if (mode === 'controlnet') {
      const strength = this.controlStrength();
      if (strength !== null) {
        parts.push(
          this.transloco.translate('generate.groups.source_strength', {
            value: strength,
          }),
        );
      }
      if (this.imageIsControl()) {
        parts.push(
          this.transloco.translate('generate.groups.source_map_supplied'),
        );
      }
      if (this.returnControlMap()) {
        parts.push(this.transloco.translate('generate.groups.source_map_back'));
      }
    }
    const extras = this.extras().length;
    if (mode === 'remix' && extras > 0) {
      parts.push(
        this.transloco.translate(
          `generate.groups.source_extras${extras === 1 ? '_one' : '_other'}`,
          { count: extras },
        ),
      );
    }
    return parts
      .filter((part): part is string => !!part)
      .join(SUMMARY_SEPARATOR);
  });

  /** The way this card is starting from a picture, as a phrase. */
  private modePhrase(mode: GenerateSourceMode): string {
    if (mode === 'controlnet') {
      const type = this.controlType();
      if (type === '') {
        return this.transloco.translate(
          'generate.groups.source_controlnet_unset',
        );
      }
      const name: string = this.transloco.translate(
        annotationDetectorNameKey(canonicalControlType(type)),
      );
      return this.transloco.translate('generate.groups.source_controlnet', {
        name,
      });
    }
    if (mode === 'inpainting' && this.outpaintEnabled()) {
      return this.transloco.translate('generate.groups.source_outpainting');
    }
    return this.transloco.translate(`generate.groups.source_${mode}`);
  }

  constructor() {
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
      const offset = this.outpaintOffset();
      const growing = this.mode() === 'inpainting' && this.outpaintEnabled();
      if (!growing || !image || !this.isBrowser) {
        this.outpaintCanvas.set(null);
        return;
      }
      void this.rebuildOutpaintCanvas(image, width, height, anchor, offset);
    });

    this.destroyRef.onDestroy(() => {
      this.revokePreview();
      this.revokeMaskPreview();
      this.revokeExtraPreviews();
    });
  }

  public ngOnInit(): void {
    const controls = this.form().controls;
    this.mode.set(controls.sourceMode.value);
    this.controlType.set(controls.control_type.value);
    this.controlStrength.set(controls.control_strength.value);
    this.maskEnabled.set(controls.maskEnabled.value);
    this.outpaintEnabled.set(controls.outpaintEnabled.value);
    this.denoise.set(controls.denoising_strength.value);
    this.imageIsControl.set(controls.image_is_control.value);
    this.returnControlMap.set(controls.return_control_map.value);
    const storedOpen = this.db.get(SOURCE_OPEN_KEY);
    if (typeof storedOpen === 'boolean') {
      this.foldOpen.set(storedOpen);
    }
    controls.denoising_strength.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.denoise.set(value));
    controls.image_is_control.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.imageIsControl.set(value));
    controls.return_control_map.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.returnControlMap.set(value));
    controls.sourceMode.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((mode) => this.onModeChanged(mode));
    controls.control_type.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((controlType) => {
        this.controlType.set(controlType);
        // A strength with no control map is a request the horde refuses, so
        // dropping the type drops the weight, unless the QR workflow is on and
        // applying a control map of its own.
        if (
          controlType === '' &&
          controls.qrText.value.trim() === '' &&
          controls.control_strength.value !== null
        ) {
          controls.control_strength.setValue(null);
        }
        this.emitState();
      });
    controls.control_strength.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((strength) => this.controlStrength.set(strength));
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
   * generation's settings back into the form. A mask stored alongside it is
   * taken back with it, so a reloaded generation carries the region it was
   * painted for rather than silently losing it. The caller is responsible for
   * setting the source mode.
   */
  public async applySource(
    blob: Blob,
    mask: Blob | null = null,
  ): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    try {
      const image = await blobToSourceImage(blob);
      this.revokePreview();
      this.sourceImage.set(image);
      this.previewUrl.set(URL.createObjectURL(image.blob));
      this.outpaintOffset.set(null);
      this.setMask(mask);
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
    this.outpaintOffset.set(null);
    this.setMask(null);
    this.emitState();
  }

  /** What the fullscreen editor is open on, null while it is closed. */
  public readonly editorDoc = signal<SourceEditorDoc | null>(null);

  public openEditor(): void {
    const image = this.sourceImage();
    if (!image) {
      return;
    }
    this.editorDoc.set({
      image,
      mask: this.maskBlob(),
      width: image.width,
      height: image.height,
      offset: this.outpaintOffset(),
    });
  }

  /** Open the editor on a blank sheet at the size the form is asking for. */
  public openBlankEditor(): void {
    const controls = this.form().controls;
    this.editorDoc.set({
      image: null,
      mask: null,
      width: controls.width.value,
      height: controls.height.value,
      offset: null,
      initialInk: 'color',
    });
  }

  public closeEditor(): void {
    this.editorDoc.set(null);
  }

  /**
   * Take what the editor staged. The picture only replaces the one held here
   * when its bytes actually changed, so a session that painted nothing but a
   * mask leaves the attachment and its preview alone.
   */
  public onEditorApplied(result: SourceEditorResult): void {
    const current = this.sourceImage();
    if (!current || result.image.blob !== current.blob) {
      this.revokePreview();
      this.sourceImage.set(result.image);
      this.previewUrl.set(URL.createObjectURL(result.image.blob));
    }
    // The editor owns the masked choice now that the switch is gone from the
    // card: a mask painted turns it on, and a mask erased turns it back off,
    // or image-to-image would be left demanding a mask with nothing to say no.
    if (this.mode() === 'img2img') {
      const masked = result.mask !== null;
      if (this.maskEnabled() !== masked) {
        this.form().controls.maskEnabled.setValue(masked);
      }
    }
    this.setMask(result.mask);
    this.outpaintOffset.set(result.offset);
    this.emitState();
  }

  /** Forget the mask, which is all there is to forget now the editor owns it. */
  public clearMask(): void {
    this.setMask(null);
    // Image-to-image stands the masked choice down with the mask itself: the
    // switch that used to do so is editor-owned now.
    if (this.mode() === 'img2img' && this.form().controls.maskEnabled.value) {
      this.form().controls.maskEnabled.setValue(false);
    }
    this.emitState();
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
    offset: { x: number; y: number } | null,
  ): Promise<void> {
    const token = ++this.outpaintToken;
    try {
      const composed = await composeOutpaintCanvas(
        image,
        width,
        height,
        anchor,
        offset,
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
      this.outpaintOffset.set(null);
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

  /** Take the weight off the control map's hold and send nothing for it. */
  public clearControlStrength(): void {
    this.form().controls.control_strength.setValue(null);
    this.form().markAsDirty();
  }

  /** Set the weight from the slider, which only moves in the horde's range. */
  public setControlStrength(strength: number): void {
    const clamped = Math.min(
      MAX_CONTROL_STRENGTH,
      Math.max(MIN_CONTROL_STRENGTH, strength),
    );
    this.form().controls.control_strength.setValue(clamped);
    this.form().markAsDirty();
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url && this.isBrowser) {
      URL.revokeObjectURL(url);
    }
  }

  /** Keep a source-mask overlay URL in sync with the mask blob lifecycle. */
  private setMask(mask: Blob | null): void {
    this.revokeMaskPreview();
    this.maskBlob.set(mask);
    this.maskPainted.set(mask !== null);
    if (mask && this.isBrowser) {
      this.maskPreviewUrl.set(URL.createObjectURL(mask));
    }
  }

  private revokeMaskPreview(): void {
    const url = this.maskPreviewUrl();
    if (url && this.isBrowser) {
      URL.revokeObjectURL(url);
    }
    this.maskPreviewUrl.set(null);
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

/**
 * The mode under the name the rest of the site knows it by. `hough` is the
 * older spelling of `mlsd` and the same detector, so both are read against the
 * one description and land on the one place in the reference.
 */
function canonicalControlType(type: ImageControlType): AnnotationControlType {
  return type === 'hough' ? 'mlsd' : type;
}
