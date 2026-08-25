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
} from '../../services/sweep-library.service';
import { docsControlTypeAnchor } from '../../content/docs-links';

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

/** One example of a guidance mode: what it began with, what the detector drew, and what came back. */
interface ControlWorld {
  stripId: string;
  /** What the scene is, as the library labels it. */
  scene: string;
  /**
   * The same scene in the two or three words the switcher can carry. The
   * library's labels run to a clause, and three clauses in a row of options
   * wrap into a block a reader has to read rather than a control they can
   * glance at, so everything after the first comma is dropped.
   */
  sceneShort: string;
  /** The checkpoint it was rendered on, which differs between the examples. */
  model: string;
  /** The source, the map and the render, in the order the story runs. */
  frames: readonly ControlFrame[];
  /** The render on its own, which is what the tile is cut from. */
  render: string;
  caption: string;
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

          @if (shown.worlds.length > 1) {
            <!-- The switcher says what it switches. Three named options with
                 nothing over them read as a caption a reader can press by
                 accident rather than as the choice the whole layer turns on. -->
            <div class="gs-ctl-picker">
              <span class="gs-ctl-picker-label">
                {{ 'generate.control_types.worlds_pick' | transloco }}
              </span>
              <div
                class="gs-seg gs-ctl-switch"
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

          @if (shownWorld(); as onShow) {
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
              <p class="gs-ctl-meta">
                {{ 'generate.control_types.rendered_on' | transloco }}
                <span class="gs-ctl-model">{{ onShow.model }}</span>
              </p>
            </section>
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
              <app-gs-sweep-scrub
                parameter="control_strength"
                [controlType]="shown.type"
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
   * The published strips the examples are taken from, by the library's own
   * `strip_id`. The first is the one the tiles are cut from, so the grid reads
   * as one shoot; the rest are what the layer's switcher offers.
   */
  public readonly worlds = input.required<readonly string[]>();
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

  /** The named strips, in the order they were named, and only the ones published. */
  private readonly strips = computed<readonly SweepStrip[]>(() =>
    this.worlds()
      .map((stripId) => this.sweeps.stripById(stripId))
      .filter((strip): strip is SweepStrip => strip !== null),
  );

  /** The one example on show, or null while the layer is shut. */
  public readonly shownWorld = computed<ControlWorld | null>(() => {
    const tile = this.shown();
    if (!tile) {
      return null;
    }
    return tile.worlds[this.chosen()] ?? tile.worlds[0] ?? null;
  });

  public readonly tiles = computed<readonly ControlTile[]>(() => {
    const strips = this.strips();
    const descriptions = this.descriptionKeys();
    const names = this.nameKeys();
    const notes = this.noteKeys();
    return this.types().map((type) => {
      const worlds = strips
        .map((strip) => this.worldFor(strip, type))
        .filter((world): world is ControlWorld => world !== null);
      return {
        type,
        anchorId: docsControlTypeAnchor(type),
        nameKey: names[type] ?? '',
        descriptionKey: descriptions[type] ?? '',
        noteKey: notes[type] ?? null,
        thumb: worlds[0]?.render ?? null,
        worlds,
      };
    });
  });

  /**
   * Whether the dial was ever swept against this mode. The strip is what the
   * heading over it promises, so a mode the library never swept says nothing
   * rather than heading an empty space.
   */
  public readonly hasStrength = computed(() => {
    const tile = this.shown();
    return (
      tile !== null &&
      this.sweeps.strip('control_strength', undefined, undefined, tile.type) !==
        null
    );
  });

  /**
   * Every published picture of the mode on show, example by example and within
   * each one in the order the story runs. Stepping through them at full size
   * is how a reader compares one frame across the examples, which is the whole
   * question the switcher asks them to hold in their head.
   */
  public readonly shots = computed<readonly ControlShot[]>(() => {
    const tile = this.shown();
    if (!tile) {
      return [];
    }
    return tile.worlds.flatMap((world, worldIndex) =>
      world.frames
        .filter((frame) => frame.src !== null)
        .map((frame) => ({
          src: frame.src as string,
          worldIndex,
          key: frame.key,
          labelKey: frame.labelKey,
          world: world.sceneShort,
          width: frame.width,
          height: frame.height,
        })),
    );
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
  }

  /** The layer opens on the example the tile was cut from, which is the first. */
  public open(tile: ControlTile, event: Event): void {
    const trigger = event.currentTarget;
    this.opener = trigger instanceof HTMLElement ? trigger : null;
    this.chosen.set(0);
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
    this.enlarged.set(next);
    this.chosen.set(pictures[next].worldIndex);
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

  /**
   * The switcher is a radio group, so the arrows move between the examples and
   * carry the choice with them, and Tab passes the whole group by.
   */
  public onSwitchKeydown(event: KeyboardEvent, index: number): void {
    const count = this.shown()?.worlds.length ?? 0;
    if (count === 0) {
      return;
    }
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (index + 1) % count;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (index - 1 + count) % count;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.chosen.set(next);
    this.worldOptions()[next]?.nativeElement.focus();
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
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === panel)) {
      event.preventDefault();
      first.focus();
    }
  }

  private worldFor(strip: SweepStrip, type: string): ControlWorld | null {
    const stop = strip.stops.find((frame) => frame.control_type === type);
    return stop ? this.exampleOf(strip, stop) : null;
  }

  private exampleOf(strip: SweepStrip, stop: SweepStop): ControlWorld {
    const render = this.sweeps.imageUrl(stop);
    const renderWidth = stop.width ?? strip.held?.width ?? null;
    const renderHeight = stop.height ?? strip.held?.height ?? null;
    return {
      stripId: strip.strip_id,
      scene: strip.scene.label,
      sceneShort: strip.scene.label.split(',')[0].trim(),
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
    };
  }
}
