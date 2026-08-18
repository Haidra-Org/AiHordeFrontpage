import { describe, expect, it } from 'vitest';
import {
  AlchemyJob,
  formViews,
  formsProgressLabel,
  jobDoneResults,
  jobFormRows,
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
