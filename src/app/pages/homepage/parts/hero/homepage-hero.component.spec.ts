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
              'homepage.hero.tile_press':
                '{{title}}: try this prompt in the studio',
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

    const tiles = fixture.nativeElement.querySelectorAll('.home-tile');
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

  it('takes the picture prompt to the studio when a tile is pressed', () => {
    setup(false);

    const tile = fixture.nativeElement.querySelectorAll(
      '.home-tile',
    )[0] as HTMLButtonElement;
    tile.click();

    // The studio writes the handed-over prompt into its box on arrival, so what
    // is handed over is the picture's own prompt, exactly as published, and it
    // replaces whatever was there rather than joining it.
    expect(handoff.set).toHaveBeenCalledWith({
      prompt: HOME_SHOWCASE_FIRST[0].prompt,
      promptMode: 'set',
    });
    expect(navigate).toHaveBeenCalledWith(['/generate/image']);
  });

  it('says the press landed until the studio opens, and holds the rest', () => {
    setup(false);
    let openStudio: (value: boolean) => void = () => undefined;
    navigate.mockReturnValue(
      new Promise<boolean>((resolve) => (openStudio = resolve)),
    );

    const tiles = fixture.nativeElement.querySelectorAll('.home-tile');
    (tiles[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(tiles[1].classList.contains('home-tile--going')).toBe(true);
    expect(tiles[1].getAttribute('aria-busy')).toBe('true');
    expect((tiles[0] as HTMLButtonElement).disabled).toBe(true);
    expect((tiles[1] as HTMLButtonElement).disabled).toBe(false);

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
    expect(tile.classList.contains('home-tile--going')).toBe(false);
  });

  it('leaves a tile bare when its picture cannot be loaded', () => {
    setup(false);
    fixture.componentInstance.markFailed(2);
    fixture.detectChanges();

    const tile = fixture.nativeElement.querySelectorAll('.home-tile')[2];
    expect(tile.querySelector('.home-tile-img')).toBeNull();
    expect(tile.querySelector('.home-tile-cap')).toBeNull();
    // The link still says where it goes without a picture to be named by.
    expect(tile.getAttribute('aria-label')).not.toBeNull();
  });
});
