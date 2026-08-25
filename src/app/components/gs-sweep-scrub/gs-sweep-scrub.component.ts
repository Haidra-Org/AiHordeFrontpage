import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
  SettingLink,
  SweepVariantPair,
  settingEntry,
  settingIdFor,
  settingProseLabelKey,
  settingSection,
  sweepIsTimeline,
  sweepOpensAtFirstStop,
  sweepPairStartsApart,
  sweepVariantPair,
} from '../../content/settings';
import { sectionIdentity } from '../../content/sections';
import {
  SweepLibraryService,
  SweepStop,
  sweepIsCategorical,
} from '../../services/sweep-library.service';
import { docsSettingLink } from '../../content/docs-links';
import { useScrollLock } from '../../helper/scroll-lock';

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

/** What each key does on the stage and the tick rail, in stops or as an end. */
const STEP_KEYS: Readonly<Record<string, number | 'first' | 'last'>> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
  Home: 'first',
  End: 'last',
};

/** How close to the lane's edge an end number may be centred before it is held in. */
const END_LABEL_EDGE_PERCENT = 4;
/** Longer than this and an end value is a sentence, which the pill already says. */
const END_LABEL_MAX_CHARS = 14;

/**
 * How far a finger has to travel before a lane or a stage treats the gesture as
 * a scrub. Below this the direction is not yet known, and claiming the gesture
 * early would stop a reader scrolling the page they happened to touch.
 */
const DRAG_INTENT_PX = 4;

/**
 * How long a finger has to rest on the stage before it counts as a press and
 * hold. Long enough that a tap never trips it, short enough that a reader who
 * meant to hold does not conclude nothing is there.
 */
const HOLD_MS = 350;

/** How far a swipe has to travel across the viewer to move a stop. */
const SWIPE_STEP_PX = 48;

/** How far a swipe has to travel down the viewer to close it. */
const SWIPE_CLOSE_PX = 96;

/** The range a pinch may scale the viewer's frame within. */
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;

/**
 * The host width, in pixels, at which the plate stops being one column: the
 * details become a panel beside the stage rather than a sheet over it, and the
 * grid of every stop leads. It matches the container query the layout itself is
 * written against, because the two have to agree about which shape the plate is
 * in. 860 rather than a round 900 because the documentation column hands the
 * explorer 880px on a desktop, and a threshold above that would mean the pages
 * this was built for never reached the wide shape at all.
 */
const WIDE_HOST_PX = 860;

/** How the stops under the stage are laid out. */
type StopLayout = 'grid' | 'strip';

/**
 * Where the reader's answer about that is kept, one slot per host shape. The
 * answer on a documentation page and the answer in a phone sheet are different
 * answers, and a single slot would have the last surface visited overwrite the
 * one before it.
 */
const LAYOUT_KEYS: Readonly<Record<'wide' | 'narrow', string>> = {
  wide: 'gs-sweep-layout-wide',
  narrow: 'gs-sweep-layout-narrow',
};

/**
 * How far outside the filmstrip's own box the active thumbnail may sit before
 * the strip is scrolled to it. Scrolling on every value a drag passes through
 * makes the row shudder under the finger; scrolling only when the frame has
 * actually left the box keeps it still until it has to move.
 */
const FILM_EDGE_PX = 8;

