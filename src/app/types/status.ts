/**
 * Response shapes for the AI Horde status-page backend
 * (`ai-horde-service-alerts`, served under `/api/v1/public/*`).
 *
 * These mirror the Pydantic models in that service's `models/public.py`.
 * The public surface is deliberately structural-only: no raw alert prose
 * is exposed, so there is no field for alert summaries here.
 */

/** Effective state a component can occupy (matches `ComponentStatusValue`). */
export type ComponentStatusValue =
  | 'operational'
  | 'degraded'
  | 'partial'
  | 'down'
  | 'maintenance'
  | 'unknown';

/** Severity bucket for an operator-authored incident. */
export type IncidentSeverity = 'info' | 'minor' | 'major' | 'critical';

/** Workflow state of an operator-authored incident. */
export type IncidentStatus =
  | 'investigating'
  | 'identified'
  | 'monitoring'
  | 'resolved';

export interface PublicComponent {
  id: string;
  name: string;
  description: string;
  status: ComponentStatusValue;
  /** Operational time over the trailing 90 days, excluding maintenance. */
  uptime_90d: number | null;
  last_change_at: string | null;
}

export interface PublicComponentsResponse {
  components: PublicComponent[];
  overall: ComponentStatusValue;
  generated_at: string;
}

export interface PublicIncidentUpdate {
  posted_at: string;
  status: IncidentStatus;
  body: string;
}

export interface PublicIncident {
  id: string;
  slug: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  started_at: string;
  resolved_at: string | null;
  affects: string[];
  affects_names: string[];
  updates: PublicIncidentUpdate[];
}

export interface PublicIncidentsResponse {
  active: PublicIncident[];
  recent_resolved: PublicIncident[];
  generated_at: string;
}

export interface PublicMaintenance {
  id: string;
  title: string;
  body: string;
  starts_at: string;
  ends_at: string;
  affects: string[];
  affects_names: string[];
  is_active: boolean;
}

export interface PublicMaintenanceResponse {
  windows: PublicMaintenance[];
  generated_at: string;
}

/**
 * Daily uptime bar bucket. `status_level`:
 * 0 ok | 1 minor (degraded/unknown) | 2 major (partial/down) | 3 maintenance.
 */
export interface PublicHistoryDay {
  date: string;
  status_level: 0 | 1 | 2 | 3;
  operational_seconds: number;
  degraded_seconds: number;
  down_seconds: number;
  maintenance_seconds: number;
  unknown_seconds: number;
}

export interface PublicHistoryResponse {
  component_id: string;
  days: number;
  buckets: PublicHistoryDay[];
  uptime_percent: number | null;
}
