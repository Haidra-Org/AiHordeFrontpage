import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  NgZone,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  DecimalPipe,
  NgTemplateOutlet,
  isPlatformBrowser,
} from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiHordeService } from '../../services/ai-horde.service';
import { AuthService } from '../../services/auth.service';
import { NetworkStatusService } from '../../services/network-status.service';
import { ToastService } from '../../services/toast.service';
import { TranslatorService } from '../../services/translator.service';
import { setPageTitle } from '../../helper/page-title';
import {
  ALCHEMY_DATA_FORMS,
  ALCHEMY_POST_PROCESSOR_FORMS,
  AlchemyFormName,
  AlchemyStatusResponse,
  GENERATION_NOT_FOUND,
  InterrogationRequest,
} from '../../types/generation';
import { AlchemyImageInputComponent } from '../../components/alchemy/alchemy-image-input/alchemy-image-input.component';
import { AlchemyResultComponent } from '../../components/alchemy/alchemy-result/alchemy-result.component';
import { IconComponent } from '../../components/icon/icon.component';
import { buildAlchemyJobArchive } from '../../helper/alchemy-archive';
import { PanelSize, cyclePanelSize } from '../generate/generate-form.model';

const ANONYMOUS_API_KEY = '0000000000';

/** How a single form's state reads in the per-form checklist. */
interface FormStatusView {
  icon: string;
  spin: boolean;
  modifier: string;
}

/** A labelled slice of a group's forms, for use-case sub-grouping. */
interface AlchemyOperationSubGroup {
  labelKey: string;
  forms: readonly AlchemyFormName[];
}

interface AlchemyOperationGroup {
  id: string;
  icon: string;
  titleKey: string;
  outputKey: string;
  blurbKey: string;
  forms: readonly AlchemyFormName[];
  /**
   * When set, the group renders these labelled sub-groups (full-width, one form
   * per line) instead of the flat two-column grid — used for the upscalers,
   * whose long names don't fit two-up and read better split by use case.
   */
  subGroups?: readonly AlchemyOperationSubGroup[];
}

const FORM_STATUS_VIEWS: Record<string, FormStatusView> = {
  waiting: { icon: 'clock', spin: false, modifier: 'waiting' },
  processing: { icon: 'spinner', spin: true, modifier: 'processing' },
  done: { icon: 'check-circle-filled', spin: false, modifier: 'done' },
  cancelled: { icon: 'x-circle', spin: false, modifier: 'cancelled' },
  faulted: {
    icon: 'warning-triangle-filled',
    spin: false,
    modifier: 'faulted',
  },
};

interface AlchemyJob {
  id: string;
  forms: AlchemyFormName[];
  status: AlchemyStatusResponse | null;
  done: boolean;
  faulted: boolean;
  cancelled: boolean;
  notFound: boolean;
  firstSeenAt: number;
}

