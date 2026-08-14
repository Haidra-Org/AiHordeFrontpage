import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';
import { GsCompareWipeComponent } from '../gs-compare-wipe/gs-compare-wipe.component';
import { GsSettingChipComponent } from '../gs-setting-chip/gs-setting-chip.component';
import {
  SweepVariantPair,
  settingProseLabelKey,
  sweepVariantPair,
} from '../../content/settings';
import {
  SweepLibraryService,
  SweepStop,
} from '../../services/sweep-library.service';
import { docsSettingLink } from '../../content/docs-links';

/**
 * The nine copies a `tile_repeat_3x3` frame is laid out as. Three across rather
 * than two puts whole joins inside the plate instead of only at the point where
 * four corners meet, which is where a seam is easiest to see.
 */
const TILE_CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Where the whole answer about samplers lives, for the folded note's last line. */
const SAMPLER_REFERENCE = docsSettingLink('sampler');

/** Which way each arrow key steps through the stops in the full-size view. */
const VIEWER_STEPS: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowDown: 1,
};

/**
 * What Tab may land on inside the full-size view. The wipe's divider is a
 * slider built out of a div rather than an input, and leaving it out of the
 * cycle would make the one control a pair strip has unreachable in the layer.
 */
const VIEWER_FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [role="slider"][tabindex="0"]';

/**
 * A parameter sweep the reader can scrub: the same scene rendered across a range
 * of one setting, so "more steps means more detail, up to a point" is something
 * they see rather than something they are told.
 *
 * It starts collapsed behind one line of offer, because it sits inside prose the
 * reader is already reading and a strip of images opening under every field
 * would bury the prose. Nothing is fetched until they ask for it, and under
 * `prefers-reduced-data` even the single preview frame waits for the tap: a
 * reader on a metered connection gets the offer, not the images. A page whose
 * whole subject is the one setting has no prose to bury and opens the strip
 * itself, through `startExpanded`.
 *
 * Pressing a frame hands the whole scrubber to a full-size layer rather than
 * lifting one picture out of it: at the size the strip is drawn on a page the
 * differences between neighbouring stops are exactly what is hardest to see, so
 * the slider, the captions and the pair toggle all come with it.
 *
 * A strip of two frames is a before and an after rather than a range, and is
 * handed to the wipe: a slider between two positions asks the reader to flick
 * back and forth to hold a comparison they could simply be shown, and two
 * copies set apart asks them to carry half the picture across the gap. Where
 * the halves would be too small to read the wipe shows the pair side by side
 * itself. Frames the index marks `tile_repeat_3x3` are single tiles, and are
 * laid out as a three-by-three plate beside the tile on its own: a seam only
 * exists where one copy meets the next, and only the isolated tile says what was
 * actually rendered.
 *
 * When the library has no strip for the parameter, the component renders
 * nothing at all. That is the state the app is in before the library is
 * published, and it has to look finished in it.
 */
