import {
  ComponentStatusValue,
  IncidentSeverity,
  IncidentStatus,
} from '../../../types/status';

/** Selectable component states for an override target. */
export const COMPONENT_STATUS_VALUES: readonly ComponentStatusValue[] = [
  'operational',
  'degraded',
  'partial',
  'down',
  'maintenance',
  'unknown',
] as const;

/** Severity buckets a moderator can assign to an incident. */
export const INCIDENT_SEVERITIES: readonly IncidentSeverity[] = [
  'info',
  'minor',
  'major',
  'critical',
] as const;

/** Workflow states an incident can move through. */
export const INCIDENT_STATUSES: readonly IncidentStatus[] = [
  'investigating',
  'identified',
  'monitoring',
  'resolved',
] as const;

/** Statuses a moderator can post on the incident timeline (resolved excluded:
 * that transition goes through the dedicated resolve action). */
export const INCIDENT_UPDATE_STATUSES: readonly IncidentStatus[] = [
  'investigating',
  'identified',
  'monitoring',
] as const;

/** Maps an incident severity onto the shared design-system badge class. */
export function severityBadgeClass(severity: string): string {
  const map: Record<string, string> = {
    info: 'badge-info',
    minor: 'badge-warning',
    major: 'badge-danger',
    critical: 'badge-danger',
  };
  return map[severity] ?? 'badge-secondary';
}

/** Convert a `datetime-local` input value to an ISO 8601 string, or null. */
export function datetimeLocalToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
