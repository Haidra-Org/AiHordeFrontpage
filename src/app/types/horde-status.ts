export interface HordeStatusModes {
  maintenance_mode: boolean;
  invite_only_mode: boolean;
  raid_mode?: boolean;
}

/** GET /v2/status/heartbeat, the fields read here. */
export interface HordeHeartbeat {
  message: string;
  /** The horde's release, dotted numbers such as `4.46.0`. */
  version: string;
}
