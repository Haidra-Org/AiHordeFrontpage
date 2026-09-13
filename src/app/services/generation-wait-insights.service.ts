import { Injectable, signal } from '@angular/core';
import { GenerationCheckResponse } from '../types/generation';
import { LocalGenerationJob } from '../types/generation-job';
import { HordeWorker } from '../types/horde-worker';
import type {
  WorkerFeasibility,
  WorkerFilterId,
  WorkerRequirement,
} from './worker-pool.service';

const HISTORY_WINDOW_MS = 5 * 60 * 1000;
const MAX_STATUS_SAMPLES = 160;
/**
 * How far apart two retained worker snapshots have to be once they are no
 * longer recent. Worker offers are read far more often than they change, so
 * thinning the older end holds the memory to the full history window at a cost
 * that does not follow the polling rate.
 */
const SNAPSHOT_SPACING_MS = 30 * 1000;
/**
 * How many of the newest snapshots are kept whatever their spacing, so that a
 * second reading can be compared against the first as soon as it arrives
 * rather than after a spacing interval has passed.
 */
const DENSE_SNAPSHOTS = 3;
const STALL_POLLS = 3;

interface StatusSample {
  at: number;
  queuePosition: number;
  waitTime: number;
  processing: number;
  waiting: number;
  restarted: number;
  isPossible: boolean;
  eligibleWorkers?: number;
  eligibleWorkerThreads?: number;
}

interface JobHistory {
  samples: StatusSample[];
  trueRun: number;
  falseRun: number;
  stableStall: boolean;
  returnedToQueue: boolean;
}

interface WorkerSnapshot {
  at: number;
  workers: ReadonlyMap<string, WorkerOffer>;
}

interface WorkerOffer {
  online: boolean;
  maintenance: boolean;
  models: ReadonlySet<string>;
  maxPixels: number;
}

export type QueueTrend = 'mixed' | 'improved' | 'worsened' | 'steady';

export type WaitReason =
  | 'refreshing'
  | 'no-route-model'
  | 'no-route-size'
  | 'no-route-pending'
  | 'no-route'
  | 'pressure'
  | 'model-change'
  | 'size-change'
  | 'limited'
  | 'supported'
  | 'unknown';

export interface GenerationWaitInsight {
  reason: WaitReason;
  stableStall: boolean;
  returnedToQueue: boolean;
  modelOfferChanged: boolean;
  sizeOfferChanged: boolean;
  trend: QueueTrend;
  localLimit: WorkerFilterId | null;
  capacityChanged: boolean;
}

function activeOffer(worker: HordeWorker): WorkerOffer {
  return {
    online: worker.online,
    maintenance: worker.maintenance_mode,
    models: new Set(worker.models ?? []),
    maxPixels: worker.max_pixels ?? 0,
  };
}

function offeredModel(offer: WorkerOffer, models: readonly string[]): boolean {
  return models.length === 0 || models.some((model) => offer.models.has(model));
}

function available(offer: WorkerOffer | undefined): offer is WorkerOffer {
  return !!offer?.online && !offer.maintenance;
}

/**
 * Holds short-lived evidence that cannot be recovered from one status response.
 * Current API values remain on the job; movement and worker offer changes do not
 * survive the browser session because they are observations rather than state.
 */
@Injectable({ providedIn: 'root' })
export class GenerationWaitInsightsService {
  private readonly histories = new Map<string, JobHistory>();
  private readonly workerSnapshots: WorkerSnapshot[] = [];
  private readonly revision = signal(0);

