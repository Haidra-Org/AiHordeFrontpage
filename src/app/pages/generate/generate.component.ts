import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  computed,
  effect,
  inject,
  input,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { debounceTime, zip } from 'rxjs';
import { AiHordeService } from '../../services/ai-horde.service';
import { GenerationQueueService } from '../../services/generation-queue.service';
import { ToastService } from '../../services/toast.service';
import { DatabaseService } from '../../services/database.service';
import { TranslatorService } from '../../services/translator.service';
import {
  AppliedStyle,
  HordeStylePreset,
  HordeStylesService,
  StyleForcedParams,
  applyStyle,
} from '../../services/horde-styles.service';
import { setPageTitle } from '../../helper/page-title';
import { ActiveModel, mergeModelList } from '../../types/active-model';
import { EnqueueSourceImage } from '../../types/generation-job';
import { ImageGenerationRequest } from '../../types/generation';
import { ImagePostProcessor } from '../../types/style';
import { GeneratePresetsService } from '../../services/generate-presets.service';
import { StyleUsageService } from '../../services/style-usage.service';
import { ModelReferenceService } from '../../services/model-reference.service';
import { SamplerConstraintsService } from '../../services/sampler-constraints.service';
import { SweepLibraryService } from '../../services/sweep-library.service';
import {
  TutorialEngineService,
  TutorialStudioHost,
} from '../../services/tutorial-engine.service';
import {
  GLOSSARY_TERMS,
  GlossaryService,
} from '../../services/glossary.service';
import { STUDIO_CONTROLS } from '../../content/studio-controls';
import { TutorialAnchorService } from '../../services/tutorial-anchor.service';
import { GsHelpDockService } from '../../services/gs-help-dock.service';
import { GsTryItService, TryItHost } from '../../services/gs-try-it.service';
import { GsParamEntryComponent } from '../../components/gs-param-entry/gs-param-entry.component';
import { GsSheetComponent } from '../../components/gs-sheet/gs-sheet.component';
import { blobToBase64 } from '../../helper/blob-base64';
import { StudioImageDropDirective } from '../../helper/studio-image-drop.directive';
import {
  GenerateFormComponent,
  StylePickerGroup,
} from './generate-form/generate-form.component';
import { GenerateLearnSheetComponent } from './generate-learn-sheet/generate-learn-sheet.component';
import { GsTutorialParkedComponent } from '../../components/gs-tutorial-parked/gs-tutorial-parked.component';
import { StudioJsonModalComponent } from './studio-json-modal/studio-json-modal.component';
import { IconComponent } from '../../components/icon/icon.component';
import { GenerateResultsPanelComponent } from './generate-results-panel/generate-results-panel.component';
import {
  GenerateSourceImageComponent,
  GenerateSourceState,
} from './generate-source-image/generate-source-image.component';
import {
  DEFAULT_GENERATE_FORM_VALUE,
  FACE_FIXERS,
  GenerateFormValue,
  GenerateMode,
  GenerateSourceMode,
  KudosBreakdownLine,
  PanelSize,
  WaitEstimate,
  buildImageRequest,
  buildStyledImageRequest,
  coerceFormValue,
  createGenerateForm,
  kudosBreakdown,
  modelWaitEstimate,
  promptHistoryFromJobs,
  requestToFormValue,
  simpleModeValue,
  stripEphemeralExtras,
} from './generate-form.model';
import {
  ImageMetaPanelComponent,
  MetaApplyEvent,
  MetaApplyMode,
} from './image-meta-panel/image-meta-panel.component';
import { PANEL_SECTION_IDS, SECTION_IDENTITIES } from '../../content/sections';
import {
  FieldRejection,
  RequestWarning,
  evaluateRequestLint,
  rejectionField,
  rejectionWatchValue,
  warningsInSection,
} from './request-lint';

const DEFAULT_SOURCE_STATE: GenerateSourceState = {
  mode: 'none',
  sourceBlob: null,
  maskBlob: null,
  valid: true,
};

const STORAGE_KEY = 'aihorde.generate.form';

/** What the glossary files the studio's this-page entries under. */
const STUDIO_GLOSSARY_PAGE_ID = 'generate-image';

/**
 * The dictionary entries worth putting in front of someone standing at the
 * panel: every setting it has a word for, and the three things those settings
 * are spent on.
 */
const STUDIO_GLOSSARY_TERM_IDS: readonly string[] = [
  ...GLOSSARY_TERMS.filter(
    (term) => term.category === 'generation_settings',
  ).map((term) => term.id),
  'kudos',
  'worker',
  'model',
];
const KUDOS_DEBOUNCE_MS = 1000;

/**
 * Form fields that only mean anything with a source image attached. Applying any
 * of them from a past generation has to re-attach that generation's stored
 * source, exactly as loading its full settings does.
 */
const SOURCE_DEPENDENT_KEYS: readonly (keyof GenerateFormValue)[] = [
  'sourceMode',
  'denoising_strength',
  'control_type',
  'image_is_control',
  'return_control_map',
];

/**
 * The `/generate` page. Owns the request form, drives a debounced dry-run kudos
 * estimate, persists the last-used form values, and hands built requests to the
 * root generation queue. Rendering happens client-side only (RenderMode.Client);
 * all queue and estimate traffic is guarded behind a browser check.
 */
