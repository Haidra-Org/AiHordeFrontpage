/**
 * Side-effect-free view helpers for a tracked alchemy job. Extracted from
 * `AlchemyComponent` so both the page (which owns job state) and the results
 * browser (which only renders it) derive the same labels without duplication.
 */
import {
  AlchemyForm,
  AlchemyFormName,
  AlchemyStatusResponse,
  AnnotationControlType,
} from '../types/generation';
import { AlchemySourceMode, StoredAlchemyJob } from '../types/alchemy-job';

/** A tracked alchemy interrogation request and its latest polled status. */
export interface AlchemyJob {
  /** The horde's interrogation id. */
  id: string;
  /** The key this job is stored under, and the key its image blobs hang from. */
  localId: string;
  /**
   * Whether the request's image was uploaded or referenced by URL. A URL source
   * needs no stored blob and no object URL, so the renderers can tell at a
   * glance which jobs have anything to resolve.
   */
  sourceMode: AlchemySourceMode;
  /**
   * The job was taken from the account's list of active requests rather than
   * submitted here, so its operations are only what the horde has reported and
   * there is nothing to run again.
   */
  adopted: boolean;
  forms: AlchemyFormName[];
  /** Detectors used when `forms` includes the control-map operation. */
  annotationControlTypes: readonly AnnotationControlType[];
  status: AlchemyStatusResponse | null;
  done: boolean;
  faulted: boolean;
  cancelled: boolean;
  notFound: boolean;
  firstSeenAt: number;
  /**
   * A small renderable thumbnail of the request's source image: a remote URL
   * passthrough for a URL source, or an object URL over the stored 256px blob.
   * `null` until the owning page has resolved it, and for a source that failed
   * to decode. An object URL here belongs to whoever created it and must be
   * revoked on teardown.
   */
  sourceThumb: string | null;
  /**
   * The full-size renderable source image, so large surfaces (gallery tiles)
   * don't upscale the small `sourceThumb`. Resolved only for the job currently
   * on screen, because holding an object URL over every stored source would pin
   * the whole history in memory. `null` otherwise, and the renderers fall back
   * to `sourceThumb`.
   */
  sourceFull: string | null;
  /** Result keys whose image is held locally. */
  storedResultForms: string[];
  /** Result keys whose image can no longer be retrieved. */
  failedResultForms: string[];
}

/**
 * The detectors a stored job asked for. Jobs written before a request could
 * carry more than one kept a single `annotationControlType`, so that reads as a
 * list of one and nothing has to be rewritten on disk.
 */
export function storedAnnotationDetectors(
  stored: Pick<
    StoredAlchemyJob,
    'annotationControlTypes' | 'annotationControlType'
  >,
): readonly AnnotationControlType[] {
  if (stored.annotationControlTypes?.length) {
    return stored.annotationControlTypes;
  }
  return stored.annotationControlType ? [stored.annotationControlType] : [];
}

/**
 * View model for a stored job. A URL source needs nothing further: the link
 * renders directly at any size. An uploaded source is left null here, because
 * resolving its stored blob means creating object URLs, which belong to the
 * component that can revoke them rather than to a pure helper.
 */
export function toAlchemyJob(stored: StoredAlchemyJob): AlchemyJob {
  return {
    id: stored.jobId,
    localId: stored.localId,
    sourceMode: stored.sourceMode,
    adopted: stored.adopted === true,
    forms: stored.forms,
    annotationControlTypes: storedAnnotationDetectors(stored),
    status: stored.status,
    done: stored.done,
    faulted: stored.faulted,
    cancelled: stored.cancelled,
    notFound: stored.notFound,
    firstSeenAt: stored.createdAt,
    sourceThumb:
      stored.sourceMode === 'url' ? (stored.sourceUrl ?? null) : null,
    sourceFull: stored.sourceMode === 'url' ? (stored.sourceUrl ?? null) : null,
    storedResultForms: stored.storedResultForms,
    failedResultForms: stored.failedResultForms,
  };
}

/** The form name a control map is requested and returned under. */
const ANNOTATION_FORM = 'annotation';

/** A form of a request, paired with the detector it belongs to. */
export interface AlchemyFormView {
  form: AlchemyForm;
  /** Non-null only for a control-map form. */
  detector: AnnotationControlType | null;
  /** What tells this form's result apart from the rest of the job's. */
  key: string;
}

