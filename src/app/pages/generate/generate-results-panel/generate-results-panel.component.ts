import { DOCS_IMAGE, DOCS_IMAGE_SETTINGS } from '../../../content/docs-links';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  DecimalPipe,
  NgTemplateOutlet,
  isPlatformBrowser,
} from '@angular/common';
import { ImageGenerationRequest } from '../../../types/generation';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { InfoTooltipComponent } from '../../../components/info-tooltip/info-tooltip.component';
import { GenerationQueueService } from '../../../services/generation-queue.service';
import { ToastService } from '../../../services/toast.service';
import { DatabaseService } from '../../../services/database.service';
import { LocalGenerationJob } from '../../../types/generation-job';
import {
  StoredJobImage,
  StoredJobImageMetadata,
  sessionStatsToday,
} from '../../../types/generation-job';
import { Router, RouterLink } from '@angular/router';
import { StudioHandoffService } from '../../../services/studio-handoff.service';
import { buildJobImageArchive, extensionFor } from '../generate-archive';
import { copyToClipboard } from '../../../helper/copy-to-clipboard';
import { requestWithoutSeed, studioLinkAddress } from '../studio-link';
import { embedWebpExifInBlob } from '../../../helper/webp-exif';
import {
  ImageMetaError,
  ImageMetaProvenance,
  buildImageMetadataExport,
  buildImageProvenance,
  buildParametersText,
  deriveImageMeta,
  imageErrorFieldKey,
  imageErrorReasonKey,
  kudosDiverged,
} from '../image-metadata';
import {
  ImageMetaPanelComponent,
  ImageQuickAction,
  MetaApplyEvent,
  MetaApplyMode,
} from '../image-meta-panel/image-meta-panel.component';
import {
  GenerateFormValue,
  splitCombinedPrompt,
  workerRequirementForRequest,
} from '../generate-form.model';
import {
  WorkerPoolService,
  evaluateWorkerFeasibility,
  type WorkerFeasibility,
} from '../../../services/worker-pool.service';
import {
  GenerationWaitInsight,
  GenerationWaitInsightsService,
} from '../../../services/generation-wait-insights.service';
import {
  parseStyleRecordKey,
  storedStyleKey,
} from '../../../services/style-record';
import { GenerateLearnPanelComponent } from '../generate-learn-panel/generate-learn-panel.component';
import { GsTutorialParkedComponent } from '../../../components/gs-tutorial-parked/gs-tutorial-parked.component';
import { GsWorldPickerComponent } from '../../../components/gs-world-picker/gs-world-picker.component';
import { GsParamEntryComponent } from '../../../components/gs-param-entry/gs-param-entry.component';
import { GsSettingChipComponent } from '../../../components/gs-setting-chip/gs-setting-chip.component';
import { GsHelpDockService } from '../../../services/gs-help-dock.service';
import { GsSheetComponent } from '../../../components/gs-sheet/gs-sheet.component';
import { EdgeAwarePopoverDirective } from '../../../directives/edge-aware-popover.directive';
import { FullscreenService } from '../../../services/fullscreen.service';
import {
  TutorialEngineService,
  TutorialLevel,
  canonicalFlowId,
} from '../../../services/tutorial-engine.service';
import { isConceptFlow } from '../../../content/flows';
import {
  JsonModalHighlight,
  StudioJsonModalComponent,
} from '../studio-json-modal/studio-json-modal.component';

/** How a batch of result tiles may be ordered. */
type ResultSortMode = 'default' | 'aesthetic';

/** Selectable columns-per-row values for the results grid. */
const PER_ROW_OPTIONS = [2, 3, 4, 5, 6] as const;
const PER_ROW_KEY = 'aihorde.generate.results.perRow';
const DEFAULT_PER_ROW = 4;
const SHOW_PROMPTS_KEY = 'aihorde.generate.show_prompts';
const SHOW_QUICK_ACTIONS_KEY = 'aihorde.generate.show_quick_actions';
const META_PINNED_KEY = 'aihorde.generate.meta_pinned';
/** Set once the welcome card has been answered, dismissed or otherwise. */
const WELCOMED_KEY = 'aihorde.generate.learn.welcomed';

/**
 * Narrowest tile the grid will render. A per-row preference chosen on a wide
 * window would otherwise produce unusable slivers when the studio is narrow
 * (the flip menu cannot fit, the status tiles cram), so the column count is
 * clamped to whatever keeps tiles at least this wide.
 */
const MIN_TILE_PX = 140;
/** Tile width below which the tile chrome drops to its most compact form. */
const COMPACT_TILE_PX = 168;
/** Must track the `gap` on `.gs-tile-grid`, for the tile-width arithmetic. */
const GRID_GAP_PX = 16;

/** How far a finger has to travel across the viewer before it counts as a swipe. */
const SWIPE_THRESHOLD_PX = 40;
/** Movement above this is a drag, so the click that follows is not a tap. */
const DRAG_SLOP_PX = 10;
/** How long a soft-deleted batch can be restored before it is really removed. */
const UNDO_WINDOW_MS = 6000;
/** How long the done-count has to settle before the a11y announcement fires. */
const ANNOUNCE_DEBOUNCE_MS = 600;

interface JobThumbnail {
  imageId: string;
  /** Object URL for the stored result blob; revoked on destroy or delete. */
  url: string;
  mimeType: string;
  metadata?: StoredJobImageMetadata;
}

/** One of the ways in offered by the first-visit welcome card. */
export interface WelcomeDoor {
  /** Suffix of the door's `generate.welcome.*` keys, and of nothing else. */
  id: string;
  /** The Learn level taking this door settles on. */
  level: TutorialLevel;
  /** The tutorial to start, or null to leave the reader in a bare studio. */
  flowId: string | null;
}

/** An open per-tile actions menu, anchored at viewport coordinates. */
interface TileMenuState {
  tile: ResultTile;
  x: number;
  y: number;
}

/** One cell of the results tile grid, derived from the queue's jobs. */
interface ResultTile {
  key: string;
  kind:
    | 'done'
    | 'finished-pending'
    | 'claimed'
    | 'queued'
    | 'error'
    | 'censored'
    | 'cancelled';
  jobLocalId: string;
  /** CSS `aspect-ratio` value (e.g. `1024/1024`) so tiles match the request. */
  aspect: string;
  /** Human dimensions badge (e.g. `1024×1024`), or '' when unknown. */
  dims: string;
  url?: string;
  mimeType?: string;
  seed?: string;
  model?: string;
  imageIndex?: number;
  thumb?: JobThumbnail;
  queuePosition?: number;
  waitTime?: number;
  /**
   * Whether the horde says anyone can serve this request. False is not a
   * failure: the job waits, so the tile says so rather than looking stuck.
   */
  isPossible?: boolean;
  eligibleWorkers?: number;
  eligibleWorkerThreads?: number;
  restartedCount?: number;
  insight?: GenerationWaitInsight;
  /**
   * How many workers could generate this job, and which of its settings shut them
   * out, run against the request it was submitted with. Null when the worker
   * list is unknown, and the tile then says nothing about it.
   */
  feasibility?: WorkerFeasibility | null;
  errorMessage?: string;
  /** Translation key for a failure the studio named itself. */
  errorKey?: string;
  /** Worker censored/flagged the image (drives the NSFW marker + blur). */
  nsfw?: boolean;
  /** Why it was censored, when known ('nsfw' | 'csam'). */
  censorReason?: string | null;
  /** LAION aesthetic score (0-10) when a worker reported one. */
  aesthetic?: number | null;
  /** Per-field failures (lora/ti/source download or parse errors). */
  errors?: ImageMetaError[];
  /** Full metadata record for the raw JSON view + Download All sidecar. */
  metaExport?: Record<string, unknown>;
  /** Everything the worker reported, as read-only rows for the metadata panel. */
  provenance?: ImageMetaProvenance;
  /** The positive prompt, shown (expandable) atop every tile. */
  prompt?: string;
  /** The job's stored request, for viewing/loading its settings. */
  request?: ImageGenerationRequest;
  /**
   * The request the metadata panel reads and applies from. Same as `request`
   * except that a randomised seed is replaced by the one the horde actually
   * returned, so applying the seed row reproduces this image.
   */
  applyRequest?: ImageGenerationRequest;
  /** Which Retry attempt produced this job (0/undefined = original). */
  retryCount?: number;
  /** The style this generation was submitted with, as it was named then. */
  styleName?: string;
  /** That style's source-qualified key, which is what the filter groups by. */
  styleKey?: string;
}

type PendingTileKind = 'finished-pending' | 'claimed' | 'queued';

/** Keep a racing count response useful without ever drawing more than requested. */
function pendingTileKinds(job: LocalGenerationJob): PendingTileKind[] {
  const count = Math.max(1, job.request.params?.n ?? 1);
  const hasCounts =
    job.finishedCount !== undefined ||
    job.processingCount !== undefined ||
    job.waitingCount !== undefined;
  if (!hasCounts) {
    return Array.from({ length: count }, () =>
      job.status === 'processing' ? 'claimed' : 'queued',
    );
  }

  const kinds: PendingTileKind[] = [];
  const append = (kind: PendingTileKind, requested: number | undefined) => {
    const amount = Math.min(
      Math.max(0, Math.trunc(requested ?? 0)),
      count - kinds.length,
    );
    kinds.push(...Array.from({ length: amount }, () => kind));
  };
  append('finished-pending', job.finishedCount);
  append('claimed', job.processingCount);
  append('queued', job.waitingCount);
  append(job.status === 'processing' ? 'claimed' : 'queued', count);
  return kinds;
}

