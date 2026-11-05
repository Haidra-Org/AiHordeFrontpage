import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  PLATFORM_ID,
  Signal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AiHordeService } from '../../../services/ai-horde.service';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import {
  ModelReferenceRecord,
  ModelReferenceService,
  ModelRequirements,
  TextModelReferenceRecord,
} from '../../../services/model-reference.service';
import {
  LicensingService,
  licensingExplorerUrl,
  type LicensingFact,
} from '../../../services/licensing.service';
import { ActiveModel } from '../../../types/active-model';
import { HordeWorker } from '../../../types/horde-worker';
import { ImageGenerationRequest } from '../../../types/generation';
import { IMAGE_SCHEDULERS } from '../../../types/sampler-constraints';
import { studioLinkAddress } from '../../generate/studio-link';
import { setPageMeta } from '../../../helper/page-meta';
import {
  SynthesizedUnit,
  UnitConversionService,
} from '../../../services/unit-conversion.service';
import { IconComponent } from '../../../components/icon/icon.component';
import { ChatCapabilitiesComponent } from '../../admin/workers/chat-capabilities.component';
import { useScrollLock } from '../../../helper/scroll-lock';
import {
  baselineLabel,
  capabilitiesFor,
  formatFileSize,
  formatParameterCount,
  ModelCapability,
} from './model-labels';

/** The two kinds of model the horde publishes a reference for. */
export type ModelKind = 'image' | 'text';

/** How many workers are named before the rest are counted instead. */
const MAX_NAMED_WORKERS = 12;

/** One recommended setting, as a label and the value the publisher gave. */
export interface RecommendedSetting {
  labelKey: string;
  value: string;
}

/**
 * The single value to open the studio at when the reference gives a range. The
 * middle of the range is the one value inside it that is never at an end, so a
 * reader who changes nothing lands where the publisher's advice holds.
 */
export function midpoint(
  low: number | undefined,
  high: number | undefined,
): number | null {
  if (low !== undefined && high !== undefined) {
    return Math.round(((low + high) / 2) * 10) / 10;
  }
  return low ?? high ?? null;
}

/**
 * The request that opens the studio on this model at the settings its publisher
 * recommends. A range becomes its midpoint; a list of samplers or schedulers
 * becomes its first entry, which is the publisher's own first choice.
 */
export function recommendedRequest(
  modelName: string,
  requirements: ModelRequirements | null,
): ImageGenerationRequest {
  const request: ImageGenerationRequest = { prompt: '', models: [modelName] };
  if (requirements === null) {
    return request;
  }
  const params: NonNullable<ImageGenerationRequest['params']> = {};
  const steps = midpoint(requirements.min_steps, requirements.max_steps);
  if (steps !== null) {
    params.steps = Math.round(steps);
  }
  const cfg =
    requirements.cfg_scale ??
    midpoint(requirements.min_cfg_scale, requirements.max_cfg_scale);
  if (cfg !== null) {
    params.cfg_scale = cfg;
  }
  if (requirements.clip_skip !== undefined) {
    params.clip_skip = requirements.clip_skip;
  }
  const sampler = requirements.samplers?.[0];
  if (sampler !== undefined) {
    params.sampler_name = sampler;
  }
  const scheduler = requirements.schedulers?.find((entry) =>
    (IMAGE_SCHEDULERS as readonly string[]).includes(entry),
  );
  if (scheduler !== undefined) {
    params.scheduler = scheduler as NonNullable<
      ImageGenerationRequest['params']
    >['scheduler'];
  }
  if (Object.keys(params).length > 0) {
    request.params = params;
  }
  return request;
}

/** Print a range the way the reference gives it: one value, or low to high. */
function rangeText(low: number | undefined, high: number | undefined): string {
  if (low !== undefined && high !== undefined) {
    return low === high ? String(low) : `${low} to ${high}`;
  }
  const only = low ?? high;
  return only === undefined ? '' : String(only);
}

