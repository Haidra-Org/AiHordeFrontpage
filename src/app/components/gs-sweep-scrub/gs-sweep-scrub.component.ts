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
  SweepCrop,
  SweepStop,
  sweepIsCategorical,
} from '../../services/sweep-library.service';
import {
  GsPixelBadgeComponent,
  PixelSize,
} from '../gs-pixel-badge/gs-pixel-badge.component';
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

/**
 * How close in the full-size view may be drawn, as image pixels per device
 * pixel. 1 is one pixel of the file per pixel of the display, which is the
 * point of the whole exercise: below it a difference between two upscalers is
 * being resampled away, and above it the reader is inspecting the resampling.
 * The floor is whatever the picture fits at, computed per picture.
 */
const ZOOM_CEILING = 4;

/** The two named steps above Fit, and what the pills call them. */
const ZOOM_STEPS = [
  { id: 'full', scale: 1, labelKey: 'generate.sweeps.zoom_full' },
  { id: 'double', scale: 2, labelKey: 'generate.sweeps.zoom_double' },
] as const;

/** Which named step a zoom is at, or `fit` while it is at the fitted size. */
type ZoomStep = 'fit' | 'full' | 'double';

/** Where the reader's zoom is kept for the rest of the session. */
const ZOOM_KEY = 'gs-sweep-zoom';

/** How wide the lens is, and so how much of the picture it holds at true size. */
const LOUPE_PX = 200;

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

/**
 * The host width, in pixels, under which the explorer is an offer rather than
 * an instrument. Below it the stage, the rail and the controls are all in the
 * room at once and none of them has enough of it, so the card names the sweep
 * and the press opens the pictures at full size instead. It is the same number
 * as `@container gs-sweep (min-width: 480px)` in src/styles/_generate.css,
 * where the inline layout starts asking for the room it needs; the two have to
 * agree about which shape the explorer is in.
 */