/**
 * A job's style key. Jobs recorded before styles carried a source hold only the
 * preset name they were submitted with, which is what a bare key still means.
 */
function styleKeyOf(job: {
  styleKey?: string;
  styleName?: string;
}): string | undefined {
  if (job.styleKey) {
    return job.styleKey;
  }
  return job.styleName ? storedStyleKey(job.styleName) : undefined;
}

/** A key's own value, for a job whose style name was never recorded. */
function styleNameOfKey(key: string): string {
  return parseStyleRecordKey(key)?.value ?? key;
}

/**
 * The request to expose for metadata display and selective apply. A request that
 * let the horde randomise its seed still produced a concrete one, so the
 * returned seed is folded in; anything else is passed through untouched.
 */
function requestForApply(
  request: ImageGenerationRequest,
  seed: string | undefined,
): ImageGenerationRequest {
  if (!seed || request.params?.seed) {
    return request;
  }
  return { ...request, params: { ...request.params, seed } };
}

/**
 * Re-encode an image blob as PNG by way of a canvas. Clipboard implementations
 * only reliably accept PNG, and horde results are webp.
 */
async function toPngBlob(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context unavailable');
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!png) {
    throw new Error('PNG encoding failed');
  }
  return png;
}

/** The positive half of a combined `positive ### negative` prompt. */
function positivePrompt(prompt: string): string {
  return splitCombinedPrompt(prompt)[0];
}

/**
 * Renders the queue's jobs as a single "studio" tile grid: in-flight jobs show
 * generating/queued placeholder tiles, finished jobs show their result images,
 * and failed/cancelled jobs show a compact status tile with retry/delete. All
 * result thumbnails are object URLs over stored blobs and are revoked when the
 * panel is destroyed or a job is deleted.
 */
