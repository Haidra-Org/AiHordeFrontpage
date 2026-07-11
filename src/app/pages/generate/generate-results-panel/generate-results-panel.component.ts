import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { GenerationQueueService } from '../../../services/generation-queue.service';
import { ToastService } from '../../../services/toast.service';
import { LocalGenerationJob } from '../../../types/generation-job';
import { StoredJobImageMetadata } from '../../../types/generation-job';
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

/**
 * Renders the queue's pending and finished jobs: live status while in flight,
 * a thumbnail grid on completion, and per-job controls (cancel, retry, delete,
 * download, zip). All result thumbnails are object URLs over stored blobs and
 * are revoked when the panel is destroyed or a job is deleted.
 */
@Component({
  selector: 'app-generate-results-panel',
  imports: [DecimalPipe, TranslocoPipe, IconComponent],
  templateUrl: './generate-results-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateResultsPanelComponent {
  private readonly queue = inject(GenerationQueueService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly pendingJobs = this.queue.pendingJobs;
  public readonly finishedJobs = this.queue.finishedJobs;

  private readonly thumbnails = signal<Map<string, JobThumbnail[]>>(new Map());
  public readonly lightbox = signal<LightboxView | null>(null);

  /** Jobs whose thumbnails have been (or are being) loaded, to avoid re-fetching. */
  private readonly loaded = new Set<string>();

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

  public thumbnailsFor(localId: string): JobThumbnail[] {
    return this.thumbnails().get(localId) ?? [];
  }

  public async cancel(job: LocalGenerationJob): Promise<void> {
    await this.queue.cancel(job.localId);
  }

  public async retry(job: LocalGenerationJob): Promise<void> {
    await this.queue.retry(job.localId);
    this.toast.success('generate.results.retried', { transloco: true });
  }

  public async remove(job: LocalGenerationJob): Promise<void> {
    this.revokeJob(job.localId);
    this.loaded.delete(job.localId);
    await this.queue.deleteJob(job.localId);
  }

  public openLightbox(thumb: JobThumbnail): void {
    this.lightbox.set({
      url: thumb.url,
      seed: thumb.metadata?.seed,
      model: thumb.metadata?.model,
    });
  }

  public closeLightbox(): void {
    this.lightbox.set(null);
  }

  public downloadImage(thumb: JobThumbnail, index: number): void {
    const extension = thumb.mimeType.includes('png')
      ? 'png'
      : thumb.mimeType.includes('jpeg')
        ? 'jpg'
        : 'webp';
    const stem = thumb.metadata?.seed
      ? `seed-${thumb.metadata.seed}`
      : thumb.imageId;
    this.triggerDownload(thumb.url, `${index + 1}-${stem}.${extension}`, false);
  }

  public async downloadZip(job: LocalGenerationJob): Promise<void> {
    const images = (await this.queue.getJobImages(job.localId)).filter(
      (image) => image.kind === 'result',
    );
    if (images.length === 0) {
      return;
    }
    const bytes = await buildJobImageArchive(images);
    const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    this.triggerDownload(url, `generation-${job.localId}.zip`, true);
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
