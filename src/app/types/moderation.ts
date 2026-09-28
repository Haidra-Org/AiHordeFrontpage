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