  public recordCheck(
    localId: string,
    check: GenerationCheckResponse,
    at: number,
  ): void {
    const history = this.histories.get(localId) ?? {
      samples: [],
      trueRun: 0,
      falseRun: 0,
      stableStall: false,
      returnedToQueue: false,
    };
    const previous = history.samples.at(-1);

    if (
      check.waiting > 0 &&
      check.processing === 0 &&
      check.might_stall !== undefined
    ) {
      if (check.might_stall) {
        history.trueRun += 1;
        history.falseRun = 0;
        if (history.trueRun >= STALL_POLLS) {
          history.stableStall = true;
        }
      } else {
        history.falseRun += 1;
        history.trueRun = 0;
        if (history.falseRun >= STALL_POLLS) {
          history.stableStall = false;
        }
      }
    } else if (check.processing > 0) {
      history.trueRun = 0;
      history.falseRun = 0;
      history.stableStall = false;
      history.returnedToQueue = false;
    }

    if (
      check.waiting > 0 &&
      check.processing === 0 &&
      ((previous?.processing ?? 0) > 0 ||
        check.restarted > (previous?.restarted ?? 0))
    ) {
      history.returnedToQueue = true;
    }

    history.samples.push({
      at,
      queuePosition: check.queue_position,
      waitTime: check.wait_time,
      processing: check.processing,
      waiting: check.waiting,
      restarted: check.restarted,
      isPossible: check.is_possible,
      eligibleWorkers: check.eligible_workers,
      eligibleWorkerThreads: check.eligible_worker_threads,
    });
    history.samples = history.samples
      .filter((sample) => at - sample.at <= HISTORY_WINDOW_MS)
      .slice(-MAX_STATUS_SAMPLES);
    this.histories.set(localId, history);
    this.revision.update((value) => value + 1);
  }

  public recordWorkerSnapshot(
    workers: readonly HordeWorker[],
    at: number,
  ): void {
    this.workerSnapshots.push({
      at,
      workers: new Map(
        workers.map((worker) => [worker.id, activeOffer(worker)] as const),
      ),
    });
    this.pruneWorkerSnapshots(at);
    this.revision.update((value) => value + 1);
  }

  public clear(localId: string): void {
    if (this.histories.delete(localId)) {
      this.revision.update((value) => value + 1);
    }
  }

  public clearAll(): void {
    if (this.histories.size > 0) {
      this.histories.clear();
      this.revision.update((value) => value + 1);
    }
  }

  public forJob(
    job: LocalGenerationJob,
    requirement: WorkerRequirement,
    feasibility: WorkerFeasibility | null,
  ): GenerationWaitInsight {
    this.revision();
    const history = this.histories.get(job.localId);
    const samples = history?.samples ?? [];
    const hadFeasibleRoute =
      job.isPossible === true ||
      (job.eligibleWorkers ?? 0) > 0 ||
      samples.some(
        (sample) => sample.isPossible || (sample.eligibleWorkers ?? 0) > 0,
      );
    const offers = this.comparableSnapshots();
    const workerChange =
      hadFeasibleRoute && offers
        ? this.workerChanges(offers.current, offers.prior, requirement)
        : { model: false, size: false };
    const trend = this.queueTrend(samples);
    const capacityChanged = samples.some((sample, index) => {
      const previous = samples[index - 1];
      return (
        !!previous &&
        (sample.eligibleWorkers !== previous.eligibleWorkers ||
          sample.eligibleWorkerThreads !== previous.eligibleWorkerThreads)
      );
    });
    const eligible = job.eligibleWorkers;
    const conflict =
      eligible !== undefined &&
      job.isPossible !== undefined &&
      ((job.isPossible && eligible === 0) || (!job.isPossible && eligible > 0));
    const noRoute = !conflict && (job.isPossible === false || eligible === 0);
    const localLimit = noRoute ? (feasibility?.blockedBy ?? null) : null;

    let reason: WaitReason;
    if (conflict) {
      reason = 'refreshing';
    } else if (noRoute && (workerChange.model || localLimit === 'model')) {
      reason = 'no-route-model';
    } else if (noRoute && (workerChange.size || localLimit === 'size')) {
      reason = 'no-route-size';
    } else if (noRoute && hadFeasibleRoute && !offers && localLimit === null) {
      reason = 'no-route-pending';
    } else if (noRoute) {
      reason = 'no-route';
    } else if (history?.stableStall) {
      reason = 'pressure';
    } else if (workerChange.model) {
      reason = 'model-change';
    } else if (workerChange.size) {
      reason = 'size-change';
    } else if (eligible === 1 || job.eligibleWorkerThreads === 1) {
      reason = 'limited';
    } else if (
      eligible !== undefined ||
      job.eligibleWorkerThreads !== undefined
    ) {
      reason = 'supported';
    } else {
      reason = 'unknown';
    }

    return {
      reason,
      stableStall: history?.stableStall ?? false,
      returnedToQueue: history?.returnedToQueue ?? false,
      modelOfferChanged: workerChange.model,
      sizeOfferChanged: workerChange.size,
      trend,
      localLimit,
      capacityChanged,
    };
  }

