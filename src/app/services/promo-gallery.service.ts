import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  PromoGalleryImage,
  PromoGalleryManifest,
} from '../types/promo-gallery';

/**
 * The published gallery: every picture the horde made for the site, with the
 * request that made it.
 *
 * The manifest is immutable once published and small enough to hold whole, so
 * it is fetched once and shared by every surface that shows a picture. A
 * failure is remembered rather than retried on each consumer: the bucket
 * refuses origins it does not know, so a development server never gets an
 * answer at all, and a page that hid its empty state behind a spinner would
 * spin there for good.
 */
@Injectable({ providedIn: 'root' })
export class PromoGalleryService {
  private readonly http = inject(HttpClient);

  /** Where the gallery is published, without a trailing slash. */
  public readonly baseUrl = environment.promoBaseUrl.replace(/\/+$/, '');

  private readonly entries = signal<readonly PromoGalleryImage[]>([]);
  private readonly settled = signal(false);
  private readonly failure = signal(false);

  private pending: Promise<void> | null = null;

  /** True once a fetch has finished, whether it found anything or not. */
  public readonly loaded = this.settled.asReadonly();
  /** True when the last fetch produced nothing to show. */
  public readonly failed = this.failure.asReadonly();

  /** Every picture that may be shown, in the order the manifest lists them. */
  public readonly images = computed<readonly PromoGalleryImage[]>(() =>
    this.entries(),
  );

  /**
   * Fetch the manifest if it has not been fetched already. Repeat callers share
   * the one in-flight request.
   */
  public ensureLoaded(): Promise<void> {
    this.pending ??= this.fetchManifest();
    return this.pending;
  }

  /** Fetch again after a failure, so a page can offer a retry. */
  public reload(): Promise<void> {
    this.pending = null;
    this.settled.set(false);
    this.failure.set(false);
    return this.ensureLoaded();
  }

  public byId(id: string): PromoGalleryImage | null {
    return this.entries().find((entry) => entry.id === id) ?? null;
  }

  /** Where one picture's bytes are. */
  public pictureUrl(entry: PromoGalleryImage): string {
    return `${this.baseUrl}/${entry.file.replace(/^\/+/, '')}`;
  }

  private async fetchManifest(): Promise<void> {
    try {
      const manifest = await firstValueFrom(
        this.http.get<PromoGalleryManifest>(
          `${this.baseUrl}/gallery/gallery.json`,
        ),
      );
      const hidden = new Set(manifest?.censored ?? []);
      const usable = (manifest?.images ?? []).filter(
        (entry) => isUsable(entry) && !hidden.has(entry.id),
      );
      this.entries.set(usable);
      this.failure.set(usable.length === 0);
    } catch {
      this.entries.set([]);
      this.failure.set(true);
    } finally {
      this.settled.set(true);
    }
  }
}

/** Whether an entry carries enough to be drawn as a tile at all. */
function isUsable(entry: PromoGalleryImage | null | undefined): boolean {
  return !!entry?.id && !!entry.file;
}
