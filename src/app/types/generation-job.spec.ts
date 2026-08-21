import { describe, expect, it } from 'vitest';
import {
  LocalGenerationJob,
  LocalGenerationJobStatus,
  sessionStatsToday,
} from './generation-job';

/** Noon today, so a test can step backwards without crossing midnight. */
const NOW = new Date();
NOW.setHours(12, 0, 0, 0);
const NOON = NOW.getTime();
const HOUR = 60 * 60 * 1000;

function job(
  overrides: Partial<LocalGenerationJob> & {
    status?: LocalGenerationJobStatus;
  } = {},
): LocalGenerationJob {
  return {
    localId: 'a',
    status: 'done',
    createdAt: NOON - HOUR,
    updatedAt: NOON - HOUR + 20_000,
    request: { prompt: 'a fox' },
    resultImageIds: ['one'],
    kudos: 12,
    ...overrides,
  };
}

describe('sessionStatsToday', () => {
  it('is empty with nothing to count', () => {
    expect(sessionStatsToday([], NOON)).toEqual({
      images: 0,
      kudos: 0,
      averageWaitSeconds: null,
    });
  });

  it('counts every picture that came back, not every job', () => {
    const stats = sessionStatsToday(
      [job({ resultImageIds: ['a', 'b', 'c'] }), job({ localId: 'b' })],
      NOON,
    );
    expect(stats.images).toBe(4);
  });

  it('adds up what the horde charged', () => {
    const stats = sessionStatsToday(
      [job({ kudos: 12.4 }), job({ localId: 'b', kudos: 30.1 })],
      NOON,
    );
    expect(stats.kudos).toBe(43);
  });

  it('averages the wait from asking to arriving', () => {
    const stats = sessionStatsToday(
      [
        job({ createdAt: NOON - HOUR, updatedAt: NOON - HOUR + 10_000 }),
        job({
          localId: 'b',
          createdAt: NOON - HOUR,
          updatedAt: NOON - HOUR + 30_000,
        }),
      ],
      NOON,
    );
    expect(stats.averageWaitSeconds).toBe(20);
  });

  it('leaves out work from before midnight', () => {
    const stats = sessionStatsToday(
      [job({ createdAt: NOON - 24 * HOUR })],
      NOON,
    );
    expect(stats).toEqual({ images: 0, kudos: 0, averageWaitSeconds: null });
  });

  it('counts only work that finished', () => {
    const stats = sessionStatsToday(
      [
        job({ status: 'queued' }),
        job({ localId: 'b', status: 'error' }),
        job({ localId: 'c', status: 'cancelled' }),
      ],
      NOON,
    );
    expect(stats.images).toBe(0);
  });

  it('tolerates a job that recorded no charge', () => {
    const stats = sessionStatsToday([job({ kudos: undefined })], NOON);
    expect(stats.kudos).toBe(0);
    expect(stats.images).toBe(1);
  });
});
