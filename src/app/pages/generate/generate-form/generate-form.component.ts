import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  afterRenderEffect,
  computed,
  contentChild,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DOCS_IMAGE_SETTINGS } from '../../../content/docs-links';
import { STUDIO_LOOKS } from '../../../content/looks';
import {
  AbstractControl,
  FormControl,
  ReactiveFormsModule,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { merge } from 'rxjs';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { GsSheetComponent } from '../../../components/gs-sheet/gs-sheet.component';
import { GenerateSourceImageComponent } from '../generate-source-image/generate-source-image.component';
import {
  FullscreenService,
  restoreFocusOnFullscreenExit,
} from '../../../services/fullscreen.service';
import { GsHelpComponent } from '../../../components/gs-help/gs-help.component';
import { TutorialAnchorDirective } from '../../../directives/tutorial-anchor.directive';
import { TutorialAnchorService } from '../../../services/tutorial-anchor.service';
import { CivitaiSelectionComponent } from '../../../components/civitai-selection/civitai-selection.component';
import { RememberedHeightDirective } from '../../../directives/remembered-height.directive';
import { EdgeAwarePopoverDirective } from '../../../directives/edge-aware-popover.directive';
import { GsPromptEditorComponent } from '../../../components/gs-prompt-editor/gs-prompt-editor.component';
import { ModelAutocompleteComponent } from '../../../components/model-autocomplete/model-autocomplete.component';
import { GeneratePresetsService } from '../../../services/generate-presets.service';
import { GlossaryService } from '../../../services/glossary.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { DatabaseService } from '../../../services/database.service';
import { UnitConversionService } from '../../../services/unit-conversion.service';
import { ActiveModel } from '../../../types/active-model';
import {
  ImagePostProcessor,
  ImageSamplerName,
  styleTemplateWords,
} from '../../../types/style';
import {
  StyleForcedParams,
  StyleRecord,
  parseStyleRecordKey,
  styleRecordKey,
} from '../../../services/style-record';
import { CivitaiPickerComponent } from '../../../components/civitai-picker/civitai-picker.component';
import { StyleBrowserComponent } from '../style-browser/style-browser.component';
import { PromptLibraryComponent } from '../../../components/prompt-library/prompt-library.component';
import type {
  PromptLibraryTab,
  PromptLibraryUse,
} from '../../../components/prompt-library/prompt-library.model';
import { PromptHistoryDbService } from '../../../services/prompt-history-db.service';
import { PromptDraftDbService } from '../../../services/prompt-draft-db.service';
import { PromptApplyConfirmComponent } from '../prompt-apply-confirm/prompt-apply-confirm.component';
import { GsGroupComponent } from './gs-group/gs-group.component';
import { ResultControlAction } from '../result-control-action';
import { negativeHasPhrase } from '../../../helper/prompt-check';
import {
  FACE_FIXERS,
  FormLoraEntry,
  FormTiEntry,
  GenerateFormGroup,
  GenerateFormValue,
  DEFAULT_GENERATE_FORM_VALUE,
  changedFields,
  CFG_SLIDER_MAX,
  CFG_SLIDER_MIN,
  CFG_STEP,
  CONTROL_STRENGTH_STEP,
  DEFAULT_CONTROL_STRENGTH,
  MAX_CONTROL_STRENGTH,
  MIN_CONTROL_STRENGTH,
  MAX_BATCH,
  MAX_CFG_SCALE,
  MAX_CLIP_SKIP,
  MAX_DIMENSION,
  MAX_FACEFIXER_STRENGTH,
  MAX_HIRES_DENOISE,
  MAX_LORA_STRENGTH,
  MAX_SEED_VARIATION,
  MAX_STEPS,
  MAX_WEBHOOK_LENGTH,
  MAX_REQUEST_MODELS,
  MAX_WORKERS,
  MIN_BATCH,
  MIN_CFG_SCALE,
  MIN_CLIP_SKIP,
  MIN_DIMENSION,
  MIN_FACEFIXER_STRENGTH,
  MIN_HIRES_DENOISE,
  MIN_LORA_STRENGTH,
  MIN_SEED_VARIATION,
  MIN_STEPS,
  MIN_WEBHOOK_LENGTH,
  STEPS_SLIDER_MAX,
  STEPS_SLIDER_MIN,
  DIMENSION_STEP,
  KudosAffordability,
  KudosBreakdownLine,
  ModelSizeBase,
  ModelSizeFamily,
  offeredSamplers,
  PanelSize,
  PromptHistoryEntry,
  QR_MODULE_DRAWERS,
  RequirementHint,
  SAMPLERS,
  STRIP_BACKGROUND,
  STYLE_PINNED_FIELDS,
  STYLE_PINNED_FIELD_SECTION,
  StyleLockSection,
  StylePickerGroup,
  StylePinnedField,
  StyleValueSnapshot,
  UPSCALERS,
  WaitEstimate,
  buildAspectPresets,
  cfgAdvisory,
  clipSkipAdvisory,
  cyclePanelSize,
  detachedStyleSections,
  hiresUnneededHint,
  isSnappableSize,
  isValidWebhook,
  LEGACY_SCHEDULERS,
  nativeSquareFor,
  normalizeExtraModels,
  normalizeWorkers,
  rangeFillPercent,
  requestModelNames,
  resetFormValue,
  samplerRequirementHint,
  scheduleAdvisory,
  sd15HiresHint,
  sizeAdvisory,
  sizeFamilyFor,
  liftSizeBase,
  rescalePresetToBase,
  stepsAdvisory,
  styledFormValue,
  suggestedSamplers,
  suggestedSettings,
  suggestedSettingsCount,
  type SuggestedSettings,
} from '../generate-form.model';
import {
  FeatureCompatRuleId,
  FieldAnchorId,
  FieldRejection,
  RequestWarning,
  warningsAtAnchor,
  warningsInSection,
} from '../request-lint';
import type { SectionId } from '../../../content/sections';
import type { ModelRequirements } from '../../../services/model-reference.service';
import {
  LicensingService,
  licensingExplorerUrl,
  licensingLineText,
  postProcessorCategory,
  worstLicensingFact,
  type LicensingFact,
  type NamedLicensingFact,
} from '../../../services/licensing.service';
import {
  pickableWorkers,
  type ModelWorkerFacts,
  type WorkerFeasibility,
  type WorkerPickOption,
} from '../../../services/worker-pool.service';
import type { HordeWorker } from '../../../types/horde-worker';
import { PromptDraftCardComponent } from '../../../components/prompt-draft/prompt-draft-card.component';
import {
  ImageSchedulerName,
  MAX_FLOW_SHIFT,
  MIN_FLOW_SHIFT,
  SAMPLER_SETTING_NAMES,
  SamplerConstraintsDocument,
  SamplerKnobRange,
  SamplerSettingName,
  availableSchedulers,
  baselinesSupportFlowShift,
  recommendedSchedulers,
  samplerSettingIsValid,
  samplerWorkFactor,
} from '../../../types/sampler-constraints';

// Re-exported for the parent page, which has always imported the picker group
// type from here; it lives in the form model so the style browser can use it
// without importing this component (which imports the browser in turn).
export type { StylePickerGroup } from '../generate-form.model';

/**
 * The controls that live behind the advanced-sampling disclosure. Pointing at
 * one has to open the disclosure first, or the reader is sent to a control that
 * is not on the page.
 */
const KNOB_ANCHORS: readonly FieldAnchorId[] = [
  ...SAMPLER_SETTING_NAMES,
  'advanced_sampling',
  'solver_type',
  'flow_shift',
];

/**
 * How many frames the pointing waits before checking whether the control it
 * scrolled to is still on the screen; see {@link GenerateFormComponent.pointAt}.
 */
const SETTLE_FRAMES = 6;

/** Which of the two prompt boxes the full-screen editor is holding. */
export type PromptEditorField = 'prompt' | 'negative';

/**
 * The settings groups the panel folds away behind a line of their own values.
 * The cards a request cannot be described without (prompt, model, the source
 * strip) are not groups. Dimensions is a group even
 * though it sits among them, because its folded line carries the size in full
 * and every request already has one.
 */
export type GroupId =
  | 'dimensions'
  | 'sampling'
  | 'loras'
  | 'post'
  | 'output'
  | 'horde'
  | 'transparent'
  | 'qr';

export const GROUP_IDS: readonly GroupId[] = [
  'dimensions',
  'sampling',
  'loras',
  'post',
  'output',
  'horde',
  'transparent',
  'qr',
];

/**
 * Which group a control lives in, so that pointing at a control opens the group
 * holding it first. A control the panel is not currently drawing cannot be
 * scrolled to or rung, and an anchor missing from here would fail silently.
 */
const GROUP_BY_ANCHOR: Readonly<Record<string, GroupId>> = {
  size: 'dimensions',
  hires: 'dimensions',
  hires_denoise: 'dimensions',
  steps: 'sampling',
  cfg: 'sampling',
  sampler: 'sampling',
  schedule: 'sampling',
  seed: 'sampling',
  clip_skip: 'sampling',
  tiling: 'sampling',
  advanced_sampling: 'sampling',
  solver_type: 'sampling',
  flow_shift: 'sampling',
  sampler_eta: 'sampling',
  sampler_s_noise: 'sampling',
  sampler_s_churn: 'sampling',
  sampler_s_tmin: 'sampling',
  sampler_s_tmax: 'sampling',
  sampler_order: 'sampling',
  seed_variation: 'sampling',
  loras: 'loras',
  facefixer: 'post',
  facefixer_strength: 'post',
  upscaler: 'post',
  transparent: 'transparent',
  qr: 'qr',
  webhook: 'horde',
  workers: 'horde',
};

/** The group each folded panel area resolves to; see `openGroupForSection`. */
const GROUP_BY_SECTION: Readonly<Partial<Record<SectionId, GroupId>>> = {
  size: 'dimensions',
  sampling: 'sampling',
  finishing: 'post',
  horde: 'horde',
  workflows: 'transparent',
};

/**
 * A form field a style can freeze. The extra models follow the primary rather
 * than wearing a lock of their own, so they are not among the fields the panel
 * paints as frozen.
 */
export type LockedField = Exclude<StylePinnedField, 'extraModels'>;

const LOCKED_FIELDS = STYLE_PINNED_FIELDS.filter(
  (field): field is LockedField => field !== 'extraModels',
);

/** Whether `forced` names a value for `field`. */
function stylePinsField(
  forced: StyleForcedParams,
  field: StylePinnedField,
): boolean {
  // A style names a schedule only through its karras flag, and the request
  // keeps the reader's schedule otherwise, so the control locks only when the
  // request really carries the style's value.
  if (field === 'scheduler') {
    return forced.karras !== undefined;
  }
  // The extra models are narrowed to the models a style names, so they are held
  // exactly when it names one.
  if (field === 'extraModels') {
    return forced.model !== undefined;
  }
  // An empty post-processing list is still a decision: it is the style asking
  // for none, so the control freezes on it as it would on a named processor.
  return forced[field] !== undefined;
}

/**
 * Whether two form values stand for the same setting. Compared rather than
 * matched by identity because the styled value is rebuilt on every pass, so a
 * list written back on identity alone would write forever.
 */
function sameFieldValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((entry, index) => entry === right[index])
    );
  }
  return left === right;
}

/** The fields each group owns, for the mark that says it holds a changed value. */
const GROUP_FIELDS: Readonly<
  Record<GroupId, readonly (keyof GenerateFormValue)[]>
> = {
  dimensions: ['width', 'height', 'hires_fix', 'hires_fix_denoising_strength'],
  sampling: [
    'sampler_name',
    'steps',
    'cfg_scale',
    'clip_skip',
    'seed',
    'scheduler',
    'tiling',
    'sampler_eta',
    'sampler_s_noise',
    'sampler_s_churn',
    'sampler_s_tmin',
    'sampler_s_tmax',
    'sampler_order',
    'sampler_solver_type',
    'flow_shift',
    'seed_variation',
  ],
  loras: ['loras', 'tis'],
  post: ['post_processing', 'facefixer_strength'],
  output: ['nsfw', 'censor_nsfw', 'shared'],
  horde: [
    'trusted_workers',
    'slow_workers',
    'extra_slow_workers',
    'allow_downgrade',
    'replacement_filter',
    'webhook',
    'workers',
    'workerBlacklist',
    'rememberExtras',
  ],
  transparent: ['transparent'],
  qr: ['qrText', 'qrXOffset', 'qrYOffset', 'qrModuleDrawer'],
};

/**
 * Settings a card owns only in some states.
 *
 * Control strength is set from two places: the source card sets it for a
 * control type, and the QR card sets it for the code it draws. It belongs to
 * whichever of them is in use, so the mark goes on the card the reader would
 * open to find the value rather than on both.
 */
function sharedGroupFields(
  group: GroupId,
  value: GenerateFormValue,
): readonly (keyof GenerateFormValue)[] {
  const qrOwnsStrength =
    value.qrText.trim() !== '' && value.control_type === '';
  if (group === 'qr' && qrOwnsStrength) {
    return ['control_strength'];
  }
  return [];
}

/** What each group is called, for a count that has to name the group it is in. */
const GROUP_TITLE_KEY: Readonly<Record<GroupId, string>> = {
  dimensions: 'generate.form.dimensions_section',
  sampling: 'generate.form.sampling_section',
  loras: 'generate.form.loras_section',
  post: 'generate.form.post_processing_section',
  output: 'generate.form.output_section',
  horde: 'generate.form.horde_section',
  transparent: 'generate.form.transparent_section',
  qr: 'generate.form.qr_section',
};

/** A setting the changed-settings ledger can list. */
type LedgerField = Exclude<
  keyof GenerateFormValue,
  'styleDetach' | 'valuesBeforeStyle'
>;

/** Where a ledger row is listed: a collapsible group, or the compose cards. */
type LedgerSection = GroupId | 'compose';

/** One changed setting, as the ledger lists it. */
export interface LedgerRow {
  field: LedgerField;
  labelKey: string;
}

/** One offered look, resolved to the style key the select would hold for it. */
interface OfferedLook {
  key: string;
  labelKey: string;
}

/** The changed settings of one panel area, listed under its heading. */
export interface LedgerGroupRows {
  section: LedgerSection;
  titleKey: string;
  rows: LedgerRow[];
}

/**
 * What to call each setting in the changed-settings ledger. Most reuse the
 * label the control already wears; the rest name a control whose own label is a
 * heading or an icon and so cannot be borrowed. Declared in full rather than
 * derived so a new field cannot reach the ledger unnamed.
 */
