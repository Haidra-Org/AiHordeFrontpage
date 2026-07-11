import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { GenerationQueueService } from '../../../services/generation-queue.service';
import { ToastService } from '../../../services/toast.service';
import { LocalGenerationJob } from '../../../types/generation-job';
import {
  StoredJobImage,
  StoredJobImageMetadata,
} from '../../../types/generation-job';
import { buildJobImageArchive } from '../generate-archive';

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
  imports: [TranslocoPipe, IconComponent],
  templateUrl: './generate-results-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateResultsPanelComponent {
  private readonly queue = inject(GenerationQueueService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

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

  /**
   * The flattened tile grid: pending jobs first (each expanded to its batch of
   * placeholder tiles), then finished jobs (done images, or a single status tile
   * for error/cancelled), so the grid reads top-to-bottom newest-work-first.
   */
  public readonly tiles = computed<ResultTile[]>(() => {
    const tiles: ResultTile[] = [];
    for (const job of this.pendingJobs()) {
      const { dims, aspect } = this.geometryOf(job);
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
        });
      }
    }
    const thumbnails = this.thumbnails();
    for (const job of this.finishedJobs()) {
      const { dims, aspect } = this.geometryOf(job);
      if (job.status === 'done') {
        const thumbs = thumbnails.get(job.localId) ?? [];
        thumbs.forEach((thumb, index) => {
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
        });
      } else {
        tiles.push({
          key: `${job.localId}-cancelled`,
          kind: 'cancelled',
          jobLocalId: job.localId,
          aspect,
          dims,
        });
      }
    }
    return tiles;
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
    this.toast.success('generate.results.retried', { transloco: true });
  }

  public async deleteJob(localId: string): Promise<void> {
    this.revokeJob(localId);
    this.loaded.delete(localId);
    await this.queue.deleteJob(localId);
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

  public async downloadAllFinished(): Promise<void> {
    const done = this.finishedJobs().filter((job) => job.status === 'done');
    const images: StoredJobImage[] = [];
    for (const job of done) {
      const jobImages = await this.queue.getJobImages(job.localId);
      images.push(...jobImages.filter((image) => image.kind === 'result'));
    }
    if (images.length === 0) {
      return;
    }
    const bytes = await buildJobImageArchive(images);
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
