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
}

/** One example of a guidance mode: what it began with, what the detector drew, and what came back. */
interface ControlWorld {
  stripId: string;
  /** What the scene is, as the library labels it. */
  scene: string;
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
  /** What the mode reads, in the picker's own words. */
  descriptionKey: string;
  /** A further line only some modes need, e.g. the name they used to go by. */
  noteKey: string | null;
  /** The first example's render, which is the tile. Null while none is published. */
  thumb: string | null;
  /** Every example published of this mode, in the order they were named. */
  worlds: readonly ControlWorld[];
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
              | transloco: { name: shown.type }
          "
          (keydown)="onKeydown($event)"
        >
          <div class="gs-sweep-viewer-top gs-ctl-top">
            <div class="gs-ctl-ident">
              <span class="gs-sweep-viewer-name gs-mono">{{ shown.type }}</span>
              @if (groupLabelKey(); as groupKey) {
                <span class="gs-ctl-group">{{ groupKey | transloco }}</span>
              }
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
          </div>

          @if (shown.worlds.length > 1) {
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
                  {{ option.scene }}
                </button>
              }
            </div>
          }

          @if (shownWorld(); as onShow) {
            <section class="gs-ctl-world">
              <div class="gs-ctl-row">
                @for (frame of onShow.frames; track frame.key) {
                  <figure
                    class="gs-ctl-frame"
                    [class.gs-ctl-frame--render]="frame.key === 'render'"
                  >
                    @if (frame.src; as src) {
                      <img
                        [src]="src"
                        [alt]="frame.altKey | transloco: { name: shown.type }"
                        loading="lazy"
                        decoding="async"
                      />
                    } @else {
                      <span class="gs-ref-map-gap">
                        {{ 'generate.control_types.missing' | transloco }}
                      </span>
                    }
                    <figcaption>{{ frame.labelKey | transloco }}</figcaption>
                  </figure>
                }
              </div>
              <p class="gs-ctl-caption">
                {{ onShow.caption }}
                <span class="gs-ctl-world-model gs-mono">{{
                  onShow.model
                }}</span>
              </p>
            </section>
          }

          <!-- How hard this mode's own maps pull, under the example of what
               they are. The dial is the same field for every mode and what
               changes is what that kind of map can do with it, so it is read
               here rather than once for a whole group. -->
          <app-gs-sweep-scrub
            parameter="control_strength"
            [controlType]="shown.type"
            [startExpanded]="true"
            register="filmcard"
          />
        </div>
      </div>
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

  /** The tile that opened the layer, so closing hands focus back to it. */
  private opener: HTMLElement | null = null;
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
    const notes = this.noteKeys();
    return this.types().map((type) => {
      const worlds = strips
        .map((strip) => this.worldFor(strip, type))
        .filter((world): world is ControlWorld => world !== null);
      return {
        type,
        anchorId: docsControlTypeAnchor(type),
        descriptionKey: descriptions[type] ?? '',
        noteKey: notes[type] ?? null,
        thumb: worlds[0]?.render ?? null,
        worlds,
      };
    });
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
    this.shown.set(tile);
  }

  public close(): void {
    const trigger = this.opener;
    this.opener = null;
    this.focusedPanel = null;
    this.shown.set(null);
    trigger?.focus();
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
    return {
      stripId: strip.strip_id,
      scene: strip.scene.label,
      model: strip.image_model.name,
      frames: [
        {
          key: 'source',
          src: strip.source_image
            ? this.sweeps.assetUrl(strip.source_image)
            : null,
          labelKey: 'generate.control_types.layer_source',
          altKey: 'generate.control_types.source_alt',
        },
        {
          key: 'map',
          src: stop.control_map ? this.sweeps.assetUrl(stop.control_map) : null,
          labelKey: 'generate.control_types.layer_map',
          altKey: 'generate.control_types.map_alt',
        },
        {
          key: 'render',
          src: render,
          labelKey: 'generate.control_types.layer_render',
          altKey: 'generate.control_types.render_alt',
        },
      ],
      render,
      caption: stop.caption,
    };
  }
}
