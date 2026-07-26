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
  viewChild,
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
import { DatabaseService } from '../../services/database.service';
import { NetworkStatusService } from '../../services/network-status.service';
import { ToastService } from '../../services/toast.service';
import { TranslatorService } from '../../services/translator.service';
import { setPageTitle } from '../../helper/page-title';
import {
  ALCHEMY_DATA_FORMS,
  ALCHEMY_POST_PROCESSOR_FORMS,
  AlchemyFormName,
  GENERATION_NOT_FOUND,
  InterrogationRequest,
} from '../../types/generation';
import { AlchemyImageInputComponent } from '../../components/alchemy/alchemy-image-input/alchemy-image-input.component';
import { StudioHandoffService } from '../../services/studio-handoff.service';
import { AlchemyResultsBrowserComponent } from '../../components/alchemy/alchemy-results-browser/alchemy-results-browser.component';
import { IconComponent } from '../../components/icon/icon.component';
import { buildAlchemyJobArchive } from '../../helper/alchemy-archive';
import { AlchemyJob, isJobSettled } from '../../helper/alchemy-job-view';
import { toRenderableImageSource } from '../../helper/generation-image';
import {
  base64ByteLength,
  sourceToThumbnailDataUrl,
} from '../../helper/image-encoding';
import { PanelSize, cyclePanelSize } from '../generate/generate-form.model';

const ANONYMOUS_API_KEY = '0000000000';

/** Gallery density (columns per row), persisted so it sticks across sessions. */
const GALLERY_PER_ROW_OPTIONS = [2, 3, 4, 5, 6] as const;
const GALLERY_PER_ROW_KEY = 'aihorde.alchemy.gallery.perRow';
const GALLERY_DEFAULT_PER_ROW = 4;

/** Results presentation (thumb rail + detail, or tiled gallery), persisted. */
const VIEW_MODE_OPTIONS = ['detail', 'gallery'] as const;
const VIEW_MODE_KEY = 'aihorde.alchemy.view';
const VIEW_MODE_DEFAULT: AlchemyViewMode = 'detail';

type AlchemyViewMode = (typeof VIEW_MODE_OPTIONS)[number];

/**
 * A thumbnail larger than this (bytes) is dropped from the persisted payload
 * (kept in memory for the session only) so a pathological source can't grow the
 * jobs blob toward the localStorage quota. A 256px webp is normally ~8-25 KB.
 */
const MAX_PERSISTED_THUMB_BYTES = 40_000;

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

