import { describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import {
  buildAlchemyJobArchive,
  buildAlchemySeriesArchive,
} from './alchemy-archive';
import type { AlchemyStatusResponse } from '../types/generation';

function imageResponse(bytes: number[], contentType: string): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': contentType },
  });
}

const STATUS: AlchemyStatusResponse = {
  state: 'done',
  forms: [
    { form: 'caption', state: 'done', result: { caption: 'a cat' } },
    {
      form: 'describe',
      state: 'done',
      result: { describe: { format: 'WEBP', width: 1024, height: 801 } },
    },
    {
      form: 'RestoreFormer',
      state: 'done',
      result: { RestoreFormer: 'https://cdn.example/r2/out.webp' },
    },
  ],
};

/** Two image-bearing forms, so a mixed stored/fetched pass can be told apart. */
const TWO_IMAGE_STATUS: AlchemyStatusResponse = {
  state: 'done',
  forms: [
    ...(STATUS.forms ?? []),
    {
      form: 'GFPGAN',
      state: 'done',
      result: { GFPGAN: 'https://cdn.example/r2/face.webp' },
    },
  ],
};

describe('buildAlchemyJobArchive', () => {
  it('bundles results.json, results.html and fetched images', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(imageResponse([1, 2, 3, 4], 'image/webp'));

    const { bytes, imageCount, failedImages } = await buildAlchemyJobArchive(
      'job-1',
      STATUS,
      { fetchFn },
    );

    expect(imageCount).toBe(1);
    expect(failedImages).toBe(0);

    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual([
      'images/RestoreFormer.webp',
      'results.html',
      'results.json',
    ]);

    const json = JSON.parse(strFromU8(entries['results.json']));
    expect(json.id).toBe('job-1');
    expect(json.forms[0].result.caption).toBe('a cat');

    const html = strFromU8(entries['results.html']);
    expect(html).toContain('a cat');
    expect(html).toContain('WEBP');
    expect(html).toContain('1024px');
    expect(html).toContain('images/RestoreFormer.webp');
    // No base64 image payloads embedded in the portable page.
    expect(html).not.toContain('data:image');
  });

  it('names each control map by the detector that made it', async () => {
    // A fresh response per call: a body can only be read once, and both maps
    // are fetched.
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(imageResponse([1, 2, 3, 4], 'image/webp')),
      );

    const { bytes, imageCount } = await buildAlchemyJobArchive(
      'job-maps',
      {
        state: 'done',
        forms: [
          {
            form: 'annotation',
            state: 'done',
            result: { annotation: 'https://cdn.example/r2/a.webp' },
            payload: { control_type: 'canny' },
          },
          {
            form: 'annotation',
            state: 'done',
            result: { annotation: 'https://cdn.example/r2/b.webp' },
          },
        ],
      },
      { fetchFn, annotationControlTypes: ['canny', 'depth'] },
    );

    expect(imageCount).toBe(2);
    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual([
      'images/annotation-canny.webp',
      'images/annotation-depth.webp',
      'results.html',
      'results.json',
    ]);

    const html = strFromU8(entries['results.html']);
    expect(html).toContain('Control map (canny)');
    expect(html).toContain('Control map (depth)');
  });

  it('still produces an archive when an image fetch fails', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('CORS blocked'));

    const { bytes, imageCount, failedImages } = await buildAlchemyJobArchive(
      'job-2',
      STATUS,
      { fetchFn },
    );

    expect(imageCount).toBe(0);
    expect(failedImages).toBe(1);

    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual([
      'results.html',
      'results.json',
    ]);
  });

  it('derives a file extension from the content type', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(imageResponse([0, 1], 'image/png'));

    const status: AlchemyStatusResponse = {
      state: 'done',
      forms: [
        {
          form: 'RealESRGAN_x4plus',
          state: 'done',
          result: { RealESRGAN_x4plus: 'https://cdn.example/out?signed=1' },
        },
      ],
    };

    const { bytes } = await buildAlchemyJobArchive('job-3', status, {
      fetchFn,
    });
    const entries = unzipSync(bytes);
    expect(entries['images/RealESRGAN_x4plus.png']).toBeDefined();
  });

  it('uses the copies already held and does not go to the network', async () => {
    const fetchFn = vi.fn();

    const { bytes, imageCount, failedImages } = await buildAlchemyJobArchive(
      'job-4',
      STATUS,
      {
        fetchFn: fetchFn as unknown as typeof fetch,
        storedImages: [
          {
            localId: 'l1',
            imageId: 'RestoreFormer',
            kind: 'result',
            blob: new Blob([new Uint8Array([9, 9])], { type: 'image/png' }),
            mimeType: 'image/png',
          },
        ],
      },
    );

    expect(fetchFn).not.toHaveBeenCalled();
    expect(imageCount).toBe(1);
    expect(failedImages).toBe(0);
    expect(Object.keys(unzipSync(bytes))).toContain('images/RestoreFormer.png');
  });

  it('fetches only the forms it has no copy of', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(imageResponse([1, 2, 3, 4], 'image/webp'));

    const { imageCount, failedImages } = await buildAlchemyJobArchive(
      'job-5',
      TWO_IMAGE_STATUS,
      {
        fetchFn,
        storedImages: [
          {
            localId: 'l1',
            imageId: 'RestoreFormer',
            kind: 'result',
            blob: new Blob([new Uint8Array([9, 9])], { type: 'image/png' }),
            mimeType: 'image/png',
          },
        ],
      },
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(imageCount).toBe(2);
    expect(failedImages).toBe(0);
  });
});

describe('buildAlchemySeriesArchive', () => {
  it('folds each request into its own folder with the table beside them', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(imageResponse([1, 2], 'image/webp')),
    );
    const { bytes, imageCount, failedImages } = await buildAlchemySeriesArchive(
      [
        {
          jobId: 'job-a',
          status: STATUS,
          options: { fetchFn: fetchFn as unknown as typeof fetch },
        },
        {
          jobId: 'job-b',
          status: TWO_IMAGE_STATUS,
          options: { fetchFn: fetchFn as unknown as typeof fetch },
        },
      ],
      { fileName: 'series.csv', text: '"request"\r\n"job-a"\r\n"job-b"' },
    );
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual([
      'job-a/images/RestoreFormer.webp',
      'job-a/results.html',
      'job-a/results.json',
      'job-b/images/GFPGAN.webp',
      'job-b/images/RestoreFormer.webp',
      'job-b/results.html',
      'job-b/results.json',
      'series.csv',
    ]);
    expect(strFromU8(files['series.csv'])).toContain('"job-b"');
    expect(imageCount).toBe(3);
    expect(failedImages).toBe(0);
  });
});