export const LAUNCHER_HOST_PX = 480;

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
 * In a surface narrower than the plate's own first breakpoint the card is a
 * launcher: the same preview standing still, and one press that goes straight
 * to full size. Squeezing the stage, the rail and the controls into a phone
 * sheet gives the reader all three at a size none of them works at, and a state
 * that folded open there would follow them from page to page.
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
    GsPixelBadgeComponent,
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
          decoding="async"
        />
        <span class="gs-sweep-solo-cap">
          {{ 'generate.sweeps.tile_solo_label' | transloco }}
        </span>
      </span>
    </ng-template>

    <!-- One frame, however this strip's frames have to be drawn. A tiled strip
         has no single image to hang alt text on, so the nine copies are one
         labelled group and the copies themselves are decoration. -->
    <ng-template #frame let-stop="stop" let-cls="cls" let-inViewer="inViewer">
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
                [src]="mediaUrl(stop)"
                alt=""
                loading="lazy"
                decoding="async"
                (load)="onFrameLoad($event)"
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
          [src]="mediaUrl(stop)"
          [alt]="
            'generate.sweeps.frame_alt'
              | transloco: { value: valueTextOf(stop) }
          "
          loading="lazy"
          decoding="async"
          (load)="onFrameLoad($event)"
        />
      }
    </ng-template>

    <!-- The two sides of a before-and-after strip, wiped over each other. The
         chips are the sides' labels: the same token the caption under a range
         strip carries, so "Tiling On" reads the same wherever it is said. -->
    <ng-template
      #pairWipe
      let-sides="sides"
      let-inViewer="inViewer"
      let-still="still"
    >
      <app-gs-compare-wipe
        [beforeSrc]="mediaUrl(sides[0])"
        [afterSrc]="mediaUrl(sides[1])"
        [beforeAlt]="frameAlt(sides[0])"
        [afterAlt]="frameAlt(sides[1])"
        [tiled]="tiled()"
        [sideBySide]="!!still || !wiped()"
        [handleOnly]="true"
        [fit]="!!inViewer"
        [fitWidth]="fitBox()?.width ?? null"
        [fitHeight]="fitBox()?.height ?? null"
        [zoom]="zoomFactor()"
        [panX]="panX()"
        [panY]="panY()"
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
    <ng-template #againstWipe let-inViewer="inViewer">
      <app-gs-compare-wipe
        [beforeSrc]="compareUrl()!"
        [afterSrc]="mediaUrl(stop())"
        [beforeAlt]="compareAlt()"
        [afterAlt]="frameAlt(stop())"
        [beforeLabel]="compareAlt()"
        [afterLabel]="valueTextOf(stop())"
        [beforeNote]="matchNotes().before"
        [afterNote]="matchNotes().after"
        [handleOnly]="true"
        [fit]="!!inViewer"
        [fitWidth]="fitBox()?.width ?? null"
        [fitHeight]="fitBox()?.height ?? null"
        [zoom]="zoomFactor()"
        [panX]="panX()"
        [panY]="panY()"
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
      <!-- The value and what the frame is held against share one band along the
           top, so that where the two cannot fit on a line the chips take the
           line below rather than lying over the value. -->
      <span class="gs-sweep-topbar">
        <span class="gs-sweep-titles">
          <span class="gs-sweep-pill">{{ pillText() }}</span>
          <!-- Two frames drawn the same size on the page can be four times apart
               in pixels, and on an upscaler strip that difference is the whole
               subject. The size is said wherever the picture is. -->
          @if (viewSize(); as size) {
            <app-gs-pixel-badge
              class="gs-pixels--stage"
              [attr.aria-live]="inViewer ? 'polite' : null"
              [width]="size.width"
              [height]="size.height"
              [shown]="inViewer || zoomedIn() ? shownPercent() : null"
            />
          }
        </span>
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
      </span>
      @if (!inViewer && offersZoom()) {
        <ng-container [ngTemplateOutlet]="scales" />
      }
      <span class="gs-sweep-glyphs">
        @if (finePointer()) {
          <button
            type="button"
            class="gs-sweep-expand"
            [class.is-on]="loupeOn()"
            [attr.aria-pressed]="loupeOn()"
            [attr.aria-label]="
              (loupeOn()
                ? 'generate.sweeps.loupe_off'
                : 'generate.sweeps.loupe_on'
              ) | transloco
            "
            (click)="toggleLoupe(); $event.stopPropagation()"
          >
            <app-icon name="magnifying-glass" class="gs-ico-sm" />
          </button>
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
      </span>
    </ng-template>

    <!-- How close in the picture is drawn. One control, offered wherever the
         picture has more pixels than the room is drawing it in: Fit is the
         picture whole, 100% is one pixel of the file per pixel of the display,
         and 200% is the resampling itself. -->
    <ng-template #scales>
      <span
        class="gs-sweep-scales"
        role="group"
        [attr.aria-label]="'generate.sweeps.zoom_group' | transloco"
      >
        <button
          type="button"
          class="gs-sweep-scale"
          [class.is-on]="zoomStep() === 'fit'"
          [attr.aria-pressed]="zoomStep() === 'fit'"
          (click)="zoomTo(null); $event.stopPropagation()"
        >
          {{ 'generate.sweeps.zoom_fit' | transloco }}
        </button>
        @for (step of zoomSteps; track step.id) {
          <button
            type="button"
            class="gs-sweep-scale"
            [class.is-on]="zoomStep() === step.id"
            [attr.aria-pressed]="zoomStep() === step.id"
            (click)="zoomTo(step.scale); $event.stopPropagation()"
          >
            {{ step.labelKey | transloco }}
          </button>
        }
      </span>
    </ng-template>

    <!-- The picture itself, whatever it currently is: the pair wiped over each
         other, the frame against what it is held to, the thing being held up
         while a finger rests on the stage, or the frame on its own. -->
    <ng-template #stageMedia let-inViewer="inViewer">
      @if (held() && heldUrl()) {
        <img
          class="gs-sweep-frame"
          [src]="heldUrl()!"
          [alt]="compareAltText()"
          loading="lazy"
          decoding="async"
        />
      } @else if (compareUrl()) {
        <ng-container
          [ngTemplateOutlet]="againstWipe"
          [ngTemplateOutletContext]="{ inViewer: inViewer }"
        />
      } @else if (pairSides(); as sides) {
        <ng-container
          [ngTemplateOutlet]="pairWipe"
          [ngTemplateOutletContext]="{ sides: sides, inViewer: inViewer }"
        />
      } @else {
        <ng-container
          [ngTemplateOutlet]="frame"
          [ngTemplateOutletContext]="{
            stop: stop(),
            cls: 'gs-sweep-frame',
            inViewer: inViewer,
          }"
        />
      }
      <!-- The lens: a round window on the same picture at its own pixels,
           following the pointer. With a comparison up it is split down the
           middle, the two sides showing the same pixels of each picture, which
           is the one reading a divider across a whole frame cannot give. -->
      @if (loupeOn() && lensAt(); as at) {
        <span
          class="gs-sweep-lens"
          aria-hidden="true"
          [style.left.px]="at.x"
          [style.top.px]="at.y"
        >
          @if (compareUrl(); as against) {
            <span
              class="gs-sweep-lens-half gs-sweep-lens-half--before"
              [style.background-image]="'url(' + against + ')'"
              [style.background-size]="at.backgroundSize"
              [style.background-position]="at.backgroundPosition"
            ></span>
          }
          <span
            class="gs-sweep-lens-half gs-sweep-lens-half--after"
            [class.is-split]="!!compareUrl()"
            [style.background-image]="'url(' + fullUrl(stop()) + ')'"
            [style.background-size]="at.backgroundSize"
            [style.background-position]="at.backgroundPosition"
          ></span>
        </span>
      }
    </ng-template>

    @if (strip()) {
      <div class="gs-sweep">
        @if (launcher()) {
          <!-- Too little room for the instrument, so the offer is the whole of
               it: what this is, what it shows, and the press that opens the
               pictures at a size the differences can be read at. The preview
               pair stands still here; there is no divider to drag and no plate
               to unfold. -->
          <div class="gs-sweep-card gs-sweep-card--launch">
            @if (showPreview() && previewPair(); as sides) {
              <span class="gs-sweep-card-stage">
                <ng-container
                  [ngTemplateOutlet]="pairWipe"
                  [ngTemplateOutletContext]="{ sides: sides, still: true }"
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
              <button
                #opener
                type="button"
                class="gs-sweep-card-door"
                (click)="openViewer()"
              >
                {{ 'generate.sweeps.card_launch' | transloco }}
                <app-icon name="arrows-pointing-out" class="gs-ico-sm" />
              </button>
            </span>
          </div>
        } @else if (expanded()) {
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
                  [class.is-pannable]="pannable()"
                  [class.is-zoomed]="zoomedIn()"
                  [style.--gs-sweep-zoom]="zoomFactor()"
                  [style.--gs-sweep-pan-x.px]="panX()"
                  [style.--gs-sweep-pan-y.px]="panY()"
                  [attr.aria-roledescription]="
                    'generate.sweeps.stage_role' | transloco
                  "
                  [attr.aria-label]="parameterLabelKey() | transloco"
                  (keydown)="onStageKeydown($event)"
                  (click)="onStagePress($event)"
                  (pointerdown)="onPicturePointerDown($event)"
                  (pointermove)="onPicturePointerMove($event, false)"
                  (pointerup)="onPicturePointerUp($event, false)"
                  (pointercancel)="onPicturePointerUp($event, false)"
                  (pointerleave)="onStageLeave()"
                  (wheel)="onPictureWheel($event, false)"
                  (dblclick)="onPictureDoublePress($event)"
                >
                  <ng-container
                    [ngTemplateOutlet]="stageMedia"
                    [ngTemplateOutletContext]="{ inViewer: false }"
                  />
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
                                (option.crop
                                  ? 'generate.sweeps.stop_go_detail'
                                  : 'generate.sweeps.stop_go'
                                ) | transloco: { value: namedValue(option) }
                              "
                              (click)="goToStop(i)"
                              (dblclick)="openStopViewer(i)"
                            >
                              <img
                                class="gs-sweep-plate-img"
                                [src]="thumbUrl(option)"
                                alt=""
                                loading="lazy"
                                decoding="async"
                                fetchpriority="low"
                              />
                              <!-- A cut detail is not the frame, and a reader
                                   comparing textures has to know which they
                                   are looking at. -->
                              @if (option.crop) {
                                <span class="gs-sweep-crop-tag">{{
                                  'generate.sweeps.crop_tag' | transloco
                                }}</span>
                              }
                            </button>
                            <button
                              type="button"
                              class="gs-sweep-expand gs-sweep-expand--cell"
                              [attr.aria-label]="
                                'generate.sweeps.stop_enlarge'
                                  | transloco: { value: namedValue(option) }
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
                            <!-- The value alone. The setting's name is on the
                                 plate's title and on the stage, and repeating
                                 it under every frame of a forty-frame sheet is
                                 the same two words forty times. The button's
                                 own name still says both. -->
                            <span
                              class="gs-sweep-value"
                              [title]="valueTextOf(option)"
                              >{{ valueTextOf(option) }}</span
                            >
                            @if (stopDiffers(option)) {
                              <app-gs-pixel-badge
                                class="gs-pixels--cell"
                                [width]="stopSize(option)?.width"
                                [height]="stopSize(option)?.height"
                              />
                            }
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
                                | transloco: { value: namedValue(option) }
                            "
                            (click)="goToStop(i)"
                          >
                            <img
                              class="gs-sweep-film-img"
                              [src]="thumbUrl(option)"
                              alt=""
                              loading="lazy"
                              decoding="async"
                              fetchpriority="low"
                            />
                            @if (option.crop) {
                              <span class="gs-sweep-crop-tag">{{
                                'generate.sweeps.crop_tag' | transloco
                              }}</span>
                            }
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
                <p
                  class="gs-sweep-caption"
                  [class.is-quiet]="gridOn()"
                  role="status"
                  aria-live="polite"
                >
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
                  [ngTemplateOutletContext]="{ sides: sides }"
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
                <ng-container [ngTemplateOutlet]="scales" />
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
                [class.is-pannable]="pannable()"
                [style.--gs-sweep-zoom]="zoomFactor()"
                [style.--gs-sweep-pan-x.px]="panX()"
                [style.--gs-sweep-pan-y.px]="panY()"
                [class.is-zoomed]="zoomedIn()"
                (pointerdown)="onPicturePointerDown($event)"
                (pointermove)="onPicturePointerMove($event, true)"
                (pointerup)="onPicturePointerUp($event, true)"
                (pointercancel)="onPicturePointerUp($event, true)"
                (pointerleave)="onStageLeave()"
                (wheel)="onPictureWheel($event, true)"
                (dblclick)="onPictureDoublePress($event)"
              >
                <ng-container
                  [ngTemplateOutlet]="stageMedia"
                  [ngTemplateOutletContext]="{ inViewer: true }"
                />
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
    // The keys for how close in the picture is drawn are taken here rather
    // than on the full-size view's own body, which is a box rather than a
    // control and has no business holding focus. The dialog is a child of this
    // element even while the browser has it in the top layer.
    '(keydown)': 'onViewKeydown($event)',
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
  /**
   * Whether the inline plate stands open. A host too narrow for the plate has
   * nothing to open, so the state is dropped rather than carried: a strip a
   * reader opened on a wide page must not arrive open in a phone-sized sheet on
   * the next one.
   */
  private readonly open = linkedSignal(
    () => !this.viewerFirst() && !this.launcher() && this.startExpanded(),
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

  /**
   * How close in the full-size view is drawn, in image pixels per device pixel,
   * or null while it stands at whatever the picture fits at. An absolute scale
   * rather than a multiplier, because the reader's question is "am I looking at
   * the real pixels" and only one number answers that.
   */
  private readonly zoomAsked = signal<number | null>(null);
  /**
   * Whether the reader has moved the zoom themselves. A view they set is kept
   * as they step between stops, because holding one detail still while the
   * pictures change under it is what a detail comparison is; a view they never
   * touched is refitted to each picture.
   */
  private readonly zoomTouched = signal(false);
  private readonly pan = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  /**
   * The detail the view has been asked to open on, held until the room has been
   * measured. Null both before a caller asks and once the view has been put
   * where it was asked for.
   */
  private readonly wantedCrop = signal<SweepCrop | null>(null);
  /** The room the full-size view gives the picture, in CSS pixels. */
  private readonly viewBox = signal<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  /**
   * The size of the frame as the browser found it. The index says what every
   * frame is, and this is the answer only for the strips published before it
   * did.
   */
  private readonly measuredFrame = signal<PixelSize | null>(null);
  /**
   * The room the plate's own stage gives the picture, measured the same way the
   * full-size view's is. The zoom is one model with two hosts, and the only
   * thing that differs between them is how much room the picture has.
   */
  private readonly plateBox = signal<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  /** Whether the lens follows the pointer over the picture. */
  private readonly loupe = signal(false);
  /** Where the lens is and what it is holding up, or null while it is away. */
  private readonly lens = signal<{
    x: number;
    y: number;
    backgroundSize: string;
    backgroundPosition: string;
  } | null>(null);

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
  /** Whether the filmstrip is under a drag, and so holds still and unsnapped. */
  public readonly dragging = this.scrubDrag.asReadonly();
  public readonly panX = computed(() => this.pan().x);
  public readonly panY = computed(() => this.pan().y);
  /** Whether the lens is armed. It is a pointer's tool and asks for a pointer. */
  public readonly loupeOn = computed(() => this.loupe() && this.finePointer());
  public readonly lensAt = this.lens.asReadonly();
  public readonly zoomSteps = ZOOM_STEPS;

  private readonly viewerRef =
    viewChild<ElementRef<HTMLDialogElement>>('viewer');
  private readonly viewerStageRef =
    viewChild<ElementRef<HTMLElement>>('viewerStage');
  private readonly plateStageRef = viewChild<ElementRef<HTMLElement>>('stage');
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
   * Where the two fingers last were, between them. A pinch that only scaled
   * would grow the picture about a point the reader is not holding; carrying
   * the middle is what lets one gesture both place a detail and enlarge it.
   */
  private pinchAt: { x: number; y: number } | null = null;

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

  /**
   * Whether the explorer is a way in rather than the instrument itself. A host
   * of no width has not been measured yet, and the inline explorer is what an
   * unmeasured host gets: a card that turned itself into a launcher for the one
   * frame before the first measurement would flicker on every page.
   */
  public readonly launcher = computed(() => {
    const width = this.hostWidth();
    return width > 0 && width < LAUNCHER_HOST_PX;
  });

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

  /* ---------- what the pictures are, in pixels ---------- */

  /** The size the whole strip was rendered at, where the index records one. */
  public readonly heldSize = computed<PixelSize | null>(() =>
    pixelSize(this.strip()?.held),
  );

  /**
   * What one stop is in pixels. Its own size wins, because a strip that changes
   * the size is exactly the strip a reader is asking this about; a strip that
   * holds it says so once, on the strip.
   */
  public stopSize(stop: SweepStop | null | undefined): PixelSize | null {
    return (stop ? pixelSize(stop) : null) ?? this.heldSize();
  }

  /** Whether this stop is a different size from the rest of the strip. */
  public stopDiffers(stop: SweepStop): boolean {
    const own = pixelSize(stop);
    const held = this.heldSize();
    return (
      !!own && (!held || own.width !== held.width || own.height !== held.height)
    );
  }

  /** The current frame's size, however the surface can come by it. */
  public readonly frameSize = computed<PixelSize | null>(
    () =>
      this.stopSize(this.stops()[this.index()]) ?? this.measuredFrame() ?? null,
  );

  /** The size of the picture the frame is being held against, once it has loaded. */
  private readonly comparedSize = signal<PixelSize | null>(null);

  /**
   * The size the view is being read at: the larger of the two sides when a
   * comparison is up. A 512-pixel source held against a 2048-pixel upscale is
   * read at 2048, with the source enlarged to meet it, because reducing the
   * upscale would throw away the only thing the pair is being compared for.
   */
  public readonly viewSize = computed<PixelSize | null>(() => {
    const frame = this.frameSize();
    const against = this.compareUrl() ? this.comparedSize() : null;
    if (!frame) {
      return against;
    }
    if (!against) {
      return frame;
    }
    return against.width > frame.width ? against : frame;
  });

  /**
   * What had to be done to each side of the comparison to make it fair, for the
   * tags. Only the smaller side carries a note, and only where both sizes are
   * known: a note the surface had to guess at is worse than no note.
   */
  public readonly matchNotes = computed<{ before: string; after: string }>(
    () => {
      const frame = this.frameSize();
      const against = this.compareUrl() ? this.comparedSize() : null;
      const blank = { before: '', after: '' };
      if (!frame || !against || frame.width === against.width) {
        return blank;
      }
      const factor =
        Math.max(frame.width, against.width) /
        Math.min(frame.width, against.width);
      const note = this.transloco.translate('generate.sweeps.match_note', {
        factor: Math.round(factor * 10) / 10,
      });
      return against.width < frame.width
        ? { before: note, after: '' }
        : { before: '', after: note };
    },
  );

  /**
   * The box the full-size view holds both sides of a comparison in, in CSS
   * pixels: the picture at the size it fits the room at. Both sides are drawn
   * into the whole of it, so the smaller of two sides is enlarged to meet the
   * larger rather than the larger being reduced to meet it.
   */
  /**
   * The room the picture currently has: the full-size view's while it is open,
   * and the plate's stage otherwise. Everything the zoom is arithmetic against
   * reads this rather than one host's box, which is what makes the two hosts
   * one model instead of two.
   */
  private readonly box = computed(() =>
    this.viewerOpen() ? this.viewBox() : this.plateBox(),
  );

  public readonly fitBox = computed<{ width: number; height: number } | null>(
    () => {
      const size = this.viewSize();
      const box = this.box();
      if (!size || box.width <= 0) {
        return null;
      }
      const drawn = this.fitScale() / this.pixelRatio();
      return { width: size.width * drawn, height: size.height * drawn };
    },
  );

  /* ---------- how close in the full-size view is drawn ---------- */

  /**
   * The scale at which the picture fits the room the view gives it, in image
   * pixels per device pixel. It is the floor of the zoom and the meaning of the
   * Fit pill, and it moves with the room and with the picture.
   */
  public readonly fitScale = computed(() => {
    const size = this.viewSize();
    const box = this.box();
    if (!size || size.width <= 0 || box.width <= 0 || box.height <= 0) {
      return 1;
    }
    const ratio = this.pixelRatio();
    return Math.min(
      (box.width * ratio) / size.width,
      (box.height * ratio) / size.height,
    );
  });

  /** How close in the view is drawn, in image pixels per device pixel. */
  public readonly zoomScale = computed(
    () => this.zoomAsked() ?? this.fitScale(),
  );

  /** The same, as the multiplier the frame's own layout is scaled by. */
  public readonly zoomFactor = computed(() => {
    const fit = this.fitScale();
    return fit > 0 ? this.zoomScale() / fit : 1;
  });

  /** What the badge says the view is drawing the picture at. */
  public readonly shownPercent = computed(() => this.zoomScale() * 100);

  /** Which of the named steps the view is at, or null between two of them. */
  public readonly zoomStep = computed<ZoomStep | null>(() => {
    const asked = this.zoomAsked();
    if (asked === null) {
      return 'fit';
    }
    const step = ZOOM_STEPS.find((entry) => near(asked, entry.scale));
    return step ? step.id : null;
  });

  /**
   * Whether the view is asking for the file's own pixels. Below that the
   * smaller published copy is what every surface draws, so a page of upscales
   * is not a page of upscale-sized downloads.
   */
  public readonly wantsFullPixels = computed(
    () => (this.viewerOpen() || this.zoomTouched()) && this.zoomScale() >= 1,
  );

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
    this.observeViewBox();
    this.observePlateBox();
    this.holdAskedCrop();

    // What the picture being compared against is, in pixels. The index says
    // nothing about a source image or a detector's map, so the only place the
    // answer exists is the file, and the pair cannot be labelled honestly
    // without it.
    effect(() => {
      const against = this.compareUrl();
      this.comparedSize.set(null);
      if (!against || typeof Image === 'undefined') {
        return;
      }
      const probe = new Image();
      probe.onload = () => {
        if (this.compareUrl() === against && probe.naturalWidth > 0) {
          this.comparedSize.set({
            width: probe.naturalWidth,
            height: probe.naturalHeight,
          });
        }
      };
      probe.src = against;
    });

    // What the reader last asked for on a host of this shape. Read whenever the
    // shape changes rather than once, because the same explorer moves between
    // shapes as its surface resizes.
    effect(() => {
      if (this.launcher()) {
        // A launcher lays no stops out, so it has nothing to remember and no
        // business reading what another surface remembered.
        return;
      }
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
      if (!cell || !strip) {
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
      // The lane alone moves: scrollIntoView would also scroll every ancestor
      // to reach a filmstrip below the fold, which on a phone drops the reader
      // onto the strip the moment a layer holding one opens.
      strip.scrollBy({
        left: box.left + box.width / 2 - (lane.left + lane.width / 2),
        behavior: dragging || this.reducedMotion() ? 'auto' : 'smooth',
      });
    });
  }

  /**
   * The copy of a frame a stage draws: the smaller one the library published
   * beside it where there is one. A stage never has the room for a 4096-pixel
   * file, and asking for it is a download the reader never sees the point of.
   */
  public frameUrl(stop: SweepStop): string {
    return stop.fit
      ? this.sweeps.assetUrl(stop.fit)
      : this.sweeps.imageUrl(stop);
  }

  /**
   * Which copy of a frame to draw. Which host is showing it is no longer part
   * of the answer: the plate zooms as the full-size view does, and a reader
   * looking at true pixels is owed the file rather than the smaller copy
   * wherever they are standing.
   */
  public mediaUrl(stop: SweepStop): string {
    return this.wantsFullPixels()
      ? this.sweeps.imageUrl(stop)
      : this.frameUrl(stop);
  }

  /**
   * The copy a thumbnail draws: the detail the library cut, where it cut one.
   * Whole frames of an upscaler strip are the same picture at thumbnail size,
   * and what separates two upscalers is a few hundred pixels of texture.
   */
  public thumbUrl(stop: SweepStop): string {
    return stop.crop
      ? this.sweeps.assetUrl(stop.crop.file)
      : this.frameUrl(stop);
  }

  /** The file itself, at the pixels it was rendered at. */
  public fullUrl(stop: SweepStop): string {
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
   * The setting and the value one frame was rendered at, said in full. The
   * frames themselves show the value alone, because the setting is the one
   * thing every frame in a strip has in common; a reader being read to gets
   * both, because "12" on its own is a number with no subject.
   */
  public namedValue(stop: SweepStop): string {
    return `${this.transloco.translate(this.parameterLabelKey())} ${this.valueTextOf(stop)}`;
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
    // A reader who set a view once is reading every picture at it, however many
    // pictures they open on the way through a page.
    const remembered = this.rememberedZoom();
    if (remembered !== null) {
      this.zoomAsked.set(remembered);
      this.zoomTouched.set(true);
    }
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

  /**
   * Take one stop full size at the file's own pixels, centred on the detail the
   * library cut from it.
   *
   * A page that shows two crops beside each other has already picked the place
   * where the difference lives; asking a reader to open the explorer, find that
   * place again and zoom to it would be asking them to redo the work the crop
   * did for them. A stop the library published no crop for opens on the whole
   * frame, which is the same view the plate's own expand gives.
   *
   * The view is set once the room has been measured rather than here: the
   * dialog has no size until it has rendered, and a zoom asked for against a
   * box of zero resolves to the fitted size instead.
   */
  public openStopAtCrop(at: number): void {
    this.goToStop(at);
    this.openViewer();
    this.wantedCrop.set(this.strip()?.stops[at]?.crop ?? null);
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
    // A view the reader set is held across the change, because holding one
    // detail still while the picture under it changes is the comparison they
    // set it up for. A view they never touched is refitted to the new picture.
    if (!this.zoomTouched()) {
      this.zoomAsked.set(null);
      this.pan.set({ x: 0, y: 0 });
    }
    this.prefetchNeighbours();
  }

  /**
   * A frame has arrived. Its own size is read only where the index published
   * none: the index is the answer, and a size taken off the element is the
   * answer for the strips rendered before the index carried one.
   */
  public onFrameLoad(event?: Event): void {
    this.loaded.set(true);
    const image = event?.target;
    if (
      this.stopSize(this.stops()[this.index()]) === null &&
      image instanceof HTMLImageElement &&
      image.naturalWidth > 0
    ) {
      this.measuredFrame.set({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    }
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
  public onStagePress(event: Event): void {
    const press = this.stagePress;
    if (
      fromStageControl(event.target) ||
      press?.scrubbing ||
      press?.moved ||
      this.holding() ||
      // A plate drawn closer in is a picture the reader is inside: the press
      // there pans and toggles rather than leaving for another surface.
      this.zoomedIn()
    ) {
      return;
    }
    this.openViewer();
  }

  /**
   * A press on either picture. One gesture model, two hosts: what a drag does
   * next depends on how close in the picture is drawn rather than on which
   * surface it is drawn on.
   *
   * The divider, the chips and the glyphs stand on the picture and are the
   * controls a press there is meant for; a gesture under them would move the
   * picture while the reader was aiming at something else on it.
   */
  public onPicturePointerDown(event: PointerEvent): void {
    if (fromStageControl(event.target)) {
      return;
    }
    this.viewerPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (this.viewerPointers.size === 2) {
      this.pinchFrom = { spread: this.pointerSpread(), zoom: this.zoomScale() };
      this.pinchAt = this.pointerMiddle();
      this.cancelHold();
      this.stagePress = null;
      return;
    }
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
    if (!this.zoomedIn() && this.comparisons().length > 0) {
      this.holdTimer = setTimeout(() => this.holding.set(true), HOLD_MS);
    }
  }

  /**
   * What a drag does: two fingers always pinch and pan together; one finger
   * pans once the picture is drawn larger than the room, and otherwise scrubs
   * on the plate and waits to be read as a swipe in the full-size view.
   *
   * The plate sits in a page that scrolls, so a one-finger scrub has to say
   * which way it is going before it claims the gesture. A pan does not: the
   * picture is already larger than its room, and there is nowhere for a drag on
   * it to have been meant for.
   */
  public onPicturePointerMove(event: PointerEvent, inViewer: boolean): void {
    this.trackLens(event);
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
      const middle = this.pointerMiddle();
      // Two fingers move the picture as well as scale it, so a reader can put
      // a detail where they want it and grow it in the same gesture.
      if (this.pinchAt && middle) {
        this.panBy(middle.x - this.pinchAt.x, middle.y - this.pinchAt.y);
      }
      this.pinchAt = middle;
      if (pinch && pinch.spread > 0 && spread > 0) {
        this.setZoom(
          (spread / pinch.spread) * pinch.zoom,
          middle ? { clientX: middle.x, clientY: middle.y } : undefined,
        );
      }
      return;
    }

    if (this.zoomedIn()) {
      this.cancelHold();
      if (this.pannable()) {
        this.panBy(event.clientX - previous.x, event.clientY - previous.y);
      }
      return;
    }

    // At Fit the full-size view reads the drag as a swipe when it ends, so
    // nothing moves under the finger on the way.
    const press = this.stagePress;
    if (inViewer || !press || !this.scrubbable()) {
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

  /** The lens follows the pointer, so it leaves with it. */
  public onStageLeave(): void {
    this.lens.set(null);
  }

  /**
   * The end of a press. On the plate it is only bookkeeping; in the full-size
   * view a drag that moved nothing under it is read as a swipe, across to the
   * next stop or down to close, and only while the picture is at Fit: once it
   * is larger than the room, a drag was a pan.
   */
  public onPicturePointerUp(event: PointerEvent, inViewer: boolean): void {
    const from = this.viewerPointers.get(event.pointerId);
    this.viewerPointers.delete(event.pointerId);
    if (this.viewerPointers.size < 2) {
      this.pinchFrom = null;
      this.pinchAt = null;
    }
    this.cancelHold();
    this.holding.set(false);
    this.scrubDrag.set(false);
    const press = this.stagePress;
    // The press itself is cleared after the click it produced has been read.
    setTimeout(() => {
      if (this.stagePress === press) {
        this.stagePress = null;
      }
    }, 0);
    if (!inViewer || !from || this.zoomedIn()) {
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

  /**
   * A wheel over the picture moves between the fitted size and the sizes above
   * it without stopping at them, about the pointer, so the detail under the
   * cursor is the detail that grows.
   *
   * In the full-size view the page behind is inert and frozen, so the plain
   * wheel is this view's to take. On the plate it is not: the stage sits in a
   * page the reader is scrolling through, and a plate that swallowed the wheel
   * would trap them on it. There the wheel zooms with the platform's own zoom
   * modifier held, and once the picture is already drawn larger than the stage,
   * where a plain wheel is unambiguously about the picture.
   */
  public onPictureWheel(event: WheelEvent, inViewer: boolean): void {
    if (!inViewer && !event.ctrlKey && !event.metaKey && !this.zoomedIn()) {
      return;
    }
    event.preventDefault();
    const factor = Math.exp(-event.deltaY / 320);
    this.setZoom(this.zoomScale() * factor, event);
  }

  /**
   * Two presses swap between fitted and true pixels, about the pointer.
   *
   * On the plate at Fit the first of the two has already opened the picture
   * full size, which is what a press on the plate has always done; the pair
   * therefore lands as "open it, at true pixels, here". Once the plate is
   * zoomed a press no longer opens anything, and the two presses toggle in
   * place as they do in the view.
   */
  public onPictureDoublePress(event: MouseEvent): void {
    if (fromStageControl(event.target)) {
      return;
    }
    this.setZoom(
      this.zoomStep() === 'fit' ? 1 : this.fitScale(),
      event,
      this.zoomStep() !== 'fit',
    );
  }

  /**
   * The keys the picture answers, on whichever host is showing it: closer,
   * further, back to the whole picture, and the lens.
   *
   * Escape steps back rather than out: a reader who has zoomed in on a detail
   * and presses it means "undo that", and only once the picture is whole again
   * does the same key close the view. The dialog would otherwise close under
   * them at the first press, losing the stop and the comparison with it.
   */
  public onViewKeydown(event: KeyboardEvent): void {
    const onStage =
      event.target instanceof Element &&
      !!event.target.closest('.gs-sweep-stage');
    if (event.key === 'l' || event.key === 'L') {
      if (this.viewerOpen() || onStage) {
        event.preventDefault();
        this.toggleLoupe();
      }
      return;
    }
    if (!this.viewerOpen() && !onStage) {
      return;
    }
    if (event.key === 'Escape') {
      if (this.zoomedIn()) {
        event.preventDefault();
        event.stopPropagation();
        this.zoomTo(null);
      }
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      this.setZoom(this.zoomScale() * 1.25);
      return;
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      this.setZoom(this.zoomScale() / 1.25);
      return;
    }
    if (event.key === '0') {
      event.preventDefault();
      this.zoomTo(null);
    }
  }

  /** Go to one of the named sizes; null is whatever the picture fits at. */
  public zoomTo(scale: number | null): void {
    if (scale === null) {
      this.zoomAsked.set(null);
      this.zoomTouched.set(false);
      this.pan.set({ x: 0, y: 0 });
      this.rememberZoom(null);
      return;
    }
    this.setZoom(scale, undefined, true);
  }

  /** Whether the picture is larger than the room, and so worth dragging about. */
  public readonly pannable = computed(() => {
    const over = this.overflow();
    return over.x > 0.5 || over.y > 0.5;
  });

  /**
   * Whether the picture is drawn closer in than the room would draw it. It is
   * the one thing the gesture model branches on: at Fit a drag steers the
   * strip, and above Fit it moves the picture.
   */
  public readonly zoomedIn = computed(
    () =>
      this.zoomAsked() !== null && this.zoomScale() > this.fitScale() + 1e-3,
  );

  /**
   * Whether the zoom is worth offering here. The pills appear where the picture
   * has more pixels than the room is drawing it in, which is exactly where
   * there is something to go and look at; a strip whose frames already fit
   * inside the stage has nothing behind a 100% pill but the same picture.
   */
  public readonly offersZoom = computed(
    () => this.fitScale() < 0.999 || this.zoomAsked() !== null,
  );

  /** Whether the lens is worth offering: it is a pointer's tool. */
  public finePointer(): boolean {
    return this.mediaMatches('(pointer: fine)');
  }

  public toggleLoupe(): void {
    this.loupe.update((on) => !on);
    if (!this.loupe()) {
      this.lens.set(null);
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

  /**
   * How far the picture has to spill out of the room before it is worth
   * dragging about, in CSS pixels either side of centre.
   */
  private readonly overflow = computed(() => {
    const size = this.viewSize();
    const box = this.box();
    if (!size || box.width <= 0) {
      return { x: 0, y: 0 };
    }
    const ratio = this.pixelRatio();
    const scale = this.zoomScale();
    return {
      x: Math.max(0, ((size.width / ratio) * scale - box.width) / 2),
      y: Math.max(0, ((size.height / ratio) * scale - box.height) / 2),
    };
  });

  /**
   * Draw the picture at this many image pixels per device pixel, holding
   * whatever is under the pointer where it is. Landing back on the fitted size
   * is the fitted size again rather than a number that happens to equal it, so
   * the Fit pill lights and a change of picture refits.
   */
  private setZoom(
    to: number,
    anchor?: { clientX: number; clientY: number },
    touched = true,
  ): void {
    const fit = this.fitScale();
    const held = Math.min(
      Math.max(to, Math.min(fit, 1)),
      Math.max(fit, ZOOM_CEILING),
    );
    const before = this.zoomScale();
    if (near(held, fit)) {
      this.zoomAsked.set(null);
      this.pan.set({ x: 0, y: 0 });
      this.zoomTouched.set(false);
      this.rememberZoom(null);
      return;
    }
    this.zoomAsked.set(Math.round(held * 1000) / 1000);
    if (touched) {
      this.zoomTouched.set(true);
    }
    this.rememberZoom(this.zoomAsked());
    this.anchorPan(anchor, before, held);
  }

  /** Keep the point under the pointer under it as the picture grows. */
  private anchorPan(
    anchor: { clientX: number; clientY: number } | undefined,
    before: number,
    after: number,
  ): void {
    const stage = this.viewerStageRef()?.nativeElement;
    const at = this.pan();
    if (!anchor || !stage || before <= 0) {
      this.setPan(at.x * (after / before), at.y * (after / before));
      return;
    }
    const box = stage.getBoundingClientRect();
    const dx = anchor.clientX - (box.left + box.width / 2);
    const dy = anchor.clientY - (box.top + box.height / 2);
    const step = after / before;
    this.setPan(dx - (dx - at.x) * step, dy - (dy - at.y) * step);
  }

  private panBy(dx: number, dy: number): void {
    const at = this.pan();
    this.setPan(at.x + dx, at.y + dy);
  }

  /** The picture may be dragged about, but not off the edge of the room. */
  private setPan(x: number, y: number): void {
    const over = this.overflow();
    this.pan.set({
      x: Math.round(Math.min(Math.max(x, -over.x), over.x)),
      y: Math.round(Math.min(Math.max(y, -over.y), over.y)),
    });
  }

  private resetZoom(): void {
    this.zoomAsked.set(null);
    this.zoomTouched.set(false);
    this.pan.set({ x: 0, y: 0 });
    this.wantedCrop.set(null);
    this.viewerPointers.clear();
    this.pinchFrom = null;
  }

  /**
   * Put the asked-for detail under the middle of the view at true pixels, once
   * the view has a size to do the arithmetic against. The crop's rectangle is
   * in the frame's own pixels, so where it lands on screen is that rectangle's
   * middle carried to the middle of the room.
   */
  private holdAskedCrop(): void {
    afterRenderEffect(() => {
      const crop = this.wantedCrop();
      const size = this.viewSize();
      const box = this.box();
      if (!crop || !size || box.width <= 0 || box.height <= 0) {
        return;
      }
      this.zoomAsked.set(1);
      this.zoomTouched.set(true);
      const ratio = this.pixelRatio();
      this.setPan(
        (size.width / 2 - (crop.x + crop.width / 2)) / ratio,
        (size.height / 2 - (crop.y + crop.height / 2)) / ratio,
      );
      this.wantedCrop.set(null);
    });
  }

  /** The view the reader last asked for, for the rest of this session. */
  private rememberZoom(scale: number | null): void {
    try {
      if (scale === null) {
        sessionStorage.removeItem(ZOOM_KEY);
      } else {
        sessionStorage.setItem(ZOOM_KEY, String(scale));
      }
    } catch {
      // Storage the browser will not hand over simply remembers nothing.
    }
  }

  private rememberedZoom(): number | null {
    try {
      const stored = Number(sessionStorage.getItem(ZOOM_KEY));
      return Number.isFinite(stored) && stored > 0 ? stored : null;
    } catch {
      // Storage the browser will not hand over simply remembers nothing.
      return null;
    }
  }

  /**
   * Where the lens is over the picture, and which of the picture's own pixels
   * it is holding up. The picture's drawn rectangle is what the arithmetic is
   * against rather than the stage's, because a letterboxed frame leaves ground
   * on two sides that is not part of the picture at all.
   */
  private trackLens(event: PointerEvent | MouseEvent): void {
    if (!this.loupeOn()) {
      return;
    }
    const stage = event.currentTarget;
    const size = this.viewSize();
    if (!(stage instanceof HTMLElement) || !size) {
      return;
    }
    const media = stage.querySelector(
      '.gs-sweep-frame, .gs-wipe-media--before .gs-wipe-img, .gs-wipe-media--before .gs-wipe-tiled',
    );
    if (!(media instanceof HTMLElement)) {
      this.lens.set(null);
      return;
    }
    const box = stage.getBoundingClientRect();
    const drawn = media.getBoundingClientRect();
    const across = (event.clientX - drawn.left) / drawn.width;
    const down = (event.clientY - drawn.top) / drawn.height;
    if (drawn.width <= 0 || across < 0 || across > 1 || down < 0 || down > 1) {
      this.lens.set(null);
      return;
    }
    const ratio = this.pixelRatio();
    const trueWidth = size.width / ratio;
    const trueHeight = size.height / ratio;
    this.lens.set({
      x: Math.round(event.clientX - box.left),
      y: Math.round(event.clientY - box.top),
      backgroundSize: `${Math.round(trueWidth)}px ${Math.round(trueHeight)}px`,
      backgroundPosition: `${Math.round(LOUPE_PX / 2 - across * trueWidth)}px ${Math.round(LOUPE_PX / 2 - down * trueHeight)}px`,
    });
  }

  /** How many device pixels the display draws per CSS pixel. */
  private pixelRatio(): number {
    return typeof window !== 'undefined' && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;
  }

  private pointerSpread(): number {
    const [first, second] = [...this.viewerPointers.values()];
    if (!first || !second) {
      return 0;
    }
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  /** The point between two fingers, which is what a pinch happens about. */
  private pointerMiddle(): { x: number; y: number } | null {
    const [first, second] = [...this.viewerPointers.values()];
    return first && second
      ? { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
      : null;
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
        // The copy the stage will draw, not the file behind it: warming the
        // full-size frame while the stage draws the bounded one fetches every
        // neighbour twice, in two sizes, on the way through a strip.
        new Image().src = this.mediaUrl(stop);
      }
    }
  }

  /**
   * Watch the room this explorer has. The layout is written against container
   * queries, and this is the same measurement for the two decisions the queries
   * cannot make on their own: whether the contact sheet is offered, and whether
   * the details are a sheet or a panel.
   */
  /**
   * Watch the room the full-size view gives the picture. Every number the view
   * reads out is against it: what the picture fits at, what "shown at" means,
   * and how far it may be dragged.
   */
  private observeViewBox(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    let watched: HTMLElement | null = null;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) {
        this.viewBox.set({ width: box.width || 0, height: box.height || 0 });
      }
    });
    afterRenderEffect(() => {
      const stage = this.viewerStageRef()?.nativeElement ?? null;
      if (stage === watched) {
        return;
      }
      if (watched) {
        observer.unobserve(watched);
      }
      watched = stage;
      if (stage) {
        observer.observe(stage);
      } else {
        this.viewBox.set({ width: 0, height: 0 });
      }
    });
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  /**
   * Watch the room the plate's stage gives the picture. It is the same
   * measurement the full-size view takes of its own stage, because the zoom is
   * one model and the box is the only thing that differs between its hosts.
   */
  private observePlateBox(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    let watched: HTMLElement | null = null;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) {
        this.plateBox.set({ width: box.width || 0, height: box.height || 0 });
      }
    });
    afterRenderEffect(() => {
      const stage = this.plateStageRef()?.nativeElement ?? null;
      if (stage === watched) {
        return;
      }
      if (watched) {
        observer.unobserve(watched);
      }
      watched = stage;
      if (stage) {
        observer.observe(stage);
      } else {
        this.plateBox.set({ width: 0, height: 0 });
      }
    });
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

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

  /**
   * Whether the reader has asked for less data, however their browser lets them
   * say it. The media query is the standard answer and the connection's own
   * flag is the one most phones actually set, so both are honoured.
   */
  private reducedData(): boolean {
    return this.mediaMatches('(prefers-reduced-data: reduce)') || savesData();
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

/**
 * Whether a press landed on something standing on the picture rather than on
 * the picture: the wipe's divider and its two side tags, the compare chips, the
 * value and the size, the zoom pills, and the glyphs. Each of those is its own
 * control, and the picture's own gestures would otherwise run under the
 * reader's aim.
 *
 * The wipe itself is not on the list. A press anywhere on a pair used to move
 * the divider there, which meant the whole picture had to be held back from the
 * stage; the divider now moves from its handle alone, so every other press on a
 * pair is a press on the picture and scrubs, pans or zooms like any other.
 */
function fromStageControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest(
      '.gs-wipe-divider, .gs-wipe-tag, .gs-sweep-chips, .gs-sweep-titles, .gs-sweep-glyphs, .gs-sweep-scales',
    )
  );
}

/** A size read off whatever carries one, or null where nothing does. */
function pixelSize(
  from: { width?: number; height?: number } | null | undefined,
): PixelSize | null {
  return from && from.width && from.height
    ? { width: from.width, height: from.height }
    : null;
}

/** Whether two scales are the same view, allowing for the arithmetic. */
function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/** The first number in a value or a band, e.g. `20` out of `"20-40"`. */
function firstNumber(text: string): number | null {
  const found = /-?\d+(\.\d+)?/.exec(text);
  return found ? Number(found[0]) : null;
}

/**
 * The part of the Network Information API a data-saving reader is asking with.
 * It is not in the DOM's own types, and it is the flag a phone on a metered
 * connection actually sets.
 */
interface NavigatorWithConnection extends Navigator {
  connection?: { saveData?: boolean };
}

/** Whether the browser says the reader is saving data. */
function savesData(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return (navigator as NavigatorWithConnection).connection?.saveData === true;
}
