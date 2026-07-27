import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';
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
  imports: [TranslocoPipe, IconComponent],
  template: `
    @if (strip()) {
      <div class="gs-sweep">
        @if (expanded()) {
          <div class="gs-sweep-open">
            <figure class="gs-sweep-figure">
              <!-- The frame is as wide as the column it sits in, which in the
                   form is narrow enough to lose the detail the sweep is about,
                   so the frame is itself the way to a full-size look. -->
              <button
                #zoomTrigger
                type="button"
                class="gs-sweep-zoom"
                [attr.aria-label]="'generate.sweeps.enlarge' | transloco"
                (click)="openZoom()"
              >
                <img
                  class="gs-sweep-frame"
                  [src]="frameUrl(stop())"
                  [alt]="'generate.sweeps.frame_alt' | transloco: valueParams()"
                  (load)="onFrameLoad()"
                />
              </button>
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

        @if (zoomed()) {
          <!-- Focusable backdrop on the style browser's viewer idiom: it gives
               the press outside a keyboard equivalent rather than leaving one
               way out of the layer that only a pointer has. -->
          <div
            class="gs-sweep-viewer"
            tabindex="0"
            (click)="onViewerBackdrop($event)"
            (keydown.escape)="closeZoom()"
          >
            <div
              #zoomPanel
              class="gs-sweep-viewer-body"
              role="dialog"
              aria-modal="true"
              tabindex="-1"
              [attr.aria-label]="
                'generate.sweeps.enlarged_title' | transloco: valueParams()
              "
              (keydown)="onViewerKeydown($event)"
            >
              <div class="gs-sweep-viewer-top">
                <span class="gs-sweep-viewer-name">
                  {{ 'generate.sweeps.value' | transloco: valueParams() }}
                </span>
                <button
                  #zoomClose
                  type="button"
                  class="gs-sweep-viewer-x"
                  [attr.aria-label]="
                    'generate.sweeps.enlarge_close' | transloco
                  "
                  (click)="closeZoom()"
                >
                  <app-icon name="x-mark" class="gs-ico-sm" />
                </button>
              </div>
              <img
                class="gs-sweep-viewer-img"
                [src]="frameUrl(stop())"
                [alt]="'generate.sweeps.frame_alt' | transloco: valueParams()"
              />
              <p class="gs-sweep-viewer-cap">{{ stop().caption }}</p>
            </div>
          </div>
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
  /**
   * Narrow the strip to one model, when the surface knows which is in play. A
   * surface that does not (a field's `?` note) leaves it unset and gets the
   * model the studio is set to.
   */
  public readonly modelSlug = input<string | undefined>(undefined);
  /** Narrow the strip to one scene. */
  public readonly sceneId = input<string | undefined>(undefined);

  private readonly cursor = signal<number | null>(null);
  private readonly open = signal(false);
  private readonly loaded = signal(false);
  private readonly zoom = signal(false);

  public readonly expanded = this.open.asReadonly();
  public readonly frameLoaded = this.loaded.asReadonly();
  /** Whether the frame is also on show full size, over everything else. */
  public readonly zoomed = this.zoom.asReadonly();

  private readonly zoomTrigger =
    viewChild<ElementRef<HTMLButtonElement>>('zoomTrigger');
  private readonly zoomPanel = viewChild<ElementRef<HTMLElement>>('zoomPanel');
  private readonly zoomClose =
    viewChild<ElementRef<HTMLButtonElement>>('zoomClose');

  /** The panel focus was last moved to, so an unrelated render cannot re-take it. */
  private focusedPanel: HTMLElement | null = null;

  public readonly strip = computed(() =>
    this.sweeps.strip(
      this.parameter(),
      this.modelSlug() ?? this.sweeps.studioModelSlug(),
      this.sceneId(),
    ),
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

    // The enlarged frame takes focus as it opens, so the keys that close it and
    // the button that dismisses it are where the reader already is.
    afterRenderEffect(() => {
      const panel = this.zoomPanel()?.nativeElement ?? null;
      if (panel && panel !== this.focusedPanel) {
        panel.focus();
      }
      this.focusedPanel = panel;
    });
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
    this.zoom.set(false);
  }

  public openZoom(): void {
    this.zoom.set(true);
  }

  /** Closing hands focus back to the frame that opened the enlarged view. */
  public closeZoom(): void {
    this.zoom.set(false);
    this.zoomTrigger()?.nativeElement.focus();
  }

  /** The backdrop closes; a press that landed on the panel itself does not. */
  public onViewerBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeZoom();
    }
  }

  /**
   * Escape closes. Tab is held inside the layer by hand: the panel carries one
   * control, so keeping focus on it is the whole trap.
   */
  public onViewerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closeZoom();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      this.zoomClose()?.nativeElement.focus();
    }
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
