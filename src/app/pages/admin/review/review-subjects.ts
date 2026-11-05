import { extractApiErrorField } from '../../../helper/extract-api-error';
import { parseHordeTime } from '../../../helper/horde-time';
import {
  ModerationRule,
  ModerationRuleCount,
  ModerationSubject,
  ModerationSubjectDetail,
  ModerationSubjectKind,
  ModerationTimelineBucket,
  PromptModerationEventQuery,
  PromptModerationReason,
  SubjectDecision,
  SubjectDecisionOutcome,
  SubjectIdentity,
} from '../../../types/moderation';

export const SUBJECT_KINDS: readonly ModerationSubjectKind[] = [
  'account',
  'proxied_account',
  'ip',
];

export const PROMPT_REASONS: readonly PromptModerationReason[] = [
  'filter_rejection',
  'model_rejection',
  'worker_csam',
];

/** The outcomes a moderator picks in the decision dialog. `actioned` is recorded by an action instead. */
export const DIALOG_OUTCOMES: readonly Exclude<
  SubjectDecisionOutcome,
  'actioned'
>[] = ['benign', 'watching', 'escalated'];

/** The horde keeps a decision note of at most this many characters. */
export const DECISION_NOTE_LIMIT = 2000;

/** The horde keeps an event note of at most this many characters. */
export const EVENT_NOTE_LIMIT = 2000;

/** The longest a watching decision may last, in days. */
export const WATCH_MAX_DAYS = 90;

/** The hours an address timeout accepts, as the operations endpoint bounds them. */
export const IP_TIMEOUT_HOURS = { min: 1, max: 720 } as const;

/** The bounds the horde validates alert settings against. */
export const RULE_BOUNDS = {
  minRules: 1,
  maxRules: 6,
  minWindow: 60,
  maxWindow: 2_592_000,
  minCount: 1,
  maxCount: 100_000,
  minReasons: 1,
  maxReasons: 3,
} as const;

/** What a subject's detail tells its list after a decision was stored. */
export interface SubjectDecided {
  decision: SubjectDecision;
  /** Open the next one in the list, as after a decision that closes the review. */
  advance: boolean;
}

/** Which account, proxied account or address a set of reports is about. */
export interface SubjectRef {
  kind: ModerationSubjectKind;
  user_id: number | null;
  proxied_account: string | null;
  ipaddr: string | null;
}

export function subjectRefOf(
  subject: ModerationSubject | SubjectDecision,
): SubjectRef {
  return {
    kind: 'kind' in subject ? subject.kind : subject.subject_kind,
    user_id: subject.user_id,
    proxied_account: subject.proxied_account,
    ipaddr: subject.ipaddr,
  };
}

/**
 * A subject as one string, for the address and for tracking rows. The kind
 * comes first; a proxied account's name and an address may hold colons, so
 * each is the last part.
 */
export function subjectKey(ref: SubjectRef): string {
  switch (ref.kind) {
    case 'account':
      return `account:${ref.user_id}`;
    case 'proxied_account':
      return `proxied_account:${ref.user_id}:${ref.proxied_account}`;
    case 'ip':
      return `ip:${ref.ipaddr}`;
  }
}

/** Read a subject key back, or null for one that names nothing usable. */
export function parseSubjectKey(value: string | null): SubjectRef | null {
  if (!value) return null;
  const split = value.indexOf(':');
  if (split < 0) return null;
  const kind = value.slice(0, split);
  const rest = value.slice(split + 1);
  if (kind === 'account') {
    const userId = positiveInt(rest);
    return userId === null
      ? null
      : { kind, user_id: userId, proxied_account: null, ipaddr: null };
  }
  if (kind === 'proxied_account') {
    const inner = rest.indexOf(':');
    if (inner < 0) return null;
    const userId = positiveInt(rest.slice(0, inner));
    const name = rest.slice(inner + 1);
    return userId === null || !name
      ? null
      : { kind, user_id: userId, proxied_account: name, ipaddr: null };
  }
  if (kind === 'ip' && rest) {
    return { kind, user_id: null, proxied_account: null, ipaddr: rest };
  }
  return null;
}

/** The identity fields the horde reads for a subject's kind, for decisions. */
export function identityOf(ref: SubjectRef): SubjectIdentity {
  switch (ref.kind) {
    case 'account':
      return { user_id: ref.user_id ?? undefined };
    case 'proxied_account':
      return {
        user_id: ref.user_id ?? undefined,
        proxied_account: ref.proxied_account ?? undefined,
      };
    case 'ip':
      return { ipaddr: ref.ipaddr ?? undefined };
  }
}