@Component({
  selector: 'app-alchemy',
  imports: [
    TranslocoPipe,
    DecimalPipe,
    NgTemplateOutlet,
    RouterLink,
    AlchemyImageInputComponent,
    AlchemyResultComponent,
    IconComponent,
  ],
  templateUrl: './alchemy.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlchemyComponent {
  private readonly aiHorde = inject(AiHordeService);
  private readonly auth = inject(AuthService);
  public readonly ns = inject(NetworkStatusService);
  private readonly toast = inject(ToastService);
  private readonly translator = inject(TranslatorService);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);

  private static readonly POLL_MS = 10_000;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * A job lives at most 20 minutes on the server and its results linger for
   * roughly 20 more, so 40 minutes from first sight is the longest a restored
   * job could still be useful. Past that we drop it: re-polling would only 404
   * and any result images have already expired.
   */
  private static readonly FRESH_TTL_MS = 40 * 60_000;
  private static readonly STORAGE_KEY = 'aihorde.alchemy.recent_jobs';

  /**
   * Guards persistence until the one-time restore has run, so the effect's
   * initial pass over the empty list can't clobber what's in storage before we
   * load it.
   */
  private restored = false;

  public readonly dataForms = ALCHEMY_DATA_FORMS;
  public readonly postProcessorForms = ALCHEMY_POST_PROCESSOR_FORMS;

  /**
   * The post-processor forms split into the groups shown in the builder, so
   * each fieldset can carry its own explanation of what its options do
   * instead of one undifferentiated "enhance" bucket. `postProcessorForms`
   * above is kept as-is for the developers tab's plain form-name reference.
   */
  public readonly upscalerForms: readonly AlchemyFormName[] = [
    'RealESRGAN_x4plus',
    'RealESRGAN_x2plus',
    'RealESRGAN_x4plus_anime_6B',
    'NMKD_Siax',
    '4x_AnimeSharp',
    '4xNomos8kSC',
    '4xLSDIRplus',
    '4xNomosWebPhoto_RealPLKSR',
    '4xNomos2_realplksr_dysample',
    '4xNomos2_hq_dat2',
    '2xModernSpanimationV1',
  ];
  public readonly faceFixerForms: readonly AlchemyFormName[] = [
    'GFPGAN',
    'GFPGANv1.3',
    'CodeFormers',
    'RestoreFormer',
  ];
  public readonly backgroundForms: readonly AlchemyFormName[] = [
    'strip_background',
  ];

  /** Upscalers split by use case, so their long names get a full line each. */
  private readonly upscalerSubGroups: readonly AlchemyOperationSubGroup[] = [
    {
      labelKey: 'alchemy.forms.upscale_photo',
      forms: [
        'RealESRGAN_x4plus',
        'RealESRGAN_x2plus',
        '4xNomosWebPhoto_RealPLKSR',
        '4xNomos2_realplksr_dysample',
        'NMKD_Siax',
      ],
    },
    {
      labelKey: 'alchemy.forms.upscale_anime',
      forms: [
        'RealESRGAN_x4plus_anime_6B',
        '4x_AnimeSharp',
        '2xModernSpanimationV1',
      ],
    },
    {
      labelKey: 'alchemy.forms.upscale_general',
      forms: ['4xLSDIRplus', '4xNomos8kSC', '4xNomos2_hq_dat2'],
    },
  ];

  public readonly operationGroups: readonly AlchemyOperationGroup[] = [
    {
      id: 'analyze',
      icon: 'document-text',
      titleKey: 'alchemy.forms.analyze_title',
      outputKey: 'alchemy.forms.analyze_output',
      blurbKey: 'alchemy.forms.analyze_blurb',
      forms: this.dataForms,
    },
    {
      id: 'upscale',
      icon: 'photo',
      titleKey: 'alchemy.forms.upscale_title',
      outputKey: 'alchemy.forms.upscale_output',
      blurbKey: 'alchemy.forms.upscale_blurb',
      forms: this.upscalerForms,
      subGroups: this.upscalerSubGroups,
    },
    {
      id: 'facefix',
      icon: 'paintbrush',
      titleKey: 'alchemy.forms.facefix_title',
      outputKey: 'alchemy.forms.facefix_output',
      blurbKey: 'alchemy.forms.facefix_blurb',
      forms: this.faceFixerForms,
    },
    {
      id: 'background',
      icon: 'cube-transparent',
      titleKey: 'alchemy.forms.background_title',
      outputKey: 'alchemy.forms.background_output',
      blurbKey: 'alchemy.forms.background_blurb',
      forms: this.backgroundForms,
    },
  ];

  /** The API request-preview modal (the header's "{ } API" affordance). */
  public readonly apiModalOpen = signal(false);
  public readonly activeOperation = signal<AlchemyFormName>('caption');

  /** How wide the control panel is expanded (normal/double/full). UI-only. */
  public readonly panelSize = signal<PanelSize>('normal');

  /**
   * Step the panel one width wider, wrapping `full` back to `normal`. Backs the
   * single expand/collapse toggle in the header.
   */
  public cyclePanel(): void {
    this.panelSize.update((size) => cyclePanelSize(size));
  }

  /** Operation groups the user has collapsed. Empty = all expanded (default). */
  public readonly collapsedGroups = signal<ReadonlySet<string>>(new Set());

  public isGroupCollapsed(id: string): boolean {
    return this.collapsedGroups().has(id);
  }

  public toggleGroup(id: string): void {
    this.collapsedGroups.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  /**
   * Static API status sample for the request-preview modal. Kept as a component
   * string because its JSON braces would otherwise collide with Angular's
   * control-flow block syntax in the template.
   */
  public readonly statusSample = `{
  "state": "done",
  "forms": [
    { "form": "caption", "state": "done",
      "result": { "caption": "a black dog sitting on the ground" } },
    { "form": "RealESRGAN_x4plus", "state": "done",
      "result": { "RealESRGAN_x4plus": "https://...r2...webp?X-Amz-Expires=1800" } }
  ]
}`;

  public readonly sourceImage = signal<string | null>(null);
  public readonly selectedForms = signal<Set<AlchemyFormName>>(new Set());
  public readonly slowWorkers = signal(true);

  public readonly isSubmitting = signal(false);
  public readonly jobs = signal<AlchemyJob[]>([]);
  public readonly downloadingJobId = signal<string | null>(null);

  /** Which job cards are expanded. Collapsed jobs show only their summary line. */
  public readonly expandedJobs = signal<ReadonlySet<string>>(new Set());

  /**
   * Select-to-delete for tracked job cards, mirroring the image results grid.
   * Deleting a card just stops tracking it (results are server-side and expire
   * on their own), but it is still gated behind an explicit select + confirm so
   * a stray tap can't wipe the list.
   */
  public readonly selectMode = signal(false);
  public readonly selectedJobIds = signal<ReadonlySet<string>>(new Set());
  public readonly selectedJobCount = computed(() => this.selectedJobIds().size);
  private readonly pendingDelete = signal<readonly string[]>([]);
  public readonly confirmDeleteOpen = computed(
    () => this.pendingDelete().length > 0,
  );
  public readonly pendingDeleteCount = computed(
    () => this.pendingDelete().length,
  );

  /**
   * The job a submission just added, so its card can pulse into view instead
   * of silently appearing at the top of a list the user may not be looking
   * at. Cleared a couple seconds after it's set.
   */
  public readonly justAddedJobId = signal<string | null>(null);

  /** Jobs still in flight, for the flow connector's live status line. */
  public readonly pendingJobsCount = computed(
    () => this.jobs().filter((j) => !this.isJobSettled(j)).length,
  );

  public readonly hasAnyJobs = computed(() => this.jobs().length > 0);

  /**
   * When on, a newly tracked request opens on its own and earlier ones fold
   * away, so the list stays roughly one screen instead of growing without
   * bound. Manual toggles and expand/collapse-all always win over this.
   */
  public readonly autoOpenResults = signal(true);

  private static readonly SUMMARY_CHIP_LIMIT = 3;

  public readonly isLoggedIn = this.auth.isLoggedIn;

  public readonly hasSource = computed(() => this.sourceImage() !== null);
  public readonly selectedCount = computed(() => this.selectedForms().size);

  public readonly canSubmit = computed(
    () =>
      !this.isSubmitting() &&
      this.sourceImage() !== null &&
      this.selectedForms().size > 0,
  );

  /** A backed-up queue (>50) is the trigger above this line. */
  private static readonly QUEUE_BACKLOG_THRESHOLD = 20;

  /**
   * Why the alchemy pool needs help, so the nudge can name the real cause:
   * a thin worker pool (which can happen with an empty queue) reads as a
   * worker shortage, not a backlog. Only call it a backlog when the queue
   * is actually deep.
   */
  public readonly alchemyHelpReason = computed<'workers' | 'queue' | null>(
    () => {
      if (!this.ns.alchemyNeedsHelp()) return null;
      const perf = this.ns.performance();
      if (!perf) return null;
      return perf.queued_forms < AlchemyComponent.QUEUE_BACKLOG_THRESHOLD
        ? 'workers'
        : 'queue';
    },
  );

  constructor() {
    effect(() => this.persistJobs(this.jobs()));

    afterNextRender(() => {
      setPageTitle(
        this.translator,
        this.title,
        this.destroyRef,
        'alchemy.title',
      );
      this.restoreJobs();
      this.startPolling();
    });
  }

  public openApi(): void {
    this.apiModalOpen.set(true);
  }

  public closeApi(): void {
    this.apiModalOpen.set(false);
  }

  /** Close the API modal only when its backdrop (not the panel) is clicked. */
  public onApiBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeApi();
    }
  }

  /**
   * Live preview of the `/interrogate/async` request body the current source and
   * selected operations would submit. A base64 source is elided to a placeholder
   * so the modal stays readable; a URL source is shown verbatim.
   */
  public readonly apiPayload = computed(() => {
    const source = this.sourceImage();
    const forms = [...this.selectedForms()].map((name) => ({ name }));
    const payload = {
      forms: forms.length > 0 ? forms : [{ name: 'caption' }],
      source_image: source
        ? source.startsWith('data:')
          ? '<base64 webp>'
          : source
        : '<source image>',
      slow_workers: this.slowWorkers(),
    };
    return JSON.stringify(payload, null, 2);
  });

  /** Copy the previewed request body to the clipboard, then close the modal. */
  public async copyApiPayload(): Promise<void> {
    if (
      isPlatformBrowser(this.platformId) &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard
    ) {
      try {
        await navigator.clipboard.writeText(this.apiPayload());
      } catch {
        // Clipboard access can be denied; closing the modal is the main intent.
      }
    }
    this.closeApi();
  }

  public onSourceImage(value: string | null): void {
    this.sourceImage.set(value);
  }

  public isFormSelected(form: AlchemyFormName): boolean {
    return this.selectedForms().has(form);
  }

  public toggleForm(form: AlchemyFormName): void {
    this.activeOperation.set(form);
    this.selectedForms.update((current) => {
      const next = new Set(current);
      if (next.has(form)) {
        next.delete(form);
      } else {
        next.add(form);
      }
      return next;
    });
  }

  public previewForm(form: AlchemyFormName): void {
    this.activeOperation.set(form);
  }

  public hasExample(form: AlchemyFormName): boolean {
    // strip_background is the only form without an example entry
    return form !== 'strip_background';
  }

  public isUpscalerForm(form: AlchemyFormName): boolean {
    return this.upscalerForms.includes(form);
  }

  public toggleSlowWorkers(): void {
    this.slowWorkers.update((v) => !v);
  }

  public submit(): void {
    const source = this.sourceImage();
    const forms = [...this.selectedForms()];
    if (!source || forms.length === 0 || this.isSubmitting()) {
      return;
    }

    const apiKey = this.auth.getStoredApiKey() ?? ANONYMOUS_API_KEY;
    const request: InterrogationRequest = {
      forms: forms.map((name) => ({ name })),
      source_image: source,
      slow_workers: this.slowWorkers(),
    };

    this.isSubmitting.set(true);
    this.aiHorde
      .submitInterrogation(apiKey, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => {
        this.isSubmitting.set(false);
        if (!response) {
          this.toast.error('alchemy.submit.error', { transloco: true });
          return;
        }
        this.addJob(response.id, forms);
        this.toast.success('alchemy.submit.success', { transloco: true });
      });
  }

  /**
   * The connector link between the builder and the results below it. Used
   * both for the static "results will appear below" hint and, once jobs
   * exist, the live "jump to results" affordance.
   */
  public scrollToResultsSection(event?: Event): void {
    event?.preventDefault();
    this.focusElementById('alchemy-results');
  }

  public cancelJob(id: string): void {
    this.aiHorde
      .cancelInterrogation(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => {
        if (status === GENERATION_NOT_FOUND) {
          this.updateJob(id, { notFound: true, cancelled: true });
          return;
        }
        this.updateJob(id, {
          cancelled: true,
          status: status ?? undefined,
        });
      });
  }

  /** A job is worth archiving once any form has produced a result. */
  public jobHasResults(job: AlchemyJob): boolean {
    return (job.status?.forms ?? []).some(
      (form) => form.state === 'done' && form.result,
    );
  }

  public async downloadJobResults(job: AlchemyJob): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const status = job.status;
    if (!status || this.downloadingJobId() !== null) return;

    this.downloadingJobId.set(job.id);
    try {
      const { bytes, imageCount, failedImages } = await buildAlchemyJobArchive(
        job.id,
        status,
      );
      this.triggerZipDownload(bytes, `alchemy-${job.id}.zip`);

      if (imageCount === 0 && failedImages > 0) {
        this.toast.error('alchemy.jobs.download_images_failed', {
          transloco: true,
        });
      } else if (failedImages > 0) {
        this.toast.warning('alchemy.jobs.download_partial', {
          transloco: true,
        });
      }
    } catch {
      this.toast.error('alchemy.jobs.download_error', { transloco: true });
    } finally {
      this.downloadingJobId.set(null);
    }
  }

  private triggerZipDownload(bytes: Uint8Array, fileName: string): void {
    const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = fileName;
    globalThis.document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  public isJobExpanded(id: string): boolean {
    return this.expandedJobs().has(id);
  }

  public toggleJob(id: string): void {
    this.expandedJobs.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  public expandAllJobs(): void {
    this.expandedJobs.set(new Set(this.jobs().map((j) => j.id)));
  }

  public collapseAllJobs(): void {
    this.expandedJobs.set(new Set());
  }

  /** Enter/leave select mode, dropping any marks when leaving. */
  public toggleSelectMode(): void {
    const next = !this.selectMode();
    this.selectMode.set(next);
    if (!next) {
      this.selectedJobIds.set(new Set());
    }
  }

  public isJobSelected(id: string): boolean {
    return this.selectedJobIds().has(id);
  }

  public toggleJobSelected(id: string): void {
    this.selectedJobIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  /** Open the confirmation dialog for a specific set of tracked jobs. */
  public requestDeleteJobs(ids: readonly string[]): void {
    const filtered = ids.filter((id) => id.length > 0);
    if (filtered.length > 0) {
      this.pendingDelete.set(filtered);
    }
  }

  public requestDeleteSelected(): void {
    this.requestDeleteJobs([...this.selectedJobIds()]);
  }

  public cancelDelete(): void {
    this.pendingDelete.set([]);
  }

  /** Close the confirm dialog only when its backdrop (not the panel) is clicked. */
  public onConfirmBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancelDelete();
    }
  }

  /** Stop tracking the confirmed jobs, then leave select mode. */
  public confirmDelete(): void {
    const ids = new Set(this.pendingDelete());
    this.pendingDelete.set([]);
    if (ids.size === 0) {
      return;
    }
    this.jobs.update((jobs) => jobs.filter((job) => !ids.has(job.id)));
    this.expandedJobs.update((current) => {
      const next = new Set(current);
      for (const id of ids) {
        next.delete(id);
      }
      return next;
    });
    this.selectedJobIds.set(new Set());
    this.selectMode.set(false);
  }

  public toggleAutoOpen(): void {
    this.autoOpenResults.update((v) => !v);
  }

  /**
   * The form chips shown on a collapsed job's summary line: the first few
   * operations, plus an overflow count so the rest are accounted for without
   * wrapping the row.
   */
  public jobFormChips(job: AlchemyJob): {
    shown: AlchemyFormName[];
    extra: number;
  } {
    const shown = job.forms.slice(0, AlchemyComponent.SUMMARY_CHIP_LIMIT);
    return { shown, extra: job.forms.length - shown.length };
  }

  /** Relative age of a job for its summary line, as a transloco key + count. */
  public jobAge(job: AlchemyJob): { key: string; count: number } {
    const minutes = Math.floor((Date.now() - job.firstSeenAt) / 60_000);
    if (minutes < 1) return { key: 'alchemy.jobs.time_now', count: 0 };
    if (minutes < 60) return { key: 'alchemy.jobs.time_min', count: minutes };
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return { key: 'alchemy.jobs.time_hr', count: hours };
    return { key: 'alchemy.jobs.time_day', count: Math.floor(hours / 24) };
  }

  public formsProgressLabel(job: AlchemyJob): string {
    const total = job.forms.length;
    const completed = (job.status?.forms ?? []).filter(
      (f) => f.state === 'done',
    ).length;
    return `${completed}/${total}`;
  }

  /**
   * Per-form status rows. Seeded from the requested forms so every operation
   * shows (as `waiting`) the instant a job is tracked, then each row advances
   * independently as the status poll reports it.
   */
  public jobFormRows(
    job: AlchemyJob,
  ): { form: AlchemyFormName; state: string }[] {
    const states = new Map(
      (job.status?.forms ?? []).map((f) => [f.form, f.state]),
    );
    return job.forms.map((form) => ({
      form,
      state: states.get(form) ?? 'waiting',
    }));
  }

  public formStatusView(state: string): FormStatusView {
    return FORM_STATUS_VIEWS[state] ?? FORM_STATUS_VIEWS['waiting'];
  }

  /**
   * The job's overall state, as an i18n key plus a colour modifier for its
   * pill: faulted → done (settled) → processing (any form started) → waiting.
   */
  public jobStateView(job: AlchemyJob): { key: string; modifier: string } {
    if (job.faulted || job.status?.state === 'faulted') {
      return { key: 'alchemy.state.faulted', modifier: 'faulted' };
    }
    if (this.isJobSettled(job)) {
      return { key: 'alchemy.state.done', modifier: 'done' };
    }
    const forms = job.status?.forms ?? [];
    const started = forms.some(
      (f) => f.state === 'processing' || f.state === 'done',
    );
    return started
      ? { key: 'alchemy.state.processing', modifier: 'processing' }
      : { key: 'alchemy.state.waiting', modifier: 'waiting' };
  }

  private static readonly TERMINAL_FORM_STATES = new Set([
    'done',
    'cancelled',
    'faulted',
  ]);

  public isJobSettled(job: AlchemyJob): boolean {
    if (job.notFound || job.cancelled) return true;
    const status = job.status;
    if (!status) return false;
    if (status.state === 'faulted') return true;
    // The overall state can report `done` while a slower form (e.g.
    // interrogation) is still processing, so keep polling until every form has
    // reached a terminal state and its result is in hand.
    if (status.state === 'done') {
      return (status.forms ?? []).every((f) =>
        AlchemyComponent.TERMINAL_FORM_STATES.has(f.state),
      );
    }
    return false;
  }

  private addJob(id: string, forms: AlchemyFormName[]): void {
    if (this.jobs().some((j) => j.id === id)) return;
    this.jobs.update((jobs) => [
      {
        id,
        forms,
        status: null,
        done: false,
        faulted: false,
        cancelled: false,
        notFound: false,
        firstSeenAt: Date.now(),
      },
      ...jobs,
    ]);
    // Auto-open keeps the newest request open and folds the rest away so the
    // list never grows past a screen; otherwise the new card joins collapsed.
    if (this.autoOpenResults()) {
      this.expandedJobs.set(new Set([id]));
    }

    // Carry the user straight to their new job instead of leaving the result
    // to appear off-screen: the card pulses briefly and scroll/focus follow.
    this.justAddedJobId.set(id);
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        if (this.justAddedJobId() === id) this.justAddedJobId.set(null);
      }, 2500);
    }
    this.focusElementById(`alchemy-job-${id}`);
  }

  /**
   * Scrolls an element into view and moves accessibility focus to it. Runs on
   * a macrotask so the DOM node exists after the triggering signal update has
   * rendered, and respects the reduced-motion preference for the scroll.
   */
  private focusElementById(id: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => {
      const el = globalThis.document.getElementById(id);
      if (!el) return;
      const reduceMotion = globalThis.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      el.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
      el.focus({ preventScroll: true });
    }, 0);
  }

  private updateJob(id: string, update: Partial<AlchemyJob>): void {
    this.jobs.update((jobs) =>
      jobs.map((j) => (j.id === id ? { ...j, ...update } : j)),
    );
  }

  private pollJobs(): void {
    const pending = this.jobs().filter((j) => !this.isJobSettled(j));
    for (const job of pending) {
      this.aiHorde
        .getAlchemyStatus(job.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((status) => {
          if (status === GENERATION_NOT_FOUND) {
            this.updateJob(job.id, { notFound: true });
            return;
          }
          if (!status) return;
          this.updateJob(job.id, {
            status,
            done: status.state === 'done',
            faulted: status.state === 'faulted',
          });
        });
    }
  }

  private startPolling(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.ngZone.runOutsideAngular(() => {
      this.pollTimer = setInterval(() => {
        this.ngZone.run(() => {
          this.pruneStaleJobs();
          this.pollJobs();
        });
      }, AlchemyComponent.POLL_MS);
    });

    this.destroyRef.onDestroy(() => {
      if (this.pollTimer != null) {
        clearInterval(this.pollTimer);
      }
    });
  }

  /** Within its freshness window, a job is worth keeping and re-polling. */
  private isJobFresh(job: AlchemyJob): boolean {
    return (
      typeof job.firstSeenAt === 'number' &&
      Date.now() - job.firstSeenAt < AlchemyComponent.FRESH_TTL_MS
    );
  }

  private pruneStaleJobs(): void {
    this.jobs.update((jobs) => {
      const fresh = jobs.filter((job) => this.isJobFresh(job));
      return fresh.length === jobs.length ? jobs : fresh;
    });
  }

  /**
   * Best-effort rehydration of recent submissions across a reload. Stored jobs
   * carry their last-known status, so completed results render immediately and
   * still-running ones resume polling. Stale jobs are dropped on the way in.
   */
  private restoreJobs(): void {
    const stored = this.loadJobs();
    this.restored = true;
    if (stored.length === 0) return;

    this.jobs.set(stored);
    if (this.autoOpenResults()) {
      this.expandedJobs.set(new Set([stored[0].id]));
    }
  }

  private loadJobs(): AlchemyJob[] {
    if (!isPlatformBrowser(this.platformId)) return [];
    try {
      const raw = localStorage.getItem(AlchemyComponent.STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return (parsed as AlchemyJob[]).filter((job) => this.isJobFresh(job));
    } catch {
      return [];
    }
  }

  private persistJobs(jobs: AlchemyJob[]): void {
    if (!this.restored || !isPlatformBrowser(this.platformId)) return;
    try {
      const fresh = jobs.filter((job) => this.isJobFresh(job));
      if (fresh.length === 0) {
        localStorage.removeItem(AlchemyComponent.STORAGE_KEY);
        return;
      }
      localStorage.setItem(AlchemyComponent.STORAGE_KEY, JSON.stringify(fresh));
    } catch {
      // Storage may be full or unavailable; tracking across reloads is a
      // best-effort nicety, never a correctness requirement.
    }
  }
}
