import { ParamMap, Params } from '@angular/router';
import {
  ModerationSubjectKind,
  ModerationSubjectQuery,
  PromptModerationEventQuery,
  PromptModerationReason,
} from '../../../types/moderation';
import {
  PROMPT_REASONS,
  SUBJECT_KINDS,
  SubjectRef,
  hordeInstant,
  parseSubjectKey,
  positiveInt,
  subjectKey,
} from './review-subjects';

/** The queues the review page shows, as the `tab` query parameter names them. */
export type ReviewTab = 'reports' | 'prompts' | 'promotions' | 'paused';

export const REVIEW_TABS: readonly ReviewTab[] = [
  'reports',
  'prompts',
  'promotions',
  'paused',
];

/**
 * What the Reports tab shows. The first three are lists beside a detail:
 * those over the criteria, those being watched, and those escalated. The
 * other two are the worker reports later marked benign, and the alert
 * settings; each is read only when it is chosen.
 */
export type ReportsView =
  | 'over'
  | 'watching'
  | 'escalated'
  | 'workers'
  | 'false_positives'
  | 'thresholds';

export const REPORTS_VIEWS: readonly ReportsView[] = [
  'over',
  'watching',
  'escalated',
  'workers',
  'false_positives',
  'thresholds',
];

/** The views drawn as a list beside a detail. */
export const LIST_VIEWS: readonly ReportsView[] = [
  'over',
  'watching',
  'escalated',
];

/** The windows a custom search offers, in seconds. */
export const WINDOW_CHOICES: readonly number[] = [
  3_600, 21_600, 86_400, 604_800, 2_592_000,
];

/** What a custom search starts from when the address names only part of it. */
export const CUSTOM_DEFAULTS = { window: 86_400, minCount: 1 } as const;

/**
 * What the subject list asks for. With `window` null it asks for those over
 * the configured alert rules, and sends no window, count or reasons.
 */
export interface ReportCriteria {
  window: number | null;
  minCount: number | null;
  /** Empty for every reason. */
  reasons: PromptModerationReason[];
  /** Count only reports after the latest decision on each. */
  sinceReview: boolean;
}

export const DEFAULT_CRITERIA: ReportCriteria = {
  window: null,
  minCount: null,
  reasons: [],
  sinceReview: true,
};

export interface ReportsState {
  view: ReportsView;
  kind: ModerationSubjectKind;
  criteria: ReportCriteria;
  /** The subject whose detail is open. */
  open: SubjectRef | null;
  /** The worker open in the reporting-workers view. */
  worker: string | null;
}

export const DEFAULT_REPORTS: ReportsState = {
  view: 'over',
  kind: 'account',
  criteria: DEFAULT_CRITERIA,
  open: null,
  worker: null,
};

/** Who the Prompts tab narrows the log to; each set filter must match. */
export interface PromptFilter {
  user_id: number | null;
  proxied_account: string | null;
  ipaddr: string | null;
  worker_id: string | null;
}

export const NO_PROMPT_FILTER: PromptFilter = {
  user_id: null,
  proxied_account: null,
  ipaddr: null,
  worker_id: null,
};

/**
 * How far back the Prompts tab reads. `any` sends no bound: the horde keeps
 * reports for 30 days, so that is everything it has.
 */
export type PromptPeriod = 'any' | 'day' | 'week';

export const PROMPT_PERIODS: readonly PromptPeriod[] = ['any', 'day', 'week'];

export const PROMPT_PERIOD_SECONDS: Readonly<
  Record<Exclude<PromptPeriod, 'any'>, number>
> = { day: 86_400, week: 604_800 };

/** What the Prompts tab shows, as its address carries it. */
export interface PromptsState extends PromptFilter {
  period: PromptPeriod;
  /**
   * A range a link named, in place of the period. Either end may be open.
   */
  since: Date | null;
  until: Date | null;
  /** The reasons shown; every reason unless the address narrows them. */
  reasons: readonly PromptModerationReason[];
}

export const DEFAULT_PROMPTS: PromptsState = {
  ...NO_PROMPT_FILTER,
  period: 'any',
  since: null,
  until: null,
  reasons: PROMPT_REASONS,
};

export interface ReviewQuery {
  /** The tab the address names, or null when it names none or an unknown one. */
  tab: ReviewTab | null;
  reports: ReportsState;
  prompts: PromptsState;
}

/**
 * Read the review page's address. Anything unrecognised falls back to the
 * default, so a hand-edited or stale link still opens a working page.
 */
export function parseReviewQuery(params: ParamMap): ReviewQuery {
  const tab = params.get('tab');
  const view = params.get('view');
  const kind = params.get('kind');
  return {
    tab: REVIEW_TABS.includes(tab as ReviewTab) ? (tab as ReviewTab) : null,
    reports: {
      view: REPORTS_VIEWS.includes(view as ReportsView)
        ? (view as ReportsView)
        : DEFAULT_REPORTS.view,
      kind: SUBJECT_KINDS.includes(kind as ModerationSubjectKind)
        ? (kind as ModerationSubjectKind)
        : DEFAULT_REPORTS.kind,
      criteria: parseCriteria(params),
      open: parseSubjectKey(params.get('open')),
      worker: view === 'workers' ? params.get('worker') || null : null,
    },
    prompts: parsePrompts(params),
  };
}

/**
 * The reason chips are kept under their own name: the Reports tab reads
 * `reason` for its criteria, and switching tabs keeps the address's other
 * parameters.
 */
const PROMPT_REASON_PARAM = 'prompt_reason';

