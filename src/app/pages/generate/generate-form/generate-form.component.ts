import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
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
import { DOCS_IMAGE_GUIDE } from '../../../content/docs-links';
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
import { FullscreenService } from '../../../services/fullscreen.service';
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
import { ToastService } from '../../../services/toast.service';
import { DatabaseService } from '../../../services/database.service';
import { UnitConversionService } from '../../../services/unit-conversion.service';
import { ActiveModel } from '../../../types/active-model';
import { ImagePostProcessor } from '../../../types/style';
import { StyleForcedParams } from '../../../services/horde-styles.service';
import { CivitaiPickerComponent } from '../../../components/civitai-picker/civitai-picker.component';
import { StyleBrowserComponent } from '../style-browser/style-browser.component';
import { GsGroupComponent } from './gs-group/gs-group.component';
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
  PanelSize,
  PromptHistoryEntry,
  QR_MODULE_DRAWERS,
  RequirementHint,
  SAMPLERS,
  STRIP_BACKGROUND,
  StyleLockSection,
  StylePickerGroup,
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
  pickableWorkers,
  type ModelWorkerFacts,
  type WorkerFeasibility,
  type WorkerPickOption,
} from '../../../services/worker-pool.service';
import type { HordeWorker } from '../../../types/horde-worker';
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

/** Which of the two prompt boxes the full-screen editor is holding. */
export type PromptEditorField = 'prompt' | 'negative';

/**
 * The settings groups the panel folds away behind a line of their own values.
 * The cards a request cannot be described without (prompt, model, the source
 * strip) are not groups: they are always open. Dimensions is a group even
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

/** A form field a style can freeze, named as the form's control names it. */
export type LockedField =
  | 'model'
  | 'width'
  | 'height'
  | 'steps'
  | 'cfg_scale'
  | 'sampler_name'
  | 'clip_skip'
  | 'scheduler'
  | 'hires_fix';

/** The section each freezable field is handed back with. */
const LOCKED_FIELD_SECTION: Readonly<Record<LockedField, StyleLockSection>> = {
  model: 'model',
  width: 'dimensions',
  height: 'dimensions',
  steps: 'sampling',
  cfg_scale: 'sampling',
  sampler_name: 'sampling',
  clip_skip: 'sampling',
  scheduler: 'sampling',
  hires_fix: 'sampling',
};

const LOCKED_FIELDS = Object.keys(
  LOCKED_FIELD_SECTION,
) as readonly LockedField[];

/** Whether `forced` names a value for `field`. */
function stylePinsField(
  forced: StyleForcedParams,
  field: LockedField,
): boolean {
  // A style names a schedule only through its karras flag, and the request
  // keeps the reader's schedule otherwise, so the control locks only when the
  // request really carries the style's value.
  if (field === 'scheduler') {
    return forced.karras !== undefined;
  }
  return forced[field] !== undefined;
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
  'styleDetach' | 'modelBeforeStyle'
>;

/** Where a ledger row is listed: a collapsible group, or the compose cards. */
type LedgerSection = GroupId | 'compose';

/** One changed setting, as the ledger lists it. */
export interface LedgerRow {
  field: LedgerField;
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
    (GROUP_IDS.find((group) => GROUP_FIELDS[group].includes(field)) ??
      'compose') as LedgerSection,
  ]),
);

/** The heading each ledger section is listed under. */
const LEDGER_SECTION_TITLE_KEY: Readonly<Record<LedgerSection, string>> = {
  compose: 'generate.form.ledger_compose',
  ...GROUP_TITLE_KEY,
};

