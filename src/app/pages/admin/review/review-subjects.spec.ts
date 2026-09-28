import {
  DecisionForm,
  FINDING_MIN_REPORTS,
  FINDING_MIN_SHARE,
  RULE_BOUNDS,
  SubjectRef,
  busiestRange,
  durationLabel,
  eventFilterOf,
  findingOf,
  hordeInstant,
  isNetwork,
  isWatching,
  parseSubjectKey,
  rangeInstants,
  reasonList,
  refusalKey,
  ruleMeter,
  rulesVerdict,
  subjectKey,
  subjectStateOf,
  timelineColumns,
  validateDecision,
  validateRules,
  watchUntilInstant,
} from './review-subjects';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ModerationRule,
  PromptModerationReason,
  SubjectDecision,
} from '../../../types/moderation';

const NOW = new Date(2026, 8, 26, 12, 0, 0);

const form = (patch: Partial<DecisionForm> = {}): DecisionForm => ({
  outcome: 'watching',
  note: '',
  watchUntil: '2026-10-10',
  watchMinCount: '',
  ...patch,
});

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

  it('round-trips every kind, colons included', () => {
    for (const ref of refs) {
      expect(parseSubjectKey(subjectKey(ref))).toEqual(ref);
    }
  });

  it('rejects keys that name nothing usable', () => {
    for (const value of [
      null,
      '',
      'account',
      'account:0',
      'account:abc',
      'proxied_account:7',
      'proxied_account:7:',
      'ip:',
      'worker:x',
    ]) {
      expect(parseSubjectKey(value)).toBeNull();
    }
  });

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

describe('validateDecision', () => {
  it('asks nothing more of a benign decision', () => {
    expect(
      validateDecision(form({ outcome: 'benign', watchUntil: '' }), NOW),
    ).toEqual([]);
  });

  it('requires a watch to have an end date', () => {
    expect(validateDecision(form({ watchUntil: '' }), NOW)).toEqual([
      'admin.review.reports.decision.error.watch_until_missing',
    ]);
  });

  it('requires the end date to be after today', () => {
    expect(validateDecision(form({ watchUntil: '2026-09-26' }), NOW)).toEqual([
      'admin.review.reports.decision.error.watch_until_past',
    ]);
    expect(validateDecision(form({ watchUntil: '2026-09-27' }), NOW)).toEqual(
      [],
    );
  });

  it('allows at most 90 days', () => {
    expect(validateDecision(form({ watchUntil: '2026-12-25' }), NOW)).toEqual(
      [],
    );
    expect(validateDecision(form({ watchUntil: '2026-12-26' }), NOW)).toEqual([
      'admin.review.reports.decision.error.watch_until_far',
    ]);
  });

  it('takes an empty threshold, and only a whole number of 1 or more otherwise', () => {
    expect(validateDecision(form({ watchMinCount: '3' }), NOW)).toEqual([]);
    for (const value of ['0', '-2', '1.5', 'x']) {
      expect(validateDecision(form({ watchMinCount: value }), NOW)).toEqual([
        'admin.review.reports.decision.error.watch_min_count',
      ]);
    }
  });

  it('refuses a note over the limit', () => {
    expect(
      validateDecision(
        form({ outcome: 'benign', note: 'x'.repeat(2001) }),
        NOW,
      ),
    ).toEqual(['admin.review.reports.decision.error.note_long']);
  });
});

describe('watchUntilInstant', () => {
  it('ends the watch at the end of the chosen day', () => {
    expect(new Date(watchUntilInstant('2026-10-10', NOW))).toEqual(
      new Date(2026, 9, 10, 23, 59, 59),
    );
  });

  it('never runs past the 90 days the horde allows', () => {
    const until = new Date(watchUntilInstant('2026-12-25', NOW));
    expect(until.getTime()).toBeLessThan(NOW.getTime() + 90 * 86_400_000);
  });
});

describe('isWatching', () => {
  const watching = (until: string | null): SubjectDecision =>
    ({ outcome: 'watching', watch_until: until }) as SubjectDecision;

  it('is true only for a watch that has not ended', () => {
    expect(isWatching(watching('2026-10-01T00:00:00+00:00'), NOW)).toBe(true);
    expect(isWatching(watching('2026-09-01T00:00:00+00:00'), NOW)).toBe(false);
    expect(isWatching(null, NOW)).toBe(false);
  });
});

