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

/**
 * Moderator-only (privileged) shapes for the status-page backend, served under
 * `/api/v1/internal/*` and authorized with an AI Horde moderator `apikey`.
 *
 * These mirror the Pydantic models in `ai-horde-service-alerts`. Unlike the
 * public surface, these expose operator authoring fields (override reasons,
 * `created_by`, raw alert labels) and accept write requests.
 */

/** Who a record is visible to once published: end users or operators only. */
export type Audience = 'public' | 'internal';

export interface AdminComponent {
  id: string;
  name: string;
  description: string;
  audience: Audience;
  status: ComponentStatusValue;
  last_change_at: string | null;
  /** Operator-forced status, if an override is currently in effect. */
  override_status: ComponentStatusValue | null;
  override_reason: string | null;
  override_expires_at: string | null;
  override_id: string | null;
}

export interface ComponentOverrideRequest {
  target_status: ComponentStatusValue;
  reason?: string;
  expires_at?: string | null;
}

export interface AdminIncident {
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
  audience: Audience;
  created_by: string;
  /** Fingerprint of the alert this incident was promoted from, if any. */
  linked_alert_fingerprint: string | null;
}

export interface IncidentCreateRequest {
  title: string;
  audience?: Audience;
  severity: IncidentSeverity;
  status?: IncidentStatus;
  affected_components: string[];
  body: string;
  started_at?: string | null;
}

/**
 * Patches an incident's descriptive fields only. Status transitions go through
 * the timeline (`/updates`) and `/resolve` endpoints, not here.
 */
export interface IncidentUpdateRequest {
  title?: string | null;
  severity?: IncidentSeverity | null;
  affected_components?: string[] | null;
}

export interface IncidentResolveRequest {
  body: string;
}

export interface IncidentTimelinePostRequest {
  body: string;
  new_status: IncidentStatus;
}

export interface AdminMaintenance {
  id: string;
  title: string;
  body: string;
  starts_at: string;
  ends_at: string;
  affects: string[];
  affects_names: string[];
  is_active: boolean;
  audience: Audience;
  cancelled_at: string | null;
  activated_at: string | null;
  deactivated_at: string | null;
  created_by: string;
}

export interface MaintenanceCreateRequest {
  title: string;
  body?: string;
  audience?: Audience;
  starts_at: string;
  ends_at: string;
  affected_components: string[];
}

/** Condensed alert row from the moderator alert summary feed. */
export interface AdminAlertSummary {
  fingerprint: string;
  alertname: string;
  severity: string | null;
  component: string | null;
  summary: string | null;
  started_at: string;
  state: string;
  /** Set once this alert has been promoted into an incident. */
  promoted_incident_id: string | null;
}

/** Status sub-object on a raw Alertmanager alert; `state` is the key field. */
export interface AlertmanagerAlertStatus {
  state: string;
  silencedBy?: string[];
  inhibitedBy?: string[];
}

export interface AlertmanagerAlert {
  fingerprint: string;
  startsAt: string;
  endsAt: string | null;
  updatedAt: string | null;
  status: AlertmanagerAlertStatus;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  generatorURL: string | null;
}

export interface AlertPromotionRequest {
  title: string;
  severity: IncidentSeverity;
  affected_components: string[];
  body: string;
  audience?: Audience;
}
