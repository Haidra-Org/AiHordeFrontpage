import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { catchError, of } from 'rxjs';
import { HordeWorker } from '../types/horde-worker';
import { HordeApiCacheService } from './horde-api-cache.service';
import { API_BASE_URL } from './api-config';

/** How long a fetched list of workers is served before it is fetched again. */
export const WORKER_POOL_TTL_MS = 3 * 60 * 1000;

/**
 * What a request needs of a worker, read off the form. Every field is a plain
 * value rather than the form itself, so the pipeline below can be exercised
 * with a synthetic request and stays independent of the studio's own shape.
 */
export interface WorkerRequirement {
  /** The chosen model, or '' for "any model", which every worker satisfies. */
  model: string;
  width: number;
  height: number;
  /** Whether the request is marked as adult; a SFW request any worker may take. */
  nsfw: boolean;
  needsImg2Img: boolean;
  needsPainting: boolean;
  needsControlNet: boolean;
  /** Whether the chosen guidance mode is one only a recent bridge understands. */
  needsExtendedControlNet: boolean;
  trustedOnly: boolean;
  /** Worker ids the request is pinned to or steered away from. */
  workers: readonly string[];
  /** Whether {@link WorkerRequirement.workers} is an avoid list. */
  workerBlacklist: boolean;
}

/**
 * The tests a worker has to pass, in the order they are applied. The order is
 * what makes the answer explainable: the first test that empties the pool is
 * the one worth reporting, because everything after it never got a say.
 */
export type WorkerFilterId =
  | 'available'
  | 'model'
  | 'size'
  | 'nsfw'
  | 'img2img'
  | 'painting'
  | 'controlnet'
  | 'controlnet_extended'
  | 'trusted'
  | 'routing';

/** A sentence to render, named by its translation key. */
export interface WorkerFeasibilityMessage {
  key: string;
  params: Record<string, string | number>;
}

export interface WorkerFeasibility {
  /** How many workers could take the request as it stands. */
  eligible: number;
  /** The test that emptied the pool, or null while some worker survives. */
  blockedBy: WorkerFilterId | null;
  /** How many workers were still standing when the blocking test ran. */
  survivors: number;
  /** What to say about it. */
  message: WorkerFeasibilityMessage;
}

/**
 * The largest square a worker offering `maxPixels` can draw, rounded down to a
 * multiple of 64 because that is the granularity the studio's own size control
 * moves in. Quoting a bound the reader cannot dial to would be no help.
 */
export function largestSquareSide(maxPixels: number): number {
  return Math.floor(Math.sqrt(maxPixels) / 64) * 64;
}

/** Whether a worker is carrying `model`; an empty model asks nothing of it. */
function servesModel(worker: HordeWorker, model: string): boolean {
  if (model === '') {
    return true;
  }
  return worker.models?.includes(model) ?? false;
}

/**
 * Whether the request's worker routing lets `worker` take it. An allow list the
 * user left empty pins nothing, and an avoid list that is empty avoids nothing.
 * The horde matches these against worker ids, so that is what is compared.
 */
function routingAllows(
  worker: HordeWorker,
  requirement: WorkerRequirement,
): boolean {
  if (requirement.workers.length === 0) {
    return true;
  }
  const listed = requirement.workers.includes(worker.id);
  return requirement.workerBlacklist ? !listed : listed;
}

interface WorkerFilter {
  id: WorkerFilterId;
  /** Whether this test has anything to say about the request at all. */
  applies: boolean;
  keep: (worker: HordeWorker) => boolean;
}

function filtersFor(requirement: WorkerRequirement): WorkerFilter[] {
  const pixels = requirement.width * requirement.height;
  return [
    {
      id: 'available',
      applies: true,
      keep: (worker) => worker.online && !worker.maintenance_mode,
    },
    {
      id: 'model',
      applies: requirement.model !== '',
      keep: (worker) => servesModel(worker, requirement.model),
    },
    {
      // The hires pass does not loosen this: the first pass is drawn small and
      // the second one draws the size that was asked for, so the requested
      // size is what a worker has to be able to hold either way.
      id: 'size',
      applies: true,
      keep: (worker) => (worker.max_pixels ?? 0) >= pixels,
    },
    {
      id: 'nsfw',
      applies: requirement.nsfw,
      keep: (worker) => worker.nsfw,
    },
    {
      id: 'img2img',
      applies: requirement.needsImg2Img,
      keep: (worker) => worker.img2img === true,
    },
    {
      id: 'painting',
      applies: requirement.needsPainting,
      keep: (worker) => worker.painting === true,
    },
    {
      id: 'controlnet',
      applies: requirement.needsControlNet,
      keep: (worker) => worker.controlnet === true,
    },
    {
      id: 'controlnet_extended',
      applies: requirement.needsExtendedControlNet,
      keep: (worker) => worker.extended_controlnet === true,
    },
    {
      id: 'trusted',
      applies: requirement.trustedOnly,
      keep: (worker) => worker.trusted,
    },
    {
      id: 'routing',
      applies: requirement.workers.length > 0,
      keep: (worker) => routingAllows(worker, requirement),
    },
  ];
}

