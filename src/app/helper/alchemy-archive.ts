/**
 * Bundles a completed alchemy job into a downloadable zip: the raw,
 * machine-readable results as JSON plus every result image fetched and stored
 * as a real file. Worker result images are short-lived remote URLs, so this is
 * the only chance to capture them before the Horde expires them.
 */
import { strToU8, zipSync, type Zippable } from 'fflate';
import {
  ALCHEMY_DATA_FORMS,
  type AlchemyForm,
  type AlchemyStatusResponse,
} from '../types/generation';
import {
  isLikelyImageFileLink,
  sanitizeGenerationResponsePayload,
} from './generation-image';
import {
  buildAlchemyJobHtml,
  type AlchemyReportImage,
} from './alchemy-html-report';

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

/**
 * Build a zip archive for a single alchemy job. Image fetches run concurrently
 * and failures are tolerated so a CORS-blocked or expired image never prevents
 * the user from saving the rest of their results.
 */
export async function buildAlchemyJobArchive(
  jobId: string,
  status: AlchemyStatusResponse,
  fetchFn: typeof fetch = fetch,
): Promise<AlchemyJobArchive> {
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

  const imageForms = (status.forms ?? [])
    .map((form) => ({ form, url: formImageUrl(form) }))
    .filter((entry): entry is { form: AlchemyForm; url: string } =>
      Boolean(entry.url),
    );

  await Promise.all(
    imageForms.map(async ({ form, url }) => {
      try {
        const response = await fetchFn(url);
        if (!response.ok) {
          failedImages += 1;
          return;
        }
        const buffer = new Uint8Array(await response.arrayBuffer());
        const ext = imageExtension(url, response.headers.get('content-type'));
        const name = uniqueName(`images/${form.form}.${ext}`, usedNames);
        files[name] = buffer;
        reportImages.push({ form: form.form, fileName: name });
      } catch {
        failedImages += 1;
      }
    }),
  );

  files['results.html'] = strToU8(
    buildAlchemyJobHtml(jobId, status, reportImages),
  );

  const imageCount = reportImages.length;
  return { bytes: zipSync(files), imageCount, failedImages };
}
