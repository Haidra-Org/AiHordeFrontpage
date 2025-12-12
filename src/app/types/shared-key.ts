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

/** Normalized API error shape for shared key requests. */
export interface SharedKeyApiError {
  status: number;
  message: string;
  rc?: string;
}
