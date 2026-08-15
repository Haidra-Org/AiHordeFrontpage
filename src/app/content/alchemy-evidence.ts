import { environment } from '../../environments/environment';

/**
 * The published alchemy evidence: one real source image run through the studio's
 * forms, and what came back.
 *
 * The manifest is generated beside the images by the evidence pipeline, so this
 * is a contract rather than a choice. What the app decides about a use case (its
 * forms, its prose, the order it is read in) lives in {@link ALCHEMY_USE_CASES};
 * this says only what was actually published.
 *
 * The library may not be published at all, which is the state a fresh checkout
 * is in. Nothing here treats that as an error: an absent manifest means the
 * pages have no pictures, and they are written to read as finished without them.
 */

/** Where the published alchemy runs live, beside the parameter sweeps. */
export const ALCHEMY_EVIDENCE_ROOT = `${environment.evidenceBaseUrl.replace(/\/+$/, '')}/alchemy`;

/**
 * What a run produced. An image-producing form publishes `result`; a form that
 * answers with words publishes `result_text`, a file beside the source rather
 * than a string in the manifest, so the manifest stays a listing.
 */
export interface AlchemyEvidenceFiles {
  source: string;
  result?: string;
  result_text?: string;
}

/** One form, run once, on one source. */
export interface AlchemyEvidenceEntry {
  use_case: string;
  form: string;
  title: string;
  files: AlchemyEvidenceFiles;
  model?: string;
  notes?: string;
}

export interface AlchemyEvidenceManifest {
  /** The API the runs were actually submitted to. */
  generated_against: string;
  entries: AlchemyEvidenceEntry[];
}

/** Where the manifest is published. */
export function alchemyEvidenceManifestUrl(): string {
  return `${ALCHEMY_EVIDENCE_ROOT}/manifest.json`;
}

/** Where one file the manifest names by a library-relative path is published. */
export function alchemyEvidenceAssetUrl(file: string): string {
  return `${ALCHEMY_EVIDENCE_ROOT}/${file}`;
}
