import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterModule } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HomepageHeroComponent,
  preferUnlikeNeighbours,
} from './homepage-hero.component';
import {
  HOME_MOSAIC_PHONE_TILES,
  HOME_MOSAIC_TILES,
  HOME_SHOWCASE_FIRST,
  ShowcasePicture,
} from '../../../../content/home-showcase';
import { StudioHandoffService } from '../../../../services/studio-handoff.service';

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

  it('paints the nine first pictures as presses', () => {
    setup(false);

    const tiles = fixture.nativeElement.querySelectorAll('.home-tile');
    expect(tiles).toHaveLength(HOME_MOSAIC_TILES);
    expect((tiles[0] as HTMLButtonElement).tagName).toBe('BUTTON');
    expect(tiles[0].getAttribute('aria-label')).toContain(
      HOME_SHOWCASE_FIRST[0].title,
    );
    // Only the first tile spans; the grid is otherwise nine equal cells.
    expect(
      fixture.nativeElement.querySelectorAll('[class*="home-mosaic-cell--"]'),
    ).toHaveLength(1);
  });

  it('leaves every tile a phone hides to lazy loading', () => {
    setup(false);

    const images = Array.from(
      fixture.nativeElement.querySelectorAll('.home-tile-img'),
    );

    // A hidden tile whose picture is lazy is never fetched, which is what
    // keeps the three the two-column form drops off a phone's connection.
    expect(
      images
        .slice(HOME_MOSAIC_PHONE_TILES)
        .every((image) => image.getAttribute('loading') === 'lazy'),
    ).toBe(true);
    expect(
      images
        .slice(0, 4)
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

  it('cycles only the tiles a phone shows', () => {
    setup(false, true);

    // Six ticks take the rotation round the visible six and back to the first;
    // the three the phone hides are never a place a picture is moved to.
    for (let tick = 0; tick < 6; tick++) {
      vi.advanceTimersByTime(6000);
    }

    const tiles = fixture.componentInstance.tiles();
    expect(
      tiles.slice(0, HOME_MOSAIC_PHONE_TILES).every((t) => t.showBack),
    ).toBe(true);
    expect(tiles.slice(HOME_MOSAIC_PHONE_TILES).every((t) => !t.showBack)).toBe(
      true,
    );
  });

  it('never moves the tile being read', () => {
    setup(false);
    fixture.componentInstance.hold(0);

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
