import { describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { buildAlchemyJobArchive } from './alchemy-archive';
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

describe('buildAlchemyJobArchive', () => {
  it('bundles results.json, results.html and fetched images', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(imageResponse([1, 2, 3, 4], 'image/webp'));

    const { bytes, imageCount, failedImages } = await buildAlchemyJobArchive(
      'job-1',
      STATUS,
      fetchFn,
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

  it('still produces an archive when an image fetch fails', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('CORS blocked'));

    const { bytes, imageCount, failedImages } = await buildAlchemyJobArchive(
      'job-2',
      STATUS,
      fetchFn,
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

    const { bytes } = await buildAlchemyJobArchive('job-3', status, fetchFn);
    const entries = unzipSync(bytes);
    expect(entries['images/RealESRGAN_x4plus.png']).toBeDefined();
  });
});
