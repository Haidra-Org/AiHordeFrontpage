import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioDescribeService } from './studio-describe.service';
import {
  AlchemyQueueService,
  AlchemySubmission,
  AlchemySubmitOutcome,
} from './alchemy-queue.service';
import { ToastService } from './toast.service';
import { AlchemyJob } from '../helper/alchemy-job-view';
import { AlchemyFormName } from '../types/generation';

const encoded = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      base64: 'AAAA',
      mimeType: 'image/webp',
      width: 8,
      height: 8,
    }),
  ),
);

// The encoder decodes with `createImageBitmap` and a canvas, neither of which
// jsdom provides; what it returns is the service's input, not its behaviour.
vi.mock('../helper/image-encoding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../helper/image-encoding')>()),
  fileToResizedBase64: encoded,
}));

/** A job as the queue reports it, with each form at the given state. */
function job(
  id: string,
  states: Partial<Record<AlchemyFormName, string>>,
  results: Partial<Record<AlchemyFormName, Record<string, unknown>>> = {},
  overall = 'waiting',
): AlchemyJob {
  const forms: AlchemyFormName[] = ['caption', 'interrogation'];
  return {
    id,
    localId: `local-${id}`,
    sourceMode: 'upload',
    adopted: false,
    forms,
    annotationControlTypes: [],
    status: {
      state: overall,
      forms: forms.map((form) => ({
        form,
        state: states[form] ?? 'waiting',
        result: results[form],
      })),
    },
    done: overall === 'done',
    faulted: overall === 'faulted',
    cancelled: false,
    notFound: false,
    firstSeenAt: 0,
    sourceThumb: null,
    sourceFull: null,
    storedResultForms: [],
    failedResultForms: [],
  };
}

const CAPTION_RESULT = { caption: 'a cat on a wall' };
const TAGS_RESULT = {
  interrogation: {
    tags: [
      { text: 'cat', confidence: 0.9 },
      { text: 'wall', confidence: 0.6 },
    ],
  },
};

describe('StudioDescribeService', () => {
  let jobs: WritableSignal<AlchemyJob[]>;
  let outcome: AlchemySubmitOutcome;
  let submissions: AlchemySubmission[];
  let service: StudioDescribeService;
  let toast: ToastService;

  const picture = (): Blob => new Blob(['bytes'], { type: 'image/webp' });

  beforeEach(() => {
    jobs = signal<AlchemyJob[]>([]);
    submissions = [];
    outcome = { kind: 'submitted', id: 'job-1' };
    encoded.mockClear();

    const queue = {
      jobs,
      submit: (input: AlchemySubmission): Promise<AlchemySubmitOutcome> => {
        submissions.push(input);
        return Promise.resolve(outcome);
      },
    };

    TestBed.configureTestingModule({
      providers: [
        StudioDescribeService,
        ToastService,
        { provide: AlchemyQueueService, useValue: queue },
      ],
    });
    service = TestBed.inject(StudioDescribeService);
    toast = TestBed.inject(ToastService);
  });

  it('has nothing to show before a picture is read', () => {
    expect(service.pending()).toBe(false);
    expect(service.settled()).toBe(false);
    expect(service.hasFindings()).toBe(false);
    expect(service.findings()).toEqual({ caption: null, tags: null });
    expect(service.error()).toBeNull();
  });

  it('asks for a caption and tags, and follows the job it is given', async () => {
    await service.describe(picture(), 'source');

    expect(submissions).toHaveLength(1);
    expect(submissions[0].forms).toEqual(['caption', 'interrogation']);
    expect(submissions[0].slowWorkers).toBe(true);
    expect(submissions[0].source).toBe('AAAA');
    expect(submissions[0].sourceMimeType).toBe('image/webp');
    expect(service.jobId()).toBe('job-1');
    expect(service.origin()).toBe('source');

    jobs.set([job('job-1', {})]);
    expect(service.pending()).toBe(true);
    expect(service.settled()).toBe(false);
  });

  it('shows the caption as it lands and the tags when they follow', async () => {
    await service.describe(picture());

    jobs.set([job('job-1', { caption: 'done' }, { caption: CAPTION_RESULT })]);
    expect(service.findings()).toEqual({
      caption: 'a cat on a wall',
      tags: null,
    });
    expect(service.hasFindings()).toBe(true);
    expect(service.settled()).toBe(false);

    jobs.set([
      job(
        'job-1',
        { caption: 'done', interrogation: 'done' },
        { caption: CAPTION_RESULT, interrogation: TAGS_RESULT },
        'done',
      ),
    ]);
    expect(service.findings()).toEqual({
      caption: 'a cat on a wall',
      tags: 'cat, wall',
    });
    expect(service.settled()).toBe(true);
    expect(service.pending()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('reports a faulted reading once the job settles', async () => {
    await service.describe(picture());
    jobs.set([job('job-1', { caption: 'faulted' }, {}, 'faulted')]);

    expect(service.error()).toEqual({ key: 'generate.describe.failed' });
    expect(service.pending()).toBe(false);
  });

  it('says why the horde refused, in its own words', async () => {
    outcome = {
      kind: 'refused',
      error: { status: 403, message: 'no kudos for you' },
    };
    await service.describe(picture());

    expect(service.error()).toEqual({
      key: 'generate.describe.refused',
      reason: 'no kudos for you',
    });
    expect(service.jobId()).toBeNull();
    expect(toast.toasts()).toHaveLength(1);
    expect(toast.toasts()[0].message).toBe('generate.describe.refused');
  });

  it('uses the studio sentence for a refusal the horde named', async () => {
    outcome = {
      kind: 'refused',
      error: { status: 400, message: 'bad', rc: 'AnonForbidden' },
    };
    await service.describe(picture());

    expect(service.error()?.key).toBe('generate.reject.anon_forbidden');
    expect(service.error()?.reason).toBeUndefined();
  });

  it('falls back to the generic line when the horde did not answer', async () => {
    outcome = { kind: 'refused', error: { status: 0, message: 'offline' } };
    await service.describe(picture());

    expect(service.error()).toEqual({ key: 'generate.describe.failed' });
  });

  it('reports a picture it could not encode', async () => {
    encoded.mockRejectedValueOnce(new Error('not an image'));
    await service.describe(picture());

    expect(submissions).toHaveLength(0);
    expect(service.error()).toEqual({ key: 'generate.describe.encode_failed' });
  });

  it('replaces the reading on screen when a second picture is read', async () => {
    await service.describe(picture());
    jobs.set([
      job(
        'job-1',
        { caption: 'done', interrogation: 'done' },
        { caption: CAPTION_RESULT, interrogation: TAGS_RESULT },
        'done',
      ),
    ]);
    expect(service.hasFindings()).toBe(true);

    outcome = { kind: 'submitted', id: 'job-2' };
    await service.describe(picture(), 'result');

    expect(service.jobId()).toBe('job-2');
    expect(service.origin()).toBe('result');
    // The first job is still in the queue's history; its findings are not the
    // ones on screen any more.
    expect(service.findings()).toEqual({ caption: null, tags: null });
  });

  it('forgets the reading on clear', async () => {
    await service.describe(picture());
    jobs.set([job('job-1', { caption: 'done' }, { caption: CAPTION_RESULT })]);

    service.clear();

    expect(service.jobId()).toBeNull();
    expect(service.hasFindings()).toBe(false);
    expect(service.pending()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('carries the attached source picture for the prompt section', () => {
    const blob = picture();
    service.offerSourcePicture(blob);
    expect(service.sourcePicture()).toBe(blob);

    service.offerSourcePicture(null);
    expect(service.sourcePicture()).toBeNull();
  });
});
