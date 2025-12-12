/**
 * Style collection types for grouping styles together.
 */

/**
 * Reference to a style within a collection.
 */
export interface StyleReference {
  /** Full style name in format "creator::style::name". */
  name: string;
  /** Style UUID. */
  id: string;
}

/**
 * Collection type discriminator.
 */
export type CollectionType = 'image' | 'text';

/**
 * A collection of styles grouped together.
 */
export interface StyleCollection {
  /** Unique identifier for the collection. */
  id: string;
  /** Display name of the collection. 1-100 characters. */
  name: string;
  /** Type of styles in this collection. */
  type: CollectionType;
  /** Description of the collection. 1-1000 characters. */
  info?: string;
  /** Whether this collection is publicly listed. */
  public: boolean;
  /** Styles included in this collection. */
  styles: StyleReference[];
  /** Number of times styles from this collection have been used. */
  use_count: number;
  /** Creator username in format "alias#id". */
  creator?: string;
}

/**
 * Response from collection creation or update operations.
 */
export interface CollectionModifyResponse {
  /** The ID of the created or modified collection. */
  id: string;
  /** Informational message from the horde. */
  message?: string;
}
