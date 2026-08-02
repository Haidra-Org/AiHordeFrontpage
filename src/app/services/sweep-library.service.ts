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
  /**
   * The piece of prompt text this frame was rendered with, on strips that vary
   * the wording rather than a number. Null on every other strip.
   */
  prompt_fragment?: string | null;
  /**
   * How many candidates this frame was picked from, where the library curated
   * a batch rather than publishing a single render. Absent or 1 means the one
   * render is the one shown; anything higher is disclosed to the reader.
   */
  batch_size?: number;
}

/** One side of a grid plate: what it varies, and the values it varies it over. */
export interface SweepGridAxis {
  /** API field name this axis varies, e.g. `cfg_scale`. */
  parameter: string;
  /**
   * The values in the order the plate is laid out. Numbers on a numeric axis,
   * flags on a switch axis, and sampler names on a sampler axis, so a reader of
   * this list has to render whatever type it finds.
   */
  values: readonly (string | number | boolean)[];
  /** One line naming the axis and its direction, e.g. "Steps, top to bottom." */
  caption: string;
}

/** The two axes of a `grid` strip, whose stops run row by row. */
export interface SweepGrid {
  rows: SweepGridAxis;
  columns: SweepGridAxis;
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
  /**
   * How the generator asks the strip to be laid out. `strip` is the scrubber,
   * `grid` is a two-axis plate, and `tile_repeat_3x3` is a strip whose frames
   * are single tiles that only read once they are repeated.
   */
  presentation: string;
  caption: string;
  /** False when a stop failed to render, which takes the strip out of use. */
  complete: boolean;
  image_model: SweepStripModel;
  scene: SweepStripScene;
  /** Ordered low to high; the middle one is used as the collapsed preview. */
  stops: SweepStop[];
  /** The axes of a `grid` strip, and null on every other presentation. */
  grid?: SweepGrid | null;
  /**
   * The image the strip was rendered from, relative to the library root, on the
   * strips that start from one (img2img denoising). Null everywhere else.
   */
  source_image?: string | null;
}

/** The whole library's manifest, as published beside the images. */
export interface SweepIndex {
  schema_version: number;
  seed: number;
  strips: SweepStrip[];
}

/* Which strip, grid or variant illustrates a setting is a property of the
   setting rather than of the library, and lives with everything else the studio
   knows about it in `content/settings`. So does what a strip's parameter is
   called and which card of the panel it belongs to: a sweep is one more surface
   naming a setting, and it has to call it what every other surface calls it.
   This service knows only what has actually been published. */

/**
 * Which published strip stands for a model baseline. The library holds one strip
 * per family rather than per model, so every SDXL checkpoint is shown the SDXL
 * strip; a baseline with nothing published falls through to whatever the strip's
 * parameter has, which is the behaviour of a surface that names no model at all.
 */
const SWEEP_SLUG_BY_BASELINE: Readonly<Record<string, string>> = {
  stable_diffusion_1: 'deliberate',
  stable_diffusion_xl: 'albedobase-xl',
};

/**
 * The models the library was actually rendered with, by the name the horde
 * publishes them under. A reader who has picked one of these is shown their own
 * model rather than the one standing in for its family, which for the anime
 * lineage is the difference between a CLIP-skip strip that explains their
 * pictures and one that does not. Exact names only: a checkpoint the library
 * never rendered falls back to its baseline, which is the honest answer.
 */
const SWEEP_SLUG_BY_MODEL_NAME: Readonly<Record<string, string>> = {
  deliberate: 'deliberate',
  'albedobase xl (sdxl)': 'albedobase-xl',
  'albedobase xl': 'albedobase-xl',
  'anything diffusion': 'anything-diffusion',
};

/** The library slug standing for a normalised model baseline, if any does. */
export function sweepSlugForBaseline(
  baseline: string | null | undefined,
): string | undefined {
  return baseline ? SWEEP_SLUG_BY_BASELINE[baseline] : undefined;
}

/** The library slug rendered from this exact model, if the library has one. */
export function sweepSlugForModelName(
  name: string | null | undefined,
): string | undefined {
  return name ? SWEEP_SLUG_BY_MODEL_NAME[name.trim().toLowerCase()] : undefined;
}

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
  public readonly baseUrl = environment.evidenceBaseUrl.replace(/\/+$/, '');

  private readonly strips = signal<readonly SweepStrip[]>([]);
  private readonly settled = signal(false);

  private pending: Promise<void> | null = null;

  private readonly studioModel = signal<string | undefined>(undefined);

  /** True once a fetch has finished, whether it found anything or not. */
  public readonly isSettled = this.settled.asReadonly();

  /**
   * The strip family matching the model the studio currently has selected, or
   * undefined when nothing is selected or its baseline has no strips. Surfaces
   * that sit inside the studio without knowing what it is set to (a field's `?`
   * note) read this so the pictures are of the model the reader is using.
   */
  public readonly studioModelSlug = this.studioModel.asReadonly();
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

  /** Tell the library which model the studio is set to, by its baseline. */
  public setStudioBaseline(baseline: string | null | undefined): void {
    this.studioModel.set(sweepSlugForBaseline(baseline));
  }

  /**
   * Tell the library which model the studio is set to, by name as well as by
   * baseline. The name wins where the library rendered that exact checkpoint,
   * because a strip of the reader's own model is the one worth showing them.
   */
  public setStudioModel(
    name: string | null | undefined,
    baseline: string | null | undefined,
  ): void {
    this.studioModel.set(
      sweepSlugForModelName(name) ?? sweepSlugForBaseline(baseline),
    );
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
    return this.best(
      parameter,
      (entry) => entry.presentation !== 'grid',
      modelSlug,
      sceneId,
    );
  }

  /**
   * The best grid plate for a parameter, matched as {@link strip} is. Grids are
   * named as their own parameters (`steps_cfg_grid`), so the two never collide;
   * the presentation is checked anyway because the presentation, not the name,
   * is what says how a strip may be laid out.
   */
  public grid(
    parameter: string,
    modelSlug?: string,
    sceneId?: string,
  ): SweepStrip | null {
    return this.best(
      parameter,
      (entry) => entry.presentation === 'grid' && !!entry.grid,
      modelSlug,
      sceneId,
    );
  }

  private best(
    parameter: string,
    usable: (entry: SweepStrip) => boolean,
    modelSlug?: string,
    sceneId?: string,
  ): SweepStrip | null {
    const candidates = this.strips().filter(
      (entry) => entry.parameter === parameter && usable(entry),
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
    return this.assetUrl(stop.file);
  }

  /** Where any file the index names by a library-relative path is published. */
  public assetUrl(path: string): string {
    return `${this.baseUrl}/${path}`;
  }

  private async fetchIndex(): Promise<void> {
    try {
      const index = await firstValueFrom(
        this.http.get<SweepIndex>(`${this.baseUrl}/index.json`),
      );
      this.strips.set(index?.strips?.filter(isUsable) ?? []);
    } catch {
      this.strips.set([]);
    } finally {
      this.settled.set(true);
    }
  }
}

/**
 * Whether a published strip is one any surface can show. A strip missing a
 * render is incomplete and would scrub, or lay out, into a gap. Presentation is
 * not judged here: it decides which surface a strip belongs to rather than
 * whether it belongs anywhere.
 */
function isUsable(strip: SweepStrip): boolean {
  return !!strip?.parameter && strip.complete && (strip.stops?.length ?? 0) > 0;
}
