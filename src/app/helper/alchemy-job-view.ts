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
