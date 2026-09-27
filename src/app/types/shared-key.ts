/**
 * Details about a shared API key.
 */
export interface SharedKeyDetails {
  /** The SharedKey ID. */
  id: string;
  /** The owning user's unique Username. It is a combination of their chosen alias plus their ID. */
  username?: string;
  /** The Shared Key Name. */
  name?: string;
  /** The Kudos limit assigned to this key. */
  kudos?: number;
  /** The date at which this API key will expire. */
  expiry?: string;
  /** How much kudos has been utilized via this shared key until now. */
  utilized?: number;
  /** The maximum amount of image pixels this key can generate per job. -1 means unlimited. */
  max_image_pixels?: number;
  /** The maximum amount of image steps this key can use per job. -1 means unlimited. */
  max_image_steps?: number;
  /** The maximum amount of text tokens this key can generate per job. -1 means unlimited. */
  max_text_tokens?: number;
  /**
   * Work currently funded by this key. Only sent to the key's owner when the request carries the owner's personal
   * API key, and absent on hordes that predate it.
   */
  active_usage?: SharedKeyActiveUsage;
}

/**
 * Aggregate counts of one kind of work funded by a shared key. Carries no request IDs or request contents.
 */
export interface SharedKeyUsageSummary {
  /** Requests with queued or processing work. */
  requests: number;
  /** Generations waiting for a worker, across those requests. */
  queued: number;
  /** Generations a worker is making now, across those requests. */
  processing: number;
  /** Generations already completed within those still-active requests. */
  finished: number;
  /** Age in seconds of the oldest request with queued work, or 0 if none. */
  oldest_queued_age: number;
}

/** A shared key's current work, split by kind. */
export interface SharedKeyActiveUsage {
  image: SharedKeyUsageSummary;
  text: SharedKeyUsageSummary;
}

/**
 * Payload used to create or update a shared key.
 */
export interface SharedKeyInput {
  /** A descriptive name for this key. */
  name: string;
  /** The Kudos limit assigned to this key. -1 means unlimited. */
  kudos: number;
  /** The amount of days after which this key will expire. -1 means never. */
  expiry: number;
  /** The maximum amount of image pixels this key can generate per job. -1 means unlimited. */
  max_image_pixels: number;
  /** The maximum amount of image steps this key can use per job. -1 means unlimited. */
  max_image_steps: number;
  /** The maximum amount of text tokens this key can generate per job. -1 means unlimited. */
  max_text_tokens: number;
}

import { ApiError } from './api-error';

/** @deprecated Use {@link ApiError} directly. */
export type SharedKeyApiError = ApiError;