describe('validateRules', () => {
  const rule = (
    window_seconds: number,
    min_count: number,
    reasons: PromptModerationReason[] = ['worker_csam'],
  ): ModerationRule => ({ window_seconds, min_count, reasons });

  it('accepts the bounds themselves', () => {
    expect(
      validateRules([
        rule(RULE_BOUNDS.minWindow, RULE_BOUNDS.minCount),
        rule(RULE_BOUNDS.maxWindow, RULE_BOUNDS.maxCount, [
          'worker_csam',
          'filter_rejection',
          'model_rejection',
        ]),
      ]),
    ).toEqual({ set: [], rules: [[], []] });
  });

  it('marks a window or count outside the bounds on its own rule', () => {
    expect(
      validateRules([
        rule(59, 1),
        rule(3600, 0),
        rule(3600, 1.5),
        rule(Number.NaN, 5),
      ]).rules,
    ).toEqual([
      ['admin.review.thresholds.error.window'],
      ['admin.review.thresholds.error.count'],
      ['admin.review.thresholds.error.count'],
      ['admin.review.thresholds.error.window'],
    ]);
  });

  it('needs one to three distinct reasons on each rule', () => {
    expect(
      validateRules([
        rule(3600, 5, []),
        rule(3600, 5, ['worker_csam', 'worker_csam']),
        rule(3600, 5, ['nonsense' as PromptModerationReason]),
      ]).rules,
    ).toEqual([
      ['admin.review.thresholds.error.reasons'],
      ['admin.review.thresholds.error.reasons'],
      ['admin.review.thresholds.error.reasons'],
    ]);
  });

  it('needs one to six rules', () => {
    expect(validateRules([]).set).toEqual([
      'admin.review.thresholds.error.too_few',
    ]);
    expect(
      validateRules(Array.from({ length: 7 }, () => rule(3600, 5))).set,
    ).toEqual(['admin.review.thresholds.error.too_many']);
  });
});

