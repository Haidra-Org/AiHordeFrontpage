import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  output,
  signal,
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
  buildImageMetadataExport,
  deriveImageMeta,
} from '../image-metadata';
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

interface JobThumbnail {
  imageId: string;
  /** Object URL for the stored result blob; revoked on destroy or delete. */
  url: string;
  mimeType: string;
  metadata?: StoredJobImageMetadata;
}

interface LightboxView {
  url: string;
  seed?: string;
  model?: string;
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
  /** Full metadata record for the modal + Download All sidecar. */
  metaExport?: Record<string, unknown>;
  /** The positive prompt, shown (expandable) atop every tile. */
  prompt?: string;
  /** The job's stored request, for viewing/loading its settings. */
  request?: ImageGenerationRequest;
  /** Which Retry attempt produced this job (0/undefined = original). */
  retryCount?: number;
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
    StudioJsonModalComponent,
  ],
  templateUrl: './generate-results-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateResultsPanelComponent {
  private readonly queue = inject(GenerationQueueService);
  private readonly toast = inject(ToastService);
  private readonly db = inject(DatabaseService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly perRowOptions = PER_ROW_OPTIONS;

  /** Ask the parent to load a job's settings back into the form. */
  public readonly loadSettings = output<{
    request: ImageGenerationRequest;
    localId: string;
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
  public readonly lightbox = signal<LightboxView | null>(null);

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
  public readonly gridColumns = computed(
    () => `repeat(${this.imagesPerRow()}, minmax(0, 1fr))`,
  );

  /** Reveal NSFW/flagged images globally; individual tiles can also be revealed. */
  public readonly showNsfw = signal(false);
  private readonly revealedNsfw = signal<ReadonlySet<string>>(new Set());

  public readonly sortMode = signal<ResultSortMode>('default');
  /** Show only finished images that came back with a reported error. */
  public readonly errorsOnly = signal(false);

  /** The tile whose metadata modal is open, or null. */
  public readonly metaTile = signal<ResultTile | null>(null);

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
            prompt,
            request: job.request,
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
    this.destroyRef.onDestroy(() => this.revokeAll());
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

  /** Ask the parent to load this tile's job settings back into the form. */
  public emitLoadSettings(tile: ResultTile): void {
    if (tile.request) {
      this.loadSettings.emit({
        request: tile.request,
        localId: tile.jobLocalId,
      });
    }
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
    for (const id of ids) {
      await this.deleteJob(id);
    }
    this.selectedJobs.set(new Set());
    this.selectMode.set(false);
  }

  public openLightbox(tile: ResultTile): void {
    if (!tile.url) {
      return;
    }
    this.lightbox.set({ url: tile.url, seed: tile.seed, model: tile.model });
  }

  public closeLightbox(): void {
    this.lightbox.set(null);
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

  // --- View controls -------------------------------------------------------

  private loadPerRow(): number {
    const stored = this.db.get(PER_ROW_KEY);
    return typeof stored === 'number' &&
      (PER_ROW_OPTIONS as readonly number[]).includes(stored)
      ? stored
      : DEFAULT_PER_ROW;
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

  public openMeta(tile: ResultTile): void {
    this.metaTile.set(tile);
  }

  public closeMeta(): void {
    this.metaTile.set(null);
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
