import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  AbstractControl,
  FormControl,
  ReactiveFormsModule,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { merge } from 'rxjs';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { GsHelpComponent } from '../../../components/gs-help/gs-help.component';
import { TutorialAnchorDirective } from '../../../directives/tutorial-anchor.directive';
import { TutorialAnchorService } from '../../../services/tutorial-anchor.service';
import { CivitaiSelectionComponent } from '../../../components/civitai-selection/civitai-selection.component';
import { RememberedHeightDirective } from '../../../directives/remembered-height.directive';
import { GsPromptEditorComponent } from '../../../components/gs-prompt-editor/gs-prompt-editor.component';
import { ModelAutocompleteComponent } from '../../../components/model-autocomplete/model-autocomplete.component';
import { GeneratePresetsService } from '../../../services/generate-presets.service';
import { GlossaryService } from '../../../services/glossary.service';
import { ToastService } from '../../../services/toast.service';
import { DatabaseService } from '../../../services/database.service';
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
  GenerateMode,
  DEFAULT_GENERATE_FORM_VALUE,
  CFG_SLIDER_MAX,
  CFG_SLIDER_MIN,
  CFG_STEP,
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
  KudosBreakdownLine,
  ModelSizeBase,
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
  normalizeWorkers,
  rangeFillPercent,
  resetFormValue,
  samplerRequirementHint,
  scheduleAdvisory,
  sd15HiresHint,
  sizeAdvisory,
  sizeBaseFor,
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
 * The cards a request cannot be described without (prompt, model, size, the
 * source strip) are not groups: they are always open.
 */
export type GroupId =
  | 'sampling'
  | 'loras'
  | 'post'
  | 'output'
  | 'horde'
  | 'workflows';

export const GROUP_IDS: readonly GroupId[] = [
  'sampling',
  'loras',
  'post',
  'output',
  'horde',
  'workflows',
];

/**
 * Which group a control lives in, so that pointing at a control opens the group
 * holding it first. A control the panel is not currently drawing cannot be
 * scrolled to or rung, and an anchor missing from here would fail silently.
 */
const GROUP_BY_ANCHOR: Readonly<Record<string, GroupId>> = {
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
  transparent: 'workflows',
  qr: 'workflows',
  webhook: 'horde',
  workers: 'horde',
};

/** The fields each group owns, for the mark that says it holds a changed value. */
const GROUP_FIELDS: Readonly<
  Record<GroupId, readonly (keyof GenerateFormValue)[]>
> = {
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
  workflows: [
    'transparent',
    'qrText',
    'qrXOffset',
    'qrYOffset',
    'qrModuleDrawer',
  ],
};

/** Where the reader's open groups are remembered between visits. */
const GROUPS_OPEN_KEY = 'aihorde.generate.groups_open';

