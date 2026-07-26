import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/** One frame of a sweep: the parameter value it was rendered at. */
export interface SweepStop {
  /** The parameter value as it should be read out, e.g. "8" or "cfg 3.5". */
  value: string;
  /** File name within the strip's directory. */
  file: string;
  /** One line about what this frame shows, in the same voice as the studio. */
  caption: string;
}

/** A single parameter swept across one model and one scene. */
export interface SweepStrip {
  /** API field name being swept, e.g. `steps` or `cfg_scale`. */
  parameter: string;
  model: string;
  scene: string;
  /** Ordered low to high; the middle one is used as the collapsed preview. */
  stops: SweepStop[];
}

/** The whole library's manifest, as published beside the images. */
export interface SweepIndex {
  generated_at: string;
  strips: SweepStrip[];
}

/**
 * Which sweep a field's `?` note can offer, keyed by the note's help topic.
 * Only topics with a published strip belong here; anything absent simply never
 * offers one.
 */
export const SWEEP_PARAMETER_BY_HELP_TOPIC: Readonly<Record<string, string>> = {
  steps: 'steps',
  cfg: 'cfg_scale',
};

/**
 * The parameter-sweep image library: strips of the same scene rendered across a
 * range of one setting, so a reader can see what a number does instead of being
 * told.
 *
 * The library is published as static files beside the images rather than served
 * by the API, so the base URL is configuration and the index is fetched once,
 * lazily, on the first surface that wants one. A library that is missing,
 * unreachable or being fetched from a browser that has been told to save data
 * leaves the service empty, and every consumer treats empty as "this field has
 * no sweep": no error, no placeholder, no gap in the layout. That is also the
 * state the app is in before the library exists at all.
 */
@Injectable({ providedIn: 'root' })
export class SweepLibraryService {
  private readonly http = inject(HttpClient);

  /** Where the published strips live, without a trailing slash. */
  public readonly baseUrl = environment.sweepLibraryBaseUrl.replace(/\/+$/, '');

  private readonly strips = signal<readonly SweepStrip[]>([]);
  private readonly settled = signal(false);

  private pending: Promise<void> | null = null;

  /** True once a fetch has finished, whether it found anything or not. */
  public readonly isSettled = this.settled.asReadonly();
  public readonly hasStrips = computed(() => this.strips().length > 0);

  /**
   * Fetch the index if it has not been fetched already. Repeat callers share the
   * one in-flight request, and a failure is remembered as "nothing published"
   * rather than retried on every consumer that renders.
   */
  public ensureLoaded(): Promise<void> {
    this.pending ??= this.fetchIndex();
    return this.pending;
  }

  /**
   * The best strip for a parameter: an exact model and scene match first, then
   * the same model on any scene, then whatever was published for the parameter.
   * Null when nothing matches, which is what the consumers render for.
   */
  public strip(
    parameter: string,
    model?: string,
    scene?: string,
  ): SweepStrip | null {
    const candidates = this.strips().filter(
      (entry) => entry.parameter === parameter && entry.stops.length > 0,
    );
    if (candidates.length === 0) {
      return null;
    }
    return (
      (model && scene
        ? candidates.find(
            (entry) => entry.model === model && entry.scene === scene,
          )
        : undefined) ??
      (model ? candidates.find((entry) => entry.model === model) : undefined) ??
      candidates[0]
    );
  }

  /** Where one frame of a strip is published. */
  public imageUrl(strip: SweepStrip, stop: SweepStop): string {
    return `${this.baseUrl}/${strip.parameter}/${strip.model}/${strip.scene}/${stop.file}`;
  }

  private async fetchIndex(): Promise<void> {
    try {
      const index = await firstValueFrom(
        this.http.get<SweepIndex>(`${this.baseUrl}/index.json`),
      );
      this.strips.set(
        index?.strips?.filter((entry) => !!entry.parameter) ?? [],
      );
    } catch {
      this.strips.set([]);
    } finally {
      this.settled.set(true);
    }
  }
}
