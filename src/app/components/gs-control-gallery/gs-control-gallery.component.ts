import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Signal,
  WritableSignal,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';
import { GsAnchorLinkComponent } from '../gs-anchor-link/gs-anchor-link.component';
import { GsSweepScrubComponent } from '../gs-sweep-scrub/gs-sweep-scrub.component';
import { GsShotViewerComponent } from '../gs-shot-viewer/gs-shot-viewer.component';
import {
  GsPixelBadgeComponent,
  PixelSize,
} from '../gs-pixel-badge/gs-pixel-badge.component';
import {
  SweepLibraryService,
  SweepStop,
  SweepStrip,
  SweepSubject,
} from '../../services/sweep-library.service';
import { docsControlTypeAnchor } from '../../content/docs-links';
import { scrollWithin } from '../../helper/scroll-utils';

/**
 * The kinds of source picture an example is published on, in the order the
 * switcher offers them. The first is the one every example is cut from, and the
 * other two are the pictures that break the detectors the first one flatters.
 */
const SUBJECT_ORDER: readonly SweepSubject[] = ['anchor', 'building', 'flat'];

/** What each kind of source picture is called where a reader can see it. */
const SUBJECT_LABEL_KEYS: Readonly<Record<SweepSubject, string>> = {
  anchor: 'generate.control_types.subject_anchor',
  building: 'generate.control_types.subject_building',
  flat: 'generate.control_types.subject_flat',
};

/**
 * The strips one example was published as, by the library's own `strip_id`: the
 * same detectors on the same model, run on each kind of source picture. Only
 * `anchor` is required, because the library may be published a picture at a
 * time and an example is worth showing before all three have been rendered.
 */
export interface ControlWorldStrips {
  anchor: string;
  building?: string;
  flat?: string;
}

/** What Tab can land on inside the layer: the close button, the tiles' links and the strip's controls. */
const LAYER_FOCUSABLE_SELECTOR =
  'a[href], button, [tabindex]:not([tabindex="-1"]), input, select, textarea';

/** One frame of an example, and what it is. */
interface ControlFrame {
  key: string;
  src: string | null;
  labelKey: string;
  altKey: string;
  /**
   * What the frame is in pixels, where the index says. It says the source's
   * size on the strip and the render's on the stop; the map it publishes
   * without one, and that frame falls back to what the browser found.
   */
  width: number | null;
  height: number | null;
}

/** One reading of a guidance mode: what it began with, what the detector drew, and what came back. */
interface ControlTake {
  subject: SweepSubject;
  /** What that kind of source picture is called on the switcher. */
  labelKey: string;
  stripId: string;
  /** The checkpoint it was rendered on, which differs between the examples. */
  model: string;
  /** The source, the map and the render, in the order the story runs. */
  frames: readonly ControlFrame[];
  /** The render on its own, which is what the tile is cut from. */
  render: string;
  caption: string;
  /**
   * What this kind of source picture is, where the library says. Written only
   * where the picture is the point, so a reading without one carries what the
   * example's own picture said.
   */
  note: string;
}

/** One example a guidance mode is read on, and the pictures it was run against. */
interface ControlWorld {
  /** The example's own strip, which is what the tiles and the order are cut from. */
  stripId: string;
  /**
   * The scene in the two or three words the switcher can carry. The library's
   * labels run to a clause, and three clauses in a row of options wrap into a
   * block a reader has to read rather than a control they can glance at, so
   * everything after the first comma is dropped.
   */
  sceneShort: string;
  /** Every kind of source picture published of this example, in the switcher's order. */
  takes: readonly ControlTake[];
}

/** One guidance mode as the gallery lays it out. */
interface ControlTile {
  type: string;
  anchorId: string;
  /** The mode named as a reader would say it, which heads the layer. */
  nameKey: string;
  /** What the mode reads, in the picker's own words. */
  descriptionKey: string;
  /** A further line only some modes need, e.g. the name they used to go by. */
  noteKey: string | null;
  /** The first example's render, which is the tile. Null while none is published. */
  thumb: string | null;
  /** Every example published of this mode, in the order they were named. */
  worlds: readonly ControlWorld[];
}