@Component({
  selector: 'app-alchemy',
  imports: [
    TranslocoPipe,
    DecimalPipe,
    NgTemplateOutlet,
    RouterLink,
    AlchemyImageInputComponent,
    AlchemyResultsBrowserComponent,
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
  private readonly db = inject(DatabaseService);
  private readonly handoff = inject(StudioHandoffService);

  /** The source picker, so an image handed over from /generate can be applied. */
  private readonly imageInput = viewChild(AlchemyImageInputComponent);

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

  /**
   * The operation whose info modal is open, or null. On mobile there is no
   * hover and the description dock is off-screen, so each operation row's (i)
   * button opens its description + example here instead.
   */
  public readonly infoForm = signal<AlchemyFormName | null>(null);

  public openInfo(form: AlchemyFormName, event: Event): void {
    // The (i) lives inside the operation's <label>; stop the click from also
    // toggling that operation's checkbox.
    event.preventDefault();
    event.stopPropagation();
    this.infoForm.set(form);
  }

  public closeInfo(): void {
    this.infoForm.set(null);
  }

  /** Close the info modal only when its backdrop (not the panel) is clicked. */
  public onInfoBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeInfo();
    }
  }

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

  /**
   * The job whose results are shown in the detail region. Distinct from
   * `selectedJobIds` below (the delete set): this is a single "which job am I
   * looking at", that one is "which jobs are marked for removal".
   */
  public readonly selectedJobId = signal<string | null>(null);
  public readonly selectedJob = computed(
    () => this.jobs().find((j) => j.id === this.selectedJobId()) ?? null,
  );

  /**
   * How the results pane presents jobs: `detail` is the source-thumbnail rail
   * (vertical desktop / sticky carousel mobile) beside the selected job's
   * results; `gallery` is a full-pane tile grid of every request. Persisted
   * across sessions.
   */
  public readonly viewMode = signal<AlchemyViewMode>(this.loadViewMode());

  /** Gallery density (columns per row), persisted across sessions. */
  public readonly galleryPerRowOptions = GALLERY_PER_ROW_OPTIONS;
  public readonly galleryColumns = signal<number>(this.loadGalleryColumns());
  public readonly galleryGridColumns = computed(
    () => `repeat(${this.galleryColumns()}, minmax(0, 1fr))`,
  );

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
    () => this.jobs().filter((j) => !isJobSettled(j)).length,
  );

  public readonly hasAnyJobs = computed(() => this.jobs().length > 0);

  /**
   * True below the studio's tablet breakpoint. Drives the responsive split
   * between the desktop rail beside a detail pane and the mobile sticky carousel
   * above an inline detail block. Kept in sync with a media query.
   */
  public readonly isNarrow = signal(false);

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
      this.watchViewport();
      void this.consumeHandoff();
    });
  }

  /** Track the narrow-viewport breakpoint (matches the CSS mobile breakpoint)
      so signal-driven trimming stays in sync as the window is resized. */
  private watchViewport(): void {
    const mq = globalThis.matchMedia?.('(max-width: 1023.98px)');
    if (!mq) return;
    this.isNarrow.set(mq.matches);
    const onChange = (event: MediaQueryListEvent): void =>
      this.isNarrow.set(event.matches);
    mq.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => mq.removeEventListener('change', onChange));
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

  /**
   * Pick up an image sent here from the image studio, if one is waiting. It is
   * consumed unconditionally so a later visit never re-applies a stale image.
   */
  private async consumeHandoff(): Promise<void> {
    const pending = this.handoff.consume();
    const input = this.imageInput();
    if (!pending || !input) {
      return;
    }
    await input.applyBlob(pending.blob, pending.mimeType);
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
        this.addJob(response.id, forms, toRenderableImageSource(source));
        // Derive the rail/gallery thumbnail off the request thread: the source
        // is already in hand, and a slow canvas encode shouldn't hold up the
        // toast or the job appearing. A URL source resolves synchronously.
        void sourceToThumbnailDataUrl(source).then((thumb) =>
          this.updateJob(response.id, { sourceThumb: thumb }),
        );
        this.toast.success('alchemy.submit.success', { transloco: true });
      });
  }

  /** Rail/carousel/tile activation: show the picked job's results. */
  public selectJob(id: string): void {
    this.selectedJobId.set(id);
    if (this.viewMode() === 'gallery') {
      // The gallery has no results area of its own, so a tile tap has to drop
      // back to the detail view or the pick would appear to do nothing.
      this.setViewMode('detail');
    }
  }

  public setViewMode(mode: AlchemyViewMode): void {
    this.viewMode.set(mode);
    this.db.store(VIEW_MODE_KEY, mode);
  }

  private loadViewMode(): AlchemyViewMode {
    const stored = this.db.get(VIEW_MODE_KEY);
    for (const mode of VIEW_MODE_OPTIONS) {
      if (stored === mode) return mode;
    }
    return VIEW_MODE_DEFAULT;
  }

  public setGalleryColumns(count: number): void {
    const min = GALLERY_PER_ROW_OPTIONS[0];
    const max = GALLERY_PER_ROW_OPTIONS[GALLERY_PER_ROW_OPTIONS.length - 1];
    const clamped = Math.min(max, Math.max(min, count));
    this.galleryColumns.set(clamped);
    this.db.store(GALLERY_PER_ROW_KEY, clamped);
  }

  private loadGalleryColumns(): number {
    const stored = this.db.get(GALLERY_PER_ROW_KEY);
    if (
      typeof stored === 'number' &&
      (GALLERY_PER_ROW_OPTIONS as readonly number[]).includes(stored)
    ) {
      return stored;
    }
    if (typeof window === 'undefined') return GALLERY_DEFAULT_PER_ROW;
    const width = window.innerWidth;
    if (width < 640) return 2;
    if (width < 1024) return 3;
    return GALLERY_DEFAULT_PER_ROW;
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
    this.reconcileSelectedJob();
    this.selectedJobIds.set(new Set());
    this.selectMode.set(false);
  }

  /**
   * Keep `selectedJobId` pointing at a job that still exists: after a delete or
   * prune, fall back to the newest remaining job (or nothing).
   */
  private reconcileSelectedJob(): void {
    const current = this.selectedJobId();
    if (current !== null && this.jobs().some((j) => j.id === current)) return;
    this.selectedJobId.set(this.jobs()[0]?.id ?? null);
  }

  private addJob(
    id: string,
    forms: AlchemyFormName[],
    sourceFull: string,
  ): void {
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
        sourceThumb: null,
        sourceFull,
      },
      ...jobs,
    ]);
    // The newest request becomes the shown one, so its results fill the detail
    // region as they arrive without the user having to pick it.
    this.selectedJobId.set(id);

    this.justAddedJobId.set(id);
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        if (this.justAddedJobId() === id) this.justAddedJobId.set(null);
      }, 2500);
    }
    this.focusElementById(`alchemy-rail-${id}`);
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
    const pending = this.jobs().filter((j) => !isJobSettled(j));
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
    let pruned = false;
    this.jobs.update((jobs) => {
      const fresh = jobs.filter((job) => this.isJobFresh(job));
      if (fresh.length === jobs.length) return jobs;
      pruned = true;
      return fresh;
    });
    if (pruned) this.reconcileSelectedJob();
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
    // Rehydrate onto the newest restored job so its results are shown at once.
    this.selectedJobId.set(stored[0].id);
  }

  private loadJobs(): AlchemyJob[] {
    if (!isPlatformBrowser(this.platformId)) return [];
    try {
      const raw = localStorage.getItem(AlchemyComponent.STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      // Jobs stored before source thumbnails existed lack the field, and
      // `sourceFull` is deliberately never written, so both are normalized here
      // to hold the `string | null` invariant the rail/gallery render against.
      return (parsed as AlchemyJob[])
        .filter((job) => this.isJobFresh(job))
        .map((job) => ({
          ...job,
          sourceThumb: job.sourceThumb ?? null,
          sourceFull: null,
        }));
    } catch {
      return [];
    }
  }

  private persistJobs(jobs: AlchemyJob[]): void {
    if (!this.restored || !isPlatformBrowser(this.platformId)) return;
    try {
      const fresh = jobs
        .filter((job) => this.isJobFresh(job))
        // `sourceFull` is session-only (see `AlchemyJob`): a full-size base64
        // source would blow the storage quota on the first request.
        .map((job) => ({
          ...this.withPersistableThumb(job),
          sourceFull: null,
        }));
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

  /**
   * Drop an oversized base64 thumbnail from the persisted copy (the in-memory
   * job keeps it for the session) so the jobs blob stays small. URL thumbnails
   * are strings of trivial length and always persist.
   */
  private withPersistableThumb(job: AlchemyJob): AlchemyJob {
    const thumb = job.sourceThumb;
    if (
      typeof thumb === 'string' &&
      thumb.startsWith('data:') &&
      base64ByteLength(thumb) > MAX_PERSISTED_THUMB_BYTES
    ) {
      return { ...job, sourceThumb: null };
    }
    return job;
  }
}
