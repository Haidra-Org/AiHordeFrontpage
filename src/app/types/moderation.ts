import { WorkerType } from './horde-worker';

/**
 * One reason the horde counted against an account or a worker, with how many
 * times it was counted. `name` is the horde's enum name, or `UNKNOWN_<id>` for
 * an id the horde no longer names.
 */
export interface SuspicionReason {
  id: number;
  name: string;
  description: string;
  count: number;
}

/** An account the promotion review lists, either blocked or eligible. */
export interface PromotionReviewUser {
  id: number;
  username: string;
  /** ISO 8601 with a zone; read with `parseHordeTime`. */
  last_active: string;
  /** Seconds. */
  account_age: number;
  kudos: number;
  evaluating_kudos: number;
  promotion_threshold: number;
  threshold_excess: number;
  suspicious: number;
  suspicion_threshold: number;
  suspicion_reasons: SuspicionReason[];
  flagged: boolean;
  deleted: boolean;
  vpn: boolean;
  worker_count: number;
  paused_worker_count: number;
  worker_kudos: number;
  worker_fulfilments: number;
  contact: string | null;
  admin_comment: string | null;
}

/** A paused worker, with what a moderator needs to decide whether to unpause it. */
export interface PausedWorkerReview {
  id: string;
  name: string;
  type: WorkerType;
  owner_id: number;
  /** The owner's alias. */
  owner: string;
  /** ISO 8601 with a zone; read with `parseHordeTime`. */
  last_check_in: string;
  online: boolean;
  maintenance_mode: boolean;
  maintenance_msg: string | null;
  suspicious: number;
  suspicion_threshold: number;
  suspicion_reasons: SuspicionReason[];
  /** How much suspicion the owner's account carries. */
  owner_suspicion: number;
  owner_trusted: boolean;
  owner_flagged: boolean;
  requests_fulfilled: number;
  aborted_jobs: number;
  bridge_agent: string;
  models: string[];
  contact: string | null;
}

/** GET /v2/operations/moderation */
export interface ModerationOverview {
  promotion_blocked_users: PromotionReviewUser[];
  promotion_eligible_users: PromotionReviewUser[];
  paused_workers: PausedWorkerReview[];
  /**
   * How many workers match the paused-worker filters, however many the list
   * carries. Absent from a horde that predates the filters, which is how the
   * page knows whether it may offer them.
   */
  paused_workers_total?: number;
}

/** How the horde orders the paused workers. */
export type PausedWorkerSort = 'suspicion' | 'last_check_in' | 'name' | 'owner';

/**
 * The query of GET /v2/operations/moderation. The names mirror the horde's
 * parameters; the filters narrow only the paused-worker list.
 */
export interface ModerationOverviewQuery {
  /** Rows per list, 1 to 500; the horde defaults to 100. */
  limit?: number;
  /** Any of these kinds; every kind when absent. */
  worker_type?: WorkerType[];
  /** Workers suspected for any of these reasons, by the horde's suspicion id. */
  suspicion_id?: number[];
  online?: boolean;
  sort?: PausedWorkerSort;
}

/** Why a prompt was stopped. */
export type PromptModerationReason =
  | 'filter_rejection'
  | 'model_rejection'
  | 'worker_csam';

/** What happened to the request the prompt belonged to. */
export type PromptModerationOutcome = 'rejected' | 'censored';

/** A moderator's note on one event. Notes carry no status. */
export interface PromptModerationNote {
  id: number;
  author_id: number;
  note: string;
  /** ISO 8601 with a zone; read with `parseHordeTime`. */
  created: string;
}

/**
 * One stopped prompt, as the moderation log records it. The horde sends every
 * field, with null for a value it did not record.
 */
export interface PromptModerationEvent {
  id: number;
  /** ISO 8601 with a zone; read with `parseHordeTime`. */
  created: string;
  user_id: number;
  request_id: string | null;
  worker_id: string | null;
  proxied_account: string | null;
  /**
   * The address the request came from: an IPv4 address as is, an IPv6
   * address as its /64 network (`2001:db8:1:2::/64`).
   */
  ipaddr: string | null;
  /** The models the request asked for. */
  models: string[] | null;
  reason: PromptModerationReason;
  outcome: PromptModerationOutcome;
  submitted_prompt: string | null;
  moderation_prompt: string | null;
  effective_prompt: string | null;
  /** Whether the stored prompt text was cut to the log's length limit. */
  text_truncated: boolean;
  /** UTC expiry of an evidence hold, or null under normal retention. */
  held_until?: string | null;
  notes: PromptModerationNote[];
}

/**
 * Response from setting or releasing a temporary evidence hold, with the
 * attributed note the horde recorded for it.
 */
