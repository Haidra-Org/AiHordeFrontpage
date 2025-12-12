/**
 * API request/response types for style operations.
 */

import {
  ImageStyleParams,
  StyleExample,
  TextStyleParams,
} from './style';
import { CollectionType, StyleReference } from './style-collection';

// ============================================================================
// Query Parameters
// ============================================================================

/**
 * Sort options for style listings.
 */
export type StyleSortOption = 'popular' | 'age';

/**
 * Query parameters for fetching style lists.
 */
export interface StyleQueryParams {
  /** Sort order: 'popular' (by usage) or 'age' (by date added). */
  sort?: StyleSortOption;
  /** Page number for pagination (1-based). 25 styles per page. */
  page?: number;
  /** Filter by tag. */
  tag?: string;
  /** Filter by compatible model. */
  model?: string;
}

/**
 * Query parameters for fetching collection lists.
 */
export interface CollectionQueryParams {
  /** Sort order: 'popular' or 'age'. */
  sort?: StyleSortOption;
  /** Page number for pagination (1-based). */
  page?: number;
  /** Filter by collection type. */
  type?: CollectionType | 'all';
}

// ============================================================================
// Create/Update Payloads
// ============================================================================

/**
 * Payload for creating a new image style.
 */
export interface CreateImageStyleInput {
  /** Display name. 1-100 characters. */
  name: string;
  /** Description. 10-1000 characters. */
  info?: string;
  /** Prompt template with {p} and {np} placeholders. */
  prompt: string;
  /** Generation parameters. */
  params?: ImageStyleParams;
  /** Whether publicly listed. Default: true. */
  public?: boolean;
  /** Whether NSFW. Default: false. */
  nsfw?: boolean;
  /** Tags for categorization. */
  tags?: string[];
  /** Compatible model names. */
  models?: string[];
  /** Shared key ID for generation. */
  sharedkey?: string;
}

/**
 * Payload for updating an existing image style.
 * All fields are optional; only provided fields are updated.
 */
export interface UpdateImageStyleInput {
  name?: string;
  info?: string;
  prompt?: string;
  params?: ImageStyleParams;
  public?: boolean;
  nsfw?: boolean;
  tags?: string[];
  models?: string[];
  sharedkey?: string;
}

/**
 * Payload for creating a new text style.
 */
export interface CreateTextStyleInput {
  /** Display name. 1-100 characters. */
  name: string;
  /** Description. 10-1000 characters. */
  info?: string;
  /** Prompt template with {p} placeholder. */
  prompt: string;
  /** Generation parameters. */
  params?: TextStyleParams;
  /** Whether publicly listed. Default: true. */
  public?: boolean;
  /** Whether NSFW. Default: false. */
  nsfw?: boolean;
  /** Tags for categorization. */
  tags?: string[];
  /** Compatible model names. */
  models?: string[];
}

/**
 * Payload for updating an existing text style.
 */
export interface UpdateTextStyleInput {
  name?: string;
  info?: string;
  prompt?: string;
  params?: TextStyleParams;
  public?: boolean;
  nsfw?: boolean;
  tags?: string[];
  models?: string[];
}

// ============================================================================
// Example Management
// ============================================================================

/**
 * Payload for adding an example image to a style.
 */
export interface AddStyleExampleInput {
  /** URL of the example image. */
  url: string;
  /** Whether this is the primary example. */
  primary?: boolean;
}

/**
 * Payload for updating an existing example.
 */
export interface UpdateStyleExampleInput {
  /** New URL for the example. */
  url?: string;
  /** Whether this is the primary example. */
  primary?: boolean;
}

/**
 * Response from adding an example.
 */
export interface AddStyleExampleResponse {
  /** The created example. */
  example: StyleExample;
  /** Informational message. */
  message?: string;
}

// ============================================================================
// Collection Payloads (Stubbed for Phase 2)
// ============================================================================

/**
 * Payload for creating a collection.
 * @deprecated Phase 2 - not yet implemented
 */
export interface CreateCollectionInput {
  name: string;
  type: CollectionType;
  info?: string;
  public?: boolean;
  styles?: StyleReference[];
}

/**
 * Payload for updating a collection.
 * @deprecated Phase 2 - not yet implemented
 */
export interface UpdateCollectionInput {
  name?: string;
  info?: string;
  public?: boolean;
  styles?: StyleReference[];
}

// ============================================================================
// Client-Side Filtering
// ============================================================================

/**
 * Client-side filter state for style browsing.
 */
export interface StyleClientFilters {
  /** Text search query (matches name, creator, tags). */
  searchQuery: string;
  /** Hide NSFW styles. */
  hideNsfw: boolean;
}

/**
 * Default values for client-side filters.
 */
export const DEFAULT_CLIENT_FILTERS: StyleClientFilters = {
  searchQuery: '',
  hideNsfw: false,
};

/**
 * Default values for API query params.
 */
export const DEFAULT_QUERY_PARAMS: StyleQueryParams = {
  sort: 'popular',
  page: 1,
};
