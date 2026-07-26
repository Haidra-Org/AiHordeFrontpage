import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  SweepLibraryService,
  SweepStop,
} from '../../services/sweep-library.service';

/**
 * A parameter sweep the reader can scrub: the same scene rendered across a range
 * of one setting, so "more steps means more detail, up to a point" is something
 * they see rather than something they are told.
 *
 * It starts collapsed behind one line of offer, because it sits inside prose the
 * reader is already reading and a strip of images opening under every field
 * would bury the prose. Nothing is fetched until they ask for it, and under
 * `prefers-reduced-data` even the single preview frame waits for the tap: a
 * reader on a metered connection gets the offer, not the images.
 *
 * When the library has no strip for the parameter, the component renders
 * nothing at all. That is the state the app is in before the library is
 * published, and it has to look finished in it.
 */
@Component({
  selector: 'app-gs-sweep-scrub',
  imports: [TranslocoPipe],
  template: `
    @if (strip()) {
      <div class="gs-sweep">
        @if (expanded()) {
          <div class="gs-sweep-open">
            <figure class="gs-sweep-figure">
              <img
                class="gs-sweep-frame"
                [src]="frameUrl(stop())"
                [alt]="'generate.sweeps.frame_alt' | transloco: valueParams()"
                (load)="onFrameLoad()"
              />
              <figcaption class="gs-sweep-caption">
                {{ stop().caption }}
              </figcaption>
            </figure>

            <p class="gs-sweep-value" role="status" aria-live="polite">
              {{ 'generate.sweeps.value' | transloco: valueParams() }}
            </p>

            @if (!frameLoaded()) {
              <p class="gs-sweep-loading">
                {{ 'generate.sweeps.loading' | transloco }}
              </p>
            }

            <input
              class="gs-range gs-sweep-range"
              type="range"
              min="0"
              step="1"
              [max]="lastIndex()"
              [value]="index()"
              [attr.aria-label]="'generate.sweeps.slider_label' | transloco"
              [attr.aria-valuetext]="valueLabel()"
              (input)="onScrub($event)"
            />

            <button
              type="button"
              class="gs-sweep-collapse"
              (click)="collapse()"
            >
              {{ 'generate.sweeps.collapse' | transloco }}
            </button>
          </div>
        } @else {
          <button
            type="button"
            class="gs-sweep-offer"
            [attr.aria-expanded]="false"
            (click)="expand()"
          >
            @if (showPreview()) {
              <img
                class="gs-sweep-preview"
                [src]="frameUrl(stop())"
                alt=""
                loading="lazy"
              />
            }
            <span class="gs-sweep-offer-label">
              {{ 'generate.sweeps.expand' | transloco }}
            </span>
          </button>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsSweepScrubComponent {
  private readonly sweeps = inject(SweepLibraryService);

  /** API field name the sweep varies, e.g. `steps`. */
  public readonly parameter = input.required<string>();
  /** Narrow the strip to one model, when the surface knows which is in play. */
  public readonly modelSlug = input<string | undefined>(undefined);
  /** Narrow the strip to one scene. */
  public readonly sceneId = input<string | undefined>(undefined);

  private readonly cursor = signal<number | null>(null);
  private readonly open = signal(false);
  private readonly loaded = signal(false);

  public readonly expanded = this.open.asReadonly();
  public readonly frameLoaded = this.loaded.asReadonly();

  public readonly strip = computed(() =>
    this.sweeps.strip(this.parameter(), this.modelSlug(), this.sceneId()),
  );

  public readonly lastIndex = computed(
    () => (this.strip()?.stops.length ?? 1) - 1,
  );

  /**
   * The middle stop stands in for the strip while it is collapsed: an end of the
   * range would advertise the extreme rather than the typical.
   */
  public readonly index = computed(
    () =>
      this.cursor() ?? Math.floor(((this.strip()?.stops.length ?? 1) - 1) / 2),
  );

  public readonly stop = computed<SweepStop>(
    () => this.strip()!.stops[this.index()],
  );

  /**
   * How the stop is read out. The index labels every stop, including the ones
   * whose value is a flag rather than a number, so the label is preferred over
   * the raw value wherever there is one.
   */
  public readonly valueLabel = computed(
    () => this.stop().label || String(this.stop().value),
  );

  public readonly valueParams = computed(() => ({ value: this.valueLabel() }));

  /**
   * A reader on a metered connection is offered the sweep in words and fetches
   * nothing, including the preview, until they choose to.
   */
  public readonly showPreview = computed(() => !this.reducedData());

  constructor() {
    void this.sweeps.ensureLoaded();
  }

  public frameUrl(stop: SweepStop): string {
    return this.sweeps.imageUrl(stop);
  }

  public expand(): void {
    this.open.set(true);
    this.loaded.set(false);
    this.prefetchNeighbours();
  }

  public collapse(): void {
    this.open.set(false);
  }

  public onFrameLoad(): void {
    this.loaded.set(true);
  }

  public onScrub(event: Event): void {
    const next = Number((event.target as HTMLInputElement).value);
    if (Number.isNaN(next)) {
      return;
    }
    this.cursor.set(Math.min(Math.max(next, 0), this.lastIndex()));
    this.prefetchNeighbours();
  }

  /**
   * Warm the frames on either side so a scrub does not flash empty. Failures are
   * nobody's business: the browser simply has nothing warmed.
   */
  private prefetchNeighbours(): void {
    const strip = this.strip();
    if (!strip || typeof Image === 'undefined') {
      return;
    }
    for (const offset of [-1, 1]) {
      const stop = strip.stops[this.index() + offset];
      if (stop) {
        new Image().src = this.sweeps.imageUrl(stop);
      }
    }
  }

  private reducedData(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-data: reduce)').matches
    );
  }
}