export const FIELD_LABEL_KEY: Readonly<Record<LedgerField, string>> = {
  styleName: 'generate.form.ledger_styleName',
  prompt: 'generate.form.prompt_label',
  negativePrompt: 'generate.form.ledger_negativePrompt',
  n: 'generate.form.ledger_n',
  model: 'generate.form.model_label',
  extraModels: 'generate.form.ledger_extraModels',
  sampler_name: 'generate.form.ledger_sampler_name',
  steps: 'generate.form.ledger_steps',
  cfg_scale: 'generate.form.ledger_cfg_scale',
  clip_skip: 'generate.form.ledger_clip_skip',
  seed: 'generate.form.seed_label',
  width: 'generate.form.ledger_width',
  height: 'generate.form.ledger_height',
  post_processing: 'generate.form.ledger_post_processing',
  hires_fix: 'generate.form.hires_fix_label',
  tiling: 'generate.form.tiling_label',
  nsfw: 'generate.form.nsfw_label',
  censor_nsfw: 'generate.form.censor_nsfw_label',
  trusted_workers: 'generate.form.trusted_workers_label',
  slow_workers: 'generate.form.slow_workers_label',
  allow_downgrade: 'generate.form.ledger_allow_downgrade',
  sourceMode: 'generate.form.ledger_sourceMode',
  maskEnabled: 'generate.form.ledger_maskEnabled',
  outpaintEnabled: 'generate.form.ledger_outpaintEnabled',
  outpaintAnchor: 'generate.form.ledger_outpaintAnchor',
  denoising_strength: 'generate.form.ledger_denoising_strength',
  control_type: 'generate.form.ledger_control_type',
  control_strength: 'generate.form.ledger_control_strength',
  image_is_control: 'generate.form.ledger_image_is_control',
  return_control_map: 'generate.form.ledger_return_control_map',
  scheduler: 'generate.form.scheduler_label',
  sampler_eta: 'generate.form.sampler_eta_label',
  sampler_s_noise: 'generate.form.sampler_s_noise_label',
  sampler_s_churn: 'generate.form.sampler_s_churn_label',
  sampler_s_tmin: 'generate.form.sampler_s_tmin_label',
  sampler_s_tmax: 'generate.form.sampler_s_tmax_label',
  sampler_order: 'generate.form.sampler_order_label',
  sampler_solver_type: 'generate.form.sampler_solver_type_label',
  flow_shift: 'generate.form.flow_shift_label',
  facefixer_strength: 'generate.form.ledger_facefixer_strength',
  hires_fix_denoising_strength: 'generate.form.ledger_hires_denoise',
  seed_variation: 'generate.form.ledger_seed_variation',
  loras: 'generate.form.ledger_loras',
  tis: 'generate.form.ledger_tis',
  transparent: 'generate.form.transparent_label',
  shared: 'generate.form.shared_label',
  extra_slow_workers: 'generate.form.extra_slow_workers_label',
  replacement_filter: 'generate.form.replacement_filter_label',
  disable_batching: 'generate.form.ledger_disable_batching',
  webhook: 'generate.form.webhook_label',
  workers: 'generate.form.ledger_workers',
  workerBlacklist: 'generate.form.ledger_workerBlacklist',
  qrText: 'generate.form.ledger_qrText',
  qrXOffset: 'generate.form.ledger_qrXOffset',
  qrYOffset: 'generate.form.ledger_qrYOffset',
  qrModuleDrawer: 'generate.form.ledger_qrModuleDrawer',
  rememberExtras: 'generate.form.ledger_rememberExtras',
};

/**
 * Which area of the panel a setting lives in, for a ledger that lists rows
 * under the card the reader would go to. Built from the group tables, with
 * everything the collapsible groups do not claim falling to the always-open
 * compose cards.
 */
const FIELD_GROUP: ReadonlyMap<LedgerField, LedgerSection> = new Map(
  (Object.keys(FIELD_LABEL_KEY) as LedgerField[]).map((field) => [
    field,
    GROUP_IDS.find((group) => GROUP_FIELDS[group].includes(field)) ?? 'compose',
  ]),
);

/** The heading each ledger section is listed under. */
const LEDGER_SECTION_TITLE_KEY: Readonly<Record<LedgerSection, string>> = {
  compose: 'generate.form.ledger_compose',
  ...GROUP_TITLE_KEY,
};

/** Where the reader's open groups are remembered between visits. */
const GROUPS_OPEN_KEY = 'aihorde.generate.groups_open';
/** Set once the first-visit line under the prompt has been dismissed. */
const PROMPT_HINT_KEY = 'aihorde.generate.prompt_hint_done';
/** False once the reader has asked not to be asked before a prompt replaces theirs. */
const PROMPT_APPLY_CONFIRM_KEY = 'aihorde.generate.prompt_apply_confirm';
/** How long the offer to undo a replaced prompt stays on screen. */
const PROMPT_APPLY_UNDO_MS = 10_000;

/** Where a prompt being put in the box came from. */
export type PromptApplySource = 'draft' | 'sent' | 'handoff';

/** A prompt to put in the box, with the negative that goes alongside it. */
export interface PromptApplication {
  prompt: string;
  /** Null leaves the negative box as it is. */
  negative: string | null;
}
/** Results after which the first-visit line goes away on its own. */
const PROMPT_HINT_RESULTS = 2;

/**
 * What the panel does with a group it has never been told anything about. A
 * group starts folded: the always-open cards are what a request is described
 * with, and everything past them waits until it is asked for.
 */
const GROUP_OPEN_DEFAULT = false;

/** The separator every group's summary line reads its values between. */
const SUMMARY_SEPARATOR = ' · ';

/**
 * The /generate left control panel. Presentational: every control binds to the
 * parent's form group and the parent owns kudos estimation, submission,
 * persistence, and style resolution. The panel renders a Simple/Advanced
 * segmented header, a scrollable body of control cards (advanced cards are
 * hidden in simple mode), and a sticky footer with the batch stepper, live
 * dimensions/kudos readout, and the Generate button. The source-image
 * (img2img / controlnet / inpaint) controls are projected through the
 * `[generateSourceImage]` slot by the parent and sit with the compose cards in
 * both detail levels; that section gates its own advanced-only dials.
 */
@Component({
  selector: 'app-generate-form',
  imports: [
    NgTemplateOutlet,
    PromptDraftCardComponent,
    ReactiveFormsModule,
    TranslocoPipe,
    CivitaiSelectionComponent,
    IconComponent,
    GsHelpComponent,
    TutorialAnchorDirective,
    RememberedHeightDirective,
    GsPromptEditorComponent,
    ModelAutocompleteComponent,
    CivitaiPickerComponent,
    StyleBrowserComponent,
    PromptLibraryComponent,
    PromptApplyConfirmComponent,
    GsGroupComponent,
    RouterLink,
    GsSheetComponent,
    EdgeAwarePopoverDirective,
  ],
  templateUrl: './generate-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'onDocumentEscape()',
  },
})
export class GenerateFormComponent implements OnInit {
  /** The reference this panel is the subject of, card by card and row by row. */
  public readonly referenceLink = DOCS_IMAGE_SETTINGS;

  private readonly destroyRef = inject(DestroyRef);
  public readonly presetsSvc = inject(GeneratePresetsService);
  /* Below 1024px the tool switcher is a bottom bar and carries nothing but the
     tools, so this header is the studio's top line and the place the glossary
     is reached from. The shell's copy takes over from 1024px up. */
  public readonly glossary = inject(GlossaryService);
  private readonly auth = inject(AuthService);
  public readonly isLoggedIn = this.auth.isLoggedIn;
  /** Backs the full-screen control: in Options wide, beside it on a phone. */
  public readonly fullscreen = inject(FullscreenService);
  private readonly toast = inject(ToastService);
  private readonly anchors = inject(TutorialAnchorService);
  private readonly injector = inject(Injector);
  private readonly transloco = inject(TranslocoService);
  private readonly db = inject(DatabaseService);
  private readonly units = inject(UnitConversionService);
  private readonly licensing = inject(LicensingService);

  public readonly form = input.required<GenerateFormGroup>();
  public readonly models = input<ActiveModel[]>([]);
  /**
   * Whether the list of models has yet to arrive. Nothing can be sent without
   * it, so Generate stands down and says why rather than posting a request the
   * horde has no chance of matching to a worker.
   */
  public readonly modelsUnavailable = input(false);
  public readonly kudos = input<number | null>(null);
  public readonly estimating = input(false);
  /** What the estimate is made of, for the popover behind the kudos chip. */
  public readonly kudosLines = input<readonly KudosBreakdownLine[]>([]);
  /** What to say about the wait for the picked model, as the popover's tail. */
  public readonly waitLine = input<WaitEstimate | null>(null);
  /**
   * How many workers could take the request as it stands, and what to say when
   * none can. Null when the answer is unknown, and the footer then says nothing
   * rather than guessing; it never stands between the reader and Generate.
   */
  public readonly feasibility = input<WorkerFeasibility | null>(null);
  /**
   * What the workers carrying each model can do, keyed by model name. Handed to
   * the picker so its rows can say what asking for a model is like right now.
   */
  public readonly modelFacts = input<ReadonlyMap<
    string,
    ModelWorkerFacts
  > | null>(null);
  /**
   * Every worker the horde is listing, for the routing picker. Null while none
   * are known, and the picker then offers nothing rather than an empty list.
   */
  public readonly activeWorkers = input<readonly HordeWorker[] | null>(null);
  /**
   * What the reader's kudos balance buys at the quoted price. Null for an
   * anonymous reader, who has no balance to read, and the footer then says
   * nothing about money at all.
   */
  public readonly affordability = input<KudosAffordability | null>(null);
  /** Style-forced parameters, used to flag controls a style overrides. */
  public readonly forcedParams = input<StyleForcedParams | null>(null);
  /** Curated style presets grouped by category for the styles picker. */
  public readonly styleGroups = input<StylePickerGroup[]>([]);
  /** Every loaded style by key, so a selected key can be shown by its name. */
  public readonly styleRecords = input<ReadonlyMap<string, StyleRecord>>(
    new Map<string, StyleRecord>(),
  );
  /** Current control-panel width; drives the reflow and the expand control. */
  public readonly panelSize = input<PanelSize>('normal');
  /** Whether the expand/collapse control is offered (off on a narrow screen). */
  public readonly expandable = input(true);
  /**
   * Whether the studio is stacked rather than side by side. The parent owns the
   * one media-query listener, so the panel and the shell cannot disagree about
   * which width they are drawing for. It decides how the Options list is
   * presented and whether the header has room for the walkthrough's word.
   */
  public readonly narrow = input(false);
  /** How many generations have come back, which retires the first-visit line. */
  public readonly finishedCount = input(0);
  /** Recent distinct prompts for the quick-pick, newest first. */
  public readonly promptHistory = input<readonly PromptHistoryEntry[]>([]);
  /**
   * Whether the selected model's baseline can serve the `qr_code` workflow.
   * Null means the caller has no answer (no model picked, or the model
   * reference has not loaded), in which case the control stays usable: gating
   * is guidance, and an unknown baseline must not lock the user out of it.
   */
  public readonly qrSupported = input<boolean | null>(null);
  /**
   * The selected model's normalised baseline, or null when nothing is known. It
   * drives the native-size guidance and the model-change size snap.
   */
  public readonly modelBaseline = input<string | null>(null);
  /**
   * The settings the selected model recommends. Null means the model names none
   * (or none is selected), in which case no guidance is shown.
   */
  public readonly modelRequirements = input<ModelRequirements | null>(null);
  /** Live sampler-specific controls and hard compatibility rules. */
  public readonly samplerContract = input<SamplerConstraintsDocument | null>(
    null,
  );
  /**
   * Everything the request as it stands would earn a warning for, evaluated by
   * the parent across the whole request. Nothing here gates submission: the
   * count beside Generate is an offer to look, and the horde decides.
   */
  public readonly lintWarnings = input<readonly RequestWarning[]>([]);
  /**
   * The horde's own answer to the last submit it refused, placed at the control
   * it named. Null once the reader has changed that control, which the parent
   * decides: the horde is the authority on whether the new value is acceptable,
   * so the studio only stops repeating a sentence it can no longer stand behind.
   */
  public readonly fieldRejection = input<FieldRejection | null>(null);

  /**
   * Whether Generate stops at a review of the request instead of sending it.
   * The parent owns the preference and the dialog; the panel only draws the
   * switch and says what pressing Generate is about to do.
   */
  public readonly reviewBeforeSend = input(false);

  /** Whether result actions ask before changing this panel's controls. */
  public readonly confirmResultActions = input(true);

  /** The newest restorable result action, or null when there is no checkpoint. */
  public readonly resultUndoAction = input<ResultControlAction | null>(null);

  /**
   * Whether keeping Generate on screen is on offer at all. The docked bar
   * belongs to the studio's own screen, which is the only place it has a bottom
   * to sit above, so a host that draws the panel elsewhere leaves this off.
   */
  public readonly pinnable = input(false);

  /**
   * Whether Generate is kept at the foot of the screen. Narrow viewports act on
   * it; wider ones keep the button in the footer either way, where it is always
   * in view. The parent owns the preference; the panel draws the switch and
   * wears the class that docks its own footer row.
   */
  public readonly pinGenerate = input(false);

  public readonly create = output<void>();
  /** A style the browser reached that the studio does not hold yet. */
  public readonly styleFound = output<StyleRecord>();
  public readonly panelSizeChange = output<PanelSize>();
  public readonly reviewBeforeSendChange = output<boolean>();
  public readonly confirmResultActionsChange = output<boolean>();
  public readonly undoResultAction = output<void>();
  public readonly pinGenerateChange = output<boolean>();
  /** Ask the parent to open a preview of the request this form would submit. */
  public readonly preview = output<void>();
  /** Ask the parent to copy an address that reopens the studio on this form. */
  public readonly copyLink = output<void>();
  /** Ask the parent to open the box that takes settings pasted from elsewhere. */
  public readonly pasteSettings = output<void>();
  /** Load a saved/recent preset back into the form (via the parent's confirm). */
  public readonly applySettings = output<GenerateFormValue>();

