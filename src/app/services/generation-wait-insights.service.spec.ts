import { describe, expect, it } from 'vitest';
import { GenerationCheckResponse } from '../types/generation';
import { LocalGenerationJob } from '../types/generation-job';
import { HordeWorker } from '../types/horde-worker';
import { GenerationWaitInsightsService } from './generation-wait-insights.service';
import type {
  WorkerFeasibility,
  WorkerRequirement,
} from './worker-pool.service';

function check(
  overrides: Partial<GenerationCheckResponse> = {},
): GenerationCheckResponse {
  return {
    finished: 0,
    processing: 0,
    restarted: 0,
    waiting: 1,
    done: false,
    faulted: false,
    wait_time: 30,
    queue_position: 10,
    kudos: 1,
    is_possible: true,
    eligible_workers: 2,
    eligible_worker_threads: 3,
    might_stall: false,
    ...overrides,
  };
}

function job(overrides: Partial<LocalGenerationJob> = {}): LocalGenerationJob {
  return {
    localId: 'job-1',
    status: 'queued',
    createdAt: 0,
    updatedAt: 0,
    request: {
      prompt: 'test',
      models: ['model-a'],
      params: { width: 1024, height: 1024, n: 1 },
    },
    resultImageIds: [],
    isPossible: true,
    eligibleWorkers: 2,
    eligibleWorkerThreads: 3,
    ...overrides,
  };
}

const requirement: WorkerRequirement = {
  models: ['model-a'],
  width: 1024,
  height: 1024,
  nsfw: false,
  needsImg2Img: false,
  needsPainting: false,
  needsControlNet: false,
  needsExtendedControlNet: false,
  needsControlStrength: false,
  trustedOnly: false,
  workers: [],
  workerBlacklist: false,
};

function worker(overrides: Partial<HordeWorker> = {}): HordeWorker {
  return {
    type: 'image',
    name: 'worker',
    id: 'worker-1',
    online: true,
    requests_fulfilled: 0,
    kudos_rewards: 0,
    performance: '1',
    threads: 1,
    uptime: 1,
    maintenance_mode: false,
    paused: false,
    nsfw: true,
    trusted: true,
    flagged: false,
    suspicious: 0,
    uncompleted_jobs: 0,
    models: ['model-a'],
    bridge_agent: 'test',
    max_pixels: 1024 * 1024,
    ...overrides,
  };
}

function blockedBy(blocked: WorkerFeasibility['blockedBy']): WorkerFeasibility {
  return {
    eligible: 0,
    blockedBy: blocked,
    survivors: 1,
    message: { key: 'test', params: {} },
  };
}