/** A form of a request, before the horde has said anything about it. */
export interface AlchemyFormEntry {
  form: AlchemyFormName;
  detector: AnnotationControlType | null;
  key: string;
}

/** A requested form and its latest reported state, for the checklist. */
export interface AlchemyFormRow extends AlchemyFormEntry {
  state: string;
}

/**
 * How a form's result is filed: under the form name, except for a control map,
 * which is filed under its detector as well. One request can ask for several
 * detectors and they all come back as the form `annotation`, so the name alone
 * would have them overwrite one another.
 */
export function resultFormKey(
  form: string,
  detector?: AnnotationControlType | null,
): string {
  return form === ANNOTATION_FORM && detector
    ? `${ANNOTATION_FORM}-${detector}`
    : form;
}

/**
 * Pair each returned form with the detector that produced it.
 *
 * The horde echoes the request payload back on the form, which names the
 * detector outright. Older servers do not, and then the detector is inferred:
 * a request that asked for one detector can only have used that one, and a
 * request that asked for several has its annotation forms read off against the
 * detectors in the order they were submitted. That ordering is best effort, so
 * a server that returns the forms in another order would label them wrongly.
 */
export function formViews(
  forms: readonly AlchemyForm[],
  requested: readonly AnnotationControlType[],
): AlchemyFormView[] {
  let annotationsSeen = 0;
  return forms.map((form) => {
    if (form.form !== ANNOTATION_FORM) {
      return { form, detector: null, key: form.form };
    }
    const detector =
      form.payload?.control_type ??
      requested[annotationsSeen] ??
      requested[0] ??
      null;
    annotationsSeen += 1;
    return { form, detector, key: resultFormKey(form.form, detector) };
  });
}

/** {@link formViews} for a tracked job's latest status. */
export function statusFormViews(job: AlchemyJob): AlchemyFormView[] {
  return formViews(job.status?.forms ?? [], job.annotationControlTypes);
}

/**
 * The forms a request asked for, with a control map expanded to one entry per
 * detector: each detector is submitted as its own form and comes back as its
 * own result.
 */
export function requestedFormEntries(job: AlchemyJob): AlchemyFormEntry[] {
  return job.forms.flatMap((form): AlchemyFormEntry[] => {
    if (form !== ANNOTATION_FORM) {
      return [{ form, detector: null, key: form }];
    }
    const detectors = job.annotationControlTypes;
    if (detectors.length === 0) {
      return [{ form, detector: null, key: form }];
    }
    return detectors.map((detector) => ({
      form,
      detector,
      key: resultFormKey(form, detector),
    }));
  });
}

/** How a single form's state reads in the per-form checklist. */
export interface FormStatusView {
  icon: string;
  spin: boolean;
  modifier: string;
}

export const FORM_STATUS_VIEWS: Record<string, FormStatusView> = {
  waiting: { icon: 'clock', spin: false, modifier: 'waiting' },
  processing: { icon: 'spinner', spin: true, modifier: 'processing' },
  done: { icon: 'check-circle-filled', spin: false, modifier: 'done' },
  cancelled: { icon: 'x-circle', spin: false, modifier: 'cancelled' },
  faulted: {
    icon: 'warning-triangle-filled',
    spin: false,
    modifier: 'faulted',
  },
};

const TERMINAL_FORM_STATES = new Set(['done', 'cancelled', 'faulted']);

export function formStatusView(state: string): FormStatusView {
  return FORM_STATUS_VIEWS[state] ?? FORM_STATUS_VIEWS['waiting'];
}

export function isJobSettled(job: AlchemyJob): boolean {
  if (job.notFound || job.cancelled) return true;
  const status = job.status;
  if (!status) return false;
  if (status.state === 'faulted') return true;
  // The overall state can report `done` while a slower form (e.g.
  // interrogation) is still processing, so keep polling until every form has
  // reached a terminal state and its result is in hand.
  if (status.state === 'done') {
    return (status.forms ?? []).every((f) => TERMINAL_FORM_STATES.has(f.state));
  }
  return false;
}

/**
 * The job's overall state, as an i18n key plus a colour modifier for its
 * pill: faulted → done (settled) → processing (any form started) → waiting.
 */