@Component({
  selector: 'app-generate-results-panel',
  imports: [
    DecimalPipe,
    NgTemplateOutlet,
    TranslocoPipe,
    IconComponent,
    InfoTooltipComponent,
    ImageMetaPanelComponent,
    StudioJsonModalComponent,
    GenerateLearnPanelComponent,
    GsTutorialParkedComponent,
    GsWorldPickerComponent,
    GsParamEntryComponent,
    GsSettingChipComponent,
    GsSheetComponent,
    EdgeAwarePopoverDirective,
    RouterLink,
  ],
  templateUrl: './generate-results-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'onDocumentEscape()',
    '(window:resize)': 'closeTileMenu()',
  },
})
export class GenerateResultsPanelComponent {
  private readonly queue = inject(GenerationQueueService);
  private readonly toast = inject(ToastService);
  private readonly db = inject(DatabaseService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly handoff = inject(StudioHandoffService);
  private readonly router = inject(Router);
  private readonly tutorial = inject(TutorialEngineService);
  private readonly helpDock = inject(GsHelpDockService);
  private readonly workerPool = inject(WorkerPoolService);
  private readonly waitInsights = inject(GenerationWaitInsightsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  public readonly fullscreen = inject(FullscreenService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  public readonly perRowOptions = PER_ROW_OPTIONS;

  /**
   * The form as it stands, so the metadata panel can mark the rows a replace
   * would actually change. Null (the default) turns the markers off.
   */
  public readonly formValue = input<GenerateFormValue | null>(null);

  /** Ask the parent to attach one stored result as the form's source image. */
  public readonly useAsSource = output<{ localId: string; imageId: string }>();

  /** Ask the parent to put a prompt in the form (the empty state's starters). */
  public readonly usePrompt = output<string>();

  /**
   * Whether the empty state (and with it the starter prompts) is shown: only
   * while the grid is genuinely empty, since once anything exists the user has
   * their own prompts to reuse.
   */
  public readonly showStarters = computed(() => this.tiles().length === 0);

  /**
   * Ids of the curated example prompts offered while nothing has been generated.
   * Each has a `.label` (the chip) and a `.prompt` (what the form receives) under
   * `generate.results.starters`.
   */
  public readonly starterPrompts: readonly string[] = [
    'landscape',
    'character',
    'texture',
    'pixel',
  ];

  /** Where the panel's way into the settings reference points. */
  public readonly referenceLink = DOCS_IMAGE_SETTINGS;
  /** The way into the documentation from the first-visit card. */
  public readonly docsLink = DOCS_IMAGE;

  /**
   * The setting whose reference entry has the pane, or null. It is gated above
   * the follow-along tutorial rather than beside it: a reader mid-tutorial who
   * asks what a field is has asked for the entry, and the steps are still there
   * when they close it.
   */
  public readonly helpDockTopic = this.helpDock.topic;
  public readonly helpDockOpen = this.helpDock.isOpen;

  /** Whether the follow-along tutorial has the pane instead of the results. */
  public readonly tutorialOpen = this.tutorial.active;
  /** The tutorial's own header, while it has the pane. */
  public readonly tutorialTaskKey = computed(() => {
    const flowId = this.tutorial.activeFlowId();
    if (!flowId) {
      return '';
    }
    return isConceptFlow(flowId)
      ? `generate.learn.flows.${flowId}.task_name`
      : `generate.tutorials.flows.${canonicalFlowId(flowId)}.task_name`;
  });
  public readonly tutorialTechnique = computed(
    () => this.tutorial.flow()?.title ?? null,
  );
  public readonly tutorialStep = computed(() => this.tutorial.stepIndex() + 1);
  public readonly tutorialTotal = this.tutorial.total;
  /** A concept track is not drawn in a world, so it offers no switch. */
  public readonly tutorialHasWorlds = computed(() => {
    const flowId = this.tutorial.activeFlowId();
    return flowId !== null && !isConceptFlow(flowId);
  });

  public leaveTutorial(): void {
    this.tutorial.pause();
  }
  /** The tutorial's parting note, shown over the results it just made room for. */
  public readonly tutorialCompleted = this.tutorial.completed;
  /** The technique the finished tutorial hands on to, offered on the card. */
  public readonly nextTutorial = this.tutorial.nextFlow;
  public readonly finishedTutorial = this.tutorial.finishedFlowId;
  public readonly finishedTutorialRelated = this.tutorial.finishedFlowRelated;

  public startNextTutorial(flowId: string): void {
    this.tutorial.dismissCompletion();
    void this.tutorial.start(flowId);
  }

  /**
   * The ways in offered to a reader who has not been here before. The first
   * door runs the txt2img walkthrough, which makes an image by working the
   * panel; the second starts the migrating track, since a reader comfortable
   * with this has almost always generated somewhere else and needs their
   * vocabulary mapped rather than image generation taught, and it hands over to
   * that same walkthrough at the end. Pointing a door at another track is this
   * list's `flowId` and nothing else.
   */
  public readonly welcomeDoors: readonly WelcomeDoor[] = [
    { id: 'door1', level: 'new_to_this', flowId: 'txt2img' },
    { id: 'door2', level: 'comfortable', flowId: 'concepts_migrating' },
    { id: 'door3', level: 'expert', flowId: null },
  ];

  /** Whether the welcome card has been answered, in this visit or an earlier one. */
  private readonly welcomed = signal<boolean>(
    this.db.get(WELCOMED_KEY) === true,
  );

  /**
   * Whether the welcome card stands in for the empty state. Browser-only: the
   * flag lives in local storage, which a server render cannot read, and showing
   * a first-visit card to a reader who answered it long ago is worse than having
   * it arrive with hydration.
   */
  public readonly showWelcome = computed(
    () =>
      this.isBrowser &&
      !this.welcomed() &&
      this.showStarters() &&
      !this.helpDockOpen() &&
      !this.tutorialOpen() &&
      // A parked tutorial's way back is the offer this pane makes; three more
      // doors beside it would be two starts competing for one reader.
      !this.tutorial.parked(),
  );

  /** Ask the parent to write a selection of one image's parameters to the form. */
  public readonly applyMeta = output<{
    request: ImageGenerationRequest;
    localId: string;
    keys: (keyof GenerateFormValue)[];
    mode: MetaApplyEvent['mode'];
  }>();

  /**
   * Ask the parent to write one image's whole request to the form. `seed` is
   * the seed to hold the form at, and null lets the horde pick a fresh one:
   * that single difference is what separates a variation of this image from a
   * second try at the same settings.
   */
  public readonly loadSettings = output<{
    request: ImageGenerationRequest;
    localId: string;
    seed: string | null;
  }>();

  public readonly pendingJobs = this.queue.pendingJobs;
  public readonly finishedJobs = this.queue.finishedJobs;

  /** Jobs a worker is actively rendering (as opposed to queued/waiting). */
  public readonly generatingCount = computed(
    () =>
      this.pendingJobs().filter((job) => job.status === 'processing').length,
  );
  /** Jobs submitted or waiting but not yet being rendered. */
  public readonly queuedCount = computed(
    () => this.pendingJobs().length - this.generatingCount(),
  );
  public readonly doneCount = computed(
    () => this.finishedJobs().filter((job) => job.status === 'done').length,
  );
  public readonly isBusy = computed(() => this.pendingJobs().length > 0);
  public readonly hasAnyJobs = computed(
    () => this.pendingJobs().length > 0 || this.finishedJobs().length > 0,
  );
  /** Whether any finished job has downloadable result images. */
  public readonly hasDownloadableResults = computed(() =>
    this.finishedJobs().some(
      (job) => job.status === 'done' && job.resultImageIds.length > 0,
    ),
  );

  private readonly thumbnails = signal<Map<string, JobThumbnail[]>>(new Map());

  /** The open per-tile actions menu (kebab click / right-click), or null. */
  public readonly tileMenu = signal<TileMenuState | null>(null);

  /** Jobs whose thumbnails have been (or are being) loaded, to avoid re-fetching. */
  private readonly loaded = new Set<string>();

  /** At least one finished job exists, so a select/delete pass is meaningful. */
  public readonly hasFinished = computed(() => this.finishedJobs().length > 0);

  /**
   * Select-to-delete state. Deletion used to be a single hover-revealed button
   * on every tile — trivial to hit by accident (and, on touch, an invisible
   * tap target sitting over the image). Instead the user enters a select mode,
   * marks jobs, then deletes them. Selection is tracked at the job level (a
   * job's whole batch of tiles is removed together).
   */
  public readonly selectMode = signal(false);
  public readonly selectedJobs = signal<ReadonlySet<string>>(new Set());
  public readonly selectedCount = computed(() => this.selectedJobs().size);

  /**
   * Jobs soft-deleted and awaiting the Undo window: gone from the grid, still on
   * disk. See {@link requestDelete}.
   */
  private readonly hiddenJobs = signal<ReadonlySet<string>>(new Set());
  private undoTimer: ReturnType<typeof setTimeout> | null = null;
  private undoToastId: string | null = null;

  // --- View controls -------------------------------------------------------

  /** Grid density (columns per row), persisted so it sticks across sessions. */
  public readonly imagesPerRow = signal<number>(this.loadPerRow());

  /** Measured width of the tile grid; 0 until a ResizeObserver reports one. */
  public readonly gridWidth = signal(0);
  private readonly tileGrid = viewChild<ElementRef<HTMLElement>>('tileGrid');
  private gridObserver: ResizeObserver | null = null;

  /**
   * Columns actually rendered: the stored preference, reduced to what fits at
   * {@link MIN_TILE_PX}. The preference itself is untouched, so widening the
   * window restores it.
   */
  public readonly effectiveColumns = computed(() => {
    const preferred = this.imagesPerRow();
    const width = this.gridWidth();
    if (width <= 0) {
      return preferred;
    }
    const fits = Math.floor(
      (width + GRID_GAP_PX) / (MIN_TILE_PX + GRID_GAP_PX),
    );
    return Math.min(preferred, Math.max(1, fits));
  });
  public readonly gridColumns = computed(
    () => `repeat(${this.effectiveColumns()}, minmax(0, 1fr))`,
  );
  /** Rendered width of one tile, or 0 while the grid is unmeasured. */
  public readonly tileWidth = computed(() => {
    const width = this.gridWidth();
    if (width <= 0) {
      return 0;
    }
    const columns = this.effectiveColumns();
    return (width - GRID_GAP_PX * (columns - 1)) / columns;
  });
  /**
   * The rendered tile width as a CSS length for `--gs-tile-w`, or null while the
   * grid is unmeasured so the stylesheet's own fallback applies.
   */
  public readonly tileWidthVar = computed<string | null>(() => {
    const width = this.tileWidth();
    return width > 0 ? `${Math.round(width)}px` : null;
  });

  /** Tiles are too small for full chrome: labels and icons step aside. */
  public readonly compactTiles = computed(() => {
    const width = this.tileWidth();
    return width > 0 && width < COMPACT_TILE_PX;
  });

  /**
   * Superimpose a clamped prompt scrim on every finished tile. On by default:
   * a grid of images with no prompts is hard to place. Persisted, since whether
   * prompts help or clutter is a lasting per-user preference.
   */
  public readonly showPrompts = signal<boolean>(
    this.db.get(SHOW_PROMPTS_KEY) !== false,
  );

  /**
   * Put the next-move buttons on every finished tile. Off by default: they
   * cover part of the picture, and the same three moves stay reachable from
   * the tile's own menu. Persisted, and only offered where the tile carries
   * them: from 1024px up, where the flip machinery stands down.
   */
  public readonly showQuickActions = signal<boolean>(
    this.db.get(SHOW_QUICK_ACTIONS_KEY) === true,
  );

  /** Keep the metadata panel open across viewer navigation. Persisted. */
  public readonly metaPinned = signal<boolean>(
    this.db.get(META_PINNED_KEY) === true,
  );

  /** Reveal NSFW/flagged images globally; individual tiles can also be revealed. */
  public readonly showNsfw = signal(false);
  private readonly revealedNsfw = signal<ReadonlySet<string>>(new Set());

  public readonly sortMode = signal<ResultSortMode>('default');
  /** Show only finished images that came back with a reported error. */
  public readonly errorsOnly = signal(false);

  /** Whether the metadata panel is showing. */
  public readonly metaOpen = signal(false);
  /** Which tile the panel describes while the viewer is closed. */
  private readonly metaKey = signal<string | null>(null);
  /** Which apply mode the panel opens on; "Load settings" forces `replace`. */
  public readonly metaMode = signal<MetaApplyMode>('replace');
  /** The raw JSON view, only reachable from inside the metadata panel. */
  public readonly metaJsonOpen = signal(false);

  /**
   * The flipped mobile tile, or null. Only one tile is flipped at a time: two
   * open menus in a three-across grid is unreadable, and the back face covers
   * the image it belongs to.
   */
  public readonly flippedTile = signal<string | null>(null);

  /** Tile keys whose prompt header is expanded to its full text. */
  private readonly openPrompts = signal<ReadonlySet<string>>(new Set());

  /**
   * The flattened tile grid: pending jobs first (each expanded to its batch of
   * placeholder tiles), then finished jobs (done images, or a single status tile
   * for error/cancelled), so the grid reads top-to-bottom newest-work-first.
   */
  public readonly tiles = computed<ResultTile[]>(() => {
    const tiles: ResultTile[] = [];
    const hidden = this.hiddenJobs();
    const workers = this.workerPool.workers();
    for (const job of this.pendingJobs()) {
      if (hidden.has(job.localId)) {
        continue;
      }
      const { dims, aspect } = this.geometryOf(job);
      const prompt = positivePrompt(job.request.prompt);
      const requirement = workerRequirementForRequest(job.request);
      // Asked once per job rather than once per placeholder tile: a batch of
      // eight shares one request and therefore one answer.
      const feasibility = evaluateWorkerFeasibility(workers, requirement);
      const insight = this.waitInsights.forJob(job, requirement, feasibility);
      const kinds = pendingTileKinds(job);
      for (let i = 0; i < kinds.length; i++) {
        tiles.push({
          key: `${job.localId}-p${i}`,
          kind: kinds[i],
          jobLocalId: job.localId,
          aspect,
          dims,
          queuePosition: job.queuePosition,
          waitTime: job.waitTime,
          isPossible: job.isPossible,
          eligibleWorkers: job.eligibleWorkers,
          eligibleWorkerThreads: job.eligibleWorkerThreads,
          restartedCount: job.restartedCount,
          insight,
          feasibility,
          prompt,
          request: job.request,
          applyRequest: job.request,
          retryCount: job.retryCount,
          styleName: job.styleName,
          styleKey: styleKeyOf(job),
        });
      }
    }
    const thumbnails = this.thumbnails();
    for (const job of this.finishedJobs()) {
      if (hidden.has(job.localId)) {
        continue;
      }
      const { dims, aspect } = this.geometryOf(job);
      const prompt = positivePrompt(job.request.prompt);
      if (job.status === 'done') {
        const thumbs = thumbnails.get(job.localId) ?? [];
        thumbs.forEach((thumb, index) => {
          const derived = deriveImageMeta(thumb.metadata, job.request);
          tiles.push({
            key: `${job.localId}-${thumb.imageId}`,
            kind: 'done',
            jobLocalId: job.localId,
            aspect,
            dims,
            url: thumb.url,
            mimeType: thumb.mimeType,
            seed: thumb.metadata?.seed,
            model: thumb.metadata?.model,
            imageIndex: index,
            thumb,
            nsfw: derived.nsfw,
            censorReason: derived.censorReason,
            aesthetic: derived.aesthetic,
            errors: derived.errors,
            metaExport: buildImageMetadataExport(
              thumb.imageId,
              thumb.metadata,
              job.request,
              derived,
            ),
            provenance: buildImageProvenance(
              thumb.metadata,
              derived,
              job.styleName ?? null,
              { quoted: job.quotedKudos ?? null, charged: job.kudos ?? null },
            ),
            prompt,
            request: job.request,
            applyRequest: requestForApply(job.request, thumb.metadata?.seed),
            retryCount: job.retryCount,
            styleName: job.styleName,
            styleKey: styleKeyOf(job),
          });
        });
        for (let index = 0; index < (job.csamCensoredCount ?? 0); index++) {
          tiles.push({
            key: `${job.localId}-csam-${index}`,
            kind: 'censored',
            jobLocalId: job.localId,
            aspect,
            dims,
            prompt,
            request: job.request,
            applyRequest: job.request,
            retryCount: job.retryCount,
            styleName: job.styleName,
            styleKey: styleKeyOf(job),
          });
        }
      } else if (job.status === 'error') {
        tiles.push({
          key: `${job.localId}-error`,
          kind: 'error',
          jobLocalId: job.localId,
          aspect,
          dims,
          errorMessage: job.errorMessage,
          errorKey: job.errorKey,
          metaExport: { request: job.request },
          prompt,
          request: job.request,
          applyRequest: job.request,
          retryCount: job.retryCount,
          styleName: job.styleName,
          styleKey: styleKeyOf(job),
        });
      } else {
        tiles.push({
          key: `${job.localId}-cancelled`,
          kind: 'cancelled',
          jobLocalId: job.localId,
          aspect,
          dims,
          metaExport: { request: job.request },
          prompt,
          request: job.request,
          applyRequest: job.request,
          retryCount: job.retryCount,
          styleName: job.styleName,
          styleKey: styleKeyOf(job),
        });
      }
    }
    return tiles;
  });

  /** Whether any finished image reported an aesthetic score / error / NSFW flag. */
  public readonly hasAesthetic = computed(() =>
    this.tiles().some((tile) => tile.aesthetic != null),
  );
  public readonly hasErrors = computed(() =>
    this.tiles().some(
      (tile) =>
        tile.kind === 'error' ||
        tile.kind === 'censored' ||
        (tile.errors?.length ?? 0) > 0,
    ),
  );
  public readonly hasNsfw = computed(() =>
    this.tiles().some((tile) => tile.nsfw === true),
  );

  /**
   * The styles represented among the current tiles, with how many tiles each
   * accounts for. Only styles actually on screen are offered, so the filter can
   * never select an empty result.
   */
  public readonly styleOptions = computed<
    { key: string; name: string; count: number }[]
  >(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const tile of this.tiles()) {
      if (!tile.styleKey) {
        continue;
      }
      const existing = counts.get(tile.styleKey);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(tile.styleKey, {
          name: tile.styleName ?? styleNameOfKey(tile.styleKey),
          count: 1,
        });
      }
    }
    return [...counts.entries()]
      .map(([key, entry]) => ({ key, ...entry }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  /** The selected style filter; '' means every style (and styleless jobs). */
  public readonly styleFilter = signal('');

  /**
   * The tiles actually rendered, after applying the error filter and aesthetic
   * sort. Pending/status tiles keep their leading position; only finished images
   * are reordered when sorting by score.
   */
  public readonly visibleTiles = computed<ResultTile[]>(() => {
    let list = this.tiles();
    const style = this.styleFilter();
    if (style) {
      list = list.filter((tile) => tile.styleKey === style);
    }
    if (this.errorsOnly()) {
      list = list.filter(
        (tile) =>
          tile.kind === 'error' ||
          tile.kind === 'censored' ||
          (tile.kind === 'done' && (tile.errors?.length ?? 0) > 0),
      );
    }
    if (this.sortMode() === 'aesthetic') {
      const done = list.filter((tile) => tile.kind === 'done');
      const rest = list.filter((tile) => tile.kind !== 'done');
      done.sort((a, b) => (b.aesthetic ?? -1) - (a.aesthetic ?? -1));
      list = [...rest, ...done];
    }
    return list;
  });

  /** True when a filter has hidden every tile that would otherwise show. */
  public readonly filteredOut = computed(
    () => this.tiles().length > 0 && this.visibleTiles().length === 0,
  );

  // --- Full-screen viewer --------------------------------------------------

  /** The key of the finished tile the viewer is showing, or null when closed. */
  public readonly viewerKey = signal<string | null>(null);
  /**
   * The viewer's navigation set: the finished images in the order the grid shows
   * them, so prev/next follow the active sort and filter rather than the raw
   * job order.
   */
  public readonly viewerTiles = computed<ResultTile[]>(() =>
    this.visibleTiles().filter((tile) => tile.kind === 'done'),
  );
  public readonly viewerCount = computed(() => this.viewerTiles().length);
  public readonly viewerIndex = computed(() => {
    const key = this.viewerKey();
    return key === null
      ? -1
      : this.viewerTiles().findIndex((tile) => tile.key === key);
  });
  public readonly viewerTile = computed<ResultTile | null>(
    () => this.viewerTiles()[this.viewerIndex()] ?? null,
  );

  private readonly viewerPanel =
    viewChild<ElementRef<HTMLElement>>('viewerPanel');
  /** The enlarged image itself, which is what goes on the whole screen. */
  private readonly viewerImg =
    viewChild<ElementRef<HTMLImageElement>>('viewerImg');
  private readonly viewerMoreBtn =
    viewChild<ElementRef<HTMLButtonElement>>('viewerMoreBtn');
  private readonly viewerMoreRef =
    viewChild<ElementRef<HTMLElement>>('viewerMoreRef');
  /**
   * Whether the viewer's remaining actions are showing. Everything that cannot
   * carry its own word across the action row at this width lives in this one
   * list, drawn as a popover beside its button where there is room and as the
   * studio's bottom sheet where there is not.
   */
  public readonly viewerMoreOpen = signal(false);
  /**
   * Whether the studio is drawing its narrow layout. The action list needs to
   * know which of its two presentations exists, and the picture takes the whole
   * viewport, so this is a question about the screen rather than about the pane.
   */
  public readonly viewerNarrow = signal(false);
  /**
   * Whether the picture, rather than the studio, is the thing on the whole
   * screen. One target serves the whole studio, so the viewer borrows it and
   * hands it back; this says whether the borrow is outstanding.
   */
  private readonly fullscreenBorrowed = signal(false);
  private readonly viewerDeletePanel =
    viewChild<ElementRef<HTMLElement>>('viewerDeletePanel');
  private readonly viewerDeleteCancel =
    viewChild<ElementRef<HTMLButtonElement>>('viewerDeleteCancel');
  /** The job awaiting explicit confirmation from the full-screen viewer. */
  public readonly viewerDeletePending = signal<string | null>(null);
  /** The element focus returns to when the viewer closes. */
  private previousActiveElement: HTMLElement | null = null;
  /** The viewer control focus returns to when its delete dialog is cancelled. */
  private viewerDeleteReturnFocus: HTMLElement | null = null;
  private viewerKeydown: ((event: KeyboardEvent) => void) | null = null;
  /** Where a viewer drag started, for the swipe-to-navigate gesture. */
  private swipeOriginX: number | null = null;
  /** Whether the last pointer sequence dragged, so a swipe is not a click. */
  private swipeDragged = false;
  /** Whether that sequence came from a finger/pen (mouse drags never navigate). */
  private swipeIsTouch = false;

  /**
   * The tile the metadata panel describes. Inside the viewer it is always the
   * image on screen, so a pinned panel simply follows prev/next; outside it is
   * whichever tile opened it, re-read from the grid so a refreshed tile object
   * (new thumbnail, new metadata) is picked up.
   */
  public readonly metaTile = computed<ResultTile | null>(() => {
    if (!this.metaOpen()) {
      return null;
    }
    if (this.viewerKey() !== null) {
      return this.viewerTile();
    }
    const key = this.metaKey();
    return this.visibleTiles().find((tile) => tile.key === key) ?? null;
  });

  /** Readable highlight rows for the open metadata modal (above the raw JSON). */
  public readonly metaHighlights = computed<JsonModalHighlight[]>(() => {
    const tile = this.metaTile();
    if (!tile) {
      return [];
    }
    const t = (key: string, params?: Record<string, unknown>): string =>
      this.transloco.translate(key, params);
    const rows: JsonModalHighlight[] = [];
    if (tile.aesthetic != null) {
      rows.push({
        label: t('generate.results.meta_aesthetic'),
        value: tile.aesthetic.toFixed(2),
        tone: 'good',
      });
    }
    if (tile.nsfw) {
      const csam = tile.censorReason === 'csam';
      rows.push({
        label: t('generate.results.meta_nsfw'),
        value: tile.censorReason
          ? t('generate.results.censor_' + tile.censorReason)
          : t('generate.results.meta_flagged'),
        tone: csam ? 'danger' : 'warn',
      });
      if (csam) {
        rows.push({
          label: t('generate.results.censor_csam_details'),
          value: t('generate.results.censor_csam_explanation'),
          tone: 'default',
        });
      }
    }
    // The price, quoted against charged, so the raw JSON is not the only place
    // the two can be compared.
    const kudos = tile.provenance?.kudos;
    if (kudos?.quoted != null && kudos.charged != null) {
      const diverged = kudosDiverged(kudos);
      rows.push({
        label: t('generate.results.meta_kudos'),
        value: t(
          diverged
            ? 'generate.results.meta_kudos_diverged'
            : 'generate.results.meta_kudos_both',
          {
            quoted: Math.round(kudos.quoted),
            charged: Math.round(kudos.charged),
          },
        ),
        tone: diverged ? 'warn' : undefined,
      });
    }
    for (const error of tile.errors ?? []) {
      rows.push({
        label: t(imageErrorFieldKey(error.type)),
        value: t(imageErrorReasonKey(error.value)),
        tone: 'danger',
      });
    }
    return rows;
  });

  /**
   * What today came to: pictures back, kudos spent, and the mean wait. Read off
   * the job history the studio already holds, so it costs no request.
   */
  public readonly sessionStats = computed(() =>
    sessionStatsToday(this.queue.jobs(), Date.now()),
  );

  /** Whether the day's tally is expanded. Closed on arrival; it is a footnote. */
  public readonly statsOpen = signal(false);

  /**
   * The placeholder whose status is being explained, or null. Batch members
   * share the analysis while only the card the reader opened changes face.
   */
  public readonly waitWhyFor = signal<string | null>(null);
  private waitOpener: HTMLElement | null = null;
  private waitBackFocusTimer: ReturnType<typeof setTimeout> | null = null;
  private stopWorkerMonitoring: (() => void) | null = null;

  public toggleWaitWhy(tileKey: string, opener?: EventTarget | null): void {
    if (this.waitWhyFor() === tileKey) {
      this.closeWaitWhy();
      return;
    }
    this.waitOpener = opener instanceof HTMLElement ? opener : null;
    this.waitWhyFor.set(tileKey);
    this.waitBackFocusTimer = setTimeout(() => {
      this.waitBackFocusTimer = null;
      this.host.nativeElement
        .querySelector<HTMLElement>(`[data-wait-close="${tileKey}"]`)
        ?.focus();
    }, 0);
  }

  public closeWaitWhy(): void {
    if (this.waitWhyFor() === null) {
      return;
    }
    if (this.waitBackFocusTimer !== null) {
      clearTimeout(this.waitBackFocusTimer);
      this.waitBackFocusTimer = null;
    }
    this.waitWhyFor.set(null);
    const opener = this.waitOpener;
    this.waitOpener = null;
    queueMicrotask(() => opener?.focus());
  }

  public waitReasonKey(tile: ResultTile): string {
    switch (tile.insight?.reason) {
      case 'refreshing':
        return 'generate.results.wait_reason_refreshing';
      case 'no-route-model':
        return 'generate.results.wait_reason_no_route_model';
      case 'no-route-size':
        return 'generate.results.wait_reason_no_route_size';
      case 'no-route-pending':
        return 'generate.results.wait_reason_no_route_pending';
      case 'no-route':
        return 'generate.results.wait_reason_no_route';
      case 'pressure':
        return 'generate.results.wait_reason_pressure';
      case 'model-change':
        return 'generate.results.wait_reason_model_change';
      case 'size-change':
        return 'generate.results.wait_reason_size_change';
      case 'limited':
        return 'generate.results.wait_reason_limited';
      case 'supported':
        return 'generate.results.wait_reason_supported';
      default:
        return 'generate.results.wait_reason_unknown';
    }
  }

  public queueTrendKey(tile: ResultTile): string {
    switch (tile.insight?.trend) {
      case 'mixed':
        return 'generate.results.queue_trend_mixed';
      case 'improved':
        return 'generate.results.queue_trend_improved';
      case 'worsened':
        return 'generate.results.queue_trend_worsened';
      default:
        return 'generate.results.queue_trend_steady';
    }
  }

  public waitMinutes(seconds: number): number {
    return Math.max(1, Math.round(seconds / 60));
  }

  constructor() {
    this.watchViewport();

    effect(() => {
      const needsWorkerSnapshots = this.pendingJobs().some(
        (job) =>
          (job.waitingCount ?? (job.status === 'processing' ? 0 : 1)) > 0,
      );
      if (needsWorkerSnapshots && this.stopWorkerMonitoring === null) {
        this.stopWorkerMonitoring = this.workerPool.startMonitoring();
      } else if (!needsWorkerSnapshots && this.stopWorkerMonitoring !== null) {
        this.stopWorkerMonitoring();
        this.stopWorkerMonitoring = null;
      }
    });

    effect(() => {
      for (const job of this.finishedJobs()) {
        if (job.status === 'done' && !this.loaded.has(job.localId)) {
          this.loaded.add(job.localId);
          void this.loadThumbnails(job.localId);
        }
      }
    });
    // The grid element comes and goes with the empty/filtered states, so the
    // observer is re-pointed whenever it appears rather than attached once.
    effect(() => {
      const grid = this.tileGrid()?.nativeElement ?? null;
      this.observeGrid(grid);
    });
    // A soft delete the user walked away from still means "delete".
    effect(() => this.announceReady(this.readyImageCount()));
    this.destroyRef.onDestroy(() => {
      void this.commitPendingDelete();
      this.revokeAll();
      this.detachViewerKeys();
      this.gridObserver?.disconnect();
      this.clearAnnounceTimer();
      if (this.waitBackFocusTimer !== null) {
        clearTimeout(this.waitBackFocusTimer);
      }
      this.stopWorkerMonitoring?.();
      this.stopWorkerMonitoring = null;
    });
  }

  private observeGrid(grid: HTMLElement | null): void {
    this.gridObserver?.disconnect();
    if (!grid || typeof ResizeObserver === 'undefined') {
      return;
    }
    this.gridObserver ??= new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      this.gridWidth.set(width);
    });
    this.gridWidth.set(grid.clientWidth);
    this.gridObserver.observe(grid);
  }

  private geometryOf(job: LocalGenerationJob): {
    dims: string;
    aspect: string;
  } {
    const width = job.request.params?.width ?? 0;
    const height = job.request.params?.height ?? 0;
    if (width > 0 && height > 0) {
      return { dims: `${width}×${height}`, aspect: `${width}/${height}` };
    }
    return { dims: '', aspect: '1/1' };
  }

  public async cancelJob(localId: string): Promise<void> {
    await this.queue.cancel(localId);
  }

  public async retryJob(localId: string): Promise<void> {
    await this.queue.retry(localId);
    // The retry re-enqueues a fresh job (with its own copies of any source
    // images), so the errored placeholder is removed rather than left behind.
    await this.deleteJob(localId);
    this.toast.success('generate.results.retried', { transloco: true });
  }

  public isPromptOpen(tile: ResultTile): boolean {
    return this.openPrompts().has(tile.key);
  }

  public togglePrompt(tile: ResultTile): void {
    this.openPrompts.update((current) => {
      const next = new Set(current);
      if (next.has(tile.key)) {
        next.delete(tile.key);
      } else {
        next.add(tile.key);
      }
      return next;
    });
  }

  public async deleteJob(localId: string): Promise<void> {
    this.revokeJob(localId);
    this.loaded.delete(localId);
    await this.queue.deleteJob(localId);
  }

  /** Enter/leave select mode, clearing any marks when leaving. */
  public toggleSelectMode(): void {
    const next = !this.selectMode();
    this.selectMode.set(next);
    // A flipped tile has no selection affordance on its back face, so entering
    // select mode always returns every tile to its image.
    this.flippedTile.set(null);
    if (!next) {
      this.selectedJobs.set(new Set());
    }
  }

  public isSelected(localId: string): boolean {
    return this.selectedJobs().has(localId);
  }

  public toggleSelected(localId: string): void {
    this.selectedJobs.update((current) => {
      const next = new Set(current);
      if (next.has(localId)) {
        next.delete(localId);
      } else {
        next.add(localId);
      }
      return next;
    });
  }

  /**
   * Delete a set of jobs the reversible way: they leave the grid at once and the
   * records stay put behind an Undo toast. Nothing is actually removed until the
   * offer lapses (or another delete starts), which is what makes a confirmation
   * dialog unnecessary — the recovery is the affordance.
   */
  public requestDelete(localIds: readonly string[]): void {
    const ids = localIds.filter((id) => id.length > 0);
    if (ids.length === 0) {
      return;
    }
    // Only one Undo can be outstanding, so a new delete settles the previous one.
    void this.commitPendingDelete();
    this.stepViewerPastDeleted(ids);
    this.hiddenJobs.set(new Set(ids));
    this.selectedJobs.set(new Set());
    this.selectMode.set(false);
    this.flippedTile.set(null);
    // A panel opened from the grid described a tile that is now gone; one opened
    // in the viewer follows the image the viewer advanced to.
    if (this.viewerKey() === null) {
      this.closeMeta();
    }
    this.undoToastId = this.toast.success('generate.results.deleted_undo', {
      transloco: true,
      messageParams: { count: ids.length },
      autoDismissMs: UNDO_WINDOW_MS,
      action: {
        label: 'generate.results.undo',
        run: () => this.undoDelete(),
      },
    });
    this.undoTimer = setTimeout(
      () => void this.commitPendingDelete(),
      UNDO_WINDOW_MS,
    );
  }

  public requestDeleteSelected(): void {
    this.requestDelete([...this.selectedJobs()]);
  }

  /** Ask for explicit confirmation before deleting from the immersive viewer. */
  public requestViewerDelete(localId: string): void {
    if (!localId) {
      return;
    }
    this.viewerDeleteReturnFocus =
      typeof document !== 'undefined' &&
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    this.viewerDeletePending.set(localId);
    // Render the alert dialog before moving focus into its safest action.
    setTimeout(() => this.viewerDeleteCancel()?.nativeElement.focus(), 0);
  }

  public cancelViewerDelete(): void {
    if (this.viewerDeletePending() === null) {
      return;
    }
    this.viewerDeletePending.set(null);
    const returnFocus = this.viewerDeleteReturnFocus;
    this.viewerDeleteReturnFocus = null;
    setTimeout(() => returnFocus?.focus(), 0);
  }

  public confirmViewerDelete(): void {
    const localId = this.viewerDeletePending();
    if (localId === null) {
      return;
    }
    this.viewerDeletePending.set(null);
    this.viewerDeleteReturnFocus = null;
    this.requestDelete([localId]);
  }

  /** Cancel only when the confirmation backdrop itself was pressed. */
  public onViewerDeleteBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancelViewerDelete();
    }
  }