describe('GenerationWaitInsightsService', () => {
  it('requires three applicable polls to set and clear assignment pressure', () => {
    const service = new GenerationWaitInsightsService();

    service.recordCheck('job-1', check({ might_stall: true }), 1);
    service.recordCheck('job-1', check({ might_stall: true }), 2);
    expect(service.forJob(job(), requirement, null).stableStall).toBe(false);

    service.recordCheck('job-1', check({ might_stall: true }), 3);
    expect(service.forJob(job(), requirement, null).stableStall).toBe(true);

    service.recordCheck('job-1', check({ might_stall: undefined }), 4);
    service.recordCheck('job-1', check({ might_stall: false }), 5);
    service.recordCheck('job-1', check({ might_stall: false }), 6);
    expect(service.forJob(job(), requirement, null).stableStall).toBe(true);
    service.recordCheck('job-1', check({ might_stall: false }), 7);
    expect(service.forJob(job(), requirement, null).stableStall).toBe(false);
  });

  it('lets claimed lifecycle state clear stale pressure', () => {
    const service = new GenerationWaitInsightsService();
    for (let at = 1; at <= 3; at += 1) {
      service.recordCheck('job-1', check({ might_stall: true }), at);
    }
    service.recordCheck(
      'job-1',
      check({ processing: 1, waiting: 0, might_stall: true }),
      4,
    );

    expect(service.forJob(job(), requirement, null).stableStall).toBe(false);
  });

  it('detects a claimed generation returning to a bidirectionally moving queue', () => {
    const service = new GenerationWaitInsightsService();
    service.recordCheck(
      'job-1',
      check({ processing: 1, waiting: 0, queue_position: 8 }),
      1,
    );
    service.recordCheck(
      'job-1',
      check({ processing: 0, waiting: 1, restarted: 1, queue_position: 12 }),
      2,
    );
    service.recordCheck('job-1', check({ queue_position: 7, restarted: 1 }), 3);

    const insight = service.forJob(job(), requirement, null);
    expect(insight.returnedToQueue).toBe(true);
    expect(insight.trend).toBe('mixed');
  });

  it('prefers the model change when an online worker drops both offers', () => {
    const service = new GenerationWaitInsightsService();
    service.recordWorkerSnapshot([worker()], 1);
    service.recordWorkerSnapshot(
      [worker({ models: ['model-b'], max_pixels: 512 * 512 })],
      2,
    );

    const insight = service.forJob(job(), requirement, null);
    expect(insight.modelOfferChanged).toBe(true);
    expect(insight.sizeOfferChanged).toBe(false);
    expect(insight.reason).toBe('model-change');
  });

  it('detects a size offer dropped while the requested model remains', () => {
    const service = new GenerationWaitInsightsService();
    service.recordWorkerSnapshot([worker()], 1);
    service.recordWorkerSnapshot([worker({ max_pixels: 512 * 512 })], 2);

    const insight = service.forJob(job(), requirement, null);
    expect(insight.modelOfferChanged).toBe(false);
    expect(insight.sizeOfferChanged).toBe(true);
    expect(insight.reason).toBe('size-change');
  });

  it('does not call an offline or missing worker a temporary offer change', () => {
    const service = new GenerationWaitInsightsService();
    service.recordWorkerSnapshot([worker()], 1);
    service.recordWorkerSnapshot([], 2);
    expect(service.forJob(job(), requirement, null).modelOfferChanged).toBe(
      false,
    );

    service.recordWorkerSnapshot([worker({ online: false, models: [] })], 3);
    expect(service.forJob(job(), requirement, null).modelOfferChanged).toBe(
      false,
    );
  });

  it('clears changes when the current worker offer becomes compatible again', () => {
    const service = new GenerationWaitInsightsService();
    service.recordWorkerSnapshot([worker()], 1);
    service.recordWorkerSnapshot(
      [worker({ models: ['model-b'], max_pixels: 512 * 512 })],
      2,
    );
    service.recordWorkerSnapshot([worker()], 3);

    const insight = service.forJob(job(), requirement, null);
    expect(insight.modelOfferChanged).toBe(false);
    expect(insight.sizeOfferChanged).toBe(false);
  });

  it('does not report a model drop while another accepted model remains', () => {
    const service = new GenerationWaitInsightsService();
    const eitherModel = { ...requirement, models: ['model-a', 'model-b'] };
    service.recordWorkerSnapshot([worker()], 1);
    service.recordWorkerSnapshot([worker({ models: ['model-b'] })], 2);

    expect(service.forJob(job(), eitherModel, null).modelOfferChanged).toBe(
      false,
    );
  });

  it('does not let a local size or model result override backend feasibility', () => {
    const service = new GenerationWaitInsightsService();

    expect(service.forJob(job(), requirement, blockedBy('size')).reason).toBe(
      'supported',
    );
    expect(service.forJob(job(), requirement, blockedBy('model')).reason).toBe(
      'supported',
    );
  });

  it('uses temporary wording categories when a no-route snapshot is size-limited', () => {
    const service = new GenerationWaitInsightsService();
    const noRoute = job({ isPossible: false, eligibleWorkers: 0 });

    expect(service.forJob(noRoute, requirement, blockedBy('size')).reason).toBe(
      'no-route-size',
    );
  });

  it('says an offer change is not yet knowable on the first worker reading', () => {
    const service = new GenerationWaitInsightsService();
    const noRoute = job({ isPossible: false, eligibleWorkers: 0 });
    service.recordCheck('job-1', check({ is_possible: true }), 1);

    expect(service.forJob(noRoute, requirement, null).reason).toBe(
      'no-route-pending',
    );

    service.recordWorkerSnapshot([worker()], 2);
    expect(service.forJob(noRoute, requirement, null).reason).toBe(
      'no-route-pending',
    );

    service.recordWorkerSnapshot([worker()], 3);
    expect(service.forJob(noRoute, requirement, null).reason).toBe('no-route');
  });

  it('does not wait on worker readings for a request that never had a route', () => {
    const service = new GenerationWaitInsightsService();

    expect(
      service.forJob(
        job({ isPossible: false, eligibleWorkers: 0 }),
        requirement,
        null,
      ).reason,
    ).toBe('no-route');
  });

  it('remembers an offer change across the whole history window', () => {
    const service = new GenerationWaitInsightsService();
    const poll = 10_000;
    // The model is on offer for the first minute, then gone for the next
    // three. A retained reading has to reach back past the recent few for the
    // change to still be attributable.
    for (let at = 0; at <= 4 * 60_000; at += poll) {
      service.recordWorkerSnapshot(
        [worker({ models: at <= 60_000 ? ['model-a'] : ['model-b'] })],
        at,
      );
    }

    expect(service.forJob(job(), requirement, null).modelOfferChanged).toBe(
      true,
    );
  });

  it('drops readings once they fall out of the history window', () => {
    const service = new GenerationWaitInsightsService();
    const poll = 10_000;
    for (let at = 0; at <= 6 * 60_000; at += poll) {
      service.recordWorkerSnapshot(
        [worker({ models: at <= 60_000 ? ['model-a'] : ['model-b'] })],
        at,
      );
    }

    expect(service.forJob(job(), requirement, null).modelOfferChanged).toBe(
      false,
    );
  });

  it('fails neutral when backend feasibility fields disagree', () => {
    const service = new GenerationWaitInsightsService();

    expect(
      service.forJob(
        job({ isPossible: true, eligibleWorkers: 0 }),
        requirement,
        null,
      ).reason,
    ).toBe('refreshing');
  });
});