  /** Whether the header presets menu is open, and the pending save-as name. */
  public readonly presetsOpen = signal(false);
  public readonly saveName = signal('');
  /** The presets popover's anchor, used to detect click-away dismissals. */
  private readonly presetsRef =
    viewChild<ElementRef<HTMLElement>>('presetsContainer');
  /** The presets toggle, so the parent's load panel can hand focus back to it. */
  private readonly presetsBtn =
    viewChild<ElementRef<HTMLButtonElement>>('presetsBtn');
  /** Whether the Options list is showing, as a popover or as the sheet. */
  public readonly optionsOpen = signal(false);
  /** The Options popover's anchor, used to detect click-away dismissals. */
  private readonly optionsRef =
    viewChild<ElementRef<HTMLElement>>('optionsContainer');
  /** The Options trigger, which dismissals hand focus back to. */
  private readonly optionsBtn =
    viewChild<ElementRef<HTMLButtonElement>>('optionsBtn');
  /** The phone's standing full-screen button, used when fullscreen returns. */
  private readonly fullscreenBtn =
    viewChild<ElementRef<HTMLButtonElement>>('fullscreenBtn');
  /** Whether the reset control is asking before it clears anything. */
  public readonly resetConfirmOpen = signal(false);
  /** The confirm's anchor, used to detect click-away dismissals. */
  private readonly resetRef =
    viewChild<ElementRef<HTMLElement>>('resetContainer');
  /** The reset trigger, so dismissing the confirm hands focus back to it. */
  private readonly resetBtn =
    viewChild<ElementRef<HTMLButtonElement>>('resetBtn');
  /** The style select, so clearing the style can hand focus back to it. */
  private readonly styleSelect =
    viewChild<ElementRef<HTMLSelectElement>>('styleSelect');

  private readonly sentPrompts = inject(PromptHistoryDbService);
  private readonly draftPrompts = inject(PromptDraftDbService);
  /** Whether the prompts library is open over the studio. */
  public readonly promptLibraryOpen = signal(false);
  /** The prompt help card, whose own count is fresher once it has one. */
  private readonly draftCard = viewChild(PromptDraftCardComponent);
  /** How many drafts were kept when the studio last counted them. */
  private readonly storedDraftCount = signal(0);
  /**
   * Whether there are drafts to go back to. The card counts again when a
   * request lands, which the studio's own count taken on arrival cannot see.
   */
  private readonly hasDrafts = computed(
    () => (this.draftCard()?.draftCount() ?? this.storedDraftCount()) > 0,
  );
  /**
   * Whether there is a sent prompt to go back to. The job list answers before
   * the sent store has been read, and the store answers once the results have
   * been cleared.
   */
  private readonly hasSentPrompts = computed(
    () => this.promptHistory().length > 0 || this.sentPrompts.size() > 0,
  );
  /** Whether the clock press has anything to open: a sent prompt or a draft. */
  public readonly hasPromptHistory = computed(
    () => this.hasSentPrompts() || this.hasDrafts(),
  );
  /** A reader with drafts and nothing sent is sent where the prompts are. */
  public readonly promptLibraryTab = computed<PromptLibraryTab>(() =>
    this.hasSentPrompts() ? 'sent' : 'drafts',
  );

  /** Whether a prompt from elsewhere asks before replacing the reader's own. */
  public readonly confirmPromptApply = signal(
    this.db.get(PROMPT_APPLY_CONFIRM_KEY) !== false,
  );
  /** The prompt waiting on the reader's answer, or null while nothing asks. */
  public readonly pendingPromptApply = signal<{
    incoming: PromptApplication;
    source: PromptApplySource;
  } | null>(null);
  /** Whether the estimate's breakdown popover is open. */
  public readonly kudosOpen = signal(false);
  /** The breakdown popover's anchor, used to detect click-away dismissals. */
  private readonly kudosRef =
    viewChild<ElementRef<HTMLElement>>('kudosContainer');
  /** The breakdown toggle, so dismissing with a key hands focus back to it. */
  private readonly kudosBtn =
    viewChild<ElementRef<HTMLButtonElement>>('kudosBtn');
  /** Whether the request-warnings popover beside Generate is open. */
  public readonly lintOpen = signal(false);
  /** The warnings popover's anchor, used to detect click-away dismissals. */
  private readonly lintRef =
    viewChild<ElementRef<HTMLElement>>('lintContainer');
  /** The warnings toggle, so dismissing with a key hands focus back to it. */
  private readonly lintBtn =
    viewChild<ElementRef<HTMLButtonElement>>('lintBtn');
  /** Whether the worker-feasibility popover beside Generate is open. */
  public readonly fitOpen = signal(false);
  /** The feasibility popover's anchor, used to detect click-away dismissals. */
  private readonly fitRef = viewChild<ElementRef<HTMLElement>>('fitContainer');
  /** The feasibility toggle, so dismissing with a key hands focus back to it. */
  private readonly fitBtn = viewChild<ElementRef<HTMLButtonElement>>('fitBtn');
  /** Whether the kudos-balance popover beside Generate is open. */
  public readonly balanceOpen = signal(false);
  /** The balance popover's anchor, used to detect click-away dismissals. */
  private readonly balanceRef =
    viewChild<ElementRef<HTMLElement>>('balanceContainer');
  /** The balance toggle, so dismissing with a key hands focus back to it. */
  private readonly balanceBtn =
    viewChild<ElementRef<HTMLButtonElement>>('balanceBtn');
  /** A kudos amount, abbreviated for the balance chip. */
  public abbreviateKudos(value: number): string {
    return this.units.formatCompactNumber(value);
  }

  /** Which prompt field, if any, is open in the full-screen editor. */
  public readonly promptEditor = signal<PromptEditorField | null>(null);

  /** Whether the reader has read the first-visit line and put it away. */
  private readonly promptHintDone = signal(
    this.db.get(PROMPT_HINT_KEY) === true,
  );

  /**
   * Whether the line saying the prompt is the only field that has to be filled
   * in is drawn. It is the whole telegraph a first-time reader gets: two
   * results in and it goes, because by then the reader has done the thing it
   * describes.
   */
  public readonly showPromptHint = computed(
    () => !this.promptHintDone() && this.finishedCount() < PROMPT_HINT_RESULTS,
  );

  /** Put the first-visit line away, here and on every later visit. */
  public dismissPromptHint(): void {
    this.promptHintDone.set(true);
    this.db.store(PROMPT_HINT_KEY, true);
  }

  /** The prompt box, so a picked history entry or starter prompt can focus it. */
  private readonly promptInput =
    viewChild<ElementRef<HTMLTextAreaElement>>('promptInput');

  /** The submit button, so the review dialog can hand focus back to it. */
  private readonly generateBtn =
    viewChild<ElementRef<HTMLButtonElement>>('generateBtn');

  private readonly selectedSampler = signal<string>('');
  public readonly recommendedSamplers = computed(() => {
    const contract = this.samplerContract();
    return contract
      ? contract.presentation_tiers.recommended.filter(
          (name) => contract.samplers[name] !== undefined,
        )
      : [...SAMPLERS];
  });
  public readonly advancedSamplers = computed(() => {
    const contract = this.samplerContract();
    if (!contract) return [];
    const recommended = new Set(this.recommendedSamplers());
    return Object.keys(contract.samplers).filter(
      (name) => !recommended.has(name),
    );
  });
  /**
   * The sampler the request holds where the select has no option for it: a
   * saved draft, a shared link or a walkthrough's example can all name one the
   * horde has since stopped offering. Kept and shown rather than rewritten,
   * because the value is the reader's and a select that renders blank is a
   * setting nobody can see.
   */
  public readonly staleSampler = computed(() => {
    const sampler = this.selectedSampler();
    return sampler !== '' &&
      !offeredSamplers(this.samplerContract()).includes(sampler)
      ? sampler
      : null;
  });
  public readonly samplerSettings = computed(() => {
    const sampler = this.samplerContract()?.samplers[this.selectedSampler()];
    if (!sampler) return [];
    return Object.entries(sampler.accepted_settings) as [
      SamplerSettingName,
      SamplerKnobRange,
    ][];
  });
  public readonly solverTypeChoices = computed(
    () =>
      this.samplerContract()?.samplers[this.selectedSampler()]
        ?.solver_type_choices ?? [],
  );
  public readonly schedulerOptions = computed((): ImageSchedulerName[] => {
    const contract = this.samplerContract();
    // Without the contract there is no way to know which of the newer schedules
    // the horde would accept for this sampler, so only the pair every worker
    // has always understood is offered.
    if (!contract) return [...LEGACY_SCHEDULERS];
    const baseline = this.modelBaseline();
    return availableSchedulers(
      contract,
      this.selectedSampler(),
      baseline ? [baseline] : [],
    );
  });
  public readonly flowShiftAllowed = computed(() => {
    const baseline = this.modelBaseline();
    return baselinesSupportFlowShift(baseline ? [baseline] : []);
  });
  public readonly minFlowShift = MIN_FLOW_SHIFT;
  public readonly maxFlowShift = MAX_FLOW_SHIFT;

  /**
   * Drop a scheduler or solver type the current sampler and model no longer
   * offer. A select holding a value that is not among its options renders
   * blank while the control still carries that value, which would send a
   * schedule the reader cannot see.
   */
  private readonly samplerVocabularySync = effect(() => {
    const schedulers = this.schedulerOptions();
    const solverTypes = this.solverTypeChoices();
    const controls = this.form().controls;
    if (!schedulers.includes(controls.scheduler.value)) {
      controls.scheduler.setValue(schedulers[0] ?? 'karras');
    }
    const solverType = controls.sampler_solver_type.value;
    if (solverType !== '' && !solverTypes.includes(solverType)) {
      controls.sampler_solver_type.setValue('');
    }
    this.revealAdvancedSampling();
  });
  public readonly upscalers = UPSCALERS;
  public readonly faceFixers = FACE_FIXERS;
  public readonly moduleDrawers = QR_MODULE_DRAWERS;

  public readonly minBatch = MIN_BATCH;
  public readonly maxBatch = MAX_BATCH;
  public readonly minSteps = MIN_STEPS;
  public readonly maxSteps = MAX_STEPS;
  public readonly stepsSliderMin = STEPS_SLIDER_MIN;
  public readonly stepsSliderMax = STEPS_SLIDER_MAX;
  public readonly minCfg = MIN_CFG_SCALE;
  public readonly maxCfg = MAX_CFG_SCALE;
  public readonly cfgStep = CFG_STEP;
  public readonly cfgSliderMin = CFG_SLIDER_MIN;
  public readonly cfgSliderMax = CFG_SLIDER_MAX;
  public readonly minClipSkip = MIN_CLIP_SKIP;
  public readonly maxClipSkip = MAX_CLIP_SKIP;
  public readonly minDimension = MIN_DIMENSION;
  public readonly maxDimension = MAX_DIMENSION;
  public readonly dimensionStep = DIMENSION_STEP;
  public readonly minFacefixer = MIN_FACEFIXER_STRENGTH;
  public readonly maxFacefixer = MAX_FACEFIXER_STRENGTH;
  public readonly minHiresDenoise = MIN_HIRES_DENOISE;
  public readonly maxHiresDenoise = MAX_HIRES_DENOISE;
  public readonly minSeedVariation = MIN_SEED_VARIATION;
  public readonly maxSeedVariation = MAX_SEED_VARIATION;
  public readonly minLoraStrength = MIN_LORA_STRENGTH;
  public readonly maxLoraStrength = MAX_LORA_STRENGTH;
  public readonly maxWorkers = MAX_WORKERS;
  public readonly minWebhookLength = MIN_WEBHOOK_LENGTH;
  public readonly maxWebhookLength = MAX_WEBHOOK_LENGTH;

  public samplerControl(
    setting: SamplerSettingName,
  ): FormControl<number | null> {
    return this.form().controls[setting];
  }

