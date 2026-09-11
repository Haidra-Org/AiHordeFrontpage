import { describe, expect, it } from 'vitest';
import {
  AlchemyJob,
  formViews,
  formsProgressLabel,
  jobDoneResults,
  jobFormCards,
  jobFormRows,
  jobLeadPreview,
  jobProgress,
  requestedFormEntries,
  resultFormKey,
  storedAnnotationDetectors,
  toAlchemyJob,
} from './alchemy-job-view';
import { AlchemyForm } from '../types/generation';
import { StoredAlchemyJob } from '../types/alchemy-job';

const storedJob = (
  overrides: Partial<StoredAlchemyJob> = {},
): StoredAlchemyJob => ({
  localId: 'local-1',
  jobId: 'job-1',
  createdAt: 1,
  updatedAt: 1,
  forms: ['annotation'],
  slowWorkers: true,
  sourceMode: 'upload',
  status: null,
  done: false,
  faulted: false,
  cancelled: false,
  notFound: false,
  storedResultForms: [],
  failedResultForms: [],
  ...overrides,
});

const job = (overrides: Partial<AlchemyJob> = {}): AlchemyJob => ({
  ...toAlchemyJob(storedJob()),
  ...overrides,
});

const doneAnnotation = (url: string): AlchemyForm => ({
  form: 'annotation',
  state: 'done',
  result: { annotation: url },
});

describe('storedAnnotationDetectors', () => {
  it('reads the detector list a job was written with', () => {
    expect(
      storedAnnotationDetectors(
        storedJob({ annotationControlTypes: ['canny', 'depth'] }),
      ),
    ).toEqual(['canny', 'depth']);
  });

  it('reads a job written before a request could ask for several', () => {
    expect(
      storedAnnotationDetectors(storedJob({ annotationControlType: 'depth' })),
    ).toEqual(['depth']);
  });

  it('reads no detector from a job that asked for no control map', () => {
    expect(storedAnnotationDetectors(storedJob())).toEqual([]);
  });
});

describe('resultFormKey', () => {
  it('files a control map under its detector', () => {
    expect(resultFormKey('annotation', 'depth')).toBe('annotation-depth');
  });

  it('leaves every other form under its own name', () => {
    expect(resultFormKey('caption', null)).toBe('caption');
    expect(resultFormKey('RealESRGAN_x4plus')).toBe('RealESRGAN_x4plus');
  });
});

describe('formViews', () => {
  it('takes the detector from the payload the horde echoes back', () => {
    const views = formViews(
      [
        { ...doneAnnotation('a.webp'), payload: { control_type: 'depth' } },
        { ...doneAnnotation('b.webp'), payload: { control_type: 'canny' } },
      ],
      ['canny', 'depth'],
    );

    expect(views.map((view) => view.detector)).toEqual(['depth', 'canny']);
    expect(views.map((view) => view.key)).toEqual([
      'annotation-depth',
      'annotation-canny',
    ]);
  });

  it('uses the one requested detector when the payload is not echoed', () => {
    const views = formViews([doneAnnotation('a.webp')], ['openpose']);

    expect(views[0].detector).toBe('openpose');
    expect(views[0].key).toBe('annotation-openpose');
  });

  it('matches unechoed forms to the requested detectors by position', () => {
    const views = formViews(
      [doneAnnotation('a.webp'), doneAnnotation('b.webp')],
      ['canny', 'depth'],
    );

    expect(views.map((view) => view.detector)).toEqual(['canny', 'depth']);
  });

  it('leaves a form that is not a control map without a detector', () => {
    const views = formViews([{ form: 'caption', state: 'done' }], ['canny']);

    expect(views[0]).toEqual({
      form: { form: 'caption', state: 'done' },
      detector: null,
      key: 'caption',
    });
  });
});

describe('requestedFormEntries', () => {
  it('expands a control map to one entry per detector', () => {
    const entries = requestedFormEntries(
      job({
        forms: ['caption', 'annotation'],
        annotationControlTypes: ['canny', 'depth'],
      }),
    );

    expect(entries.map((entry) => entry.key)).toEqual([
      'caption',
      'annotation-canny',
      'annotation-depth',
    ]);
  });
});

describe('jobFormRows', () => {
  it('advances the row of each detector on its own', () => {
    const rows = jobFormRows(
      job({
        forms: ['annotation'],
        annotationControlTypes: ['canny', 'depth'],
        status: {
          state: 'processing',
          forms: [
            { ...doneAnnotation('a.webp'), payload: { control_type: 'depth' } },
          ],
        },
      }),
    );

    expect(rows).toEqual([
      {
        form: 'annotation',
        detector: 'canny',
        key: 'annotation-canny',
        state: 'waiting',
      },
      {
        form: 'annotation',
        detector: 'depth',
        key: 'annotation-depth',
        state: 'done',
      },
    ]);
  });
});

