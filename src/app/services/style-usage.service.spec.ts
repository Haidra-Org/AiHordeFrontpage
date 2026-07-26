import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { StyleUsageService } from './style-usage.service';

const USAGE_KEY = 'aihorde.generate.style_usage';

function service(): StyleUsageService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(StyleUsageService);
}

describe('StyleUsageService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty and counts unknown styles as zero', () => {
    const usage = service();
    expect(usage.usage()).toEqual({});
    expect(usage.count('Cinematic')).toBe(0);
    expect(usage.topStyles(5)).toEqual([]);
  });

  it('increments and persists across instances', () => {
    const usage = service();
    usage.increment('Cinematic');
    usage.increment('Cinematic');
    usage.increment('Anime');
    expect(usage.count('Cinematic')).toBe(2);

    const reloaded = service();
    expect(reloaded.count('Cinematic')).toBe(2);
    expect(reloaded.count('Anime')).toBe(1);
  });

  it('ignores blank style names', () => {
    const usage = service();
    usage.increment('   ');
    expect(usage.usage()).toEqual({});
  });

  it('orders by count desc, then by name, and honours the limit', () => {
    const usage = service();
    usage.increment('beta');
    usage.increment('beta');
    usage.increment('alpha');
    usage.increment('alpha');
    usage.increment('gamma');

    expect(usage.topStyles(3)).toEqual([
      { name: 'alpha', count: 2 },
      { name: 'beta', count: 2 },
      { name: 'gamma', count: 1 },
    ]);
    expect(usage.topStyles(1)).toEqual([{ name: 'alpha', count: 2 }]);
    expect(usage.topStyles(0)).toEqual([]);
  });

  it('drops malformed persisted counts', () => {
    localStorage.setItem(
      USAGE_KEY,
      JSON.stringify({ good: 3, negative: -2, text: 'x', fractional: 1.7 }),
    );
    const usage = service();
    expect(usage.usage()).toEqual({ good: 3, fractional: 1 });
  });
});