export function jobStateView(job: AlchemyJob): {
  key: string;
  modifier: string;
} {
  if (job.faulted || job.status?.state === 'faulted') {
    return { key: 'alchemy.state.faulted', modifier: 'faulted' };
  }
  if (isJobSettled(job)) {
    return { key: 'alchemy.state.done', modifier: 'done' };
  }
  const forms = job.status?.forms ?? [];
  const started = forms.some(
    (f) => f.state === 'processing' || f.state === 'done',
  );
  return started
    ? { key: 'alchemy.state.processing', modifier: 'processing' }
    : { key: 'alchemy.state.waiting', modifier: 'waiting' };
}

/** Relative age of a job for its summary line, as a transloco key + count. */
export function jobAge(job: AlchemyJob): { key: string; count: number } {
  const minutes = Math.floor((Date.now() - job.firstSeenAt) / 60_000);
  if (minutes < 1) return { key: 'alchemy.jobs.time_now', count: 0 };
  if (minutes < 60) return { key: 'alchemy.jobs.time_min', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'alchemy.jobs.time_hr', count: hours };
  return { key: 'alchemy.jobs.time_day', count: Math.floor(hours / 24) };
}

export function formsProgressLabel(job: AlchemyJob): string {
  const total = requestedFormEntries(job).length;
  const completed = (job.status?.forms ?? []).filter(
    (f) => f.state === 'done',
  ).length;
  return `${completed}/${total}`;
}

/**
 * Per-form status rows. Seeded from the requested forms so every operation
 * shows (as `waiting`) the instant a job is tracked, then each row advances
 * independently as the status poll reports it. A control-map request asking for
 * several detectors gets a row each, because each one is its own form.
 */
export function jobFormRows(job: AlchemyJob): AlchemyFormRow[] {
  const states = new Map(
    statusFormViews(job).map((view) => [view.key, view.form.state]),
  );
  return requestedFormEntries(job).map((entry) => ({
    ...entry,
    state: states.get(entry.key) ?? 'waiting',
  }));
}

/**
 * A requested form as one entry of the job body: its state, and its result
 * once the horde has handed one over. The body is one list from submission to
 * completion, so a form is never listed once as a status row and again as a
 * result card.
 */
export interface AlchemyFormCard extends AlchemyFormRow {
  /** The done form with its result; null while there is nothing to show. */
  view: AlchemyFormView | null;
}

export function jobFormCards(job: AlchemyJob): AlchemyFormCard[] {
  const views = new Map(statusFormViews(job).map((view) => [view.key, view]));
  return requestedFormEntries(job).map((entry) => {
    const view = views.get(entry.key) ?? null;
    const state = view?.form.state ?? 'waiting';
    const hasResult = view !== null && state === 'done' && !!view.form.result;
    return { ...entry, state, view: hasResult ? view : null };
  });
}

/** How far a job has got, for its head: counts plus the forms still running. */
export interface AlchemyJobProgress {
  done: number;
  total: number;
  /** i18n form-name keys of the forms the horde is working on right now. */
  running: string[];
}

export function jobProgress(job: AlchemyJob): AlchemyJobProgress {
  const cards = jobFormCards(job);
  return {
    done: cards.filter((card) => card.state === 'done').length,
    total: cards.length,
    running: cards
      .filter((card) => card.state === 'processing')
      .map((card) => card.form),
  };
}

/**
 * What a gallery tile shows of a job's results: the first finished form that
 * can be said in a line or a strip of swatches, or the key of a processed
 * image the tile can show whole. Text forms are preferred over images because
 * an image tile already shows the source, and the words are what is new.
 */
export type AlchemyLeadPreview =
  | { kind: 'text'; text: string }
  | { kind: 'tags'; count: number }
  | { kind: 'score'; score: number }
  | { kind: 'nsfw'; nsfw: boolean }
  | { kind: 'palette'; colors: string[] }
  | { kind: 'image'; key: string }
  | null;

export function jobLeadPreview(job: AlchemyJob): AlchemyLeadPreview {
  return leadPreviewOfViews(jobDoneResults(job));
}

