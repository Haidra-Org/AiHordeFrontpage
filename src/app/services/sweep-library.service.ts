import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/** One frame of a sweep: the parameter value it was rendered at. */
export interface SweepStop {
  /** The parameter value, in the type the API takes it in. */
  value: string | number | boolean;
  /** The value as a token safe to read out and to put in a filename, e.g. `12` or `off`. */
  label: string;
  /** One line about what this frame shows, in the same voice as the studio. */
  caption: string;
  /** Path to the image relative to the library root, slashes included. */
  file: string;
}

/** The image model a strip was rendered with. */
export interface SweepStripModel {
  slug: string;
  name: string;
  baseline: string;
  note: string;
}

/** The scene a strip was rendered from. */
export interface SweepStripScene {
  scene_id: string;
  label: string;
  prompt: string;
}

/** A single parameter swept across one model and one scene. */
export interface SweepStrip {
  strip_id: string;
  /** API field name being swept, e.g. `steps` or `cfg_scale`. */
  parameter: string;
  /** How the generator asks the strip to be laid out; `grid` is not a scrubber. */
  presentation: string;
  caption: string;
  /** False when a stop failed to render, which takes the strip out of use. */
  complete: boolean;
  image_model: SweepStripModel;
  scene: SweepStripScene;
  /** Ordered low to high; the middle one is used as the collapsed preview. */
  stops: SweepStop[];
}

/** The whole library's manifest, as published beside the images. */
export interface SweepIndex {
  schema_version: number;
  seed: number;
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
    modelSlug?: string,
    sceneId?: string,
  ): SweepStrip | null {
    const candidates = this.strips().filter(
      (entry) => entry.parameter === parameter,
    );
    if (candidates.length === 0) {
      return null;
    }
    return (
      (modelSlug && sceneId
        ? candidates.find(
            (entry) =>
              entry.image_model.slug === modelSlug &&
              entry.scene.scene_id === sceneId,
          )
        : undefined) ??
      (modelSlug
        ? candidates.find((entry) => entry.image_model.slug === modelSlug)
        : undefined) ??
      candidates[0]
    );
  }

  /**
   * Where one frame is published. The index states each stop's path relative to
   * the library root, so nothing is assembled from the strip's own fields.
   */
  public imageUrl(stop: SweepStop): string {
    return `${this.baseUrl}/${stop.file}`;
  }

  private async fetchIndex(): Promise<void> {
    try {
      const index = await firstValueFrom(
        this.http.get<SweepIndex>(`${this.baseUrl}/index.json`),
      );
      this.strips.set(index?.strips?.filter(isScrubbable) ?? []);
    } catch {
      this.strips.set([]);
    } finally {
      this.settled.set(true);
    }
  }
}

/**
 * Whether a published strip is one this scrubber can show. A strip missing a
 * render is incomplete and would scrub into a gap, and a `grid` strip is a
 * two-dimensional plate that a one-axis slider cannot represent at all.
 */
function isScrubbable(strip: SweepStrip): boolean {
  return (
    !!strip?.parameter &&
    strip.complete &&
    strip.presentation !== 'grid' &&
    (strip.stops?.length ?? 0) > 0
  );
}