function parsePrompts(params: ParamMap): PromptsState {
  const period = params.get('period');
  const named = params.getAll(PROMPT_REASON_PARAM);
  const reasons = PROMPT_REASONS.filter((reason) => named.includes(reason));
  return {
    user_id: positiveInt(params.get('user_id') ?? ''),
    proxied_account: params.get('proxied_account') || null,
    ipaddr: params.get('ipaddr') || null,
    worker_id: params.get('worker_id') || null,
    period: PROMPT_PERIODS.includes(period as PromptPeriod)
      ? (period as PromptPeriod)
      : DEFAULT_PROMPTS.period,
    since: instantOf(params.get('since')),
    until: instantOf(params.get('until')),
    reasons: reasons.length ? reasons : DEFAULT_PROMPTS.reasons,
  };
}

/** An instant from the address; one without a zone is not guessed at. */
function instantOf(value: string | null): Date | null {
  if (!value || !/(Z|[+-]\d{2}:?\d{2})$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The query parameters for the Prompts tab. A value at its default is written
 * as null, which removes it from the address on a merge.
 */
export function promptsParams(state: PromptsState): Params {
  const allReasons = state.reasons.length === PROMPT_REASONS.length;
  return {
    tab: 'prompts',
    ...promptFilterParams(state),
    period: state.period === DEFAULT_PROMPTS.period ? null : state.period,
    since: state.since ? hordeInstant(state.since) : null,
    until: state.until ? hordeInstant(state.until) : null,
    [PROMPT_REASON_PARAM]: allReasons ? null : [...state.reasons],
  };
}

/**
 * The parameters that open the Prompts tab on one account, proxied account,
 * address or worker. Merged into the address, they replace whatever the tab
 * was filtered by and keep its period and reasons.
 */
export function promptPivotParams(filter: Partial<PromptFilter>): Params {
  return {
    tab: 'prompts',
    ...promptFilterParams({ ...NO_PROMPT_FILTER, ...filter }),
  };
}

function promptFilterParams(filter: PromptFilter): Params {
  return {
    user_id: filter.user_id,
    proxied_account: filter.proxied_account,
    ipaddr: filter.ipaddr,
    worker_id: filter.worker_id,
  };
}

/**
 * The log request for the Prompts tab, without a limit or cursor. A period
 * is counted back from `now`. `serverReasons` says the horde filters by
 * `reason`; all selected reasons are sent when they narrow the set.
 */
export function promptQueryOf(
  state: PromptsState,
  now: number,
  serverReasons: boolean,
): PromptModerationEventQuery {
  const since =
    state.since ??
    (state.period === 'any'
      ? null
      : new Date(now - PROMPT_PERIOD_SECONDS[state.period] * 1000));
  const reasons =
    serverReasons && state.reasons.length < PROMPT_REASONS.length
      ? PROMPT_REASONS.filter((reason) => state.reasons.includes(reason))
      : null;
  return {
    ...(state.user_id !== null ? { user_id: state.user_id } : {}),
    ...(state.proxied_account
      ? { proxied_account: state.proxied_account }
      : {}),
    ...(state.ipaddr ? { ipaddr: state.ipaddr } : {}),
    ...(state.worker_id ? { worker_id: state.worker_id } : {}),
    ...(since ? { since: hordeInstant(since) } : {}),
    ...(state.until ? { until: hordeInstant(state.until) } : {}),
    ...(reasons ? { reason: reasons } : {}),
  };
}

function parseCriteria(params: ParamMap): ReportCriteria {
  const sinceReview = params.get('since_review') !== '0';
  const rawWindow = Number(params.get('window'));
  const window = WINDOW_CHOICES.includes(rawWindow) ? rawWindow : null;
  const minCount = positiveInt(params.get('min_count') ?? '');
  if (window === null && minCount === null) {
    return { ...DEFAULT_CRITERIA, sinceReview };
  }
  const named = params.getAll('reason');
  const reasons = PROMPT_REASONS.filter((reason) => named.includes(reason));
  return {
    window: window ?? CUSTOM_DEFAULTS.window,
    minCount: minCount ?? CUSTOM_DEFAULTS.minCount,
    reasons: reasons.length === PROMPT_REASONS.length ? [] : reasons,
    sinceReview,
  };
}

/**
 * The query parameters for the Reports tab. A value at its default is written
 * as null, which removes it from the address on a merge.
 */
export function reportsParams(state: ReportsState): Params {
  const custom = state.criteria.window !== null;
  return {
    tab: 'reports',
    view: state.view === DEFAULT_REPORTS.view ? null : state.view,
    kind: state.kind === DEFAULT_REPORTS.kind ? null : state.kind,
    window: custom ? state.criteria.window : null,
    min_count: custom ? state.criteria.minCount : null,
    reason:
      custom && state.criteria.reasons.length ? state.criteria.reasons : null,
    since_review: state.criteria.sinceReview ? null : '0',
    open: state.open ? subjectKey(state.open) : null,
    worker: state.view === 'workers' ? state.worker : null,
  };
}

/** The listing request for a kind under some criteria. */
export function subjectQueryOf(
  kind: ModerationSubjectKind,
  criteria: ReportCriteria,
  limit: number,
  offset?: number,
): ModerationSubjectQuery {
  return {
    kind,
    ...(criteria.window !== null
      ? {
          window: criteria.window,
          min_count: criteria.minCount ?? CUSTOM_DEFAULTS.minCount,
          ...(criteria.reasons.length ? { reason: criteria.reasons } : {}),
        }
      : {}),
    since_review: criteria.sinceReview,
    limit,
    ...(offset ? { offset } : {}),
  };
}
