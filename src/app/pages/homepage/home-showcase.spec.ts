import { describe, expect, it } from 'vitest';
import {
  HOME_MOSAIC_PHONE_TILES,
  HOME_MOSAIC_TILES,
  HOME_SHOWCASE,
  HOME_SHOWCASE_FIRST,
  HOME_SHOWCASE_REST,
  showcaseImageUrl,
} from '../../content/home-showcase';
import { environment } from '../../../environments/environment';

/**
 * The pool is a hand-written copy of the promo gallery's manifest, which is not
 * published with the source, so these hold the copy to its own contract: the
 * mosaic has as many pictures as it paints with, each says everything a tile
 * and its press need, and no two on the first screen are of the same thing.
 * That the prompts and models match the gallery is checked by hand when the
 * gallery is regenerated.
 */
const GALLERY_SIZE = 20;

describe('home showcase pool', () => {
  it('carries the whole gallery, each picture once', () => {
    expect(HOME_SHOWCASE).toHaveLength(GALLERY_SIZE);
    expect(new Set(HOME_SHOWCASE.map((p) => p.id)).size).toBe(GALLERY_SIZE);
    expect(HOME_SHOWCASE_REST).toHaveLength(GALLERY_SIZE - HOME_MOSAIC_TILES);
  });

  it('paints nine distinct tiles, the grid closing flush on twelve cells', () => {
    expect(HOME_SHOWCASE_FIRST).toHaveLength(HOME_MOSAIC_TILES);
    expect(new Set(HOME_SHOWCASE_FIRST.map((p) => p.id)).size).toBe(
      HOME_MOSAIC_TILES,
    );
  });

  it('shows nine different things at once, and six on a phone', () => {
    expect(new Set(HOME_SHOWCASE_FIRST.map((p) => p.subject)).size).toBe(
      HOME_MOSAIC_TILES,
    );
    expect(
      new Set(
        HOME_SHOWCASE_FIRST.slice(0, HOME_MOSAIC_PHONE_TILES).map(
          (p) => p.subject,
        ),
      ).size,
    ).toBe(HOME_MOSAIC_PHONE_TILES);
  });

  it('says of every picture what a tile and its press need', () => {
    for (const picture of HOME_SHOWCASE) {
      expect(picture.prompt.length).toBeGreaterThan(0);
      expect(picture.model.length).toBeGreaterThan(0);
      expect(picture.subject.length).toBeGreaterThan(0);
      // Two to four words, so the caption is a name rather than a sentence.
      const words = picture.title.trim().split(/\s+/);
      expect(words.length).toBeGreaterThanOrEqual(2);
      expect(words.length).toBeLessThanOrEqual(4);
    }
  });

  it('addresses the published gallery', () => {
    const picture = HOME_SHOWCASE.find((p) => p.id === 'whale-library')!;

    expect(showcaseImageUrl(picture)).toBe(
      `${environment.promoBaseUrl}/gallery/whale-library/result.webp`,
    );
  });
});