/**
 * A parameter sweep the reader can explore: the same scene rendered across a
 * range of one setting, so "more steps means more detail, up to a point" is
 * something they see rather than something they are told.
 *
 * It has three states, and one job in all of them: the picture and the control
 * that changes it on screen together, at every width.
 *
 * Collapsed, it is a two-frame preview with the divider already in the middle.
 * A card that showed three small frames and a name previewed that a sweep
 * existed rather than what it does; a pair the reader can wipe between is the
 * difference itself, and the door under it says what a press will do. It sits
 * inside prose the reader is already reading, so it waits to be asked. A page
 * whose whole subject is the one setting has no prose to bury and opens the
 * strip itself, through `startExpanded`; a surface carrying several drops to
 * the compact card, through `register`.
 *
 * Open, the frame sits on a dark stage with its value, the pictures it is being
 * held against, and the way to full size on the stage itself. The rail and the
 * filmstrip under it are the two ways of steering that a pointer and a keyboard
 * each want. What was held, the request and the links are one step down, behind
 * a Details handle, because they are provenance rather than the evidence.
 *
 * Full size, it is a native dialog: the same frame at the size the differences
 * between neighbouring stops are actually readable at, with the stops a swipe
 * or an arrow away and the starting picture a wipe away.
 *
 * A strip of two frames is a before and an after rather than a range, so it is
 * the wipe in every state, with the divider as its only control. Frames the
 * index marks `tile_repeat_3x3` are single tiles, and are laid out as a
 * three-by-three plate beside the tile on its own: a seam only exists where one
 * copy meets the next, and only the isolated tile says what was rendered.
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
    <ng-template #pairWipe let-sides="sides" let-handleOnly="handleOnly">
      <app-gs-compare-wipe
        [beforeSrc]="frameUrl(sides[0])"
        [afterSrc]="frameUrl(sides[1])"
        [beforeAlt]="frameAlt(sides[0])"
        [afterAlt]="frameAlt(sides[1])"
        [tiled]="tiled()"
        [sideBySide]="!wiped()"
        [handleOnly]="!!handleOnly"
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

    <!-- The current frame wiped against what it is being held to: the picture
         the strip was painted over, or the map a detector drew from it. Without
         the source the low end of a denoising strip looks like a weak render
         rather than a faithful one; without the map a strength strip is a dial
         with nothing at the far end of it. -->
    <ng-template #againstWipe>
      <app-gs-compare-wipe
        [beforeSrc]="compareUrl()!"
        [afterSrc]="frameUrl(stop())"
        [beforeAlt]="compareAlt()"
        [afterAlt]="frameAlt(stop())"
        [beforeLabel]="compareAlt()"
        [afterLabel]="valueTextOf(stop())"
        (imageLoad)="onFrameLoad()"
      />
    </ng-template>

    <!-- What kind of evidence this is and which area of the panel it belongs to,
         in one badge. The hue rides on the dash rather than on the words: the
         identity hues are audited as graphic colour only. A timeline says so
         here, because the anatomy around it is the anatomy of a comparison and
         a reader who takes the frames for different renders reads it backwards. -->
    <ng-template #badge>
      @let kindKey =
        timeline()
          ? 'generate.sweeps.badge_timeline'
          : 'generate.sweeps.badge_explorer';
      <span class="gs-cap-eyebrow">
        <span class="gs-cap-dot" aria-hidden="true"></span>
        @if (sectionLabelKey(); as key) {
          {{ kindKey | transloco: { section: key | transloco } }}
        } @else {
          {{ kindKey + '_plain' | transloco }}
        }
      </span>
    </ng-template>

    <!-- Some parameters have two readings rather than one fuller one: steps
         read differently on a sampler that re-rolls the detail than on one that
         settles, and a part-finished render can be shown as what the canvas
         holds or as what the model is heading towards. One strip can only be of
         one of them, so the pair is one explorer with the choice in it. -->
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

    <!-- The sampler toggle names two kinds of sampler and assumes the reader
         knows which theirs is. Answering that is more than a label can carry
         and less than a trip to the reference is worth, so it sits beside the
         toggle, folded, with the two lists in full. -->
    <ng-template #variantWhyNote>
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
            <a class="gs-sweep-why-link" [routerLink]="samplerReference">
              {{ 'generate.sweeps.variant_why_link' | transloco }}
            </a>
          </div>
        }
      }
    </ng-template>

    <!-- What sits on the picture: the value, the pictures it is being held
         against, and the way to full size. Everything on the stage is over the
         frame rather than under it, so the reader never loses the picture to
         read what it is. -->
    <ng-template #stageChrome let-inViewer="inViewer">
      <span class="gs-sweep-pill">{{ pillText() }}</span>
      @if (comparisons().length > 0) {
        <span
          class="gs-sweep-chips"
          role="group"
          [attr.aria-label]="'generate.sweeps.compare_group' | transloco"
        >
          @for (against of comparisons(); track against.kind) {
            <button
              type="button"
              class="gs-sweep-chip"
              [class.is-on]="compareWith() === against.kind"
              [attr.aria-pressed]="compareWith() === against.kind"
              (click)="toggleCompare(against.kind); $event.stopPropagation()"
            >
              {{ against.labelKey | transloco }}
            </button>
          }
        </span>
      }
      @if (!inViewer) {
        <button
          #opener
          type="button"
          class="gs-sweep-expand"
          [attr.aria-label]="'generate.sweeps.enlarge' | transloco"
          (click)="openViewer(); $event.stopPropagation()"
        >
          <app-icon name="arrows-pointing-out" class="gs-ico-sm" />
        </button>
      }
    </ng-template>

    <!-- The picture itself, whatever it currently is: the pair wiped over each
         other, the frame against what it is held to, the thing being held up
         while a finger rests on the stage, or the frame on its own. -->
    <ng-template #stageMedia>
      @if (held() && heldUrl()) {
        <img
          class="gs-sweep-frame"
          [src]="heldUrl()!"
          [alt]="compareAltText()"
        />
      } @else if (compareUrl()) {
        <ng-container [ngTemplateOutlet]="againstWipe" />
      } @else if (pairSides(); as sides) {
        <ng-container
          [ngTemplateOutlet]="pairWipe"
          [ngTemplateOutletContext]="{ sides: sides, handleOnly: false }"
        />
      } @else {
        <ng-container
          [ngTemplateOutlet]="frame"
          [ngTemplateOutletContext]="{
            stop: stop(),
            cls: 'gs-sweep-frame',
          }"
        />
      }
    </ng-template>

    @if (strip()) {
      <div class="gs-sweep">
        @if (expanded()) {
          <div class="gs-plate" [class.is-wide]="wide()">
            <div class="gs-plate-head">
              <ng-container [ngTemplateOutlet]="badge" />
              <span class="gs-plate-title">
                {{ parameterLabelKey() | transloco }}
              </span>
              <button type="button" class="gs-plate-x" (click)="collapse()">
                {{ 'generate.sweeps.collapse' | transloco }}
                <app-icon name="x-mark" class="gs-ico-sm" />
              </button>
            </div>

            @if (hasVariant()) {
              <div class="gs-plate-controls">
                <ng-container [ngTemplateOutlet]="variants" />
                <ng-container [ngTemplateOutlet]="variantWhyNote" />
              </div>
            }

            <div class="gs-plate-main" [class.is-detailed]="detailsOpen()">
              <div class="gs-plate-col">
                <!-- The stage is one focusable region rather than a picture
                     with controls scattered round it: the arrows step, the
                     drag scrubs, a press opens it full size, and a rest on it
                     holds up what the frame is being compared to. -->
                <div
                  #stage
                  class="gs-sweep-stage"
                  tabindex="0"
                  role="group"
                  [attr.aria-roledescription]="
                    'generate.sweeps.stage_role' | transloco
                  "
                  [attr.aria-label]="parameterLabelKey() | transloco"
                  (keydown)="onStageKeydown($event)"
                  (click)="onStagePress()"
                  (pointerdown)="onStagePointerDown($event)"
                  (pointermove)="onStagePointerMove($event)"
                  (pointerup)="onStagePointerUp()"
                  (pointercancel)="onStagePointerUp()"
                >
                  <ng-container [ngTemplateOutlet]="stageMedia" />
                  <ng-container
                    [ngTemplateOutlet]="stageChrome"
                    [ngTemplateOutletContext]="{ inViewer: false }"
                  />
                </div>

                @if (scrubbable()) {
                  <!-- One slit per frame rather than a track with a knob on
                       it. A range input can only say "somewhere between two
                       ends"; the rail says how many frames there are and which
                       one is on show without being asked. -->
                  <div class="gs-tickrail-box">
                    @let at = index();
                    <div
                      class="gs-tickrail"
                      role="slider"
                      tabindex="0"
                      [attr.aria-label]="
                        'generate.sweeps.slider_label' | transloco
                      "
                      aria-valuemin="1"
                      [attr.aria-valuemax]="frameCount()"
                      [attr.aria-valuenow]="at + 1"
                      [attr.aria-valuetext]="valueTextOf(stopAt(at))"
                      (click)="onRailPress($event)"
                      (keydown)="onRailKeydown($event, at)"
                      (pointerdown)="startRailDrag($event)"
                      (pointermove)="onRailDrag($event)"
                      (pointerup)="endRailDrag()"
                      (pointercancel)="endRailDrag()"
                    >
                      @for (tick of stops(); track $index) {
                        <span
                          class="gs-tickrail-tick"
                          [class.is-at]="$index === at"
                          [style.left.%]="tickPercent($index)"
                          [attr.data-at]="$index"
                        ></span>
                      }
                    </div>
                    <span class="gs-tickrail-ends">
                      @if (showsEnds()) {
                        <span
                          class="gs-tickrail-end"
                          [style.left.%]="labelPercent(0)"
                          >{{ endValues().first }}</span
                        >
                      }
                      <span class="gs-tickrail-hint" aria-hidden="true">{{
                        'generate.sweeps.rail_hint' | transloco
                      }}</span>
                      @if (showsEnds()) {
                        <span
                          class="gs-tickrail-end"
                          [style.left.%]="labelPercent(lastIndex())"
                          >{{ endValues().last }}</span
                        >
                      }
                    </span>
                  </div>

                  @if (gridOn()) {
                    <!-- Every stop at a size that compares. Two frames a
                         thumbnail apart answer "is this one different"; only
                         frames drawn large enough to read answer "how". A
                         press picks the stop for the stage, the glyph in the
                         corner and a double press take it full size. -->
                    <ul
                      class="gs-sweep-options gs-sweep-options--frames"
                      [class.gs-sweep-options--dense]="denseTiles()"
                      role="list"
                    >
                      @for (
                        option of stops();
                        track option.file;
                        let i = $index
                      ) {
                        <li class="gs-sweep-option">
                          <span class="gs-sweep-option-frame">
                            <button
                              type="button"
                              class="gs-sweep-plate-cell"
                              [class.is-at]="index() === i"
                              [attr.aria-current]="
                                index() === i ? 'true' : null
                              "
                              [attr.aria-label]="
                                'generate.sweeps.stop_go'
                                  | transloco: { value: valueTextOf(option) }
                              "
                              (click)="goToStop(i)"
                              (dblclick)="openStopViewer(i)"
                            >
                              <img
                                class="gs-sweep-plate-img"
                                [src]="frameUrl(option)"
                                alt=""
                                loading="lazy"
                              />
                            </button>
                            <button
                              type="button"
                              class="gs-sweep-expand gs-sweep-expand--cell"
                              [attr.aria-label]="
                                'generate.sweeps.stop_enlarge'
                                  | transloco: { value: valueTextOf(option) }
                              "
                              (click)="openStopViewer(i)"
                            >
                              <app-icon
                                name="arrows-pointing-out"
                                class="gs-ico-sm"
                              />
                            </button>
                          </span>
                          <span class="gs-sweep-option-cap">
                            <app-gs-setting-chip
                              [glyph]="false"
                              [settingId]="activeParameter()"
                              [value]="option.value"
                            />
                            <span class="gs-sweep-option-text">{{
                              option.caption
                            }}</span>
                          </span>
                        </li>
                      }
                    </ul>
                  } @else {
                    <!-- Every stop in a row that snaps, the one on show
                         enlarged: a filmstrip says how far through the set the
                         reader is in a way a number cannot. -->
                    <ul
                      class="gs-sweep-film"
                      [class.is-dragging]="dragging()"
                      role="list"
                    >
                      @for (
                        option of stops();
                        track option.file;
                        let i = $index
                      ) {
                        <li class="gs-sweep-film-cell">
                          <button
                            #filmCell
                            type="button"
                            class="gs-sweep-film-go"
                            [class.is-at]="index() === i"
                            [attr.aria-current]="index() === i ? 'true' : null"
                            [attr.aria-label]="
                              'generate.sweeps.stop_go'
                                | transloco: { value: valueTextOf(option) }
                            "
                            (click)="goToStop(i)"
                          >
                            <img
                              class="gs-sweep-film-img"
                              [src]="frameUrl(option)"
                              alt=""
                              loading="lazy"
                            />
                            <span class="gs-sweep-film-value">{{
                              valueTextOf(option)
                            }}</span>
                          </button>
                        </li>
                      }
                    </ul>
                  }
                }

                <!-- What this value did to the picture. The caption is the live
                     region, so a scrub announces the frame it landed on rather
                     than a bare number. -->
                <p class="gs-sweep-caption" role="status" aria-live="polite">
                  @if (showsPair()) {
                    @for (side of pairSides()!; track side.file) {
                      <span class="gs-sweep-pair-cap">{{ side.caption }}</span>
                    }
                  } @else {
                    <span class="gs-sweep-caption-text">{{
                      stop().caption
                    }}</span>
                    <!-- Curation is disclosed rather than hidden: a frame
                         picked from a batch says so, because generation is
                         stochastic and pretending the first roll looked like
                         this would teach the wrong lesson. -->
                    @if ((stop().batch_size ?? 1) > 1) {
                      <span class="gs-sweep-caption-batch">{{
                        'generate.sweeps.batch_note'
                          | transloco: { n: stop().batch_size }
                      }}</span>
                    }
                  }
                </p>

                @if (tiled() && pairSides(); as sides) {
                  <div class="gs-sweep-solos">
                    @for (side of sides; track side.file) {
                      <ng-container
                        [ngTemplateOutlet]="solo"
                        [ngTemplateOutletContext]="{ stop: side }"
                      />
                    }
                  </div>
                }

                @if (!frameLoaded()) {
                  <p class="gs-sweep-loading">
                    {{ 'generate.sweeps.loading' | transloco }}
                  </p>
                }

                <!-- What the whole strip is about, folded: it is the same
                     sentence however far along the reader has scrubbed, and
                     over the stop's own caption it reads as the louder of the
                     two. -->
                <button
                  type="button"
                  class="gs-sweep-why"
                  [attr.aria-expanded]="whyOpen()"
                  (click)="toggleWhy()"
                >
                  {{ 'generate.sweeps.why' | transloco }}
                </button>
                @if (whyOpen()) {
                  <div class="gs-sweep-why-body">
                    <p>{{ strip()!.caption }}</p>
                  </div>
                }

                <div class="gs-plate-foot">
                  <button
                    #detailsHandle
                    type="button"
                    class="gs-plate-details-go"
                    [attr.aria-expanded]="detailsOpen()"
                    (click)="toggleDetails()"
                  >
                    <app-icon
                      [name]="detailsOpen() ? 'chevron-up' : 'chevron-down'"
                      class="gs-ico-sm"
                    />
                    {{ 'generate.sweeps.details' | transloco }}
                  </button>
                  <span class="gs-plate-grow"></span>
                  @if (offersWipeToggle() && showsPair()) {
                    <button
                      type="button"
                      class="gs-sweep-pair-mode"
                      (click)="toggleWipe()"
                    >
                      {{
                        (wiped()
                          ? 'generate.sweeps.pair_show_apart'
                          : 'generate.sweeps.pair_show_wiped'
                        ) | transloco
                      }}
                    </button>
                  }
                  @if (offersLayoutChoice()) {
                    <button
                      type="button"
                      class="gs-plate-sheet-go"
                      [attr.aria-pressed]="gridOn()"
                      (click)="toggleLayout()"
                    >
                      {{
                        (gridOn()
                          ? 'generate.sweeps.layout_strip'
                          : 'generate.sweeps.layout_grid'
                        ) | transloco
                      }}
                    </button>
                  }
                </div>
              </div>

              @if (detailsOpen()) {
                <!-- Provenance, one step down from the picture: a sheet from
                     the bottom edge where the plate is one column, a panel
                     beside the stage where there is room for one. Same markup
                     either way; the shape is the layout's business. -->
                <aside
                  #details
                  class="gs-plate-details"
                  tabindex="-1"
                  role="group"
                  [attr.aria-label]="'generate.sweeps.details' | transloco"
                  (keydown.escape)="closeDetails()"
                >
                  <div class="gs-plate-details-head">
                    <span class="gs-cap-eyebrow">
                      {{ 'generate.sweeps.details' | transloco }}
                    </span>
                    <button
                      type="button"
                      class="gs-plate-x"
                      (click)="closeDetails()"
                    >
                      {{ 'generate.sweeps.details_close' | transloco }}
                      <app-icon name="x-mark" class="gs-ico-sm" />
                    </button>
                  </div>
                  <dl class="gs-plate-held">
                    <div class="gs-plate-held-row">
                      <dt>{{ 'generate.sweeps.held_label' | transloco }}</dt>
                      <dd>{{ 'generate.sweeps.held_constant' | transloco }}</dd>
                    </div>
                    @if (modelChip(); as chip) {
                      <div class="gs-plate-held-row">
                        <dt>{{ 'generate.sweeps.model_label' | transloco }}</dt>
                        <dd class="gs-plate-model">{{ chip }}</dd>
                      </div>
                    }
                    <div class="gs-plate-held-row">
                      <dt>{{ 'generate.sweeps.scene_label' | transloco }}</dt>
                      <dd>{{ strip()!.scene.label }}</dd>
                    </div>
                  </dl>

                  @if (sidecarPath(); as path) {
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
                      <a
                        class="gs-plate-sidecar"
                        [href]="sidecarUrl(path)"
                        target="_blank"
                        rel="noopener"
                      >
                        {{ 'generate.sweeps.sidecar_link' | transloco }}
                      </a>
                    </div>
                  }

                  @if (settingLinks().length > 0) {
                    <nav
                      class="gs-plate-links"
                      [attr.aria-label]="
                        'generate.sweeps.links_label' | transloco
                      "
                    >
                      @for (link of settingLinks(); track link.routerLink) {
                        <a class="gs-plate-link" [routerLink]="link.routerLink">
                          {{ link.labelKey | transloco }}
                        </a>
                      }
                    </nav>
                  }
                </aside>
              }
            </div>
          </div>
        } @else {
          <!-- The offer: the difference itself, with the divider already in the
               middle so the card previews what a drag does. A press anywhere
               opens the plate; the divider is the one thing on it that can be
               dragged without opening. -->
          <div class="gs-sweep-card" [class.gs-sweep-card--film]="filmcard()">
            @if (showPreview() && previewPair(); as sides) {
              <span class="gs-sweep-card-stage">
                <ng-container
                  [ngTemplateOutlet]="pairWipe"
                  [ngTemplateOutletContext]="{ sides: sides, handleOnly: true }"
                />
              </span>
            }
            <span class="gs-sweep-card-text">
              @if (!filmcard()) {
                <ng-container [ngTemplateOutlet]="badge" />
              }
              <span class="gs-sweep-card-title">
                {{ parameterLabelKey() | transloco }}
              </span>
              <span class="gs-sweep-card-line">{{ firstCaptionLine() }}</span>
              <!-- The door reaches over the whole card, so a press anywhere on
                   it opens the plate and the one control is still a button with
                   a word, a focus ring and a keyboard. The divider is drawn
                   over that reach, which is what leaves it draggable. -->
              <button
                #opener
                type="button"
                class="gs-sweep-card-door"
                [attr.aria-expanded]="false"
                (click)="expand()"
              >
                {{ doorText() }}
                <app-icon name="chevron-down" class="gs-ico-sm" />
              </button>
            </span>
          </div>
        }

        <!-- Full size, in the top layer: the browser traps focus, makes the
             page behind inert and answers Escape itself, which is the whole
             list of things a hand-built layer gets wrong. -->
        <dialog
          #viewer
          class="gs-sweep-dialog"
          [attr.aria-label]="
            showsPair()
              ? ('generate.sweeps.enlarged_pair_title' | transloco)
              : ('generate.sweeps.enlarged_title'
                | transloco: { value: valueTextOf(stop()) })
          "
          (close)="onDialogClose()"
        >
          @if (viewerOpen()) {
            <div class="gs-sweep-dialog-body">
              <div class="gs-sweep-dialog-top">
                <span class="gs-sweep-dialog-what">
                  <ng-container [ngTemplateOutlet]="badge" />
                  <span class="gs-sweep-dialog-param">
                    {{ parameterLabelKey() | transloco }}
                  </span>
                </span>
                <button
                  type="button"
                  class="gs-sweep-dialog-x"
                  [attr.aria-label]="
                    'generate.sweeps.enlarge_close' | transloco
                  "
                  (click)="closeViewer()"
                >
                  <app-icon name="x-mark" class="gs-ico-sm" />
                </button>
              </div>

              <div
                #viewerStage
                class="gs-sweep-stage gs-sweep-stage--big"
                [style.--gs-sweep-zoom]="zoom()"
                [style.--gs-sweep-pan-x.px]="panX()"
                [style.--gs-sweep-pan-y.px]="panY()"
                (pointerdown)="onViewerPointerDown($event)"
                (pointermove)="onViewerPointerMove($event)"
                (pointerup)="onViewerPointerUp($event)"
                (pointercancel)="onViewerPointerUp($event)"
              >
                <ng-container [ngTemplateOutlet]="stageMedia" />
                <ng-container
                  [ngTemplateOutlet]="stageChrome"
                  [ngTemplateOutletContext]="{ inViewer: true }"
                />
              </div>

              @if (scrubbable()) {
                <div class="gs-sweep-dialog-steps">
                  <button
                    type="button"
                    class="gs-sweep-dialog-step"
                    [disabled]="index() === 0"
                    [attr.aria-label]="'generate.sweeps.stop_prev' | transloco"
                    (click)="stepStop(-1)"
                  >
                    <app-icon name="chevron-left" class="gs-ico-sm" />
                  </button>
                  <span class="gs-sweep-dialog-pos">
                    {{
                      'generate.sweeps.position'
                        | transloco: { at: index() + 1, n: frameCount() }
                    }}
                  </span>
                  <button
                    type="button"
                    class="gs-sweep-dialog-step"
                    [disabled]="index() === lastIndex()"
                    [attr.aria-label]="'generate.sweeps.stop_next' | transloco"
                    (click)="stepStop(1)"
                  >
                    <app-icon name="chevron-right" class="gs-ico-sm" />
                  </button>
                </div>
              }

              <p class="gs-sweep-caption" role="status" aria-live="polite">
                @if (showsPair()) {
                  @for (side of pairSides()!; track side.file) {
                    <span class="gs-sweep-pair-cap">{{ side.caption }}</span>
                  }
                } @else {
                  <span class="gs-sweep-caption-text">{{
                    stop().caption
                  }}</span>
                }
              </p>
            </div>
          }
        </dialog>
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly scrollLock = useScrollLock();

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
   * Narrow the strip to the one rendered against a guidance mode, where the
   * library published several of the same field against different ones.
   */
  public readonly controlType = input<string | undefined>(undefined);
  /**
   * Open the strip without waiting to be asked. A page whose whole subject is
   * one setting has nothing to bury the pictures under, so it shows them; every
   * other surface sits inside prose and keeps the offer.
   */
  public readonly startExpanded = input(false);
  /**
   * Skip the inline plate: the offer opens the full-size view, and closing it
   * comes back to the offer. Where the surface is a phone-sized sheet the plate
   * cannot fit its picture and its controls at once. `startExpanded` has
   * nothing to open here and is ignored.
   */
  public readonly viewerFirst = input(false);
  /**
   * How much room the collapsed card takes. `full` is the preview pair with its
   * badge and its door; `filmcard` is the compact version, for the surfaces that
   * carry several of these in a row and would otherwise be a wall of identical
   * cards. Both open the same plate.
   */
  public readonly register = input<'full' | 'filmcard'>('full');

  private readonly cursor = signal<number | null>(null);
  private readonly open = linkedSignal(
    () => !this.viewerFirst() && this.startExpanded(),
  );
  private readonly loaded = signal(false);
  private readonly viewer = signal(false);
  private readonly variant = signal(false);
  private readonly variantWhy = signal(false);
  private readonly why = signal(false);
  private readonly details = signal(false);
  private readonly holding = signal(false);
  private readonly against = signal<'source' | 'map' | null>(null);
  /** Whether the reader asked for a presentation other than the pair's own. */
  private readonly wipeAsked = signal<boolean | null>(null);
  /**
   * Which way the reader asked for the stops to be laid out, or null while the
   * host's own default stands. Remembered per host shape: the answer on a
   * documentation page and the answer in a phone sheet are different answers.
   */
  private readonly layoutAsked = signal<StopLayout | null>(null);
  /** How wide the surface hosting this explorer is, as its own container. */
  private readonly hostWidth = signal(0);
  /** Whether a drag is currently moving the strip, on the stage or on the rail. */
  private readonly scrubDrag = signal(false);

  private readonly zoomAt = signal(1);
  private readonly pan = signal<{ x: number; y: number }>({ x: 0, y: 0 });

  /** The nine copies of a tiled frame, as something the template can repeat. */
  public readonly tileCells = TILE_CELLS;
  public readonly samplerReference = SAMPLER_REFERENCE;

  public readonly expanded = this.open.asReadonly();
  public readonly frameLoaded = this.loaded.asReadonly();
  public readonly viewerOpen = this.viewer.asReadonly();
  /** Whether the reader asked for the second strip of a pair of strips. */
  public readonly onVariant = this.variant.asReadonly();
  /** Whether the note under the variant toggle is unfolded. */
  public readonly variantWhyOpen = this.variantWhy.asReadonly();
  /** Whether the strip's own caption is unfolded under the stop's. */
  public readonly whyOpen = this.why.asReadonly();
  public readonly detailsOpen = this.details.asReadonly();
  /** Whether a finger is resting on the stage, holding the comparison up. */
  public readonly held = this.holding.asReadonly();
  public readonly compareWith = this.against.asReadonly();
  public readonly zoom = this.zoomAt.asReadonly();
  /** Whether the filmstrip is under a drag, and so holds still and unsnapped. */
  public readonly dragging = this.scrubDrag.asReadonly();
  public readonly panX = computed(() => this.pan().x);
  public readonly panY = computed(() => this.pan().y);

  private readonly viewerRef =
    viewChild<ElementRef<HTMLDialogElement>>('viewer');
  private readonly detailsRef = viewChild<ElementRef<HTMLElement>>('details');
  private readonly openerRefs = viewChildren<ElementRef<HTMLElement>>('opener');
  private readonly filmCells =
    viewChildren<ElementRef<HTMLElement>>('filmCell');

  /** Where focus goes when the full-size view closes. */
  private returnFocusTo: HTMLElement | null = null;

  /** Whether the details panel has already been handed focus this opening. */
  private focusedDetails: HTMLElement | null = null;

  /** Whether a pointer is currently dragging along the rail. */
  private railDragging = false;

  /** Where a press on the rail landed, while it is still deciding its way. */
  private pressedAt: { x: number; y: number } | null = null;

  /** Where a press on the stage landed, and what it has become since. */
  private stagePress: {
    x: number;
    y: number;
    at: number;
    width: number;
    scrubbing: boolean;
    moved: boolean;
  } | null = null;

  private holdTimer: ReturnType<typeof setTimeout> | null = null;

  /** The pointers currently down on the full-size frame, for the pinch. */
  private readonly viewerPointers = new Map<number, { x: number; y: number }>();

  /** The pinch's starting spread and scale, while two fingers are down. */
  private pinchFrom: { spread: number; zoom: number } | null = null;

  /**
   * What the card and the plate call the setting. Naming it is what separates
   * one offer from the next where a step or a reference entry carries more than
   * one: "See what changing this does" twice on a page answers neither.
   */
  public readonly parameterLabelKey = computed(() =>
    settingProseLabelKey(this.parameter()),
  );

  /** Whether the collapsed card is the compact register. */
  public readonly filmcard = computed(() => this.register() === 'filmcard');

  /** Whether the host is wide enough for a panel beside the stage. */
  public readonly wide = computed(() => this.hostWidth() >= WIDE_HOST_PX);

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

  /** Whether the frames on show are one render over time rather than a range. */
  public readonly timeline = computed(() =>
    sweepIsTimeline(this.activeParameter()),
  );

  public readonly strip = computed(() =>
    this.sweeps.strip(
      this.activeParameter(),
      this.modelSlug() ?? this.sweeps.studioModelSlug(),
      this.sceneId(),
      this.controlType(),
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
        this.controlType(),
      )
    );
  });

  /** Every frame of the strip on show. */
  public readonly stops = computed<readonly SweepStop[]>(
    () => this.strip()?.stops ?? [],
  );

  public readonly frameCount = computed(() => this.stops().length);

  public readonly lastIndex = computed(() => this.frameCount() - 1);

  /** Whether the frames are single tiles that only read once repeated. */
  public readonly tiled = computed(
    () => this.strip()?.presentation === 'tile_repeat_3x3',
  );

  /**
   * Whether the frames are named alternatives rather than points on a scale.
   * Nothing lies between two of them, so the contact sheet is what they are
   * read in wherever there is room for it.
   */
  public readonly categorical = computed(() =>
    sweepIsCategorical(this.strip()),
  );

  /**
   * Whether the plate is a before and an after rather than a range. Two frames
   * are a comparison in one place, and a wipe holds that comparison for the
   * reader; there is nothing between them to scrub through.
   */
  public readonly showsPair = computed(() => this.frameCount() === 2);

  /** Those two frames, in the order they read, or null on a range strip. */
  public readonly pairSides = computed<SweepStop[] | null>(() => {
    const stops = this.strip()?.stops;
    return stops?.length === 2 ? stops : null;
  });

  /** Whether there are stops to move between at all. */
  public readonly scrubbable = computed(
    () => !this.showsPair() && this.frameCount() > 1,
  );

  /** Whether the pair carries the toggle between the two presentations. */
  public readonly offersWipeToggle = computed(() =>
    sweepPairStartsApart(this.activeParameter()),
  );

  /**
   * Whether the two frames are wiped over each other rather than laid out side
   * by side. The reader's own choice wins; before they have made one the pair's
   * own default stands.
   */
  public readonly wiped = computed(
    () => this.wipeAsked() ?? !sweepPairStartsApart(this.activeParameter()),
  );

  /** Whether there is more than one stop to lay out at all. */
  public readonly offersLayoutChoice = computed(() => this.scrubbable());

  /**
   * Whether every stop is laid out at a size that compares. Where the host is
   * wide that is the default: five frames across at a documentation page's
   * width are big enough to judge against each other, which is the whole
   * question a sweep is asked. A narrow host has room for the filmstrip and
   * offers the grid; either way the reader's own answer is remembered.
   */
  public readonly gridOn = computed(() => {
    if (!this.scrubbable()) {
      return false;
    }
    return (this.layoutAsked() ?? (this.wide() ? 'grid' : 'strip')) === 'grid';
  });

  /**
   * Whether the grid holds enough frames to read as a contact sheet rather than
   * as a comparison. A gallery of every sampler published is scanned two dozen
   * at a time, and a smaller tile puts more of it in one look.
   */
  public readonly denseTiles = computed(() => this.stops().length > 12);

  /** The image the strip was painted over, on the strips that start from one. */
  public readonly sourceUrl = computed(() => {
    const source = this.strip()?.source_image;
    return source ? this.sweeps.assetUrl(source) : null;
  });

  /** The map the strip was guided by, on the strips held to one guidance mode. */
  public readonly controlMapUrl = computed(() => {
    const map = this.strip()?.control_map;
    return map ? this.sweeps.assetUrl(map) : null;
  });

  /** The pictures this frame can be held against, as the stage's chips. */
  public readonly comparisons = computed<
    readonly { kind: 'source' | 'map'; labelKey: string; url: string }[]
  >(() => {
    const offered: { kind: 'source' | 'map'; labelKey: string; url: string }[] =
      [];
    const source = this.sourceUrl();
    if (source) {
      offered.push({
        kind: 'source',
        labelKey: 'generate.sweeps.source_label',
        url: source,
      });
    }
    const map = this.controlMapUrl();
    if (map) {
      offered.push({
        kind: 'map',
        labelKey: 'generate.sweeps.control_map_label',
        url: map,
      });
    }
    return offered;
  });

  /**
   * Which picture a press and hold lifts up, where the reader has not chosen:
   * the source is what a frame is most often being judged against, and the map
   * stands in on the strips that have no source of their own.
   */
  private readonly defaultComparison = computed(
    () => this.comparisons()[0] ?? null,
  );

  /** The picture the stage is currently wiping against, if any. */
  public readonly compareUrl = computed(() => {
    const kind = this.against();
    return kind
      ? (this.comparisons().find((entry) => entry.kind === kind)?.url ?? null)
      : null;
  });

  /** The picture a press and hold is currently holding up, if any. */
  public readonly heldUrl = computed(
    () =>
      this.compareUrl() ??
      (this.holding() ? (this.defaultComparison()?.url ?? null) : null),
  );

  /**
   * What the picture being compared against is, in full: the corner tag has
   * room for a word and a reader who cannot see the picture needs a sentence.
   */
  public readonly compareAltText = computed(() =>
    this.against() === 'map' || !this.sourceUrl()
      ? this.transloco.translate('generate.sweeps.control_map_label')
      : this.transloco.translate('generate.sweeps.source_alt'),
  );

  /** What the picture being compared against is called. */
  public readonly compareAlt = computed(() => {
    const kind = this.against();
    const against =
      this.comparisons().find((entry) => entry.kind === kind) ??
      this.defaultComparison();
    return against ? this.transloco.translate(against.labelKey) : '';
  });

  /**
   * Whether the two end values are short enough to sit under their slits. A
   * value that is a sentence would wrap into the pill above the lane, and the
   * pill and the caption already say it in full.
   */
  public readonly showsEnds = computed(() => {
    const { first, last } = this.endValues();
    return (
      first.length <= END_LABEL_MAX_CHARS && last.length <= END_LABEL_MAX_CHARS
    );
  });

  /** What the two ends were rendered at, under the ends of the rail. */
  public readonly endValues = computed(() => {
    const stops = this.stops();
    return {
      first: stops.length > 0 ? this.valueTextOf(stops[0]) : '',
      last: stops.length > 0 ? this.valueTextOf(stops[stops.length - 1]) : '',
    };
  });

  /**
   * The two frames the collapsed card wipes between. The strip names its own
   * pair where the interesting change does not sit at the ends; otherwise the
   * left is the stop nearest the value the reference calls this setting's
   * default and the right is the last stop, which is the difference between
   * "what you already have" and "what this setting can do".
   */
  public readonly previewPair = computed<SweepStop[] | null>(() => {
    const stops = this.stops();
    if (stops.length < 2) {
      return null;
    }
    const last = stops.length - 1;
    const named = this.strip()?.preview;
    const left = this.clampStop(named?.left_index ?? this.defaultStop());
    const right = this.clampStop(named?.right_index ?? last);
    return left === right
      ? [stops[0], stops[last]]
      : [stops[left], stops[right]];
  });

  /**
   * The stop nearest the value the reference states as this setting's default,
   * or the first stop where the reference states none. A card that opened on
   * the extreme would advertise what the setting can do without saying what it
   * is doing now.
   */
  private readonly defaultStop = computed(() => {
    const range = settingEntry(this.activeParameter())?.reference?.range;
    const wanted = firstNumber(range?.default ?? range?.typical ?? '');
    const stops = this.stops();
    if (wanted === null || stops.length === 0) {
      return 0;
    }
    let best = 0;
    let bestGap = Infinity;
    stops.forEach((stop, at) => {
      const value = firstNumber(String(stop.value));
      if (value === null) {
        return;
      }
      const gap = Math.abs(value - wanted);
      if (gap < bestGap) {
        best = at;
        bestGap = gap;
      }
    });
    return best;
  });

  /**
   * The first line of the strip's own caption, as the card's one line about it.
   * The rest is what the plate folds under "Why it looks like this".
   */
  public readonly firstCaptionLine = computed(() => {
    const caption = this.strip()?.caption ?? '';
    const stop = caption.search(/(?<=[.!?])\s/);
    return stop === -1 ? caption : caption.slice(0, stop + 1).trim();
  });

  /** What the card's door says a press will do. */
  public readonly doorText = computed(() =>
    this.transloco.translate(
      this.showsPair()
        ? 'generate.sweeps.card_door_pair'
        : 'generate.sweeps.card_door',
      { n: this.frameCount() },
    ),
  );

  /**
   * The middle stop stands in for the strip while nothing has been scrubbed to:
   * an end of the range would advertise the extreme rather than the typical. A
   * timeline is the exception, and opens on its first frame: the static a render
   * starts from is what makes every frame after it mean anything. Swapping to
   * the other reading of a parameter keeps the position, clamped to what the
   * second strip has, so the reader stays where they were looking.
   */
  public readonly index = computed(() => {
    const held = this.cursor();
    if (held !== null) {
      return Math.min(held, Math.max(this.lastIndex(), 0));
    }
    return sweepOpensAtFirstStop(this.activeParameter()) || this.categorical()
      ? 0
      : Math.floor(Math.max(this.lastIndex(), 0) / 2);
  });

  public readonly stop = computed<SweepStop>(
    () => this.strip()!.stops[this.index()],
  );

  /** The setting and its value as one mono token, on the stage. */
  public readonly pillText = computed(() => {
    if (this.showsPair()) {
      return this.transloco.translate('generate.sweeps.pair_label');
    }
    const stop = this.stop();
    const name = this.transloco.translate(this.parameterLabelKey());
    return stop.prompt_fragment
      ? this.transloco.translate('generate.sweeps.value_prompt', {
          value: stop.prompt_fragment,
        })
      : `${name} ${this.valueTextOf(stop)}`;
  });

  /**
   * A reader on a metered connection is offered the sweep in words and fetches
   * nothing, the collapsed card's own frames included, until they choose to.
   */
  public readonly showPreview = computed(() => !this.reducedData());

  /**
   * The model behind the pictures, named with its family: the one piece of
   * context a strip means nothing without.
   */
  public readonly modelChip = computed(() => {
    const model = this.strip()?.image_model;
    if (!model) {
      return null;
    }
    const family = BASELINE_LABELS[model.baseline] ?? model.baseline;
    return `${model.name} · ${family}`;
  });

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

  /** Where the reader goes to read more about the setting itself. */
  public readonly settingLinks = computed<readonly SettingLink[]>(() => {
    const id = settingIdFor(this.parameter());
    const entry = settingEntry(this.parameter());
    const links: SettingLink[] = [];
    if (entry?.reference) {
      links.push({
        labelKey: 'generate.sweeps.setting_page',
        routerLink: docsSettingLink(id),
      });
      links.push(...(entry.reference.links ?? []));
    }
    return links;
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

  constructor() {
    void this.sweeps.ensureLoaded();
    this.observeHostWidth();

    // What the reader last asked for on a host of this shape. Read whenever the
    // shape changes rather than once, because the same explorer moves between
    // shapes as its surface resizes.
    effect(() => {
      const remembered = this.rememberedLayout(this.wide());
      if (remembered) {
        this.layoutAsked.set(remembered);
      }
    });

    // The record is fetched when the details are opened and again when the
    // reader scrubs to another frame with them open; a reply that arrives after
    // the frame has moved on is dropped rather than shown against the wrong
    // picture.
    effect(() => {
      const path = this.details() ? this.sidecarPath() : null;
      this.requestRecord.set(undefined);
      if (!path) {
        return;
      }
      void this.sweeps.sidecar(path).then((record) => {
        if (this.details() && this.sidecarPath() === path) {
          this.requestRecord.set(record);
        }
      });
    });

    // The page behind the full-size view is frozen while it is open. The dialog
    // makes the background inert, but inert is not still: a drag on a phone
    // would otherwise scroll the studio underneath the picture.
    effect(() =>
      this.viewer() ? this.scrollLock.enable() : this.scrollLock.disable(),
    );

    // The dialog is opened and closed through the element rather than by
    // rendering it, so the browser owns the top layer, the focus trap, the
    // inert background and Escape.
    afterRenderEffect(() => {
      const dialog = this.viewerRef()?.nativeElement;
      if (!dialog) {
        return;
      }
      if (this.viewer() && !dialog.open) {
        try {
          dialog.showModal();
        } catch {
          // A DOM without the top layer still has to show the picture; it
          // simply does not get the trap and the inert background with it.
          dialog.open = true;
        }
      } else if (!this.viewer() && dialog.open) {
        if (typeof dialog.close === 'function') {
          dialog.close();
        } else {
          dialog.open = false;
          this.onDialogClose();
        }
      }
    });

    // The details take focus as they open, so the control that closes them and
    // the links inside them are where the reader already is.
    afterRenderEffect(() => {
      const panel = this.detailsRef()?.nativeElement ?? null;
      if (panel && panel !== this.focusedDetails) {
        panel.focus();
      }
      this.focusedDetails = panel;
    });

    // The filmstrip follows the stage, but only when it has to: a stop reached
    // from the rail or the keyboard has to be visible, while a drag that walks
    // through every value in between would otherwise scroll the row on each
    // one and shudder under the finger. It moves when the frame has actually
    // left the box, and it moves without animation while a drag is in flight.
    afterRenderEffect(() => {
      const at = this.index();
      const dragging = this.dragging();
      const cell = this.filmCells()[at]?.nativeElement;
      const strip = cell?.parentElement?.parentElement;
      if (!cell?.scrollIntoView || !strip) {
        return;
      }
      const box = cell.getBoundingClientRect();
      const lane = strip.getBoundingClientRect();
      // A lane nothing has laid out yet has no edges to be outside of.
      if (
        lane.width > 0 &&
        box.left >= lane.left - FILM_EDGE_PX &&
        box.right <= lane.right + FILM_EDGE_PX
      ) {
        return;
      }
      cell.scrollIntoView({
        block: 'nearest',
        inline: 'center',
        behavior: dragging || this.reducedMotion() ? 'auto' : 'smooth',
      });
    });
  }

  public frameUrl(stop: SweepStop): string {
    return this.sweeps.imageUrl(stop);
  }

  public sidecarUrl(path: string): string {
    return this.sweeps.assetUrl(path);
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

  public expand(): void {
    this.loaded.set(false);
    if (this.viewerFirst()) {
      this.openViewer();
    } else {
      this.open.set(true);
    }
    this.prefetchNeighbours();
  }

  public collapse(): void {
    this.open.set(false);
    this.details.set(false);
    this.closeViewer();
  }

  /** Swap the pair between wiped and set apart, and remember which was asked for. */
  public toggleWipe(): void {
    this.wipeAsked.set(!this.wiped());
  }

  /** Swap between the grid and the filmstrip, and remember which was asked for. */
  public toggleLayout(): void {
    const next: StopLayout = this.gridOn() ? 'strip' : 'grid';
    this.layoutAsked.set(next);
    this.rememberLayout(next);
  }

  public toggleWhy(): void {
    this.why.update((open) => !open);
  }

  public toggleVariantWhy(): void {
    this.variantWhy.update((open) => !open);
  }

  public toggleDetails(): void {
    this.details.update((open) => !open);
  }

  /** Closing the details hands focus back to the handle that opened them. */
  public closeDetails(): void {
    this.details.set(false);
    this.focusedDetails = null;
  }

  /** Hold the frame against one of the pictures it was made from, or stop. */
  public toggleCompare(kind: 'source' | 'map'): void {
    this.against.update((current) => (current === kind ? null : kind));
    this.loaded.set(true);
  }

  /**
   * Swap between the two readings of a parameter, holding the position. The
   * full-size view holds its position too rather than closing: the toggle is
   * offered inside it, and a swap that threw the reader back to the page would
   * be answering the comparison by ending it.
   */
  public useVariant(on: boolean): void {
    this.variant.set(on);
    this.loaded.set(false);
  }

  /**
   * Open the frame at the size the differences between neighbouring stops are
   * readable at. The frame animates out of the one on the plate where the
   * browser can do it and the reader has not asked for less motion.
   */
  public openViewer(): void {
    this.returnFocusTo =
      (document.activeElement as HTMLElement | null) ??
      this.openerRefs()[0]?.nativeElement ??
      null;
    this.resetZoom();
    this.viewer.set(true);
  }

  public closeViewer(): void {
    this.viewer.set(false);
  }

  /** The browser closed the dialog, however it was asked to: Escape included. */
  public onDialogClose(): void {
    this.viewer.set(false);
    this.resetZoom();
    const back = this.returnFocusTo ?? this.openerRefs()[0]?.nativeElement;
    this.returnFocusTo = null;
    back?.focus?.();
  }

  /** Take one stop of the grid full size, and move the stage onto it too. */
  public openStopViewer(at: number): void {
    this.goToStop(at);
    this.openViewer();
  }

  public stepStop(delta: number): void {
    this.goToStop(this.index() + delta);
  }

  /**
   * Move the strip to a stop. One position drives the plate and the full-size
   * view together: closing on a stop the reader scrubbed to only to find the
   * page still on the old one would undo the comparison they just made.
   */
  public goToStop(to: number): void {
    const at = this.clampStop(to);
    this.cursor.set(at);
    this.prefetchNeighbours();
  }

  public onFrameLoad(): void {
    this.loaded.set(true);
  }

  /* ---------- the stage ---------- */

  /** Arrows step, Home and End jump, Enter and Space open the full-size view. */
  public onStageKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      if (event.target === event.currentTarget) {
        event.preventDefault();
        this.openViewer();
      }
      return;
    }
    const step = STEP_KEYS[event.key];
    if (step === undefined || !this.scrubbable() || isSlider(event.target)) {
      return;
    }
    event.preventDefault();
    this.goToStop(
      step === 'first'
        ? 0
        : step === 'last'
          ? this.lastIndex()
          : this.index() + step,
    );
  }

  /** A press on the stage opens the frame, unless it turned into something else. */
  public onStagePress(): void {
    const press = this.stagePress;
    if (press?.scrubbing || press?.moved || this.holding()) {
      return;
    }
    this.openViewer();
  }

  public onStagePointerDown(event: PointerEvent): void {
    const stage = event.currentTarget;
    const width =
      stage instanceof HTMLElement ? stage.getBoundingClientRect().width : 0;
    this.stagePress = {
      x: event.clientX,
      y: event.clientY,
      at: this.index(),
      width,
      scrubbing: false,
      moved: false,
    };
    if (this.comparisons().length > 0) {
      this.holdTimer = setTimeout(() => this.holding.set(true), HOLD_MS);
    }
  }

  /**
   * A drag across the stage scrubs, once it has said which way it is going: the
   * stage sits in a page that scrolls, and a swipe down over it belongs to the
   * page.
   */
  public onStagePointerMove(event: PointerEvent): void {
    const press = this.stagePress;
    if (!press || !this.scrubbable()) {
      return;
    }
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (Math.abs(dx) > DRAG_INTENT_PX || Math.abs(dy) > DRAG_INTENT_PX) {
      press.moved = true;
      this.cancelHold();
    }
    if (!press.scrubbing) {
      if (Math.abs(dx) < DRAG_INTENT_PX || Math.abs(dx) <= Math.abs(dy)) {
        return;
      }
      press.scrubbing = true;
      this.scrubDrag.set(true);
    }
    const perStop = press.width > 0 ? press.width / this.frameCount() : 0;
    if (perStop > 0) {
      this.goToStop(press.at + Math.round(dx / perStop));
    }
  }

  public onStagePointerUp(): void {
    this.cancelHold();
    this.holding.set(false);
    this.scrubDrag.set(false);
    // The press itself is cleared after the click it produced has been read.
    const press = this.stagePress;
    setTimeout(() => {
      if (this.stagePress === press) {
        this.stagePress = null;
      }
    }, 0);
  }

  /* ---------- the full-size view ---------- */

  public onViewerPointerDown(event: PointerEvent): void {
    this.viewerPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (this.viewerPointers.size === 2) {
      this.pinchFrom = { spread: this.pointerSpread(), zoom: this.zoomAt() };
    }
  }

  /**
   * Two fingers pinch the frame; one drags it about once it is zoomed in, and
   * decides between the stops and the way out once it is not.
   */
  public onViewerPointerMove(event: PointerEvent): void {
    const from = this.viewerPointers.get(event.pointerId);
    if (!from) {
      return;
    }
    const previous = { ...from };
    from.x = event.clientX;
    from.y = event.clientY;
    if (this.viewerPointers.size >= 2) {
      const pinch = this.pinchFrom;
      const spread = this.pointerSpread();
      if (pinch && pinch.spread > 0) {
        this.setZoom((spread / pinch.spread) * pinch.zoom);
      }
      return;
    }
    if (this.zoomAt() > ZOOM_MIN) {
      this.pan.update((at) => ({
        x: at.x + (event.clientX - previous.x),
        y: at.y + (event.clientY - previous.y),
      }));
    }
  }

  /** A swipe across steps, a swipe down closes, and a pinch simply ends. */
  public onViewerPointerUp(event: PointerEvent): void {
    const from = this.viewerPointers.get(event.pointerId);
    this.viewerPointers.delete(event.pointerId);
    if (this.viewerPointers.size < 2) {
      this.pinchFrom = null;
    }
    if (!from || this.zoomAt() > ZOOM_MIN) {
      return;
    }
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    if (dy > SWIPE_CLOSE_PX && Math.abs(dy) > Math.abs(dx)) {
      this.closeViewer();
      return;
    }
    if (
      this.scrubbable() &&
      Math.abs(dx) > SWIPE_STEP_PX &&
      Math.abs(dx) > Math.abs(dy)
    ) {
      this.stepStop(dx < 0 ? 1 : -1);
    }
  }

  /* ---------- the rail ---------- */

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
   * Where an end number sits: the slit's own position, so the number is under
   * the slit it names. Only a value that reaches the lane's edge is held in.
   */
  public labelPercent(at: number): number {
    return Math.min(
      Math.max(this.tickPercent(at), END_LABEL_EDGE_PERCENT),
      100 - END_LABEL_EDGE_PERCENT,
    );
  }

  /** The stop at a position on the rail, clamped to what the strip has. */
  public stopAt(at: number): SweepStop {
    const stops = this.stops();
    return stops[this.clampStop(at)] ?? this.stop();
  }

  /**
   * A press on the rail. The slit under the pointer wins where there is one,
   * which is what makes a tap on a particular frame land on that frame rather
   * than on whatever the arithmetic rounds to; anywhere else on the rail falls
   * back to the position across its width.
   */
  public onRailPress(event: MouseEvent): void {
    const at =
      this.tickUnder(event.target) ??
      this.railPosition(event.currentTarget, event.clientX);
    if (at !== null) {
      this.goToStop(at);
    }
  }

  public onRailKeydown(event: KeyboardEvent, at: number): void {
    const step = STEP_KEYS[event.key];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const last = this.lastIndex();
    this.goToStop(step === 'first' ? 0 : step === 'last' ? last : at + step);
  }

  /**
   * A press anywhere on the lane, its full height included, lands on the
   * nearest stop and arms a drag from there. Waiting for the press to land on
   * the thumb makes the lane a control only someone who already knows where the
   * thumb is can use, and the thumb is the smallest part of it.
   */
  public startRailDrag(event: PointerEvent): void {
    const at = this.railPosition(event.currentTarget, event.clientX);
    if (at !== null) {
      this.goToStop(at);
    }
    this.pressedAt = { x: event.clientX, y: event.clientY };
    if (event.pointerType === 'touch') {
      this.railDragging = false;
      return;
    }
    this.railDragging = true;
    this.scrubDrag.set(true);
    this.captureRail(event);
  }

  /** A drag along the rail reads its position rather than the slit under it. */
  public onRailDrag(event: PointerEvent): void {
    if (!this.railDragging && !this.takesOverGesture(event)) {
      return;
    }
    const at = this.railPosition(event.currentTarget, event.clientX);
    if (at !== null) {
      this.goToStop(at);
    }
  }

  public endRailDrag(): void {
    this.railDragging = false;
    this.scrubDrag.set(false);
    this.pressedAt = null;
  }

  /* ---------- the plumbing ---------- */

  /** The layout remembered for a host of this shape, if one is. */
  private rememberedLayout(wide: boolean): StopLayout | null {
    try {
      const stored = localStorage.getItem(
        LAYOUT_KEYS[wide ? 'wide' : 'narrow'],
      );
      return stored === 'grid' || stored === 'strip' ? stored : null;
    } catch {
      // Storage the browser will not hand over simply remembers nothing.
      return null;
    }
  }

  private rememberLayout(layout: StopLayout): void {
    try {
      localStorage.setItem(
        LAYOUT_KEYS[this.wide() ? 'wide' : 'narrow'],
        layout,
      );
    } catch {
      // Storage the browser will not hand over simply remembers nothing.
    }
  }

  private clampStop(at: number): number {
    return Math.min(Math.max(at, 0), Math.max(this.lastIndex(), 0));
  }

  private setZoom(to: number): void {
    const held = Math.min(Math.max(to, ZOOM_MIN), ZOOM_MAX);
    this.zoomAt.set(Math.round(held * 100) / 100);
    if (held === ZOOM_MIN) {
      this.pan.set({ x: 0, y: 0 });
    }
  }

  private resetZoom(): void {
    this.zoomAt.set(1);
    this.pan.set({ x: 0, y: 0 });
    this.viewerPointers.clear();
    this.pinchFrom = null;
  }

  private pointerSpread(): number {
    const [first, second] = [...this.viewerPointers.values()];
    if (!first || !second) {
      return 0;
    }
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  private cancelHold(): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
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
    this.railDragging = true;
    this.scrubDrag.set(true);
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
    const across = ((clientX - box.left) / box.width) * count - 0.5;
    return Math.round(across);
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

  /**
   * Watch the room this explorer has. The layout is written against container
   * queries, and this is the same measurement for the two decisions the queries
   * cannot make on their own: whether the contact sheet is offered, and whether
   * the details are a sheet or a panel.
   */
  private observeHostWidth(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const element = this.host.nativeElement;
    const observer = new ResizeObserver((entries) => {
      this.hostWidth.set(entries[0]?.contentRect.width ?? element.offsetWidth);
    });
    observer.observe(element);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private reducedData(): boolean {
    return this.mediaMatches('(prefers-reduced-data: reduce)');
  }

  private reducedMotion(): boolean {
    return this.mediaMatches('(prefers-reduced-motion: reduce)');
  }

  private mediaMatches(query: string): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(query).matches
    );
  }
}

/**
 * Whether a key landed on a control that steps by itself. The stage's arrow
 * handling would otherwise move two stops for one press on the rail inside it,
 * and drag the wipe's divider and the frames under it at the same time.
 */
function isSlider(target: EventTarget | null): boolean {
  return target instanceof Element && target.getAttribute('role') === 'slider';
}

/** The first number in a value or a band, e.g. `20` out of `"20-40"`. */
function firstNumber(text: string): number | null {
  const found = /-?\d+(\.\d+)?/.exec(text);
  return found ? Number(found[0]) : null;
}
