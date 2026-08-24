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
import { GsAnchorLinkComponent } from '../gs-anchor-link/gs-anchor-link.component';
import {
  SweepLibraryService,
  SweepStop,
  SweepStrip,
} from '../../services/sweep-library.service';
import { docsControlTypeAnchor } from '../../content/docs-links';

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
 * the same mode read three times, each example laid out as the picture it began
 * with, the map the detector drew, and what the render made of it.
 *
 * A mode the library has not published keeps its place and says so. The picker
 * will still run it, and a hole in the grid would read as a mode that does not
 * exist.
 */
@Component({
  selector: 'app-gs-control-gallery',
  imports: [TranslocoPipe, IconComponent, GsAnchorLinkComponent],
  template: `
    <ul class="gs-ref-maps-grid">
      @for (tile of tiles(); track tile.type) {
        <li [id]="tile.anchorId">
          <figure class="gs-ref-map">
            @if (tile.thumb; as thumb) {
              <button
                type="button"
                class="gs-ref-zoom"
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
          <div class="gs-sweep-viewer-top">
            <span class="gs-sweep-viewer-name gs-mono">{{ shown.type }}</span>
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

          <p class="gs-ctl-lead">
            {{ shown.descriptionKey | transloco }}
          </p>

          @for (world of shown.worlds; track world.stripId) {
            <section class="gs-ctl-world">
              <h3 class="gs-ctl-world-head">
                {{ world.scene }}
                <span class="gs-ctl-world-model gs-mono">{{
                  world.model
                }}</span>
              </h3>
              <div class="gs-ctl-row">
                @for (frame of world.frames; track frame.key) {
                  <figure class="gs-ctl-frame">
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
              <p class="gs-ctl-caption">{{ world.caption }}</p>
            </section>
          }
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
   * as one shoot; the rest are what the layer stacks under it.
   */
  public readonly worlds = input.required<readonly string[]>();
  /** The i18n key describing a mode, by mode. */
  public readonly descriptionKeys =
    input.required<Readonly<Record<string, string>>>();
  /** A further line for the modes that need one, by mode. */
  public readonly noteKeys = input<Readonly<Record<string, string>>>({});

  /** The mode the layer is showing, or null while it is shut. */
  private readonly shown = signal<ControlTile | null>(null);
  public readonly opened = this.shown.asReadonly();

  /** The tile that opened the layer, so closing hands focus back to it. */
  private opener: HTMLElement | null = null;
  private focusedPanel: HTMLElement | null = null;

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly closeButton =
    viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  /** The named strips, in the order they were named, and only the ones published. */
  private readonly strips = computed<readonly SweepStrip[]>(() =>
    this.worlds()
      .map((stripId) => this.sweeps.stripById(stripId))
      .filter((strip): strip is SweepStrip => strip !== null),
  );

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

  public open(tile: ControlTile, event: Event): void {
    const trigger = event.currentTarget;
    this.opener = trigger instanceof HTMLElement ? trigger : null;
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

  /**
   * Escape shuts the layer, and Tab is held inside it. The layer is pictures
   * and one way out, so the way out is the only tab stop it needs.
   */
  public onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      this.closeButton()?.nativeElement.focus();
    }
  }

  private worldFor(strip: SweepStrip, type: string): ControlWorld | null {
    const stop = strip.stops.find((frame) => frame.control_type === type);
    return stop ? this.world(strip, stop) : null;
  }

  private world(strip: SweepStrip, stop: SweepStop): ControlWorld {
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
