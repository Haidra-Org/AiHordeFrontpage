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
    usage.increment('curated:Cinematic');
    usage.increment('curated:Cinematic');
    usage.increment('native:abc-123');
    expect(usage.count('curated:Cinematic')).toBe(2);

    const reloaded = service();
    expect(reloaded.count('curated:Cinematic')).toBe(2);
    expect(reloaded.count('native:abc-123')).toBe(1);
  });

  it('keeps a preset and a published style of the same name apart', () => {
    const usage = service();
    usage.increment('curated:Anime');
    usage.increment('native:Anime');
    expect(usage.count('curated:Anime')).toBe(1);
    expect(usage.count('native:Anime')).toBe(1);
  });

  it('ignores blank style keys', () => {
    const usage = service();
    usage.increment('   ');
    expect(usage.usage()).toEqual({});
  });

  it('orders by count desc, then by name, and honours the limit', () => {
    const usage = service();
    usage.increment('curated:beta');
    usage.increment('curated:beta');
    usage.increment('curated:alpha');
    usage.increment('curated:alpha');
    usage.increment('curated:gamma');

    expect(usage.topStyles(3)).toEqual([
      { key: 'curated:alpha', count: 2 },
      { key: 'curated:beta', count: 2 },
      { key: 'curated:gamma', count: 1 },
    ]);
    expect(usage.topStyles(1)).toEqual([{ key: 'curated:alpha', count: 2 }]);
    expect(usage.topStyles(0)).toEqual([]);
  });

  it('drops malformed persisted counts', () => {
    localStorage.setItem(
      USAGE_KEY,
      JSON.stringify({
        'curated:good': 3,
        'curated:negative': -2,
        'curated:text': 'x',
        'curated:fractional': 1.7,
      }),
    );
    const usage = service();
    expect(usage.usage()).toEqual({
      'curated:good': 3,
      'curated:fractional': 1,
    });
  });

  it('reads counts stored under a bare name as preset counts', () => {
    localStorage.setItem(
      USAGE_KEY,
      JSON.stringify({ Cinematic: 3, 'native:abc-123': 2 }),
    );
    const usage = service();
    expect(usage.count('curated:Cinematic')).toBe(3);
    expect(usage.count('native:abc-123')).toBe(2);
  });
});
