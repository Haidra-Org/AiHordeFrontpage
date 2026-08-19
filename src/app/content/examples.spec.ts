import { describe, expect, it } from 'vitest';
import { exampleRunCost } from './examples';

describe('exampleRunCost', () => {
  it('rounds the time and carries the charge', () => {
    expect(
      exampleRunCost({ wall_time_seconds: 8.4, kudos_charged: 12.5 }),
    ).toEqual({ time: 8, kudos: 12.5 });
  });

  it('answers with no kudos for a run that was not charged', () => {
    expect(exampleRunCost({ wall_time_seconds: 30 })).toEqual({
      time: 30,
      kudos: null,
    });
  });

  it('answers with nothing for a run that was not timed', () => {
    expect(exampleRunCost({ kudos_charged: 12 })).toBeNull();
    expect(exampleRunCost(null)).toBeNull();
    expect(exampleRunCost(undefined)).toBeNull();
  });
});
