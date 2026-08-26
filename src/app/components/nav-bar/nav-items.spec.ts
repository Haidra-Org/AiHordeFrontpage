import { describe, expect, it } from 'vitest';
import {
  NAV_ITEMS,
  NavEntryMeasurement,
  isStudioRoute,
  planNavOverflow,
} from './nav-items';

describe('isStudioRoute', () => {
  it('names the studios, and only where a route actually enters one', () => {
    // The site bar is drawn a size down over a studio, so the test has to be
    // about the route rather than about its first letters: a page whose path
    // merely starts the same way is read rather than worked in.
    for (const url of [
      '/generate',
      '/generate/image',
      '/generate/alchemy',
      '/generate/storage',
      '/alchemy',
      '/generate?tab=storage',
      '/generate#prompt',
    ]) {
      expect(isStudioRoute(url)).toBe(true);
    }

    for (const url of [
      '/',
      '/docs/image',
      '/docs/image/settings',
      '/generated-images',
      '/alchemystic',
      '/status',
    ]) {
      expect(isStudioRoute(url)).toBe(false);
    }
  });
});

describe('the Generate group', () => {
  const generate = NAV_ITEMS.find((item) => item.dropdownId === 'generate');

  it('holds the studios rather than spending a place on each', () => {
    expect(generate).toBeDefined();
    expect(generate?.children?.map((child) => child.routerLink)).toEqual([
      '/generate/image',
      '/generate/alchemy',
      '/generate/storage',
    ]);
    // A studio added later is an entry in this list and nothing else: no bar
    // entry of its own, and no change to how the trigger lights up.
    expect(generate?.activeRouteMatch).toBe(isStudioRoute);
    expect(
      NAV_ITEMS.filter((item) => item.routerLink?.startsWith('/generate')),
    ).toEqual([]);
  });
});

describe('the bar entries', () => {
  it('give up their places in a declared order, with no ties', () => {
    const priorities = NAV_ITEMS.map((item) => item.overflowPriority).filter(
      (priority): priority is number => priority !== undefined,
    );
    expect(new Set(priorities).size).toBe(priorities.length);
  });

  it('pins the entries a reader arrives for', () => {
    const pinned = NAV_ITEMS.filter(
      (item) => item.overflowPriority === undefined,
    ).map((item) => item.labelKey);
    expect(pinned).toEqual(['home', 'nav.generate', 'nav.account']);
  });
});

describe('planNavOverflow', () => {
  const entry = (
    key: string,
    width: number,
    overflowPriority?: number,
  ): NavEntryMeasurement => ({ key, width, overflowPriority });

  const bar = [
    entry('home', 100),
    entry('a', 100, 10),
    entry('b', 100, 30),
    entry('c', 100, 20),
  ];

  it('hides nothing while the entries are paid for', () => {
    // Four entries and three gaps.
    expect(planNavOverflow(bar, 430, 10, 80)).toEqual(new Set());
  });

  it('takes the highest priority first', () => {
    // Room for three entries and the trigger: 100 * 3 + 80 + 10 * 3.
    expect(planNavOverflow(bar, 420, 10, 80)).toEqual(new Set(['b']));
  });

  it('keeps taking until what is left fits', () => {
    expect(planNavOverflow(bar, 300, 10, 80)).toEqual(new Set(['b', 'c']));
  });

  it('leaves a pinned entry on the bar however narrow it gets', () => {
    expect(planNavOverflow(bar, 40, 10, 80)).toEqual(new Set(['b', 'c', 'a']));
  });

  it('charges for the trigger, so the last place is not the trigger place', () => {
    // Wide enough for all four with no trigger, but not for three plus one.
    const tight = [entry('home', 100), entry('a', 100, 10)];
    expect(planNavOverflow(tight, 210, 10, 80)).toEqual(new Set());
    expect(planNavOverflow(tight, 190, 10, 80)).toEqual(new Set(['a']));
  });
});
