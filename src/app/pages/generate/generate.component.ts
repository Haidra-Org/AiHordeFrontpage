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
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { debounceTime, zip } from 'rxjs';
import { AiHordeService } from '../../services/ai-horde.service';
import { GenerationQueueService } from '../../services/generation-queue.service';
import { ToastService } from '../../services/toast.service';
import { StudioHandoffService } from '../../services/studio-handoff.service';
import { DatabaseService } from '../../services/database.service';
import { TranslatorService } from '../../services/translator.service';
import { HordeStylesService } from '../../services/horde-styles.service';
import {
  AppliedStyle,
  StyleForcedParams,
  StyleRecord,
  applyStyle,
  fromNativeImageStyle,
  fromPreset,
  parseStyleRecordKey,
} from '../../services/style-record';
import { StyleService } from '../../services/style.service';
import { setPageTitle } from '../../helper/page-title';
import { ActiveModel, mergeModelList } from '../../types/active-model';
import { EnqueueSourceImage } from '../../types/generation-job';
import {
  ImageExtraSourceImage,
  ImageGenerationRequest,
} from '../../types/generation';
import { ImagePostProcessor } from '../../types/style';
import { GeneratePresetsService } from '../../services/generate-presets.service';
import { StyleUsageService } from '../../services/style-usage.service';
import { ModelReferenceService } from '../../services/model-reference.service';
import {
  LicensingService,
  postProcessorCategory,
  prohibitedFacts,
  type NamedLicensingFact,
} from '../../services/licensing.service';
import { AuthService } from '../../services/auth.service';
import { ActiveGenerationsService } from '../../services/active-generations.service';
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
import { StudioPasteModalComponent } from './studio-paste-modal/studio-paste-modal.component';
import { GenerateReviewModalComponent } from './generate-review-modal/generate-review-modal.component';
import { GenerateBlockersModalComponent } from './generate-blockers-modal/generate-blockers-modal.component';
import {
  GenerateWelcomeComponent,
  WELCOMED_KEY,
} from './generate-welcome/generate-welcome.component';
import { IconComponent } from '../../components/icon/icon.component';
import { GenerateResultsPanelComponent } from './generate-results-panel/generate-results-panel.component';
import {
  GenerateSourceImageComponent,
  GenerateSourceState,
  SourceSettingsOffer,
} from './generate-source-image/generate-source-image.component';
import {
  SourceSettingsChoice,
  SourceSettingsModalComponent,
} from './source-settings-modal/source-settings-modal.component';
import {
  BOUNDED_FIELD_NAMES,
  BOUNDED_FIELD_RANGES,
  DEFAULT_GENERATE_FORM_VALUE,
  FACE_FIXERS,
  GenerateFormValue,
  GenerateSourceMode,
  KudosBreakdownLine,
  PanelSize,
  WaitEstimate,
  buildImageRequest,
  buildStyledImageRequest,
  styledFormValue,
  coerceFormValue,
  createGenerateForm,
  detachedStyleSections,
  kudosAffordability,
  kudosBreakdown,
  modelWaitEstimate,
  promptHistoryFromJobs,
  requestModelNames,
  requestToFormValue,
  stripEphemeralExtras,
  UPSCALERS,
  workerRequirementForRequest,
} from './generate-form.model';
import {
  WorkerPoolService,
  evaluateWorkerFeasibility,
  type WorkerFeasibility,
  type WorkerRequirement,
} from '../../services/worker-pool.service';
import {
  ImageMetaPanelComponent,
  MetaApplyEvent,
  MetaApplyMode,
} from './image-meta-panel/image-meta-panel.component';
import {
  PANEL_SECTION_IDS,
  SECTION_IDENTITIES,
  SectionId,
} from '../../content/sections';
import {
  FieldRejection,
  RequestWarning,
  evaluateRequestLint,
  type FieldAnchorId,
  type LintModelSelection,
  rejectionField,
  rejectionWatchValue,
  type SubmitBlocker,
  submitBlockers,
  warningsInSection,
} from './request-lint';
import {
  StudioLinkPayload,
  parseStudioLink,
  studioLinkAddress,
  studioPayloadFromImage,
} from './studio-link';
import { copyToClipboard } from '../../helper/copy-to-clipboard';
import { ResultActionConfirmComponent } from './result-action-confirm/result-action-confirm.component';
import {
  ResultControlAction,
  ResultControlActionRequest,
} from './result-control-action';
import {
  StudioControlCheckpoint,
  StudioControlHistoryService,
} from './studio-control-history.service';

const DEFAULT_SOURCE_STATE: GenerateSourceState = {
  mode: 'none',
  sourceBlob: null,
  maskBlob: null,
  valid: true,
  validationMessage: null,
};

/** Whether two lists hold the same blobs in the same order. */
function sameBlobs(a: readonly Blob[], b: readonly Blob[]): boolean {
  return a.length === b.length && a.every((blob, index) => blob === b[index]);
}

const STORAGE_KEY = 'aihorde.generate.form';

/** Whether Generate opens the review dialog instead of sending straight away. */
const REVIEW_KEY = 'aihorde.generate.review_before_send';

/** Whether Generate stays at the foot of the screen on a narrow viewport. */
const PIN_GENERATE_KEY = 'aihorde.generate.pinned_generate';

/** Whether result actions ask before changing the current controls. */
const RESULT_ACTION_CONFIRM_KEY = 'aihorde.generate.confirm_result_actions';

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

/** Everything one press of Generate would send, built once and sent unchanged. */
interface SubmitPlan {
  request: ImageGenerationRequest;
  sourceImages: EnqueueSourceImage[];
  /** The selected style's key, or '' when none is selected. */
  styleKey: string;
  /** That style's name as the reader saw it, for the results grid to label by. */
  styleName: string;
}

/**
 * Form fields that only mean anything with a source image attached. Applying any
 * of them from a past generation has to re-attach that generation's stored
 * source, exactly as loading its full settings does.
 */
