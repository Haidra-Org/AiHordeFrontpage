import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ImageGenerationRequest } from '../../../types/generation';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { GenerationQueueService } from '../../../services/generation-queue.service';
import { ToastService } from '../../../services/toast.service';
import { DatabaseService } from '../../../services/database.service';
import { LocalGenerationJob } from '../../../types/generation-job';
import {
  StoredJobImage,
  StoredJobImageMetadata,
} from '../../../types/generation-job';
import { buildJobImageArchive } from '../generate-archive';
import {
  ImageMetaError,
  ImageMetaProvenance,
  buildImageMetadataExport,
  buildImageProvenance,
  deriveImageMeta,
} from '../image-metadata';
import {
  ImageMetaPanelComponent,
  MetaApplyEvent,
  MetaApplyMode,
} from '../image-meta-panel/image-meta-panel.component';
import { GenerateFormValue } from '../generate-form.model';
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
const META_PINNED_KEY = 'aihorde.generate.meta_pinned';

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

interface JobThumbnail {
  imageId: string;
  /** Object URL for the stored result blob; revoked on destroy or delete. */
  url: string;
  mimeType: string;
  metadata?: StoredJobImageMetadata;
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
  kind: 'done' | 'generating' | 'queued' | 'error' | 'cancelled';
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
  errorMessage?: string;
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

/** The positive half of a combined `positive ### negative` prompt. */
function positivePrompt(prompt: string): string {
  const index = prompt.indexOf(' ### ');
  return (index === -1 ? prompt : prompt.slice(0, index)).trim();
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
    ImageMetaPanelComponent,
    StudioJsonModalComponent,
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

  public readonly perRowOptions = PER_ROW_OPTIONS;

  /**
   * The form as it stands, so the metadata panel can mark the rows a replace
   * would actually change. Null (the default) turns the markers off.
   */
  public readonly formValue = input<GenerateFormValue | null>(null);

  /** Ask the parent to write a selection of one image's parameters to the form. */
  public readonly applyMeta = output<{
    request: ImageGenerationRequest;
    localId: string;
    keys: (keyof GenerateFormValue)[];
    mode: MetaApplyEvent['mode'];
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
    this.finishedJobs().some((job) => job.status === 'done'),
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
   * marks jobs, then confirms a permanent delete. Selection is tracked at the
   * job level (a job's whole batch of tiles is removed together).
   */
  public readonly selectMode = signal(false);
  public readonly selectedJobs = signal<ReadonlySet<string>>(new Set());
  public readonly selectedCount = computed(() => this.selectedJobs().size);

  /** Jobs queued for deletion behind the confirm dialog; empty = dialog closed. */
  private readonly pendingDelete = signal<readonly string[]>([]);
  public readonly confirmOpen = computed(() => this.pendingDelete().length > 0);
  public readonly pendingDeleteCount = computed(
    () => this.pendingDelete().length,
  );

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
    for (const job of this.pendingJobs()) {
      const { dims, aspect } = this.geometryOf(job);
      const prompt = positivePrompt(job.request.prompt);
      const kind = job.status === 'processing' ? 'generating' : 'queued';
      const count = Math.max(1, job.request.params?.n ?? 1);
      for (let i = 0; i < count; i++) {
        tiles.push({
          key: `${job.localId}-p${i}`,
          kind,
          jobLocalId: job.localId,
          aspect,
          dims,
          queuePosition: job.queuePosition,
          waitTime: job.waitTime,
          prompt,
          request: job.request,
          retryCount: job.retryCount,
        });
      }
    }
    const thumbnails = this.thumbnails();
    for (const job of this.finishedJobs()) {
      const { dims, aspect } = this.geometryOf(job);
      const prompt = positivePrompt(job.request.prompt);
      if (job.status === 'done') {
        const thumbs = thumbnails.get(job.localId) ?? [];
        thumbs.forEach((thumb, index) => {
          const derived = deriveImageMeta(thumb.metadata);
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
            provenance: buildImageProvenance(thumb.metadata, derived),
            prompt,
            request: job.request,
            applyRequest: requestForApply(job.request, thumb.metadata?.seed),
            retryCount: job.retryCount,
          });
        });
      } else if (job.status === 'error') {
        tiles.push({
          key: `${job.localId}-error`,
          kind: 'error',
          jobLocalId: job.localId,
          aspect,
          dims,
          errorMessage: job.errorMessage,
          metaExport: { request: job.request },
          prompt,
          request: job.request,
          applyRequest: job.request,
          retryCount: job.retryCount,
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
    this.tiles().some((tile) => (tile.errors?.length ?? 0) > 0),
  );
  public readonly hasNsfw = computed(() =>
    this.tiles().some((tile) => tile.nsfw === true),
  );

  /**
   * The tiles actually rendered, after applying the error filter and aesthetic
   * sort. Pending/status tiles keep their leading position; only finished images
   * are reordered when sorting by score.
   */
  public readonly visibleTiles = computed<ResultTile[]>(() => {
    let list = this.tiles();
    if (this.errorsOnly()) {
      list = list.filter(
        (tile) => tile.kind === 'done' && (tile.errors?.length ?? 0) > 0,
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
  /** The element focus returns to when the viewer closes. */
  private previousActiveElement: HTMLElement | null = null;
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
    }
    for (const error of tile.errors ?? []) {
      rows.push({
        label: t('generate.results.meta_error', { field: error.type }),
        value: t('generate.results.error_' + error.value),
        tone: 'danger',
      });
    }
    return rows;
  });

  constructor() {
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
    this.destroyRef.onDestroy(() => {
      this.revokeAll();
      this.detachViewerKeys();
      this.gridObserver?.disconnect();
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

  /** Open the permanent-delete confirmation for a specific set of jobs. */
  public requestDelete(localIds: readonly string[]): void {
    const ids = localIds.filter((id) => id.length > 0);
    if (ids.length > 0) {
      this.pendingDelete.set(ids);
    }
  }

  public requestDeleteSelected(): void {
    this.requestDelete([...this.selectedJobs()]);
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

  /** Delete the confirmed jobs, then leave select mode. */
  public async confirmDelete(): Promise<void> {
    const ids = this.pendingDelete();
    this.pendingDelete.set([]);
    this.stepViewerPastDeleted(ids);
    for (const id of ids) {
      await this.deleteJob(id);
    }
    this.selectedJobs.set(new Set());
    this.selectMode.set(false);
    this.flippedTile.set(null);
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
    this.viewerKey.set(null);
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
    // The delete confirmation opens over the viewer and owns its own keys.
    if (this.confirmOpen()) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      // Unwind one layer at a time: raw JSON, then the metadata panel, then the
      // viewer itself.
      if (this.metaJsonOpen()) {
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
    const panel = this.viewerPanel()?.nativeElement;
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

  public downloadTile(tile: ResultTile): void {
    if (!tile.thumb) {
      return;
    }
    const extension = tile.thumb.mimeType.includes('png')
      ? 'png'
      : tile.thumb.mimeType.includes('jpeg')
        ? 'jpg'
        : 'webp';
    const stem = tile.seed ? `seed-${tile.seed}` : tile.thumb.imageId;
    this.triggerDownload(
      tile.thumb.url,
      `${(tile.imageIndex ?? 0) + 1}-${stem}.${extension}`,
      false,
    );
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
   * "Use as source" is mocked in the design but not yet wired to the source
   * section (which lives in the sibling panel). Surface the affordance and tell
   * the user it is coming rather than silently doing nothing.
   */
  public reuseAsSource(): void {
    this.toast.warning('generate.results.reuse_soon', { transloco: true });
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
    if (!this.tileMenu()) {
      return;
    }
    const target = event.target as Element | null;
    if (target?.closest('.gs-tile-menu')) {
      return;
    }
    this.closeTileMenu();
  }

  public onDocumentEscape(): void {
    if (this.tileMenu()) {
      this.closeTileMenu();
    }
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

  public toggleShowPrompts(): void {
    const next = !this.showPrompts();
    this.showPrompts.set(next);
    this.db.store(SHOW_PROMPTS_KEY, next);
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
    const done = this.finishedJobs().filter((job) => job.status === 'done');
    const images: StoredJobImage[] = [];
    const metaByImageId = new Map<string, string>();
    for (const job of done) {
      const jobImages = await this.queue.getJobImages(job.localId);
      const results = jobImages.filter((image) => image.kind === 'result');
      for (const image of results) {
        const derived = deriveImageMeta(image.metadata);
        const record = buildImageMetadataExport(
          image.imageId,
          image.metadata,
          job.request,
          derived,
        );
        metaByImageId.set(image.imageId, JSON.stringify(record, null, 2));
      }
      images.push(...results);
    }
    if (images.length === 0) {
      return;
    }
    const bytes = await buildJobImageArchive(images, metaByImageId);
    const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    this.triggerDownload(url, 'generations.zip', true);
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
      URL.revokeObjectURL(url);
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
