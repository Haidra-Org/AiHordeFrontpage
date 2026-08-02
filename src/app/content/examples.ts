import { environment } from '../../environments/environment';

/**
 * The published worked examples: what was actually submitted to the horde, what
 * came back, and what it cost.
 *
 * The manifest is generated beside the images by the asset pipeline, so this is
 * a contract rather than a choice. Everything the app decides about an example
 * (its steps, its prose, the order it is met in) lives in {@link FLOWS}; this
 * says only what was published.
 */

/**
 * Where the published example set is served from: a directory of the evidence
 * library, beside the parameter sweeps, rather than an asset of this repository.
 * Nothing generated is committed here; the library is published once and the
 * base URL is configuration.
 */
export const EXAMPLES_ROOT = `${environment.evidenceBaseUrl.replace(/\/+$/, '')}/tutorials`;

/** One entry of the manifest. */
export interface ExampleFlow {
  id: string;
  directory: string;
  /** The technique's own name, which rides behind the task the page is named by. */
  title: string;
  summary: string;
  status: 'available' | 'skipped';
  skipped_reason?: string;
  model?: string;
  seed?: string;
  result?: string;
  source?: string;
  mask?: string;
  before?: string;
  request?: string;
  files: string[];
}

export interface ExampleManifest {
  /** The API the examples were actually submitted to. */
  generated_against: string;
  flows: ExampleFlow[];
}

/** The subset of a flow's `meta.json` the pages report. */
export interface ExampleMeta {
  model?: string;
  seed?: string;
  kudos_charged?: number;
  wall_time_seconds?: number;
  deviations?: string;
}

/** Where the manifest is published. */
export function exampleManifestUrl(): string {
  return `${EXAMPLES_ROOT}/manifest.json`;
}

/** Where one of a flow's files is published. */
export function exampleAssetUrl(flow: ExampleFlow, file: string): string {
  return `${EXAMPLES_ROOT}/${flow.directory}/${file}`;
}

/** A flow's result image, where it has one. */
export function exampleResultUrl(flow: ExampleFlow): string {
  return flow.result ? exampleAssetUrl(flow, flow.result) : '';
}