@Component({
  selector: 'app-gs-sweep-scrub',
  imports: [
    TranslocoPipe,
    IconComponent,
    NgTemplateOutlet,
    RouterLink,
    GsCompareWipeComponent,
    GsSettingChipComponent,
  ],
  template: `
    <!-- The tile a repeated plate is made of, on its own. The plate answers
         "do the joins show"; only the single image answers "what was actually
         rendered", and a tiling strip has to say both at once rather than make
         the reader toggle between the two readings of one picture. -->
    <ng-template #solo let-stop="stop">
      <span class="gs-sweep-solo">
        <img
          class="gs-sweep-solo-img"
          [src]="frameUrl(stop)"
          [alt]="
            'generate.sweeps.tile_solo_alt'
              | transloco: { value: valueTextOf(stop) }
          "
          loading="lazy"
        />
        <span class="gs-sweep-solo-cap">
          {{ 'generate.sweeps.tile_solo_label' | transloco }}
        </span>
      </span>
    </ng-template>

    <!-- One frame, however this strip's frames have to be drawn. A tiled strip
         has no single image to hang alt text on, so the nine copies are one
         labelled group and the copies themselves are decoration. -->
    <ng-template #frame let-stop="stop" let-cls="cls">
      @if (tiled()) {
        <span [class]="cls" class="gs-sweep-tileset">
          <span
            class="gs-sweep-tiled"
            role="img"
            [attr.aria-label]="
              'generate.sweeps.tiled_alt'
                | transloco: { value: valueTextOf(stop) }
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
          <ng-container
            [ngTemplateOutlet]="solo"
            [ngTemplateOutletContext]="{ stop: stop }"
          />
        </span>
      } @else {
        <img
          [class]="cls"
          [src]="frameUrl(stop)"
          [alt]="
            'generate.sweeps.frame_alt'
              | transloco: { value: valueTextOf(stop) }
          "
          loading="lazy"
          (load)="onFrameLoad()"
        />
      }
    </ng-template>

    <!-- The two sides of a before-and-after strip, wiped over each other. The
         chips are the sides' labels: the same token the caption under a range
         strip carries, so "Tiling On" reads the same wherever it is said. -->
    <ng-template #wipe let-sides="sides">
      <app-gs-compare-wipe
        [beforeSrc]="frameUrl(sides[0])"
        [afterSrc]="frameUrl(sides[1])"
        [beforeAlt]="frameAlt(sides[0])"
        [afterAlt]="frameAlt(sides[1])"
        [tiled]="tiled()"
        (imageLoad)="onFrameLoad()"
      >
        <app-gs-setting-chip
          wipe-before
          [settingId]="activeParameter()"
          [value]="sides[0].value"
        />
        <app-gs-setting-chip
          wipe-after
          [settingId]="activeParameter()"
          [value]="sides[1].value"
        />
      </app-gs-compare-wipe>
    </ng-template>

    <!-- Some parameters have two readings rather than one fuller one: steps
         read differently on a sampler that re-rolls the detail than on one that
         settles, and a part-finished render can be shown as what the canvas
         holds or as what the model is heading towards. One strip can only be of
         one of them, so the pair is one viewer with the choice in it, wherever
         the frames are: the strip, and the full-size view once it is open. -->
    <ng-template #variants>
      @if (variantPair(); as pair) {
        <div
          class="gs-sweep-variants"
          role="group"
          [attr.aria-label]="pair.groupLabelKey | transloco"
        >
          <button
            type="button"
            class="gs-sweep-variant"
            [class.is-on]="!onVariant()"
            [attr.aria-pressed]="!onVariant()"
            (click)="useVariant(false)"
          >
            {{ pair.baseLabelKey | transloco }}
          </button>
          <button
            type="button"
            class="gs-sweep-variant"
            [class.is-on]="onVariant()"
            [attr.aria-pressed]="onVariant()"
            (click)="useVariant(true)"
          >
            {{ pair.altLabelKey | transloco }}
          </button>
        </div>
      }
    </ng-template>

    @if (strip()) {
      <div class="gs-sweep">
        @if (expanded()) {
          <div class="gs-sweep-open">
            @if (hasVariant()) {
              <ng-container [ngTemplateOutlet]="variants" />

              <!-- The sampler toggle names two kinds of sampler and assumes the
                   reader knows which theirs is. Answering that is more than a
                   label can carry and less than a trip to the reference is
                   worth, so it sits here, folded, with the two lists in full.
                   No other pair raises the question, and none of them carry it. -->
              @if (variantPair()?.samplerNote) {
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
                    <a
                      class="gs-sweep-why-link"
                      [routerLink]="samplerReference"
                    >
                      {{ 'generate.sweeps.variant_why_link' | transloco }}
                    </a>
                  </div>
                }
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

            @if (pairSides(); as sides) {
              <!-- A before and an after of one scene, wiped rather than set
                   apart: the difference is in one place, and a gap between two
                   copies is exactly the distance the reader would have to carry
                   it across. The wipe drops back to the pair itself where the
                   halves would be too small to read. -->
              <figure
                class="gs-sweep-pair"
                [attr.aria-label]="'generate.sweeps.pair_label' | transloco"
              >
                <ng-container
                  [ngTemplateOutlet]="wipe"
                  [ngTemplateOutletContext]="{ sides: sides }"
                />
                <!-- The wipe carries the plates, so the two tiles themselves go
                     under it, in the columns the captions already read in. -->
                @if (tiled()) {
                  <div class="gs-sweep-solos">
                    @for (side of sides; track side.file) {
                      <ng-container
                        [ngTemplateOutlet]="solo"
                        [ngTemplateOutletContext]="{ stop: side }"
                      />
                    }
                  </div>
                }
                <figcaption class="gs-sweep-pair-caps">
                  @for (side of sides; track side.file) {
                    <span class="gs-sweep-pair-cap">{{ side.caption }}</span>
                  }
                </figcaption>
                <!-- The picture is the divider's now, so the way to full size
                     is a control of its own rather than a press on the frame. -->
                <button
                  #zoomTrigger
                  type="button"
                  class="gs-sweep-pair-enlarge"
                  (click)="openZoom(0, 0)"
                >
                  {{ 'generate.sweeps.pair_enlarge' | transloco }}
                </button>
              </figure>
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
                <!-- The setting and its value lead, as the one token the reader
                     is here to read; the sentence about what it did to the
                     picture follows it. The caption is the live region, so a
                     scrub announces both together rather than a bare number. -->
                <figcaption
                  class="gs-sweep-caption"
                  role="status"
                  aria-live="polite"
                >
                  @if (stop().prompt_fragment) {
                    <span class="gs-sweep-caption-value">
                      {{
                        'generate.sweeps.value_prompt'
                          | transloco: valueParamsOf(stop())
                      }}
                    </span>
                  } @else {
                    <app-gs-setting-chip
                      [settingId]="activeParameter()"
                      [value]="stop().value"
                    />
                  }
                  <span class="gs-sweep-caption-text">{{
                    stop().caption
                  }}</span>
                  <!-- Curation is disclosed rather than hidden: a frame picked
                       from a batch says so, because generation is stochastic
                       and pretending the first roll looked like this would
                       teach the wrong lesson. -->
                  @if ((stop().batch_size ?? 1) > 1) {
                    <span class="gs-sweep-caption-batch">{{
                      'generate.sweeps.batch_note'
                        | transloco: { n: stop().batch_size }
                    }}</span>
                  }
                </figcaption>
              </figure>
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
                paired()
                  ? ('generate.sweeps.enlarged_pair_title' | transloco)
                  : ('generate.sweeps.enlarged_title'
                    | transloco: { value: valueTextOf(shown) })
              "
              (keydown)="onViewerKeydown($event)"
            >
              <div class="gs-sweep-viewer-top">
                <span class="gs-sweep-viewer-name">
                  @if (paired()) {
                    {{ 'generate.sweeps.pair_label' | transloco }}
                  } @else if (shown.prompt_fragment) {
                    {{
                      'generate.sweeps.value_prompt'
                        | transloco: valueParamsOf(shown)
                    }}
                  } @else {
                    <app-gs-setting-chip
                      [settingId]="activeParameter()"
                      [value]="shown.value"
                    />
                  }
                </span>
                <button
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
                <!-- Full size is where a wipe is worth the most, so a pair is
                     the same wipe here rather than one side lifted out of it. -->
                @if (pairSides(); as sides) {
                  <div class="gs-sweep-viewer-wipe">
                    <ng-container
                      [ngTemplateOutlet]="wipe"
                      [ngTemplateOutletContext]="{ sides: sides }"
                    />
                    @if (tiled()) {
                      <div class="gs-sweep-solos">
                        @for (side of sides; track side.file) {
                          <ng-container
                            [ngTemplateOutlet]="solo"
                            [ngTemplateOutletContext]="{ stop: side }"
                          />
                        }
                      </div>
                    }
                  </div>
                } @else {
                  <ng-container
                    [ngTemplateOutlet]="frame"
                    [ngTemplateOutletContext]="{
                      stop: shown,
                      cls: 'gs-sweep-viewer-img',
                    }"
                  />
                }
              </div>
              <p class="gs-sweep-viewer-cap">
                @if (pairSides(); as sides) {
                  <span class="gs-sweep-pair-caps">
                    @for (side of sides; track side.file) {
                      <span class="gs-sweep-pair-cap">{{ side.caption }}</span>
                    }
                  </span>
                } @else {
                  {{ shown.caption }}
                }
              </p>

              <!-- Full size is where the differences between stops are actually
                   readable, so the scrubber comes with it rather than being left
                   behind on the page: stepping here is the point of opening it. -->
              <div class="gs-sweep-viewer-foot">
                @if (hasVariant()) {
                  <ng-container [ngTemplateOutlet]="variants" />
                }
                @if (!paired()) {
                  <input
                    class="gs-range gs-sweep-range"
                    type="range"
                    min="0"
                    step="1"
                    [max]="lastIndex()"
                    [value]="zoomIndex()"
                    [attr.aria-label]="
                      'generate.sweeps.slider_label' | transloco
                    "
                    [attr.aria-valuetext]="valueTextOf(shown)"
                    (input)="onZoomScrub($event)"
                  />
                }
              </div>
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
  private readonly transloco = inject(TranslocoService);

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
  /**
   * Open the strip without waiting to be asked. A page whose whole subject is
   * one setting has nothing to bury the pictures under, so it shows them; every
   * other surface sits inside prose and keeps the offer.
   */
  public readonly startExpanded = input(false);

  private readonly cursor = signal<number | null>(null);
  private readonly open = linkedSignal(() => this.startExpanded());
  private readonly loaded = signal(false);
  private readonly zoom = signal<number | null>(null);
  private readonly variant = signal(false);
  private readonly variantWhy = signal(false);

  /** The nine copies of a tiled frame, as something the template can repeat. */
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

  /** Which frame opened the enlarged view, so closing hands focus back to it. */
  private opener = 0;

  /** The panel focus was last moved to, so an unrelated render cannot re-take it. */
  private focusedPanel: HTMLElement | null = null;

  /**
   * What the collapsed offer calls the setting. Naming it is what separates one
   * offer from the next where a step or a reference entry carries more than one:
   * "See what changing this does" twice on a page answers neither.
   */
  public readonly parameterLabelKey = computed(() =>
    settingProseLabelKey(this.parameter()),
  );

  /** The second reading this parameter is published with, if there is one. */
  public readonly variantPair = computed<SweepVariantPair | null>(() =>
    sweepVariantPair(this.parameter()),
  );

  /** Which of the pair is on show. */
  public readonly activeParameter = computed(() => {
    const pair = this.variantPair();
    return this.variant() && pair ? pair.parameter : this.parameter();
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
    const pair = this.variantPair();
    return (
      !!pair &&
      !!this.sweeps.strip(
        pair.parameter,
        this.modelSlug() ?? this.sweeps.studioModelSlug(),
        this.sceneId(),
      )
    );
  });

  /** A strip of two frames is a before and an after, not a range. */
  public readonly paired = computed(() => this.strip()?.stops.length === 2);

  /** Those two frames, in the order they read, or null on a range strip. */
  public readonly pairSides = computed<SweepStop[] | null>(() => {
    const stops = this.strip()?.stops;
    return stops?.length === 2 ? stops : null;
  });

  /** Whether the frames are single tiles that only read once repeated. */
  public readonly tiled = computed(
    () => this.strip()?.presentation === 'tile_repeat_3x3',
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

  /** Which stop the full-size view is on, before it has been moved off. */
  public readonly zoomIndex = computed(() => this.zoom() ?? 0);

  /** The frame on show full size, or null when nothing is. */
  public readonly zoomStop = computed<SweepStop | null>(() => {
    const at = this.zoom();
    return at === null ? null : (this.strip()?.stops[at] ?? null);
  });

  /** Whether the frame is also on show full size, over everything else. */
  public readonly zoomed = computed(() => this.zoomStop() !== null);

  /** How the stop on the strip is read out, for the slider's own voice. */
  public readonly valueLabel = computed(() => this.valueTextOf(this.stop()));

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
   * The value a stop was rendered at, as it reads: digits for a number, a state
   * the page has words for on a flag, and the text itself for anything else.
   *
   * Never the stop's own label, which is a token safe to put in a filename and
   * says so: the denoising strip labels 0.15 as `0_15`, which is the name of a
   * file rather than a setting anybody set.
   */
  public valueTextOf(stop: SweepStop): string {
    if (typeof stop.value === 'boolean') {
      return this.transloco.translate(
        stop.value ? 'generate.sweeps.state_on' : 'generate.sweeps.state_off',
      );
    }
    return String(stop.value);
  }

  /**
   * How a frame describes itself to a reader who cannot see it, in the words
   * the template uses on the frames it draws itself: a tiled frame is the one
   * tile nine times over, and everything else is the scene at this value.
   */
  public frameAlt(stop: SweepStop): string {
    return this.transloco.translate(
      this.tiled() ? 'generate.sweeps.tiled_alt' : 'generate.sweeps.frame_alt',
      { value: this.valueTextOf(stop) },
    );
  }

  /**
   * What names a frame that varies the wording rather than a field: the text it
   * was rendered with, the number in it being a weight inside a prompt rather
   * than a setting the panel has a field for.
   */
  public valueParamsOf(stop: SweepStop): { value: string } {
    return { value: stop.prompt_fragment || this.valueTextOf(stop) };
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

  /**
   * Swap between the two readings of a parameter, holding the slider position.
   * The full-size view holds its position too rather than closing: the toggle is
   * offered inside it, and a swap that threw the reader back to the page would
   * be answering the comparison by ending it.
   */
  public useVariant(on: boolean): void {
    this.variant.set(on);
    this.loaded.set(false);
    const last = this.lastIndex();
    this.zoom.update((at) => (at === null ? null : Math.min(at, last)));
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
   * Escape closes, the arrows step between stops, and Tab is held inside the
   * layer by hand: the panel is the scrubber now, so the trap has to cycle its
   * controls rather than parking focus on the way out. Arrows pressed on the
   * slider itself are the slider's own, and reach here already answered.
   */
  public onViewerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closeZoom();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      this.cycleViewerFocus(event.shiftKey);
      return;
    }
    const step = VIEWER_STEPS[event.key];
    if (step === undefined || event.target instanceof HTMLInputElement) {
      return;
    }
    event.preventDefault();
    this.stepZoom(step);
  }

  /** Move the full-size view one stop along, and the strip under it with it. */
  public stepZoom(delta: number): void {
    const at = this.zoom();
    if (at === null) {
      return;
    }
    this.moveZoom(at + delta);
  }

  public onZoomScrub(event: Event): void {
    const next = Number((event.target as HTMLInputElement).value);
    if (!Number.isNaN(next)) {
      this.moveZoom(next);
    }
  }

  /**
   * Where the enlarged view is, and where the strip behind it is: closing on a
   * stop the reader scrubbed to and finding the page still on the old one would
   * undo the comparison they just made.
   */
  private moveZoom(to: number): void {
    const at = Math.min(Math.max(to, 0), this.lastIndex());
    this.zoom.set(at);
    this.cursor.set(at);
    this.prefetchNeighbours();
  }

  /** Tab and Shift+Tab, around whatever controls the layer currently carries. */
  private cycleViewerFocus(backwards: boolean): void {
    const panel = this.zoomPanel()?.nativeElement;
    if (!panel) {
      return;
    }
    const stops = Array.from(
      panel.querySelectorAll<HTMLElement>(VIEWER_FOCUSABLE),
    );
    if (stops.length === 0) {
      return;
    }
    const at = stops.indexOf(document.activeElement as HTMLElement);
    const next =
      at === -1
        ? backwards
          ? stops.length - 1
          : 0
        : (at + (backwards ? -1 : 1) + stops.length) % stops.length;
    stops[next].focus();
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
