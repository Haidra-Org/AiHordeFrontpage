import { describe, expect, it } from 'vitest';
import { ActiveModel, mergeModelList } from './active-model';

const STATUS: ActiveModel[] = [
  { name: 'Deliberate', count: 4 },
  { name: 'Flux', count: 9 },
  { name: 'Some Private Merge', count: 2 },
];

describe('mergeModelList', () => {
  it('offers every model the reference lists, whether or not it is served', () => {
    const merged = mergeModelList(['Deliberate', 'Flux', 'Pony Diffusion'], []);

    expect(merged.map((model) => model.name)).toEqual([
      'Deliberate',
      'Flux',
      'Pony Diffusion',
    ]);
    expect(merged.every((model) => model.count === 0)).toBe(true);
  });

  it('lays the live worker counts over the reference', () => {
    const merged = mergeModelList(
      ['Deliberate', 'Flux', 'Pony Diffusion'],
      STATUS,
    );

    expect(
      merged
        .filter((model) => !model.custom)
        .map((model) => [model.name, model.count]),
    ).toEqual([
      ['Flux', 9],
      ['Deliberate', 4],
      ['Pony Diffusion', 0],
    ]);
  });

  it('folds in a served model the reference does not know, marked custom', () => {
    const merged = mergeModelList(['Deliberate', 'Flux'], STATUS);
    const custom = merged.filter((model) => model.custom);

    expect(custom).toEqual([
      { name: 'Some Private Merge', count: 2, custom: true },
    ]);
  });

  it('sorts by worker count, then by name', () => {
    const merged = mergeModelList(
      ['Zebra', 'Alpaca', 'Busy'],
      [{ name: 'Busy', count: 3 }],
    );

    expect(merged.map((model) => model.name)).toEqual([
      'Busy',
      'Alpaca',
      'Zebra',
    ]);
  });

  it('serves the horde list alone until the reference answers', () => {
    const merged = mergeModelList(null, STATUS);

    expect(merged.map((model) => model.name)).toEqual([
      'Flux',
      'Deliberate',
      'Some Private Merge',
    ]);
    expect(merged.some((model) => model.custom)).toBe(false);
  });

  it('drops nameless entries from either source', () => {
    expect(mergeModelList(['', 'Flux'], [{ name: '', count: 7 }])).toEqual([
      { name: 'Flux', count: 0 },
    ]);
  });
});
