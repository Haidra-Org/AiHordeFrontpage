/**
 * Bundles a completed alchemy job into a downloadable zip: the raw,
 * machine-readable results as JSON plus every result image as a real file.
 * Images come from the copies the queue already saved; the horde's own links
 * are only reached for a form whose download did not land, since those links
 * expire.
 */
import { strToU8, zipSync, type Zippable } from 'fflate';
import {
  ALCHEMY_DATA_FORMS,
  type AlchemyForm,
  type AlchemyStatusResponse,
  type AnnotationControlType,
} from '../types/generation';
import { formViews } from './alchemy-job-view';
import {
  isLikelyImageFileLink,
  sanitizeGenerationResponsePayload,
} from './generation-image';
import {
  buildAlchemyJobHtml,
  type AlchemyReportImage,
} from './alchemy-html-report';
import type { StoredAlchemyImage } from '../types/alchemy-job';

export interface AlchemyJobArchive {
  bytes: Uint8Array;
  /** Result images successfully fetched and written into the archive. */
  imageCount: number;
  /** Images that could not be fetched (network/CORS); the zip is still built. */
  failedImages: number;
}

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/** Post-processor forms key their result image URL under the form name. */
function formImageUrl(form: AlchemyForm): string | null {
  if ((ALCHEMY_DATA_FORMS as readonly string[]).includes(form.form)) {
    return null;
  }
  const value = form.result?.[form.form];
  return typeof value === 'string' && isLikelyImageFileLink(value)
    ? value
    : null;
}

function imageExtension(url: string, contentType: string | null): string {
  if (contentType) {
    const base = contentType.split(';')[0].trim().toLowerCase();
    const mapped = CONTENT_TYPE_EXTENSIONS[base];
    if (mapped) {
      return mapped;
    }
  }
  const match = /\.([a-z0-9]{3,4})(?:$|\?|#)/i.exec(url);
  return match ? match[1].toLowerCase() : 'img';
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);
  let counter = 2;
  let candidate = `${stem}-${counter}${ext}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${stem}-${counter}${ext}`;
  }
  used.add(candidate);
  return candidate;
}

export interface AlchemyArchiveOptions {
  /** Result images already held locally, preferred over a network fetch. */
  storedImages?: readonly StoredAlchemyImage[];
  /** The detectors the request asked for, so each control map is named by its own. */
  annotationControlTypes?: readonly AnnotationControlType[];
  fetchFn?: typeof fetch;
}

/**
 * Build a zip archive for a single alchemy job. Any form without a stored copy
 * is fetched, concurrently, and a failure is tolerated so a CORS-blocked or
 * expired image never prevents the user from saving the rest of their results.
 */
/** A job's files before zipping, so a series can hold many under folders. */
export interface AlchemyJobFiles {
  files: Zippable;
  imageCount: number;
  failedImages: number;
}

export async function buildAlchemyJobArchive(
  jobId: string,
  status: AlchemyStatusResponse,
  options: AlchemyArchiveOptions = {},
): Promise<AlchemyJobArchive> {
  const { files, imageCount, failedImages } = await collectAlchemyJobFiles(
    jobId,
    status,
    options,
  );
  return { bytes: zipSync(files), imageCount, failedImages };
}

/** One request of a series archive: its id, status and what it holds. */
export interface AlchemySeriesEntry {
  jobId: string;
  status: AlchemyStatusResponse;
  options?: AlchemyArchiveOptions;
}

/**
 * Every request of a series in one zip, each under a folder named for its
 * id, with the table the reader exported beside them. The folders hold what
 * the per-request zip holds, so nothing has two shapes.
 */
export async function buildAlchemySeriesArchive(
  entries: readonly AlchemySeriesEntry[],
  csv: { fileName: string; text: string } | null,
): Promise<AlchemyJobArchive> {
  const files: Zippable = {};
  let imageCount = 0;
  let failedImages = 0;
  for (const entry of entries) {
    const collected = await collectAlchemyJobFiles(
      entry.jobId,
      entry.status,
      entry.options,
    );
    for (const [name, data] of Object.entries(collected.files)) {
      files[`${entry.jobId}/${name}`] = data;
    }
    imageCount += collected.imageCount;
    failedImages += collected.failedImages;
  }
  if (csv) {
    files[csv.fileName] = strToU8(csv.text);
  }
  return { bytes: zipSync(files), imageCount, failedImages };
}

export async function collectAlchemyJobFiles(
  jobId: string,
  status: AlchemyStatusResponse,
  options: AlchemyArchiveOptions = {},
): Promise<AlchemyJobFiles> {
  const {
    storedImages = [],
    annotationControlTypes = [],
    fetchFn = fetch,
  } = options;
  const files: Zippable = {};

  const rawJson = JSON.stringify(
    sanitizeGenerationResponsePayload({ id: jobId, ...status }),
    null,
    2,
  );
  files['results.json'] = strToU8(rawJson);

  const usedNames = new Set<string>(['results.json', 'results.html']);
  const reportImages: AlchemyReportImage[] = [];
  let failedImages = 0;

  const imageForms = formViews(status.forms ?? [], annotationControlTypes)
    .map((view) => ({ ...view, url: formImageUrl(view.form) }))
    .filter(
      (
        entry,
      ): entry is {
        form: AlchemyForm;
        detector: AnnotationControlType | null;
        key: string;
        url: string;
      } => Boolean(entry.url),
    );

  await Promise.all(
    imageForms.map(async ({ form, detector, key, url }) => {
      const report = { form: form.form, detector, fileName: '' };
      const stored = storedImages.find((image) => image.imageId === key);
      if (stored) {
        const ext = imageExtension(url, stored.mimeType);
        const name = uniqueName(`images/${key}.${ext}`, usedNames);
        files[name] = new Uint8Array(await stored.blob.arrayBuffer());
        reportImages.push({ ...report, fileName: name });
        return;
      }
      try {
        const response = await fetchFn(url);
        if (!response.ok) {
          failedImages += 1;
          return;
        }
        const buffer = new Uint8Array(await response.arrayBuffer());
        const ext = imageExtension(url, response.headers.get('content-type'));
        const name = uniqueName(`images/${key}.${ext}`, usedNames);
        files[name] = buffer;
        reportImages.push({ ...report, fileName: name });
      } catch {
        failedImages += 1;
      }
    }),
  );

  files['results.html'] = strToU8(
    buildAlchemyJobHtml(jobId, status, reportImages),
  );

  const imageCount = reportImages.length;
  return { files, imageCount, failedImages };
}