/** The prompt log filters that select a subject's events. */
export function eventFilterOf(ref: SubjectRef): PromptModerationEventQuery {
  const identity = identityOf(ref);
  return Object.fromEntries(
    Object.entries(identity).filter(([, value]) => value !== undefined),
  );
}

/** A length of time as a translation key and the count it takes. */
export interface DurationLabel {
  key: string;
  count: number;
}

/**
 * A number of seconds in the largest whole unit that divides it, so a rule
 * reads as "1 hour" or "30 days" rather than a count of seconds.
 */
export function durationLabel(seconds: number): DurationLabel {
  const units: [number, string][] = [
    [86_400, 'day'],
    [3_600, 'hour'],
    [60, 'minute'],
  ];
  for (const [size, unit] of units) {
    if (seconds >= size && seconds % size === 0) {
      const count = seconds / size;
      return { key: pluralKey(`admin.review.duration.${unit}`, count), count };
    }
  }
  return {
    key: pluralKey('admin.review.duration.second', seconds),
    count: seconds,
  };
}

/** The `_one` or `_other` form of a key for a count. */
export function pluralKey(stem: string, count: number): string {
  return `${stem}_${count === 1 ? 'one' : 'other'}`;
}

/** Whether a decision's watch is still running at `now`. */
export function isWatching(
  decision: SubjectDecision | null,
  now: Date,
): boolean {
  if (decision?.outcome !== 'watching' || !decision.watch_until) return false;
  const until = new Date(decision.watch_until);
  return !Number.isNaN(until.getTime()) && until > now;
}

/** What the decision dialog holds while it is open. */
export interface DecisionForm {
  outcome: Exclude<SubjectDecisionOutcome, 'actioned'>;
  note: string;
  /** A date as a date input gives it, `YYYY-MM-DD`, in local time. */
  watchUntil: string;
  /** Empty when the subject keeps the configured thresholds. */
  watchMinCount: string;
}

/** A problem with the decision form, as a translation key. */
export type DecisionProblem =
  | 'admin.review.reports.decision.error.watch_until_missing'
  | 'admin.review.reports.decision.error.watch_until_past'
  | 'admin.review.reports.decision.error.watch_until_far'
  | 'admin.review.reports.decision.error.watch_min_count'
  | 'admin.review.reports.decision.error.note_long';

/** The last day a watch may end on, counted from `now`, as `YYYY-MM-DD`. */
export function latestWatchDate(now: Date): string {
  const last = new Date(now);
  last.setDate(last.getDate() + WATCH_MAX_DAYS);
  return localDate(last);
}

/** The day after `now`, the first a watch may end on, as `YYYY-MM-DD`. */
export function earliestWatchDate(now: Date): string {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  return localDate(next);
}

/** What stops the form from being sent; empty when it can be. */
export function validateDecision(
  form: DecisionForm,
  now: Date,
): DecisionProblem[] {
  const problems: DecisionProblem[] = [];
  if (form.note.length > DECISION_NOTE_LIMIT) {
    problems.push('admin.review.reports.decision.error.note_long');
  }
  if (form.outcome !== 'watching') return problems;
  if (!/^\d{4}-\d\d-\d\d$/.test(form.watchUntil)) {
    problems.push('admin.review.reports.decision.error.watch_until_missing');
  } else if (form.watchUntil < earliestWatchDate(now)) {
    problems.push('admin.review.reports.decision.error.watch_until_past');
  } else if (form.watchUntil > latestWatchDate(now)) {
    problems.push('admin.review.reports.decision.error.watch_until_far');
  }
  if (form.watchMinCount.trim() && positiveInt(form.watchMinCount) === null) {
    problems.push('admin.review.reports.decision.error.watch_min_count');
  }
  return problems;
}

/**
 * When a watch chosen as a date ends: the end of that day in local time,
 * but never later than the horde's limit from `now`, so the last allowed day
 * is not refused for running a few hours past it.
 */
export function watchUntilInstant(date: string, now: Date): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59);
  const limit = new Date(
    now.getTime() + WATCH_MAX_DAYS * 86_400_000 - 5 * 60_000,
  );
  return (endOfDay < limit ? endOfDay : limit).toISOString();
}

/** A problem with the alert settings, as a translation key. */
export type RuleProblem =
  | 'admin.review.thresholds.error.too_few'
  | 'admin.review.thresholds.error.too_many'
  | 'admin.review.thresholds.error.window'
  | 'admin.review.thresholds.error.count'
  | 'admin.review.thresholds.error.reasons';