  public setOptionalNumberEntry(
    control: FormControl<number | null>,
    event: Event,
  ): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    control.setValue(raw === '' ? null : Number(raw));
    control.markAsDirty();
  }

  public samplerSettingInvalid(
    setting: SamplerSettingName,
    range: SamplerKnobRange,
  ): boolean {
    const value = this.samplerControl(setting).value;
    return value !== null && !samplerSettingIsValid(range, value);
  }

  public flowShiftInvalid(): boolean {
    const value = this.form().controls.flow_shift.value;
    return value !== null && (value < MIN_FLOW_SHIFT || value > MAX_FLOW_SHIFT);
  }

  // --- Advanced sampling ---------------------------------------------------

  /** Whether the advanced sampling knobs are showing. */
  public readonly advancedSamplingOpen = signal(false);
  /**
   * Set once the reader closes the disclosure, so a knob that arrives later
   * (from a preset, or from switching to a sampler that accepts one already
   * filled in) cannot push it back open for the rest of the session.
   */
  private advancedSamplingDismissed = false;

  public toggleAdvancedSampling(): void {
    const open = !this.advancedSamplingOpen();
    if (!open) {
      this.advancedSamplingDismissed = true;
    }
    this.advancedSamplingOpen.set(open);
  }

  /**
   * Whether this sampler and model offer any knob at all. The disclosure stays
   * in place either way once a contract exists, so a sampler with nothing to
   * tune says so rather than making the whole row vanish; without a contract
   * the horde rejects every one of these fields and the row is not offered.
   */
  public hasAdvancedSampling(): boolean {
    return (
      this.samplerContract() !== null &&
      (this.samplerSettings().length > 0 ||
        this.solverTypeChoices().length > 0 ||
        this.flowShiftAllowed())
    );
  }

  /** How many of the knobs that apply to this sampler and model carry a value. */
  public advancedSamplingCount(): number {
    const controls = this.form().controls;
    let count = this.samplerSettings().filter(
      ([name]) => controls[name].value !== null,
    ).length;
    if (
      this.solverTypeChoices().length > 0 &&
      controls.sampler_solver_type.value !== ''
    ) {
      count++;
    }
    if (this.flowShiftAllowed() && controls.flow_shift.value !== null) {
      count++;
    }
    return count;
  }

  /** Return every knob to the worker default, whether or not it applies here. */
  public clearAdvancedSampling(): void {
    const controls = this.form().controls;
    for (const name of SAMPLER_SETTING_NAMES) {
      controls[name].setValue(null);
    }
    controls.sampler_solver_type.setValue('');
    controls.flow_shift.setValue(null);
    this.form().markAsDirty();
  }

  /** Show the knobs unasked when some already carry a value. */
  private revealAdvancedSampling(): void {
    if (this.advancedSamplingDismissed || this.advancedSamplingOpen()) {
      return;
    }
    if (this.advancedSamplingCount() > 0) {
      this.advancedSamplingOpen.set(true);
    }
  }

  // --- Sampler cost --------------------------------------------------------

  /**
   * What the sampler charges per step relative to the cheapest ones, or
   * 'adaptive' where it picks its own step count. Null where it charges the
   * ordinary rate, or where the contract has not loaded.
   */
  public samplerWork(sampler: string): number | 'adaptive' | null {
    return samplerWorkFactor(this.samplerContract(), sampler);
  }

  /** The option label's key, which carries the suggestion and cost markers. */
  public samplerOptionKey(sampler: string): string {
    const work = this.samplerWork(sampler);
    const cost =
      work === null ? '' : work === 'adaptive' ? '_adaptive' : '_work';
    const suggested = this.isSuggestedSampler(sampler) ? '_suggested' : '';
    return `generate.form.sampler_option${suggested}${cost}`;
  }

  /**
   * The note under the select for an advanced-tier sampler. The tier is a
   * presentation hint and nothing more, so the line says as much rather than
   * reading as a warning.
   */
  public samplerTierKey(): string | null {
    const contract = this.samplerContract();
    const sampler = this.form().controls.sampler_name.value;
    if (contract?.samplers[sampler]?.presentation_tier !== 'advanced') {
      return null;
    }
    const work = this.samplerWork(sampler);
    if (work === 'adaptive') {
      // The option label states it too, but a long sampler name pushes that
      // marker out of the closed select, and this line is always in view.
      return 'generate.form.sampler_advanced_note_adaptive';
    }
    return typeof work === 'number'
      ? 'generate.form.sampler_advanced_note_work'
      : 'generate.form.sampler_advanced_note';
  }

  /** The schedules the horde pairs the selected sampler with, by name. */
  private readonly suggestedSchedules = computed(() =>
    recommendedSchedulers(this.samplerContract(), this.selectedSampler()),
  );

  /** The schedule option's key, which carries the suggestion marker. */
  public schedulerOptionKey(scheduler: ImageSchedulerName): string {
    return this.suggestedSchedules().includes(scheduler)
      ? 'generate.form.scheduler_option_suggested'
      : 'generate.form.scheduler_option';
  }

  public readonly negativePromptOpen = signal(false);
  /** Whether the CivitAI browse-and-add modal is open. */
  public readonly civitOpen = signal(false);
  /** Whether the style preview browser is open. */
  public readonly styleBrowserOpen = signal(false);

  /** Whether the QR-code control accepts input; unknown support reads as yes. */
  public readonly qrAllowed = computed(() => this.qrSupported() !== false);

  public readonly minControlStrength = MIN_CONTROL_STRENGTH;
  public readonly maxControlStrength = MAX_CONTROL_STRENGTH;
  public readonly controlStrengthStep = CONTROL_STRENGTH_STEP;
  public readonly defaultControlStrength = DEFAULT_CONTROL_STRENGTH;

  /**
   * Whether the QR workflow is on. The workflow applies a ControlNet of its own,
   * which is what makes the control strength settable from this card as well as
   * from the source-image card.
   */
  public readonly qrWorkflowOn = computed(
    () => (this.value()?.qrText ?? '').trim() !== '',
  );

  /** The weight set on the control map, or null while the worker's own stands. */
  public readonly controlStrength = computed(
    () => this.value()?.control_strength ?? null,
  );

  /** Set the weight from the slider, which only moves in the horde's range. */
  public setControlStrength(strength: number): void {
    const control = this.form().controls.control_strength;
    control.setValue(
      Math.min(MAX_CONTROL_STRENGTH, Math.max(MIN_CONTROL_STRENGTH, strength)),
    );
    control.markAsDirty();
  }

  /** The worker ID typed into the add field, before it joins the list. */
  public readonly workerDraft = signal('');

  /** Whether the list of workers to choose from is showing. */
  public readonly workerPickOpen = signal(false);

  private readonly workerPickRef = viewChild<ElementRef<HTMLElement>>(
    'workerPickContainer',
  );

  private readonly workerPickBtn =
    viewChild<ElementRef<HTMLButtonElement>>('workerPickBtn');

  private readonly workerOptBtns =
    viewChildren<ElementRef<HTMLButtonElement>>('workerOptBtn');

  /**
   * Which row of the picker the keyboard is on. The rows are buttons, so one of
   * them holds the tab stop and the arrows move it between them rather than
   * making the reader tab through every row to reach the one they want.
   */
  private readonly workerPickActive = signal(0);

  /** The row holding the tab stop, kept inside a list the typing has shortened. */
  public readonly workerPickTabStop = computed(() => {
    const count = this.workerMatches().length;
    return count === 0 ? 0 : Math.min(this.workerPickActive(), count - 1);
  });

  /**
   * The workers the request could be pinned to, best first. A worker already on
   * the list is left out: the row for it is right above, with its own remove.
   */
  public readonly workerOptions = computed<readonly WorkerPickOption[]>(() => {
    const listed = new Set(this.value()?.workers ?? []);
    const value = this.value();
    return pickableWorkers(
      this.activeWorkers(),
      value ? requestModelNames(value.model, value.extraModels) : [],
    ).filter((option) => !listed.has(option.id));
  });

  /**
   * The rows the typed text leaves standing. Both the name and the id are
   * searched: a reader who pasted an id gets the same answer as one who
   * remembers what the machine is called.
   */
  public readonly workerMatches = computed<readonly WorkerPickOption[]>(() => {
    const search = this.workerDraft().trim().toLowerCase();
    const options = this.workerOptions();
    if (search === '') {
      return options;
    }
    return options.filter(
      (option) =>
        option.name.toLowerCase().includes(search) ||
        option.id.toLowerCase().includes(search),
    );
  });

  /** Filter and reveal the worker list as soon as a search is entered. */
  public onWorkerDraftInput(value: string): void {
    this.workerDraft.set(value);
    this.workerPickActive.set(0);
    if (value.trim() !== '') {
      this.workerPickOpen.set(true);
    }
  }

  public toggleWorkerPick(): void {
    this.workerPickOpen.set(!this.workerPickOpen());
    this.workerPickActive.set(0);
  }

  /**
   * Move between picker rows: the arrows step and wrap, Home and End jump to
   * the ends. Choosing a row is left to the button itself, which Enter and
   * Space already press.
   */
  public onWorkerOptionKeydown(event: KeyboardEvent, index: number): void {
    const count = this.workerMatches().length;
    if (count === 0) {
      return;
    }
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = index + 1 < count ? index + 1 : 0;
        break;
      case 'ArrowUp':
        next = index > 0 ? index - 1 : count - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.workerPickActive.set(next);
    this.workerOptBtns()[next]?.nativeElement.focus();
  }

  public closeWorkerPick(): void {
    this.workerPickOpen.set(false);
  }

  /** Put a chosen worker on the list, without the reader typing its id. */
  public pickWorker(option: WorkerPickOption): void {
    const control = this.form().controls.workers;
    control.setValue(normalizeWorkers([...control.value, option.id]));
    this.workerDraft.set('');
    this.closeWorkerPick();
    this.workerPickBtn()?.nativeElement.focus();
  }

  /** The worker IDs the request is currently pinned to. */
  public workerList(): readonly string[] {
    return this.form().controls.workers.value;
  }

  /**
   * What a listed worker is called, or null when the horde is not listing it.
   * A row shows the name over the id where there is one: the id is what the
   * request carries, the name is what the reader recognises.
   */
  public workerName(id: string): string | null {
    return (
      this.activeWorkers()?.find((worker) => worker.id === id)?.name ?? null
    );
  }

  public canAddWorker(): boolean {
    return (
      this.workerDraft().trim() !== '' && this.workerList().length < MAX_WORKERS
    );
  }

  /**
   * Move the drafted worker ID into the list. `normalizeWorkers` is what the
   * request builder applies too, so a duplicate or over-cap entry is dropped
   * here rather than silently disappearing at submit time.
   */
  public addWorker(): void {
    if (!this.canAddWorker()) {
      return;
    }
    const control = this.form().controls.workers;
    control.setValue(normalizeWorkers([...control.value, this.workerDraft()]));
    this.workerDraft.set('');
  }

  public removeWorker(index: number): void {
    const control = this.form().controls.workers;
    control.setValue(control.value.filter((_, position) => position !== index));
  }

  public setWorkerBlacklist(blacklist: boolean): void {
    this.form().controls.workerBlacklist.setValue(blacklist);
  }

  /** Whether the typed webhook would be dropped from the request as malformed. */
  public webhookInvalid(): boolean {
    const webhook = this.form().controls.webhook.value.trim();
    return webhook !== '' && !isValidWebhook(webhook);
  }

  /**
   * Whether to warn that a QR batch will not be batched. The horde forces
   * `disable_batching` on for the `qr_code` workflow, so asking for more than
   * one image costs the time of that many separate jobs.
   */
  public qrBatchNoteVisible(): boolean {
    return (
      this.form().controls.qrText.value.trim() !== '' &&
      this.form().controls.n.value > 1
    );
  }

  /** Deterministic gradient for a LoRA/TI chip, cycled by list position. */
  public addonGradient(index: number): string {
    const grads = [
      'linear-gradient(135deg,#c7d2fe,#a5b4fc)',
      'linear-gradient(135deg,#e9d5ff,#c4b5fd)',
      'linear-gradient(135deg,#bfdbfe,#93c5fd)',
      'linear-gradient(135deg,#fbcfe8,#f0abfc)',
    ] as const;
    return grads[index % grads.length] ?? grads[0];
  }

  /** How many models one request may name, counting the primary. */
  public readonly maxModels = MAX_REQUEST_MODELS;

  /**
   * The picker for a further model. Held here rather than in the form group:
   * the draft is not a setting, and nothing is added to the request until the
   * reader confirms it.
   */
  public readonly extraModelDraft = new FormControl<string>('', {
    nonNullable: true,
  });

  /** Whether the picker for a further model is showing. */
  public readonly extraModelOpen = signal(false);

  /** The further models the request would also accept, beside the primary. */
  public extraModelList(): readonly string[] {
    return this.form().controls.extraModels.value;
  }

  /** Whether there is room for another model, and a primary to sit beside. */
  public canOfferModel(): boolean {
    return (
      this.form().controls.model.value.trim() !== '' &&
      this.extraModelList().length + 1 < MAX_REQUEST_MODELS
    );
  }

  /** Show the picker for a further model, ready to be typed into. */
  public openExtraModel(): void {
    this.extraModelDraft.setValue('');
    this.extraModelOpen.set(true);
  }

  public canAddExtraModel(): boolean {
    const draft = this.extraModelDraft.value.trim();
    return (
      draft !== '' &&
      draft !== this.form().controls.model.value.trim() &&
      !this.extraModelList().includes(draft)
    );
  }

  /**
   * Put the drafted model on the list. `normalizeExtraModels` is what the
   * request builder applies too, so a duplicate or over-cap entry is dropped
   * here rather than silently disappearing at submit time.
   */
  public addExtraModel(): void {
    if (!this.canAddExtraModel()) {
      return;
    }
    const controls = this.form().controls;
    controls.extraModels.setValue(
      normalizeExtraModels(controls.model.value, [
        ...controls.extraModels.value,
        this.extraModelDraft.value,
      ]),
    );
    controls.extraModels.markAsDirty();
    this.extraModelDraft.setValue('');
    this.extraModelOpen.set(false);
  }

  public removeExtraModel(index: number): void {
    const control = this.form().controls.extraModels;
    control.setValue(control.value.filter((_, position) => position !== index));
    control.markAsDirty();
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
   * What the workers carrying the selected model can do between them, or null
   * when no model is picked, nobody carries it, or the worker list is unknown.
   */
  public selectedModelFacts(): ModelWorkerFacts | null {
    const name = this.form().controls.model.value.trim();
    if (!name) {
      return null;
    }
    return this.modelFacts()?.get(name) ?? null;
  }

  /**
   * Every model the request would accept, primary first, with a style's pin
   * standing over the reader's own pick. A style that pins a model replaces the
   * whole list, so the further models are no part of what would be sent.
   */
  private licensingModelNames(): readonly string[] {
    const pinned = this.isSectionLocked('model');
    const primary = pinned
      ? (this.forcedParams()?.model ?? '')
      : this.form().controls.model.value;
    return requestModelNames(primary, pinned ? [] : this.extraModelList());
  }

  /**
   * What the model picker says about using the pictures commercially: the
   * answer that leaves the reader with the most doubt across every model the
   * request would accept. Null while the reference has not answered.
   */
  public modelLicensing(): NamedLicensingFact | null {
    const entries: NamedLicensingFact[] = [];
    for (const name of this.licensingModelNames()) {
      const fact = this.licensing.commercialUse('image_generation', name)();
      if (fact !== null) {
        entries.push({ name, category: 'image_generation', fact });
      }
    }
    return worstLicensingFact(entries);
  }

  /** Whether the model line has to say which of the models it is about. */
  public modelLicensingNamesAsset(): boolean {
    return this.licensingModelNames().length > 1;
  }

  /** The family the picked model belongs to (SD1.5 512 vs SDXL 1024). */
  public readonly sizeFamily = signal<ModelSizeFamily>(1024);

  /** Whether the hires pass is on, which the offered sizes follow. */
  private readonly hiresOn = signal(false);

  /**
   * The family the shapes are offered at. The hires pass draws at the trained
   * size and enlarges, so while it is on the panel offers the family above the
   * model's own rather than the one it would draw in a single pass.
   */
  public readonly sizeBase = computed<ModelSizeBase>(() =>
    liftSizeBase(this.sizeFamily(), this.hiresOn()),
  );
  public readonly presets = computed(() => buildAspectPresets(this.sizeBase()));

  /**
   * Whether the dimensions have been set by anything other than the model-driven
   * snap since the panel was created: a preset, a slider, the size-family
   * toggle, a loaded preset, or a style handing its values back. Once set, the
   * snap stands down for the rest of the session, so a chosen size survives every
   * later model change. Combined with {@link isSnappableSize} this is deliberately
   * conservative: it would rather leave a stale square in place than overwrite a
   * size the user meant.
   */
  private readonly sizeTouched = signal(false);

  /**
   * Set while the snap writes the dimensions, so its own patch is not mistaken
   * for the user touching them. Form writes emit synchronously, so a plain flag
   * covers the whole window.
   */
  private snappingSize = false;

  /**
   * Set while the panel writes a size it chose from the shapes it offers, so
   * that write is told apart from one made on the dimensions controls. Form
   * writes emit synchronously, so a plain flag covers the whole window.
   */
  private offeringSize = false;

  /**
   * Whether the size in the controls is one the panel offered rather than one
   * entered on the dimensions controls. Only an offered size may be carried
   * onto the matching shape in another family: the panel decided what that
   * shape's size was, so it may decide again, while entered numbers mean
   * themselves even when they happen to match a shape the panel offers.
   */
  private sizeOffered = true;

  /**
   * The hires state the size was last snapped for, so that turning the pass on
   * or off is told apart from the panel merely being rendered again.
   */
  private lastHires: boolean | null = null;

  /**
   * Follow the selected model's baseline and the hires pass: preselect the
   * family the shapes are offered at, and move a size the panel itself put
   * there onto the matching one in it.
   *
   * Two kinds of size may be moved, and nothing else. Turning the hires pass on
   * or off moves a size the panel offered onto the same shape in the family now
   * in force, because it was the panel that decided what that shape's size was.
   * A model change moves a still-pristine square onto the new baseline's native
   * square. A size entered on the dimensions controls is the reader's own and is
   * left alone in both cases, including when its numbers match a shape the panel
   * offers.
   */
  private readonly baselineSizeSync = effect(() => {
    const baseline = this.modelBaseline();
    const hires = this.hiresOn();
    const hiresChanged = this.lastHires !== null && this.lastHires !== hires;
    this.lastHires = hires;
    const controls = this.form().controls;
    if (controls.width.disabled || controls.height.disabled) {
      return;
    }
    if (hiresChanged) {
      if (!this.sizeOffered) {
        return;
      }
      const moved = rescalePresetToBase(
        controls.width.value,
        controls.height.value,
        this.sizeBase(),
      );
      if (moved !== null) {
        this.snappingSize = true;
        this.form().patchValue(moved);
        this.snappingSize = false;
      }
      return;
    }
    const native = nativeSquareFor(baseline);
    const family = sizeFamilyFor(baseline);
    if (native === null || family === null || this.sizeTouched()) {
      return;
    }
    if (!isSnappableSize(controls.width.value, controls.height.value)) {
      return;
    }
    this.sizeFamily.set(family);
    if (controls.width.value === native && controls.height.value === native) {
      return;
    }
    this.snappingSize = true;
    this.form().patchValue({ width: native, height: native });
    this.snappingSize = false;
  });

  public ngOnInit(): void {
    this.restoreGroupsOpen();
    void this.countDrafts();
    this.value.set(this.form().getRawValue());
    this.form()
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.value.set(this.form().getRawValue()));

    const controls = this.form().controls;
    this.hiresOn.set(controls.hires_fix.value);
    controls.hires_fix.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((on) => this.hiresOn.set(on));
    this.selectedSampler.set(controls.sampler_name.value);
    controls.sampler_name.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sampler) => this.selectedSampler.set(sampler));
    merge(
      ...SAMPLER_SETTING_NAMES.map((name) => controls[name].valueChanges),
      controls.sampler_solver_type.valueChanges,
      controls.flow_shift.valueChanges,
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.revealAdvancedSampling());
    // A strength the request can no longer carry is dropped rather than kept
    // out of sight: the horde refuses it without a control map, and the ledger
    // would otherwise list a setting nothing is sending.
    controls.qrText.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((text) => {
        if (
          text.trim() === '' &&
          controls.control_type.value === '' &&
          controls.control_strength.value !== null
        ) {
          controls.control_strength.setValue(null);
        }
      });
    controls.styleName.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onStyleNameChanged());
    // A loaded preset can carry detachments, so mirror the control itself too.
    controls.styleDetach.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncDetachedSections());
    this.syncDetachedSections();

    merge(controls.width.valueChanges, controls.height.valueChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.snappingSize) {
          return;
        }
        this.sizeTouched.set(true);
        this.sizeOffered = this.offeringSize;
      });
  }

  // --- Settings groups -----------------------------------------------------

  private readonly groupsOpen = signal<Partial<Record<GroupId, boolean>>>({});

  /**
   * The source card, projected into the panel rather than held by it. It keeps
   * its own fold, so folding everything reaches it by hand rather than through
   * the store the groups share.
   */
  private readonly sourceCard = contentChild(GenerateSourceImageComponent);

  /** Whether `group` is currently showing its controls rather than its values. */
  public isGroupOpen(group: GroupId): boolean {
    return this.groupsOpen()[group] ?? GROUP_OPEN_DEFAULT;
  }

  public toggleGroup(group: GroupId): void {
    this.setGroupOpen(group, !this.isGroupOpen(group));
  }

  /** Whether anything is open to fold, which is what offers the action. */
  public anyGroupOpen(): boolean {
    if (GROUP_IDS.some((group) => this.isGroupOpen(group))) {
      return true;
    }
    const source = this.sourceCard();
    return source !== undefined && source.open();
  }

  /**
   * Fold every group back up, and the source card with them, returning the
   * panel to the face it opens with. Written through the same stores as a
   * single fold, so the panel is still folded on the next visit.
   */
  public foldAllGroups(): void {
    const next: Partial<Record<GroupId, boolean>> = { ...this.groupsOpen() };
    for (const group of GROUP_IDS) {
      next[group] = false;
    }
    this.groupsOpen.set(next);
    this.db.store(GROUPS_OPEN_KEY, next);
    this.sourceCard()?.fold();
  }

  /**
   * The warnings about controls inside each group, by the anchor each names.
   * Read by the folded head's count and by the press that opens it at the
   * control: a fold is the reader's own and never stands for a problem dealt
   * with.
   */
  private readonly warningsByGroup = computed(() => {
    const byGroup = new Map<GroupId, RequestWarning[]>();
    for (const warning of this.lintWarnings()) {
      const group = GROUP_BY_ANCHOR[warning.anchor];
      if (!group) {
        continue;
      }
      const held = byGroup.get(group);
      if (held) {
        held.push(warning);
      } else {
        byGroup.set(group, [warning]);
      }
    }
    return byGroup;
  });

  public groupLintCount(group: GroupId): number {
    return this.warningsByGroup().get(group)?.length ?? 0;
  }

  public groupLintLabel(group: GroupId): string {
    const count = this.groupLintCount(group);
    if (count === 0) {
      return '';
    }
    const name: string = this.transloco.translate(GROUP_TITLE_KEY[group]);
    return this.transloco.translate(
      `generate.groups.lint_count${count === 1 ? '_one' : '_other'}`,
      { count, group: name },
    );
  }

  /**
   * Open a folded group at the first control one of its warnings is about, in
   * the same gesture the warnings beside Generate use.
   */
  public goToGroupLint(group: GroupId): void {
    const anchor = this.warningsByGroup().get(group)?.[0]?.anchor;
    if (anchor) {
      this.goToField(anchor);
    } else {
      this.openGroup(group);
    }
  }

  /**
   * Show `group`'s controls, whether or not the reader had folded it away.
   * Reports whether the group was folded, so a caller that narrates what it
   * opened says so only when something actually moved.
   */
  public openGroup(group: GroupId): boolean {
    if (this.isGroupOpen(group)) {
      return false;
    }
    this.setGroupOpen(group, true);
    return true;
  }

  /**
   * Open the group holding `anchor`, if it is in one. Called before the panel
   * points at a control: a folded group holds no element to point at.
   */
  public openGroupForAnchor(anchor: string): boolean {
    const group = GROUP_BY_ANCHOR[anchor];
    return group ? this.openGroup(group) : false;
  }

  /**
   * Open the group holding the named panel area's card, if that area is one of
   * the folded ones. Backs the glossary's "show me this part of the panel":
   * ringing a group's closed head would point at a line of values rather than
   * at the controls the reader asked to be shown. Finishing owns two groups and
   * resolves to the first of them, which is the one the pointing lands on.
   */
  public openGroupForSection(section: SectionId): boolean {
    const group = GROUP_BY_SECTION[section];
    return group ? this.openGroup(group) : false;
  }

  private setGroupOpen(group: GroupId, open: boolean): void {
    const next = { ...this.groupsOpen(), [group]: open };
    this.groupsOpen.set(next);
    this.db.store(GROUPS_OPEN_KEY, next);
  }

  private restoreGroupsOpen(): void {
    const stored = this.db.get(GROUPS_OPEN_KEY);
    if (typeof stored !== 'object' || stored === null) {
      return;
    }
    const next: Partial<Record<GroupId, boolean>> = {};
    for (const group of GROUP_IDS) {
      const value = (stored as Record<string, unknown>)[group];
      if (typeof value === 'boolean') {
        next[group] = value;
      }
    }
    this.groupsOpen.set(next);
  }

  /**
   * Mirror of the form's value. The summary lines and the changed marks are
   * computed, so they need the value as a signal rather than as controls read
   * during change detection.
   */
  private readonly value = signal<GenerateFormValue | null>(null);

  /** Whether `group` holds anything the form did not start out with. */
  public groupChanged(group: GroupId): boolean {
    const value = this.value();
    if (!value) {
      return false;
    }
    return [...GROUP_FIELDS[group], ...sharedGroupFields(group, value)].some(
      (field) =>
        JSON.stringify(value[field]) !==
        JSON.stringify(DEFAULT_GENERATE_FORM_VALUE[field]),
    );
  }

  /** Whether the changed-settings ledger is open. */
  public readonly ledgerOpen = signal(false);

  private readonly ledgerRef =
    viewChild<ElementRef<HTMLElement>>('ledgerContainer');

  private readonly ledgerBtn =
    viewChild<ElementRef<HTMLButtonElement>>('ledgerBtn');

  public toggleLedger(): void {
    this.ledgerOpen.update((open) => !open);
  }

  public closeLedger(): void {
    this.ledgerOpen.set(false);
  }

  /**
   * Everything the panel is no longer carrying its default for, gathered under
   * the card each setting lives in. Sections with nothing changed are absent
   * rather than listed empty.
   */
  public readonly ledgerSections = computed<LedgerGroupRows[]>(() => {
    const value = this.value();
    if (!value) {
      return [];
    }
    const sections = new Map<LedgerSection, LedgerRow[]>();
    // A setting two cards can own is listed under the one that has it, so the
    // row leads to the control the value was actually set from.
    const shared = new Set(sharedGroupFields('qr', value));
    for (const field of changedFields(value) as LedgerField[]) {
      const section = shared.has(field)
        ? 'qr'
        : (FIELD_GROUP.get(field) ?? 'compose');
      const rows = sections.get(section) ?? [];
      rows.push({ field, labelKey: FIELD_LABEL_KEY[field] });
      sections.set(section, rows);
    }
    return [...sections].map(([section, rows]) => ({
      section,
      titleKey: LEDGER_SECTION_TITLE_KEY[section],
      rows,
    }));
  });

  /** How many settings the ledger is holding, for the count it wears. */
  public readonly ledgerCount = computed(() =>
    this.ledgerSections().reduce(
      (total, section) => total + section.rows.length,
      0,
    ),
  );

  /**
   * Put one setting back to what the panel started with. The control is written
   * rather than the whole form, so nothing else the reader has moved is touched.
   */
  public resetField(field: LedgerField): void {
    const control = this.form().controls[field];
    control.setValue(
      structuredClone(DEFAULT_GENERATE_FORM_VALUE[field]) as never,
    );
    control.markAsDirty();
  }

  /** A count worded for the number it carries, the studio's plural idiom. */
  private counted(key: string, count: number): string {
    return this.transloco.translate(
      `${key}${count === 1 ? '_one' : '_other'}`,
      { count },
    );
  }

  /**
   * A group's current values in one line, or nothing at all when it holds none
   * worth reading. A group left as it started says so by having no line and no
   * changed mark; a phrase standing in for the absence reads as a value of its
   * own and was taken for one.
   */
  private summaryLine(parts: readonly (string | null)[]): string {
    return parts
      .filter((part): part is string => part !== null && part !== '')
      .join(SUMMARY_SEPARATOR);
  }

  /**
   * The size, and the hires pass when it is on. Every request has a size, so
   * this line is never empty: the group can be folded from the start and still
   * answer the question the card was there to answer.
   */
  public readonly dimensionsSummary = computed(() => {
    const value = this.value();
    return value
      ? this.summaryLine([
          this.transloco.translate('generate.groups.dimensions_size', {
            width: value.width,
            height: value.height,
          }),
          value.hires_fix
            ? this.transloco.translate('generate.groups.dimensions_hires')
            : null,
          value.hires_fix &&
          value.hires_fix_denoising_strength !==
            DEFAULT_GENERATE_FORM_VALUE.hires_fix_denoising_strength
            ? this.transloco.translate(
                'generate.groups.dimensions_hires_denoise',
                { value: value.hires_fix_denoising_strength },
              )
            : null,
        ])
      : '';
  });

  /** Width of the live aspect preview, scaled with its height inside the stage. */
  public sizePreviewWidth(): number {
    const controls = this.form().controls;
    const width = Math.max(1, controls.width.value);
    const height = Math.max(1, controls.height.value);
    const scale = Math.min(42 / width, 26 / height);
    return width * scale;
  }

  /** Height of the live aspect preview, scaled with its width inside the stage. */
  public sizePreviewHeight(): number {
    const controls = this.form().controls;
    const width = Math.max(1, controls.width.value);
    const height = Math.max(1, controls.height.value);
    const scale = Math.min(42 / width, 26 / height);
    return height * scale;
  }

  public readonly samplingSummary = computed(() => {
    const value = this.value();
    return value
      ? this.summaryLine([
          value.sampler_name,
          this.transloco.translate('generate.groups.sampling_steps', {
            count: value.steps,
          }),
          this.transloco.translate('generate.groups.sampling_cfg', {
            value: value.cfg_scale,
          }),
          value.clip_skip === DEFAULT_GENERATE_FORM_VALUE.clip_skip
            ? null
            : this.transloco.translate('generate.groups.sampling_clip', {
                value: value.clip_skip,
              }),
          value.scheduler === DEFAULT_GENERATE_FORM_VALUE.scheduler
            ? null
            : this.transloco.translate('generate.groups.sampling_schedule', {
                value: value.scheduler,
              }),
          ...this.samplingKnobParts(value),
        ])
      : '';
  });

  /**
   * Every solver knob carrying something other than the worker's default, each
   * named as its own field names it. They are submitted like any other setting,
   * so a folded group that leaves them out says the group holds less than it
   * does.
   */
  private samplingKnobParts(value: GenerateFormValue): string[] {
    const parts: string[] = [];
    const knob = (field: string, entered: string | number): void => {
      parts.push(
        this.transloco.translate('generate.groups.sampling_knob', {
          label: this.transloco.translate<string>(
            `generate.form.${field}_label`,
          ),
          value: entered,
        }),
      );
    };
    for (const name of SAMPLER_SETTING_NAMES) {
      const entered = value[name];
      if (entered !== null) {
        knob(name, entered);
      }
    }
    if (value.sampler_solver_type !== '') {
      knob('sampler_solver_type', value.sampler_solver_type);
    }
    if (value.flow_shift !== null) {
      knob('flow_shift', value.flow_shift);
    }
    return parts;
  }

  public readonly lorasSummary = computed(() => {
    const value = this.value();
    return value
      ? this.summaryLine([
          value.loras.length > 0
            ? this.counted('generate.groups.loras_count', value.loras.length)
            : null,
          value.tis.length > 0
            ? this.counted('generate.groups.tis_count', value.tis.length)
            : null,
        ])
      : '';
  });

  public readonly postSummary = computed(() => {
    const value = this.value();
    return value ? this.summaryLine(value.post_processing) : '';
  });

  public readonly outputSummary = computed(() => {
    const value = this.value();
    return value
      ? this.summaryLine([
          this.transloco.translate(
            value.nsfw
              ? 'generate.groups.output_nsfw_on'
              : 'generate.groups.output_nsfw_off',
          ),
          // The horde censors only where adult content is not allowed, so the
          // censor is worth a word only in that half of the switch.
          value.nsfw
            ? null
            : this.transloco.translate(
                value.censor_nsfw
                  ? 'generate.groups.output_censor_on'
                  : 'generate.groups.output_censor_off',
              ),
          value.shared
            ? this.transloco.translate('generate.groups.output_shared')
            : null,
        ])
      : '';
  });

  /**
   * Whether the censor switch is offered. The horde acts on it only where adult
   * content is not allowed, so while it is allowed the switch is frozen at
   * whatever it holds rather than inviting an answer nothing reads.
   */
  public censorInert(): boolean {
    return this.value()?.nsfw === true;
  }

  /**
   * Freeze the censor while adult content is allowed. Disabling keeps the
   * stored answer: the request is built from the raw value, so the reader's
   * setting comes back the moment adult content is blocked again.
   */
  private readonly censorAvailabilitySync = effect(() => {
    this.setDisabled(this.form().controls.censor_nsfw, this.censorInert());
  });

  public readonly hordeSummary = computed(() => {
    const value = this.value();
    return value
      ? this.summaryLine([
          value.workers.length > 0
            ? this.counted(
                value.workerBlacklist
                  ? 'generate.groups.horde_blocked'
                  : 'generate.groups.horde_allowed',
                value.workers.length,
              )
            : this.transloco.translate('generate.groups.horde_any'),
          value.trusted_workers
            ? this.transloco.translate('generate.groups.horde_trusted')
            : null,
          value.webhook
            ? this.transloco.translate('generate.groups.horde_webhook')
            : null,
        ])
      : '';
  });

  public readonly transparentSummary = computed(() => {
    const value = this.value();
    return value?.transparent
      ? this.transloco.translate('generate.groups.workflows_transparent')
      : '';
  });

  public readonly qrSummary = computed(() => {
    const value = this.value();
    return value?.qrText
      ? this.transloco.translate('generate.groups.workflows_qr')
      : '';
  });

  public setSizeBase(family: ModelSizeFamily): void {
    this.sizeFamily.set(family);
    this.sizeTouched.set(true);
  }

  public applyPreset(width: number, height: number): void {
    const controls = this.form().controls;
    const portrait = controls.height.value > controls.width.value;
    this.offeringSize = true;
    this.form().patchValue(
      portrait && width !== height
        ? { width: height, height: width }
        : { width, height },
    );
    this.offeringSize = false;
    controls.width.markAsDirty();
    controls.height.markAsDirty();
  }

  /**
   * Whether the current size is this shape. Either way round counts: the chips
   * offer square and wide shapes only, and the swap turns the chosen one on its
   * side, so a tall picture is still the shape the reader picked.
   */
  public isPresetActive(width: number, height: number): boolean {
    const controls = this.form().controls;
    const current = [controls.width.value, controls.height.value];
    return (
      (current[0] === width && current[1] === height) ||
      (current[0] === height && current[1] === width)
    );
  }

  /** Turn the current size on its side, whether it came from a chip or not. */
  public swapDimensions(): void {
    const controls = this.form().controls;
    // A swap turns the shape over without changing where its size came from, so
    // a shape the panel offered stays one it may carry to another family.
    this.offeringSize = this.sizeOffered;
    this.form().patchValue({
      width: controls.height.value,
      height: controls.width.value,
    });
    this.offeringSize = false;
    controls.width.markAsDirty();
    controls.height.markAsDirty();
  }

  // --- Model recommendations ----------------------------------------------
  //
  // Advice the model reference carries for the selected model, rendered as a
  // line under the control it concerns. A line that the form's current value
  // contradicts reads as a warning; none of it gates submission. Form controls
  // are not signals, so these are methods the template re-reads on each change
  // detection rather than computeds.

  /**
   * The value a line of advice is about. A control a style has frozen goes on
   * holding the style's value, so advice about a neighbouring setting still
   * reads the value the request will carry rather than the reader's own.
   */
  private advisedValue<T>(
    field: LockedField,
    own: T,
    forced: T | undefined,
  ): T {
    return forced !== undefined && this.isFieldLocked(field) ? forced : own;
  }

  /**
   * Drop a line of advice about a field the style holds. The reader cannot move
   * that control, so a line telling them to is asking for something they cannot
   * do; what the style's own values imply for the request is still said by the
   * request lint and the price breakdown, which read the styled value.
   */
  private unlessPinned<T>(field: LockedField, hint: T | null): T | null {
    return this.isFieldLocked(field) ? null : hint;
  }

  /** The sampler the request will run, which the sampler-shaped advice reads. */
  private advisedSampler(): ImageSamplerName {
    return this.advisedValue(
      'sampler_name',
      this.form().controls.sampler_name.value,
      this.forcedParams()?.sampler_name,
    );
  }

  /** The one line under the step count. */
  public stepsAdvisory(): RequirementHint | null {
    const controls = this.form().controls;
    return this.unlessPinned(
      'steps',
      stepsAdvisory(
        this.modelRequirements(),
        this.samplerContract(),
        this.advisedSampler(),
        controls.steps.value,
      ),
    );
  }

  /** The one line under the guidance scale. */
  public cfgAdvisory(): RequirementHint | null {
    const controls = this.form().controls;
    return this.unlessPinned(
      'cfg_scale',
      cfgAdvisory(
        this.modelRequirements(),
        this.samplerContract(),
        this.advisedSampler(),
        controls.cfg_scale.value,
      ),
    );
  }

  /** The one line under the CLIP skip slider. */
  public clipSkipAdvisory(): RequirementHint | null {
    return this.unlessPinned(
      'clip_skip',
      clipSkipAdvisory(
        this.modelRequirements(),
        this.form().controls.clip_skip.value,
      ),
    );
  }

  public samplerHint(): RequirementHint | null {
    return this.unlessPinned(
      'sampler_name',
      samplerRequirementHint(this.modelRequirements(), this.advisedSampler()),
    );
  }

  /** The one line under the schedule select. */
  public scheduleAdvisory(): RequirementHint | null {
    return this.unlessPinned(
      'scheduler',
      scheduleAdvisory(
        this.modelRequirements(),
        this.samplerContract(),
        this.form().controls.scheduler.value,
      ),
    );
  }

  /** Whether the model names `sampler` among the ones it was tuned for. */
  public isSuggestedSampler(sampler: string): boolean {
    return suggestedSamplers(this.modelRequirements()).includes(sampler);
  }

  /** The one line under the size controls. */
  public sizeAdvisory(): RequirementHint | null {
    const controls = this.form().controls;
    // The size is one line under two controls, and a style pinning either takes
    // the shape out of the reader's hands.
    if (this.isFieldLocked('width') || this.isFieldLocked('height')) {
      return null;
    }
    return sizeAdvisory(
      this.modelBaseline(),
      controls.width.value,
      controls.height.value,
      this.advisedValue(
        'hires_fix',
        controls.hires_fix.value,
        this.forcedParams()?.hires_fix,
      ),
    );
  }

  /**
   * Whether the size gives the hires pass something to do that the request is
   * not asking for. The switch is marked and given a line of its own, so the
   * warning above it names an action the reader can see from where they read it.
   */
  public hiresSuggested(): boolean {
    const controls = this.form().controls;
    return (
      sd15HiresHint(
        this.modelBaseline(),
        controls.width.value,
        controls.height.value,
        controls.hires_fix.value,
      ) !== null
    );
  }

  /** The "hires fix is on and doing nothing at this size" note. */
  public hiresUnneededHint(): RequirementHint | null {
    const controls = this.form().controls;
    return this.unlessPinned(
      'hires_fix',
      hiresUnneededHint(
        this.modelBaseline(),
        controls.width.value,
        controls.height.value,
        controls.hires_fix.value,
      ),
    );
  }

  public toggleNegativePrompt(): void {
    this.negativePromptOpen.update((open) => !open);
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

  /**
   * What the reference says about using one post-processor's output
   * commercially, or null when none is selected or it has not answered.
   */
  public postProcessorLicensing(
    name: ImagePostProcessor | '',
  ): LicensingFact | null {
    return name === ''
      ? null
      : this.licensing.commercialUse(postProcessorCategory(name), name)();
  }

  /** One licensing fact as the line shown under the control it belongs to. */
  public licensingLine(
    fact: LicensingFact,
    name: string,
    nameAsset: boolean,
  ): string {
    return licensingLineText(this.transloco, fact, name, nameAsset);
  }

  /** Where a fact line's link takes a reader who wants the whole licence. */
  public explorerUrl(entry: NamedLicensingFact): string {
    return licensingExplorerUrl(entry.category, entry.name);
  }

  /** The same for a post-processor, whose line carries only its own name. */
  public postProcessorExplorerUrl(name: ImagePostProcessor): string {
    return licensingExplorerUrl(postProcessorCategory(name), name);
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

  /** Take an edited selection list onto the form, marking it as the user's. */
  public setLoras(next: FormLoraEntry[]): void {
    const control = this.form().controls.loras;
    control.setValue(next);
    control.markAsDirty();
  }

  public setTis(next: FormTiEntry[]): void {
    const control = this.form().controls.tis;
    control.setValue(next);
    control.markAsDirty();
  }

  /**
   * Put a trigger word into the prompt. The studio's prompt is plain text; the
   * style editor's is a template, which is why the selection list asks its host
   * to do this rather than writing anywhere itself.
   */
  public appendToPrompt(trigger: string): void {
    const control = this.form().controls.prompt;
    const current = control.value.trim();
    control.setValue(current ? `${current}, ${trigger}` : trigger);
    control.markAsDirty();
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

  /**
   * Take what was typed into a number field onto its control. The field is
   * bound one way and parsed here because the forms number accessor writes null
   * for an empty or half-typed entry, where every reader of these controls does
   * arithmetic on a number. A value outside the horde's bounds is kept as typed
   * so the control's own validator can mark the field: clamping it silently
   * would submit a number nobody asked for.
   */
  public setNumberEntry(control: FormControl<number>, event: Event): void {
    const typed = (event.target as HTMLInputElement).value;
    const parsed = Number(typed);
    if (typed.trim() === '' || !Number.isFinite(parsed)) {
      return;
    }
    control.setValue(parsed);
    control.markAsDirty();
  }

  /** Where a slider's thumb sits, as the percentage its track fills to. */
  public readonly rangeFill = rangeFillPercent;

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
    const controls = this.form().controls;
    for (const field of LOCKED_FIELDS) {
      this.setDisabled(controls[field], this.isFieldLocked(field));
    }
    this.syncPinnedFields();
  });

  /**
   * Whether the style freezes `field`. This is the answer the panel paints
   * with: the section-wide answer is too coarse, and a style pinning only the
   * steps would have every other sampling knob drawn as frozen while it is
   * still editable.
   */
  public isFieldLocked(field: LockedField): boolean {
    const forced = this.forcedParams();
    if (forced === null) {
      return false;
    }
    const section = STYLE_PINNED_FIELD_SECTION[field];
    if (this.activeDetachedSections().includes(section)) {
      return false;
    }
    return stylePinsField(forced, field) || this.hordeOverrules(section);
  }

  /**
   * Whether the horde's own reading of the selected style overrules `section`
   * whole. It replaces the request's parameters with the style's, so every
   * sampling and finishing control is overruled whether or not the style names
   * a value for it. The size is the exception, because the horde keeps the
   * reader's wherever the style names none, and the model is overruled only
   * where the style names one: both are answered by what the style carries.
   */
  private hordeOverrules(section: StyleLockSection): boolean {
    return (
      this.hordeAppliesStyle() &&
      (section === 'sampling' || section === 'finishing')
    );
  }

  /**
   * The sections taken back from the style, which is none of them while the
   * horde applies it: there is nothing to take back, so a detachment recorded
   * against such a style is ignored rather than shown or acted on.
   */
  private activeDetachedSections(): readonly StyleLockSection[] {
    return this.hordeAppliesStyle() ? [] : this.detachedSections();
  }

  /** The fields the selected style is pinning over right now. */
  private pinnedFields(): readonly StylePinnedField[] {
    const forced = this.forcedParams();
    if (forced === null) {
      return [];
    }
    const detached = this.activeDetachedSections();
    return STYLE_PINNED_FIELDS.filter(
      (field) =>
        stylePinsField(forced, field) &&
        !detached.includes(STYLE_PINNED_FIELD_SECTION[field]),
    );
  }

  /**
   * Show every value a style pins in the control that holds it, and hand the
   * reader's own values back the moment it stops pinning them. A pinned control
   * left showing what the reader had names a setting the request will never
   * carry, and the model field showing one model while another is generated is
   * the same fault as the schedule reading `karras` under a style that forces
   * `normal`.
   *
   * The values the style stands on are kept in `valuesBeforeStyle` rather than
   * in a field here, so they come back with the rest of the form after a reload
   * and survive a switch straight from one style to another: a field already
   * held is not snapshotted again, so what comes back is always what the reader
   * had before any style touched it.
   */
  private syncPinnedFields(): void {
    const form = this.form();
    const controls = form.controls;
    const value = form.getRawValue();
    const before: StyleValueSnapshot = { ...(value.valuesBeforeStyle ?? {}) };
    const pinned = this.pinnedFields();
    let snapshotChanged = false;
    let restoredSize = false;

    for (const field of STYLE_PINNED_FIELDS) {
      if (pinned.includes(field)) {
        if (!(field in before)) {
          Object.assign(before, { [field]: value[field] });
          snapshotChanged = true;
        }
      } else if (field in before) {
        this.writeField(field, before[field]);
        delete before[field];
        snapshotChanged = true;
        restoredSize ||= field === 'width' || field === 'height';
      }
    }

    if (restoredSize) {
      // A restored size is the reader's own, so the hires pass coming back with
      // it must not move the size onto the shape family that pass implies: the
      // panel did not choose this size and has no licence to rescale it.
      this.lastHires = controls.hires_fix.value;
    }

    const forced = this.forcedParams();
    if (pinned.length > 0 && forced !== null) {
      // The style's own values come from the same function the request and the
      // panel's advice read, so a control can never disagree with what is sent.
      const styled = styledFormValue(value, {
        prompt: '',
        forcedParams: forced,
      });
      // A size the style pins is the style's shape rather than one entered on
      // the controls, so the hires pass may still carry it between families.
      this.offeringSize = true;
      for (const field of pinned) {
        this.writeField(field, styled[field]);
      }
      this.offeringSize = false;
    }

    if (snapshotChanged) {
      controls.valuesBeforeStyle.setValue(
        Object.keys(before).length > 0 ? before : null,
      );
    }
  }

  /**
   * Put `value` in the control named by `field`, leaving an equal value alone so
   * the sync settles instead of re-writing what is already there.
   */
  private writeField(field: StylePinnedField, value: unknown): void {
    if (value === undefined) {
      return;
    }
    const control: AbstractControl = this.form().controls[field];
    if (!sameFieldValue(control.value, value)) {
      control.setValue(value);
    }
  }

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

  /** The key of the style the form selects, or '' when none is selected. */
  public selectedStyleKey(): string {
    return this.form().controls.styleName.value;
  }

  /**
   * The selected style's name as the reader knows it. A key whose style is not
   * among the loaded records falls back to the key's own value, which is the
   * name itself for a preset and an id for a published style: the panel would
   * rather show what it has than an empty label.
   */
  public selectedStyleName(): string {
    const key = this.selectedStyleKey();
    if (key === '') {
      return '';
    }
    const record = this.styleRecords().get(key);
    return record?.name ?? parseStyleRecordKey(key)?.value ?? key;
  }

  /**
   * The words the applied look puts on every prompt, or null when no look is
   * applied. The prompt card names them to the text model so a draft writes the
   * subject and the scene rather than saying the look twice.
   */
  public appliedStyleWords(): string | null {
    const record = this.styleRecords().get(this.selectedStyleKey());
    if (!record) {
      return null;
    }
    const words = styleTemplateWords(record.prompt);
    return words === '' ? null : words;
  }

  /**
   * Whether the horde applies the selected style rather than the studio. A
   * community style is named on the request and applied there, which replaces
   * the model and the settings this panel is showing.
   */
  public hordeAppliesStyle(): boolean {
    const record = this.styleRecords().get(this.selectedStyleKey());
    return record?.source === 'native';
  }

  /** The key a preset is listed under, so the select can offer it. */
  public curatedKey(name: string): string {
    return styleRecordKey('curated', name);
  }

  /**
   * The looks the loaded catalogue can actually serve, as the keys the select
   * holds. The catalogue arrives over the network, so the row draws nothing
   * until it does, and a look whose style has gone is offered nowhere rather
   * than offered dead. The key is built from the catalogue's own spelling of
   * the name, so a chip and the select's option are never two different keys.
   */
  public readonly offeredLooks = computed<readonly OfferedLook[]>(() => {
    const catalogue = new Map<string, string>();
    for (const group of this.styleGroups()) {
      for (const name of group.names) {
        catalogue.set(name.toLowerCase(), name);
      }
    }
    return STUDIO_LOOKS.flatMap((look) => {
      const name = catalogue.get(look.name.toLowerCase());
      return name
        ? [{ key: this.curatedKey(name), labelKey: look.labelKey }]
        : [];
    });
  });

  /**
   * Apply a look, or take it off again when it is the one already applied. The
   * chip writes the control the select writes, so a look and a style chosen by
   * name are one selection rather than two that can disagree.
   */
  public toggleLook(key: string): void {
    const control = this.form().controls.styleName;
    control.setValue(control.value === key ? '' : key);
    control.markAsDirty();
  }

  /**
   * Whether the selection is a style the preset list does not carry, which is
   * every published style and any preset withdrawn since it was chosen. The
   * select needs an option of its own for one, or it would show as unselected.
   */
  public selectedStyleOffCatalogue(): boolean {
    const key = this.selectedStyleKey();
    if (key === '') {
      return false;
    }
    return !this.styleGroups().some((group) =>
      group.names.some((name) => this.curatedKey(name) === key),
    );
  }

  /** Whether the selected style pins any of `section`'s values. */
  public stylePins(section: StyleLockSection): boolean {
    const forced = this.forcedParams();
    if (!forced) {
      return false;
    }
    if (this.hordeOverrules(section)) {
      return true;
    }
    switch (section) {
      case 'model':
        return forced.model !== undefined;
      case 'dimensions':
        return forced.width !== undefined || forced.height !== undefined;
      case 'sampling':
        return this.styleSamplingText() !== null;
      case 'finishing':
        return this.styleFinishingText() !== null;
    }
  }

  public isSectionDetached(section: StyleLockSection): boolean {
    return this.activeDetachedSections().includes(section);
  }

  /** A pinned section the user has not detached: its controls are frozen. */
  public isSectionLocked(section: StyleLockSection): boolean {
    return this.stylePins(section) && !this.isSectionDetached(section);
  }

  /**
   * Take `section` back from the style for this request. The controls come back
   * holding what the reader had before the style pinned them, which is what
   * asking for their own values means; the sync writes them as the section
   * leaves the style's hands.
   */
  public detachSection(section: StyleLockSection): void {
    this.setDetachedSections([...this.detachedSections(), section]);
  }

  /** Hand `section` back to the style, restoring the values it pins. */
  public reattachSection(section: StyleLockSection): void {
    this.setDetachedSections(
      this.detachedSections().filter((entry) => entry !== section),
    );
  }

  private setDetachedSections(sections: readonly StyleLockSection[]): void {
    const control = this.form().controls.styleDetach;
    control.setValue({
      style: this.selectedStyleKey(),
      sections: [...new Set(sections)],
    });
    control.markAsDirty();
    this.syncDetachedSections();
    // The lock sync runs off the detached sections as an effect, but the values
    // have to be in the controls by the time the click that moved them returns.
    this.syncPinnedFields();
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
      control.value.style !== this.selectedStyleKey()
    ) {
      control.setValue({ style: '', sections: [] }, { emitEvent: false });
    }
    this.syncDetachedSections();
  }

  // --- Style "set by style" hints -----------------------------------------

  /**
   * The concrete model a selected style forces, so the hint can name it rather
   * than only flagging that a model is set.
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

  /**
   * A compact summary of everything a style pins past the model, the size and
   * the sampling knobs, or null when it pins none of it.
   */
  public styleFinishingText(): string | null {
    const forced = this.forcedParams();
    if (!forced) {
      return null;
    }
    const parts: string[] = [];
    if (forced.post_processing !== undefined) {
      parts.push(
        forced.post_processing.length > 0
          ? forced.post_processing.join(' + ')
          : 'no post-processing',
      );
    }
    if (forced.facefixer_strength !== undefined) {
      parts.push(`face fixer ${forced.facefixer_strength}`);
    }
    if (forced.tiling !== undefined) {
      parts.push(forced.tiling ? 'tiling' : 'no tiling');
    }
    if (forced.transparent !== undefined) {
      parts.push(forced.transparent ? 'transparent' : 'not transparent');
    }
    if (forced.denoising_strength !== undefined) {
      parts.push(`denoise ${forced.denoising_strength}`);
    }
    if (forced.workflow !== undefined) {
      parts.push(forced.workflow);
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
    if (this.form().controls.prompt.invalid || this.modelsUnavailable()) {
      return;
    }
    this.create.emit();
  }

  public onPreview(): void {
    this.preview.emit();
  }

  // --- Options list --------------------------------------------------------

  public toggleOptions(): void {
    this.optionsOpen.update((open) => !open);
  }

  public closeOptions(): void {
    this.optionsOpen.set(false);
  }

  /**
   * Dismiss the list and put focus back where it was opened from. Every route
   * out of the list that leaves the reader on this page uses it, so a keyboard
   * never lands on the document after the list stops existing.
   */
  public closeOptionsAndFocus(): void {
    this.closeOptions();
    this.optionsBtn()?.nativeElement.focus();
  }

  /** The one-off version of "review before sending", from the same list. */
  public previewFromOptions(): void {
    this.closeOptions();
    this.onPreview();
  }

  /** Hand these settings to somebody else as a link they can open. */
  public copyLinkFromOptions(): void {
    this.closeOptionsAndFocus();
    this.copyLink.emit();
  }

  /** Take settings somebody else handed over, as a link or as a request body. */
  public pasteFromOptions(): void {
    this.closeOptionsAndFocus();
    this.pasteSettings.emit();
  }

  /**
   * Escape or the floating button can end full screen away from the control
   * that opened it. Return to the phone's standing button where it exists, or
   * to the Options trigger that owns the wide presentation.
   */
  private readonly fullscreenFocus = restoreFocusOnFullscreenExit(
    () =>
      this.fullscreenBtn()?.nativeElement ?? this.optionsBtn()?.nativeElement,
  );

  /**
   * The phone's standing button is itself a way out of the whole screen, so the
   * shell's floating one stands down while this one can be seen. The header
   * scrolls with the form, so the floating one comes back once it has gone.
   */
  private readonly fullscreenExitWatch = afterRenderEffect((onCleanup) => {
    const button = this.fullscreenBtn()?.nativeElement;
    if (!button || typeof IntersectionObserver === 'undefined') {
      this.fullscreen.setExitInView(false);
      return;
    }
    const observer = new IntersectionObserver((records) => {
      const record = records.at(-1);
      if (record) this.fullscreen.setExitInView(record.isIntersecting);
    });
    observer.observe(button);
    onCleanup(() => {
      observer.disconnect();
      this.fullscreen.setExitInView(false);
    });
  });

  public toggleFullscreen(fromOptions = true): void {
    void this.fullscreen.toggle();
    if (fromOptions) {
      this.closeOptionsAndFocus();
    }
  }

  public fullscreenLabelKey(): string {
    return this.fullscreen.filling()
      ? 'generate.shell.fullscreen_exit'
      : 'generate.shell.fullscreen';
  }

  public toggleReviewBeforeSend(): void {
    this.reviewBeforeSendChange.emit(!this.reviewBeforeSend());
  }

  public toggleConfirmResultActions(): void {
    this.confirmResultActionsChange.emit(!this.confirmResultActions());
  }

  public toggleConfirmPromptApply(): void {
    this.setConfirmPromptApply(!this.confirmPromptApply());
  }

  /** Remember whether a prompt from elsewhere asks before replacing the box. */
  public setConfirmPromptApply(on: boolean): void {
    this.confirmPromptApply.set(on);
    this.db.store(PROMPT_APPLY_CONFIRM_KEY, on);
  }

  public undoResultActionFromOptions(): void {
    this.closeOptionsAndFocus();
    this.undoResultAction.emit();
  }

  public resultActionKey(action: ResultControlAction): string {
    switch (action) {
      case 'variation':
        return 'generate.results.action_variation';
      case 'source':
        return 'generate.results.action_source';
      case 'settings':
        return 'generate.results.action_settings';
    }
  }

  public togglePinGenerate(): void {
    this.pinGenerateChange.emit(!this.pinGenerate());
  }

  /** Whether the footer's submit row is the docked bar rather than a row. */
  public generatePinned(): boolean {
    return this.pinnable() && this.pinGenerate();
  }

  /** Take focus back to Generate once the review dialog has closed. */
  public focusGenerateButton(): void {
    this.generateBtn()?.nativeElement.focus();
  }

  // --- Presets menu --------------------------------------------------------

  public togglePresets(): void {
    this.presetsOpen.update((open) => !open);
  }

  public closePresets(): void {
    this.presetsOpen.set(false);
  }

  /** Dismiss the popovers when a press lands outside them. */
  public onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target as Node;
    if (this.presetsOpen()) {
      const anchor = this.presetsRef()?.nativeElement;
      if (anchor && !anchor.contains(target)) {
        this.closePresets();
      }
    }
    if (this.resetConfirmOpen()) {
      const anchor = this.resetRef()?.nativeElement;
      if (anchor && !anchor.contains(target)) {
        this.closeResetConfirm();
      }
    }
    if (this.lintOpen()) {
      const anchor = this.lintRef()?.nativeElement;
      if (anchor && !anchor.contains(target)) {
        this.closeLint();
      }
    }
    if (this.kudosOpen()) {
      const anchor = this.kudosRef()?.nativeElement;
      if (anchor && !anchor.contains(target)) {
        this.closeKudos();
      }
    }
    if (this.fitOpen()) {
      const anchor = this.fitRef()?.nativeElement;
      if (anchor && !anchor.contains(target)) {
        this.closeFit();
      }
    }
    if (this.workerPickOpen()) {
      const anchor = this.workerPickRef()?.nativeElement;
      if (anchor && !anchor.contains(target)) {
        this.closeWorkerPick();
      }
    }
    if (this.balanceOpen()) {
      const anchor = this.balanceRef()?.nativeElement;
      if (anchor && !anchor.contains(target)) {
        this.closeBalance();
      }
    }
    if (this.ledgerOpen()) {
      const anchor = this.ledgerRef()?.nativeElement;
      if (anchor && !anchor.contains(target)) {
        this.closeLedger();
      }
    }
    // Only the popover is dismissed by a press beside it. The sheet is not a
    // descendant of the trigger, and a sheet the reader is reading through is
    // not something to take away on the first tap inside it.
    if (this.optionsOpen() && !this.narrow()) {
      const anchor = this.optionsRef()?.nativeElement;
      if (anchor && !anchor.contains(target)) {
        this.closeOptions();
      }
    }
  }

  public onDocumentEscape(): void {
    if (this.presetsOpen()) {
      this.closePresets();
    }
    if (this.resetConfirmOpen()) {
      this.closeResetConfirm();
      this.resetBtn()?.nativeElement.focus();
    }
    if (this.lintOpen()) {
      this.closeLint();
      this.lintBtn()?.nativeElement.focus();
    }
    if (this.kudosOpen()) {
      this.closeKudos();
      this.kudosBtn()?.nativeElement.focus();
    }
    if (this.fitOpen()) {
      this.closeFit();
      this.fitBtn()?.nativeElement.focus();
    }
    if (this.workerPickOpen()) {
      this.closeWorkerPick();
      this.workerPickBtn()?.nativeElement.focus();
    }
    if (this.balanceOpen()) {
      this.closeBalance();
      this.balanceBtn()?.nativeElement.focus();
    }
    if (this.ledgerOpen()) {
      this.closeLedger();
      this.ledgerBtn()?.nativeElement.focus();
    }
    // The sheet unwinds itself a stop at a time and tells us when it is done,
    // so escape is only ours to answer while the list is a popover.
    if (this.optionsOpen() && !this.narrow()) {
      this.closeOptionsAndFocus();
    }
  }

  // --- Prompts library -----------------------------------------------------

  /** The clock press asks what was sent before, so the library opens there. */
  public openPromptLibrary(): void {
    this.promptLibraryOpen.set(true);
  }

  /** A draft deleted in the library may have been the last one. */
  public closePromptLibrary(): void {
    this.promptLibraryOpen.set(false);
    void this.countDrafts();
  }

  /** Reuse a prompt from the library, asking first where it would replace one. */
  public usePromptFromLibrary(use: PromptLibraryUse): void {
    this.closePromptLibrary();
    this.applyPrompt(use, use.source);
  }

  private async countDrafts(): Promise<void> {
    try {
      this.storedDraftCount.set((await this.draftPrompts.listAll()).length);
    } catch {
      // A store that will not open leaves the clock press to the sent prompts.
      this.storedDraftCount.set(0);
    }
  }

  /**
   * Put a prompt chosen elsewhere in the box: a draft, a prompt sent before, or
   * words handed over from another page. An empty box, one already holding the
   * same prompt, or incoming words that keep what the reader wrote and add to
   * it take effect at once; anything that would lose the reader's words is
   * shown beside the incoming prompt first, unless they have asked not to be
   * asked. Either way the change can be undone from the toast that follows it.
   */
  public applyPrompt(
    incoming: PromptApplication,
    source: PromptApplySource,
  ): void {
    const current = this.form().controls.prompt.value.trim();
    if (
      !this.confirmPromptApply() ||
      current === '' ||
      incoming.prompt.trim().startsWith(current)
    ) {
      this.writeAppliedPrompt(incoming, source);
      return;
    }
    this.pendingPromptApply.set({ incoming, source });
  }

  public confirmPendingPrompt(event: { dontAskAgain: boolean }): void {
    const pending = this.pendingPromptApply();
    this.pendingPromptApply.set(null);
    if (event.dontAskAgain) {
      this.setConfirmPromptApply(false);
    }
    if (pending) {
      this.writeAppliedPrompt(pending.incoming, pending.source);
    }
  }

  public cancelPendingPrompt(): void {
    this.pendingPromptApply.set(null);
  }

  /**
   * A sent prompt comes back with the negative it was sent with, empty or not,
   * so an old negative is never left paired with a new positive. Any other
   * negative joins what the box holds, because that was written on purpose.
   */
  private writeAppliedPrompt(
    incoming: PromptApplication,
    source: PromptApplySource,
  ): void {
    const controls = this.form().controls;
    const before = {
      prompt: controls.prompt.value,
      negative: controls.negativePrompt.value,
    };
    controls.prompt.setValue(incoming.prompt);
    controls.prompt.markAsDirty();
    if (incoming.negative !== null) {
      if (source === 'sent') {
        controls.negativePrompt.setValue(incoming.negative);
        controls.negativePrompt.markAsDirty();
      } else {
        this.addNegative(incoming.negative);
      }
    }
    this.focusPrompt();
    if (
      controls.prompt.value === before.prompt &&
      controls.negativePrompt.value === before.negative
    ) {
      return;
    }
    this.toast.success('prompt_apply.replaced', {
      transloco: true,
      autoDismissMs: PROMPT_APPLY_UNDO_MS,
      action: {
        label: 'prompt_apply.undo',
        run: () => {
          controls.prompt.setValue(before.prompt);
          controls.negativePrompt.setValue(before.negative);
          this.focusPrompt();
        },
      },
    });
  }

  /**
   * Write the prompt boxes and put the cursor in the positive one. Also the
   * entry point for the results pane's starter prompts, which the parent
   * forwards here so a chip lands the user in the box they will now edit.
   */
  public fillPrompt(
    prompt: string,
    negativePrompt: string | null = null,
  ): void {
    const controls = this.form().controls;
    controls.prompt.setValue(prompt);
    controls.prompt.markAsDirty();
    if (negativePrompt !== null) {
      controls.negativePrompt.setValue(negativePrompt);
      controls.negativePrompt.markAsDirty();
    }
    this.focusPrompt();
  }

  /**
   * Add a line to the negative prompt. An empty box takes it whole; one with
   * words in it keeps them and the line joins the end, because what is already
   * there was written on purpose.
   */
  public addNegative(negative: string): void {
    const text = negative.trim();
    if (!text) return;
    const control = this.form().controls.negativePrompt;
    const current = control.value.trim();
    if (!negativeHasPhrase(current, text)) {
      control.setValue(current ? `${current}, ${text}` : text);
      control.markAsDirty();
      control.markAsTouched();
    }
    this.goToField('prompt');
  }

  /** Open the full-screen editor on one of the two prompt fields. */
  public openPromptEditor(field: PromptEditorField): void {
    this.promptEditor.set(field);
  }

  public focusPrompt(): void {
    const input = this.promptInput()?.nativeElement;
    if (!input) {
      return;
    }
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
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

  /** Load a saved/recent preset: hand it to the parent for review + apply. */
  public loadPreset(value: GenerateFormValue): void {
    this.applySettings.emit(value);
    this.closePresets();
  }

  /** Return focus to the presets toggle once the parent's load panel closes. */
  public focusPresetsButton(): void {
    this.presetsBtn()?.nativeElement.focus();
  }

  public deletePreset(id: string, event: Event): void {
    event.stopPropagation();
    this.presetsSvc.deletePreset(id);
  }

  // --- Reset all settings --------------------------------------------------

  /**
   * Ask before clearing. Reset takes back a session's worth of choices at once,
   * which is more than an undo in a toast that may be missed can answer for, so
   * the button offers the question and the answer sits under it.
   */
  public toggleResetConfirm(): void {
    this.resetConfirmOpen.update((open) => !open);
  }

  public closeResetConfirm(): void {
    this.resetConfirmOpen.set(false);
  }

  /** Dismiss the confirm and leave the settings alone. */
  public keepSettings(): void {
    this.closeResetConfirm();
    this.resetBtn()?.nativeElement.focus();
  }

  /**
   * Put every generation setting back to its default, keeping the prompts and
   * whatever source image is attached (see {@link resetFormValue}). The toast's
   * undo stands after the fact for a reader who answered the confirm too fast.
   */
  public resetSettings(): void {
    this.closeResetConfirm();
    const previous = this.form().getRawValue();
    this.writeSettings(resetFormValue(previous));
    this.toast.success('generate.form.reset_done', {
      transloco: true,
      action: {
        label: 'generate.form.reset_undo',
        run: () => this.writeSettings(previous),
      },
    });
  }

  private writeSettings(value: GenerateFormValue): void {
    this.form().setValue(value);
    this.form().markAsDirty();
  }

  // --- Request warnings ----------------------------------------------------

  /**
   * What to say under one control about the last submit the horde refused, or
   * null when it named another control. The studio's own line where it has one
   * for the code that came back, and the horde's sentence where it does not.
   */
  public rejectionFor(anchor: FieldAnchorId): string | null {
    const rejection = this.fieldRejection();
    if (rejection?.anchor !== anchor) {
      return null;
    }
    return rejection.key
      ? this.transloco.translate(rejection.key)
      : rejection.message;
  }

  /** The id the refused control is described by, so the two are announced together. */
  public rejectionId(anchor: FieldAnchorId): string {
    return `generate-rejection-${anchor}`;
  }

  /**
   * The ids describing a control: whatever it already names, plus the horde's
   * refusal where one is standing at it. Null rather than an empty string so the
   * attribute is absent when there is nothing to describe.
   */
  public describedBy(
    anchor: FieldAnchorId,
    ...ids: (string | null)[]
  ): string | null {
    const named = ids.filter((id): id is string => id !== null && id !== '');
    if (this.rejectionFor(anchor) !== null) {
      named.push(this.rejectionId(anchor));
    }
    return named.length > 0 ? named.join(' ') : null;
  }

  /**
   * Bring the control a warning or a refusal is about onto the screen and ring
   * it. A control the panel is not currently drawing is one its group is folded
   * over, or one the sampling knobs are folded over, so each is opened and the
   * pointing waits for the control to exist.
   */
  public goToField(anchor: FieldAnchorId): void {
    this.closeLint();
    if (KNOB_ANCHORS.includes(anchor)) {
      this.advancedSamplingOpen.set(true);
    }
    this.openGroupForAnchor(anchor);
    const element = this.anchors.element(anchor);
    if (element) {
      this.pointAt(element);
      return;
    }
    afterNextRender(
      () => {
        const revealed = this.anchors.element(anchor);
        if (revealed) {
          this.pointAt(revealed);
        }
      },
      { injector: this.injector },
    );
  }

  /**
   * Bring one control onto the screen and hold it there. A group that has just
   * been unfolded grows the page, and the browser's own scroll anchoring moves
   * the page back under the reader once that growth lands, which undoes a
   * scroll asked for before it. So the pointing checks its work once the growth
   * has had time to arrive, and asks again where the control was carried off.
   */
  private pointAt(element: HTMLElement): void {
    this.anchors.flash(element);
    let frames = SETTLE_FRAMES;
    const settle = (): void => {
      if (frames-- > 0) {
        requestAnimationFrame(settle);
        return;
      }
      const rect = element.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        this.anchors.flash(element);
      }
    };
    requestAnimationFrame(settle);
  }

  // --- Model recommendations, applied --------------------------------------

  /** What the selected model recommends that the form is not already doing. */
  public suggested(): SuggestedSettings {
    const controls = this.form().controls;
    return suggestedSettings(
      this.modelRequirements(),
      {
        samplers: [...this.recommendedSamplers(), ...this.advancedSamplers()],
        schedulers: this.schedulerOptions(),
      },
      {
        sampler_name: controls.sampler_name.value,
        scheduler: controls.scheduler.value,
        steps: controls.steps.value,
        cfg_scale: controls.cfg_scale.value,
        clip_skip: controls.clip_skip.value,
      },
    );
  }

  /** Whether the model has anything left to recommend. */
  public hasSuggested(): boolean {
    return suggestedSettingsCount(this.suggested()) > 0;
  }

  /**
   * Take the model's recommendations in one gesture. Announced by count rather
   * than by listing the fields: the settings are on the screen the moment they
   * change, and the message is there to say the press did something.
   */
  public applySuggested(): void {
    const changes = this.suggested();
    const count = suggestedSettingsCount(changes);
    if (count === 0) {
      return;
    }
    this.form().patchValue(changes);
    this.form().markAsDirty();
    this.toast.success('generate.form.use_suggested_done', {
      transloco: true,
      messageParams: { count },
    });
  }

  public toggleLint(): void {
    this.lintOpen.update((open) => !open);
  }

  public closeLint(): void {
    this.lintOpen.set(false);
  }

  public toggleFit(): void {
    this.fitOpen.update((open) => !open);
  }

  public closeFit(): void {
    this.fitOpen.set(false);
  }

  public toggleBalance(): void {
    this.balanceOpen.update((open) => !open);
  }

  public closeBalance(): void {
    this.balanceOpen.set(false);
  }

  /** What the balance chip says in full, shared by its label and its popover. */
  public balanceMessage(afford: KudosAffordability): {
    key: string;
    params: Record<string, string | number>;
  } {
    const balance = this.formatNumber(afford.balance);
    if (afford.short) {
      return { key: 'generate.form.balance_short', params: { balance } };
    }
    if (afford.more === 0) {
      return { key: 'generate.form.balance_last', params: { balance } };
    }
    return {
      key:
        afford.more === 1
          ? 'generate.form.balance_more_one'
          : 'generate.form.balance_more_other',
      params: { balance, count: this.formatNumber(afford.more) },
    };
  }

  /** A count as the reader's own locale groups it, matching the `formatNumber` pipe. */
  private formatNumber(value: number): string {
    return new Intl.NumberFormat(this.transloco.getActiveLang()).format(value);
  }

  /** The estimate as it is spoken: whole kudos, never a decimal tail. */
  public kudosShown(): number {
    return Math.round(this.kudos() ?? 0);
  }

  /** The breakdown's heading, which names the number when there is one. */
  public kudosWhyKey(): string {
    return this.kudos() === null
      ? 'generate.form.kudos_why_unknown'
      : 'generate.form.kudos_why';
  }

  public toggleKudos(): void {
    this.kudosOpen.update((open) => !open);
  }

  public closeKudos(): void {
    this.kudosOpen.set(false);
  }

  /** The warnings belonging to one card, for its own inline lines. */
  public warningsFor(section: SectionId): readonly RequestWarning[] {
    return warningsInSection(this.lintWarnings(), section);
  }

  /**
   * The warnings about the LoRA card's own controls. Read by anchor rather than
   * by section: the model area also owns the model select, and a warning about
   * that belongs at the select, not among the add-ons.
   */
  public loraWarnings(): readonly RequestWarning[] {
    return warningsAtAnchor(this.lintWarnings(), 'loras');
  }

  /**
   * As {@link loraWarnings}, for the transparent-background toggle. Read by
   * anchor rather than by section: the QR card shares the `workflows` section
   * and already renders its own baseline warning inline.
   */
  public transparentWarnings(): readonly RequestWarning[] {
    return warningsAtAnchor(this.lintWarnings(), 'transparent');
  }

  /** As {@link transparentWarnings}, for the QR-code text field. */
  public qrWarnings(): readonly RequestWarning[] {
    return warningsAtAnchor(this.lintWarnings(), 'qr');
  }

  /**
   * As {@link transparentWarnings}, for the worker list. Read by anchor: the
   * horde card also owns the delivery webhook and the worker preferences.
   */
  public workerWarnings(): readonly RequestWarning[] {
    return warningsAtAnchor(this.lintWarnings(), 'workers');
  }

  /**
   * Whether a named compatibility rule is currently firing. Cards that already
   * carry the rule's sentence as a standing note beside the control it disables
   * read this so the reader is never shown the same line twice.
   */
  public hasWarning(id: FeatureCompatRuleId): boolean {
    return this.lintWarnings().some((warning) => warning.id === id);
  }

  /**
   * Step the panel one width wider, wrapping `full` back to `normal`. Backs the
   * single expand/collapse toggle in the header.
   */
  public cyclePanel(): void {
    this.panelSizeChange.emit(cyclePanelSize(this.panelSize()));
  }
}