  /** Whether an Undo is currently on offer (drives the specs and the grid). */
  public readonly undoPending = computed(() => this.hiddenJobs().size > 0);

  /** Put the soft-deleted jobs back exactly as they were. */
  public undoDelete(): void {
    this.clearUndoTimer();
    this.hiddenJobs.set(new Set());
  }

  /** Make the pending deletion real, removing the records for good. */
  public async commitPendingDelete(): Promise<void> {
    const ids = [...this.hiddenJobs()];
    if (ids.length === 0) {
      return;
    }
    this.clearUndoTimer();
    this.hiddenJobs.set(new Set());
    if (this.undoToastId) {
      this.toast.dismiss(this.undoToastId);
      this.undoToastId = null;
    }
    for (const id of ids) {
      await this.deleteJob(id);
    }
  }

  private clearUndoTimer(): void {
    if (this.undoTimer !== null) {
      clearTimeout(this.undoTimer);
      this.undoTimer = null;
    }
  }

  /**
   * Keep an open viewer on a live image: when the image on screen belongs to a
   * job about to be deleted, move to the next surviving one (falling back to the
   * previous), and close the viewer when nothing survives. Runs before the
   * deletion so the pre-delete order is still available to walk.
   */
  private stepViewerPastDeleted(deleted: readonly string[]): void {
    const current = this.viewerTile();
    if (!current || !deleted.includes(current.jobLocalId)) {
      return;
    }
    const tiles = this.viewerTiles();
    const index = this.viewerIndex();
    const survivor = [
      ...tiles.slice(index + 1),
      ...tiles.slice(0, index).reverse(),
    ].find((tile) => !deleted.includes(tile.jobLocalId));
    if (survivor) {
      this.viewerKey.set(survivor.key);
    } else {
      this.closeViewer();
    }
  }

