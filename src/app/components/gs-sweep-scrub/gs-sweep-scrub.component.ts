import { NgTemplateOutlet } from '@angular/common';
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
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';
import {
  SWEEP_PARAMETER_FALLBACK_LABEL_KEY,
  SWEEP_PARAMETER_LABEL_KEY,
  SWEEP_VARIANT_PARAMETER,
  SweepLibraryService,
  SweepStop,
} from '../../services/sweep-library.service';

/** The four copies a `tile_repeat_2x2` frame is laid out as. */
const TILE_CELLS = [0, 1, 2, 3] as const;

/** Where the whole answer about samplers lives, for the folded note's last line. */
const SAMPLER_REFERENCE = '/generate/learn/settings/sampler';

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
 * A strip of two frames is a before and an after rather than a range, and gets
 * them side by side: a slider between two positions asks the reader to flick
 * back and forth to hold a comparison they could simply be shown. Frames the
 * index marks `tile_repeat_2x2` are single tiles, and are laid out as four
 * copies, because a seam only exists where one copy meets the next.
 *
 * When the library has no strip for the parameter, the component renders
 * nothing at all. That is the state the app is in before the library is
 * published, and it has to look finished in it.
 */
@Component({
  selector: 'app-gs-sweep-scrub',
  imports: [TranslocoPipe, IconComponent, NgTemplateOutlet, RouterLink],
  template: `
    <!-- One frame, however this strip's frames have to be drawn. A tiled strip
         has no single image to hang alt text on, so the four copies are one
         labelled group and the copies themselves are decoration. -->
    <ng-template #frame let-stop="stop" let-cls="cls">
      @if (tiled()) {
        <span
          [class]="cls"
          class="gs-sweep-tiled"
          role="img"
          [attr.aria-label]="
            'generate.sweeps.tiled_alt' | transloco: { value: labelOf(stop) }
          "
        >
          @for (cell of tileCells; track cell) {
            <img
              class="gs-sweep-tile"
              [src]="frameUrl(stop)"
              alt=""
              loading="lazy"
              (load)="onFrameLoad()"
            />
          }
        </span>
      } @else {
        <img
          [class]="cls"
          [src]="frameUrl(stop)"
          [alt]="
            'generate.sweeps.frame_alt' | transloco: { value: labelOf(stop) }
          "
          loading="lazy"
          (load)="onFrameLoad()"
        />
      }
    </ng-template>

    @if (strip()) {
      <div class="gs-sweep">
        @if (expanded()) {
          <div class="gs-sweep-open">
            @if (hasVariant()) {
              <!-- Steps read differently depending on whether the sampler
                   re-rolls the detail or settles towards one picture, and one
                   strip can only be of one of them. -->
              <div
                class="gs-sweep-variants"
                role="group"
                [attr.aria-label]="'generate.sweeps.variant_label' | transloco"
              >
                <button
                  type="button"
                  class="gs-sweep-variant"
                  [class.is-on]="!onVariant()"
                  [attr.aria-pressed]="!onVariant()"
                  (click)="useVariant(false)"
                >
                  {{ 'generate.sweeps.variant_base' | transloco }}
                </button>
                <button
                  type="button"
                  class="gs-sweep-variant"
                  [class.is-on]="onVariant()"
                  [attr.aria-pressed]="onVariant()"
                  (click)="useVariant(true)"
                >
                  {{ 'generate.sweeps.variant_alt' | transloco }}
                </button>
              </div>

              <!-- The toggle names two kinds of sampler and assumes the reader
                   knows which theirs is. Answering that is more than a label can
                   carry and less than a trip to the reference is worth, so it
                   sits here, folded, with the two lists in full. -->
              <button
                type="button"
                class="gs-sweep-why"
                [attr.aria-expanded]="variantWhyOpen()"
                (click)="toggleVariantWhy()"
              >
                {{ 'generate.sweeps.variant_why' | transloco }}
              </button>
              @if (variantWhyOpen()) {
                <div class="gs-sweep-why-body">
                  <p>{{ 'generate.sweeps.variant_why_body' | transloco }}</p>
                  <p class="gs-sweep-why-list">
                    {{ 'generate.sweeps.variant_why_rerollers' | transloco }}
                  </p>
                  <p class="gs-sweep-why-list">
                    {{ 'generate.sweeps.variant_why_settlers' | transloco }}
                  </p>
                  <a class="gs-sweep-why-link" [routerLink]="samplerReference">
                    {{ 'generate.sweeps.variant_why_link' | transloco }}
                  </a>
                </div>
              }
            }

            @if (sourceUrl(); as source) {
              <!-- What the sweep was painted over. Without it the low end of a
                   denoising strip looks like a weak render rather than a
                   faithful one. -->
              <figure class="gs-sweep-source">
                <img
                  class="gs-sweep-source-img"
                  [src]="source"
                  [alt]="'generate.sweeps.source_alt' | transloco"
                  loading="lazy"
                />
                <figcaption class="gs-sweep-source-cap">
                  {{ 'generate.sweeps.source_label' | transloco }}
                </figcaption>
              </figure>
            }

            @if (paired()) {
              <div
                class="gs-sweep-pair"
                [attr.aria-label]="'generate.sweeps.pair_label' | transloco"
              >
                @for (side of strip()!.stops; track side.file; let i = $index) {
                  <figure class="gs-sweep-pair-item">
                    <button
                      #zoomTrigger
                      type="button"
                      class="gs-sweep-zoom"
                      [attr.aria-label]="'generate.sweeps.enlarge' | transloco"
                      (click)="openZoom(i, i)"
                    >
                      <ng-container
                        [ngTemplateOutlet]="frame"
                        [ngTemplateOutletContext]="{
                          stop: side,
                          cls: 'gs-sweep-frame',
                        }"
                      />
                    </button>
                    <figcaption>
                      <span class="gs-sweep-pair-name">
                        @if (stateKey(side); as key) {
                          {{ key | transloco }}
                        } @else {
                          {{ labelOf(side) }}
                        }
                      </span>
                      <span class="gs-sweep-pair-cap">{{ side.caption }}</span>
                    </figcaption>
                  </figure>
                }
              </div>
            } @else {
              <figure class="gs-sweep-figure">
                <!-- The frame is as wide as the column it sits in, which in the
                     form is narrow enough to lose the detail the sweep is about,
                     so the frame is itself the way to a full-size look. -->
                <button
                  #zoomTrigger
                  type="button"
                  class="gs-sweep-zoom"
                  [attr.aria-label]="'generate.sweeps.enlarge' | transloco"
                  (click)="openZoom(index(), 0)"
                >
                  <ng-container
                    [ngTemplateOutlet]="frame"
                    [ngTemplateOutletContext]="{
                      stop: stop(),
                      cls: 'gs-sweep-frame',
                    }"
                  />
                </button>
                <figcaption class="gs-sweep-caption">
                  {{ stop().caption }}
                </figcaption>
              </figure>

              <p class="gs-sweep-value" role="status" aria-live="polite">
                {{ valueKeyOf(stop()) | transloco: valueParamsOf(stop()) }}
              </p>
            }

            @if (!frameLoaded()) {
              <p class="gs-sweep-loading">
                {{ 'generate.sweeps.loading' | transloco }}
              </p>
            }

            @if (!paired()) {
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
            }

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
              {{
                'generate.sweeps.expand'
                  | transloco: { setting: parameterLabelKey() | transloco }
              }}
            </span>
          </button>
        }

        @if (zoomStop(); as shown) {
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
                'generate.sweeps.enlarged_title'
                  | transloco: { value: labelOf(shown) }
              "
              (keydown)="onViewerKeydown($event)"
            >
              <div class="gs-sweep-viewer-top">
                <span class="gs-sweep-viewer-name">
                  {{ valueKeyOf(shown) | transloco: valueParamsOf(shown) }}
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
              <div class="gs-sweep-viewer-stage">
                @if (sourceUrl(); as source) {
                  <figure class="gs-sweep-viewer-source">
                    <img
                      class="gs-sweep-viewer-source-img"
                      [src]="source"
                      [alt]="'generate.sweeps.source_alt' | transloco"
                    />
                    <figcaption class="gs-sweep-source-cap">
                      {{ 'generate.sweeps.source_label' | transloco }}
                    </figcaption>
                  </figure>
                }
                <ng-container
                  [ngTemplateOutlet]="frame"
                  [ngTemplateOutletContext]="{
                    stop: shown,
                    cls: 'gs-sweep-viewer-img',
                  }"
                />
              </div>
              <p class="gs-sweep-viewer-cap">{{ shown.caption }}</p>
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
  private readonly zoom = signal<number | null>(null);
  private readonly variant = signal(false);
  private readonly variantWhy = signal(false);

  /** The four copies of a tiled frame, as something the template can repeat. */
  public readonly tileCells = TILE_CELLS;
  public readonly samplerReference = SAMPLER_REFERENCE;

  public readonly expanded = this.open.asReadonly();
  public readonly frameLoaded = this.loaded.asReadonly();
  /** Whether the reader asked for the second strip of a pair of strips. */
  public readonly onVariant = this.variant.asReadonly();
  /** Whether the note under the variant toggle is unfolded. */
  public readonly variantWhyOpen = this.variantWhy.asReadonly();

  private readonly zoomTriggers =
    viewChildren<ElementRef<HTMLButtonElement>>('zoomTrigger');
  private readonly zoomPanel = viewChild<ElementRef<HTMLElement>>('zoomPanel');
  private readonly zoomClose =
    viewChild<ElementRef<HTMLButtonElement>>('zoomClose');

  /** Which frame opened the enlarged view, so closing hands focus back to it. */
  private opener = 0;

  /** The panel focus was last moved to, so an unrelated render cannot re-take it. */
  private focusedPanel: HTMLElement | null = null;

  /**
   * What the collapsed offer calls the setting. Naming it is what separates one
   * offer from the next where a step or a reference entry carries more than one:
   * "See what changing this does" twice on a page answers neither.
   */
  public readonly parameterLabelKey = computed(
    () =>
      SWEEP_PARAMETER_LABEL_KEY[this.parameter()] ??
      SWEEP_PARAMETER_FALLBACK_LABEL_KEY,
  );

  /** The strip a pair of strips offers as its second reading, if there is one. */
  public readonly variantParameter = computed(
    () => SWEEP_VARIANT_PARAMETER[this.parameter()] ?? null,
  );

  /** Which of the pair is on show. */
  public readonly activeParameter = computed(() => {
    const alternate = this.variantParameter();
    return this.variant() && alternate ? alternate : this.parameter();
  });

  public readonly strip = computed(() =>
    this.sweeps.strip(
      this.activeParameter(),
      this.modelSlug() ?? this.sweeps.studioModelSlug(),
      this.sceneId(),
    ),
  );

  /** Whether both readings of this parameter were actually published. */
  public readonly hasVariant = computed(() => {
    const alternate = this.variantParameter();
    return (
      !!alternate &&
      !!this.sweeps.strip(
        alternate,
        this.modelSlug() ?? this.sweeps.studioModelSlug(),
        this.sceneId(),
      )
    );
  });

  /** A strip of two frames is a before and an after, not a range. */
  public readonly paired = computed(() => this.strip()?.stops.length === 2);

  /** Whether the frames are single tiles that only read once repeated. */
  public readonly tiled = computed(
    () => this.strip()?.presentation === 'tile_repeat_2x2',
  );

  /** The image the strip was painted over, on the strips that start from one. */
  public readonly sourceUrl = computed(() => {
    const source = this.strip()?.source_image;
    return source ? this.sweeps.assetUrl(source) : null;
  });

  public readonly lastIndex = computed(
    () => (this.strip()?.stops.length ?? 1) - 1,
  );

  /**
   * The middle stop stands in for the strip while it is collapsed: an end of the
   * range would advertise the extreme rather than the typical. Swapping to the
   * other reading of a parameter keeps the position, clamped to what the second
   * strip has, so the reader stays where they were looking.
   */
  public readonly index = computed(() => {
    const held = this.cursor();
    return held === null
      ? Math.floor(((this.strip()?.stops.length ?? 1) - 1) / 2)
      : Math.min(held, this.lastIndex());
  });

  public readonly stop = computed<SweepStop>(
    () => this.strip()!.stops[this.index()],
  );

  /** The frame on show full size, or null when nothing is. */
  public readonly zoomStop = computed<SweepStop | null>(() => {
    const at = this.zoom();
    return at === null ? null : (this.strip()?.stops[at] ?? null);
  });

  /** Whether the frame is also on show full size, over everything else. */
  public readonly zoomed = computed(() => this.zoomStop() !== null);

  /**
   * How the stop is read out. The index labels every stop, including the ones
   * whose value is a flag rather than a number, so the label is preferred over
   * the raw value wherever there is one.
   */
  public readonly valueLabel = computed(() => this.labelOf(this.stop()));

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

  /**
   * The token a stop is read out by, e.g. `12` or `off`. A stop that carries a
   * piece of prompt text is read out by its value instead: on those strips the
   * label is a filename token (`w1_5`) and the value is the wording written to
   * be read.
   */
  public labelOf(stop: SweepStop): string {
    if (stop.prompt_fragment) {
      return String(stop.value);
    }
    return stop.label || String(stop.value);
  }

  /**
   * Which line names the frame. A strip that varies the wording is named by the
   * text it was rendered with: the number in it is a weight inside a prompt
   * rather than a setting the panel has a field for.
   */
  public valueKeyOf(stop: SweepStop): string {
    return stop.prompt_fragment
      ? 'generate.sweeps.value_prompt'
      : 'generate.sweeps.value';
  }

  public valueParamsOf(stop: SweepStop): { value: string } {
    return { value: stop.prompt_fragment || this.labelOf(stop) };
  }

  /**
   * The heading a side of a pair is named by, when the pair varies a switch: the
   * label the index carries for those is `off`/`on`, which reads as a filename
   * rather than as a heading. Null on anything else, which is headed by its
   * label.
   */
  public stateKey(stop: SweepStop): string | null {
    if (stop.value === true) {
      return 'generate.sweeps.state_on';
    }
    return stop.value === false ? 'generate.sweeps.state_off' : null;
  }

  public expand(): void {
    this.open.set(true);
    this.loaded.set(false);
    this.prefetchNeighbours();
  }

  public collapse(): void {
    this.open.set(false);
    this.zoom.set(null);
  }

  public toggleVariantWhy(): void {
    this.variantWhy.update((open) => !open);
  }

  /** Swap between the two readings of a parameter, holding the slider position. */
  public useVariant(on: boolean): void {
    this.variant.set(on);
    this.loaded.set(false);
    this.zoom.set(null);
  }

  public openZoom(stopIndex: number, trigger: number): void {
    this.opener = trigger;
    this.zoom.set(stopIndex);
  }

  /** Closing hands focus back to the frame that opened the enlarged view. */
  public closeZoom(): void {
    this.zoom.set(null);
    this.zoomTriggers()[this.opener]?.nativeElement.focus();
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