describe('refusalKey', () => {
  const refusal = (rc: string) =>
    new HttpErrorResponse({ status: 400, error: { message: 'no', rc } });

  it('names each moderation refusal plainly', () => {
    expect(refusalKey(refusal('InvalidModerationNote'), 'x')).toBe(
      'admin.review.refusal.note',
    );
    expect(refusalKey(refusal('InvalidModerationDecision'), 'x')).toBe(
      'admin.review.refusal.decision',
    );
    expect(refusalKey(refusal('ModerationSubjectNotFound'), 'x')).toBe(
      'admin.review.refusal.subject_not_found',
    );
    expect(refusalKey(refusal('InvalidModerationCriteria'), 'x')).toBe(
      'admin.review.refusal.criteria',
    );
    expect(refusalKey(refusal('InvalidModerationSettings'), 'x')).toBe(
      'admin.review.refusal.settings',
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

describe('reasonList', () => {
  it('names the reasons in page order, joined with or', () => {
    expect(
      reasonList(
        ['worker_csam', 'filter_rejection'],
        (key) => key.split('.').at(-1) ?? key,
        'en',
      ),
    ).toBe('filter_rejection or worker_csam');
  });
});

describe('IPv6 networks', () => {
  it('reads an IPv6 /64 subject from the address and knows it is a network', () => {
    const ref = parseSubjectKey('ip:2001:db8:1:2::/64');
    expect(ref?.ipaddr).toBe('2001:db8:1:2::/64');
    expect(isNetwork(ref?.ipaddr ?? null)).toBe(true);
    expect(isNetwork('203.0.113.7')).toBe(false);
    expect(eventFilterOf(ref!)).toEqual({ ipaddr: '2001:db8:1:2::/64' });
  });
});

describe('ruleMeter', () => {
  const rule = (count: number, min_count: number, exceeded: boolean) => ({
    window_seconds: 3600,
    reasons: ['worker_csam'] as PromptModerationReason[],
    min_count,
    count,
    exceeded,
  });

  it('takes the band from the horde and the words from the numbers', () => {
    expect(ruleMeter(rule(62, 50, true))).toEqual(
      expect.objectContaining({ state: 'over', verdict: 'over', gap: 12 }),
    );
    expect(ruleMeter(rule(50, 50, true))).toEqual(
      expect.objectContaining({ state: 'over', verdict: 'at', gap: 0 }),
    );
    expect(ruleMeter(rule(40, 50, false))).toEqual(
      expect.objectContaining({ state: 'near', verdict: 'under', gap: 10 }),
    );
    expect(ruleMeter(rule(39, 50, false)).state).toBe('under');
  });

  it('keeps the bar and the tick inside the track', () => {
    const over = ruleMeter(rule(200, 50, true));
    expect(over.fill).toBeLessThan(100);
    expect(over.tick).toBeCloseTo((50 / 220) * 100);
    const empty = ruleMeter(rule(0, 50, false));
    expect(empty.fill).toBe(0);
    expect(empty.tick).toBeLessThan(100);
  });
});

describe('findingOf', () => {
  const detail = (
    worker: number,
    workerTotal: number,
    model: { all: number; rejections: number } = { all: 0, rejections: 0 },
    rejections = 0,
  ) => ({
    count: workerTotal + rejections,
    counts_by_reason: { worker_csam: workerTotal, model_rejection: rejections },
    workers: {
      items: [
        { worker_id: 'w1', worker_name: 'garage', count: worker },
        { worker_id: 'w2', worker_name: null, count: 1 },
      ],
      total: 2,
    },
    models: {
      items: [
        {
          model: 'm',
          count: model.all,
          counts_by_reason: { model_rejection: model.rejections },
        },
      ],
      total: 1,
    },
  });

  it('names a worker at the share and count thresholds, not below either', () => {
    const total = Math.floor(FINDING_MIN_REPORTS / FINDING_MIN_SHARE);
    expect(findingOf(detail(FINDING_MIN_REPORTS, total))).toEqual({
      kind: 'worker',
      id: 'w1',
      name: 'garage',
      count: FINDING_MIN_REPORTS,
      total,
    });
    expect(findingOf(detail(FINDING_MIN_REPORTS, total + 1))).toBeNull();
    expect(
      findingOf(detail(FINDING_MIN_REPORTS - 1, FINDING_MIN_REPORTS - 1)),
    ).toBeNull();
  });

  it('judges a model only among the NSFW model check rejections', () => {
    expect(findingOf(detail(0, 0, { all: 30, rejections: 30 }, 40))).toEqual(
      expect.objectContaining({ kind: 'model', id: 'm', count: 30, total: 40 }),
    );
    expect(findingOf(detail(0, 0, { all: 30, rejections: 20 }, 40))).toBeNull();
  });

  it('says nothing of a popular model behind most worker reports', () => {
    expect(findingOf(detail(10, 100, { all: 90, rejections: 0 }))).toBeNull();
  });
});

describe('rulesVerdict', () => {
  const rule = (count: number, min_count: number) => ({
    window_seconds: 3600,
    reasons: ['worker_csam'] as PromptModerationReason[],
    min_count,
    count,
    exceeded: count >= min_count,
  });

  it('names the exceeded rule furthest past its threshold', () => {
    const verdict = rulesVerdict([rule(60, 50), rule(300, 200), rule(0, 40)]);
    expect(verdict.exceeded).toBe(2);
    expect(verdict.total).toBe(3);
    expect(verdict.lead?.count).toBe(300);
  });

  it('names none when every rule is under', () => {
    expect(rulesVerdict([rule(10, 50)])).toEqual({
      exceeded: 0,
      total: 1,
      lead: null,
    });
  });
});

describe('subjectStateOf', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  const watch = (watch_until: string): SubjectDecision =>
    ({
      outcome: 'watching',
      watch_until,
      watch_min_count: 80,
    }) as SubjectDecision;

  it('words a running and an ended watch', () => {
    expect(subjectStateOf(watch('2026-10-10T23:59:59+00:00'), now)).toEqual({
      outcome: 'watching',
      label: 'watching',
      until: new Date('2026-10-10T23:59:59Z'),
    });
    expect(subjectStateOf(watch('2026-09-01T00:00:00+00:00'), now)?.label).toBe(
      'watch_ended',
    );
  });

  it('words the other outcomes by name', () => {
    expect(
      subjectStateOf({ outcome: 'escalated' } as SubjectDecision, now),
    ).toEqual({ outcome: 'escalated', label: 'escalated', until: null });
    expect(subjectStateOf(null, now)).toBeNull();
  });
});

describe('timeline ranges', () => {
  const since = Date.UTC(2026, 8, 25, 22, 7);
  const bucket = (minutes: number, count: number) => ({
    start: new Date(Date.UTC(2026, 8, 25, 22) + minutes * 60_000)
      .toISOString()
      .replace('.000Z', '+00:00'),
    counts_by_reason: { worker_csam: count },
  });
  const columns = timelineColumns([
    bucket(0, 1),
    bucket(15, 5),
    bucket(30, 7),
    bucket(45, 2),
  ]);
  const window = {
    since: new Date(since).toISOString(),
    until: new Date(Date.UTC(2026, 8, 25, 22, 50)).toISOString(),
    bucket_seconds: 900,
  };

  it('clips the first and last bucket to the window', () => {
    expect(rangeInstants(window, columns, { from: 0, to: 3 })).toEqual({
      since: new Date(since),
      until: new Date(Date.UTC(2026, 8, 25, 22, 50)),
    });
    expect(rangeInstants(window, columns, { from: 1, to: 2 })).toEqual({
      since: new Date(Date.UTC(2026, 8, 25, 22, 15)),
      until: new Date(Date.UTC(2026, 8, 25, 22, 45)),
    });
  });

  it('finds the busiest span, however many buckets it takes', () => {
    expect(busiestRange(columns, 900, 1800)).toEqual({ from: 1, to: 2 });
    expect(busiestRange(columns, 900, 86_400)).toEqual({ from: 0, to: 3 });
    expect(busiestRange([], 900)).toBeNull();
  });

  it('writes an instant with an explicit zone', () => {
    expect(hordeInstant(new Date(Date.UTC(2026, 8, 25, 22, 15)))).toBe(
      '2026-09-25T22:15:00+00:00',
    );
  });
});
