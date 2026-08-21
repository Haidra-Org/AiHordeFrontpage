import { describe, expect, it } from 'vitest';
import {
  evaluateWorkerFeasibility,
  largestSquareSide,
  type WorkerRequirement,
} from './worker-pool.service';
import { HordeWorker } from '../types/horde-worker';

function worker(overrides: Partial<HordeWorker> = {}): HordeWorker {
  return {
    type: 'image',
    name: 'Worker',
    id: 'id-1',
    online: true,
    requests_fulfilled: 0,
    kudos_rewards: 0,
    performance: '1 megapixelsteps per second',
    threads: 1,
    uptime: 0,
    maintenance_mode: false,
    paused: false,
    nsfw: true,
    trusted: true,
    flagged: false,
    suspicious: 0,
    uncompleted_jobs: 0,
    models: ['stable_diffusion'],
    bridge_agent: 'test',
    max_pixels: 1_048_576,
    img2img: true,
    painting: true,
    controlnet: true,
    extended_controlnet: true,
    ...overrides,
  };
}

function requirement(
  overrides: Partial<WorkerRequirement> = {},
): WorkerRequirement {
  return {
    model: '',
    width: 512,
    height: 512,
    nsfw: false,
    needsImg2Img: false,
    needsPainting: false,
    needsControlNet: false,
    needsExtendedControlNet: false,
    trustedOnly: false,
    workers: [],
    workerBlacklist: false,
    ...overrides,
  };
}

describe('largestSquareSide', () => {
  it('rounds down to the size control granularity', () => {
    expect(largestSquareSide(1_048_576)).toBe(1024);
    expect(largestSquareSide(589_824)).toBe(768);
    // 700x700 fits in this budget but the control cannot be dialled there.
    expect(largestSquareSide(500_000)).toBe(704);
  });

  it('is zero when the worker reports no budget', () => {
    expect(largestSquareSide(0)).toBe(0);
  });
});