/** The recommended settings of an image model, as printable rows. */
export function imageSettingRows(
  requirements: ModelRequirements | null,
): RecommendedSetting[] {
  if (requirements === null) {
    return [];
  }
  const rows: RecommendedSetting[] = [];
  const steps = rangeText(requirements.min_steps, requirements.max_steps);
  if (steps !== '') {
    rows.push({ labelKey: 'details.model_detail.setting.steps', value: steps });
  }
  const cfg =
    requirements.cfg_scale !== undefined
      ? String(requirements.cfg_scale)
      : rangeText(requirements.min_cfg_scale, requirements.max_cfg_scale);
  if (cfg !== '') {
    rows.push({ labelKey: 'details.model_detail.setting.cfg', value: cfg });
  }
  if (requirements.clip_skip !== undefined) {
    rows.push({
      labelKey: 'details.model_detail.setting.clip_skip',
      value: String(requirements.clip_skip),
    });
  }
  if (requirements.samplers?.length) {
    rows.push({
      labelKey: 'details.model_detail.setting.samplers',
      value: requirements.samplers.join(', '),
    });
  }
  if (requirements.schedulers?.length) {
    rows.push({
      labelKey: 'details.model_detail.setting.schedulers',
      value: requirements.schedulers.join(', '),
    });
  }
  return rows;
}

/** The recommended settings of a text model, as printable rows. */
export function textSettingRows(
  record: TextModelReferenceRecord | null,
): RecommendedSetting[] {
  const settings = record?.settings;
  if (!settings) {
    return [];
  }
  const rows: RecommendedSetting[] = [];
  const named = [
    ['temperature', 'details.model_detail.setting.temperature'],
    ['top_p', 'details.model_detail.setting.top_p'],
    ['top_k', 'details.model_detail.setting.top_k'],
    ['rep_pen', 'details.model_detail.setting.rep_pen'],
  ] as const;
  for (const [key, labelKey] of named) {
    const value = settings[key];
    if (value !== undefined) {
      rows.push({ labelKey, value: String(value) });
    }
  }
  return rows;
}

/**
 * Everything the site knows about one model on one page: what the reference
 * publishes about it, what the horde's workers are doing with it right now, and
 * the way into the studio with it already chosen.
 */
