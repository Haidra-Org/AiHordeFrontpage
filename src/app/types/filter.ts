/**
 * Filter types and interfaces for AI Horde filter management.
 * Based on API documentation at https://stablehorde.net/api/swagger.json
 */

/**
 * Details of a single filter entry.
 * Returned by GET /v2/filters and GET /v2/filters/{filter_id}
 */
export interface FilterDetails {
  /** UUID of the filter */
  id: string;
  /** The regex pattern for this filter (e.g., "ac.*") */
  regex: string;
  /** Filter type identifier (10-29) */
  filter_type: number;
  /** Description about what this regex is catching */
  description?: string;
  /** Replacement text when filter matches (default: "") */
  replacement?: string;
  /** Username of the moderator who added/updated this filter */
  user: string;
}

/**
 * Compiled regex for a filter type.
 * Returned by GET /v2/filters/regex
 */
export interface FilterRegex {
  /** Filter type identifier (10-29) */
  filter_type: number;
  /** The full compiled regex for this filter type */
  regex: string;
}

/**
 * Request body for creating a new filter.
 * Used with PUT /v2/filters
 */
export interface CreateFilterRequest {
  /** The regex pattern to add (e.g., "ac.*") */
  regex: string;
  /** Filter type identifier (10-29) */
  filter_type: number;
  /** Description about what this regex is catching */
  description?: string;
  /** Replacement text when filter matches (default: "") */
  replacement?: string;
}

/**
 * Request body for updating an existing filter.
 * Used with PATCH /v2/filters/{filter_id}
 */
export interface UpdateFilterRequest {
  /** The regex pattern (optional) */
  regex?: string;
  /** Filter type identifier (10-29) (optional) */
  filter_type?: number;
  /** Description about what this regex is catching (optional) */
  description?: string;
  /** Replacement text when filter matches (optional) */
  replacement?: string;
}

/**
 * Response from testing a prompt against filters.
 * Returned by POST /v2/filters
 */
export interface FilterPromptSuspicion {
  /** Suspicion rating (≥2 means the prompt would be blocked) */
  suspicion: number;
  /** Words/patterns that matched filters */
  matches?: string[];
}

/**
 * Request body for testing a prompt against filters.
 * Used with POST /v2/filters
 */
export interface TestPromptRequest {
  /** The prompt to test */
  prompt: string;
}

/**
 * Filter type identifiers and their human-readable labels.
 * Filter types range from 10-29.
 */
export const FILTER_TYPE_LABELS: Record<number, string> = {
  10: 'CSAM',
  11: 'Specific Person',
  20: 'NSFW',
};

/**
 * Get human-readable label for a filter type.
 * @param filterType The filter type number (10-29)
 * @returns Human-readable label or "Unknown (n)" if not found
 */
export function getFilterTypeLabel(filterType: number): string {
  return FILTER_TYPE_LABELS[filterType] ?? `Unknown (${filterType})`;
}

/**
 * Get all available filter types as an array of {value, label} objects.
 * Useful for dropdown menus.
 */
export function getFilterTypeOptions(): { value: number; label: string }[] {
  return Object.entries(FILTER_TYPE_LABELS).map(([value, label]) => ({
    value: parseInt(value, 10),
    label: `${value}: ${label}`,
  }));
}