export interface PromptModerationHold {
  held_until: string | null;
  note: PromptModerationNote;
}

/** GET /v2/operations/moderation/prompts */
export interface PromptModerationEventsPage {
  events: PromptModerationEvent[];
  /** Feeds `before_id` for the next, older page; null on the last page. */
  next_cursor: number | null;
}

/** Filters and cursor for the prompt moderation log. */
export interface PromptModerationEventQuery {
  /** 1 to 100; the horde defaults to 50. */
  limit?: number;
  /** Events older than this id. */
  before_id?: number;
  user_id?: number;
  proxied_account?: string;
  /** An IPv6 address matches every event in its /64. */
  ipaddr?: string;
  /** Any of these reasons; sent only past the release that supports the filter. */
  reason?: PromptModerationReason[];
  /** ISO 8601 with a timezone, inclusive. */
  since?: string;
  /** ISO 8601 with a timezone, exclusive. */
  until?: string;
  /** Only the reports this worker made. */
  worker_id?: string;
}

/**
 * Who a set of reports is about. One event counts toward every one of these
 * it names, and a decision on one kind does not cover another.
 */
export type ModerationSubjectKind = 'account' | 'proxied_account' | 'ip';

/** Where a subject stands after a moderator's latest decision on it. */
export type SubjectDecisionOutcome =
  | 'benign'
  | 'actioned'
  | 'watching'
  | 'escalated';

/** What a moderator did, recorded with an `actioned` decision once it succeeded. */
export type SubjectAction =
  | 'flag_account'
  | 'ban_account'
  | 'ip_timeout'
  | 'pause_worker'
  | 'reset_suspicion'
  | 'other';

/**
 * An alert rule: `min_count` or more reports for any of `reasons` within
 * `window_seconds`. A subject reaching the count exceeds the rule.
 */
export interface ModerationRule {
  window_seconds: number;
  min_count: number;
  /** One to three distinct reasons the rule counts. */
  reasons: PromptModerationReason[];
}

/**
 * One configured rule as it applies to one subject. `min_count` is the
 * threshold in force: the lower of the watch's `watch_min_count` and the
 * rule's own threshold while a watch runs. `count` is of reports since the latest
 * decision's watermark, within the rule's window.
 */
export interface ModerationRuleCount extends ModerationRule {
  count: number;
  exceeded: boolean;
}

/** One slice of a subject's timeline. */
export interface ModerationTimelineBucket {
  /** ISO 8601 with a zone; aligned to multiples of the bucket size since the epoch. */
  start: string;
  counts_by_reason: Partial<Record<PromptModerationReason, number>>;
}

/** A capped list the horde ranks by count, with how many there are in all. */
export interface ModerationCappedList<T> {
  items: T[];
  /** Distinct entries, including those past the cap. */
  total: number;
}

/** An account seen on a subject's reports in the window. */
export interface ModerationRelatedAccount {
  user_id: number;
  /** Null when the account no longer exists. */
  username: string | null;
  count: number;
}

/** A proxied account seen on a subject's reports in the window. */
export interface ModerationRelatedProxiedAccount {
  user_id: number;
  proxied_account: string;
  count: number;
}

/** An address seen on a subject's reports in the window; IPv6 as its /64. */
export interface ModerationRelatedIP {
  ipaddr: string;
  count: number;
}

/** A model the subject's reports asked for, with its count by reason. */
export interface ModerationDetailModel {
  model: string;
  /** Every reason. */
  count: number;
  counts_by_reason: Partial<Record<PromptModerationReason, number>>;
}

/** What else a subject's reports name. The subject's own kind is null. */
export interface ModerationRelated {
  accounts: ModerationCappedList<ModerationRelatedAccount> | null;
  proxied_accounts: ModerationCappedList<ModerationRelatedProxiedAccount> | null;
  ips: ModerationCappedList<ModerationRelatedIP> | null;
}

/**
 * GET /v2/operations/moderation/subjects/detail. Counts, the timeline,
 * related subjects, workers and models cover `[since, until)`; the
 * `since_review_*` counts are the part of that after the latest decision's
 * watermark. `rules` holds every configured rule, smallest window first.
 */
export interface ModerationSubjectDetail {
  username: string | null;
  /** ISO 8601 with a zone, inclusive. */
  since: string;
  /** ISO 8601 with a zone, exclusive. */
  until: string;
  bucket_seconds: number;
  count: number;
  counts_by_reason: Partial<Record<PromptModerationReason, number>>;
  since_review_count: number;
  rules: ModerationRuleCount[];
  timeline: ModerationTimelineBucket[];
  related: ModerationRelated;
  workers: ModerationCappedList<ModerationDetailWorker>;
  models: ModerationCappedList<ModerationDetailModel>;
  /**
   * The subject's newest reports, in the prompt log's shape: within
   * `[since, until)` when the query named a range, else the newest overall.
   */
  events: PromptModerationEvent[];
  /** Pass as `before_id` to the prompt log, with the subject's filters, to read on. */
  events_next_cursor: number | null;
  /** The subject's five newest decisions. */
  decisions: SubjectDecision[];
  /** Pass as `before_id` to the decision listing to read on. */
  decisions_next_cursor: number | null;
}