@Component({
  selector: 'app-model-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    DecimalPipe,
    IconComponent,
    ChatCapabilitiesComponent,
  ],
  templateUrl: './model-detail.component.html',
  styleUrl: './model-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly aiHorde = inject(AiHordeService);
  private readonly workerService = inject(AdminWorkerService);
  private readonly reference = inject(ModelReferenceService);
  private readonly licensing = inject(LicensingService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  public readonly unitConversion = inject(UnitConversionService);

  private readonly params: Signal<Record<string, string>> = toSignal(
    this.route.params,
    {
      initialValue: {},
    },
  );

  /** The kind named in the address, or null when the address names only a model. */
  private readonly routeKind = computed<ModelKind | null>(() => {
    const type = this.params()['modelType'] as string | undefined;
    return type === 'image' || type === 'text' ? type : null;
  });

  /** The model this page is about. */
  public readonly modelName = computed<string>(() => {
    const name = this.params()['modelName'] as string | undefined;
    return name ? decodeURIComponent(name) : '';
  });

  /** What both references have been asked for and have answered with. */
  private readonly imageRecord = computed<ModelReferenceRecord | null>(() =>
    this.reference.recordFor(this.modelName()),
  );

  private readonly textRecord = computed<TextModelReferenceRecord | null>(() =>
    this.reference.textRecordFor(this.modelName()),
  );

  /** The horde's live numbers for this model, per kind. */
  private readonly imageStatus = signal<ActiveModel | null>(null);
  private readonly textStatus = signal<ActiveModel | null>(null);

  /**
   * The chat list's entry for this text model, null when the list does not
   * include it. `textChatLoaded` distinguishes a missing entry from a list
   * that has not loaded or failed to load.
   */
  private readonly textChatStatus = signal<ActiveModel | null>(null);
  private readonly textChatLoaded = signal(false);

  /** Requests this model served, in the last month and since it was published. */
  public readonly usageMonth = signal(0);
  public readonly usageTotal = signal(0);

  /** The workers carrying this model, or null while none are known. */
  private readonly workers = signal<readonly HordeWorker[] | null>(null);

  /** Whether the page is still waiting for its first answer. */
  public readonly loading = signal(true);

  /** Whether there is a browser to fetch from yet. */
  private readonly ready = signal(false);

  /** The kind and name the live numbers on the page were fetched for. */
  private fetchedFor = '';

  /** Which of the published samples the stage is showing. */
  public readonly showcaseIndex = signal(0);

  /** Whether the enlarged sample is open. */
  public readonly viewerOpen = signal(false);
  public readonly failedShowcases = signal<ReadonlySet<string>>(new Set());
  public readonly showcaseFailed = computed(() =>
    this.failedShowcases().has(this.currentShowcase()),
  );
  private readonly viewer = viewChild<ElementRef<HTMLDialogElement>>('viewer');
  private readonly viewerClose =
    viewChild<ElementRef<HTMLButtonElement>>('viewerClose');
  private readonly identity = viewChild<ElementRef<HTMLElement>>('identity');
  private readonly scrollLock = useScrollLock();
  private viewerTrigger: HTMLElement | null = null;

  /** The trigger word whose text was last copied. */
  public readonly copiedTrigger = signal<string | null>(null);

  /**
   * The kind of model this is: the one the address names, or the one whichever
   * reference lists it says it is.
   */
  public readonly kind = computed<ModelKind>(() => {
    const named = this.routeKind();
    if (named !== null) {
      return named;
    }
    if (this.reference.textRecordFor(this.modelName()) !== null) {
      return 'text';
    }
    return 'image';
  });

  /** The live numbers for this model, whichever kind it is. */
  public readonly status = computed<ActiveModel | null>(() =>
    this.kind() === 'image' ? this.imageStatus() : this.textStatus(),
  );

  /** Whether the chat list has loaded for this text model. */
  public readonly showsChat = computed(
    () => this.kind() === 'text' && this.textChatLoaded(),
  );

  /** The summary of chat declarations for this model, or null. */
  public readonly chat = computed(() =>
    this.kind() === 'text' ? (this.textChatStatus()?.chat ?? null) : null,
  );

  /** The image record, or null on a text model or one nothing lists. */
  public readonly record = computed<ModelReferenceRecord | null>(() =>
    this.kind() === 'image' ? this.imageRecord() : null,
  );

  public readonly textDetails = computed<TextModelReferenceRecord | null>(() =>
    this.kind() === 'text' ? this.textRecord() : null,
  );

  /** Whether either reference knows this model at all. */
  public readonly known = computed(
    () => this.record() !== null || this.textDetails() !== null,
  );

  public readonly custom = computed(() =>
    this.kind() === 'text'
      ? this.status()?.custom === true
      : this.reference.names() !== null && !this.known(),
  );

  /**
   * What the reference says about using this model's pictures commercially.
   * Null on a text model, where the licensing export has no answer for any of
   * them, and while the export has not been read.
   */
  public readonly licensingFact = computed<LicensingFact | null>(() =>
    this.kind() === 'image'
      ? this.licensing.commercialUse('image_generation', this.modelName())()
      : null,
  );

  /** This model's page in the reference explorer, where the licence is set out in full. */
  public readonly licensingExplorer = computed(() =>
    licensingExplorerUrl('image_generation', this.modelName()),
  );

  /** The licence's conditions in plain words, or '' when it attaches none. */
  public readonly licensingObligations = computed<string>(() => {
    const fact = this.licensingFact();
    if (fact === null) {
      return '';
    }
    return fact.obligations
      .map((obligation) =>
        this.transloco.translate(
          `details.model_detail.obligation.${obligation}`,
        ),
      )
      .join(', ');
  });

  /** Whether nothing at all could be found under this name. */
  public readonly missing = computed(
    () => !this.loading() && !this.known() && this.status() === null,
  );

  /** The name to print: the display name a text model publishes, or the name. */
  public readonly title = computed(
    () => this.textDetails()?.display_name ?? this.modelName(),
  );

  public readonly description = computed(
    () => this.record()?.description ?? this.textDetails()?.description ?? '',
  );

  /** The family the model was built on, printed the way a reader knows it. */
  public readonly family = computed(() => {
    const baseline = this.record()?.baseline;
    if (baseline) {
      return baselineLabel(baseline);
    }
    return this.textDetails()?.baseline ?? '';
  });

  public readonly tags = computed<string[]>(
    () => this.record()?.tags ?? this.textDetails()?.tags ?? [],
  );

  public readonly nsfw = computed(
    () => this.record()?.nsfw ?? this.textDetails()?.nsfw ?? false,
  );

  public readonly homepage = computed(
    () => this.record()?.homepage ?? this.textDetails()?.url ?? '',
  );

  public readonly version = computed(
    () => this.record()?.version ?? this.textDetails()?.version ?? '',
  );

  public readonly sizeOnDisk = computed(() =>
    formatFileSize(this.record()?.size_on_disk_bytes ?? null),
  );

  public readonly parameters = computed(() =>
    formatParameterCount(this.textDetails()?.parameters ?? null),
  );

  /** The published samples of what this model makes. */
  public readonly showcases = computed<string[]>(
    () => this.record()?.showcases ?? [],
  );

  public readonly currentShowcase = computed<string>(() => {
    const list = this.showcases();
    return list[Math.min(this.showcaseIndex(), list.length - 1)] ?? '';
  });

  public readonly triggers = computed<string[]>(
    () => this.record()?.trigger ?? [],
  );

  /** The settings this model's publisher recommends generating with. */
  public readonly settingRows = computed<RecommendedSetting[]>(() =>
    this.kind() === 'image'
      ? imageSettingRows(this.record()?.requirements ?? null)
      : textSettingRows(this.textDetails()),
  );

  /** The workers carrying this model, capped at the number the page names. */
  public readonly servingWorkers = computed<readonly HordeWorker[]>(() => {
    const all = this.workers();
    if (all === null) {
      return [];
    }
    const name = this.modelName();
    const kind = this.kind();
    return all.filter(
      (worker) => worker.type === kind && (worker.models ?? []).includes(name),
    );
  });

  public readonly namedWorkers = computed(() =>
    this.servingWorkers().slice(0, MAX_NAMED_WORKERS),
  );

  public readonly extraWorkers = computed(() =>
    Math.max(0, this.servingWorkers().length - MAX_NAMED_WORKERS),
  );

  /**
   * The address that opens the studio on this model at its recommended
   * settings, or null when the model recommends none or the page is being
   * rendered without a browser to read the current address from.
   */
  public readonly studioAddress = computed<string | null>(() => {
    if (!this.isBrowser || this.kind() !== 'image') {
      return null;
    }
    const requirements = this.record()?.requirements ?? null;
    if (requirements === null) {
      return null;
    }
    return studioLinkAddress(
      this.router,
      recommendedRequest(this.modelName(), requirements),
      null,
    );
  });

  public readonly queuedUnit = computed<SynthesizedUnit>(() => {
    const queued = this.status()?.queued ?? 0;
    return this.kind() === 'image'
      ? this.unitConversion.formatModelQueuedImage(queued)
      : this.unitConversion.formatModelQueuedText(queued);
  });

  public readonly performanceUnit = computed<SynthesizedUnit | null>(() => {
    const performance = this.status()?.performance ?? 0;
    if (performance <= 0) {
      return null;
    }
    return this.kind() === 'image'
      ? this.unitConversion.formatModelPerformanceImage(performance)
      : this.unitConversion.formatModelPerformanceText(performance);
  });

  /**
   * Which unit the queued and performance figures are counted in. Pictures and
   * text are measured differently, so the unit is named on the label and the
   * figure beside it stays a number.
   */
  public readonly queuedColumnKey = computed(() =>
    this.kind() === 'image'
      ? 'details.models.column.queued_image'
      : 'details.models.column.queued_text',
  );

  public readonly performanceColumnKey = computed(() =>
    this.kind() === 'image'
      ? 'details.models.column.performance_image'
      : 'details.models.column.performance_text',
  );

  public readonly queuedValue = computed(() => {
    const { value, prefixShort } = this.queuedUnit().primary;
    return `${value.toFixed(1)}${prefixShort}`;
  });

  public readonly performanceValue = computed(() => {
    const unit = this.performanceUnit();
    if (unit === null) {
      return '-';
    }
    const { value, prefixShort } = unit.primary;
    return `${value.toFixed(this.kind() === 'image' ? 2 : 1)}${prefixShort}`;
  });

  /** The all-time count, grouped the way every other number here is. */
  public readonly usageTotalText = computed(() =>
    this.usageTotal().toLocaleString(),
  );

  /** Everything this model's family accepts, listed in full. */
  public readonly capabilities = computed<ModelCapability[]>(() =>
    capabilitiesFor(this.record()?.baseline ?? ''),
  );

  /** Where the back link returns to. */
  public readonly listLink = computed(() => ['/details/models', this.kind()]);

  constructor() {
    this.destroyRef.onDestroy(() => this.closeViewer());
    effect(() => {
      this.modelName();
      this.kind();
      untracked(() => {
        this.closeViewer();
        this.showcaseIndex.set(0);
        this.failedShowcases.set(new Set());
      });
    });

    effect(() => {
      const count = this.showcases().length;
      if (this.showcaseIndex() >= count) {
        this.showcaseIndex.set(Math.max(0, count - 1));
      }
      if (count === 0) {
        untracked(() => this.closeViewer());
      }
    });

    afterRenderEffect(() => {
      const dialog = this.viewer()?.nativeElement;
      if (!this.isBrowser || !dialog) return;
      if (this.viewerOpen() && !dialog.open) {
        dialog.showModal();
        this.scrollLock.enable();
        this.viewerClose()?.nativeElement.focus({ preventScroll: true });
      }
    });

    setPageMeta({
      titleKey: 'details.model_detail.meta_title',
      descriptionKey: 'details.model_detail.meta_description',
      params: () => ({ name: this.title() }),
    });

    // An address that names only a model is answered once a reference says
    // which kind it is, and then rewritten so the page can be linked to again.
    effect(() => {
      if (this.routeKind() !== null || this.modelName() === '') {
        return;
      }
      const names = this.reference.names();
      const textNames = this.reference.textNames();
      if (names === null || textNames === null) {
        return;
      }
      const kind: ModelKind = names.includes(this.modelName())
        ? 'image'
        : this.reference.textRecordFor(this.modelName()) !== null
          ? 'text'
          : 'image';
      void this.router.navigate(['/details/models', kind, this.modelName()], {
        replaceUrl: true,
      });
    });

    // The kind is only settled once a reference has answered, so the live
    // numbers are fetched again if the first guess at it turns out wrong.
    effect(() => {
      if (!this.ready() || this.modelName() === '') {
        return;
      }
      const key = `${this.kind()}:${this.modelName()}`;
      if (key === this.fetchedFor) {
        return;
      }
      this.fetchedFor = key;
      this.loadStatus();
    });

    afterNextRender(() => {
      this.reference.load();
      this.reference.loadText();
      this.loadWorkers();
      this.ready.set(true);
    });
  }

  private loadStatus(): void {
    const kind = this.kind();
    const name = this.modelName();

    const models =
      kind === 'image'
        ? this.aiHorde.getImageModels('all')
        : this.aiHorde.getClassifiedTextModels();

    models.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (list) => {
        const found = list.find((model) => model.name === name) ?? null;
        if (kind === 'image') {
          this.imageStatus.set(found);
        } else {
          this.textStatus.set(found);
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    if (kind === 'text') {
      this.textChatLoaded.set(false);
      this.textChatStatus.set(null);
      this.aiHorde
        .getChatTextModels()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (list) => {
            this.textChatStatus.set(
              list.find((model) => model.name === name) ?? null,
            );
            this.textChatLoaded.set(true);
          },
          error: () => {
            // Without the chat list the page hides chat jobs. An empty
            // result would wrongly show that chat jobs are not served.
          },
        });
    }

    const stats =
      kind === 'image'
        ? this.aiHorde.getImageModelStats('all')
        : this.aiHorde.getTextModelStats();

    stats.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (periods) => {
        this.usageMonth.set(periods.month[name] ?? 0);
        this.usageTotal.set(periods.total[name] ?? 0);
      },
      error: () => {
        // The page reads without the counts; a zero is honest.
      },
    });
  }

  private loadWorkers(): void {
    this.workerService
      .getWorkers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.workers.set(list));
  }

  /** The horde's estimate of how long this model's queue takes to clear. */
  public formatEta(seconds: number | undefined): string {
    if (!seconds || seconds <= 0) return '-';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  }

  public showShowcase(index: number): void {
    const count = this.showcases().length;
    if (count > 0) this.showcaseIndex.set((index + count) % count);
  }

  public openViewer(event: MouseEvent): void {
    if (this.isBrowser && this.currentShowcase() !== '') {
      this.viewerTrigger = event.currentTarget as HTMLElement;
      this.viewerOpen.set(true);
    }
  }

  public closeViewer(): void {
    const wasOpen = this.viewerOpen();
    this.viewerOpen.set(false);
    const dialog = this.viewer()?.nativeElement;
    if (dialog?.open) dialog.close();
    this.scrollLock.disable();
    if (wasOpen) {
      const target = this.viewerTrigger?.isConnected
        ? this.viewerTrigger
        : this.identity()?.nativeElement;
      target?.focus({ preventScroll: true });
      this.viewerTrigger = null;
    }
  }

  public onViewerCancel(event: Event): void {
    event.preventDefault();
    this.closeViewer();
  }

  public onViewerClosed(): void {
    if (!this.viewer()?.nativeElement.open) this.closeViewer();
  }

  public onViewerBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeViewer();
  }

  public onViewerKeydown(event: KeyboardEvent): void {
    if (
      this.showcases().length > 1 &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.showShowcase(
        this.showcaseIndex() + (event.key === 'ArrowLeft' ? -1 : 1),
      );
    }
  }

  public markShowcaseFailed(event: Event): void {
    const url = (event.target as HTMLImageElement).getAttribute('src');
    if (url && this.showcases().includes(url)) {
      this.failedShowcases.update((failed) => new Set([...failed, url]));
    }
  }

  public retryShowcase(): void {
    this.failedShowcases.update((failed) => {
      const next = new Set(failed);
      next.delete(this.currentShowcase());
      return next;
    });
  }

  /** Put a trigger word on the clipboard, and say on the chip that it went. */
  public copyTrigger(trigger: string): void {
    const clipboard: Clipboard | undefined = navigator.clipboard;
    if (!clipboard) {
      return;
    }
    void clipboard
      .writeText(trigger)
      .then(() => this.copiedTrigger.set(trigger))
      .catch(() => this.copiedTrigger.set(null));
  }
}
