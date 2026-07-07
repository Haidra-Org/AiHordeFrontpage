/**
 * Renders a single alchemy job's text/data results (caption, NSFW check,
 * interrogation tags) into a self-contained, portable HTML document. The page
 * embeds its own styling and decoration (inline CSS + inline SVG only, never
 * base64 image data) so it opens correctly from anywhere after the zip is
 * extracted. Processed images are shipped as separate files in the same zip and
 * are referenced here by their relative path rather than inlined.
 */
import { escapeHtml, highlightJson, stringifyAsJson } from './json-formatter';
import {
  ALCHEMY_DATA_FORMS,
  type AlchemyForm,
  type AlchemyStatusResponse,
  type InterrogationDetails,
  type InterrogationTag,
} from '../types/generation';
import { sanitizeGenerationResponsePayload } from './generation-image';

/** A processed image already written into the archive, by relative path. */
export interface AlchemyReportImage {
  form: string;
  fileName: string;
}

const SECTION_ORDER = [
  'tags',
  'mediums',
  'techniques',
  'movements',
  'flavors',
  'artists',
  'sites',
] as const;

const SECTION_LABELS: Record<string, string> = {
  tags: 'Tags',
  sites: 'Likely sources',
  artists: 'Artists',
  flavors: 'Flavors',
  mediums: 'Mediums',
  movements: 'Movements',
  techniques: 'Techniques',
};

const FORM_LABELS: Record<string, string> = {
  caption: 'Caption',
  interrogation: 'Interrogation (tags)',
  nsfw: 'NSFW check',
  vectorize: 'Vectorize',
  palette: 'Palette',
  describe: 'Describe',
  GFPGAN: 'GFPGAN (face fix)',
  'GFPGANv1.3': 'GFPGAN v1.3 (face fix)',
  CodeFormers: 'CodeFormers (face fix)',
  RestoreFormer: 'RestoreFormer (face fix)',
  RealESRGAN_x4plus: 'RealESRGAN x4',
  RealESRGAN_x2plus: 'RealESRGAN x2',
  RealESRGAN_x4plus_anime_6B: 'RealESRGAN x4 (anime)',
  NMKD_Siax: 'NMKD Siax (upscale)',
  '4x_AnimeSharp': '4x AnimeSharp (upscale)',
  '4xNomos8kSC': '4x Nomos 8k SC (upscale)',
  '4xLSDIRplus': '4x LSDIR+ (upscale)',
  '4xNomosWebPhoto_RealPLKSR': '4x Nomos WebPhoto RealPLKSR',
  '4xNomos2_realplksr_dysample': '4x Nomos2 RealPLKSR Dysample',
  '4xNomos2_hq_dat2': '4x Nomos2 HQ DAT2',
  '2xModernSpanimationV1': '2x Modern Spanimation v1',
  strip_background: 'Strip background',
};

const DESCRIBE_LABELS: Record<string, string> = {
  dhash: 'dHash',
  phash: 'pHash',
  width: 'Width',
  height: 'Height',
  format: 'Format',
  blurhash: 'BlurHash',
  has_alpha: 'Alpha channel',
  aspect_ratio: 'Aspect ratio',
};

const DESCRIBE_ORDER = [
  'format',
  'width',
  'height',
  'aspect_ratio',
  'has_alpha',
  'dhash',
  'phash',
  'blurhash',
] as const;

function formLabel(form: string): string {
  return FORM_LABELS[form] ?? form;
}

function isDataForm(form: string): boolean {
  return (ALCHEMY_DATA_FORMS as readonly string[]).includes(form);
}

function sectionRank(key: string): number {
  const index = (SECTION_ORDER as readonly string[]).indexOf(key);
  return index === -1 ? SECTION_ORDER.length : index;
}