/**
 * The query of the subject detail. Without a range the window is the
 * largest rule window up to now; `until` needs `since`.
 */
export interface ModerationSubjectDetailQuery extends SubjectIdentity {
  kind: ModerationSubjectKind;
  /** ISO 8601 with a timezone, inclusive. */
  since?: string;
  /** ISO 8601 with a timezone, exclusive. */
  until?: string;
}

/** A decision on a subject. The latest one is the subject's state. */
export interface SubjectDecision {
  id: number;
  subject_kind: ModerationSubjectKind;
  user_id: number | null;
  proxied_account: string | null;
  ipaddr: string | null;
  outcome: SubjectDecisionOutcome;
  note: string | null;
  reviewer_id: number;
  /** The reviewer's alias. */
  reviewer: string | null;
  /** ISO 8601 with a zone; read with `parseHordeTime`. */
  created: string;
  /** The newest event the decision covers; later events are new. */
  watermark_event_id: number | null;
  /** ISO 8601 with a zone; set on a `watching` decision. */
  watch_until: string | null;
  /** The threshold a `watching` decision sets until it expires. */
  watch_min_count: number | null;
  action: SubjectAction | null;
  action_detail: string | null;
}

/** An account, proxied account or address, with its reports under a listing's criteria. */
export interface ModerationSubject {
  kind: ModerationSubjectKind;
  user_id: number | null;
  /** The account's alias; accounts only. */
  username: string | null;
  proxied_account: string | null;
  ipaddr: string | null;
  count: number;
  counts_by_reason: Partial<Record<PromptModerationReason, number>>;
  /** ISO 8601 with a zone. */
  last_event: string | null;
  decision: SubjectDecision | null;
}

/**
 * The criteria the horde applied to a subject listing: the configured rules
 * for the alert view, or the window, count and reasons of a custom search.
 */
export interface ModerationSubjectCriteria {
  rules: ModerationRule[] | null;
}

/** GET /v2/operations/moderation/subjects */
export interface ModerationSubjectsPage {
  criteria: ModerationSubjectCriteria;
  subjects: ModerationSubject[];
  /** Feeds `offset` for the next page; null on the last page. */
  next_offset: number | null;
}

/**
 * Criteria for the subject listing. Without `window` and `min_count` the horde
 * lists the subjects over any of its configured rules. With either one, the
 * missing `window` is the largest configured window and the missing
 * `min_count` is 1.
 */
export interface ModerationSubjectQuery {
  kind?: ModerationSubjectKind;
  state?: 'watching' | 'escalated';
  /** Seconds. */
  window?: number;
  min_count?: number;
  /** Every reason when absent. */
  reason?: PromptModerationReason[];
  /** Count only reports after the latest decision; the horde defaults to true. */
  since_review?: boolean;
  /** 1 to 200; the horde defaults to 50. */
  limit?: number;
  /** At most 100000. */
  offset?: number;
}

/** The identity fields a subject kind uses. */
export interface SubjectIdentity {
  user_id?: number;
  proxied_account?: string;
  ipaddr?: string;
}

/** Filters and cursor for one subject's decision history. */
export interface SubjectDecisionsQuery extends SubjectIdentity {
  kind: ModerationSubjectKind;
  before_id?: number;
  limit?: number;
}

/** GET /v2/operations/moderation/subjects/decisions */
export interface SubjectDecisionsPage {
  decisions: SubjectDecision[];
  next_cursor: number | null;
}

/** POST /v2/operations/moderation/subjects/decisions. The note is at most 2000 characters. */
export interface SubjectDecisionInput extends SubjectIdentity {
  kind: ModerationSubjectKind;
  outcome: SubjectDecisionOutcome;
  note?: string;
  /** ISO 8601 with a timezone. */
  watch_until?: string;
  watch_min_count?: number;
  action?: SubjectAction;
  /** At most 500 characters. */
  action_detail?: string;
  /**
   * The newest event the moderator saw. It has to lie between 1 and the
   * subject's newest event; the horde uses its newest when this is absent.
   */
  watermark_event_id?: number;
}

/** A model with how many of its worker reports were later marked benign. */
export interface FalsePositiveModel {
  model: string;
  cleared: number;
}

