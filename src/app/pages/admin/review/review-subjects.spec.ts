import {
  SubjectRef,
  durationLabel,
  eventFilterOf,
  hordeInstant,
  refusalKey,
} from './review-subjects';
import { HttpErrorResponse } from '@angular/common/http';

describe('subject keys', () => {
  const refs: SubjectRef[] = [
    { kind: 'account', user_id: 7, proxied_account: null, ipaddr: null },
    {
      kind: 'proxied_account',
      user_id: 7,
      proxied_account: 'discord:123:abc',
      ipaddr: null,
    },
    { kind: 'ip', user_id: null, proxied_account: null, ipaddr: '::1' },
  ];

  it('selects the events of a subject by its own identity fields', () => {
    expect(eventFilterOf(refs[0])).toEqual({ user_id: 7 });
    expect(eventFilterOf(refs[1])).toEqual({
      user_id: 7,
      proxied_account: 'discord:123:abc',
    });
    expect(eventFilterOf(refs[2])).toEqual({ ipaddr: '::1' });
  });
});

describe('durationLabel', () => {
  it('reads a window in its largest whole unit', () => {
    expect(durationLabel(3600)).toEqual({
      key: 'admin.review.duration.hour_one',
      count: 1,
    });
    expect(durationLabel(2_592_000)).toEqual({
      key: 'admin.review.duration.day_other',
      count: 30,
    });
    expect(durationLabel(5400)).toEqual({
      key: 'admin.review.duration.minute_other',
      count: 90,
    });
    expect(durationLabel(45)).toEqual({
      key: 'admin.review.duration.second_other',
      count: 45,
    });
  });
});

describe('refusalKey', () => {
  const refusal = (rc: string) =>
    new HttpErrorResponse({ status: 400, error: { message: 'no', rc } });

  it('names each moderation refusal plainly', () => {
    expect(refusalKey(refusal('InvalidModerationNote'), 'x')).toBe(
      'admin.review.refusal.note',
    );
    expect(refusalKey(refusal('InvalidSuspicionID'), 'x')).toBe(
      'admin.review.refusal.suspicion_id',
    );
  });

  it('falls back for anything else', () => {
    expect(refusalKey(refusal('SomethingElse'), 'fallback')).toBe('fallback');
    expect(refusalKey(new HttpErrorResponse({ status: 0 }), 'fallback')).toBe(
      'fallback',
    );
  });
});

describe('timeline ranges', () => {
  it('writes an instant with an explicit zone', () => {
    expect(hordeInstant(new Date(Date.UTC(2026, 8, 25, 22, 15)))).toBe(
      '2026-09-25T22:15:00+00:00',
    );
  });
});
