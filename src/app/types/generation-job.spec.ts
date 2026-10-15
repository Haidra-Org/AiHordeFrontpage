import { describe, expect, it } from 'vitest';
import {
  LocalGenerationJob,
  LocalGenerationJobStatus,
  isJobHidden,
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

  it('uses completion time when a finished job was edited later', () => {
    const done = job({ completedAt: NOON - HOUR + 10_000, updatedAt: NOON });
    expect(sessionStatsToday([done], NOON).averageWaitSeconds).toBe(10);
    expect(
      sessionStatsToday([{ ...done, updatedAt: NOON + HOUR }], NOON)
        .averageWaitSeconds,
    ).toBe(10);
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

describe('isJobHidden', () => {
  const SINCE = 5_000;
  const taken = {
    adopted: true as const,
    createdAt: 1_000,
  };

  it('holds back a job taken in before the horde read requests back', () => {
    expect(isJobHidden(taken, SINCE)).toBe(true);
    expect(isJobHidden({ ...taken, requestRecovery: 'failed' }, SINCE)).toBe(
      true,
    );
    expect(isJobHidden({ ...taken, requestRecovery: 'pending' }, SINCE)).toBe(
      true,
    );
  });

  it('holds back nothing while the moment is unknown', () => {
    expect(isJobHidden(taken, null)).toBe(false);
  });

  it('shows a job taken in at or after the moment', () => {
    expect(isJobHidden({ ...taken, createdAt: SINCE }, SINCE)).toBe(false);
  });

  it('shows a job whose own read-back reached the endpoint', () => {
    for (const outcome of ['full', 'settings', 'refused'] as const) {
      expect(isJobHidden({ ...taken, requestRecovery: outcome }, SINCE)).toBe(
        false,
      );
    }
  });

  it('shows a job the reader kept, and every job made here', () => {
    expect(isJobHidden({ ...taken, keptByReader: true }, SINCE)).toBe(false);
    expect(isJobHidden({ createdAt: 1_000 }, SINCE)).toBe(false);
  });
});
