import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterModule } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HomepageHeroComponent,
  preferUnlikeNeighbours,
} from './homepage-hero.component';
import {
  HOME_SHOWCASE,
  HOME_SHOWCASE_FIRST,
  ShowcasePicture,
} from '../../../../content/home-showcase';
import { StudioHandoffService } from '../../../../services/studio-handoff.service';

/** A pointer of a given kind, for the two that behave differently. */
function pointer(pointerType: string): PointerEvent {
  return { pointerType } as PointerEvent;
}

const mouse = (): PointerEvent => pointer('mouse');
const touch = (): PointerEvent => pointer('touch');

/** A pool of known subjects, so the choice is read rather than inferred. */
function pool(...subjects: string[]): ShowcasePicture[] {
  return subjects.map((subject) => ({
    id: subject,
    title: `A ${subject}`,
    prompt: `a ${subject}`,
    model: 'a model',
    subject,
  }));
}

describe('preferUnlikeNeighbours', () => {
  it('takes the first picture of none of the subjects beside the tile', () => {
    const queue = pool('snail', 'whale', 'fox');

    expect(preferUnlikeNeighbours(queue, new Set(['snail', 'whale']))).toBe(2);
  });

  it('takes the head of the queue where every subject is already beside it', () => {
    const queue = pool('snail', 'whale');

    expect(
      preferUnlikeNeighbours(queue, new Set(['snail', 'whale', 'fox'])),
    ).toBe(0);
  });

  it('takes the head where nothing is beside it at all', () => {
    expect(preferUnlikeNeighbours(pool('snail', 'fox'), new Set())).toBe(0);
  });
});

/** A picture that is always there the moment it is asked for. */
class InstantImage {
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  private value = '';

  public set src(url: string) {
    this.value = url;
    this.onload?.();
  }

  public get src(): string {
    return this.value;
  }
}

