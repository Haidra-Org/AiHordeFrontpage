import {
  AlchemyFormName,
  AlchemyStatusResponse,
  AnnotationControlType,
} from './generation';

/** Whether the request's source image was uploaded or referenced by URL. */
export type AlchemySourceMode = 'url' | 'upload';

/**
 * What an alchemy image blob is. `source` and `thumb` belong to the request;
 * `result` is what a post-processor form returned.
 */
export type StoredAlchemyImageKind = 'source' | 'thumb' | 'result';

/** An image blob attached to a stored alchemy job. */
export interface StoredAlchemyImage {
  localId: string;
  /**
   * `source` or `thumb` for the request's own image; for a result, the form's
   * key from `alchemy-job-view`, which carries the detector for a control map
   * so two of them in one job do not overwrite each other.
   */
  imageId: string;
  kind: StoredAlchemyImageKind;
  blob: Blob;
  mimeType: string;
  /** The presigned URL these bytes came from, kept as provenance. */
  sourceUrl?: string;
  fetchedAt?: number;
}

/**
 * A submitted alchemy request and everything the horde returned for it.
 *
 * `status` is stored verbatim rather than picked apart, so every per-form
 * payload the horde sends back (captions, interrogation tag arrays, palettes,
 * describe records, vectorize markup, result image links) survives a reload and
 * the renderers keep receiving exactly the shape they were written against.
 *
 * Result images are downloaded into `alchemyImages` as each form completes,
 * because the links the horde returns are presigned and stop working after
 * about half an hour. `storedResultForms` and `failedResultForms` record which
 * forms have been captured and which are past saving.
 */
export interface StoredAlchemyJob {
  localId: string;
  /** The horde's interrogation id. */
  jobId: string;
  createdAt: number;
  updatedAt: number;
  forms: AlchemyFormName[];
  /** Detectors requested by control-map forms, in the order they were picked. */
  annotationControlTypes?: readonly AnnotationControlType[];
  /**
   * The single detector jobs carried before a request could ask for several.
   * Read only, so an old job still names its detector; every write uses
   * `annotationControlTypes`.
   */
  annotationControlType?: AnnotationControlType;
  slowWorkers: boolean;
  sourceMode: AlchemySourceMode;
  /** The literal `source_image` when it was a URL; absent for an upload. */
  sourceUrl?: string;
  kudos?: number;
  status: AlchemyStatusResponse | null;
  done: boolean;
  faulted: boolean;
  cancelled: boolean;
  notFound: boolean;
  /** Result keys whose image is held in `alchemyImages`. */
  storedResultForms: string[];
  /** Result keys whose image can no longer be retrieved. */
  failedResultForms: string[];
  lastPolledAt?: number;
}
