export interface UserKudosDetails {
  accumulated?: number;
  gifted?: number;
  donated?: number;
  admin?: number;
  received?: number;
  recurring?: number;
  awarded?: number;
  styled?: number;
}

export interface UsageDetails {
  megapixelsteps?: number;
  requests?: number;
}

export interface ContributionsDetails {
  megapixelsteps?: number;
  fulfillments?: number;
}

export interface MonthlyKudos {
  amount?: number;
  last_received?: string;
}

export interface UserRecords {
  usage?: {
    megapixelsteps?: number;
    tokens?: number;
  };
  contribution?: {
    megapixelsteps?: number;
    tokens?: number;
  };
  fulfillment?: {
    image?: number;
    text?: number;
    interrogation?: number;
  };
  request?: {
    image?: number;
    text?: number;
    interrogation?: number;
  };
  style?: {
    image?: number;
    text?: number;
    interrogation?: number;
  };
}

export interface ActiveGenerations {
  text?: string[];
  image?: string[];
  alchemy?: string[];
}

export interface HordeUser {
  username: string;
  id: number;
  kudos: number;
  evaluating_kudos?: number;
  concurrency?: number;
  usage_multiplier?: number;
  worker_invited?: number;
  moderator?: boolean;
  kudos_details?: UserKudosDetails;
  worker_count?: number;
  worker_ids?: string[];
  sharedkey_ids?: string[];
  styles?: string[];
  active_generations?: ActiveGenerations;
  trusted?: boolean;
  flagged?: boolean;
  vpn?: boolean;
  public_workers?: boolean;
  service?: boolean;
  education?: boolean;
  customizer?: boolean;
  special?: boolean;
  filtered?: boolean;
  deleted?: boolean;
  pseudonymous?: boolean;
  account_age?: number;
  usage?: UsageDetails;
  contributions?: ContributionsDetails;
  records?: UserRecords;
  monthly_kudos?: MonthlyKudos;
  contact?: string;
  admin_comment?: string;
  proxy_passkey?: string;
}
