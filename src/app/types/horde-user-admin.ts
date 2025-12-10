/**
 * User's active generation IDs by type
 */
export interface UserActiveGenerations {
  text?: string[];
  image?: string[];
  alchemy?: string[];
}

/**
 * User's style reference
 */
export interface UserStyleReference {
  id: string;
  name: string;
  type: 'image' | 'text';
}

/**
 * User thing records (megapixelsteps/tokens)
 */
export interface UserThingRecords {
  megapixelsteps?: number;
  tokens?: number;
}

/**
 * User amount records (image/text/interrogation counts)
 */
export interface UserAmountRecords {
  image?: number;
  text?: number;
  interrogation?: number;
}

/**
 * User detailed records
 */
export interface UserRecords {
  usage?: UserThingRecords;
  contribution?: UserThingRecords;
  fulfillment?: UserAmountRecords;
  request?: UserAmountRecords;
  style?: UserAmountRecords;
}

/**
 * Extended user response for admin views (includes additional fields)
 */
export interface AdminUserDetails {
  account_age: number;
  concurrency: number;
  contributions: {
    fulfillments: number;
    megapixelsteps: number;
  };
  evaluating_kudos: number;
  flagged: boolean;
  filtered?: boolean;
  id: number;
  kudos: number;
  usage_multiplier?: number;
  kudos_details: {
    accumulated: number;
    gifted: number;
    donated?: number;
    admin: number;
    received: number;
    recurring: number;
    awarded: number;
    styled?: number;
  };
  moderator: boolean;
  monthly_kudos: {
    amount: number;
    last_received: string;
  };
  pseudonymous: boolean;
  public_workers?: boolean;
  records?: UserRecords;
  sharedkey_ids?: string[];
  suspicious: number;
  service?: boolean;
  education?: boolean;
  customizer?: boolean;
  special?: boolean;
  trusted: boolean;
  usage: {
    requests: number;
    megapixelsteps: number;
  };
  username: string;
  worker_count: number;
  worker_ids?: string[];
  worker_invited: number;
  contact?: string;
  vpn?: boolean;
  admin_comment?: string;
  proxy_passkey?: string;
  deleted?: boolean;
  active_generations?: UserActiveGenerations;
  styles?: UserStyleReference[];
}

/**
 * Request body for modifying a user (moderator actions)
 */
export interface PutUserRequest {
  kudos?: number;
  concurrency?: number;
  usage_multiplier?: number;
  worker_invite?: number;
  moderator?: boolean;
  public_workers?: boolean;
  username?: string;
  monthly_kudos?: number;
  trusted?: boolean;
  flagged?: boolean;
  reset_suspicion?: boolean;
  contact?: string;
  customizer?: boolean;
  vpn?: boolean;
  service?: boolean;
  education?: boolean;
  special?: boolean;
  filtered?: boolean;
  undelete?: boolean;
  admin_comment?: string;
  generate_proxy_passkey?: boolean;
}

/**
 * Simple user entry for autocomplete/search
 */
export interface UserListEntry {
  id: number;
  username: string;
}