/** One rule's problems by its position, and those of the whole set. */
export interface RuleValidation {
  rules: RuleProblem[][];
  set: RuleProblem[];
}

/** Check alert settings against the bounds the horde applies. */
export function validateRules(
  rules: readonly ModerationRule[],
): RuleValidation {
  const set: RuleProblem[] = [];
  if (rules.length < RULE_BOUNDS.minRules) {
    set.push('admin.review.thresholds.error.too_few');
  }
  if (rules.length > RULE_BOUNDS.maxRules) {
    set.push('admin.review.thresholds.error.too_many');
  }
  return {
    set,
    rules: rules.map((rule) => {
      const problems: RuleProblem[] = [];
      if (
        !Number.isInteger(rule.window_seconds) ||
        rule.window_seconds < RULE_BOUNDS.minWindow ||
        rule.window_seconds > RULE_BOUNDS.maxWindow
      ) {
        problems.push('admin.review.thresholds.error.window');
      }
      if (
        !Number.isInteger(rule.min_count) ||
        rule.min_count < RULE_BOUNDS.minCount ||
        rule.min_count > RULE_BOUNDS.maxCount
      ) {
        problems.push('admin.review.thresholds.error.count');
      }
      const distinct = new Set(rule.reasons);
      if (
        distinct.size !== rule.reasons.length ||
        distinct.size < RULE_BOUNDS.minReasons ||
        distinct.size > RULE_BOUNDS.maxReasons ||
        rule.reasons.some((reason) => !PROMPT_REASONS.includes(reason))
      ) {
        problems.push('admin.review.thresholds.error.reasons');
      }
      return problems;
    }),
  };
}

/**
 * The moderation refusals a moderator can meet from this page, each with a
 * message that says what to do. The horde's own message stays in the
 * toast's details.
 */
const REFUSALS: Readonly<Record<string, string>> = {
  InvalidModerationNote: 'admin.review.refusal.note',
  InvalidModerationHold: 'admin.review.refusal.hold',
  ModerationEventNotFound: 'admin.review.refusal.event_not_found',
  InvalidModerationDecision: 'admin.review.refusal.decision',
  InvalidModerationReason: 'admin.review.refusal.reason',
  ModerationSubjectNotFound: 'admin.review.refusal.subject_not_found',
  InvalidModerationCriteria: 'admin.review.refusal.criteria',
  InvalidModerationSettings: 'admin.review.refusal.settings',
  InvalidSuspicionID: 'admin.review.refusal.suspicion_id',
  InvalidModerationEventID: 'admin.review.refusal.event_id',
  InvalidModerationAddressFilter: 'admin.review.refusal.address_filter',
};

/** The message for a failed moderation request: a known refusal's, else `fallback`. */
export function refusalKey(error: unknown, fallback: string): string {
  const rc = extractApiErrorField(error, 'rc');
  return (rc !== undefined ? REFUSALS[rc] : undefined) ?? fallback;
}

/**
 * The reasons a rule counts, named and joined with "or" in the language
 * shown, in the order the page lists reasons everywhere else.
 */
export function reasonList(
  reasons: readonly PromptModerationReason[],
  translate: (key: string) => string,
  lang: string,
): string {
  const names = PROMPT_REASONS.filter((reason) => reasons.includes(reason)).map(
    (reason) => translate(`admin.review.reason.${reason}`),
  );
  return new Intl.ListFormat(lang, { type: 'disjunction' }).format(names);
}

/**
 * Whether an address is a network rather than one address. The horde keys
 * IPv6 reports by their /64, so one IPv6 subject covers every address in it.
 */
export function isNetwork(ipaddr: string | null): boolean {
  return ipaddr?.includes('/') ?? false;
}