/** A worker that made some of a subject's reports, with how many. */
export interface ModerationDetailWorker {
  worker_id: string;
  worker_name: string | null;
  count: number;
}

/**
 * GET /v2/operations/moderation/models. Benign reports by worker
 * come from the reporting-workers ranking, sorted by `cleared`. `window` is 60 to 2592000
 * seconds; the horde defaults to 30 days.
 */
export interface FalsePositiveReport {
  since: string;
  until: string;
  models: FalsePositiveModel[];
  total: number;
  next_offset: number | null;
}

/** GET and PUT /v2/operations/moderation/settings */
export interface ModerationSettings {
  /** One to six rules, each with the reasons it counts. */
  rules: ModerationRule[];
}

/** One time a worker was marked suspicious. */
export interface WorkerSuspicionEvent {
  id: number;
  /** ISO 8601 with a zone; read with `parseHordeTime`. */
  created: string;
  worker_name: string;
  /** The horde's enum name for the reason. */
  reason: string;
  /** The reason with its particulars filled in, as the horde formats it. */
  detail: string;
}

/** GET /v2/operations/moderation/worker_suspicion_events */
export interface WorkerSuspicionEventsPage {
  events: WorkerSuspicionEvent[];
  next_cursor: number | null;
}

/** Filters and cursor for the worker suspicion log. */
export interface WorkerSuspicionEventQuery {
  /** 1 to 500; the horde defaults to 100. */
  limit?: number;
  before_id?: number;
  worker_id?: string;
  user_id?: number;
}

/**
 * Whether the horde the page talks to has an endpoint. `unknown` until a
 * request has answered; `absent` when the route itself is missing, which is how
 * a horde that predates the endpoint answers.
 */
export type EndpointAvailability = 'unknown' | 'available' | 'absent';

/**
 * A count read off a list the horde capped at `limit`. When the list came back
 * full there may be more, so the count is a floor.
 */
export interface ListCount {
  count: number;
  /** True when the list was full, so the real number is `count` or more. */
  atLeast: boolean;
}

/** One worker in the ranking of workers by the reports they made. */
export interface ReportingWorker {
  worker_id: string;
  /** Null when the worker no longer exists. */
  worker_name: string | null;
  /** Null when the worker no longer exists. */
  paused: boolean | null;
  /** Worker CSAM reports the worker made in the window. */
  reports: number;
  /** Distinct accounts those reports name. */
  accounts: number;
  /** Those reports a benign decision covers. */
  cleared: number;
}

/** GET /v2/operations/moderation/workers */
export interface ReportingWorkersPage {
  /** ISO 8601 with a zone; the window the ranking covers. */
  since: string;
  until: string;
  workers: ReportingWorker[];
  /** Workers that made a report in the window, however many the page holds. */
  total: number;
  next_offset: number | null;
}

/** How the reporting-workers ranking is ordered, most first. */
export type ReportingWorkerSort = 'reports' | 'accounts' | 'cleared';

/** The query of the reporting-workers ranking. */
export interface ReportingWorkersQuery {
  /** Seconds; the horde defaults to 30 days. */
  window?: number;
  /** ISO 8601 with a timezone, inclusive; in place of `window`. */
  since?: string;
  /** ISO 8601 with a timezone, exclusive; needs `since`. */
  until?: string;
  /** 1 to 200; the horde defaults to 50. */
  sort?: ReportingWorkerSort;
  limit?: number;
  offset?: number;
}

/**
 * GET /v2/operations/moderation/workers/detail: one worker's reports over a
 * window or a range, built like a subject's detail. A worker is a reporter,
 * never a subject: it carries no decisions, watermark or rules.
 */
export interface ModerationWorkerDetail {
  /** Null when the worker no longer exists. */
  worker_name: string | null;
  /** Null when the worker no longer exists. */
  paused: boolean | null;
  /** ISO 8601 with a zone, inclusive. */
  since: string;
  /** ISO 8601 with a zone, exclusive. */
  until: string;
  bucket_seconds: number;
  count: number;
  counts_by_reason: Partial<Record<PromptModerationReason, number>>;
  timeline: ModerationTimelineBucket[];
  /** The accounts, proxied accounts and addresses the worker's reports name. */
  related: ModerationRelated;
  models: ModerationCappedList<ModerationDetailModel>;
  events: PromptModerationEvent[];
  events_next_cursor: number | null;
}

/** The query of a worker's detail; the range rules match the subject detail's. */
export interface ModerationWorkerDetailQuery {
  worker_id: string;
  /** ISO 8601 with a timezone, inclusive. */
  since?: string;
  /** ISO 8601 with a timezone, exclusive. */
  until?: string;
}