function describeRank(key: string): number {
  const index = (DESCRIBE_ORDER as readonly string[]).indexOf(key);
  return index === -1 ? DESCRIBE_ORDER.length : index;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function extractSvgMarkup(value: string): string {
  const match = /<svg\b[\s\S]*<\/svg>/i.exec(value);
  return match?.[0].trim() ?? '';
}

function interrogationDetails(form: AlchemyForm): InterrogationDetails | null {
  if (form.form !== 'interrogation' || !form.result) return null;
  if (form.result.interrogation) return form.result.interrogation;
  const hasSectionArrays = Object.values(form.result).some((v) =>
    Array.isArray(v),
  );
  return hasSectionArrays
    ? (form.result as unknown as InterrogationDetails)
    : null;
}

function renderCaption(form: AlchemyForm): string {
  const caption = form.result?.caption;
  if (typeof caption !== 'string' || !caption) return '';
  return `<blockquote class="caption">${escapeHtml(caption)}</blockquote>`;
}

function renderNsfw(form: AlchemyForm): string {
  const flagged = form.result?.nsfw === true;
  const cls = flagged ? 'badge badge--danger' : 'badge badge--ok';
  const label = flagged ? 'NSFW detected' : 'No NSFW detected';
  return `<p><span class="${cls}">${label}</span></p>`;
}

function renderInterrogation(form: AlchemyForm): string {
  const details = interrogationDetails(form);
  if (!details) return '';

  const groups = Object.entries(details)
    .filter(
      (entry): entry is [string, InterrogationTag[]] =>
        Array.isArray(entry[1]) && entry[1].length > 0,
    )
    .map(([key, entries]) => {
      const sorted = [...entries].sort((a, b) => b.confidence - a.confidence);
      const top = sorted[0]?.confidence ?? 0;
      return { key, top, entries: sorted };
    })
    .sort((a, b) => sectionRank(a.key) - sectionRank(b.key));

  if (groups.length === 0) return '';

  const renderedGroups = groups
    .map((group) => {
      const rows = group.entries
        .map((tag) => {
          const weight = group.top > 0 ? (tag.confidence / group.top) * 100 : 0;
          const conf = `${tag.confidence.toFixed(1)}%`;
          return `<li class="tag" title="Confidence: ${conf}">
            <span class="tag__bar" style="width:${weight.toFixed(1)}%"></span>
            <span class="tag__text">${escapeHtml(tag.text)}</span>
            <span class="tag__conf">${conf}</span>
          </li>`;
        })
        .join('');
      const label = SECTION_LABELS[group.key] ?? group.key;
      return `<section class="tag-group">
        <h4>${escapeHtml(label)} <span class="count">${group.entries.length}</span></h4>
        <ul class="tags">${rows}</ul>
      </section>`;
    })
    .join('');

  return `<div class="tag-groups">${renderedGroups}</div>`;
}

function renderInlineText(form: AlchemyForm): string {
  const value = form.result?.[form.form];
  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    text = String(value);
  } else if (Array.isArray(value) || (value && typeof value === 'object')) {
    text = stringifyAsJson(value);
  }
  if (!text) return '';
  return `<pre class="inline-text">${escapeHtml(text)}</pre>`;
}

function renderDescribe(form: AlchemyForm): string {
  const value = form.result?.describe;
  if (!isRecord(value)) return '';
  const fields = Object.entries(value)
    .sort(([a], [b]) => describeRank(a) - describeRank(b))
    .map(([key, rawValue]) => {
      const label = DESCRIBE_LABELS[key] ?? key;
      let display = '';
      if (typeof rawValue === 'boolean') {
        display = rawValue ? 'Yes' : 'No';
      } else if (typeof rawValue === 'number') {
        display =
          key === 'width' || key === 'height'
            ? `${rawValue}px`
            : key === 'aspect_ratio'
              ? rawValue.toFixed(4)
              : String(rawValue);
      } else if (typeof rawValue === 'string') {
        display = rawValue;
      } else {
        display = stringifyAsJson(rawValue);
      }
      return `<div class="describe-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(display)}</dd></div>`;
    })
    .join('');
  return fields ? `<dl class="describe-grid">${fields}</dl>` : '';
}

function renderPalette(form: AlchemyForm): string {
  const value = form.result?.palette;
  const colors = isRecord(value) ? value['colors'] : null;
  if (!Array.isArray(colors)) return '';
  const rows = colors
    .filter((entry): entry is { hex: string; proportion: number } => {
      if (!isRecord(entry)) return false;
      return (
        typeof entry['hex'] === 'string' &&
        /^#[0-9a-f]{6}$/i.test(entry['hex']) &&
        typeof entry['proportion'] === 'number' &&
        Number.isFinite(entry['proportion'])
      );
    })
    .map((entry) => {
      const percent = `${(entry.proportion * 100).toFixed(1)}%`;
      const safeHex = escapeHtml(entry.hex);
      return `<div class="palette-row">
        <span class="palette-swatch" style="background:${safeHex}"></span>
        <code>${safeHex}</code>
        <span class="palette-bar"><span style="width:${percent};background:${safeHex}"></span></span>
        <span class="palette-percent">${percent}</span>
      </div>`;
    })
    .join('');
  return rows ? `<div class="palette-list">${rows}</div>` : '';
}

