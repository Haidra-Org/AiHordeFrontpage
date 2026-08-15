import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
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
  GsRecipeChipsComponent,
  RecipeParams,
  RecipeRequest,
} from '../gs-recipe-chips/gs-recipe-chips.component';
import {
  SweepVariantPair,
  settingProseLabelKey,
  settingSection,
  sweepOpensAtFirstStop,
  sweepPairStartsApart,
  sweepVariantPair,
} from '../../content/settings';
import { sectionIdentity } from '../../content/sections';
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

/**
 * How a model family reads on the provenance line. The library records the
 * baseline in the API's own vocabulary; a reader gets the name the panel's
 * dimension presets already taught them, and an unlisted family reads as the
 * recorded token rather than being hidden.
 */
const BASELINE_LABELS: Record<string, string> = {
  stable_diffusion_1: 'SD 1.5',
  stable_diffusion_2_512: 'SD 2',
  stable_diffusion_2_768: 'SD 2 (768)',
  stable_diffusion_xl: 'SDXL',
  stable_cascade: 'Stable Cascade',
  flux_1: 'Flux',
};

/** Which way each arrow key steps through the stops in the full-size view. */
const VIEWER_STEPS: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowDown: 1,
};

/** Which scrubber a rail is driving: the strip on the page, or the layer. */
type RailMode = 'strip' | 'zoom';

/**
 * Whether a key landed on a control that steps by itself. The layer's arrow
 * handling would otherwise move two stops for one press on the rail inside it,
 * and drag the wipe's divider and the frames under it at the same time.
 */
function isSlider(target: EventTarget | null): boolean {
  return target instanceof Element && target.getAttribute('role') === 'slider';
}

/** What each key does on the tick rail, in stops or as an end of the strip. */
const RAIL_STEPS: Readonly<Record<string, number | 'first' | 'last'>> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
  Home: 'first',
  End: 'last',
};

/**
 * How wide an end label is allowed to be, as a share of the lane. It is also
 * how far in from the lane's edges a label may be placed, so the outermost
 * numbers stay inside the plate however dense the strip or long the value.
 */
const END_LABEL_PERCENT = 30;

/**
 * How far a finger has to travel before the lane treats the gesture as a scrub.
 * Below this the direction is not yet known, and claiming the gesture early
 * would stop a reader scrolling the page they happened to touch the lane on.
 */