  // --- Viewer --------------------------------------------------------------

  public openViewer(tile: ResultTile): void {
    if (tile.kind !== 'done' || !tile.url) {
      return;
    }
    const wasClosed = this.viewerKey() === null;
    this.viewerKey.set(tile.key);
    this.flippedTile.set(null);
    if (wasClosed) {
      // The pin is an "always show metadata" preference, so honour it on open.
      if (this.metaPinned()) {
        this.metaMode.set('replace');
        this.metaOpen.set(true);
        this.metaJsonOpen.set(false);
      }
      this.attachViewerKeys();
    }
  }

  public closeViewer(): void {
    if (this.viewerKey() === null) {
      return;
    }
    this.viewerDeletePending.set(null);
    this.viewerDeleteReturnFocus = null;
    this.viewerKey.set(null);
    this.viewerMoreOpen.set(false);
    this.releaseFullscreenTarget();
    this.closeMeta();
    this.detachViewerKeys();
    this.previousActiveElement?.focus();
    this.previousActiveElement = null;
  }

  /** Close the viewer only when the press landed on its backdrop. */
  public onViewerBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeViewer();
    }
  }

  // --- The viewer's action list -------------------------------------------

  public toggleViewerMore(): void {
    this.viewerMoreOpen.update((open) => !open);
  }

  public closeViewerMore(): void {
    this.viewerMoreOpen.set(false);
  }

  /**
   * Dismiss the list and put focus back on the button that opened it. Every row
   * uses it, so a keyboard never lands on the document after the list stops
   * existing; a row that then closes the viewer moves focus on again itself.
   */
  public closeViewerMoreAndFocus(): void {
    this.closeViewerMore();
    this.viewerMoreBtn()?.nativeElement.focus();
  }

  /** Whether the picture itself currently has the whole screen. */
  public readonly imageFullscreen = computed(
    () => this.fullscreenBorrowed() && this.fullscreen.active(),
  );

  public viewerFullscreenLabelKey(): string {
    return this.imageFullscreen()
      ? 'generate.shell.fullscreen_exit'
      : 'generate.shell.fullscreen';
  }

  /**
   * Put the picture on the whole screen, or take it off again. The image
   * element goes rather than the viewer around it, so nothing of the studio is
   * left in the corners of the screen the reader asked for the picture on.
   */
  public async viewerFullscreen(): Promise<void> {
    this.closeViewerMore();
    if (this.imageFullscreen()) {
      await this.fullscreen.exit();
      this.releaseFullscreenTarget();
      return;
    }
    const image = this.viewerImg()?.nativeElement;
    if (!image) {
      return;
    }
    this.borrowedFrom = this.fullscreen.target();
    this.fullscreen.setTarget(image);
    this.fullscreenBorrowed.set(true);
    await this.fullscreen.enter();
    // A refused request leaves the page as it was, so the target goes straight
    // back rather than waiting for a viewer the reader never left.
    if (!this.fullscreen.active()) {
      this.releaseFullscreenTarget();
    }
  }

  /** What the whole screen was set to before the viewer borrowed it. */
  private borrowedFrom: HTMLElement | null = null;

  /** Give the whole-screen target back to whoever set it before the viewer. */
  private releaseFullscreenTarget(): void {
    if (!this.fullscreenBorrowed()) {
      return;
    }
    this.fullscreenBorrowed.set(false);
    this.fullscreen.setTarget(this.borrowedFrom);
    this.borrowedFrom = null;
  }

  /**
   * Follow the CSS breakpoint at which the studio stops stacking, so a control
   * the layout has moved is re-drawn where it now lives rather than left stale
   * until some other pass runs.
   */
  private watchViewport(): void {
    const mq = globalThis.matchMedia?.('(max-width: 1023.98px)');
    if (!mq) {
      return;
    }
    this.viewerNarrow.set(mq.matches);
    const onChange = (event: MediaQueryListEvent): void =>
      this.viewerNarrow.set(event.matches);
    mq.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => mq.removeEventListener('change', onChange));
  }

  public viewerNext(): void {
    this.stepViewer(1);
  }

  public viewerPrev(): void {
    this.stepViewer(-1);
  }

  /** Move `delta` images along the visible order, wrapping at both ends. */
  private stepViewer(delta: number): void {
    const tiles = this.viewerTiles();
    if (tiles.length < 2) {
      return;
    }
    const index = this.viewerIndex();
    if (index === -1) {
      return;
    }
    const next = (index + delta + tiles.length) % tiles.length;
    this.viewerKey.set(tiles[next].key);
  }

  public onViewerPointerDown(event: PointerEvent): void {
    this.swipeOriginX = event.clientX;
    this.swipeDragged = false;
    this.swipeIsTouch = event.pointerType !== 'mouse';
  }

  /**
   * Advance the viewer when a touch drag crosses the swipe threshold, and
   * remember whether the pointer moved at all so the click that follows can
   * tell a swipe from a tap on the image.
   */
  public onViewerPointerUp(event: PointerEvent): void {
    const origin = this.swipeOriginX;
    this.swipeOriginX = null;
    if (origin === null) {
      return;
    }
    const delta = event.clientX - origin;
    this.swipeDragged = Math.abs(delta) >= DRAG_SLOP_PX;
    if (this.swipeIsTouch && Math.abs(delta) >= SWIPE_THRESHOLD_PX) {
      this.stepViewer(delta < 0 ? 1 : -1);
    }
  }

  /**
   * Tapping the image closes the viewer, the same way tapping outside it does.
   * A drag that ended on the image was a swipe (or an aborted one), not a tap,
   * so it must not also dismiss what the user was navigating.
   */
  public onViewerImageClick(): void {
    if (this.swipeDragged) {
      this.swipeDragged = false;
      return;
    }
    this.closeViewer();
  }

  private attachViewerKeys(): void {
    if (typeof document === 'undefined') {
      return;
    }
    this.previousActiveElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    this.viewerKeydown = (event: KeyboardEvent) => this.onViewerKeydown(event);
    document.addEventListener('keydown', this.viewerKeydown, true);
    // The panel only exists after the template renders the viewer.
    setTimeout(() => this.viewerPanel()?.nativeElement.focus(), 0);
  }

  private detachViewerKeys(): void {
    if (this.viewerKeydown && typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.viewerKeydown, true);
    }
    this.viewerKeydown = null;
  }

  private onViewerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      // Unwind one layer at a time: delete confirmation, the action list, raw
      // JSON, metadata, then the viewer itself. The sheet answers escape for
      // itself and tells us it is done, so only the popover is ours to close.
      if (this.viewerDeletePending() !== null) {
        this.cancelViewerDelete();
      } else if (this.viewerMoreOpen()) {
        if (!this.viewerNarrow()) {
          this.closeViewerMoreAndFocus();
        }
      } else if (this.metaJsonOpen()) {
        this.metaJsonOpen.set(false);
      } else if (this.metaTile()) {
        this.closeMeta();
      } else {
        this.closeViewer();
      }
      return;
    }
    if (event.key === 'Tab') {
      this.trapViewerFocus(event);
      return;
    }
    if (this.viewerDeletePending() !== null || this.viewerMoreOpen()) {
      return;
    }
    // Arrow navigation belongs to the images, not to the metadata panel's form
    // controls, so it is only live while the panel is closed.
    if (this.metaTile()) {
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.viewerNext();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.viewerPrev();
    }
  }

  /** Keep Tab inside the viewer (including its metadata panel). */
  private trapViewerFocus(event: KeyboardEvent): void {
    const panel =
      this.viewerDeletePanel()?.nativeElement ??
      this.viewerPanel()?.nativeElement;
    if (!panel) {
      return;
    }
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // --- Mobile tile flip ----------------------------------------------------

  public isFlipped(tile: ResultTile): boolean {
    return this.flippedTile() === tile.key;
  }

  public flipTile(tile: ResultTile): void {
    this.flippedTile.set(tile.key);
  }

  public unflip(): void {
    this.flippedTile.set(null);
  }

  /**
   * Save one result. The stored blob is fetched rather than the tile's own
   * object URL because the settings are written into the file's EXIF on the way
   * out, and that needs the bytes; an image whose EXIF cannot be written is
   * saved unchanged.
   */
  public async downloadTile(tile: ResultTile): Promise<void> {
    if (!tile.thumb) {
      return;
    }
    const extension = extensionFor(tile.thumb.mimeType);
    const stem = tile.seed ? `seed-${tile.seed}` : tile.thumb.imageId;
    const filename = `${(tile.imageIndex ?? 0) + 1}-${stem}.${extension}`;
    const blob = await this.resultBlob(tile);
    if (!blob) {
      this.triggerDownload(tile.thumb.url, filename, false);
      return;
    }
    const embedded = await embedWebpExifInBlob(
      blob,
      buildParametersText(
        tile.applyRequest ?? tile.request,
        tile.thumb.metadata,
      ),
    );
    const url = URL.createObjectURL(embedded);
    this.triggerDownload(url, filename, true);
  }

  /** Copy a tile's seed to the clipboard for reuse in a later request. */
  public async copySeed(tile: ResultTile): Promise<void> {
    if (
      !tile.seed ||
      typeof navigator === 'undefined' ||
      !navigator.clipboard
    ) {
      return;
    }
    try {
      await navigator.clipboard.writeText(tile.seed);
      this.toast.success('generate.results.seed_copied', { transloco: true });
    } catch {
      // Clipboard access can be denied; a failed copy is not worth a hard error.
    }
  }

  /**
   * An address that reopens the studio on this picture: the settings it was
   * made with, and the seed the horde returned, so the same picture comes back.
   */
  public async copyImageLink(tile: ResultTile): Promise<void> {
    await this.copyStudioLink(tile.applyRequest ?? tile.request, tile);
  }

  /** The same address with the seed let go, so the settings make a new picture. */
  public async copySettingsLink(tile: ResultTile): Promise<void> {
    const request = tile.applyRequest ?? tile.request;
    await this.copyStudioLink(
      request ? requestWithoutSeed(request) : undefined,
      tile,
    );
  }

  private async copyStudioLink(
    request: ImageGenerationRequest | undefined,
    tile: ResultTile,
  ): Promise<void> {
    this.closeTileMenu();
    this.unflip();
    if (!request) {
      return;
    }
    const address = studioLinkAddress(
      this.router,
      request,
      tile.styleKey ?? null,
    );
    if (address === null) {
      this.toast.error('generate.link.too_large', { transloco: true });
      return;
    }
    if (await copyToClipboard(address)) {
      this.toast.success('generate.link.copied', { transloco: true });
    }
  }

  /** The metadata panel's three actions, on the image the panel is showing. */
  public onQuickAction(action: ImageQuickAction, tile: ResultTile): void {
    if (action === 'variation') {
      this.makeVariation(tile);
    } else if (action === 'source') {
      this.reuseAsSource(tile);
    } else {
      this.copySettings(tile);
    }
  }

  /**
   * Carry this image's settings with its own seed held, so the next request
   * lands next door to it rather than somewhere else entirely.
   */
  public makeVariation(tile: ResultTile): void {
    this.loadOwnSettings(tile, tile.seed ?? null);
  }

  /** The same settings with the seed let go, so the horde picks a new picture. */
  public copySettings(tile: ResultTile): void {
    this.loadOwnSettings(tile, null);
  }

  private loadOwnSettings(tile: ResultTile, seed: string | null): void {
    const request = tile.applyRequest ?? tile.request;
    if (!request) {
      return;
    }
    this.loadSettings.emit({ request, localId: tile.jobLocalId, seed });
    this.closeMeta();
    this.closeViewer();
    this.closeTileMenu();
    this.unflip();
  }

  /**
   * Hand a result to the form's source-image section. The blob lives in the
   * image store, and the source section belongs to the parent page, so the
   * parent does the attaching; this only says which image.
   */
  public reuseAsSource(tile: ResultTile): void {
    if (!tile.thumb) {
      return;
    }
    this.useAsSource.emit({
      localId: tile.jobLocalId,
      imageId: tile.thumb.imageId,
    });
    this.closeViewer();
    this.unflip();
  }

  /** Whether this browser can put an image on the clipboard at all. */
  public readonly canCopyImage =
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof ClipboardItem !== 'undefined';

  /** Whether the platform offers a native share sheet for files. */
  public readonly canShareImage =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  /**
   * Copy the image itself to the clipboard. Results are webp, which no major
   * clipboard accepts, so the bitmap is re-encoded as PNG through a canvas
   * first — the one format `ClipboardItem` is reliably allowed to carry.
   */
  public async copyImage(tile: ResultTile): Promise<void> {
    if (!this.canCopyImage) {
      return;
    }
    try {
      const blob = await this.resultBlob(tile);
      if (!blob) {
        return;
      }
      const png = await toPngBlob(blob);
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': png }),
      ]);
      this.toast.success('generate.results.image_copied', { transloco: true });
    } catch {
      this.toast.error('generate.results.image_copy_failed', {
        transloco: true,
      });
    }
  }

  /** Offer the image to the platform's share sheet. */
  public async shareImage(tile: ResultTile): Promise<void> {
    if (!this.canShareImage) {
      return;
    }
    const blob = await this.resultBlob(tile);
    if (!blob) {
      return;
    }
    const extension = extensionFor(blob.type);
    const file = new File(
      [blob],
      `horde-${tile.seed ?? 'image'}.${extension}`,
      {
        type: blob.type || 'image/webp',
      },
    );
    if (!navigator.canShare({ files: [file] })) {
      return;
    }
    try {
      await navigator.share({ files: [file] });
    } catch {
      // A cancelled share sheet is the normal way out; nothing to report.
    }
  }

  /**
   * Send the image to the alchemy tab: park it in the handoff service and
   * navigate, leaving alchemy to pick it up on arrival.
   */
  public async sendToAlchemy(tile: ResultTile): Promise<void> {
    const blob = await this.resultBlob(tile);
    if (!blob) {
      return;
    }
    this.handoff.set({ blob, mimeType: blob.type || 'image/webp' });
    this.closeViewer();
    this.unflip();
    await this.router.navigate(['/generate/alchemy']);
  }

  /** The stored blob behind a result tile, or null when it is not a result. */
  private async resultBlob(tile: ResultTile): Promise<Blob | null> {
    if (!tile.thumb) {
      return null;
    }
    const images = await this.queue.getJobImages(tile.jobLocalId);
    return (
      images.find(
        (image) =>
          image.kind === 'result' && image.imageId === tile.thumb?.imageId,
      )?.blob ?? null
    );
  }

  // --- Per-tile actions menu ----------------------------------------------

  /** Primary tap on a result tile: enter/exit selection, or open the viewer. */
  public activateTile(tile: ResultTile): void {
    if (this.selectMode()) {
      this.toggleSelected(tile.jobLocalId);
    } else {
      this.openViewer(tile);
    }
  }

  /** Open the actions menu from the kebab button. */
  public openTileMenu(tile: ResultTile, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.openTileMenuAt(tile, event.clientX, event.clientY);
  }

  /** Open the actions menu from a right-click / context-menu gesture. */
  public onTileContextMenu(tile: ResultTile, event: MouseEvent): void {
    if (this.selectMode()) {
      return;
    }
    event.preventDefault();
    this.openTileMenuAt(tile, event.clientX, event.clientY);
  }

  private openTileMenuAt(
    tile: ResultTile,
    clientX: number,
    clientY: number,
  ): void {
    // Clamp to the viewport so the menu is never opened partly off-screen.
    const menuW = 214;
    const menuH = 256;
    const vw =
      typeof window !== 'undefined' ? window.innerWidth : clientX + menuW;
    const vh =
      typeof window !== 'undefined' ? window.innerHeight : clientY + menuH;
    const x = Math.max(8, Math.min(clientX, vw - menuW - 8));
    const y = Math.max(8, Math.min(clientY, vh - menuH - 8));
    this.tileMenu.set({ tile, x, y });
  }

  public closeTileMenu(): void {
    this.tileMenu.set(null);
  }

  /** Close the menu when a press lands outside it. */
  public onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target as Element | null;
    // Only the popover is dismissed by a press beside it. The sheet is not a
    // descendant of its trigger, and a list the reader is reading through is not
    // something to take away on the first tap inside it.
    if (this.viewerMoreOpen() && !this.viewerNarrow()) {
      const anchor = this.viewerMoreRef()?.nativeElement;
      if (anchor && target && !anchor.contains(target)) {
        this.closeViewerMore();
      }
    }
    if (!this.tileMenu()) {
      return;
    }
    if (target?.closest('.gs-tile-menu')) {
      return;
    }
    this.closeTileMenu();
  }

  public onDocumentEscape(): void {
    if (this.tileMenu()) {
      this.closeTileMenu();
      return;
    }
    this.closeWaitWhy();
  }

  // --- View controls -------------------------------------------------------

  private loadPerRow(): number {
    const stored = this.db.get(PER_ROW_KEY);
    if (
      typeof stored === 'number' &&
      (PER_ROW_OPTIONS as readonly number[]).includes(stored)
    ) {
      return stored;
    }
    return this.defaultPerRowForViewport();
  }

  /**
   * Column count to seed the grid with when the user has no stored preference.
   * Narrow viewports start with fewer, larger tiles rather than cramped ones;
   * this only affects the first load — any later choice is persisted and wins.
   */
  private defaultPerRowForViewport(): number {
    if (typeof window === 'undefined') {
      return DEFAULT_PER_ROW;
    }
    const width = window.innerWidth;
    if (width < 640) {
      return 2;
    }
    if (width < 1024) {
      return 3;
    }
    return DEFAULT_PER_ROW;
  }

  public setImagesPerRow(count: number): void {
    this.imagesPerRow.set(count);
    this.db.store(PER_ROW_KEY, count);
  }

  public toggleShowNsfw(): void {
    this.showNsfw.update((value) => !value);
  }

  /** Whether a tile should be blurred: NSFW, not globally shown, not revealed. */
  public isNsfwHidden(tile: ResultTile): boolean {
    return (
      tile.nsfw === true &&
      !this.showNsfw() &&
      !this.revealedNsfw().has(tile.key)
    );
  }

  // --- Completion announcement --------------------------------------------

  /** How many finished result images exist right now. */
  private readonly readyImageCount = computed(
    () => this.tiles().filter((tile) => tile.kind === 'done').length,
  );

  /**
   * Politely announced count of newly finished images. Generation finishes while
   * the user is elsewhere on the page (or not looking at all), so completion is
   * announced rather than only drawn.
   */
  public readonly readyAnnouncement = signal('');
  private announcedCount = 0;
  /** Images finished since the last announcement actually went out. */
  private pendingAnnounce = 0;
  /** Restored history must not be announced as if it had just arrived. */
  private announceBaselined = false;
  private announceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Debounced so a batch that lands image by image is announced once, and so a
   * screen reader is not interrupted mid-sentence by the next arrival.
   */
  private announceReady(count: number): void {
    if (!this.announceBaselined) {
      this.announceBaselined = true;
      this.announcedCount = count;
      return;
    }
    if (count <= this.announcedCount) {
      // Deletions and filters lower the count; re-baseline without announcing.
      this.announcedCount = count;
      return;
    }
    this.pendingAnnounce += count - this.announcedCount;
    this.announcedCount = count;
    this.clearAnnounceTimer();
    this.announceTimer = setTimeout(() => {
      this.announceTimer = null;
      const added = this.pendingAnnounce;
      this.pendingAnnounce = 0;
      this.readyAnnouncement.set(
        this.transloco.translate('generate.results.announce_ready', {
          count: added,
        }),
      );
    }, ANNOUNCE_DEBOUNCE_MS);
  }

  private clearAnnounceTimer(): void {
    if (this.announceTimer !== null) {
      clearTimeout(this.announceTimer);
      this.announceTimer = null;
    }
  }

  /** Whether the tile's top-right tag stack has anything in it. */
  public hasTags(tile: ResultTile): boolean {
    return (
      tile.aesthetic != null || tile.nsfw === true || !!tile.errors?.length
    );
  }

  public revealNsfw(tile: ResultTile): void {
    this.revealedNsfw.update((current) => new Set(current).add(tile.key));
  }

  public toggleSort(): void {
    this.sortMode.update((mode) =>
      mode === 'aesthetic' ? 'default' : 'aesthetic',
    );
  }

  public toggleErrorsOnly(): void {
    this.errorsOnly.update((value) => !value);
  }

  /**
   * Take one of the welcome card's doors: settle the Learn level it stands for
   * and start its tutorial, if it has one. Only a door sets a level, so the card
   * can be dismissed without committing the reader to a register they never
   * chose.
   */
  public enterVia(door: WelcomeDoor): void {
    this.tutorial.setLevel(door.level);
    this.dismissWelcome();
    if (door.flowId) {
      void this.tutorial.start(door.flowId);
    }
  }

  /** Put the welcome card away for good, leaving the level as it was. */
  public dismissWelcome(): void {
    this.welcomed.set(true);
    this.db.store(WELCOMED_KEY, true);
  }

  /** Put the reference entry away and give the pane back to the results. */
  public closeHelpDock(): void {
    this.helpDock.close();
  }

  public dismissTutorialNote(): void {
    this.tutorial.dismissCompletion();
  }

  public toggleShowPrompts(): void {
    const next = !this.showPrompts();
    this.showPrompts.set(next);
    this.db.store(SHOW_PROMPTS_KEY, next);
  }

  public toggleShowQuickActions(): void {
    const next = !this.showQuickActions();
    this.showQuickActions.set(next);
    this.db.store(SHOW_QUICK_ACTIONS_KEY, next);
  }

  public openMeta(tile: ResultTile): void {
    this.metaKey.set(tile.key);
    this.metaOpen.set(true);
    this.metaJsonOpen.set(false);
    this.flippedTile.set(null);
  }

  /**
   * "Load settings" is now the metadata panel in replace mode with everything
   * checked (its default state): the same operation as the old confirm dialog,
   * but reviewable and partially undoable before it is applied.
   */
  public openLoadSettings(tile: ResultTile): void {
    this.metaMode.set('replace');
    this.openMeta(tile);
  }

  /** The viewer's Metadata button: toggles the docked/sheet panel. */
  public toggleMeta(tile: ResultTile): void {
    if (this.metaOpen()) {
      this.closeMeta();
    } else {
      this.openMeta(tile);
    }
  }

  public closeMeta(): void {
    this.metaOpen.set(false);
    this.metaJsonOpen.set(false);
  }

  /**
   * Pin/unpin the panel. Pinning is the "always show metadata" preference the
   * viewer honours on open; unpinning takes the panel away again, so the pin
   * doubles as the way back to a bare viewer.
   */
  public toggleMetaPin(): void {
    const next = !this.metaPinned();
    this.metaPinned.set(next);
    this.db.store(META_PINNED_KEY, next);
    if (!next) {
      this.closeMeta();
    }
  }

  /** Close the metadata panel only when the press landed on its backdrop. */
  public onMetaBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeMeta();
    }
  }

  /**
   * Forward the panel's selection to the parent, which owns the form. The panel
   * is deliberately ignorant of the request it describes, so the tile's own
   * (seed-resolved) request rides along.
   */
  public onMetaApply(event: MetaApplyEvent): void {
    const request = this.metaTile()?.applyRequest;
    if (!request) {
      return;
    }
    this.applyMeta.emit({ ...event, request });
    this.closeMeta();
    this.closeViewer();
  }

  /** Filename for a single image's downloaded metadata sidecar. */
  public metaDownloadName(tile: ResultTile | null): string {
    if (!tile) {
      return 'metadata.json';
    }
    const stem = tile.seed
      ? `seed-${tile.seed}`
      : (tile.thumb?.imageId ?? 'image');
    return `metadata-${stem}.json`;
  }

  public async downloadAllFinished(): Promise<void> {
    await this.downloadJobs(
      this.finishedJobs().filter((job) => job.status === 'done'),
      'generations.zip',
    );
  }

  /** Zip up just the marked generations, from select mode. */
  public async downloadSelected(): Promise<void> {
    const selected = this.selectedJobs();
    await this.downloadJobs(
      this.finishedJobs().filter(
        (job) => job.status === 'done' && selected.has(job.localId),
      ),
      'generations-selected.zip',
    );
  }

  /** Whether the current selection contains anything downloadable. */
  public readonly hasSelectedResults = computed(() => {
    const selected = this.selectedJobs();
    return this.finishedJobs().some(
      (job) =>
        job.status === 'done' &&
        job.resultImageIds.length > 0 &&
        selected.has(job.localId),
    );
  });

  private async downloadJobs(
    done: readonly LocalGenerationJob[],
    filename: string,
  ): Promise<void> {
    const images: StoredJobImage[] = [];
    const metaByImageId = new Map<string, string>();
    const parametersByImageId = new Map<string, string>();
    for (const job of done) {
      const jobImages = await this.queue.getJobImages(job.localId);
      const results = jobImages.filter((image) => image.kind === 'result');
      for (const image of results) {
        const derived = deriveImageMeta(image.metadata, job.request);
        const record = buildImageMetadataExport(
          image.imageId,
          image.metadata,
          job.request,
          derived,
          { quoted: job.quotedKudos ?? null, charged: job.kudos ?? null },
        );
        metaByImageId.set(image.imageId, JSON.stringify(record, null, 2));
        parametersByImageId.set(
          image.imageId,
          buildParametersText(
            requestForApply(job.request, image.metadata?.seed),
            image.metadata,
          ),
        );
      }
      images.push(...results);
    }
    if (images.length === 0) {
      return;
    }
    const bytes = await buildJobImageArchive(
      images,
      metaByImageId,
      parametersByImageId,
    );
    const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    this.triggerDownload(url, filename, true);
  }

  private async loadThumbnails(localId: string): Promise<void> {
    const images = await this.queue.getJobImages(localId);
    const thumbs: JobThumbnail[] = images
      .filter((image) => image.kind === 'result')
      .map((image) => ({
        imageId: image.imageId,
        url: URL.createObjectURL(image.blob),
        mimeType: image.mimeType,
        metadata: image.metadata,
      }));
    this.thumbnails.update((map) => new Map(map).set(localId, thumbs));
  }

  private triggerDownload(
    url: string,
    filename: string,
    revoke: boolean,
  ): void {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    if (revoke) {
      // The browser reads the href while it handles the click, so the URL has
      // to outlive the dispatch rather than only the call that started it.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  private revokeJob(localId: string): void {
    for (const thumb of this.thumbnails().get(localId) ?? []) {
      URL.revokeObjectURL(thumb.url);
    }
    this.thumbnails.update((map) => {
      const next = new Map(map);
      next.delete(localId);
      return next;
    });
  }

  private revokeAll(): void {
    for (const thumbs of this.thumbnails().values()) {
      for (const thumb of thumbs) {
        URL.revokeObjectURL(thumb.url);
      }
    }
  }
}