/** What to say when every worker survived. */
function healthyMessage(eligible: number): WorkerFeasibilityMessage {
  return {
    key:
      eligible === 1
        ? 'generate.workers.available_one'
        : 'generate.workers.available_other',
    params: { count: eligible },
  };
}

/**
 * What to say about the test that emptied the pool. Every sentence names how
 * many workers were still standing before it ran, which is the bound the reader
 * is being asked to loosen back to, so each carries a singular and a plural
 * spelling of that count.
 */
function blockedMessage(
  filter: WorkerFilterId,
  survivors: readonly HordeWorker[],
  requirement: WorkerRequirement,
): WorkerFeasibilityMessage {
  const count = survivors.length;
  const number = count === 1 ? 'one' : 'other';
  if (filter === 'available') {
    return { key: 'generate.workers.none_available', params: {} };
  }
  if (filter === 'size') {
    const best = survivors.reduce(
      (widest, worker) => Math.max(widest, worker.max_pixels ?? 0),
      0,
    );
    const side = largestSquareSide(best);
    return side > 0
      ? { key: `generate.workers.none_size_${number}`, params: { count, side } }
      : {
          key: `generate.workers.none_size_unknown_${number}`,
          params: { count },
        };
  }
  if (filter === 'routing') {
    return {
      key: requirement.workerBlacklist
        ? `generate.workers.none_routing_avoid_${number}`
        : `generate.workers.none_routing_only_${number}`,
      params: { count },
    };
  }
  return {
    key: `generate.workers.none_${filter}_${number}`,
    params: { count },
  };
}

/**
 * How many of `workers` could take the request, and when none can, which of the
 * request's demands is the one that ruled the last of them out.
 *
 * Returns null when the list of workers is unknown, which is what a failed or
 * not-yet-made fetch leaves behind. Nothing here may ever stand between the
 * reader and the Generate button, so an unknown pool says nothing at all rather
 * than guessing, and the horde stays the only authority on what it will accept.
 */
export function evaluateWorkerFeasibility(
  workers: readonly HordeWorker[] | null,
  requirement: WorkerRequirement,
): WorkerFeasibility | null {
  if (workers === null) {
    return null;
  }
  let standing: readonly HordeWorker[] = workers;
  for (const filter of filtersFor(requirement)) {
    if (!filter.applies) {
      continue;
    }
    const survivors = standing;
    standing = survivors.filter(filter.keep);
    if (standing.length === 0) {
      return {
        eligible: 0,
        blockedBy: filter.id,
        survivors: survivors.length,
        message: blockedMessage(filter.id, survivors, requirement),
      };
    }
  }
  return {
    eligible: standing.length,
    blockedBy: null,
    survivors: standing.length,
    message: healthyMessage(standing.length),
  };
}

/**
 * The image workers the horde is currently listing, so the studio can say
 * whether anyone can take the request being written.
 *
 * Nothing is requested until {@link load} is called, and every failure is
 * silent: the list stays at whatever was last known, or null when nothing has
 * ever been fetched, which the feasibility pipeline reads as "say nothing".
 */
@Injectable({ providedIn: 'root' })
export class WorkerPoolService {
  private readonly cache = inject(HordeApiCacheService);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Every image worker the horde listed, or null while none are known. */
  public readonly workers = signal<readonly HordeWorker[] | null>(null);

  private fetchedAt = 0;
  private inFlight = false;

  /**
   * Fetch the worker list when the known copy is older than
   * {@link WORKER_POOL_TTL_MS}. Safe to call as often as the form changes.
   */
  public load(): void {
    if (!this.isBrowser || this.inFlight) {
      return;
    }
    if (
      this.workers() !== null &&
      Date.now() - this.fetchedAt < WORKER_POOL_TTL_MS
    ) {
      return;
    }
    this.inFlight = true;
    this.cache
      .cachedGet<HordeWorker[]>(
        `${this.baseUrl}/workers?type=image`,
        undefined,
        { ttl: WORKER_POOL_TTL_MS, category: 'worker-pool' },
      )
      .pipe(catchError(() => of(null)))
      .subscribe((list) => {
        this.inFlight = false;
        if (list === null) {
          return;
        }
        this.fetchedAt = Date.now();
        this.workers.set(list);
      });
  }
}