/** Where the reader's open groups are remembered between visits. */
const GROUPS_OPEN_KEY = 'aihorde.generate.groups_open';

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
  /** The walkthrough this panel is the subject of. */
  public readonly guideLink = DOCS_IMAGE_GUIDE;

  private readonly destroyRef = inject(DestroyRef);
  public readonly presetsSvc = inject(GeneratePresetsService);
  /* Below 1024px the tool switcher is a bottom bar and carries nothing but the
     tools, so this header is the studio's top line and the place the glossary
     is reached from. The shell's copy takes over from 1024px up. */
  public readonly glossary = inject(GlossaryService);
  /** Backs the Options list's full-screen row; the header carries no toggle. */
  public readonly fullscreen = inject(FullscreenService);
  private readonly toast = inject(ToastService);
  private readonly anchors = inject(TutorialAnchorService);
  private readonly injector = inject(Injector);
  private readonly transloco = inject(TranslocoService);
  private readonly db = inject(DatabaseService);
  private readonly units = inject(UnitConversionService);

  public readonly form = input.required<GenerateFormGroup>();
  public readonly models = input<ActiveModel[]>([]);
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
  /** Current control-panel width; drives the reflow and the expand control. */
  public readonly panelSize = input<PanelSize>('normal');
  /** Whether the expand/collapse control is offered (off when embedded). */
  public readonly expandable = input(true);
  /**
   * Whether the studio is stacked rather than side by side. The parent owns the
   * one media-query listener, so the panel and the shell cannot disagree about
   * which width they are drawing for. It decides how the Options list is
   * presented and whether the header has room for the walkthrough's word.
   */
  public readonly narrow = input(false);
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

  /**
   * Whether keeping Generate on screen is on offer at all. False where the
   * panel is a guest on another page: the bar belongs to the studio's own
   * screen, which is the only place it has a bottom to sit above.
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
  public readonly panelSizeChange = output<PanelSize>();
  public readonly reviewBeforeSendChange = output<boolean>();
  public readonly pinGenerateChange = output<boolean>();
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

  /** Whether the prompt-history quick-pick popover is open. */
  public readonly historyOpen = signal(false);
  /**
   * Which history row has its full text pinned open, by position. Hover and
   * focus reveal the same block in CSS; this is the explicit toggle, which is
   * the only route available on touch.
   */
  public readonly historyDetail = signal<number | null>(null);
  /** The history popover's anchor, used to detect click-away dismissals. */
  private readonly historyRef =
    viewChild<ElementRef<HTMLElement>>('historyContainer');
  /** The history toggle, so dismissing with a key hands focus back to it. */
  private readonly historyBtn =
    viewChild<ElementRef<HTMLButtonElement>>('historyBtn');
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
  public readonly customSizeOpen = signal(false);
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

  /** Take the weight off and let the worker render at its own default. */
  public clearControlStrength(): void {
    const control = this.form().controls.control_strength;
    control.setValue(null);
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
    ];
    return grads[index % grads.length];
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
   * or off moves a size that is one of the offered shapes onto the same shape
   * in the family now in force, because it was the panel that decided what that
   * shape's size was. A model change moves a still-pristine square onto the new
   * baseline's native square. A size typed on the sliders is the reader's own
   * and is left alone in both cases.
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
        if (!this.snappingSize) {
          this.sizeTouched.set(true);
        }
      });
  }

  // --- Settings groups -----------------------------------------------------

  private readonly groupsOpen = signal<Partial<Record<GroupId, boolean>>>({});

  /**
   * The source card, projected into the panel rather than held by it. It keeps
   * its own fold, because it is open before there is anything to fold away, so
   * folding everything has to reach it by hand rather than through the store
   * the groups share.
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
    return source !== undefined && source.canFold() && source.open();
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
    return GROUP_FIELDS[group].some(
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
    for (const field of changedFields(value) as LedgerField[]) {
      const section = FIELD_GROUP.get(field) ?? 'compose';
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
    this.form().patchValue({ width, height });
    this.form().controls.width.markAsDirty();
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
    this.form().patchValue({
      width: controls.height.value,
      height: controls.width.value,
    });
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

  /** The one line under the step count. */
  public stepsAdvisory(): RequirementHint | null {
    const controls = this.form().controls;
    return stepsAdvisory(
      this.modelRequirements(),
      this.samplerContract(),
      controls.sampler_name.value,
      controls.steps.value,
    );
  }

  /** The one line under the guidance scale. */
  public cfgAdvisory(): RequirementHint | null {
    const controls = this.form().controls;
    return cfgAdvisory(
      this.modelRequirements(),
      this.samplerContract(),
      controls.sampler_name.value,
      controls.cfg_scale.value,
    );
  }

  /** The one line under the CLIP skip slider. */
  public clipSkipAdvisory(): RequirementHint | null {
    return clipSkipAdvisory(
      this.modelRequirements(),
      this.form().controls.clip_skip.value,
    );
  }

  public samplerHint(): RequirementHint | null {
    return samplerRequirementHint(
      this.modelRequirements(),
      this.form().controls.sampler_name.value,
    );
  }

  /** The one line under the schedule select. */
  public scheduleAdvisory(): RequirementHint | null {
    return scheduleAdvisory(
      this.modelRequirements(),
      this.samplerContract(),
      this.form().controls.scheduler.value,
    );
  }

  /** Whether the model names `sampler` among the ones it was tuned for. */
  public isSuggestedSampler(sampler: string): boolean {
    return suggestedSamplers(this.modelRequirements()).includes(sampler);
  }

  /** The one line under the size controls. */
  public sizeAdvisory(): RequirementHint | null {
    const controls = this.form().controls;
    return sizeAdvisory(
      this.modelBaseline(),
      controls.width.value,
      controls.height.value,
      controls.hires_fix.value,
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
    return hiresUnneededHint(
      this.modelBaseline(),
      controls.width.value,
      controls.height.value,
      controls.hires_fix.value,
    );
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
    this.syncPinnedModel();
  });

  /**
   * Whether the style freezes `field`. This is the answer the panel paints
   * with: the section-wide answer is too coarse, and a style pinning only the
   * steps would have every other sampling knob drawn as frozen while it is
   * still editable.
   */
  public isFieldLocked(field: LockedField): boolean {
    const forced = this.forcedParams();
    return (
      forced !== null &&
      stylePinsField(forced, field) &&
      !this.detachedSections().includes(LOCKED_FIELD_SECTION[field])
    );
  }

  /**
   * Show the model a style pins in the model field itself. The request already
   * runs on that model, so a field left showing the reader's own pick names a
   * model nothing will use.
   */
  private syncPinnedModel(): void {
    const control = this.form().controls.model;
    // The pick a style stands on lives in the form value rather than in a field
    // here, so it comes back with the rest of the form after a reload and the
    // style can still be cleared off it.
    const before = this.form().controls.modelBeforeStyle;
    const pinned = this.isFieldLocked('model')
      ? (this.forcedParams()?.model ?? null)
      : null;
    if (pinned !== null) {
      if (before.value === null) {
        before.setValue(control.value);
      }
      if (control.value !== pinned) {
        control.setValue(pinned);
      }
      return;
    }
    if (before.value !== null) {
      control.setValue(before.value);
      before.setValue(null);
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
      // The reader carries on from the style's model, so the pick they had
      // before it is no longer waiting to come back.
      controls.modelBeforeStyle.setValue(null);
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
      set(
        controls.scheduler,
        forced.karras === undefined
          ? undefined
          : forced.karras
            ? 'karras'
            : 'normal',
      );
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

  public toggleFullscreen(): void {
    void this.fullscreen.toggle();
    this.closeOptionsAndFocus();
  }

  public fullscreenLabelKey(): string {
    return this.fullscreen.active()
      ? 'generate.shell.fullscreen_exit'
      : 'generate.shell.fullscreen';
  }

  public toggleReviewBeforeSend(): void {
    this.reviewBeforeSendChange.emit(!this.reviewBeforeSend());
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

  /** Dismiss the presets/history popovers when a press lands outside them. */
  public onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target as Node;
    if (this.presetsOpen()) {
      const anchor = this.presetsRef()?.nativeElement;
      if (anchor && !anchor.contains(target)) {
        this.closePresets();
      }
    }
    if (this.historyOpen()) {
      const anchor = this.historyRef()?.nativeElement;
      if (anchor && !anchor.contains(target)) {
        this.closeHistory();
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
    if (!this.historyOpen()) {
      return;
    }
    // An expanded row is dismissed first: escape backs out one layer at a time
    // rather than taking the whole popover with it.
    if (this.historyDetail() !== null) {
      this.historyDetail.set(null);
      return;
    }
    this.closeHistory();
    this.historyBtn()?.nativeElement.focus();
  }

  // --- Prompt history quick-pick -------------------------------------------

  public toggleHistory(): void {
    this.historyOpen.update((open) => !open);
    if (!this.historyOpen()) {
      this.historyDetail.set(null);
    }
  }

  public closeHistory(): void {
    this.historyOpen.set(false);
    this.historyDetail.set(null);
  }

  /** Pin or unpin one row's full prompt; only one is ever open. */
  public toggleHistoryDetail(index: number): void {
    this.historyDetail.update((open) => (open === index ? null : index));
  }

  /**
   * Reuse a past prompt: both halves are written, so picking an entry that had
   * no negative prompt clears whatever negative the form holds rather than
   * silently pairing an old negative with a new positive.
   */
  public pickHistory(entry: PromptHistoryEntry): void {
    this.closeHistory();
    this.fillPrompt(entry.prompt, entry.negativePrompt);
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

  /** The horde's refusal for one control, or null when it named another. */
  public rejectionFor(anchor: FieldAnchorId): string | null {
    const rejection = this.fieldRejection();
    return rejection?.anchor === anchor ? rejection.message : null;
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
      this.anchors.flash(element);
      return;
    }
    afterNextRender(
      () => {
        const revealed = this.anchors.element(anchor);
        if (revealed) {
          this.anchors.flash(revealed);
        }
      },
      { injector: this.injector },
    );
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