describe('evaluateWorkerFeasibility', () => {
  it('says nothing when the worker list is unknown', () => {
    expect(evaluateWorkerFeasibility(null, requirement())).toBeNull();
  });

  it('counts the workers that can take a plain request', () => {
    const result = evaluateWorkerFeasibility(
      [worker({ id: 'a' }), worker({ id: 'b' })],
      requirement(),
    );
    expect(result).toEqual({
      eligible: 2,
      blockedBy: null,
      survivors: 2,
      message: {
        key: 'generate.workers.available_other',
        params: { count: 2 },
      },
    });
  });

  it('speaks of a single worker in the singular', () => {
    const result = evaluateWorkerFeasibility([worker()], requirement());
    expect(result?.message.key).toBe('generate.workers.available_one');
  });

  it('drops workers that are offline or in maintenance', () => {
    const result = evaluateWorkerFeasibility(
      [worker({ id: 'a', online: false }), worker({ id: 'b' })],
      requirement(),
    );
    expect(result?.eligible).toBe(1);

    const none = evaluateWorkerFeasibility(
      [worker({ maintenance_mode: true })],
      requirement(),
    );
    expect(none?.blockedBy).toBe('available');
    expect(none?.message).toEqual({
      key: 'generate.workers.none_available',
      params: {},
    });
  });

  it('an empty model asks nothing of the worker', () => {
    const result = evaluateWorkerFeasibility(
      [worker({ models: [] })],
      requirement({ model: '' }),
    );
    expect(result?.eligible).toBe(1);
  });

  it('reports the model when nobody carries it', () => {
    const result = evaluateWorkerFeasibility(
      [worker({ id: 'a' }), worker({ id: 'b' })],
      requirement({ model: 'Some Other Model' }),
    );
    expect(result?.blockedBy).toBe('model');
    expect(result?.message).toEqual({
      key: 'generate.workers.none_model_other',
      params: { count: 2 },
    });
  });

  it('reports the best size on offer when the request is too large', () => {
    const result = evaluateWorkerFeasibility(
      [
        worker({ id: 'a', max_pixels: 1_048_576 }),
        worker({ id: 'b', max_pixels: 262_144 }),
      ],
      requirement({ width: 2048, height: 2048 }),
    );
    expect(result?.blockedBy).toBe('size');
    expect(result?.message).toEqual({
      key: 'generate.workers.none_size_other',
      params: { count: 2, side: 1024 },
    });
  });

  it('falls back to a bound-free sentence when no size is reported', () => {
    const result = evaluateWorkerFeasibility(
      [worker({ max_pixels: undefined })],
      requirement(),
    );
    expect(result?.blockedBy).toBe('size');
    expect(result?.message.key).toBe('generate.workers.none_size_unknown_one');
  });

  it('only asks for adult-capable workers when the request is adult', () => {
    const sfw = evaluateWorkerFeasibility(
      [worker({ nsfw: false })],
      requirement({ nsfw: false }),
    );
    expect(sfw?.eligible).toBe(1);

    const adult = evaluateWorkerFeasibility(
      [worker({ nsfw: false })],
      requirement({ nsfw: true }),
    );
    expect(adult?.blockedBy).toBe('nsfw');
  });

  it.each([
    ['img2img', { needsImg2Img: true }, { img2img: false }],
    ['painting', { needsPainting: true }, { painting: false }],
    ['controlnet', { needsControlNet: true }, { controlnet: false }],
    [
      'controlnet_extended',
      { needsExtendedControlNet: true },
      { extended_controlnet: false },
    ],
  ])('reports the missing %s capability', (id, need, lack) => {
    const result = evaluateWorkerFeasibility(
      [worker(lack)],
      requirement(need as Partial<WorkerRequirement>),
    );
    expect(result?.blockedBy).toBe(id);
    expect(result?.message.key).toBe(`generate.workers.none_${id}_one`);
  });

  it('reports the trusted-only setting when it empties the pool', () => {
    const result = evaluateWorkerFeasibility(
      [worker({ trusted: false })],
      requirement({ trustedOnly: true }),
    );
    expect(result?.blockedBy).toBe('trusted');
  });

  it('distinguishes an empty pin list from an exhaustive avoid list', () => {
    const pinned = evaluateWorkerFeasibility(
      [worker({ id: 'a' })],
      requirement({ workers: ['b'] }),
    );
    expect(pinned?.blockedBy).toBe('routing');
    expect(pinned?.message.key).toBe('generate.workers.none_routing_only_one');

    const avoided = evaluateWorkerFeasibility(
      [worker({ id: 'a' })],
      requirement({ workers: ['a'], workerBlacklist: true }),
    );
    expect(avoided?.message.key).toBe(
      'generate.workers.none_routing_avoid_one',
    );
  });

  it('an avoid list that names nobody present pins nothing', () => {
    const result = evaluateWorkerFeasibility(
      [worker({ id: 'a' })],
      requirement({ workers: ['zzz'], workerBlacklist: true }),
    );
    expect(result?.eligible).toBe(1);
  });

  it('reports the first demand that empties the pool, not a later one', () => {
    // Nobody carries the model and nobody is large enough; the model is asked
    // about first, so that is what the reader is told to loosen.
    const result = evaluateWorkerFeasibility(
      [worker({ models: ['other'], max_pixels: 262_144 })],
      requirement({ model: 'wanted', width: 1024, height: 1024 }),
    );
    expect(result?.blockedBy).toBe('model');
  });

  it('counts only the workers still standing when the demand is reached', () => {
    const result = evaluateWorkerFeasibility(
      [
        worker({ id: 'a', online: false }),
        worker({ id: 'b', max_pixels: 262_144 }),
        worker({ id: 'c', max_pixels: 262_144 }),
      ],
      requirement({ width: 1024, height: 1024 }),
    );
    expect(result?.survivors).toBe(2);
    expect(result?.message.params['count']).toBe(2);
  });
});