const DRAG_INTENT_PX = 4;

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
 * It starts collapsed, because it sits inside prose the reader is already
 * reading and a strip of images opening under every field would bury it. The
 * collapsed card leads with three of the strip's own frames on the dark stage
 * rather than with a sentence: a sentence about a setting is the same sentence
 * on every setting, which is what made a page carrying ten of these read as one
 * offer repeated. Under `prefers-reduced-data` even those frames wait for the
 * tap, and a reader on a metered connection gets the words alone. A page whose
 * whole subject is the one setting has no prose to bury and opens the strip
 * itself, through `startExpanded`; a surface carrying several drops to the
 * one-line card, through `register`.
 *
 * Open, everything the strip has lives inside one dark plate: its name, the
 * frame, the caption, the rail, the value, the position, and the way back out.
 * Before that the frame sat on the page with a bare slider and a floating link
 * under it, and neither read as belonging to the pictures.
 *
 * Pressing a frame hands the whole scrubber to a full-size layer rather than
 * lifting one picture out of it: at the size the strip is drawn on a page the
 * differences between neighbouring stops are exactly what is hardest to see, so
 * the rail, the captions and the pair toggle all come with it.
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
    GsRecipeChipsComponent,
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
        [sideBySide]="!wiped()"
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

    <!-- Which way a pair is laid out, offered only where it starts apart: the
         wipe is still the better reading of a difference in one place, and it
         is the pairs whose two frames are different pictures that need asking
         for. It sits with the plate's other controls rather than under the
         picture, where it read as a stray link. -->
    <ng-template #pairMode>
      @if (offersWipeToggle()) {
        <button type="button" class="gs-sweep-pair-mode" (click)="toggleWipe()">
          {{
            (wiped()
              ? 'generate.sweeps.pair_show_apart'
              : 'generate.sweeps.pair_show_wiped'
            ) | transloco
          }}
        </button>
      }
    </ng-template>

    <!-- The scrubber: one slit per frame rather than a track with a knob on it.
         A range input can only say "somewhere between two ends"; the rail says
         how many frames there are, which one is on show, and what the two ends
         were rendered at, without being asked. The row is 44px so a thumb has
         somewhere to land, and the whole rail is one slider to the keyboard
         rather than a dozen tab stops. -->
    <ng-template #rail let-at="at" let-mode="mode">
      <div class="gs-tickrail-box">
        <div
          class="gs-tickrail"
          role="slider"
          tabindex="0"
          [attr.aria-label]="'generate.sweeps.slider_label' | transloco"
          aria-valuemin="1"
          [attr.aria-valuemax]="frameCount()"
          [attr.aria-valuenow]="at + 1"
          [attr.aria-valuetext]="valueTextOf(stopAt(at))"
          (click)="onRailPress($event, mode)"
          (keydown)="onRailKeydown($event, at, mode)"
          (pointerdown)="startRailDrag($event, mode)"
          (pointermove)="onRailDrag($event, mode)"
          (pointerup)="endRailDrag()"
          (pointercancel)="endRailDrag()"
        >
          @for (frame of stops(); track $index) {
            <span
              class="gs-tickrail-tick"
              [class.is-at]="$index === at"
              [style.left.%]="tickPercent($index)"
              [attr.data-at]="$index"
            ></span>
          }
        </div>
        <span class="gs-tickrail-ends">
          <!-- Both end numbers are placed by the same arithmetic the slits are,
               so each sits under the slit it names. Left at the lane's own two
               edges they read as labelling frames that are not there. -->
          <span class="gs-tickrail-end" [style.left.%]="labelPercent(0)">{{
            endValues().first
          }}</span>
          <!-- What the lane is for, said where a reader's eye lands on it: a
               row of slits between two numbers does not announce itself as a
               control, and the invitation is the difference. -->
          <span class="gs-tickrail-hint" aria-hidden="true">{{
            'generate.sweeps.rail_hint' | transloco
          }}</span>
          <span
            class="gs-tickrail-end"
            [style.left.%]="labelPercent(lastIndex())"
            >{{ endValues().last }}</span
          >
        </span>
      </div>
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

    <!-- What kind of evidence this is and which area of the panel it belongs to,
         in one badge. The hue rides on the dash rather than on the words: the
         identity hues are audited as graphic colour only. -->
    <ng-template #badge>
      <span class="gs-cap-eyebrow">
        <span class="gs-cap-dot" aria-hidden="true"></span>
        @if (sectionLabelKey(); as key) {
          {{
            'generate.sweeps.badge_explorer'
              | transloco: { section: key | transloco }
          }}
        } @else {
          {{ 'generate.sweeps.badge_explorer_plain' | transloco }}
        }
      </span>
    </ng-template>

    @if (strip()) {
      <div class="gs-sweep">
        @if (expanded()) {
          <div class="gs-sweep-open">
            <!-- The plate says what it is and holds the way back out, so the
                 control that folds it away is a corner of the picture rather
                 than a link floating under it. -->
            <div class="gs-plate-head">
              <ng-container [ngTemplateOutlet]="badge" />
              <span class="gs-plate-title">
                {{ parameterLabelKey() | transloco }}
              </span>
              @if (paired()) {
                <ng-container [ngTemplateOutlet]="pairMode" />
              }
              <button type="button" class="gs-plate-x" (click)="collapse()">
                {{ 'generate.sweeps.collapse' | transloco }}
                <app-icon name="x-mark" class="gs-ico-sm" />
              </button>
            </div>

            @if (hasVariant()) {
              <!-- Which reading of the parameter is on show, on its own row
                   under the plate's name: it is a control over these pictures
                   rather than the plate's title. -->
              <div class="gs-plate-controls">
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
                      <p>
                        {{ 'generate.sweeps.variant_why_body' | transloco }}
                      </p>
                      <p class="gs-sweep-why-list">
                        {{
                          'generate.sweeps.variant_why_rerollers' | transloco
                        }}
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
              </div>
            }

            <div class="gs-plate-body">
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
            </div>

            @if (!paired()) {
              <ng-container
                [ngTemplateOutlet]="rail"
                [ngTemplateOutletContext]="{ at: index(), mode: 'strip' }"
              />
              <!-- What this frame is, where in the strip it is, and the way to
                   the full-size view: the three things that used to be scattered
                   around the picture, on one line inside the plate. -->
              <div class="gs-plate-foot">
                <span class="gs-plate-value">{{ valueChip() }}</span>
                <span class="gs-plate-pos">
                  {{
                    'generate.sweeps.position'
                      | transloco: { at: index() + 1, n: frameCount() }
                  }}
                </span>
                <span class="gs-plate-grow"></span>
                <button
                  #zoomTrigger
                  type="button"
                  class="gs-plate-link"
                  (click)="openZoom(index(), 1)"
                >
                  {{ 'generate.sweeps.enlarge' | transloco }}
                </button>
              </div>
            }

            <!-- What made these pictures. The model is stated at all times,
                 because a strip means something different on every family; the
                 full request is there for whoever wants the record itself. -->
            <div class="gs-plate-provenance">
              @if (modelChip(); as chip) {
                <span class="gs-plate-model">{{ chip }}</span>
              }
              <span class="gs-plate-grow"></span>
              @if (!paired() && sidecarPath()) {
                <button
                  type="button"
                  class="gs-plate-request-toggle"
                  [attr.aria-expanded]="requestOpen()"
                  (click)="toggleRequest()"
                >
                  <app-icon
                    [name]="requestOpen() ? 'chevron-up' : 'chevron-down'"
                    class="gs-ico-sm"
                  />
                  {{ 'generate.sweeps.full_request' | transloco }}
                </button>
              }
            </div>
            @if (requestOpen() && !paired()) {
              <div class="gs-plate-request">
                @if (requestRecord() === undefined) {
                  <p class="gs-sweep-loading">
                    {{ 'generate.sweeps.loading' | transloco }}
                  </p>
                } @else if (requestRecord() === null) {
                  <p class="gs-sweep-loading">
                    {{ 'generate.sweeps.request_missing' | transloco }}
                  </p>
                } @else {
                  <app-gs-recipe-chips [request]="requestChips()" />
                  <pre class="gs-plate-raw">{{ requestRaw() }}</pre>
                }
              </div>
            }
          </div>
        } @else {
          <!-- The offer, leading with three of the strip's own frames on the
               same dark stage the plate uses. A sentence about the setting is
               the same sentence on every setting, which is what made a page of
               these read as one offer repeated; the frames never are. -->
          <button
            type="button"
            class="gs-sweep-offer gs-cap"
            [class.gs-cap--film]="filmcard()"
            [attr.aria-expanded]="false"
            (click)="expand()"
          >
            @if (showPreview()) {
              <span class="gs-cap-peek" aria-hidden="true">
                @for (peek of peekStops(); track $index) {
                  <img
                    class="gs-cap-peek-frame"
                    [src]="frameUrl(peek)"
                    alt=""
                    loading="lazy"
                  />
                }
              </span>
            }
            <span class="gs-cap-text">
              @if (!filmcard()) {
                <ng-container [ngTemplateOutlet]="badge" />
              }
              <span class="gs-cap-title">
                {{ parameterLabelKey() | transloco }}
              </span>
              <span class="gs-cap-meta">
                <span class="gs-cap-mono">
                  @if (filmcard()) {
                    {{
                      'generate.sweeps.frames_only'
                        | transloco: { n: frameCount() }
                    }}
                  } @else {
                    {{
                      'generate.sweeps.frames_meta' | transloco: metaParams()
                    }}
                  }
                </span>
                @if (!filmcard()) {
                  · {{ 'generate.sweeps.held_constant' | transloco }}
                }
              </span>
            </span>
            <span class="gs-cap-go" aria-hidden="true">
              <app-icon name="chevron-down" class="gs-ico-sm" />
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
                @if (paired()) {
                  <ng-container [ngTemplateOutlet]="pairMode" />
                }
                @if (!paired()) {
                  <ng-container
                    [ngTemplateOutlet]="rail"
                    [ngTemplateOutletContext]="{
                      at: zoomIndex(),
                      mode: 'zoom',
                    }"
                  />
                }
              </div>
            </div>
          </div>
        }
      </div>
    }
  `,
  host: {
    // The area's hue reaches the badge's dash through the same class every
    // other surface tints from, so a capsule wears its section without the
    // component knowing what colour that is.
    '[class]': 'identityClass()',
  },
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
  /**
   * How much room the collapsed capsule takes. `full` is the three-frame card
   * with its badge and its range spelled out; `filmcard` is the one-line
   * version, for the surfaces that carry several of these in a row and would
   * otherwise be a wall of identical cards. Both open the same plate.
   */
  public readonly register = input<'full' | 'filmcard'>('full');

  private readonly cursor = signal<number | null>(null);
  private readonly open = linkedSignal(() => this.startExpanded());
  private readonly loaded = signal(false);
  private readonly zoom = signal<number | null>(null);
  private readonly variant = signal(false);
  private readonly variantWhy = signal(false);
  /** Whether the reader asked for a presentation other than the pair's own. */
  private readonly wipeAsked = signal<boolean | null>(null);

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

  /** Whether a pointer is currently dragging along the rail. */
  private dragging = false;

  /** Where a press on the rail landed, while it is still deciding its way. */
  private pressedAt: { x: number; y: number } | null = null;

  /**
   * What the collapsed offer calls the setting. Naming it is what separates one
   * offer from the next where a step or a reference entry carries more than one:
   * "See what changing this does" twice on a page answers neither.
   */
  public readonly parameterLabelKey = computed(() =>
    settingProseLabelKey(this.parameter()),
  );

  /** Whether the collapsed card is the one-line register. */
  public readonly filmcard = computed(() => this.register() === 'filmcard');

  /** The panel area this setting belongs to, for the badge and its hue. */
  private readonly identity = computed(() =>
    sectionIdentity(settingSection(this.parameter())),
  );

  /** What the badge calls the area, or null where the setting has no area. */
  public readonly sectionLabelKey = computed(
    () => this.identity()?.labelKey ?? null,
  );

  public readonly identityClass = computed(
    () => this.identity()?.className ?? '',
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

  /** Whether the pair carries the toggle between the two presentations. */
  public readonly offersWipeToggle = computed(() =>
    sweepPairStartsApart(this.activeParameter()),
  );

  /**
   * Whether the two frames are wiped over each other rather than set apart.
   * The reader's own choice wins; before they have made one the pair's own
   * default stands.
   */
  public readonly wiped = computed(
    () => this.wipeAsked() ?? !sweepPairStartsApart(this.activeParameter()),
  );

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

  /** Every frame of the strip on show, for the rail to put a slit under. */
  public readonly stops = computed<readonly SweepStop[]>(
    () => this.strip()?.stops ?? [],
  );

  public readonly frameCount = computed(() => this.stops().length);

  /** What the two ends were rendered at, under the ends of the rail. */
  public readonly endValues = computed(() => {
    const stops = this.stops();
    return {
      first: stops.length > 0 ? this.valueTextOf(stops[0]) : '',
      last: stops.length > 0 ? this.valueTextOf(stops[stops.length - 1]) : '',
    };
  });

  /** The payload the collapsed card states in numbers rather than in prose. */
  public readonly metaParams = computed(() => ({
    n: this.frameCount(),
    ...this.endValues(),
  }));

  /**
   * The frames the collapsed card leads with: the two ends and the middle, so
   * the card advertises the range rather than one arbitrary picture of it. A
   * strip too short to have three distinct stops shows what it has.
   */
  public readonly peekStops = computed<readonly SweepStop[]>(() => {
    const stops = this.stops();
    if (stops.length === 0) {
      return [];
    }
    const last = stops.length - 1;
    const wanted = this.filmcard()
      ? [0, last]
      : [0, Math.floor(last / 2), last];
    return [...new Set(wanted)].map((at) => stops[at]);
  });

  /** The setting and its value as one mono token, for the plate's footer. */
  public readonly valueChip = computed(() => {
    const stop = this.stop();
    const name = this.transloco.translate(this.parameterLabelKey());
    return stop.prompt_fragment
      ? stop.prompt_fragment
      : `${name} ${this.valueTextOf(stop)}`;
  });

  /**
   * The middle stop stands in for the strip while it is collapsed: an end of the
   * range would advertise the extreme rather than the typical. A timeline is the
   * exception, and opens on its first frame: the static a render starts from is
   * what makes every frame after it mean anything, and half way through is past
   * it. Swapping to the other reading of a parameter keeps the position, clamped
   * to what the second strip has, so the reader stays where they were looking.
   */
  public readonly index = computed(() => {
    const held = this.cursor();
    if (held !== null) {
      return Math.min(held, this.lastIndex());
    }
    return sweepOpensAtFirstStop(this.activeParameter())
      ? 0
      : Math.floor(((this.strip()?.stops.length ?? 1) - 1) / 2);
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

  /**
   * A reader on a metered connection is offered the sweep in words and fetches
   * nothing, the collapsed card's own frames included, until they choose to.
   */
  public readonly showPreview = computed(() => !this.reducedData());

  /**
   * The model behind the pictures, named with its family: the one piece of
   * context a strip means nothing without, on the plate at all times.
   */
  public readonly modelChip = computed(() => {
    const model = this.strip()?.image_model;
    if (!model) {
      return null;
    }
    const family = BASELINE_LABELS[model.baseline] ?? model.baseline;
    return `${model.name} · ${family}`;
  });

  /** Whether the full request record is unfolded under the plate. */
  public readonly requestOpen = signal(false);

  /**
   * The current frame's provenance record. `undefined` while nothing has been
   * fetched or a fetch is in flight, `null` when the record is unavailable.
   */
  public readonly requestRecord = signal<
    Record<string, unknown> | null | undefined
  >(undefined);

  /** Where the current frame's provenance record is published, if it is. */
  public readonly sidecarPath = computed(() => {
    const strip = this.strip();
    return strip ? (strip.stops[this.index()]?.sidecar ?? null) : null;
  });

  /**
   * The record read the way the worked examples read a request: the chips are
   * the settings that shaped the picture, and the raw view below them is the
   * record itself.
   */
  public readonly requestChips = computed<RecipeRequest | null>(() => {
    const record = this.requestRecord();
    if (!record) {
      return null;
    }
    const model =
      record['model_generated_with'] ?? record['model_requested'] ?? null;
    const params = record['params'];
    return {
      models: typeof model === 'string' ? [model] : undefined,
      params:
        params && typeof params === 'object'
          ? (params as RecipeParams)
          : undefined,
    };
  });

  public readonly requestRaw = computed(() => {
    const record = this.requestRecord();
    return record ? JSON.stringify(record, null, 2) : '';
  });

  public toggleRequest(): void {
    this.requestOpen.update((open) => !open);
  }

  constructor() {
    void this.sweeps.ensureLoaded();

    // The record is fetched when it is asked for and again when the reader
    // scrubs to another frame with the fold open; a reply that arrives after
    // the frame has moved on is dropped rather than shown against the wrong
    // picture.
    effect(() => {
      const path = this.requestOpen() ? this.sidecarPath() : null;
      this.requestRecord.set(undefined);
      if (!path) {
        return;
      }
      void this.sweeps.sidecar(path).then((record) => {
        if (this.requestOpen() && this.sidecarPath() === path) {
          this.requestRecord.set(record);
        }
      });
    });

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

  /** Swap the pair between wiped and set apart, and remember which was asked for. */
  public toggleWipe(): void {
    this.wipeAsked.set(!this.wiped());
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
   * controls rather than parking focus on the way out. Arrows pressed on a
   * slider are that slider's own, and reach here already answered.
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
    if (step === undefined || isSlider(event.target)) {
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

  /**
   * Where a stop's slit sits across the lane, as a percentage of its width.
   * Each stop gets a cell of its own and stands in the middle of it, which is
   * what keeps the two outermost slits clear of the lane's ends.
   */
  public tickPercent(at: number): number {
    const count = this.frameCount();
    return count > 0 ? ((at + 0.5) / count) * 100 : 50;
  }

  /**
   * Where an end number sits. It is the slit's own position, held far enough in
   * from the lane's edges that a label centred on it cannot hang outside the
   * plate on a strip whose outermost slits are close to the ends.
   */
  public labelPercent(at: number): number {
    const inset = END_LABEL_PERCENT / 2;
    return Math.min(Math.max(this.tickPercent(at), inset), 100 - inset);
  }

  /** The stop at a position on the rail, clamped to what the strip has. */
  public stopAt(at: number): SweepStop {
    const stops = this.stops();
    return stops[Math.min(Math.max(at, 0), stops.length - 1)] ?? this.stop();
  }

  /**
   * A press on the rail. The slit under the pointer wins where there is one,
   * which is what makes a tap on a particular frame land on that frame rather
   * than on whatever the arithmetic rounds to; anywhere else on the rail falls
   * back to the position across its width.
   */
  public onRailPress(event: MouseEvent, mode: RailMode): void {
    const at =
      this.tickUnder(event.target) ??
      this.railPosition(event.currentTarget, event.clientX);
    if (at !== null) {
      this.railMove(mode, at);
    }
  }

  public onRailKeydown(event: KeyboardEvent, at: number, mode: RailMode): void {
    const step = RAIL_STEPS[event.key];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const last = this.lastIndex();
    this.railMove(
      mode,
      step === 'first' ? 0 : step === 'last' ? last : at + step,
    );
  }

  /**
   * A press anywhere on the lane, its full height included, lands on the
   * nearest stop and arms a drag from there. Waiting for the press to land on
   * the thumb makes the lane a control only someone who already knows where the
   * thumb is can use, and the thumb is the smallest part of it.
   */
  public startRailDrag(event: PointerEvent, mode: RailMode): void {
    const at = this.railPosition(event.currentTarget, event.clientX);
    if (at !== null) {
      this.railMove(mode, at);
    }
    this.pressedAt = { x: event.clientX, y: event.clientY };
    // A finger has to say which way it is going first: the lane sits in a page
    // that scrolls, and a swipe down over it belongs to the page. Anything else
    // has a scrollbar of its own and can be taken at its word straight away.
    if (event.pointerType === 'touch') {
      this.dragging = false;
      return;
    }
    this.dragging = true;
    this.captureRail(event);
  }

  /** A drag along the rail reads its position rather than the slit under it. */
  public onRailDrag(event: PointerEvent, mode: RailMode): void {
    if (!this.dragging && !this.takesOverGesture(event)) {
      return;
    }
    const at = this.railPosition(event.currentTarget, event.clientX);
    if (at !== null) {
      this.railMove(mode, at);
    }
  }

  public endRailDrag(): void {
    this.dragging = false;
    this.pressedAt = null;
  }

  /**
   * Whether a press that has not yet become a drag has now moved far enough,
   * and more across the lane than down the page, for the lane to claim it.
   */
  private takesOverGesture(event: PointerEvent): boolean {
    const pressed = this.pressedAt;
    if (!pressed) {
      return false;
    }
    const dx = event.clientX - pressed.x;
    const dy = event.clientY - pressed.y;
    if (Math.abs(dx) < DRAG_INTENT_PX || Math.abs(dx) <= Math.abs(dy)) {
      return false;
    }
    this.dragging = true;
    this.captureRail(event);
    return true;
  }

  /** Keep the rest of the drag on the lane, wherever the pointer wanders. */
  private captureRail(event: PointerEvent): void {
    const rail = event.currentTarget;
    if (rail instanceof HTMLElement && Number.isFinite(event.pointerId)) {
      try {
        rail.setPointerCapture(event.pointerId);
      } catch {
        // A pointer the browser will not hand over simply drags without capture.
      }
    }
  }

  /** Which slit a press landed on, or null when it landed between them. */
  private tickUnder(target: EventTarget | null): number | null {
    const tick = target instanceof Element ? target.closest('[data-at]') : null;
    const at = Number(tick?.getAttribute('data-at'));
    return tick && Number.isFinite(at) ? at : null;
  }

  /** Where along the rail's width a pointer falls, as the nearest stop. */
  private railPosition(
    rail: EventTarget | null,
    clientX: number,
  ): number | null {
    if (!(rail instanceof HTMLElement)) {
      return null;
    }
    const box = rail.getBoundingClientRect();
    const count = this.frameCount();
    // A rail with no measured width is a rail nothing has laid out yet, and a
    // guess made from it would jump the reader to an arbitrary frame.
    if (box.width <= 0 || count <= 1) {
      return null;
    }
    // The inverse of the placement below, so the stop a press lands on is the
    // one whose slit is nearest the pointer rather than one the arithmetic
    // rounds to on a different reading of the lane.
    const across = ((clientX - box.left) / box.width) * count - 0.5;
    return Math.round(across);
  }

  /** Move whichever scrubber the rail is driving: the strip, or the layer. */
  private railMove(mode: RailMode, to: number): void {
    if (mode === 'zoom') {
      this.moveZoom(to);
      return;
    }
    this.cursor.set(Math.min(Math.max(to, 0), this.lastIndex()));
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
