import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AlchemyDbService } from '../../../services/alchemy-db.service';
import { CivitaiCacheService } from '../../../services/civitai-cache.service';
import { AlchemyQueueService } from '../../../services/alchemy-queue.service';
import { GenerationDbService } from '../../../services/generation-db.service';
import { GenerationQueueService } from '../../../services/generation-queue.service';
import { ToastService } from '../../../services/toast.service';
import { IconComponent } from '../../../components/icon/icon.component';
import { setPageMeta } from '../../../helper/page-meta';

/** Which history a pending confirmation is about. */
type StorageArea = 'alchemy' | 'image' | 'civitai';

/** Bytes to a rounded megabyte, for the usage line. */
function megabytes(bytes: number): number {
  return Math.round(bytes / 1_000_000);
}

/**
 * What the two studios have stored, and the only way to remove it in bulk.
 *
 * Nothing in the app deletes stored results on a timer, a count, or an age, so
 * this page is the sole relief valve when a browser's storage fills up. The two
 * histories are cleared separately and each behind its own confirmation: they
 * are independent bodies of work, and one is usually the larger by far.
 */
@Component({
  selector: 'app-studio-storage',
  imports: [IconComponent, RouterLink, TranslocoPipe],
  templateUrl: './studio-storage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioStorageComponent {
  private readonly alchemyDb = inject(AlchemyDbService);
  private readonly alchemyQueue = inject(AlchemyQueueService);
  private readonly generationDb = inject(GenerationDbService);
  private readonly generationQueue = inject(GenerationQueueService);
  private readonly civitaiCache = inject(CivitaiCacheService);
  private readonly toast = inject(ToastService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  public readonly alchemyCount = signal<number | null>(null);
  public readonly imageCount = signal<number | null>(null);
  /** Cached CivitAI model pages; the versions beside them are not counted. */
  public readonly civitaiCount = signal<number | null>(null);

  /**
   * Storage the browser reports for this whole site, not for either history on
   * its own: that per-store figure would mean walking every blob, and this is
   * the only cheap number the platform offers. Null when unavailable, and the
   * line is then not shown rather than reading as zero.
   */
  public readonly usedMb = signal<number | null>(null);
  public readonly quotaMb = signal<number | null>(null);

  public readonly pendingClear = signal<StorageArea | null>(null);
  public readonly clearing = signal(false);

  constructor() {
    setPageMeta({
      titleKey: 'studio.storage.title',
      descriptionKey: 'studio.storage.intro',
    });
    void this.refresh();
  }

  public requestClear(area: StorageArea): void {
    this.pendingClear.set(area);
  }

  public cancelClear(): void {
    this.pendingClear.set(null);
  }

  /** Close the confirmation only when its backdrop, not its panel, is clicked. */
  public onConfirmBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancelClear();
    }
  }

  public pendingCount(): number {
    switch (this.pendingClear()) {
      case 'alchemy':
        return this.alchemyCount() ?? 0;
      case 'civitai':
        return this.civitaiCount() ?? 0;
      default:
        return this.imageCount() ?? 0;
    }
  }

  public async confirmClear(): Promise<void> {
    const area = this.pendingClear();
    if (!area || this.clearing()) {
      return;
    }
    this.clearing.set(true);
    try {
      if (area === 'alchemy') {
        await this.alchemyQueue.clearHistory();
      } else if (area === 'civitai') {
        await this.civitaiCache.clear();
      } else {
        await this.generationQueue.clearHistory();
      }
      this.toast.success('studio.storage.cleared', { transloco: true });
      await this.refresh();
    } catch {
      this.toast.error('studio.storage.clear_failed', { transloco: true });
    } finally {
      this.clearing.set(false);
      this.pendingClear.set(null);
    }
  }

  /** Counts are read on demand rather than watched: nothing here is live. */
  private async refresh(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    this.alchemyCount.set(await this.alchemyDb.countJobs());
    this.imageCount.set(await this.generationDb.countJobs());
    this.civitaiCount.set(await this.civitaiCache.countModels());

    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.usage !== undefined && estimate.quota !== undefined) {
      this.usedMb.set(megabytes(estimate.usage));
      this.quotaMb.set(megabytes(estimate.quota));
    }
  }
}