/** What the panel does with a group it has never been told anything about. */
const GROUP_OPEN_DEFAULT = true;

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
  /* Below 1024px the tool switcher is a bottom bar and carries nothing but the
     tools, so this header is the studio's top line and the place the glossary
     is reached from. The shell's copy takes over from 1024px up. */
  public readonly glossary = inject(GlossaryService);
  private readonly toast = inject(ToastService);
  private readonly anchors = inject(TutorialAnchorService);
  private readonly injector = inject(Injector);
  private readonly transloco = inject(TranslocoService);
  private readonly db = inject(DatabaseService);

  public readonly form = input.required<GenerateFormGroup>();
  public readonly models = input<ActiveModel[]>([]);
  public readonly kudos = input<number | null>(null);
  public readonly estimating = input(false);
  /** What the estimate is made of, for the popover behind the kudos chip. */
  public readonly kudosLines = input<readonly KudosBreakdownLine[]>([]);
  /** What to say about the wait for the picked model, as the popover's tail. */
  public readonly waitLine = input<WaitEstimate | null>(null);
  /** Style-forced parameters, used to flag controls a style overrides. */
  public readonly forcedParams = input<StyleForcedParams | null>(null);
  /** Curated style presets grouped by category for the styles picker. */
  public readonly styleGroups = input<StylePickerGroup[]>([]);
  /** Current control-panel width; drives the reflow and the expand control. */
  public readonly panelSize = input<PanelSize>('normal');
  /** Whether the expand/collapse control is offered (off when embedded). */
  public readonly expandable = input(true);
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
  /** The presets toggle, so the parent's load panel can hand focus back to it. */
  private readonly presetsBtn =
    viewChild<ElementRef<HTMLButtonElement>>('presetsBtn');
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

  /** Which prompt field, if any, is open in the full-screen editor. */
  public readonly promptEditor = signal<PromptEditorField | null>(null);

  /** The prompt box, so a picked history entry or starter prompt can focus it. */
  private readonly promptInput =
    viewChild<ElementRef<HTMLTextAreaElement>>('promptInput');

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

  /** The worker ID typed into the add field, before it joins the list. */
  public readonly workerDraft = signal('');

  /** The worker IDs the request is currently pinned to. */
  public workerList(): readonly string[] {
    return this.form().controls.workers.value;
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
   * Follow the selected model's baseline: preselect the aspect-preset family it
   * belongs to, and move still-pristine dimensions onto its native square.
   */
  private readonly baselineSizeSync = effect(() => {
    const baseline = this.modelBaseline();
    const native = nativeSquareFor(baseline);
    const base = sizeBaseFor(baseline);
    if (native === null || base === null || this.sizeTouched()) {
      return;
    }
    const controls = this.form().controls;
    if (
      controls.width.disabled ||
      controls.height.disabled ||
      !isSnappableSize(controls.width.value, controls.height.value)
    ) {
      return;
    }
    this.sizeBase.set(base);
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

    const modeControl = this.form().controls.mode;
    this.mode.set(modeControl.value);
    modeControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((mode) => this.mode.set(mode));

    const controls = this.form().controls;
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

  public setMode(mode: GenerateMode): void {
    const control = this.form().controls.mode;
    if (control.value !== mode) {
      control.setValue(mode);
      control.markAsDirty();
    }
  }

  // --- Settings groups -----------------------------------------------------

  private readonly groupsOpen = signal<Partial<Record<GroupId, boolean>>>({});

  /** Whether `group` is currently showing its controls rather than its values. */
  public isGroupOpen(group: GroupId): boolean {
    return this.groupsOpen()[group] ?? GROUP_OPEN_DEFAULT;
  }

  public toggleGroup(group: GroupId): void {
    this.setGroupOpen(group, !this.isGroupOpen(group));
  }

  /** Show `group`'s controls, whether or not the reader had folded it away. */
  public openGroup(group: GroupId): void {
    if (!this.isGroupOpen(group)) {
      this.setGroupOpen(group, true);
    }
  }

  /**
   * Open the group holding `anchor`, if it is in one. Called before the panel
   * points at a control: a folded group holds no element to point at.
   */
  public openGroupForAnchor(anchor: string): void {
    const group = GROUP_BY_ANCHOR[anchor];
    if (group) {
      this.openGroup(group);
    }
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

  /** A count worded for the number it carries, the studio's plural idiom. */
  private counted(key: string, count: number): string {
    return this.transloco.translate(
      `${key}${count === 1 ? '_one' : '_other'}`,
      { count },
    );
  }

  private summaryLine(parts: readonly (string | null)[]): string {
    const written = parts.filter(
      (part): part is string => part !== null && part !== '',
    );
    return written.length > 0
      ? written.join(SUMMARY_SEPARATOR)
      : this.transloco.translate('generate.groups.summary_none');
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
        ])
      : '';
  });

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
          value.shared
            ? this.transloco.translate('generate.groups.output_shared')
            : null,
        ])
      : '';
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

  public readonly workflowsSummary = computed(() => {
    const value = this.value();
    return value
      ? this.summaryLine([
          value.transparent
            ? this.transloco.translate('generate.groups.workflows_transparent')
            : null,
          value.qrText
            ? this.transloco.translate('generate.groups.workflows_qr')
            : null,
        ])
      : '';
  });

  public setSizeBase(base: ModelSizeBase): void {
    this.sizeBase.set(base);
    this.sizeTouched.set(true);
  }

  public applyPreset(width: number, height: number): void {
    this.form().patchValue({ width, height });
    this.form().controls.width.markAsDirty();
  }

  public isPresetActive(width: number, height: number): boolean {
    const controls = this.form().controls;
    return controls.width.value === width && controls.height.value === height;
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
    this.setDisabled(controls.scheduler, pins('sampling', forced?.karras));
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
   * it. A control the panel is not currently drawing is one the essentials view
   * leaves out, one its group is folded over, or one the sampling knobs are
   * folded over, so each is opened and the pointing waits for the control to
   * exist.
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
    if (!this.isAdvanced()) {
      this.setMode('advanced');
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