@Component({
  selector: 'app-generate',
  imports: [
    GenerateFormComponent,
    GenerateSourceImageComponent,
    GenerateResultsPanelComponent,
    ImageMetaPanelComponent,
    StudioJsonModalComponent,
    StudioImageDropDirective,
    GsSheetComponent,
    GsParamEntryComponent,
    GenerateLearnSheetComponent,
    GsTutorialParkedComponent,
    IconComponent,
    TranslocoPipe,
  ],
  templateUrl: './generate.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateComponent implements TutorialStudioHost, TryItHost {
  private readonly aiHorde = inject(AiHordeService);
  private readonly queue = inject(GenerationQueueService);
  private readonly toast = inject(ToastService);
  private readonly db = inject(DatabaseService);
  private readonly translator = inject(TranslatorService);
  private readonly styles = inject(HordeStylesService);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);
  private readonly presets = inject(GeneratePresetsService);
  private readonly styleUsage = inject(StyleUsageService);
  private readonly modelReference = inject(ModelReferenceService);
  private readonly samplerConstraints = inject(SamplerConstraintsService);
  private readonly tutorial = inject(TutorialEngineService);
  private readonly tryIt = inject(GsTryItService);
  private readonly sweeps = inject(SweepLibraryService);
  /** The reference entry the mobile sheet is showing, if any. */
  public readonly helpDock = inject(GsHelpDockService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Whether a follow-along tutorial is running, for the mobile sheet's mount. */
  public readonly tutorialActive = this.tutorial.active;

  /** The projected source-image section, so a loaded source blob can re-attach. */
  private readonly sourceImageRef = viewChild(GenerateSourceImageComponent);
  /** The control panel, so a picked prompt can be written and focused. */
  private readonly formRef = viewChild(GenerateFormComponent);
  /** The results pane, the skip link's target. */
  private readonly resultsRef =
    viewChild<ElementRef<HTMLElement>>('resultsPane');

  /**
   * When true the page's own intro/title block is suppressed and the component
   * does not claim the document title, so it can be hosted inside another page's
   * shell (e.g. the profile generations tab) without duplicating chrome.
   */
  public readonly embedded = input(false);

  public readonly form = createGenerateForm(
    coerceFormValue(this.db.get(STORAGE_KEY)),
  );
  /** What `/status/models` reports: the worker counts, not the model universe. */
  private readonly workerModels = signal<ActiveModel[]>([]);
  /** The models the pickers offer: the reference, with worker counts over it. */
  public readonly models = computed(() =>
    mergeModelList(this.modelReference.names(), this.workerModels()),
  );
  public readonly samplerContract = this.samplerConstraints.contract;
  public readonly kudos = signal<number | null>(null);
  public readonly estimating = signal(false);

  /** How wide the control panel is expanded (normal/double/full). UI-only. */
  public readonly panelSize = signal<PanelSize>('normal');

  /** Curated style presets grouped by category, for the styles picker. */
  public readonly styleGroups = signal<StylePickerGroup[]>([]);
  /** `styleName` -> preset, so a picked style can be resolved and applied. */
  private readonly stylePresets = signal<Map<string, HordeStylePreset>>(
    new Map(),
  );
  /** Params the currently-selected style forces, for "set by style" hints. */
  public readonly forcedParams = signal<StyleForcedParams | null>(null);

  public readonly sourceState =
    signal<GenerateSourceState>(DEFAULT_SOURCE_STATE);
  /** Whether the source section's validation hint should be shown. */
  public readonly sourceValidationVisible = signal(false);

  /** The built request shown in the pre-submit preview modal, or null. */
  public readonly previewRequest = signal<unknown>(null);

  /**
   * What the review-and-apply panel calls the settings it is showing. A preset
   * and a tutorial's example are reviewed through the same panel and are not the
   * same thing to the reader, so the heading follows whichever opened it.
   */
  public readonly loadTitleKey = signal('generate.form.load_title');

  /**
   * The preset the user picked from the control panel's presets menu, held while
   * they pick over it in the metadata panel. Past generations are reviewed the
   * same way, from the results grid.
   */
  public readonly pendingLoad = signal<GenerateFormValue | null>(null);
  /** The pending preset as a request, which is what the review panel reads. */
  public readonly pendingLoadRequest = computed<ImageGenerationRequest | null>(
    () => {
      const pending = this.pendingLoad();
      // A preset carries no image, so its source-mode fields describe nothing
      // and are left out of the request entirely.
      return pending
        ? buildImageRequest(pending, this.buildOptions(false))
        : null;
    },
  );

  /**
   * Recent distinct prompts for the form's quick-pick, read off the jobs the
   * queue already holds in memory rather than re-querying IndexedDB.
   */
  public readonly promptHistory = computed(() =>
    promptHistoryFromJobs(this.queue.jobs()),
  );

  /**
   * The current form value as a signal, so the results grid's metadata panel can
   * mark the parameters that differ from it.
   */
  public readonly formValue = signal<GenerateFormValue>(
    this.form.getRawValue(),
  );

  /**
   * Whether the selected model's baseline can serve a remix request. Null when
   * no model is picked or the model reference has not loaded, which the source
   * section reads as "leave the mode offered".
   */
  public readonly remixSupported = computed(() =>
    this.modelSupport((model) => this.modelReference.supportsRemix(model)),
  );

  /** As {@link remixSupported}, for the `qr_code` workflow (SD 1.5 / SDXL). */
  public readonly qrSupported = computed(() =>
    this.modelSupport((model) => this.modelReference.supportsQrCode(model)),
  );

  /**
   * The selected model's normalised baseline, or null when no model is picked or
   * the reference has not loaded. Drives the control panel's size guidance.
   */
  public readonly modelBaseline = computed(() => {
    const model = this.formValue().model.trim();
    // Read the signal unconditionally so this recomputes when the reference
    // lands after the form has already settled.
    const baselines = this.modelReference.baselines();
    return baselines === null || model === ''
      ? null
      : this.modelReference.baselineFor(model);
  });

  /** The settings the selected model recommends, or null when it names none. */
  public readonly modelRequirements = computed(() => {
    const model = this.formValue().model.trim();
    const requirements = this.modelReference.requirements();
    return requirements === null || model === ''
      ? null
      : this.modelReference.requirementsFor(model);
  });

  /**
   * Everything the request as it stands would earn a warning for. Evaluated
   * once, here, because it spans the whole request: the model's recommendations,
   * the resolution notes and the feature-compatibility table all read fields
   * that live in different cards. The count beside Generate, the popover and
   * each card's inline line are three views of this one list.
   *
   * The value linted is the one that would actually be submitted, so simple
   * mode is linted against the defaults it sends rather than whatever an
   * earlier advanced session left in the hidden controls.
   */
  public readonly lintWarnings = computed<readonly RequestWarning[]>(() => {
    const raw = this.formValue();
    const value = raw.mode === 'simple' ? simpleModeValue(raw) : raw;
    const state = this.sourceState();
    return evaluateRequestLint({
      value,
      baseline: this.modelBaseline(),
      requirements: this.modelRequirements(),
      hasSourceImage: state.sourceBlob !== null,
      sourceWidth: state.sourceWidth ?? null,
      sourceHeight: state.sourceHeight ?? null,
      contract: this.samplerContract(),
    });
  });

  /**
   * What the estimate is made of, in the reader's own settings. Simple mode is
   * projected the same way the warnings are, so the lines describe the request
   * that would actually be sent rather than the advanced controls behind it.
   */
  public readonly kudosLines = computed<readonly KudosBreakdownLine[]>(() => {
    const raw = this.formValue();
    const value = raw.mode === 'simple' ? simpleModeValue(raw) : raw;
    return kudosBreakdown(value, this.samplerContract());
  });

  /** What to say about the wait for the picked model, as the popover's last line. */
  public readonly waitLine = computed<WaitEstimate>(() => {
    const name = this.formValue().model.trim();
    const match = name
      ? (this.models().find((model) => model.name === name) ?? null)
      : null;
    return modelWaitEstimate(match);
  });

  /**
   * The horde's answer to the last submit it refused, held with the form value
   * of the control it named. Nothing is inferred from it: the sentence is the
   * horde's and the code only decides which control it is shown under.
   */
  private readonly rejectionState = signal<{
    rejection: FieldRejection;
    watched: unknown;
  } | null>(null);

  /** The job whose refusal has already been taken up, so it is taken up once. */
  private handledRejectionJob: string | null = null;

  /** Where the horde's last refusal belongs, or null when none is standing. */
  public readonly fieldRejection = computed<FieldRejection | null>(
    () => this.rejectionState()?.rejection ?? null,
  );

  /**
   * Adopt a refusal the horde has just sent, and drop one the reader has
   * answered. A rejection stands until the control it names is changed: the
   * horde decides whether a new value is acceptable, so the studio does not
   * re-judge it locally, it just stops repeating a sentence about a value that
   * is no longer in the form.
   */
  private readonly rejectionSync = effect(() => {
    const value = this.formValue();
    const refused = this.queue
      .jobs()
      .filter((job) => job.status === 'error' && job.errorRc)
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .at(-1);
    untracked(() => {
      if (refused && refused.localId !== this.handledRejectionJob) {
        this.handledRejectionJob = refused.localId;
        const rejection = rejectionField(
          refused.errorRc,
          refused.errorMessage ?? '',
        );
        this.rejectionState.set(
          rejection
            ? {
                rejection,
                watched: rejectionWatchValue(rejection.anchor, value),
              }
            : null,
        );
        return;
      }
      const current = this.rejectionState();
      if (
        current &&
        rejectionWatchValue(current.rejection.anchor, value) !== current.watched
      ) {
        this.rejectionState.set(null);
      }
    });
  });

  /** The source section's share of {@link lintWarnings}, for its inline lines. */
  public readonly sourceLintWarnings = computed(() =>
    warningsInSection(this.lintWarnings(), 'source'),
  );

  /** Monotonic guard so a slow estimate cannot overwrite a newer one. */
  private estimateSeq = 0;

  /** Base64 of the current source blob, recomputed only when the blob changes. */
  private sourceBase64: string | null = null;
  private cachedSourceBlob: Blob | null = null;

  constructor() {
    afterNextRender(() => {
      if (!this.embedded()) {
        setPageTitle(
          this.translator,
          this.title,
          this.destroyRef,
          'generate.title',
        );
      }
    });

    if (this.isBrowser) {
      this.fetchModels();
      this.fetchStyles();
      this.modelReference.load();
      this.samplerConstraints.load();
      this.form.valueChanges
        .pipe(
          debounceTime(KUDOS_DEBOUNCE_MS),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => {
          this.persist();
          void this.updateKudos();
        });
      // The "set by style" hints and the source reset on leaving advanced must
      // react immediately, so track raw form changes without the kudos debounce.
      this.form.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.onFormChanged());
      this.refreshForcedParams();
      void this.updateKudos();
    }

    // The sweep strips a field's `?` note offers should be of the model the
    // reader has picked, and the note has no way to know which that is. The name
    // goes with the baseline because the library rendered a few of these models
    // by name, and those readers get their own model rather than its family's.
    effect(() =>
      this.sweeps.setStudioModel(
        this.formValue().model.trim(),
        this.modelBaseline(),
      ),
    );
    this.destroyRef.onDestroy(() => this.sweeps.setStudioModel(null, null));

    this.tutorial.registerHost(this);
    this.destroyRef.onDestroy(() => this.tutorial.unregisterHost(this));

    // A value picked on the routed reference page arrives armed rather than
    // applied: the page had no form to write to, and this is the form.
    this.tryIt.registerHost(this);
    this.destroyRef.onDestroy(() => this.tryIt.unregisterHost(this));

    this.registerGlossaryContext();
    const armedApply = this.tryIt.consumeArmed();
    if (armedApply && this.isBrowser) {
      afterNextRender(() => this.tryIt.apply(armedApply));
    }

    const armed = this.tutorial.consumeArmed();
    if (armed && this.isBrowser) {
      void this.tutorial.start(armed);
      // Once immediately, and once after late-arriving content (translations,
      // images) has expanded the form above the pane and pushed it back below
      // the fold; the in-view guard makes the second pass a no-op otherwise.
      afterNextRender(() => {
        this.revealLearnPane();
        const settle = setTimeout(() => this.revealLearnPane(), 600);
        this.destroyRef.onDestroy(() => clearTimeout(settle));
      });
    }
  }

  /**
   * Bring the results pane, where the tutorial renders, onto the screen. On
   * narrow viewports the panes stack and a reader arriving from the Learn page
   * lands at the top of the form with the pane they asked for below the fold and
   * nothing saying it is there. Where the pane is already in view (the side by
   * side layout) nothing moves: the arrival should not yank the page.
   *
   * Where the sheet is the presentation there is nothing to reveal: the steps
   * are already over the form, and scrolling the pane up would drag the reader
   * away from the field the first step is pointing at.
   */
  private revealLearnPane(): void {
    if (this.tutorialInSheet()) {
      return;
    }
    const pane = this.resultsRef()?.nativeElement;
    if (!pane) {
      return;
    }
    const box = pane.getBoundingClientRect();
    const viewport =
      globalThis.innerHeight || document.documentElement.clientHeight;
    if (box.top < viewport && box.bottom > 0) {
      return;
    }
    const reduceMotion = globalThis.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    pane.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  /**
   * Whether the tutorial is showing as the bottom sheet rather than in the
   * results pane. The same width the stylesheet switches presentations at,
   * asked of the same viewport, so the two cannot disagree about which surface
   * the reader is looking at.
   */
  private tutorialInSheet(): boolean {
    return (
      this.isBrowser &&
      globalThis.matchMedia?.('(max-width: 1023.98px)').matches === true
    );
  }

  // --- Follow-along tutorial host ------------------------------------------
  // The tutorial renders in the results pane and never touches the form group
  // itself; everything it asks for arrives through these four methods.

  /**
   * Write the named fields, and switch on any post-processors they need.
   *
   * `addPostProcessors` is a union with what the form already runs, so an
   * upscaler or a background strip already in the list survives the write. The
   * face fixers are a single choice between them, so one is only added while
   * none is selected: a value that needs a fixer enabled has to leave one
   * enabled, but it is never the thing that replaces the reader's own pick.
   */
  public applyFields(
    fields: Partial<GenerateFormValue>,
    addPostProcessors: readonly ImagePostProcessor[] = [],
  ): void {
    this.form.patchValue(fields);
    const current = this.form.controls.post_processing.value;
    const hasFaceFixer = current.some((processor) =>
      FACE_FIXERS.includes(processor),
    );
    const additions = addPostProcessors.filter(
      (processor) =>
        !current.includes(processor) &&
        !(hasFaceFixer && FACE_FIXERS.includes(processor)),
    );
    if (additions.length > 0) {
      this.form.controls.post_processing.setValue([...current, ...additions]);
    }
    this.form.markAsDirty();
  }

  public currentMode(): GenerateMode {
    return this.form.controls.mode.value;
  }

  public setMode(mode: GenerateMode): void {
    this.form.controls.mode.setValue(mode);
  }

  /**
   * Read off the tracked value rather than the control, so a surface asking
   * inside a computed is re-run when the reader changes mode: a try-it chip that
   * only appears on a sourced request has to appear and disappear with it.
   */
  public currentSourceMode(): GenerateSourceMode {
    return this.formValue().sourceMode;
  }

  public setSourceMode(mode: GenerateSourceMode): void {
    this.form.controls.sourceMode.setValue(mode);
  }

  /**
   * Offer a tutorial's whole example through the same review panel a saved
   * preset goes through, so a bulk write is always something the reader ticked
   * their way through rather than something a tutorial did to them.
   */
  public openBulkApply(example: GenerateFormValue): void {
    this.loadTitleKey.set('generate.learn.bulk_title');
    this.pendingLoad.set(example);
  }

  /**
   * React to any form change: refresh the style hints, and when the user leaves
   * advanced mode drop any lingering source-image state so a simple-mode request
   * can never carry a source the (now-hidden) source section still remembers.
   */
  private onFormChanged(): void {
    this.formValue.set(this.form.getRawValue());
    this.refreshForcedParams();
    if (
      this.form.controls.mode.value === 'simple' &&
      this.sourceState().mode !== 'none'
    ) {
      this.sourceState.set(DEFAULT_SOURCE_STATE);
      this.cachedSourceBlob = null;
      this.sourceBase64 = null;
    }
  }

  /**
   * Ask the model reference whether the form's selected model supports a
   * feature. "Any model" and a reference that has not loaded both answer null,
   * because gating is guidance and must never lock a user out on a guess.
   */
  private modelSupport(supports: (model: string) => boolean): boolean | null {
    const model = this.formValue().model.trim();
    // Read the baselines signal unconditionally so this recomputes when the
    // reference lands after the form has already settled.
    const loaded = this.modelReference.baselines() !== null;
    if (!loaded || model === '') {
      return null;
    }
    return supports(model);
  }

  private refreshForcedParams(): void {
    const applied = this.resolveApplied(this.form.getRawValue());
    this.forcedParams.set(applied?.forcedParams ?? null);
  }

  /**
   * Resolve the style the form currently selects into an {@link AppliedStyle},
   * or null when no style is selected (or its preset is not loaded yet). The
   * style's prompt/params are merged on top of the form's own at build time.
   */
  private resolveApplied(value: GenerateFormValue): AppliedStyle | null {
    if (!value.styleName) {
      return null;
    }
    const preset = this.stylePresets().get(value.styleName);
    if (!preset) {
      return null;
    }
    return applyStyle(preset, value.prompt, value.negativePrompt);
  }

  /**
   * The form value to actually submit/estimate. Advanced mode submits the form
   * as-is; simple mode strips advanced-only fields back to their defaults (see
   * {@link simpleModeValue}) so a simple request is clean and predictable.
   */
  private effectiveValue(): GenerateFormValue {
    const raw = this.form.getRawValue();
    const value = raw.mode === 'simple' ? simpleModeValue(raw) : raw;
    // A qrText typed before switching to a model that cannot serve the
    // qr_code workflow would make the horde reject the whole request; the
    // form disables the input in that state, and the built request (submit,
    // preview, estimate alike) must match what that disabled input implies.
    if (value.qrText.trim() !== '' && this.qrSupported() === false) {
      return { ...value, qrText: '' };
    }
    return value;
  }

  /**
   * Build the exact request this form would submit and show it in the shared
   * JSON modal, so a user can inspect the payload before generating. Mirrors the
   * request built in {@link onCreate} (the base64 source image is attached only
   * at submit time, so the preview shows the request without it).
   */
  public openPreview(): void {
    const effective = this.effectiveValue();
    const usesSource = effective.sourceMode !== 'none';
    const state = this.sourceState();
    const hasSourceImage = usesSource && state.sourceBlob !== null;
    const request = buildStyledImageRequest(
      effective,
      this.resolveApplied(effective),
      this.buildOptions(hasSourceImage),
    );
    this.previewRequest.set(request);
  }

  public closePreview(): void {
    this.previewRequest.set(null);
  }

  /** Load a saved/recent preset (from the form's presets menu) into the form. */
  public onApplyPreset(value: GenerateFormValue): void {
    this.pendingLoad.set(value);
  }

  public cancelLoad(): void {
    this.pendingLoad.set(null);
    this.loadTitleKey.set('generate.form.load_title');
    this.formRef()?.focusPresetsButton();
  }

  public onLoadBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancelLoad();
    }
  }

  /**
   * Apply the reviewed selection of a preset. `replace` restores the preset as
   * it was saved and then resets the parameters the user unticked, so the fields
   * the review panel never offers (batch size, worker and sharing preferences,
   * the saved mode and style) still come back with it. `overlay` grafts only the
   * ticked parameters onto the current form, and since a style would force its
   * own values back over them the form drops to advanced without one.
   *
   * Values come from the preset itself rather than from the request the panel
   * was shown, which only carries the fields the horde API has.
   */
  public onApplyPresetSelection(
    event: MetaApplyEvent,
    offeredKeys: readonly (keyof GenerateFormValue)[],
  ): void {
    const pending = this.pendingLoad();
    this.pendingLoad.set(null);
    this.loadTitleKey.set('generate.form.load_title');
    this.formRef()?.focusPresetsButton();
    if (!pending || event.keys.length === 0) {
      return;
    }
    const next: GenerateFormValue =
      event.mode === 'replace'
        ? { ...pending }
        : { ...this.form.getRawValue() };
    if (event.mode === 'replace') {
      const applied = new Set<keyof GenerateFormValue>(event.keys);
      for (const key of offeredKeys) {
        if (!applied.has(key)) {
          (next as Record<keyof GenerateFormValue, unknown>)[key] =
            DEFAULT_GENERATE_FORM_VALUE[key];
        }
      }
      // Nothing here can re-attach a source image, so a replace has to leave the
      // form describing a plain txt2img rather than a mode with no image.
      next.sourceMode = DEFAULT_GENERATE_FORM_VALUE.sourceMode;
      this.sourceState.set(DEFAULT_SOURCE_STATE);
      this.cachedSourceBlob = null;
      this.sourceBase64 = null;
    } else {
      for (const key of event.keys) {
        // Index assignment is sound: pending and next share the field's type.
        (next as Record<keyof GenerateFormValue, unknown>)[key] = pending[key];
      }
      next.mode = 'advanced';
      next.styleName = '';
    }
    this.form.setValue(next);
    this.form.markAsDirty();
    this.toast.success('generate.results.meta_applied', {
      transloco: true,
      messageParams: { count: event.keys.length },
    });
  }

  /**
   * Write a selection of one past image's parameters into the form. `replace`
   * starts from the form defaults so unchecked parameters reset; `overlay` starts
   * from the current form so they are left alone. Unlike "Load settings" this is
   * an explicit, itemised choice the user just made in the metadata panel, so it
   * applies without a second confirmation.
   */
  public async onApplyMeta(event: {
    request: ImageGenerationRequest;
    localId: string;
    keys: (keyof GenerateFormValue)[];
    mode: MetaApplyMode;
  }): Promise<void> {
    if (event.keys.length === 0) {
      return;
    }
    const source = requestToFormValue(event.request);
    const next: GenerateFormValue =
      event.mode === 'replace'
        ? { ...DEFAULT_GENERATE_FORM_VALUE }
        : { ...this.form.getRawValue() };
    for (const key of event.keys) {
      // Index assignment is sound: source and next share the field's type.
      (next as Record<keyof GenerateFormValue, unknown>)[key] = source[key];
    }
    // The applied parameters are advanced ones, and a selected style would force
    // its own values over the top of them, so neither survives an apply.
    next.mode = 'advanced';
    next.styleName = '';

    const usesSource = event.keys.some((key) =>
      SOURCE_DEPENDENT_KEYS.includes(key),
    );
    if (usesSource) {
      this.sourceState.set(DEFAULT_SOURCE_STATE);
      this.cachedSourceBlob = null;
      this.sourceBase64 = null;
    }
    this.form.setValue(next);
    this.form.markAsDirty();
    if (usesSource && next.sourceMode !== 'none') {
      await this.reattachSource(event.localId);
    }
    this.toast.success('generate.results.meta_applied', {
      transloco: true,
      messageParams: { count: event.keys.length },
    });
  }

  /**
   * Write one past image's whole request back into the form. `seed` decides what
   * the next request is: the image's own seed holds the picture still so a
   * changed setting is the only thing that moves, and null lets the horde pick a
   * fresh one, which is the same settings and a different picture.
   */
  public async onLoadSettings(event: {
    request: ImageGenerationRequest;
    localId: string;
    seed: string | null;
  }): Promise<void> {
    const next = requestToFormValue(event.request);
    next.seed = event.seed ?? '';
    // A stale source blob would otherwise outlive the settings that wanted it.
    this.sourceState.set(DEFAULT_SOURCE_STATE);
    this.cachedSourceBlob = null;
    this.sourceBase64 = null;
    this.form.setValue(next);
    this.form.markAsDirty();
    if (next.sourceMode !== 'none') {
      await this.reattachSource(event.localId);
    }
    this.formRef()?.focusPrompt();
    if (event.seed) {
      this.toast.success('generate.results.variation_loaded', {
        transloco: true,
        messageParams: { seed: event.seed },
      });
    } else {
      this.toast.success('generate.results.settings_loaded', {
        transloco: true,
      });
    }
  }

  /**
   * Attach a past result as the form's source image, exactly as a manual upload
   * would: the form is switched into advanced img2img first (the source section
   * only exists there, and simple mode drops any source), then the stored blob is
   * handed to the section itself.
   */
  public async onUseAsSource(event: {
    localId: string;
    imageId: string;
  }): Promise<void> {
    const images = await this.queue.getJobImages(event.localId);
    const image = images.find(
      (candidate) =>
        candidate.kind === 'result' && candidate.imageId === event.imageId,
    );
    if (!image) {
      this.toast.error('generate.results.reuse_failed', { transloco: true });
      return;
    }
    const section = await this.openSourceSection();
    if (!section) {
      this.toast.error('generate.results.reuse_failed', { transloco: true });
      return;
    }
    await section.applySource(image.blob);
    this.toast.success('generate.results.reuse_done', { transloco: true });
  }

  /**
   * Adopt an image pasted onto the page or dropped on the workspace as the
   * source image. It goes through the source section's own encode path, so a
   * dropped 8000px PNG is downscaled and re-encoded exactly as a picked file is.
   */
  public async onDroppedImage(file: File): Promise<void> {
    const section = await this.openSourceSection();
    if (!section) {
      this.toast.error('generate.source.attach_failed', { transloco: true });
      return;
    }
    await section.applyFile(file);
    this.toast.success('generate.source.attached', { transloco: true });
  }

  /** A paste or drop carried files, but no image among them. */
  public onRejectedImage(): void {
    this.toast.error('generate.source.not_an_image', { transloco: true });
  }

  /**
   * Put the form in advanced img2img (the only mode the source section exists in)
   * and hand back the section once it has rendered.
   */
  private async openSourceSection(): Promise<GenerateSourceImageComponent | null> {
    this.form.patchValue({
      mode: 'advanced',
      sourceMode:
        this.form.controls.sourceMode.value === 'none'
          ? 'img2img'
          : this.form.controls.sourceMode.value,
    });
    // The source section is rendered inside the advanced block, so it may only
    // exist after the change above has been rendered.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return this.sourceImageRef() ?? null;
  }

  /** Fill the prompt from a results-pane starter chip and focus the box. */
  public onUsePrompt(prompt: string): void {
    this.formRef()?.fillPrompt(prompt);
  }

  /**
   * Move keyboard focus to the results pane (the skip link's action). On narrow
   * viewports the panes stack, so the pane is scrolled to as well.
   */
  public skipToResults(event: Event): void {
    event.preventDefault();
    const pane = this.resultsRef()?.nativeElement;
    if (!pane) {
      return;
    }
    const reduceMotion = globalThis.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    pane.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });
    pane.focus({ preventScroll: true });
  }

  private async reattachSource(localId: string): Promise<void> {
    const ref = this.sourceImageRef();
    if (!ref) {
      return;
    }
    const images = await this.queue.getJobImages(localId);
    const source = images.find((image) => image.kind === 'source');
    if (source) {
      await ref.applySource(source.blob);
    }
  }

  public async onCreate(): Promise<void> {
    const promptControl = this.form.controls.prompt;
    if (promptControl.value.trim().length === 0) {
      promptControl.markAsTouched();
      return;
    }
    const effective = this.effectiveValue();
    const usesSource = effective.sourceMode !== 'none';
    const state = this.sourceState();
    if (usesSource && !state.valid) {
      this.sourceValidationVisible.set(true);
      return;
    }
    const hasSourceImage = usesSource && state.sourceBlob !== null;
    const request = buildStyledImageRequest(
      effective,
      this.resolveApplied(effective),
      this.buildOptions(hasSourceImage),
    );
    const sourceImages = usesSource ? this.buildEnqueueSources(state) : [];
    try {
      await this.queue.enqueue(
        request,
        sourceImages.length > 0 ? sourceImages : undefined,
        // The request itself keeps no trace of the style that shaped it, so the
        // selection is recorded on the job for the results grid to group by.
        effective.styleName ? { styleName: effective.styleName } : undefined,
      );
      // One submit is one use of the style, however many images it asks for.
      if (effective.styleName) {
        this.styleUsage.increment(effective.styleName);
      }
      // Keep the submitted settings in the recent-history list for quick reload.
      this.presets.pushRecent(this.form.getRawValue());
      this.toast.success('generate.form.enqueued', { transloco: true });
      // The submit itself is the signal a follow-along tutorial is finished, so
      // nothing has to watch the queue for one.
      this.tutorial.notifySubmitted();
    } catch (error) {
      console.error('Failed to enqueue generation:', error);
      this.toast.error('generate.form.enqueue_error', {
        transloco: true,
        details:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error),
      });
    }
  }

  /**
   * Adopt the latest source-section snapshot. Refreshes the cached source
   * base64 (used by the kudos dry run) only when the underlying blob changes,
   * hides the validation hint once the section is valid again, and re-estimates
   * so a controlnet/img2img cost difference shows without a form edit.
   */
  public onSourceState(state: GenerateSourceState): void {
    this.sourceState.set(state);
    if (state.valid) {
      this.sourceValidationVisible.set(false);
    }
    if (state.sourceBlob !== this.cachedSourceBlob) {
      this.cachedSourceBlob = state.sourceBlob;
      if (!this.isBrowser || state.sourceBlob === null) {
        this.sourceBase64 = null;
        void this.updateKudos();
      } else {
        void this.refreshSourceBase64(state.sourceBlob);
      }
    }
  }

  private async refreshSourceBase64(blob: Blob): Promise<void> {
    const encoded = await blobToBase64(blob);
    // A newer blob may have arrived while this one encoded; only keep ours.
    if (blob === this.cachedSourceBlob) {
      this.sourceBase64 = encoded;
      void this.updateKudos();
    }
  }

  private buildEnqueueSources(
    state: GenerateSourceState,
  ): EnqueueSourceImage[] {
    const sources: EnqueueSourceImage[] = [];
    if (state.sourceBlob) {
      sources.push({
        kind: 'source',
        blob: state.sourceBlob,
        mimeType: state.sourceBlob.type || 'image/webp',
      });
    }
    if (state.maskBlob) {
      sources.push({
        kind: 'mask',
        blob: state.maskBlob,
        mimeType: state.maskBlob.type || 'image/png',
      });
    }
    // Remix extras are only meaningful alongside a primary source image; the
    // horde rejects extra_source_images on any other source_processing.
    if (state.mode === 'remix' && state.sourceBlob) {
      (state.extras ?? []).forEach((extra, index) => {
        sources.push({
          kind: 'extra_source',
          blob: extra.blob,
          mimeType: extra.blob.type || 'image/webp',
          index,
          strength: extra.strength,
        });
      });
    }
    return sources;
  }

  private fetchModels(): void {
    this.aiHorde
      .getImageModels('all')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((models) => this.workerModels.set(models));
  }

  private fetchStyles(): void {
    zip(this.styles.getStyles(), this.styles.getCategoryGroups())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([summaries, groups]) => {
        this.stylePresets.set(
          new Map(summaries.map((summary) => [summary.name, summary.preset])),
        );
        this.styleGroups.set(
          groups.map((group) => ({
            category: group.category,
            names: group.styleNames,
          })),
        );
        // A style may already be selected from persisted state; surface its hints.
        this.refreshForcedParams();
      });
  }

  private persist(): void {
    this.db.store(STORAGE_KEY, stripEphemeralExtras(this.form.getRawValue()));
  }

  private async updateKudos(): Promise<void> {
    const effective = this.effectiveValue();
    const usesSource = effective.sourceMode !== 'none';
    const hasSourceImage = usesSource && this.sourceBase64 !== null;
    // The horde rejects an empty prompt even for a dry run, so estimate against
    // a placeholder while leaving the actual form untouched. The styled request
    // is what the user will actually submit, so the estimate must reflect it.
    const base: GenerateFormValue = {
      ...effective,
      prompt: effective.prompt.trim() || '_',
    };
    const request = buildStyledImageRequest(base, this.resolveApplied(base), {
      ...this.buildOptions(hasSourceImage),
    });
    // Attach the source image (but never the mask) so controlnet/img2img cost
    // differences are reflected in the estimate.
    if (hasSourceImage && this.sourceBase64 !== null) {
      request.source_image = this.sourceBase64;
    }
    const seq = ++this.estimateSeq;
    this.estimating.set(true);
    try {
      const kudos = await this.queue.estimateKudos(request);
      if (seq === this.estimateSeq) {
        this.kudos.set(kudos);
      }
    } catch {
      if (seq === this.estimateSeq) {
        this.kudos.set(null);
      }
    } finally {
      if (seq === this.estimateSeq) {
        this.estimating.set(false);
      }
    }
  }

  /** Contract inputs shared by preview, dry-run estimation, and submission. */
  private buildOptions(hasSourceImage: boolean) {
    return {
      hasSourceImage,
      samplerContract: this.samplerContract(),
      baselineForModel: (modelName: string) =>
        this.modelReference.baselineFor(modelName),
    };
  }

  // --- Glossary: what this page is made of ---------------------------------

  private readonly glossary = inject(GlossaryService);
  private readonly anchors = inject(TutorialAnchorService);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  /**
   * Tell the site-wide glossary what the studio is made of, so a reader who
   * opens it here is offered the eight areas of the control panel rather than
   * only the dictionary. Each area is a control: pressing it closes the glossary
   * and points at the card, which is the answer to "where is that?" that a list
   * of definitions cannot give.
   */
  private registerGlossaryContext(): void {
    this.glossary.registerPageContext({
      pageId: STUDIO_GLOSSARY_PAGE_ID,
      pageTitleKey: 'help.glossary.page.generate_image',
      relevantTermIds: [...STUDIO_GLOSSARY_TERM_IDS],
      // Read rather than pressed: an entry here names a button the reader can
      // already see, so pointing at it would take them where they already are.
      controls: STUDIO_CONTROLS.map((control) => ({
        id: control.id,
        titleKey: control.labelKey,
        descriptionKey: control.bodyKey,
        iconName: control.icon,
      })),
      entries: PANEL_SECTION_IDS.map((id) => {
        const identity = SECTION_IDENTITIES[id];
        return {
          id,
          titleKey: identity.labelKey,
          descriptionKey: `generate.reference.section_hint.${id}`,
          iconName: identity.icon,
          // The panel's hue classes are declared inside `.gen-studio` and the
          // glossary is mounted outside it, so the modal has its own set.
          iconColorClass: `glossary-sec--${id}`,
          action: () => this.showSection(identity.className),
        };
      }),
    });
    this.destroyRef.onDestroy(() =>
      this.glossary.clearPageContext(STUDIO_GLOSSARY_PAGE_ID),
    );
  }

  /**
   * Bring one of the panel's cards onto the screen and ring it, in the same
   * gesture a try-it chip uses. A card the reader cannot currently see is one
   * the simple panel does not draw, so the panel is opened out and the pointing
   * waits for the card to exist; no hue is passed, because the card is already
   * wearing its own.
   */
  private showSection(className: string): void {
    if (!this.isBrowser) {
      return;
    }
    const card = this.document.querySelector<HTMLElement>(
      `.gs-panel .${className}`,
    );
    if (card) {
      this.anchors.flash(card);
      return;
    }
    if (this.currentMode() === 'advanced') {
      return;
    }
    this.setMode('advanced');
    afterNextRender(
      () => {
        const revealed = this.document.querySelector<HTMLElement>(
          `.gs-panel .${className}`,
        );
        if (revealed) {
          this.anchors.flash(revealed);
        }
      },
      { injector: this.injector },
    );
  }
}
