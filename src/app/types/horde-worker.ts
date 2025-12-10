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
  sdxl_controlnet?: boolean;
  max_length?: number;
  max_context_length?: number;
  tokens_generated?: number;
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
