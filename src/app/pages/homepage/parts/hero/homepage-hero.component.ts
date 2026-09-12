import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChildren,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  HOME_MOSAIC_PHONE_TILES,
  HOME_MOSAIC_TILES,
  HOME_SHOWCASE,
  HOME_SHOWCASE_REST,
  ShowcasePicture,
  showcaseImageUrl,
} from '../../../../content/home-showcase';
import { StudioHandoffService } from '../../../../services/studio-handoff.service';

/** How long a picture holds a tile before the next one takes it. */
const ROTATE_MS = 6000;

/**
 * How long the whole mosaic holds still after the pointer last moved over it.
 * A reader moving towards a picture is on their way to it, and a tile that
 * crossfades under an approaching pointer takes the picture they were going
 * for. Hovering holds that one tile for as long as the pointer rests on it;
 * this holds every tile for a moment after any movement at all.
 */
const POINTER_QUIET_MS = 4000;

/** The width at which the mosaic becomes a strip the reader scrolls itself. */
const PHONE_QUERY = '(max-width: 479.98px)';

/**
 * Which tiles touch which, as the grid lays them out: four columns of three
 * with the first tile taking the top-left four cells, so it meets the two tiles
 * beside it and the two under it.
 */
const NEIGHBOURS: readonly (readonly number[])[] = [
  [1, 3, 5, 6],
  [0, 2, 3, 7],
  [1, 4, 8],
  [0, 1, 4, 7],
  [2, 3, 8],
  [0, 6],
  [0, 5, 7],
  [1, 3, 6, 8],
  [2, 4, 7],
];

/** The same, for the two columns of three a phone shows. */
const PHONE_NEIGHBOURS: readonly (readonly number[])[] = [
  [1, 2],
  [0, 3],
  [0, 3, 4],
  [1, 2, 5],
  [2, 5],
  [3, 4],
];

/**
 * The first picture in the queue that is of none of the subjects already beside
 * the tile, or the head of the queue where every one of them is. Two renditions
 * of one subject side by side read as the page showing the same picture twice,
 * which is the one thing a wall of pictures must not do.
 */
export function preferUnlikeNeighbours(
  queue: readonly ShowcasePicture[],
  avoid: ReadonlySet<string>,
): number {
  const unlike = queue.findIndex((picture) => !avoid.has(picture.subject));
  return unlike === -1 ? 0 : unlike;
}

/**
 * One tile of the mosaic, as two stacked pictures so the change between them
 * is a crossfade rather than a blink. Which of the two is showing is the tile's
 * whole state; the other is either empty or the one the tile just left.
 */
export interface MosaicTile {
  front: ShowcasePicture;
  back: ShowcasePicture | null;
  /** True while the back picture is the one being read. */
  showBack: boolean;
  /** Set when the picture cannot be loaded, which leaves the tile bare. */
  failed: boolean;
}

/**
 * The first screen: what the horde is, the two doors into it, and nine pictures
 * it made.
 *
 * The pictures are published gallery runs, so each tile is also an offer: its
 * press opens the studio with the prompt that made it. Their addresses are
 * static, so the mosaic is complete in the prerendered page and needs nothing
 * fetched to paint.
 */