function leadPreviewOfViews(
  done: readonly AlchemyFormView[],
): AlchemyLeadPreview {
  let image: AlchemyLeadPreview = null;
  for (const { form, key } of done) {
    const result = form.result ?? {};
    switch (form.form) {
      case 'caption':
        if (typeof result.caption === 'string' && result.caption.trim()) {
          return { kind: 'text', text: result.caption.trim() };
        }
        break;
      case 'interrogation': {
        const details = result.interrogation;
        if (details && typeof details === 'object') {
          const count = Object.values(details).reduce(
            (sum, entries) =>
              sum + (Array.isArray(entries) ? entries.length : 0),
            0,
          );
          return { kind: 'tags', count };
        }
        break;
      }
      case 'aesthetic':
        if (typeof result['aesthetic'] === 'number') {
          return { kind: 'score', score: result['aesthetic'] };
        }
        break;
      case 'nsfw':
        if (typeof result.nsfw === 'boolean') {
          return { kind: 'nsfw', nsfw: result.nsfw };
        }
        break;
      case 'palette': {
        const palette = result.palette;
        const colors =
          palette && typeof palette === 'object' && !Array.isArray(palette)
            ? (palette as { colors?: unknown }).colors
            : null;
        if (Array.isArray(colors)) {
          const hexes = colors
            .map((entry) =>
              entry && typeof entry === 'object'
                ? (entry as { hex?: unknown }).hex
                : null,
            )
            .filter((hex): hex is string => typeof hex === 'string');
          if (hexes.length) return { kind: 'palette', colors: hexes };
        }
        break;
      }
      default:
        if (image === null && typeof result[form.form] === 'string') {
          image = { kind: 'image', key };
        }
    }
  }
  return image;
}

/**
 * One column of the series table: an operation some request in the history
 * ran, with a control map split by detector as everywhere else.
 */
export type AlchemySeriesColumn = AlchemyFormEntry;

/**
 * The operations run across a set of requests, each once, in the order they
 * were first asked for. Newest requests come first in the history, so the
 * order is read from the oldest request forward and a column keeps its place
 * as requests are added.
 */
export function seriesColumns(
  jobs: readonly AlchemyJob[],
): AlchemySeriesColumn[] {
  const seen = new Map<string, AlchemySeriesColumn>();
  for (const job of [...jobs].reverse()) {
    for (const entry of requestedFormEntries(job)) {
      if (!seen.has(entry.key)) seen.set(entry.key, entry);
    }
  }
  return [...seen.values()];
}

/**
 * What one request shows for one operation in the series table: the result
 * said in a line, or why there is no line yet. `sortValue` is what the column
 * orders by; text sorts as text and a score as a number.
 */
export interface AlchemySeriesCell {
  kind: 'text' | 'number' | 'flag' | 'palette' | 'image' | 'pending' | 'none';
  /** The line, and what the CSV carries for this cell. */
  text: string;
  sortValue: string | number | null;
  colors?: string[];
  /** The result key of a processed image, for the stored copy lookup. */
  imageKey?: string;
  /** The form state while pending, for its glyph. */
  state?: string;
}

const NO_CELL: AlchemySeriesCell = { kind: 'none', text: '', sortValue: null };

function textCell(text: string): AlchemySeriesCell {
  return { kind: 'text', text, sortValue: text.toLowerCase() };
}

export function seriesCell(job: AlchemyJob, key: string): AlchemySeriesCell {
  const card = jobFormCards(job).find((entry) => entry.key === key);
  if (!card) return NO_CELL;
  if (!card.view) {
    return { kind: 'pending', text: '', sortValue: null, state: card.state };
  }
  const { form } = card.view;
  const result = form.result ?? {};
  switch (form.form) {
    case 'caption':
      return typeof result.caption === 'string'
        ? textCell(result.caption.trim())
        : NO_CELL;
    case 'nsfw':
      return typeof result.nsfw === 'boolean'
        ? {
            kind: 'flag',
            text: result.nsfw ? 'nsfw' : 'clean',
            sortValue: result.nsfw ? 1 : 0,
          }
        : NO_CELL;
    case 'aesthetic': {
      const score = result['aesthetic'];
      return typeof score === 'number'
        ? { kind: 'number', text: score.toFixed(2), sortValue: score }
        : NO_CELL;
    }
    case 'interrogation': {
      const lead = jobLeadPreviewOf(form);
      if (lead?.kind !== 'tags') return NO_CELL;
      const top = topTags(result.interrogation, 3);
      return {
        kind: 'text',
        text: top.length ? top.join(', ') : `${lead.count}`,
        sortValue: lead.count,
      };
    }
    case 'palette': {
      const lead = jobLeadPreviewOf(form);
      return lead?.kind === 'palette'
        ? {
            kind: 'palette',
            text: lead.colors.join(' '),
            sortValue: lead.colors[0] ?? '',
            colors: lead.colors,
          }
        : NO_CELL;
    }
    case 'describe': {
      const value = result.describe;
      if (!value || typeof value !== 'object') return NO_CELL;
      const parts = [value['format'], value['width'], value['height']];
      const [format, width, height] = parts.map((part) =>
        typeof part === 'string' || typeof part === 'number' ? `${part}` : '',
      );
      const text = [format, width && height ? `${width} x ${height}` : '']
        .filter(Boolean)
        .join(' · ');
      return text ? textCell(text) : NO_CELL;
    }
    case 'vectorize':
      return typeof result.vectorize === 'string' ? textCell('SVG') : NO_CELL;
    default: {
      const value = result[form.form];
      if (typeof value !== 'string') return NO_CELL;
      return {
        kind: 'image',
        text: value,
        sortValue: 1,
        imageKey: card.view.key,
      };
    }
  }
}

