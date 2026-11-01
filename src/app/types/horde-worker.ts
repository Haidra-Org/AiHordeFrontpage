export interface WorkerKudosDetails {
  generated: number;
  uptime: number;
}

export interface WorkerTeam {
  name: string | null;
  id: string | null;
}

export interface WorkerMessage {
  id: string;
  message: string;
  origin?: string;
  expiry: string;
}

export type WorkerType = 'image' | 'text' | 'interrogation';

/** A text worker's chat job limits, separate from its text limits. */
export interface WorkerChatLimits {
  max_context_length: number;
  max_length: number;
  /**
   * The highest temperature that the backend applies unchanged when tools are
   * present. Null when every temperature is applied unchanged.
   */
  tools_max_temperature: number | null;
}

/**
 * A text worker's chat job declaration from its last pop, as stored by the
 * horde. `features` and `image_transports` are strings rather than unions
 * because a newer horde can add names without a description on this site.
 */
export interface WorkerChatDeclaration {
  model_id: string;
  features: string[];
  limits: WorkerChatLimits;
  image_transports: string[];
}

export interface HordeWorker {
  type: WorkerType;
  name: string;
  id: string;
  online: boolean;
  requests_fulfilled: number;
  kudos_rewards: number;
  kudos_details?: WorkerKudosDetails;
  performance: string;
  threads: number;
  uptime: number;
  maintenance_mode: boolean;
  paused: boolean;
  info?: string;
  nsfw: boolean;
  owner?: string;
  ipaddr?: string;
  trusted: boolean;
  flagged: boolean;
  suspicious: number;
  uncompleted_jobs: number;
  models?: string[];
  forms?: string[];
  team?: WorkerTeam;
  contact?: string;
  bridge_agent: string;
  max_pixels?: number;
  megapixelsteps_generated?: number;
  img2img?: boolean;
  painting?: boolean;
  'post-processing'?: boolean;
  lora?: boolean;
  controlnet?: boolean;
  /**
   * Whether the worker offers the guidance modes beyond the nine every
   * ControlNet-capable worker has always had. It is opt-in and needs a recent
   * bridge, so it is reported separately from `controlnet`.
   */
  extended_controlnet?: boolean;
  sdxl_controlnet?: boolean;
  max_length?: number;
  max_context_length?: number;
  tokens_generated?: number;
  /** Whether the worker's last pop opted into chat jobs. */
  accepts_chat_jobs?: boolean;
  /**
   * Whether the worker takes plain text jobs. False means the worker is
   * chat-only, and its `max_length` and `max_context_length` do not apply to
   * any job it serves.
   */
  accepts_prompt_jobs?: boolean;
  /** Absent when the worker does not accept chat jobs. */
  chat?: WorkerChatDeclaration;
  /** Replies refused by the horde for breaking a strict request's contract. */
  nonconformant_replies?: number;
  messages?: WorkerMessage[];
}

export interface PutWorkerRequest {
  maintenance?: boolean;
  maintenance_msg?: string;
  paused?: boolean;
  info?: string;
  name?: string;
  team?: string;
}

export interface WorkerModifyResponse {
  maintenance?: boolean;
  paused?: boolean;
  info?: string;
  name?: string;
}