describe('formsProgressLabel', () => {
  it('counts every detector against the total', () => {
    expect(
      formsProgressLabel(
        job({
          forms: ['annotation'],
          annotationControlTypes: ['canny', 'depth', 'openpose'],
          status: {
            state: 'processing',
            forms: [doneAnnotation('a.webp')],
          },
        }),
      ),
    ).toBe('1/3');
  });
});

describe('jobDoneResults', () => {
  it('returns one result per detector, each under its own key', () => {
    const results = jobDoneResults(
      job({
        forms: ['annotation'],
        annotationControlTypes: ['canny', 'depth'],
        status: {
          state: 'done',
          forms: [doneAnnotation('a.webp'), doneAnnotation('b.webp')],
        },
      }),
    );

    expect(results.map((result) => result.key)).toEqual([
      'annotation-canny',
      'annotation-depth',
    ]);
  });
});

describe('jobFormCards', () => {
  it('lists every requested form once, in request order, with its result when done', () => {
    const j = job({
      forms: ['caption', 'nsfw', 'annotation'],
      annotationControlTypes: ['canny'],
      status: {
        state: 'processing',
        forms: [
          { form: 'nsfw', state: 'processing' },
          { form: 'caption', state: 'done', result: { caption: 'a dog' } },
        ],
      },
    });
    const cards = jobFormCards(j);
    expect(cards.map((c) => [c.key, c.state, c.view !== null])).toEqual([
      ['caption', 'done', true],
      ['nsfw', 'processing', false],
      ['annotation-canny', 'waiting', false],
    ]);
  });

  it('treats a done form without a result as still pending', () => {
    const j = job({
      forms: ['caption'],
      status: { state: 'done', forms: [{ form: 'caption', state: 'done' }] },
    });
    expect(jobFormCards(j)[0].view).toBeNull();
  });
});

describe('jobProgress', () => {
  it('counts done forms against the request and names the running ones', () => {
    const j = job({
      forms: ['caption', 'nsfw', 'palette'],
      status: {
        state: 'processing',
        forms: [
          { form: 'caption', state: 'done', result: { caption: 'x' } },
          { form: 'nsfw', state: 'processing' },
        ],
      },
    });
    expect(jobProgress(j)).toEqual({ done: 1, total: 3, running: ['nsfw'] });
  });
});

describe('jobLeadPreview', () => {
  const lead = (form: AlchemyForm) =>
    jobLeadPreview(
      job({
        forms: [form.form as AlchemyJob['forms'][number]],
        status: { state: 'done', forms: [form] },
      }),
    );

  it('prefers a caption over an image', () => {
    const j = job({
      forms: ['RealESRGAN_x4plus', 'caption'],
      status: {
        state: 'done',
        forms: [
          {
            form: 'RealESRGAN_x4plus',
            state: 'done',
            result: { RealESRGAN_x4plus: 'https://r2.example/a.webp' },
          },
          { form: 'caption', state: 'done', result: { caption: ' a dog ' } },
        ],
      },
    });
    expect(jobLeadPreview(j)).toEqual({ kind: 'text', text: 'a dog' });
  });

  it('falls back to the first processed image, under its result key', () => {
    const j = job({
      forms: ['annotation'],
      annotationControlTypes: ['depth'],
      status: {
        state: 'done',
        forms: [doneAnnotation('https://r2.example/d.webp')],
      },
    });
    expect(jobLeadPreview(j)).toEqual({
      kind: 'image',
      key: 'annotation-depth',
    });
  });

  it('reads tag counts, scores, the nsfw flag and palette swatches', () => {
    expect(
      lead({
        form: 'interrogation',
        state: 'done',
        result: {
          interrogation: {
            tags: [{ text: 'a', confidence: 1 }],
            mediums: [{ text: 'b', confidence: 1 }],
          },
        },
      }),
    ).toEqual({ kind: 'tags', count: 2 });
    expect(
      lead({ form: 'aesthetic', state: 'done', result: { aesthetic: 6.4 } }),
    ).toEqual({ kind: 'score', score: 6.4 });
    expect(
      lead({ form: 'nsfw', state: 'done', result: { nsfw: true } }),
    ).toEqual({ kind: 'nsfw', nsfw: true });
    expect(
      lead({
        form: 'palette',
        state: 'done',
        result: { palette: { colors: [{ hex: '#111111', proportion: 1 }] } },
      }),
    ).toEqual({ kind: 'palette', colors: ['#111111'] });
  });

  it('is null while nothing has finished', () => {
    expect(jobLeadPreview(job({ forms: ['caption'] }))).toBeNull();
  });
});
