/**
 * IP timeout information returned from the API.
 * Represents a blocked IP address or CIDR range.
 */
export interface IPTimeout {
  /** The IP address or CIDR (e.g., "127.0.0.1" or "192.168.0.0/24") */
  ipaddr: string;
  /** Remaining seconds until the timeout expires */
  seconds: number;
}

/**
 * Request payload for adding an IP timeout.
 */
export interface AddTimeoutIPInput {
  /** IP address or CIDR to block */
  ipaddr: string;
  /** Duration of the timeout in hours (1-720) */
  hours: number;
}

/**
 * Request payload for removing an IP timeout.
 */
export interface DeleteTimeoutIPInput {
  /** IP address or CIDR to unblock */
  ipaddr: string;
}

/**
 * Request payload for blocking a worker's IP.
 */
export interface AddWorkerTimeout {
  /** Duration of the block in days (1-30) */
  days: number;
}

/**
 * Simple response returned by operations endpoints.
 */
export interface SimpleResponse {
  /** Response message, typically "OK" on success */
  message: string;
}