  /**
   * How the horde-wide position has moved for a request, read from the checks
   * recorded under its id. A text request has no image job to hand to
   * {@link forJob}, and its trend is all of the insight that applies to it.
   */
  public trendFor(localId: string): QueueTrend {
    this.revision();
    return this.queueTrend(this.histories.get(localId)?.samples ?? []);
  }

  private queueTrend(samples: readonly StatusSample[]): QueueTrend {
    let improved = false;
    let worsened = false;
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples.at(index - 1)?.queuePosition;
      const current = samples.at(index)?.queuePosition;
      if (previous === undefined || current === undefined) {
        continue;
      }
      improved ||= current < previous;
      worsened ||= current > previous;
    }
    if (improved && worsened) {
      return 'mixed';
    }
    if (improved) {
      return 'improved';
    }
    if (worsened) {
      return 'worsened';
    }
    return 'steady';
  }

  /**
   * Thin the retained snapshots: the newest few are kept whatever their
   * spacing, older ones only where they are the last reading of their spacing
   * interval, and anything past the history window is dropped.
   */
  private pruneWorkerSnapshots(at: number): void {
    const interval = (snapshot: WorkerSnapshot): number =>
      Math.floor(snapshot.at / SNAPSHOT_SPACING_MS);
    const kept = this.workerSnapshots.filter((snapshot, index, all) => {
      if (at - snapshot.at > HISTORY_WINDOW_MS) {
        return false;
      }
      if (index >= all.length - DENSE_SNAPSHOTS) {
        return true;
      }
      const next = all.at(index + 1);
      return !next || interval(snapshot) !== interval(next);
    });
    this.workerSnapshots.splice(0, this.workerSnapshots.length, ...kept);
  }

  /**
   * The newest snapshot and the earlier ones it can be read against, or null
   * while nothing has been observed twice and no offer change can be claimed
   * either way.
   */
  private comparableSnapshots(): {
    current: WorkerSnapshot;
    prior: WorkerSnapshot[];
  } | null {
    const current = this.workerSnapshots.at(-1);
    if (!current) {
      return null;
    }
    const prior = this.workerSnapshots.filter(
      (snapshot) =>
        snapshot !== current && current.at - snapshot.at <= HISTORY_WINDOW_MS,
    );
    return prior.length === 0 ? null : { current, prior };
  }

  private workerChanges(
    current: WorkerSnapshot,
    prior: readonly WorkerSnapshot[],
    requirement: WorkerRequirement,
  ): {
    model: boolean;
    size: boolean;
  } {
    const pixels = requirement.width * requirement.height;
    let model = false;
    let size = false;

    for (const [id, offer] of current.workers) {
      if (!available(offer)) {
        continue;
      }
      for (const snapshot of prior) {
        const before = snapshot.workers.get(id);
        if (!available(before)) {
          continue;
        }
        model ||=
          offeredModel(before, requirement.models) &&
          before.maxPixels >= pixels &&
          !offeredModel(offer, requirement.models);
        size ||=
          offeredModel(before, requirement.models) &&
          offeredModel(offer, requirement.models) &&
          before.maxPixels >= pixels &&
          offer.maxPixels < pixels;
        if (model && size) {
          return { model, size };
        }
      }
    }
    return { model, size };
  }
}
