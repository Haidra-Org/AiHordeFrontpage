import { describe, expect, it } from 'vitest';
import { isStudioRoute } from './nav-items';

describe('isStudioRoute', () => {
  it('names the studios, and only where a route actually enters one', () => {
    // The site bar is drawn a size down over a studio, so the test has to be
    // about the route rather than about its first letters: a page whose path
    // merely starts the same way is read rather than worked in.
    for (const url of [
      '/generate',
      '/generate/image',
      '/generate/alchemy',
      '/alchemy',
      '/generate?tab=storage',
      '/generate#prompt',
    ]) {
      expect(isStudioRoute(url)).toBe(true);
    }

    for (const url of [
      '/',
      '/docs/image',
      '/docs/image/guide',
      '/generated-images',
      '/alchemystic',
      '/status',
    ]) {
      expect(isStudioRoute(url)).toBe(false);
    }
  });
});