export function positiveInt(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function localDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Reasons from the most severe down; the timeline stacks them from the base up in this order. */
export const SEVERITY_ORDER: readonly PromptModerationReason[] = [
  'worker_csam',
  'model_rejection',
  'filter_rejection',
];

/**
 * A finding line is shown only when one worker, or one model, accounts for
 * at least this share of that kind of report in the window. Below it the
 * reports are spread too widely for one source to stand out.
 */
export const FINDING_MIN_SHARE = 0.6;

/**
 * A finding line also needs at least this many reports from the one
 * source, so a handful of reports that happen to share a worker never
 * reads as a pattern.
 */
export const FINDING_MIN_REPORTS = 20;

/** One worker or one model that accounts for most of a kind of report. */
export interface Finding {
  kind: 'worker' | 'model';
  /** The worker's id, or the model's name. */
  id: string;
  /** The worker's name when it still exists, else its id; the model's name. */
  name: string;
  count: number;
  /** Worker reports for a worker; NSFW model check rejections for a model. */
  total: number;
}

/**
 * The one observation worth a line above the evidence, if any: a worker
 * behind most of the worker reports, else a model behind most of the NSFW
 * model check rejections. Only worker reports carry a worker, so a
 * worker's share is of those alone. A popular model behind most worker
 * reports says nothing about the model, so a model is judged only among
 * the rejections the model check itself made.
 */
export function findingOf(
  detail: Pick<
    ModerationSubjectDetail,
    'workers' | 'models' | 'count' | 'counts_by_reason'
  >,
): Finding | null {
  const qualifies = (count: number, total: number): boolean =>
    total > 0 &&
    count >= FINDING_MIN_REPORTS &&
    count / total >= FINDING_MIN_SHARE;
  const worker = topByCount(detail.workers.items);
  const workerTotal = detail.counts_by_reason.worker_csam ?? 0;
  if (worker && qualifies(worker.count, workerTotal)) {
    return {
      kind: 'worker',
      id: worker.worker_id,
      name: worker.worker_name ?? worker.worker_id,
      count: worker.count,
      total: workerTotal,
    };
  }
  const rejections = detail.counts_by_reason.model_rejection ?? 0;
  const model = topByCount(
    detail.models.items.map((item) => ({
      model: item.model,
      count: item.counts_by_reason.model_rejection ?? 0,
    })),
  );
  if (model && qualifies(model.count, rejections)) {
    return {
      kind: 'model',
      id: model.model,
      name: model.model,
      count: model.count,
      total: rejections,
    };
  }
  return null;
}

function topByCount<T extends { count: number }>(
  items: readonly T[],
): T | null {
  let top: T | null = null;
  for (const item of items) {
    if (top === null || item.count > top.count) top = item;
  }
  return top;
}

/** A count at or above this share of its threshold reads as near the rule. */
export const METER_NEAR_SHARE = 0.8;

/** Where a count stands against its rule, as the meter draws and words it. */
export interface RuleMeter {
  rule: ModerationRuleCount;
  /** The colour band: over (the horde counts it exceeded), near, or under. */
  state: 'over' | 'near' | 'under';
  /** The words: above, at, or below the threshold. */
  verdict: 'over' | 'at' | 'under';
  /** How far the count is from the threshold. */
  gap: number;
  /** The bar's length and the threshold tick's place, as percentages of the track. */
  fill: number;
  tick: number;
}

export function ruleMeter(rule: ModerationRuleCount): RuleMeter {
  const state = rule.exceeded
    ? 'over'
    : rule.count >= rule.min_count * METER_NEAR_SHARE
      ? 'near'
      : 'under';
  const verdict =
    rule.count > rule.min_count
      ? 'over'
      : rule.count === rule.min_count
        ? 'at'
        : 'under';
  // Headroom past the larger of the two, so neither end sits on the edge.
  const scale = Math.max(rule.count, rule.min_count, 1) * 1.1;
  return {
    rule,
    state,
    verdict,
    gap: Math.abs(rule.count - rule.min_count),
    fill: (rule.count / scale) * 100,
    tick: (rule.min_count / scale) * 100,
  };
}

/** What the head says about the rules: how many are exceeded, and the one to name. */
export interface RulesVerdict {
  exceeded: number;
  total: number;
  /** The exceeded rule furthest past its threshold; null when none is exceeded. */
  lead: ModerationRuleCount | null;
}

export function rulesVerdict(
  rules: readonly ModerationRuleCount[],
): RulesVerdict {
  const over = rules.filter((rule) => rule.exceeded);
  const lead = over.reduce<ModerationRuleCount | null>(
    (best, rule) =>
      best === null ||
      rule.count / Math.max(1, rule.min_count) >
        best.count / Math.max(1, best.min_count)
        ? rule
        : best,
    null,
  );
  return { exceeded: over.length, total: rules.length, lead };
}

/** How a subject's state is worded: the outcome, or whether a watch still runs. */
export type SubjectStateLabel =
  Exclude<SubjectDecisionOutcome, 'watching'> | 'watching' | 'watch_ended';

/** A subject's state for its chip: the outcome's colour and icon, and its words. */
export interface SubjectState {
  outcome: SubjectDecisionOutcome;
  label: SubjectStateLabel;
  /** When a watch ends or ended; null for the other outcomes. */
  until: Date | null;
}

/** The state a subject's latest decision leaves it in. */
export function subjectStateOf(
  decision: SubjectDecision | null,
  now: Date,
): SubjectState | null {
  if (!decision) return null;
  if (decision.outcome !== 'watching') {
    return { outcome: decision.outcome, label: decision.outcome, until: null };
  }
  const until = parseHordeTime(decision.watch_until);
  return {
    outcome: 'watching',
    label: !until || until <= now ? 'watch_ended' : 'watching',
    until,
  };
}

/** The icon each outcome's chip carries beside its words. */
export const OUTCOME_ICONS: Readonly<Record<SubjectDecisionOutcome, string>> = {
  benign: 'check-circle',
  actioned: 'check',
  watching: 'clock',
  escalated: 'warning-triangle',
};

/** One column of the timeline, its segments most severe first. */
export interface TimelineColumn {
  index: number;
  start: Date;
  total: number;
  segments: { reason: PromptModerationReason; count: number }[];
}

export function timelineColumns(
  timeline: readonly ModerationTimelineBucket[],
): TimelineColumn[] {
  return timeline.map((bucket, index) => {
    const segments = SEVERITY_ORDER.map((reason) => ({
      reason,
      count: bucket.counts_by_reason[reason] ?? 0,
    })).filter((segment) => segment.count > 0);
    return {
      index,
      start: parseHordeTime(bucket.start) ?? new Date(0),
      total: segments.reduce((sum, segment) => sum + segment.count, 0),
      segments,
    };
  });
}

/** A run of timeline buckets, both ends included. */
export interface BucketRange {
  from: number;
  to: number;
}

export function bucketRange(a: number, b: number): BucketRange {
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

/**
 * The instants a run of buckets covers, clipped to the window: the first
 * bucket can start before the window and the last end after it, since the
 * horde aligns buckets to the epoch.
 */
export function rangeInstants(
  detail: Pick<ModerationSubjectDetail, 'since' | 'until' | 'bucket_seconds'>,
  columns: readonly TimelineColumn[],
  range: BucketRange,
): { since: Date; until: Date } | null {
  const first = columns[range.from];
  const last = columns[range.to];
  const windowSince = parseHordeTime(detail.since);
  const windowUntil = parseHordeTime(detail.until);
  if (!first || !last || !windowSince || !windowUntil) return null;
  const end = last.start.getTime() + detail.bucket_seconds * 1000;
  return {
    since: new Date(Math.max(first.start.getTime(), windowSince.getTime())),
    until: new Date(Math.min(end, windowUntil.getTime())),
  };
}

/** The span the busiest-range control selects, in seconds. */
export const BUSIEST_SPAN_SECONDS = 7_200;

/**
 * The run of buckets covering `spanSeconds` with the most reports, earliest
 * first on a tie; null on an empty timeline.
 */
export function busiestRange(
  columns: readonly TimelineColumn[],
  bucketSeconds: number,
  spanSeconds = BUSIEST_SPAN_SECONDS,
): BucketRange | null {
  if (!columns.length) return null;
  const span = Math.min(
    columns.length,
    Math.max(1, Math.round(spanSeconds / Math.max(1, bucketSeconds))),
  );
  let best = -1;
  let at = 0;
  for (let start = 0; start + span <= columns.length; start++) {
    let total = 0;
    for (let index = start; index < start + span; index++) {
      total += columns[index]?.total ?? 0;
    }
    if (total > best) {
      best = total;
      at = start;
    }
  }
  return { from: at, to: at + span - 1 };
}

/** An instant as the horde's time bounds take it, with an explicit zone. */
export function hordeInstant(date: Date): string {
  return date.toISOString().replace(/(\.\d{3})?Z$/, '+00:00');
}

/** A brushed range once it has settled: the instants the page is narrowed to. */
export interface SettledRange {
  since: Date;
  until: Date;
}

/** Waits this long after a brush is released before reading its range. */
export const RANGE_SETTLE_MS = 400;

/** The address parameters that open a subject in the review list. */
export function caseParams(ref: SubjectRef): { open: string } {
  return { open: subjectKey(ref) };
}

/** The address parameters that open a worker's page in the review. */
export function workerParams(workerId: string): {
  tab: 'reports';
  view: 'workers';
  worker: string;
  open: null;
} {
  return { tab: 'reports', view: 'workers', worker: workerId, open: null };
}
