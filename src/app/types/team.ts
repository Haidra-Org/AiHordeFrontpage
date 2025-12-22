/**
 * Lite team details (basic info only)
 */
export interface TeamLite {
  name?: string;
  id?: string;
}

/**
 * Worker details within a team response
 */
export interface TeamWorkerLite {
  id?: string;
  name?: string;
  online?: boolean;
}

/**
 * Model details within a team response
 */
export interface TeamModelLite {
  name?: string;
  count?: number;
}

/**
 * Full team details from GET /v2/teams or GET /v2/teams/{team_id}
 */
export interface Team extends TeamLite {
  info?: string;
  requests_fulfilled?: number;
  kudos?: number;
  uptime?: number;
  creator?: string;
  worker_count?: number;
  workers?: TeamWorkerLite[];
  models?: TeamModelLite[];
}

/**
 * Request payload for POST /v2/teams (create team)
 */
export interface CreateTeamRequest {
  name: string;
  info?: string;
}

/**
 * Request payload for PATCH /v2/teams/{team_id} (update team)
 */
export interface UpdateTeamRequest {
  name?: string;
  info?: string;
}

/**
 * Response from POST /v2/teams or PATCH /v2/teams/{team_id}
 */
export interface TeamModifyResponse {
  id?: string;
  name?: string;
  info?: string;
}

/**
 * Response from DELETE /v2/teams/{team_id}
 */
export interface DeletedTeamResponse {
  deleted_id?: string;
  deleted_name?: string;
}

/**
 * API error response for team operations
 */
export interface TeamApiError {
  status: number;
  message: string;
  rc?: string;
}