function renderVectorize(form: AlchemyForm): string {
  const value = form.result?.vectorize;
  if (typeof value !== 'string') return '';
  const svg = extractSvgMarkup(value);
  if (!svg) return '';
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return `<div class="vector-preview"><img src="${escapeHtml(src)}" alt="SVG preview" /></div>`;
}

function renderDataForm(form: AlchemyForm): string {
  let body = '';
  if (form.form === 'caption') {
    body = renderCaption(form);
  } else if (form.form === 'nsfw') {
    body = renderNsfw(form);
  } else if (form.form === 'interrogation') {
    body = renderInterrogation(form);
  } else if (form.form === 'describe') {
    body = renderDescribe(form);
  } else if (form.form === 'palette') {
    body = renderPalette(form);
  } else if (form.form === 'vectorize') {
    body = renderVectorize(form);
  } else {
    body = renderInlineText(form);
  }
  if (!body) return '';

  return `<article class="result">
    <h3>${escapeHtml(formLabel(form.form))}</h3>
    ${body}
  </article>`;
}

function renderImageList(images: readonly AlchemyReportImage[]): string {
  if (images.length === 0) return '';
  const items = images
    .map(
      (image) =>
        `<li><span class="image-form">${escapeHtml(formLabel(image.form))}</span>
        <code>${escapeHtml(image.fileName)}</code></li>`,
    )
    .join('');
  return `<article class="result">
    <h3>Processed images</h3>
    <p class="muted">Saved alongside this page in the archive:</p>
    <ul class="image-list">${items}</ul>
  </article>`;
}

const HEADER_MARK = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
  <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.3 24.3 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"/>