const SOURCE_DEPENDENT_KEYS: readonly (keyof GenerateFormValue)[] = [
  'sourceMode',
  'denoising_strength',
  'control_type',
  'control_strength',
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
    StudioPasteModalComponent,
    SourceSettingsModalComponent,
    GenerateReviewModalComponent,
    GenerateBlockersModalComponent,
    GenerateWelcomeComponent,
    ResultActionConfirmComponent,
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
  private readonly transloco = inject(TranslocoService);
  private readonly styles = inject(HordeStylesService);
  private readonly styleApi = inject(StyleService);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);
  private readonly presets = inject(GeneratePresetsService);
  private readonly styleUsage = inject(StyleUsageService);
  private readonly modelReference = inject(ModelReferenceService);
  private readonly licensing = inject(LicensingService);
  private readonly workerPool = inject(WorkerPoolService);
  private readonly controlHistory = inject(StudioControlHistoryService);
  private readonly auth = inject(AuthService);
  private readonly activeGenerations = inject(ActiveGenerationsService);
  private readonly samplerConstraints = inject(SamplerConstraintsService);
  private readonly tutorial = inject(TutorialEngineService);
  private readonly tryIt = inject(GsTryItService);
  private readonly sweeps = inject(SweepLibraryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly handoff = inject(StudioHandoffService);
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
  private readonly resultsPanelRef = viewChild(GenerateResultsPanelComponent);

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
  /**
   * Key -> style, so a picked style can be resolved and applied. Presets land
   * here when the catalogue loads; a published style joins them as soon as one
   * is reached, whether by a link or by a pick in the style browser.
   */
  public readonly styleRecords = signal<Map<string, StyleRecord>>(new Map());
  /** Params the currently-selected style forces, for "set by style" hints. */
  public readonly forcedParams = signal<StyleForcedParams | null>(null);

  public readonly sourceState =
    signal<GenerateSourceState>(DEFAULT_SOURCE_STATE);
  /** Whether the source section's validation hint should be shown. */
  public readonly sourceValidationVisible = signal(false);

  /**
   * Whether the settings that arrived in a link describe work on a picture the
   * link could not carry. The section says so once, and stops as soon as a
   * picture is added.
   */
  public readonly linkSourceMissing = signal(false);

  /** The built request shown in the pre-submit preview modal, or null. */
  public readonly previewRequest = signal<unknown>(null);

  /** Whether the box that takes settings from somewhere else is showing. */
  public readonly pasteOpen = signal(false);

  /**
   * A picture that turned out to carry the settings that made it, waiting on
   * the reader to say what they want taken from it. Null while nothing is asked.
   */
  public readonly settingsOffer = signal<SourceSettingsOffer | null>(null);

  /**
   * Whether Generate stops at the review dialog instead of sending. Off by
   * default: the studio's own habit is press-and-go, and this is the reader
   * asking for a look first.
   */
  public readonly reviewBeforeSend = signal(this.db.get(REVIEW_KEY) === true);

  /**
   * Whether Generate is kept at the foot of a narrow screen. Off by default:
   * the bar costs a band of a phone's screen, and it only pays for itself for
   * someone sending one request after another.
   */
  public readonly pinGenerate = signal(this.db.get(PIN_GENERATE_KEY) === true);

  /** Result actions ask before replacing controls unless the reader opts out. */
  public readonly confirmResultActions = signal(
    this.db.get(RESULT_ACTION_CONFIRM_KEY) !== false,
  );

  /** The result action awaiting confirmation, or null when none is armed. */
  public readonly pendingResultAction =
    signal<ResultControlActionRequest | null>(null);

  /** Newest first; every entry remains until restored, including across reloads. */
  public readonly controlUndoHistory = signal<StudioControlCheckpoint[]>([]);
  public readonly latestControlUndo = computed(
    () => this.controlUndoHistory()[0] ?? null,
  );
  public readonly latestControlUndoAction = computed(
    () => this.latestControlUndo()?.action ?? null,
  );

  /** What the review dialog is holding, or null while nothing awaits a look. */
  public readonly pendingReview = signal<SubmitPlan | null>(null);

  /**
   * What a press of Generate ran into, or null while nothing is standing in the
   * way. Generate itself stays live: a button that greys out says only that
   * something somewhere is wrong, and on a phone the line explaining it is
   * often folded away or off the screen.
   */
  public readonly pendingBlockers = signal<SubmitBlocker[] | null>(null);

  /** Whether the first-visit offer has been answered for good, here or before. */
  private readonly welcomeStored = signal(this.db.get(WELCOMED_KEY) === true);
  /** Whether the reader has put the first-visit offer away for this visit. */
  private readonly welcomeClosed = signal(false);

  /** Generations that have come back, which retires the first-visit copy. */
  public readonly finishedCount = computed(
    () =>
      this.queue.finishedJobs().filter((job) => job.status === 'done').length,
  );

  /**
   * Whether a reader who has not been here before is being offered the ways in.
   * Browser-only: the answer lives in local storage, which a server render
   * cannot read, and asking a reader who answered long ago is worse than the
   * offer arriving with hydration.
   *
   * Nothing else may be over the page at the time. A tutorial, the reference
   * entry and the two dialogs Generate can raise are each something the reader
   * asked for; a question they did not ask does not go on top of one.
   */
  public readonly showWelcome = computed(
    () =>
      this.isBrowser &&
      !this.welcomeStored() &&
      !this.welcomeClosed() &&
      !this.tutorial.active() &&
      !this.tutorial.parked() &&
      !this.helpDock.isOpen() &&
      this.pendingReview() === null &&
      this.pendingBlockers() === null,
  );

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
   * Whether the selected style pins a model over the form's own pick, with the
   * reader not having taken the model back from it.
   */
  private readonly stylePinsModel = computed(() => {
    const forced = this.forcedParams();
    return (
      forced?.model !== undefined &&
      !detachedStyleSections(this.formValue()).includes('model')
    );
  });

  /**
   * The model the request would actually run on: the one a style pins, else the
   * form's own pick. Every model-dependent answer reads this, so what a style
   * applies decides which features are offered and which sizes are advised
   * rather than the pick it replaced.
   */
  public readonly effectiveModel = computed(() =>
    this.stylePinsModel()
      ? (this.forcedParams()?.model ?? '')
      : this.formValue().model,
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
    const model = this.effectiveModel().trim();
    // Read the signal unconditionally so this recomputes when the reference
    // lands after the form has already settled.
    const baselines = this.modelReference.baselines();
    return baselines === null || model === ''
      ? null
      : this.modelReference.baselineFor(model);
  });

  /**
   * Every model the request would accept with the baseline each resolves to,
   * primary first. This is what the model-dependent lint rules are judged
   * against: the request only has to be servable by one of them.
   */
  public readonly selectedModels = computed<readonly LintModelSelection[]>(
    () => {
      const value = this.formValue();
      // Read unconditionally so the answers refresh when the reference lands.
      const baselines = this.modelReference.baselines();
      // A style that pins a model replaces the whole list, so the extra models
      // are no part of the request that would be sent.
      const extras = this.stylePinsModel() ? [] : value.extraModels;
      return requestModelNames(this.effectiveModel(), extras).map((name) => ({
        name,
        baseline:
          baselines === null ? null : this.modelReference.baselineFor(name),
      }));
    },
  );

  /** The settings the selected model recommends, or null when it names none. */
  public readonly modelRequirements = computed(() => {
    const model = this.effectiveModel().trim();
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
   * The value linted is the one that would actually be submitted: every setting
   * the panel holds is submitted, whether the group holding it is open or
   * folded, and a selected style's pins stand over the controls they freeze.
   */
  public readonly lintWarnings = computed<readonly RequestWarning[]>(() => {
    const value = this.styledValue();
    const state = this.sourceState();
    return evaluateRequestLint({
      value,
      baseline: this.modelBaseline(),
      selectedModels: this.selectedModels(),
      requirements: this.modelRequirements(),
      hasSourceImage: state.sourceBlob !== null,
      sourceWidth: state.sourceWidth ?? null,
      sourceHeight: state.sourceHeight ?? null,
      contract: this.samplerContract(),
      workers: this.workerPool.workers(),
      requirement: this.workerRequirement(),
    }).concat(this.licensingWarnings());
  });

  /**
   * The licence advisories the request earns. They are assembled here rather
   * than inside {@link evaluateRequestLint}, which is a pure table over the
   * request and knows nothing of a reference that is fetched; a licence that
   * could not be read must not become a claim about the licence.
   *
   * Only a licence that forbids commercial use is loud. The quiet facts sit
   * under the controls themselves, one line each.
   */
  private readonly licensingWarnings = computed<readonly RequestWarning[]>(
    () => {
      const value = this.styledValue();
      const warnings: RequestWarning[] = [];

      const models: NamedLicensingFact[] = [];
      for (const selection of this.selectedModels()) {
        const fact = this.licensing.commercialUse(
          'image_generation',
          selection.name,
        )();
        if (fact !== null) {
          models.push({
            name: selection.name,
            category: 'image_generation',
            fact,
          });
        }
      }
      const pushProhibited = (
        id: string,
        section: SectionId,
        anchor: FieldAnchorId,
        entries: readonly NamedLicensingFact[],
      ): void => {
        const prohibited = prohibitedFacts(entries);
        if (prohibited.length === 0) {
          return;
        }
        warnings.push({
          id,
          section,
          anchor,
          key: 'generate.lint.licensing_prohibited',
          params: {
            what: prohibited.map((entry) => entry.name).join(', '),
            licence: [
              ...new Set(prohibited.map((entry) => entry.fact.licenseId)),
            ].join(', '),
          },
        });
      };

      pushProhibited('licensing_model', 'model', 'model', models);

      if (value.sourceMode === 'controlnet' && value.control_type !== '') {
        pushProhibited(
          'licensing_control',
          'source',
          'control_type',
          this.licensing.controlTypeFacts(
            value.control_type,
            this.modelBaseline(),
            value.image_is_control,
          )(),
        );
      }

      const post: NamedLicensingFact[] = [];
      for (const processor of value.post_processing) {
        if (
          !UPSCALERS.includes(processor) &&
          !FACE_FIXERS.includes(processor)
        ) {
          continue;
        }
        const category = postProcessorCategory(processor);
        const fact = this.licensing.commercialUse(category, processor)();
        if (fact !== null) {
          post.push({ name: processor, category, fact });
        }
      }
      // The go-to points at whichever of the two controls carries the first
      // refusal, so a reader sent to it lands on a select they can change.
      const firstProhibited = prohibitedFacts(post)[0];
      pushProhibited(
        'licensing_post',
        'finishing',
        firstProhibited !== undefined &&
          (FACE_FIXERS as readonly string[]).includes(firstProhibited.name)
          ? 'facefixer'
          : 'upscaler',
        post,
      );

      return warnings;
    },
  );

  /**
   * What the estimate is made of. The estimate is priced from the styled
   * request, so the breakdown explaining it is read off the same values.
   */
  public readonly kudosLines = computed<readonly KudosBreakdownLine[]>(() =>
    kudosBreakdown(this.styledValue(), this.samplerContract()),
  );

  /**
   * The form's value with the selected style's pins over it: what the request
   * would be built from. Everything that describes the pending request to the
   * reader reads this rather than the raw form value.
   */
  private readonly styledValue = computed<GenerateFormValue>(() => {
    const value = this.formValue();
    return styledFormValue(value, this.resolveApplied(value));
  });

  /**
   * What the request would ask of a worker, refreshed on the same debounce as
   * the estimate rather than per keystroke: the answer only changes when the
   * settings settle, and every keystroke would re-scan the whole worker list.
   */
  private readonly workerRequirement = signal<WorkerRequirement | null>(null);

  /**
   * How many workers could take the request, and what to say when none can.
   * Null until the request has been built or while the worker list is unknown,
   * which is what keeps a failed fetch from putting a warning on the footer.
   */
  public readonly feasibility = computed<WorkerFeasibility | null>(() => {
    const requirement = this.workerRequirement();
    return requirement === null
      ? null
      : evaluateWorkerFeasibility(this.workerPool.workers(), requirement);
  });

  /** What the workers carrying each model can do, for the model picker. */
  public readonly modelFacts = this.workerPool.modelFacts;

  /** Every worker the horde is listing, for the routing picker. */
  public readonly activeWorkers = this.workerPool.workers;

  /**
   * What the reader's kudos balance buys at the quoted price. Null for an
   * anonymous reader, who has no balance the studio can read, and while no
   * quote has come back.
   */
  public readonly affordability = computed(() =>
    kudosAffordability(this.auth.kudos(), this.kudos()),
  );

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
  /**
   * The reference entry a `?` note opens is mounted in the results pane, and the
   * widest panel hides that pane: opening one there would succeed into nothing,
   * so the panel steps back to the width that still shows the results and the
   * entry arrives where the reader is looking for it.
   *
   * It stays at that width once the entry closes. A reader following notes
   * reads several in a row, and a panel that snapped back to full between them
   * would take the pane away again on every one.
   */
  private readonly dockNeedsResults = effect(() => {
    const open = this.helpDock.isOpen();
    untracked(() => {
      if (open && this.panelSize() === 'full') {
        this.panelSize.set('double');
      }
    });
  });

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
  /**
   * The remix extras as the request carries them, recomputed only when the
   * attached blobs change. The horde prices a remix by everything it is given,
   * so an estimate that left these off would quote a plain img2img.
   */
  private extraSourceImages: ImageExtraSourceImage[] = [];
  private cachedExtraBlobs: readonly Blob[] = [];

  /**
   * The source mode a link asked for, held while its settings wait in the
   * review panel. A link cannot carry the picture, so the mode has to survive
   * the apply that would otherwise drop it, and the section asks for one.
   */
  private pendingLinkSourceMode: GenerateSourceMode | null = null;

  /**
   * A style key that arrived in a link, held until the presets have loaded so a
   * style nobody publishes any more can be answered rather than sit selected.
   */
  private pinnedStyleKey: string | null = null;

  /** Whether the preset catalogue has landed, so a pinned key can be judged. */
  private stylesLoaded = false;

  constructor() {
    afterNextRender(() => {
      setPageTitle(
        this.translator,
        this.title,
        this.destroyRef,
        'generate.title',
      );
      void this.loadControlUndoHistory();
      void this.consumeHandoff();
    });

    if (this.isBrowser) {
      // Anything already running under this key belongs in the results grid,
      // including what another device started.
      this.activeGenerations.start();
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
      this.applyStudioLink();
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

    // A reader who has a picture back does not need to be asked how much they
    // want explained, whatever they did with the offer, so the first result
    // retires it for good.
    effect(() => {
      if (this.finishedCount() > 0) {
        untracked(() => this.retireWelcome());
      }
    });

    this.watchViewport();
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
    return this.isNarrow();
  }

  /** Panel-width controls are desktop-only; mobile stacks panes vertically. */
  public panelCanExpand(): boolean {
    return !this.isNarrow();
  }

  /** The CSS mobile breakpoint as a signal: crossing it re-renders what it
      hides, rather than leaving a stale control until some other pass runs.
      The panel reads it too, so there is one listener rather than one per
      component that needs to know which layout it is drawing for. */
  public readonly isNarrow = signal(false);

  private watchViewport(): void {
    const mq = globalThis.matchMedia?.('(max-width: 1023.98px)');
    if (!mq) return;
    this.isNarrow.set(mq.matches);
    const onChange = (event: MediaQueryListEvent): void =>
      this.isNarrow.set(event.matches);
    mq.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => mq.removeEventListener('change', onChange));
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

  /**
   * Read off the tracked value rather than the control, so a surface asking
   * inside a computed is re-run when the source mode changes: a try-it chip
   * that only appears on a sourced request has to appear and disappear with it.
   */
  public currentSourceMode(): GenerateSourceMode {
    return this.formValue().sourceMode;
  }

  public setSourceMode(mode: GenerateSourceMode): void {
    this.form.controls.sourceMode.setValue(mode);
  }

  public openFieldGroup(anchorId: string): boolean {
    return this.formRef()?.openGroupForAnchor(anchorId) ?? false;
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
   * React to any form change: refresh the style hints. The source section is
   * shown in both detail levels, so its state stands whichever one is current.
   */
  private onFormChanged(): void {
    this.formValue.set(this.form.getRawValue());
    this.refreshForcedParams();
  }

  /**
   * Ask the model reference whether the model the request would run on supports
   * a feature. "Any model" and a reference that has not loaded both answer null,
   * because gating is guidance and must never lock a user out on a guess.
   */
  private modelSupport(supports: (model: string) => boolean): boolean | null {
    const model = this.effectiveModel().trim();
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
    const record = this.styleRecords().get(value.styleName);
    if (!record) {
      return null;
    }
    return applyStyle(record, value.prompt, value.negativePrompt);
  }

  /**
   * The form value to actually submit/estimate: the form's own value, save for
   * the one field the panel disables without being able to clear.
   */
  private effectiveValue(): GenerateFormValue {
    const value = this.form.getRawValue();
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

  /**
   * Hand these settings over as an address somebody else can open. The style is
   * named openly beside the packed request rather than baked into it, so the
   * recipient gets the style itself and whatever it forces, as it stands today.
   */
  public async copyStudioLink(): Promise<void> {
    const effective = this.effectiveValue();
    const request = buildImageRequest(effective, this.buildOptions(false));
    const address = studioLinkAddress(
      this.router,
      request,
      effective.styleName.trim() || null,
    );
    if (address === null) {
      this.toast.error('generate.link.too_large', { transloco: true });
      return;
    }
    if (await copyToClipboard(address)) {
      this.toast.success('generate.link.copied', { transloco: true });
    }
  }

  public openPaste(): void {
    this.pasteOpen.set(true);
  }

  public closePaste(): void {
    this.pasteOpen.set(false);
  }

  /**
   * Settings pasted in go the way a followed link goes: through the review
   * panel, so a draft already in the form is never replaced without a look.
   */
  public onPasted(payload: StudioLinkPayload): void {
    this.pasteOpen.set(false);
    if (payload.kind === 'simple') {
      this.applyLinkedFields(payload);
      return;
    }
    this.pinnedStyleKey = payload.styleKey;
    this.offerLinkedRequest(payload);
    this.answerPinnedStyle();
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
   * the saved style) still come back with it. `overlay` grafts only the ticked
   * parameters onto the current form, and since a style would force its own
   * values back over them the form takes the graft without one.
   *
   * Values come from the preset itself rather than from the request the panel
   * was shown, which only carries the fields the horde API has.
   */
  public onApplyPresetSelection(
    event: MetaApplyEvent,
    offeredKeys: readonly (keyof GenerateFormValue)[],
  ): void {
    const pending = this.pendingLoad();
    const linkSourceMode = this.pendingLinkSourceMode;
    this.pendingLoad.set(null);
    this.pendingLinkSourceMode = null;
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
      // form describing a plain txt2img rather than a mode with no image. The
      // one exception is a link, which named a mode the reader chose to follow:
      // that mode stands, and the source section asks for the missing picture.
      next.sourceMode =
        linkSourceMode ?? DEFAULT_GENERATE_FORM_VALUE.sourceMode;
      this.linkSourceMissing.set(linkSourceMode !== null);
      this.sourceState.set(DEFAULT_SOURCE_STATE);
      this.clearSourceEncodings();
    } else {
      for (const key of event.keys) {
        // Index assignment is sound: pending and next share the field's type.
        (next as Record<keyof GenerateFormValue, unknown>)[key] = pending[key];
      }
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
    const checkpoint = this.controlCheckpoint('settings');
    const source = requestToFormValue(event.request);
    const next: GenerateFormValue =
      event.mode === 'replace'
        ? { ...DEFAULT_GENERATE_FORM_VALUE }
        : { ...this.form.getRawValue() };
    for (const key of event.keys) {
      // Index assignment is sound: source and next share the field's type.
      (next as Record<keyof GenerateFormValue, unknown>)[key] = source[key];
    }
    // A selected style would force its own values over the top of the applied
    // parameters, so it does not survive an apply.
    next.styleName = '';

    const usesSource = event.keys.some((key) =>
      SOURCE_DEPENDENT_KEYS.includes(key),
    );
    if (usesSource) {
      this.sourceState.set(DEFAULT_SOURCE_STATE);
      this.clearSourceEncodings();
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
    this.keepControlCheckpoint(checkpoint);
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
    await this.applyLoadedSettings(event);
  }

  private async applyLoadedSettings(event: {
    request: ImageGenerationRequest;
    localId: string;
    seed: string | null;
  }): Promise<boolean> {
    const next = requestToFormValue(event.request);
    next.seed = event.seed ?? '';
    // A stale source blob would otherwise outlive the settings that wanted it.
    this.sourceState.set(DEFAULT_SOURCE_STATE);
    this.clearSourceEncodings();
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
    return true;
  }

  /**
   * Attach a past result as the form's source image, exactly as a manual upload
   * would: the form is switched to img2img first, then the stored blob is handed
   * to the section itself.
   */
  public async onUseAsSource(event: {
    localId: string;
    imageId: string;
  }): Promise<boolean> {
    const images = await this.queue.getJobImages(event.localId);
    const image = images.find(
      (candidate) =>
        candidate.kind === 'result' && candidate.imageId === event.imageId,
    );
    if (!image) {
      this.toast.error('generate.results.reuse_failed', { transloco: true });
      return false;
    }
    const section = await this.openSourceSection();
    if (!section) {
      this.toast.error('generate.results.reuse_failed', { transloco: true });
      return false;
    }
    await section.applySource(image.blob);
    this.toast.success('generate.results.reuse_done', { transloco: true });
    return true;
  }

  /** Guard every result action, regardless of which tile or menu emitted it. */
  public onResultControlAction(event: ResultControlActionRequest): void {
    if (this.confirmResultActions()) {
      this.pendingResultAction.set(event);
      return;
    }
    void this.applyResultControlAction(event);
  }

  public cancelResultControlAction(): void {
    this.pendingResultAction.set(null);
  }

  public confirmResultControlAction(event: { dontAskAgain: boolean }): void {
    const pending = this.pendingResultAction();
    this.pendingResultAction.set(null);
    if (event.dontAskAgain) {
      this.setConfirmResultActions(false);
    }
    if (pending) {
      void this.applyResultControlAction(pending);
    }
  }

  /** Remember the confirmation preference and expose the same switch in Options. */
  public setConfirmResultActions(on: boolean): void {
    this.confirmResultActions.set(on);
    this.db.store(RESULT_ACTION_CONFIRM_KEY, on);
  }

  private async applyResultControlAction(
    event: ResultControlActionRequest,
  ): Promise<void> {
    const checkpoint = this.controlCheckpoint(event.action);
    let applied = false;
    if (event.action === 'source' && event.imageId) {
      applied = await this.onUseAsSource({
        localId: event.localId,
        imageId: event.imageId,
      });
    } else if (event.request) {
      applied = await this.applyLoadedSettings({
        request: event.request,
        localId: event.localId,
        seed: event.action === 'variation' ? (event.seed ?? null) : null,
      });
    }
    if (applied) {
      this.keepControlCheckpoint(checkpoint);
      this.resultsPanelRef()?.finishControlAction();
    }
  }

  private controlCheckpoint(
    action: ResultControlAction,
  ): StudioControlCheckpoint {
    const source = this.sourceState();
    return {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      action,
      form: structuredClone(this.form.getRawValue()),
      source: {
        ...source,
        extras: source.extras?.map((extra) => ({ ...extra })),
      },
    };
  }

  private keepControlCheckpoint(checkpoint: StudioControlCheckpoint): void {
    this.controlUndoHistory.update((history) => [checkpoint, ...history]);
    void this.controlHistory
      .push(checkpoint)
      .catch((error) =>
        console.warn('Could not persist studio control undo history.', error),
      );
  }

  private async loadControlUndoHistory(): Promise<void> {
    try {
      const stored = await this.controlHistory.list();
      this.controlUndoHistory.update((current) => {
        const currentIds = new Set(current.map((entry) => entry.id));
        return [
          ...current,
          ...stored.filter((entry) => !currentIds.has(entry.id)),
        ].sort((a, b) => b.createdAt - a.createdAt);
      });
    } catch (error) {
      console.warn('Could not restore studio control undo history.', error);
    }
  }

  /** Restore the newest checkpoint and leave the next one available. */
  public async undoLastResultAction(): Promise<void> {
    const checkpoint = this.latestControlUndo();
    if (!checkpoint) {
      return;
    }
    this.form.setValue(structuredClone(checkpoint.form));
    this.form.markAsDirty();
    this.sourceState.set(DEFAULT_SOURCE_STATE);
    this.clearSourceEncodings();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await this.sourceImageRef()?.applyDraft(checkpoint.source);
    this.controlUndoHistory.update((history) =>
      history.filter((entry) => entry.id !== checkpoint.id),
    );
    await this.controlHistory.remove(checkpoint.id);
    this.toast.success('generate.results.undo_restored', { transloco: true });
    this.formRef()?.focusPrompt();
  }

  /**
   * Adopt an image pasted onto the page or dropped on the workspace as the
   * source image. It goes through the source section's own encode path, so a
   * dropped 8000px PNG is downscaled and re-encoded exactly as a picked file is.
   *
   * A picture that carries the settings that made it is asked about before
   * anything is attached, because attaching it is only one of the three things
   * the reader might have dropped it for.
   */
  public async onDroppedImage(file: File): Promise<void> {
    const payload = await studioPayloadFromImage(file);
    if (payload !== null) {
      this.settingsOffer.set({ file, payload });
      return;
    }
    await this.attachSourceFile(file);
  }

  /** The source card found settings in a picture it was handed. */
  public onSourceSettingsOffer(offer: SourceSettingsOffer): void {
    this.settingsOffer.set(offer);
  }

  public cancelSettingsOffer(): void {
    this.settingsOffer.set(null);
  }

  /**
   * Act on what the reader wants taken from such a picture. Settings go through
   * the review panel wherever they are wanted, the way a followed link's do, so
   * a draft already in the panel is never replaced without a look.
   */
  public async onSettingsChoice(choice: SourceSettingsChoice): Promise<void> {
    const offer = this.settingsOffer();
    this.settingsOffer.set(null);
    if (offer === null) {
      return;
    }
    if (choice !== 'settings') {
      await this.attachSourceFile(offer.file);
    }
    if (choice !== 'source') {
      this.offerLinkedRequest(offer.payload);
    }
  }

  /**
   * Pick up a picture sent here from alchemy, if one is waiting. It is consumed
   * unconditionally so a later visit never re-applies a stale image, and it
   * goes in as an already-encoded blob rather than a file: these are bytes this
   * studio made and stored, so there is nothing in them to ask the reader about.
   */
  private async consumeHandoff(): Promise<void> {
    const pending = this.handoff.consume();
    if (!pending) {
      return;
    }
    // The first-visit offer sits over the whole page, and a reader arriving
    // with a picture in hand has asked for the studio, not for the offer.
    this.welcomeClosed.set(true);
    const section = await this.openSourceSection();
    if (!section) {
      this.toast.error('generate.source.attach_failed', { transloco: true });
      return;
    }
    await section.applySource(pending.blob);
    this.toast.success('generate.source.attached', { transloco: true });
  }

  /** Put a picture in as the source image, saying so once it is in. */
  private async attachSourceFile(file: File): Promise<void> {
    const section = await this.openSourceSection();
    if (!section) {
      this.toast.error('generate.source.attach_failed', { transloco: true });
      return;
    }
    await section.applyFile(file, { skipSettings: true });
    this.toast.success('generate.source.attached', { transloco: true });
  }

  /** A paste or drop carried files, but no image among them. */
  public onRejectedImage(): void {
    this.toast.error('generate.source.not_an_image', { transloco: true });
  }

  /**
   * Put the form on a sourced mode and hand back the source section once it has
   * rendered.
   */
  private async openSourceSection(): Promise<GenerateSourceImageComponent | null> {
    this.form.patchValue({
      sourceMode:
        this.form.controls.sourceMode.value === 'none'
          ? 'img2img'
          : this.form.controls.sourceMode.value,
    });
    // The section's contents follow the source mode, so what the caller wants
    // to reach may only exist after the change above has been rendered.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return this.sourceImageRef() ?? null;
  }

  /** Fill the prompt from a results-pane starter chip and focus the box. */
  public onUsePrompt(prompt: string): void {
    this.formRef()?.fillPrompt(prompt);
  }

  /** Scroll the results pane into view without moving focus. */
  private revealResults(): void {
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
      // The mask travels with the picture it was painted for: reattaching one
      // without the other would leave an inpainting request describing a region
      // nobody had marked.
      const mask = images.find((image) => image.kind === 'mask');
      await ref.applySource(source.blob, mask?.blob ?? null);
    }
  }

  public async onCreate(): Promise<void> {
    const blockers = this.collectBlockers();
    if (blockers.length > 0) {
      this.pendingBlockers.set(blockers);
      return;
    }
    const plan = this.planSubmit();
    if (!plan) {
      return;
    }
    if (this.reviewBeforeSend()) {
      this.pendingReview.set(plan);
      return;
    }
    await this.submit(plan);
  }

  /** Turn the option on or off, and remember it for the next visit. */
  public setReviewBeforeSend(on: boolean): void {
    this.reviewBeforeSend.set(on);
    this.db.store(REVIEW_KEY, on);
  }

  /** Turn the pinned Generate bar on or off, and remember it. */
  public setPinGenerate(on: boolean): void {
    this.pinGenerate.set(on);
    this.db.store(PIN_GENERATE_KEY, on);
  }

  /** Send exactly what the dialog was showing; the plan is not rebuilt. */
  public async confirmReview(): Promise<void> {
    const plan = this.pendingReview();
    this.pendingReview.set(null);
    this.formRef()?.focusGenerateButton();
    if (plan) {
      await this.submit(plan);
    }
  }

  public cancelReview(): void {
    this.pendingReview.set(null);
    this.formRef()?.focusGenerateButton();
  }

  /**
   * Everything stopping this press, with the inline marks the panel already
   * draws put up beside them: the dialog is a way of finding those marks, not a
   * replacement for them.
   */
  private collectBlockers(): SubmitBlocker[] {
    const controls = this.form.controls;
    const effective = this.effectiveValue();
    const usesSource = effective.sourceMode !== 'none';
    const source = this.sourceState();
    const blockers = submitBlockers({
      value: this.form.getRawValue(),
      invalidRanges: BOUNDED_FIELD_NAMES.filter(
        (field) => controls[field].invalid,
      ).map((field) => ({ field, ...BOUNDED_FIELD_RANGES[field] })),
      usesSource,
      sourceMessage: source.valid ? null : source.validationMessage,
      translate: (key) => this.transloco.translate(key),
    });
    if (blockers.length === 0) {
      return blockers;
    }
    if (controls.prompt.value.trim().length === 0) {
      controls.prompt.markAsTouched();
    }
    if (usesSource && !source.valid) {
      this.sourceValidationVisible.set(true);
    }
    return blockers;
  }

  /** Close the dialog and put the reader in front of the control it named. */
  public goToBlocker(anchor: FieldAnchorId): void {
    this.pendingBlockers.set(null);
    this.formRef()?.goToField(anchor);
  }

  public closeBlockers(): void {
    this.pendingBlockers.set(null);
    this.formRef()?.focusGenerateButton();
  }

  /** The reader answered the first-visit offer; whether it comes back is its own. */
  public closeWelcome(): void {
    this.welcomeClosed.set(true);
  }

  /** Put the first-visit offer away for every later visit as well. */
  private retireWelcome(): void {
    if (this.welcomeStored()) {
      return;
    }
    this.welcomeStored.set(true);
    this.db.store(WELCOMED_KEY, true);
  }

  /**
   * Everything one press of Generate would send, or null when the form is not
   * in a state to send anything. The single build: the review dialog reads what
   * this returns and {@link submit} sends that same object.
   */
  private planSubmit(): SubmitPlan | null {
    const promptControl = this.form.controls.prompt;
    if (promptControl.value.trim().length === 0) {
      promptControl.markAsTouched();
      return null;
    }
    const effective = this.effectiveValue();
    const usesSource = effective.sourceMode !== 'none';
    const state = this.sourceState();
    if (usesSource && !state.valid) {
      this.sourceValidationVisible.set(true);
      return null;
    }
    const hasSourceImage = usesSource && state.sourceBlob !== null;
    return {
      request: buildStyledImageRequest(
        effective,
        this.resolveApplied(effective),
        this.buildOptions(hasSourceImage),
      ),
      sourceImages: usesSource ? this.buildEnqueueSources(state) : [],
      styleKey: effective.styleName,
      styleName: this.styleRecords().get(effective.styleName)?.name ?? '',
    };
  }

  private async submit(plan: SubmitPlan): Promise<void> {
    const { request, sourceImages, styleKey, styleName } = plan;
    try {
      await this.queue.enqueue(
        request,
        sourceImages.length > 0 ? sourceImages : undefined,
        // The request itself keeps no trace of the style that shaped it, so the
        // selection is recorded on the job for the results grid to group by.
        // The key groups; the name is what the grid shows, and it is recorded
        // beside the key because a style can be withdrawn or renamed later.
        styleKey ? { styleKey, styleName } : undefined,
      );
      // One submit is one use of the style, however many images it asks for.
      if (styleKey) {
        this.styleUsage.increment(styleKey);
      }
      // Keep the submitted settings in the recent-history list for quick reload.
      this.presets.pushRecent(this.form.getRawValue());
      this.toast.success('generate.form.enqueued', { transloco: true });
      // On a phone the panes stack, so a press that only raised a toast would
      // leave the reader looking at the button while the job runs below the
      // fold: the results pane comes up to meet them.
      if (this.isNarrow()) {
        this.revealResults();
      }
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
    if (state.sourceBlob !== null) {
      this.linkSourceMissing.set(false);
    }
    const extras = (state.extras ?? []).map((extra) => extra.blob);
    if (
      state.sourceBlob === this.cachedSourceBlob &&
      sameBlobs(extras, this.cachedExtraBlobs)
    ) {
      return;
    }
    this.cachedSourceBlob = state.sourceBlob;
    this.cachedExtraBlobs = extras;
    void this.refreshSourceBase64(state);
  }

  /** Forget the encoded pictures along with the source state they came from. */
  private clearSourceEncodings(): void {
    this.cachedSourceBlob = null;
    this.sourceBase64 = null;
    this.cachedExtraBlobs = [];
    this.extraSourceImages = [];
  }

  /**
   * Encode whatever the section now holds and re-estimate once, so attaching a
   * picture and its remix extras in one go costs a single dry run.
   */
  private async refreshSourceBase64(state: GenerateSourceState): Promise<void> {
    const blob = state.sourceBlob;
    const extras = state.extras ?? [];
    const encode = this.isBrowser;
    const source = encode && blob !== null ? await blobToBase64(blob) : null;
    const encodedExtras = encode
      ? await Promise.all(
          extras.map(async (extra) => ({
            image: await blobToBase64(extra.blob),
            strength: extra.strength,
          })),
        )
      : [];
    // Newer pictures may have arrived while these encoded; only keep ours.
    if (
      blob !== this.cachedSourceBlob ||
      !sameBlobs(
        extras.map((extra) => extra.blob),
        this.cachedExtraBlobs,
      )
    ) {
      return;
    }
    this.sourceBase64 = source;
    this.extraSourceImages = encodedExtras;
    void this.updateKudos();
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
        this.styleRecords.update((records) => {
          const next = new Map(records);
          for (const summary of summaries) {
            const record = fromPreset(summary.name, summary.preset);
            next.set(record.key, record);
          }
          return next;
        });
        this.styleGroups.set(
          groups.map((group) => ({
            category: group.category,
            names: group.styleNames,
          })),
        );
        this.stylesLoaded = true;
        // A style may already be selected from persisted state; surface its hints.
        this.refreshForcedParams();
        this.answerPinnedStyle();
      });
  }

  /**
   * Open the studio on whatever the address it was reached by carried.
   *
   * A model or a style named openly in the address is written in as it stands:
   * it is one field, and the reader could read it in the link they followed. A
   * whole request goes to the same review panel a saved preset goes through,
   * so settings already in the form are never replaced without a look first.
   */
  private applyStudioLink(): void {
    const payload = parseStudioLink(this.route.snapshot.queryParamMap);
    if (payload === null) {
      return;
    }
    this.pinnedStyleKey = payload.styleKey;
    if (payload.kind === 'simple') {
      this.applyLinkedFields(payload);
    } else {
      this.offerLinkedRequest(payload);
    }
    // The styles may already have landed, in which case nothing is waiting to
    // ask on this link's behalf and the answer is due now.
    this.answerPinnedStyle();
    this.dropPackedParam();
  }

  /** Write the one or two fields a readable link names. */
  private applyLinkedFields(payload: StudioLinkPayload): void {
    const fields: Partial<GenerateFormValue> = {};
    const model = payload.request.models?.[0];
    if (model !== undefined && model !== '') {
      fields.model = model;
    }
    if (payload.styleKey !== null) {
      fields.styleName = payload.styleKey;
    }
    if (Object.keys(fields).length > 0) {
      this.applyFields(fields);
    }
  }

  /** Hold a link's whole request in the review panel under its own heading. */
  private offerLinkedRequest(payload: StudioLinkPayload): void {
    const settings = requestToFormValue(payload.request);
    if (payload.styleKey !== null) {
      settings.styleName = payload.styleKey;
    }
    // The picture itself cannot travel in an address, so a request that works
    // on one arrives wanting one. The mode is kept and the section asks.
    this.pendingLinkSourceMode =
      settings.sourceMode === 'none' ? null : settings.sourceMode;
    this.openBulkApply(settings);
    this.loadTitleKey.set('generate.link.review_title');
  }

  /**
   * Take the packed request back out of the address once it has been offered,
   * so a reload does not put the same settings up a second time. A model or a
   * style named openly stays: it is what the reader followed.
   */
  private dropPackedParam(): void {
    if (!this.route.snapshot.queryParamMap.has('r')) {
      return;
    }
    const map = this.route.snapshot.queryParamMap;
    const queryParams: Params = {};
    for (const key of ['model', 'style', 'styleId']) {
      const value = map.get(key);
      if (value !== null) {
        queryParams[key] = value;
      }
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      replaceUrl: true,
    });
  }

  /**
   * Answer a style that arrived in a link once the presets are known. A preset
   * is looked up among them; a published style is fetched by its id. Either
   * way a style that no longer exists is dropped rather than left selected,
   * because a style that resolves to nothing quietly changes nothing.
   */
  private answerPinnedStyle(): void {
    const pinned = this.pinnedStyleKey;
    if (pinned === null || !this.stylesLoaded) {
      return;
    }
    this.pinnedStyleKey = null;
    if (this.styleRecords().has(pinned)) {
      return;
    }
    const parsed = parseStyleRecordKey(pinned);
    if (parsed?.source === 'native') {
      this.styleApi
        .getImageStyle(parsed.value)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (style) => {
            this.registerStyle(fromNativeImageStyle(style));
            this.refreshForcedParams();
          },
          error: () => this.dropPinnedStyle(pinned),
        });
      return;
    }
    this.dropPinnedStyle(pinned);
  }

  /** Take a style nothing resolves off the form and say so. */
  private dropPinnedStyle(key: string): void {
    if (this.form.controls.styleName.value === key) {
      this.form.controls.styleName.setValue('');
    }
    const waiting = this.pendingLoad();
    if (waiting !== null && waiting.styleName === key) {
      this.pendingLoad.set({ ...waiting, styleName: '' });
    }
    this.toast.error('generate.link.style_gone', { transloco: true });
  }

  /** Hold a style the form may now select, keyed as everything else keys it. */
  public registerStyle(record: StyleRecord): void {
    this.styleRecords.update((records) => {
      const next = new Map(records);
      next.set(record.key, record);
      return next;
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
    // Read off the request before the source bytes go on it, so nothing holds
    // a reference to the base64 payload once the estimate has been sent.
    this.workerRequirement.set(workerRequirementForRequest(request));
    this.workerPool.load();
    if (hasSourceImage && this.sourceBase64 !== null) {
      request.source_image = this.sourceBase64;
    }
    // A remix is priced by every picture it blends, so the extras go on the
    // dry run under the same rule the submitted request attaches them by: only
    // alongside a primary source image, which is the only shape the horde
    // accepts them in.
    if (
      hasSourceImage &&
      effective.sourceMode === 'remix' &&
      this.extraSourceImages.length > 0
    ) {
      request.extra_source_images = this.extraSourceImages;
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
          action: () => this.showSection(id, identity.className),
        };
      }),
    });
    this.destroyRef.onDestroy(() =>
      this.glossary.clearPageContext(STUDIO_GLOSSARY_PAGE_ID),
    );
  }

  /**
   * Bring one of the panel's cards onto the screen and ring it, in the same
   * gesture a try-it chip uses. An area the reader folded away is unfolded
   * first, so the pointing lands on the controls rather than on a line of
   * values; no hue is passed, because the card is already wearing its own.
   */
  private showSection(section: SectionId, className: string): void {
    if (!this.isBrowser) {
      return;
    }
    const opened = this.formRef()?.openGroupForSection(section) ?? false;
    if (!opened) {
      const card = this.document.querySelector<HTMLElement>(
        `.gs-panel .${className}`,
      );
      if (card) {
        this.anchors.flash(card);
      }
      return;
    }
    // The group's controls exist one render on from the signal write above.
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
