import { parseHordeTime } from './horde-time';

describe('parseHordeTime', () => {
  it('reads a time without a zone as UTC', () => {
    expect(parseHordeTime('2026-09-27T01:55:37.171139')?.toISOString()).toBe(
      '2026-09-27T01:55:37.171Z',
    );
    expect(parseHordeTime('2026-09-27T01:55:37')?.toISOString()).toBe(
      '2026-09-27T01:55:37.000Z',
    );
  });

  it('keeps a Z suffix', () => {
    expect(parseHordeTime('2026-09-27T01:55:37Z')?.toISOString()).toBe(
      '2026-09-27T01:55:37.000Z',
    );
  });

  it('applies an offset suffix', () => {
    expect(parseHordeTime('2026-09-27T03:55:37+02:00')?.toISOString()).toBe(
      '2026-09-27T01:55:37.000Z',
    );
    expect(parseHordeTime('2026-09-26T20:55:37.5-05:00')?.toISOString()).toBe(
      '2026-09-27T01:55:37.500Z',
    );
  });

  it('keeps the zone of an RFC 1123 time', () => {
    expect(
      parseHordeTime('Sun, 27 Sep 2026 01:55:36 -0000')?.toISOString(),
    ).toBe('2026-09-27T01:55:36.000Z');
  });

  it('gives null for a missing or unreadable time', () => {
    expect(parseHordeTime(null)).toBeNull();
    expect(parseHordeTime(undefined)).toBeNull();
    expect(parseHordeTime('')).toBeNull();
    expect(parseHordeTime('not a time')).toBeNull();
  });
});