@Component({
  selector: 'app-homepage-hero',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './homepage-hero.component.html',
  styleUrl: './homepage-hero.component.css',
  host: {
    // Escape belongs to whichever tile is turned over, and the focus is inside
    // it, so the hero listens once rather than every tile listening for itself.
    '(keydown.escape)': 'unflipCurrent()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomepageHeroComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly handoff = inject(StudioHandoffService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private readonly tileButtons =
    viewChildren<ElementRef<HTMLButtonElement>>('tileButton');
  private readonly tryButtons =
    viewChildren<ElementRef<HTMLButtonElement>>('tryButton');

  /**
   * Which tiles span more than one cell. A mosaic of nine equal squares reads as
   * a contact sheet; one larger tile gives the eye somewhere to land first, and
   * one is all the grid can carry and still close flush.
   */
  public readonly spanClass: readonly string[] = [
    'home-mosaic-cell--wide-tall',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];

  /**
   * Every picture, in order. The first nine are the mosaic and the ones the
   * rotation moves; a phone shows the lot as a strip it scrolls itself, and a
   * wider screen hides the rest, which are lazy and so never fetched there.
   */
  public readonly tiles = signal<readonly MosaicTile[]>(
    HOME_SHOWCASE.map((picture) => ({
      front: picture,
      back: null,
      showBack: false,
      failed: false,
    })),
  );

  /** The pictures waiting for a tile, oldest first. */
  private queue: ShowcasePicture[] = [...HOME_SHOWCASE_REST];

  /** Which tile the next change is due on. */
  private nextTile = 0;

  /** The tile under the pointer or holding focus, which never changes under it. */
  private held: number | null = null;

  /** Set while the pointer has moved recently; nothing rotates until it clears. */
  private pointerQuiet = false;
  private quietTimer: ReturnType<typeof setTimeout> | null = null;

  /** The tile whose press is on its way to the studio, while it is on its way. */
  public readonly going = signal<number | null>(null);

  /**
   * The tile showing its back face, or null. One at a time: a wall of pictures
   * that had turned into a wall of text would have stopped being a wall of
   * pictures, and the reader asked about one of them.
   */
  public readonly flipped = signal<number | null>(null);

  constructor() {
    afterNextRender(() => {
      // The strip's own scrolling is the phone's motion; a picture changing
      // under a thumb that is dragging the row past it is one motion too many.
      if (this.reducedMotion() || this.onPhone()) return;
      const timer = setInterval(() => this.rotate(), ROTATE_MS);
      this.destroyRef.onDestroy(() => {
        clearInterval(timer);
        if (this.quietTimer !== null) clearTimeout(this.quietTimer);
      });
    });
  }

  public picture(tile: MosaicTile): ShowcasePicture {
    return tile.showBack && tile.back ? tile.back : tile.front;
  }

  public imageUrl(picture: ShowcasePicture): string {
    return showcaseImageUrl(picture);
  }

  /**
   * Turn a tile over to what made it. The press is the picture's own, so it
   * answers where it was asked rather than by leaving the page: the prompt is
   * what a reader pressing a picture wants to see, and going to the studio is a
   * second, deliberate press on the face that shows it.
   */
  public flip(index: number): void {
    this.flipped.set(index);
    afterNextRender(() => this.tryButtons()[index]?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /** Escape turns back whatever is turned over, wherever the focus sits. */
  public unflipCurrent(): void {
    const open = this.flipped();
    if (open !== null) this.unflip(open);
  }

  /** Turn the tile back, and give the press that turned it its focus back. */
  public unflip(index: number): void {
    if (this.flipped() !== index) return;
    this.flipped.set(null);
    afterNextRender(() => this.tileButtons()[index]?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /**
   * Take the picture's prompt to the studio. The handoff is how one studio
   * hands the other a prompt already, and the studio writes it into the box on
   * arrival, so a reader who liked a picture starts from what made it rather
   * than from an empty page. The prompt replaces rather than joins: it is the
   * prompt the reader chose, not material for one.
   *
   * The tile says so while it happens. Loading the studio is the heaviest route
   * on the site, and a press with nothing to show for it reads as a press that
   * missed, so the tile holds the reader's place until the page changes.
   */
  public async tryPrompt(
    index: number,
    picture: ShowcasePicture,
  ): Promise<void> {
    if (this.going() !== null) return;
    this.going.set(index);
    this.handoff.set({ prompt: picture.prompt, promptMode: 'set' });
    try {
      await this.router.navigate(['/generate/image']);
    } catch {
      // The studio never opened, so the tile goes back to being a picture and
      // the press can be made again.
      this.going.set(null);
    }
  }

  /** A mouse moving anywhere over the mosaic holds every tile for a moment. */
  public onPointerMove(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    this.pointerQuiet = true;
    if (this.quietTimer !== null) clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(() => {
      this.pointerQuiet = false;
      this.quietTimer = null;
    }, POINTER_QUIET_MS);
  }

  /**
   * A pointer resting on a tile. Only a mouse hovers: a tap reports itself as a
   * pointer entering and never leaving, which would hold the tile still for
   * good and show the caption of a tile nobody is looking at.
   */
  public hold(index: number, event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    this.held = index;
  }

  public release(index: number, event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    if (this.held === index) this.held = null;
  }

  /** Focus holds a tile too, whatever moved the focus there. */
  public holdFocus(index: number): void {
    this.held = index;
  }

  public releaseFocus(index: number): void {
    if (this.held === index) this.held = null;
  }

  /** A picture the library cannot serve leaves the tile on the plate colour. */
  public markFailed(index: number): void {
    this.tiles.update((tiles) =>
      tiles.map((tile, i) => (i === index ? { ...tile, failed: true } : tile)),
    );
  }

  /**
   * Move one tile on. Round-robin rather than random so every tile changes as
   * often as every other and two neighbours never change together, and never
   * the tile being read: a picture that moves under the pointer takes the
   * caption and the link with it.
   */
  private rotate(): void {
    // A phone hides the last three tiles, so they are not places a picture can
    // be moved to: the rotation is over what is on the screen.
    if (this.pointerQuiet) return;

    const phone = this.onPhone();
    const neighbours = phone ? PHONE_NEIGHBOURS : NEIGHBOURS;
    const total = Math.min(
      phone ? HOME_MOSAIC_PHONE_TILES : HOME_MOSAIC_TILES,
      this.tiles().length,
    );
    if (total === 0 || this.queue.length === 0) return;

    let index = -1;
    for (let step = 0; step < total; step++) {
      const candidate = (this.nextTile + step) % total;
      // A tile being read is a tile turned over as much as one under the
      // pointer: either way the reader is looking at that picture.
      if (candidate !== this.held && candidate !== this.flipped()) {
        index = candidate;
        break;
      }
    }
    if (index < 0) return;
    this.nextTile = (index + 1) % total;

    const beside = new Set<string>();
    for (const i of neighbours[index] ?? []) {
      const neighbour = this.tiles()[i];
      if (neighbour) beside.add(this.picture(neighbour).subject);
    }
    const incoming = this.queue.splice(
      preferUnlikeNeighbours(this.queue, beside),
      1,
    )[0];
    if (!incoming) return;

    // The swap waits for the bytes, so the crossfade never reveals a half-drawn
    // picture or an empty box.
    const preload = new Image();
    preload.onload = () => this.commit(index, incoming);
    preload.onerror = () => this.queue.push(incoming);
    preload.src = showcaseImageUrl(incoming);
  }

  private commit(index: number, incoming: ShowcasePicture): void {
    this.tiles.update((tiles) =>
      tiles.map((tile, i) => {
        if (i !== index) return tile;
        this.queue.push(this.picture(tile));
        return tile.showBack
          ? { front: incoming, back: tile.back, showBack: false, failed: false }
          : {
              front: tile.front,
              back: incoming,
              showBack: true,
              failed: false,
            };
      }),
    );
  }

  /** Whether the mosaic is in its two-column form, read at each change. */
  private onPhone(): boolean {
    return globalThis.matchMedia?.(PHONE_QUERY).matches === true;
  }

  private reducedMotion(): boolean {
    return (
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ===
      true
    );
  }
}