</svg>`;

const REPORT_STYLES = `:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1f2430;
  background: #f5f6fa;
}
.page { max-width: 56rem; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
header.report-head {
  display: flex; align-items: center; gap: 0.85rem;
  padding: 1.25rem 1.5rem; border-radius: 1rem; color: #fff;
  background: linear-gradient(135deg, #6d5efc 0%, #9333ea 55%, #db2777 100%);
  box-shadow: 0 10px 30px rgba(109, 94, 252, 0.25);
}
header.report-head h1 { margin: 0; font-size: 1.35rem; }
header.report-head .sub { margin: 0.15rem 0 0; font-size: 0.85rem; opacity: 0.85; }
.meta { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; margin: 1rem 0 1.5rem; font-size: 0.85rem; color: #5b6172; }
.meta code { font-size: 0.85rem; }
.result {
  background: #fff; border: 1px solid #e6e8f0; border-radius: 0.85rem;
  padding: 1.1rem 1.25rem; margin-bottom: 1rem;
}
.result h3 { margin: 0 0 0.75rem; font-size: 1.05rem; }
.caption { margin: 0; padding: 0.5rem 0.9rem; border-left: 3px solid #9333ea; background: #faf5ff; font-style: italic; }
.inline-text { margin: 0; padding: 0.75rem 0.9rem; border: 1px solid #e6e8f0; border-radius: 0.6rem; background: #f8f9fc; white-space: pre-wrap; word-break: break-word; font: inherit; }
.describe-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.6rem; margin: 0; }
.describe-item { min-width: 0; padding: 0.65rem; border: 1px solid #e6e8f0; border-radius: 0.45rem; background: #f8f9fc; }
.describe-item dt { margin: 0 0 0.2rem; color: #5b6172; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.describe-item dd { margin: 0; overflow-wrap: anywhere; }
.palette-list { display: grid; gap: 0.45rem; }
.palette-row { display: grid; grid-template-columns: 2rem 6rem minmax(6rem, 1fr) 4rem; align-items: center; gap: 0.6rem; }
.palette-swatch { width: 2rem; height: 2rem; border: 1px solid rgba(0,0,0,0.2); border-radius: 0.4rem; }
.palette-bar { height: 0.6rem; overflow: hidden; border-radius: 999px; background: #e6e8f0; }
.palette-bar span { display: block; height: 100%; min-width: 2px; }
.palette-percent { color: #5b6172; font-size: 0.8rem; text-align: right; font-variant-numeric: tabular-nums; }
.vector-preview { display: grid; place-items: center; min-height: 12rem; max-height: 32rem; overflow: auto; padding: 1rem; border: 1px solid #e6e8f0; border-radius: 0.6rem; background: #f8f9fc; }
.vector-preview img { display: block; max-width: 100%; max-height: 30rem; height: auto; }
.badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
.badge--ok { background: #dcfce7; color: #166534; }
.badge--danger { background: #fee2e2; color: #991b1b; }
.tag-groups { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); }
.tag-group h4 { margin: 0 0 0.5rem; font-size: 0.95rem; }
.tag-group .count { color: #8a90a2; font-weight: 400; font-size: 0.8rem; }
ul.tags { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.3rem; }
li.tag { position: relative; display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0.55rem; border-radius: 0.45rem; overflow: hidden; background: #f1f2f8; }
.tag__bar { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, rgba(109,94,252,0.18), rgba(147,51,234,0.18)); }
.tag__text { position: relative; z-index: 1; }
.tag__conf { position: relative; z-index: 1; margin-left: auto; font-variant-numeric: tabular-nums; font-size: 0.8rem; color: #5b6172; }
.image-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
.image-list li { display: flex; gap: 0.6rem; align-items: baseline; flex-wrap: wrap; }
.image-form { font-weight: 600; }
.muted { color: #8a90a2; font-size: 0.85rem; margin: 0 0 0.6rem; }
details.raw { margin-top: 0.5rem; }
details.raw summary { cursor: pointer; color: #5b6172; font-size: 0.9rem; }
pre.json {
  margin: 0.6rem 0 0; padding: 1rem; border-radius: 0.6rem; overflow-x: auto;
  background: #1f2430; color: #e6e8f0; font: 0.82rem/1.5 "SFMono-Regular", Menlo, Consolas, monospace;
}
.json-key { color: #9cdcfe; }
.json-string { color: #ce9178; }
.json-number { color: #b5cea8; }
.json-boolean { color: #569cd6; }
.json-null { color: #c586c0; }
footer { margin-top: 2rem; font-size: 0.8rem; color: #8a90a2; text-align: center; }`;

/**
 * Build the portable HTML report for one alchemy job. Only text/data results
 * are rendered as friendly views; image results are listed by their archive
 * file name. A collapsed raw-JSON block (syntax highlighted with the app's own
 * highlighter) is always included for completeness.
 */
export function buildAlchemyJobHtml(
  jobId: string,
  status: AlchemyStatusResponse,
  images: readonly AlchemyReportImage[] = [],
): string {
  const forms = status.forms ?? [];
  const dataBlocks = forms
    .filter((form) => isDataForm(form.form) && form.result)
    .map((form) => renderDataForm(form))
    .filter(Boolean)
    .join('\n');

  const imageBlock = renderImageList(images);
  const generatedAt = new Date().toISOString();

  const rawJson = stringifyAsJson(
    sanitizeGenerationResponsePayload({ id: jobId, ...status }),
  );
  const rawBlock = rawJson
    ? `<details class="raw">
        <summary>Raw result data</summary>
        <pre class="json">${highlightJson(rawJson)}</pre>
      </details>`
    : '';

  const body =
    dataBlocks || imageBlock
      ? `${dataBlocks}\n${imageBlock}`
      : `<article class="result"><p class="muted">This job produced no text results.</p></article>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI Horde alchemy results ${escapeHtml(jobId)}</title>
<style>${REPORT_STYLES}</style>
</head>
<body>
<div class="page">
  <header class="report-head">
    ${HEADER_MARK}
    <div>
      <h1>Alchemy results</h1>
      <p class="sub">AI Horde &middot; portable result page</p>
    </div>
  </header>
  <div class="meta">
    <span>Job <code>${escapeHtml(jobId)}</code></span>
    <span>State: ${escapeHtml(status.state ?? 'unknown')}</span>
    <span>Generated: ${escapeHtml(generatedAt)}</span>
  </div>
  ${body}
  ${rawBlock}
  <footer>Generated by the AI Horde frontend. Results are not stored server-side.</footer>
</div>
</body>
</html>`;
}