/** {@link jobLeadPreview} for one form, so a cell and a tile agree. */
function jobLeadPreviewOf(form: AlchemyForm): AlchemyLeadPreview {
  return leadPreviewOfViews([{ form, detector: null, key: form.form }]);
}

function topTags(details: unknown, count: number): string[] {
  if (!details || typeof details !== 'object') return [];
  const tags = (details as { tags?: unknown }).tags;
  if (!Array.isArray(tags)) return [];
  return tags
    .filter(
      (tag): tag is { text: string; confidence: number } =>
        !!tag &&
        typeof tag === 'object' &&
        typeof (tag as { text?: unknown }).text === 'string' &&
        typeof (tag as { confidence?: unknown }).confidence === 'number',
    )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, count)
    .map((tag) => tag.text);
}

/** How the series table is ordered: by one column, or by age when null. */
export interface AlchemySeriesSort {
  key: string;
  direction: 'asc' | 'desc';
}

/**
 * The requests in table order. Ordering by a column puts the requests that
 * have that result first, in the order asked, and the rest after them in
 * their age order, so a sort never scatters the empty cells through the list.
 */
export function sortSeries(
  jobs: readonly AlchemyJob[],
  sort: AlchemySeriesSort | null,
): AlchemyJob[] {
  if (!sort) return [...jobs];
  const keyed = jobs.map((job, index) => ({
    job,
    index,
    value: seriesCell(job, sort.key).sortValue,
  }));
  const sign = sort.direction === 'asc' ? 1 : -1;
  keyed.sort((a, b) => {
    if (a.value === null && b.value === null) return a.index - b.index;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    if (typeof a.value === 'number' && typeof b.value === 'number') {
      return (a.value - b.value) * sign || a.index - b.index;
    }
    return `${a.value}`.localeCompare(`${b.value}`) * sign || a.index - b.index;
  });
  return keyed.map((entry) => entry.job);
}

/** Whether two requests asked for the same operations, whatever the order. */
export function sharesOperations(a: AlchemyJob, b: AlchemyJob): boolean {
  const keysOf = (job: AlchemyJob) =>
    requestedFormEntries(job)
      .map((entry) => entry.key)
      .sort()
      .join('|');
  return keysOf(a) === keysOf(b);
}

/**
 * Rows of text as a CSV document: every field quoted, quotes doubled, CRLF
 * line ends, so any spreadsheet opens it as it is shown.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) =>
      row.map((field) => `"${field.replace(/"/g, '""')}"`).join(','),
    )
    .join('\r\n');
}

/** How many tags a prompt takes from an interrogation. */
const PROMPT_TAG_COUNT = 20;

/**
 * What a text result offers the image studio's prompt box: the caption as
 * written, or an interrogation's strongest tags in a line. Null for a result
 * that is not prompt material (a palette, a score).
 */
export function resultPromptText(form: AlchemyForm): string | null {
  const result = form.result ?? {};
  if (form.form === 'caption' && typeof result.caption === 'string') {
    const caption = result.caption.trim();
    return caption || null;
  }
  if (form.form === 'interrogation') {
    const tags = topTags(result.interrogation, PROMPT_TAG_COUNT);
    return tags.length ? tags.join(', ') : null;
  }
  return null;
}

/** A job is worth archiving/showing once any form has produced a result. */
export function jobHasResults(job: AlchemyJob): boolean {
  return (job.status?.forms ?? []).some(
    (form) => form.state === 'done' && !!form.result,
  );
}

/** The done forms that carry a renderable result, for the detail card grid. */
export function jobDoneResults(job: AlchemyJob | null): AlchemyFormView[] {
  return job
    ? statusFormViews(job).filter(
        (view) => view.form.state === 'done' && !!view.form.result,
      )
    : [];
}