/** One picture the layer can open at full size, and what it is. */
interface ControlShot {
  src: string;
  /** Which example it belongs to, so opening it carries the layer with it. */
  worldIndex: number;
  /** Which of the three it is, matching {@link ControlFrame.key}. */
  key: string;
  /** What the frame is, e.g. the control map. */
  labelKey: string;
  /** The example it was taken from, in the switcher's own short words. */
  world: string;
  width: number | null;
  height: number | null;
}

/**
 * The guidance modes of one group, each shown as the render it produced, and
 * each opening onto every example the library published of it.
 *
 * A mode is a claim about what survives from the source into the render, and a
 * single picture cannot settle it: an outline that holds a face on a photograph
 * may hold nothing on a shrine gate. So the tile is one render and the layer is
 * the same mode read on one example at a time, each laid out as the picture it
 * began with, the map the detector drew, and what the render made of it, with a
 * switcher between the examples rather than all of them stacked. Three examples
 * stacked run past the bottom of a laptop screen and bury the strength dial
 * under them; one example at a size that can be read does not.
 *
 * A mode the library has not published keeps its place and says so. The picker
 * will still run it, and a hole in the grid would read as a mode that does not
 * exist.
 */
@Component({
  selector: 'app-gs-control-gallery',
  imports: [
    TranslocoPipe,
    IconComponent,
    GsAnchorLinkComponent,
    GsSweepScrubComponent,
    GsShotViewerComponent,
    GsPixelBadgeComponent,
  ],
  template: `
    <ul class="gs-ref-maps-grid">
      @for (tile of tiles(); track tile.type) {
        <li [id]="tile.anchorId">
          <figure class="gs-ref-map gs-ctl-tile">
            @if (tile.thumb; as thumb) {
              <button
                type="button"
                class="gs-ref-zoom gs-ctl-zoom"
                [attr.aria-label]="
                  'generate.control_types.enlarge'
                    | transloco: { name: tile.type }
                "
                (click)="open(tile, $event)"
              >
                <img
                  [src]="thumb"
                  [alt]="
                    'generate.control_types.tile_alt'
                      | transloco: { name: tile.type }
                  "
                  loading="lazy"
                  decoding="async"
                />
                <span class="gs-ctl-zoom-glyph" aria-hidden="true">
                  <app-icon name="arrows-pointing-out" class="gs-ico-sm" />
                </span>
              </button>
            } @else {
              <span class="gs-ref-map-gap">
                {{ 'generate.control_types.missing' | transloco }}
              </span>
            }
            <figcaption>
              <span class="gs-ref-map-name gs-mono">
                {{ tile.type }}
                <app-gs-anchor-link
                  [targetId]="tile.anchorId"
                  [label]="tile.type"
                />
              </span>
              <span class="gs-ref-map-note">
                {{ tile.descriptionKey | transloco }}
              </span>
              @if (tile.noteKey; as note) {
                <span class="gs-ref-map-note">{{ note | transloco }}</span>
              }
              @if (tile.worlds.length > 0) {
                <button
                  type="button"
                  class="gs-ref-link gs-ctl-more"
                  (click)="open(tile, $event)"
                >
                  {{ 'generate.control_types.more' | transloco }}
                </button>
              }
            </figcaption>
          </figure>
        </li>
      }
    </ul>

    @if (opened(); as shown) {
      <div
        class="gs-sweep-viewer"
        tabindex="0"
        (click)="onBackdrop($event)"
        (keydown.escape)="close()"
      >
        <div
          #panel
          class="gs-sweep-viewer-body gs-ctl-body"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          [attr.aria-label]="
            'generate.control_types.layer_label'
              | transloco: { name: shown.nameKey | transloco }
          "
          (keydown)="onKeydown($event)"
        >
          <!-- One band across the top rather than a name with a paragraph
               beside it: a reader who followed an anchor lands here knowing
               none of it, and what they need first is which detector this is,
               what it reads for, and the name a request has to carry. -->
          <header class="gs-ctl-band">
            <div class="gs-ctl-ident">
              <div class="gs-ctl-ident-row">
                <h2 class="gs-ctl-title">{{ shown.nameKey | transloco }}</h2>
                @if (groupLabelKey(); as groupKey) {
                  <span class="gs-ctl-group">{{ groupKey | transloco }}</span>
                }
                <span class="gs-ctl-id gs-mono">{{ shown.type }}</span>
              </div>
              <p class="gs-ctl-lead">{{ shown.descriptionKey | transloco }}</p>
            </div>
            <button
              #closeButton
              type="button"
              class="gs-sweep-viewer-x"
              [attr.aria-label]="
                'generate.control_types.layer_close' | transloco
              "
              (click)="close()"
            >
              <app-icon name="x-mark" class="gs-ico-sm" />
            </button>
          </header>

          @if (shownTake(); as onShow) {
            <section class="gs-ctl-world">
              <!-- The three read left to right as the thing that happened: the
                   picture the detector was given, what it drew from it, and
                   what the render made of that. The arrows between them are
                   the claim the page rests on, so they are drawn rather than
                   left to the order of the pictures. -->
              <div class="gs-ctl-strip">
                @for (
                  frame of onShow.frames;
                  track frame.key;
                  let last = $last
                ) {
                  <figure
                    class="gs-ctl-frame"
                    [class.gs-ctl-frame--render]="frame.key === 'render'"
                  >
                    <figcaption class="gs-ctl-over">
                      {{ frame.labelKey | transloco }}
                    </figcaption>
                    @if (frame.src; as src) {
                      <button
                        type="button"
                        class="gs-ctl-shot"
                        [attr.aria-label]="
                          'generate.control_types.frame_enlarge'
                            | transloco: { frame: frame.labelKey | transloco }
                        "
                        (click)="enlarge(frame.key, $event)"
                      >
                        <img
                          [src]="src"
                          [alt]="frame.altKey | transloco: { name: shown.type }"
                          loading="lazy"
                          decoding="async"
                          (load)="onFrameLoad(src, $event)"
                        />
                        <span class="gs-ctl-zoom-glyph" aria-hidden="true">
                          <app-icon
                            name="arrows-pointing-out"
                            class="gs-ico-sm"
                          />
                        </span>
                        <!-- Three frames of one story at three sizes: the
                             source the detector read, the map it drew, and the
                             render made from it. Which is which in pixels is
                             the one thing a row of equal-width tiles cannot
                             say. -->
                        <app-gs-pixel-badge
                          class="gs-pixels--stage gs-pixels--corner"
                          [width]="frameSize(frame)?.width"
                          [height]="frameSize(frame)?.height"
                        />
                      </button>
                    } @else {
                      <span class="gs-ref-map-gap">
                        {{ 'generate.control_types.missing' | transloco }}
                      </span>
                    }
                  </figure>
                  @if (!last) {
                    <span class="gs-ctl-arrow" aria-hidden="true">
                      <app-icon name="arrow-right" class="gs-ico-sm" />
                    </span>
                  }
                }
              </div>
              <p class="gs-ctl-caption">{{ onShow.caption }}</p>
              @if (onShow.note) {
                <p class="gs-ctl-caption gs-ctl-note">{{ onShow.note }}</p>
              }
              <p class="gs-ctl-meta">
                {{ 'generate.control_types.rendered_on' | transloco }}
                <span class="gs-ctl-model">{{ onShow.model }}</span>
              </p>
            </section>
          }

          <!-- Two choices side by side rather than one after the other: which
               example, and which kind of picture it was run on. They are the
               same question asked twice, and a reader holding one of them
               fixed while they move the other has to see both at once. -->
          @if (shown.worlds.length > 1 || subjectOptions().length > 1) {
            <div class="gs-ctl-pickers">
              @if (shown.worlds.length > 1) {
                <!-- The switcher says what it switches. Three named options
                     with nothing over them read as a caption a reader can
                     press by accident rather than as the choice the whole
                     layer turns on. -->
                <div class="gs-ctl-picker">
                  <span class="gs-ctl-picker-label">
                    {{ 'generate.control_types.worlds_pick' | transloco }}
                  </span>
                  <div
                    #worldSwitch
                    class="gs-seg gs-ctl-switch gs-ctl-switch--world"
                    [class.gs-ctl-switch--fade-start]="worldFadeStart()"
                    [class.gs-ctl-switch--fade-end]="worldFadeEnd()"
                    role="radiogroup"
                    [attr.aria-label]="
                      'generate.control_types.worlds_label' | transloco
                    "
                  >
                    @for (
                      option of shown.worlds;
                      track option.stripId;
                      let i = $index
                    ) {
                      <button
                        #worldOption
                        type="button"
                        class="gs-seg-opt gs-ctl-switch-opt"
                        role="radio"
                        [attr.aria-checked]="i === worldIndex()"
                        [attr.tabindex]="i === worldIndex() ? 0 : -1"
                        (click)="pickWorld(i)"
                        (keydown)="onSwitchKeydown($event, i)"
                      >
                        {{ option.sceneShort }}
                      </button>
                    }
                  </div>
                </div>
              }

              @if (subjectOptions().length > 1) {
                <div class="gs-ctl-picker">
                  <span class="gs-ctl-picker-label">
                    {{ 'generate.control_types.subjects_pick' | transloco }}
                  </span>
                  <div
                    #subjectSwitch
                    class="gs-seg gs-ctl-switch gs-ctl-switch--subject"
                    [class.gs-ctl-switch--fade-start]="subjectFadeStart()"
                    [class.gs-ctl-switch--fade-end]="subjectFadeEnd()"
                    role="radiogroup"
                    [attr.aria-label]="
                      'generate.control_types.subjects_label' | transloco
                    "
                  >
                    @for (
                      option of subjectOptions();
                      track option.subject;
                      let i = $index
                    ) {
                      <button
                        #subjectOption
                        type="button"
                        class="gs-seg-opt gs-ctl-switch-opt"
                        role="radio"
                        [attr.aria-checked]="option.subject === subjectShown()"
                        [attr.tabindex]="
                          option.subject === subjectShown() ? 0 : -1
                        "
                        (click)="pickSubject(option.subject)"
                        (keydown)="onSubjectKeydown($event, i)"
                      >
                        {{ option.labelKey | transloco }}
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          }

          <!-- How hard this mode's own maps pull, under the example of what
               they are. The dial is the same field for every mode and what
               changes is what that kind of map can do with it, so it is read
               here rather than once for a whole group. It carries a heading of
               its own, so it reads as the layer's second half rather than as
               something left under the pictures. -->
          @if (hasStrength()) {
            <section class="gs-ctl-dial">
              <h3 class="gs-ctl-head">
                {{ 'generate.control_types.strength_head' | transloco }}
              </h3>
              @if (strengthOffSubject()) {
                <p class="gs-ctl-caption gs-ctl-note">
                  {{
                    'generate.control_types.strength_on_character' | transloco
                  }}
                </p>
              }
              <app-gs-sweep-scrub
                parameter="control_strength"
                [controlType]="shown.type"
                [sceneId]="strengthScene()"
                [startExpanded]="true"
                register="filmcard"
              />
            </section>
          }
        </div>
      </div>

      <!-- Any one of the three at the size the row cannot give it, on the same
           layer every other evidence picture opens onto. What it steps through
           is this detector on every example it was published on, so a reader
           comparing one frame across the worlds never has to shut it. -->
      @if (shot(); as picture) {
        <app-gs-shot-viewer
          [src]="picture.src"
          [label]="
            'generate.control_types.enlarged'
              | transloco
                : {
                    frame: picture.labelKey | transloco,
                    world: picture.world,
                  }
          "
          [width]="picture.width"
          [height]="picture.height"
          [at]="shotAt() + 1"
          [count]="shots().length"
          (previous)="stepShot(-1)"
          (next)="stepShot(1)"
          (closed)="closeShot()"
        />
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsControlGalleryComponent {
  private readonly sweeps = inject(SweepLibraryService);

  /** The modes this group holds, in the picker's own order. */
  public readonly types = input.required<readonly string[]>();
  /**
   * The published strips the examples are taken from, one entry per example
   * and one `strip_id` per kind of source picture. The first entry's own
   * picture is what the tiles are cut from, so the grid reads as one shoot;
   * the rest are what the layer's two switchers offer.
   */
  public readonly worlds = input.required<readonly ControlWorldStrips[]>();
  /** The i18n key describing a mode, by mode. */
  public readonly descriptionKeys =
    input.required<Readonly<Record<string, string>>>();
  /** The i18n key naming a mode aloud, by mode. */
  public readonly nameKeys = input<Readonly<Record<string, string>>>({});
  /** A further line for the modes that need one, by mode. */
  public readonly noteKeys = input<Readonly<Record<string, string>>>({});
  /**
   * The i18n key naming what this group of modes reads, which the layer says
   * back. A reader who followed an anchor to `normalbae` arrives with nothing
   * telling them which group they landed in.
   */
  public readonly groupLabelKey = input<string | null>(null);

  /** The mode the layer is showing, or null while it is shut. */
  private readonly shown = signal<ControlTile | null>(null);
  public readonly opened = this.shown.asReadonly();

  /** Which example the layer is showing, as an index into the mode's own. */
  private readonly chosen = signal(0);
  public readonly worldIndex = this.chosen.asReadonly();

  /** Which kind of source picture the layer is showing that example on. */
  private readonly chosenSubject = signal<SweepSubject>('anchor');

  /** Which picture is open at full size, or null while none is. */
  private readonly enlarged = signal<number | null>(null);
  public readonly shotAt = computed(() => this.enlarged() ?? 0);

  /** The tile that opened the layer, so closing hands focus back to it. */
  private opener: HTMLElement | null = null;
  /** The frame that opened the full-size layer, for the same reason. */
  private shotOpener: HTMLElement | null = null;
  private focusedPanel: HTMLElement | null = null;

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly closeButton =
    viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly worldOptions =
    viewChildren<ElementRef<HTMLButtonElement>>('worldOption');
  private readonly subjectOptionButtons =
    viewChildren<ElementRef<HTMLButtonElement>>('subjectOption');
  private readonly worldSwitch =
    viewChild<ElementRef<HTMLElement>>('worldSwitch');
  private readonly subjectSwitch =
    viewChild<ElementRef<HTMLElement>>('subjectSwitch');

  /**
   * Whether a switcher has an option out of sight to one side, which is what
   * the faded edge is drawn from. Read from the element: whether the options
   * fit depends on the width the layer was given and on how long the words came
   * out, neither of which the component is told.
   */
  public readonly worldFadeStart = signal(false);
  public readonly worldFadeEnd = signal(false);
  public readonly subjectFadeStart = signal(false);
  public readonly subjectFadeEnd = signal(false);

  /** The one example on show, or null while the layer is shut. */
  public readonly shownWorld = computed<ControlWorld | null>(() => {
    const tile = this.shown();
    if (!tile) {
      return null;
    }
    return tile.worlds[this.chosen()] ?? tile.worlds[0] ?? null;
  });

  /**
   * The one reading on show: the chosen example on the chosen kind of picture,
   * falling back to that example's own picture where the library has published
   * no other. Null while the layer is shut.
   */
  public readonly shownTake = computed<ControlTake | null>(() => {
    const world = this.shownWorld();
    if (!world) {
      return null;
    }
    const wanted = this.chosenSubject();
    return (
      world.takes.find((take) => take.subject === wanted) ??
      world.takes[0] ??
      null
    );
  });

  /** Which kind of picture is actually on show, which is what the switcher marks. */
  public readonly subjectShown = computed<SweepSubject>(
    () => this.shownTake()?.subject ?? 'anchor',
  );

  /**
   * The kinds of picture the chosen example was published on. Read off that
   * example rather than off the mode, so the switcher never offers a picture
   * that would fall back to another one when it was pressed.
   */
  public readonly subjectOptions = computed<readonly ControlTake[]>(
    () => this.shownWorld()?.takes ?? [],
  );

  public readonly tiles = computed<readonly ControlTile[]>(() => {
    const descriptions = this.descriptionKeys();
    const names = this.nameKeys();
    const notes = this.noteKeys();
    const sources = this.worlds();
    return this.types().map((type) => {
      const worlds = sources
        .map((source) => this.worldFor(source, type))
        .filter((world): world is ControlWorld => world !== null);
      return {
        type,
        anchorId: docsControlTypeAnchor(type),
        nameKey: names[type] ?? '',
        descriptionKey: descriptions[type] ?? '',
        noteKey: notes[type] ?? null,
        thumb: worlds[0]?.takes[0]?.render ?? null,
        worlds,
      };
    });
  });

  /**
   * The dial's strip for the mode on show, on the kind of picture the reader
   * chose where the library swept one and on the character picture otherwise.
   * Null when the dial was never swept against this mode at all.
   */
  public readonly strengthStrip = computed<SweepStrip | null>(() => {
    const tile = this.shown();
    if (!tile) {
      return null;
    }
    const subject = this.subjectShown();
    const onSubject =
      subject === 'anchor'
        ? null
        : this.sweeps.strip(
            'control_strength',
            undefined,
            undefined,
            tile.type,
            subject,
          );
    return (
      onSubject ??
      this.sweeps.strip('control_strength', undefined, undefined, tile.type)
    );
  });

  /**
   * Whether the dial was ever swept against this mode. The strip is what the
   * heading over it promises, so a mode the library never swept says nothing
   * rather than heading an empty space.
   */
  public readonly hasStrength = computed(() => this.strengthStrip() !== null);

  /**
   * The scene the dial's strip is to be read from, and undefined while it is
   * the one the mode answers with anyway. Naming it is how the kind of picture
   * the reader chose reaches the strip below.
   */
  public readonly strengthScene = computed<string | undefined>(() => {
    const strip = this.strengthStrip();
    const subject = this.subjectShown();
    return strip && subject !== 'anchor' && strip.subject === subject
      ? strip.scene.scene_id
      : undefined;
  });

  /**
   * Whether the dial is being read from a picture other than the one the reader
   * chose, which is the one thing about it they cannot see for themselves.
   */
  public readonly strengthOffSubject = computed(() => {
    const strip = this.strengthStrip();
    return strip !== null && this.subjectShown() !== 'anchor'
      ? strip.subject !== this.subjectShown()
      : false;
  });

  /**
   * Every published picture of the mode on show, example by example and within
   * each one in the order the story runs. Stepping through them at full size
   * is how a reader compares one frame across the examples, which is the whole
   * question the switcher asks them to hold in their head.
   *
   * Held to the kind of picture on show, so stepping changes one thing at a
   * time: a run that swapped the source picture as well as the example would
   * answer neither of the two questions the layer puts.
   */
  public readonly shots = computed<readonly ControlShot[]>(() => {
    const tile = this.shown();
    if (!tile) {
      return [];
    }
    const subject = this.subjectShown();
    return tile.worlds.flatMap((world, worldIndex) => {
      const take = world.takes.find((one) => one.subject === subject);
      if (!take) {
        return [];
      }
      return take.frames
        .filter((frame) => frame.src !== null)
        .map((frame) => ({
          src: frame.src as string,
          worldIndex,
          key: frame.key,
          labelKey: frame.labelKey,
          world: world.sceneShort,
          width: frame.width,
          height: frame.height,
        }));
    });
  });

  /**
   * The size the browser found for a picture, by its path, for the frames the
   * index publishes no size for. The map is the one of the three: the detector
   * writes it beside the render and the index records nothing about it. Keyed
   * by path rather than by which of the three it is, so switching example or
   * mode never reads the size of the map before it.
   */
  private readonly measured = signal<Readonly<Record<string, PixelSize>>>({});

  /** What one frame is in pixels, from the index first and the file second. */
  public frameSize(frame: ControlFrame): PixelSize | null {
    return frame.width && frame.height
      ? { width: frame.width, height: frame.height }
      : (this.measured()[frame.src ?? ''] ?? null);
  }

  /** A frame has arrived, so the browser can be asked what it is. */
  public onFrameLoad(src: string, event: Event): void {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.naturalWidth) {
      return;
    }
    const size = { width: image.naturalWidth, height: image.naturalHeight };
    this.measured.update((current) => ({ ...current, [src]: size }));
  }

  /** The picture open at full size, or null while none is. */
  public readonly shot = computed<ControlShot | null>(() => {
    const at = this.enlarged();
    return at === null ? null : (this.shots()[at] ?? null);
  });

  constructor() {
    void this.sweeps.ensureLoaded();

    afterRenderEffect(() => {
      const panel = this.panel()?.nativeElement ?? null;
      if (panel && panel !== this.focusedPanel) {
        panel.focus();
      }
      this.focusedPanel = panel;
    });

    this.watchEdges(this.worldSwitch, this.worldFadeStart, this.worldFadeEnd);
    this.watchEdges(
      this.subjectSwitch,
      this.subjectFadeStart,
      this.subjectFadeEnd,
    );
  }

  /**
   * Keep a switcher's faded edges answering to what is actually hidden, as the
   * layer opens on another mode, as the words change and as the reader scrolls
   * the row or resizes the window.
   */
  private watchEdges(
    element: Signal<ElementRef<HTMLElement> | undefined>,
    start: WritableSignal<boolean>,
    end: WritableSignal<boolean>,
  ): void {
    afterRenderEffect((onCleanup) => {
      const row = element()?.nativeElement;
      if (!row) {
        start.set(false);
        end.set(false);
        return;
      }
      const measure = (): void => {
        const slack = row.scrollWidth - row.clientWidth;
        // A sub-pixel remainder is rounding, not an option out of sight.
        const overflows = slack > 1;
        start.set(overflows && row.scrollLeft > 1);
        end.set(overflows && row.scrollLeft < slack - 1);
      };

      measure();
      row.addEventListener('scroll', measure, { passive: true });
      const resize =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(measure);
      resize?.observe(row);
      onCleanup(() => {
        row.removeEventListener('scroll', measure);
        resize?.disconnect();
      });
    });
  }

  /**
   * Bring the option the arrows moved to into the row it sits in, and move
   * nothing else: the row scrolls sideways where the options are wider than the
   * layer, so the option taking focus can be the one behind the faded edge.
   */
  private revealOption(
    row: ElementRef<HTMLElement> | undefined,
    option: HTMLElement,
  ): void {
    if (row) {
      scrollWithin(row.nativeElement, option, 'center', this.scrollBehavior());
    }
  }

  private scrollBehavior(): ScrollBehavior {
    const reduced = globalThis.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    return reduced ? 'auto' : 'smooth';
  }

  /** The layer opens on the example and the picture the tile was cut from. */
  public open(tile: ControlTile, event: Event): void {
    const trigger = event.currentTarget;
    this.opener = trigger instanceof HTMLElement ? trigger : null;
    this.chosen.set(0);
    this.chosenSubject.set('anchor');
    this.enlarged.set(null);
    this.shown.set(tile);
  }

  public close(): void {
    const trigger = this.opener;
    this.opener = null;
    this.shotOpener = null;
    this.focusedPanel = null;
    this.enlarged.set(null);
    this.shown.set(null);
    trigger?.focus();
  }

  /** One frame of the example on show, at the size the row cannot give it. */
  public enlarge(key: string, event: Event): void {
    const trigger = event.currentTarget;
    this.shotOpener = trigger instanceof HTMLElement ? trigger : null;
    const at = this.shots().findIndex(
      (picture) => picture.worldIndex === this.chosen() && picture.key === key,
    );
    if (at >= 0) {
      this.enlarged.set(at);
    }
  }

  /**
   * The next or the previous picture, wrapping at both ends. Stepping past the
   * last frame of an example lands on the next example's first, and the layer
   * behind follows it: closing on a picture of the shrine and finding the
   * courier underneath would be the layer telling the reader they are
   * somewhere they are not.
   */
  public stepShot(delta: number): void {
    const pictures = this.shots();
    const at = this.enlarged();
    if (at === null || pictures.length === 0) {
      return;
    }
    const next = (at + delta + pictures.length) % pictures.length;
    const picture = pictures.at(next);
    if (!picture) {
      return;
    }
    this.enlarged.set(next);
    this.chosen.set(picture.worldIndex);
  }

  public closeShot(): void {
    const trigger = this.shotOpener;
    this.shotOpener = null;
    this.enlarged.set(null);
    if (trigger?.isConnected) {
      trigger.focus();
    } else {
      this.panel()?.nativeElement.focus();
    }
  }

  public onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  public pickWorld(index: number): void {
    this.chosen.set(index);
  }

  /** The same example on another kind of source picture. */
  public pickSubject(subject: SweepSubject): void {
    this.chosenSubject.set(subject);
  }

  /** The kinds of picture are a radio group, moved through as the examples are. */
  public onSubjectKeydown(event: KeyboardEvent, index: number): void {
    const options = this.subjectOptions();
    const next = stepIndex(event.key, index, options.length);
    if (next === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const subject = options.at(next)?.subject;
    if (!subject) {
      return;
    }
    this.chosenSubject.set(subject);
    const option = this.subjectOptionButtons()[next]?.nativeElement;
    if (option) {
      option.focus();
      this.revealOption(this.subjectSwitch(), option);
    }
  }

  /**
   * The switcher is a radio group, so the arrows move between the examples and
   * carry the choice with them, and Tab passes the whole group by.
   */
  public onSwitchKeydown(event: KeyboardEvent, index: number): void {
    const next = stepIndex(event.key, index, this.shown()?.worlds.length ?? 0);
    if (next === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.chosen.set(next);
    const option = this.worldOptions()[next]?.nativeElement;
    if (option) {
      option.focus();
      this.revealOption(this.worldSwitch(), option);
    }
  }

  /**
   * Escape shuts the layer, and Tab cycles inside it. The layer carries the
   * detector's strength strip as well as its pictures, so its controls have to
   * stay reachable: Tab wraps from the last focusable to the first and Shift
   * Tab the other way, and never leaves for the page behind. The switcher's
   * unchosen options are held out of the cycle, because a radio group is one
   * stop for Tab and the arrows are what move inside it.
   */
  public onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const panel = this.panel()?.nativeElement;
    if (!panel) {
      return;
    }
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(LAYER_FOCUSABLE_SELECTOR),
    ).filter(
      (element) =>
        !element.hasAttribute('disabled') &&
        element.getAttribute('tabindex') !== '-1',
    );
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables.at(0);
    const last = focusables.at(-1);
    if (!first || !last) {
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === panel)) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * One example of a mode, on every kind of source picture the library has
   * published it against. The example's own picture supplies the label and the
   * standing note, so the switcher reads the same whichever picture is on show
   * and a picture published without a note of its own carries that one.
   */
  private worldFor(
    source: ControlWorldStrips,
    type: string,
  ): ControlWorld | null {
    const anchor = this.sweeps.stripById(source.anchor);
    const takes = SUBJECT_ORDER.flatMap((subject) => {
      const strip = this.sweeps.stripById(source[subject] ?? '');
      const stop = strip?.stops.find((frame) => frame.control_type === type);
      return strip && stop
        ? [this.takeOf(strip, stop, subject, anchor?.caption ?? '')]
        : [];
    });
    if (takes.length === 0) {
      return null;
    }
    const named = anchor ?? this.sweeps.stripById(takes.at(0)?.stripId ?? '');
    return {
      stripId: source.anchor,
      sceneShort: (named?.scene.label ?? '').split(',', 1).at(0)?.trim() ?? '',
      takes,
    };
  }

  private takeOf(
    strip: SweepStrip,
    stop: SweepStop,
    subject: SweepSubject,
    fallbackNote: string,
  ): ControlTake {
    const render = this.sweeps.imageUrl(stop);
    const renderWidth = stop.width ?? strip.held?.width ?? null;
    const renderHeight = stop.height ?? strip.held?.height ?? null;
    return {
      subject,
      labelKey: SUBJECT_LABEL_KEYS[subject],
      stripId: strip.strip_id,
      model: strip.image_model.name,
      frames: [
        {
          key: 'source',
          src: strip.source_image
            ? this.sweeps.assetUrl(strip.source_image)
            : null,
          labelKey: 'generate.control_types.layer_source',
          altKey: 'generate.control_types.source_alt',
          width: strip.source_width ?? null,
          height: strip.source_height ?? null,
        },
        {
          key: 'map',
          src: stop.control_map ? this.sweeps.assetUrl(stop.control_map) : null,
          labelKey: 'generate.control_types.layer_map',
          altKey: 'generate.control_types.map_alt',
          width: null,
          height: null,
        },
        {
          key: 'render',
          src: render,
          labelKey: 'generate.control_types.layer_render',
          altKey: 'generate.control_types.render_alt',
          width: renderWidth,
          height: renderHeight,
        },
      ],
      render,
      caption: stop.caption,
      note: strip.caption || fallbackNote,
    };
  }
}

/**
 * Where an arrow, Home or End lands in a row of options, or null for a key the
 * row does not answer to. The row wraps at both ends, because a choice between
 * three is a ring rather than a ladder.
 */
function stepIndex(key: string, index: number, count: number): number | null {
  if (count === 0) {
    return null;
  }
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
