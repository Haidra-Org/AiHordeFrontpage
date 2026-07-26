/**
 * Side-effect-free view helpers for a tracked alchemy job. Extracted from
 * `AlchemyComponent` so both the page (which owns job state) and the results
 * browser (which only renders it) derive the same labels without duplication.
 */
import {
  AlchemyForm,
  AlchemyFormName,
  AlchemyStatusResponse,
} from '../types/generation';

/** A tracked alchemy interrogation request and its latest polled status. */
export interface AlchemyJob {
  id: string;
  forms: AlchemyFormName[];
  status: AlchemyStatusResponse | null;
  done: boolean;
  faulted: boolean;
  cancelled: boolean;
  notFound: boolean;
  firstSeenAt: number;
  /**
   * A small renderable thumbnail of the request's source image — a remote URL
   * passthrough or a tiny `data:image/webp` URL — for the results rail/gallery.
   * `null` when none is available (a legacy restored job, a source that failed
   * to decode, or a thumbnail too large to persist). Always a plain string, so
   * there is nothing to revoke on teardown (unlike an object URL).
   */
  sourceThumb: string | null;
  /**
   * The full-size renderable source image of the request, kept for the lifetime
   * of the session only so large surfaces (gallery tiles) don't upscale the
   * small `sourceThumb`. Deliberately **never persisted**: a full-size base64
   * source is orders of magnitude larger than the localStorage quota allows, so
   * it is stripped on write and normalized to `null` on read. A job restored
   * from storage therefore has `sourceFull === null` and falls back to
   * `sourceThumb` (or a placeholder when that is null too).
   */
  sourceFull: string | null;
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
  const total = job.forms.length;
  const completed = (job.status?.forms ?? []).filter(
    (f) => f.state === 'done',
  ).length;
  return `${completed}/${total}`;
}

/**
 * Per-form status rows. Seeded from the requested forms so every operation
 * shows (as `waiting`) the instant a job is tracked, then each row advances
 * independently as the status poll reports it.
 */
export function jobFormRows(
  job: AlchemyJob,
): { form: AlchemyFormName; state: string }[] {
  const states = new Map(
    (job.status?.forms ?? []).map((f) => [f.form, f.state]),
  );
  return job.forms.map((form) => ({
    form,
    state: states.get(form) ?? 'waiting',
  }));
}

/** A job is worth archiving/showing once any form has produced a result. */
export function jobHasResults(job: AlchemyJob): boolean {
  return (job.status?.forms ?? []).some(
    (form) => form.state === 'done' && !!form.result,
  );
}

/** The done forms that carry a renderable result, for the detail card grid. */
export function jobDoneResults(job: AlchemyJob | null): AlchemyForm[] {
  return (job?.status?.forms ?? []).filter(
    (f) => f.state === 'done' && !!f.result,
  );
}