describe('HomepageHeroComponent', () => {
  let fixture: ComponentFixture<HomepageHeroComponent>;
  let handoff: { set: ReturnType<typeof vi.fn> };
  let navigate: ReturnType<typeof vi.fn>;

  function setup(reducedMotion: boolean, phone = false): void {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion')
        ? reducedMotion
        : phone && query.includes('max-width'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    vi.stubGlobal('Image', InstantImage);

    TestBed.configureTestingModule({
      imports: [
        HomepageHeroComponent,
        RouterModule.forRoot([]),
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              'homepage.hero.tile_press': '{{title}}: show the prompt',
            },
          },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    });

    handoff = { set: vi.fn() };
    TestBed.overrideProvider(StudioHandoffService, { useValue: handoff });
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.inject(Router).navigate = navigate;

    fixture = TestBed.createComponent(HomepageHeroComponent);
    fixture.detectChanges();
  }

  const tile = (index: number): HTMLElement =>
    fixture.nativeElement.querySelectorAll('.home-tile')[index] as HTMLElement;
  const tileFront = (index: number): HTMLButtonElement =>
    fixture.nativeElement.querySelectorAll('.home-tile-front')[
      index
    ] as HTMLButtonElement;
  /** The three presses of one tile's back face, in the order they are read. */
  const backButtons = (index: number): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.home-back-btn')).slice(
      index * 3,
      index * 3 + 3,
    ) as HTMLButtonElement[];
  const tryButton = (index: number): HTMLButtonElement => backButtons(index)[0];
  const viewButton = (index: number): HTMLButtonElement =>
    backButtons(index)[1];
  const backButton = (index: number): HTMLButtonElement =>
    backButtons(index)[2];

  /** Press a tile's picture, and let the focus move that follows it happen. */
  function press(index: number): void {
    tileFront(index).click();
    fixture.detectChanges();
    TestBed.tick();
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('renders the whole gallery as presses, the mosaic being the first nine', () => {
    setup(false);

    const tiles = fixture.nativeElement.querySelectorAll('.home-tile-front');
    // Every picture is in the markup: a phone scrolls the lot as a strip, and
    // a wider screen draws the first nine and hides the rest by rule.
    expect(tiles).toHaveLength(HOME_SHOWCASE.length);
    expect((tiles[0] as HTMLButtonElement).tagName).toBe('BUTTON');
    expect(tiles[0].getAttribute('aria-label')).toContain(
      HOME_SHOWCASE_FIRST[0].title,
    );
    // Only the first tile spans; the grid is otherwise nine equal cells.
    expect(
      fixture.nativeElement.querySelectorAll('[class*="home-mosaic-cell--"]'),
    ).toHaveLength(1);
  });

  it('leaves everything past the first three to lazy loading', () => {
    setup(false);

    const images = Array.from(
      fixture.nativeElement.querySelectorAll('.home-tile-img'),
    );

    // A tile that is hidden at this width, or off the end of the strip at a
    // phone's, is never fetched while its picture is lazy.
    expect(
      images
        .slice(3)
        .every((image) => image.getAttribute('loading') === 'lazy'),
    ).toBe(true);
    expect(
      images
        .slice(0, 3)
        .every((image) => image.getAttribute('loading') === null),
    ).toBe(true);
  });

  it('moves one tile on at a time while motion is allowed', () => {
    setup(false);
    const before = fixture.componentInstance.tiles();

    vi.advanceTimersByTime(6000);
    const after = fixture.componentInstance.tiles();

    expect(after[0].showBack).toBe(true);
    expect(after[0].back).not.toBeNull();
    expect(after[0].back!.id).not.toBe(before[0].front.id);
    // Round-robin: only the tile whose turn it was has moved.
    expect(after.slice(1).every((tile) => !tile.showBack)).toBe(true);

    vi.advanceTimersByTime(6000);
    expect(fixture.componentInstance.tiles()[1].showBack).toBe(true);
  });

  it('holds still where motion is not wanted', () => {
    setup(true);
    const before = fixture.componentInstance.tiles();

    vi.advanceTimersByTime(60000);

    expect(fixture.componentInstance.tiles()).toEqual(before);
  });

  it('holds still on a phone, where the strip scrolling is the motion', () => {
    setup(false, true);
    const before = fixture.componentInstance.tiles();

    vi.advanceTimersByTime(60000);

    expect(fixture.componentInstance.tiles()).toEqual(before);
  });

  it('holds every tile for a moment after the pointer moves over the mosaic', () => {
    setup(false);
    const before = fixture.componentInstance.tiles();

    // The pointer moves a second before the tile's turn comes round.
    vi.advanceTimersByTime(5000);
    fixture.componentInstance.onPointerMove(mouse());
    vi.advanceTimersByTime(1000);

    // A reader moving towards a picture is on their way to it, so the tick
    // passes without changing anything.
    expect(fixture.componentInstance.tiles()).toEqual(before);

    // Four seconds after the last movement the mosaic goes back to its own
    // pace, and the next tick moves the tile whose turn it was.
    vi.advanceTimersByTime(6000);
    expect(fixture.componentInstance.tiles()[0].showBack).toBe(true);
  });

  it('never moves the tile being read', () => {
    setup(false);
    fixture.componentInstance.hold(0, mouse());

    vi.advanceTimersByTime(6000);

    const tiles = fixture.componentInstance.tiles();
    expect(tiles[0].showBack).toBe(false);
    expect(tiles[1].showBack).toBe(true);
  });

  it('never puts a picture of a subject already beside the tile', () => {
    setup(false);

    // Tile 0 meets tiles 1, 3, 5 and 6. Whatever moves into it is of none of
    // their subjects, so the span never doubles a picture next to it.
    vi.advanceTimersByTime(6000);

    const tiles = fixture.componentInstance.tiles();
    const subjectOf = (index: number): string => {
      const tile = tiles[index];
      return (tile.showBack && tile.back ? tile.back : tile.front).subject;
    };

    expect([1, 3, 5, 6].map(subjectOf)).not.toContain(subjectOf(0));
  });

  it('ignores a touch resting on a tile, which is a tap rather than a hover', () => {
    setup(false);
    fixture.componentInstance.hold(0, touch());

    vi.advanceTimersByTime(6000);

    // A tap reports a pointer entering and never leaving, so honouring it would
    // hold the first tile still for good.
    expect(fixture.componentInstance.tiles()[0].showBack).toBe(true);
  });

  it('turns a tile over to its prompt and puts the reader on the offer', () => {
    setup(false);

    press(0);

    expect(fixture.componentInstance.flipped()).toBe(0);
    expect(tileFront(0).getAttribute('aria-expanded')).toBe('true');
    expect(
      fixture.nativeElement.querySelectorAll('.home-tile--flipped'),
    ).toHaveLength(1);
    expect(document.activeElement).toBe(tryButton(0));
    // The prompt is on the face, and the whole of it is on the element.
    const prompt = fixture.nativeElement.querySelectorAll(
      '.home-back-prompt',
    )[0] as HTMLElement;
    expect(prompt.textContent.trim()).toBe(HOME_SHOWCASE_FIRST[0].prompt);
    expect(prompt.getAttribute('title')).toBe(HOME_SHOWCASE_FIRST[0].prompt);
  });

  it('turns over just the same where motion is not wanted', () => {
    setup(true);

    press(0);

    // The turn is the answer, so it happens either way; that it happens without
    // the rotation is the sheet's own reduced-motion rule over the one
    // transition, as the studio's tile does it.
    expect(fixture.componentInstance.flipped()).toBe(0);
    expect(document.activeElement).toBe(tryButton(0));
  });

  it('turns the previous tile back when another is pressed', () => {
    setup(false);

    press(0);
    press(3);

    expect(fixture.componentInstance.flipped()).toBe(3);
    expect(tileFront(0).getAttribute('aria-expanded')).toBe('false');
    expect(
      fixture.nativeElement.querySelectorAll('.home-tile--flipped'),
    ).toHaveLength(1);
  });

  it('turns back on Escape and on Back, the press getting its focus again', () => {
    setup(false);

    press(2);
    tile(2).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    TestBed.tick();

    expect(fixture.componentInstance.flipped()).toBeNull();
    expect(document.activeElement).toBe(tileFront(2));

    press(2);
    backButton(2).click();
    fixture.detectChanges();
    TestBed.tick();

    expect(fixture.componentInstance.flipped()).toBeNull();
    expect(document.activeElement).toBe(tileFront(2));
  });

  it('never turns a tile whose prompt is open', () => {
    setup(false);

    press(0);
    vi.advanceTimersByTime(6000);

    // The first tile's turn passes to the next rather than changing the picture
    // the reader is reading about.
    expect(fixture.componentInstance.tiles()[0].showBack).toBe(false);
    expect(fixture.componentInstance.tiles()[1].showBack).toBe(true);
  });

  it('takes the picture prompt to the studio from the face', () => {
    setup(false);

    press(0);
    tryButton(0).click();

    // The studio writes the handed-over prompt into its box on arrival, so what
    // is handed over is the picture's own prompt, exactly as published, and it
    // replaces whatever was there rather than joining it.
    expect(handoff.set).toHaveBeenCalledWith({
      prompt: HOME_SHOWCASE_FIRST[0].prompt,
      promptMode: 'set',
    });
    expect(navigate).toHaveBeenCalledWith(['/generate/image']);
  });

  it('says the offer landed until the studio opens', () => {
    setup(false);
    let openStudio: (value: boolean) => void = () => undefined;
    navigate.mockReturnValue(
      new Promise<boolean>((resolve) => (openStudio = resolve)),
    );

    press(1);
    tryButton(1).click();
    fixture.detectChanges();

    const face = fixture.nativeElement.querySelectorAll(
      '.home-flip-face--back',
    )[1];
    expect(face.getAttribute('aria-busy')).toBe('true');
    expect(tryButton(1).disabled).toBe(true);
    expect(backButton(1).disabled).toBe(true);

    openStudio(true);
  });

  it('goes back to being a picture when the studio does not open', async () => {
    setup(false);
    navigate.mockRejectedValue(new Error('no route'));

    const tile = fixture.nativeElement.querySelectorAll(
      '.home-tile',
    )[0] as HTMLButtonElement;
    tile.click();
    // The failure lands in a microtask, which is all the state has to wait for.
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance.going()).toBeNull();
    expect(tryButton(0).disabled).toBe(false);
  });

  it('opens the picture whole, and holds the mosaic while it is open', () => {
    setup(false);

    press(0);
    viewButton(0).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.viewing()).toBe(0);
    expect(fixture.componentInstance.viewingPicture()?.id).toBe(
      HOME_SHOWCASE_FIRST[0].id,
    );
    // The dialog pages through the whole pool, not the nine on the grid.
    expect(fixture.componentInstance.viewingSet()).toEqual({
      count: HOME_SHOWCASE.length,
      at: 1,
    });

    const before = fixture.componentInstance.tiles();
    vi.advanceTimersByTime(60000);
    expect(fixture.componentInstance.tiles()).toEqual(before);
  });

  it('walks the whole pool from inside the dialog, wrapping at either end', () => {
    setup(false);

    press(0);
    viewButton(0).click();
    fixture.componentInstance.step(-1);

    expect(fixture.componentInstance.viewingPicture()?.id).toBe(
      HOME_SHOWCASE[HOME_SHOWCASE.length - 1].id,
    );

    fixture.componentInstance.step(1);
    expect(fixture.componentInstance.viewingPicture()?.id).toBe(
      HOME_SHOWCASE[0].id,
    );
  });

  it('closes the picture onto the press that opened it, still turned over', () => {
    setup(false);

    press(2);
    viewButton(2).click();
    fixture.detectChanges();
    fixture.componentInstance.closeView();
    fixture.detectChanges();
    TestBed.tick();

    expect(fixture.componentInstance.viewing()).toBeNull();
    // Closing a picture is not closing the prompt, so the tile stays turned.
    expect(fixture.componentInstance.flipped()).toBe(2);
    expect(document.activeElement).toBe(viewButton(2));
  });

  it('leaves a tile bare when its picture cannot be loaded', () => {
    setup(false);
    fixture.componentInstance.markFailed(2);
    fixture.detectChanges();

    const tile = fixture.nativeElement.querySelectorAll('.home-tile-front')[2];
    expect(tile.querySelector('.home-tile-img')).toBeNull();
    expect(tile.querySelector('.home-tile-cap')).toBeNull();
    // The link still says where it goes without a picture to be named by.
    expect(tile.getAttribute('aria-label')).not.toBeNull();
  });
});
