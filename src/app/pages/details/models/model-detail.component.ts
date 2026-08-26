import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiHordeService } from '../../../services/ai-horde.service';
import { AdminWorkerService } from '../../../services/admin-worker.service';
import {
  ModelReferenceRecord,
  ModelReferenceService,
  ModelRequirements,
  TextModelReferenceRecord,
} from '../../../services/model-reference.service';
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
import { UnitTooltipComponent } from '../../../components/unit-tooltip/unit-tooltip.component';
import { IconComponent } from '../../../components/icon/icon.component';
import {
  baselineLabel,
  formatFileSize,
  formatParameterCount,
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
    UnitTooltipComponent,
  ],
  templateUrl: './model-detail.component.html',
  styleUrl: './model-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'closeViewer()',
  },
})
export class ModelDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly aiHorde = inject(AiHordeService);
  private readonly workerService = inject(AdminWorkerService);
  private readonly reference = inject(ModelReferenceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  public readonly unitConversion = inject(UnitConversionService);

  private readonly params = toSignal(this.route.params, {
    initialValue: {} as Record<string, string>,
  });

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

  /** Where the back link returns to. */
  public readonly listLink = computed(() => ['/details/models', this.kind()]);

  constructor() {
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
        : textNames.includes(this.modelName())
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
        : this.aiHorde.getTextModels('all');

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
    this.showcaseIndex.set(index);
  }

  public openViewer(): void {
    if (this.currentShowcase() !== '') {
      this.viewerOpen.set(true);
    }
  }

  public closeViewer(): void {
    this.viewerOpen.set(false);
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
