import { ParamMap, Params } from '@angular/router';
import {
  PromptModerationEventQuery,
  PromptModerationReason,
} from '../../../types/moderation';
import { PROMPT_REASONS, hordeInstant, positiveInt } from './review-subjects';

/** The queues the review page shows, as the `tab` query parameter names them. */
export type ReviewTab = 'prompts' | 'promotions' | 'paused';

export const REVIEW_TABS: readonly ReviewTab[] = [
  'prompts',
  'promotions',
  'paused',
];

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
  prompts: PromptsState;
}

/**
 * Read the review page's address. Anything unrecognised falls back to the
 * default, so a hand-edited or stale link still opens a working page.
 */
export function parseReviewQuery(params: ParamMap): ReviewQuery {
  const tab = params.get('tab');
  return {
    tab: REVIEW_TABS.includes(tab as ReviewTab) ? (tab as ReviewTab) : null,
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
