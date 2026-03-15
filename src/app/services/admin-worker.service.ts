import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, tap, from } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, scan } from 'rxjs/operators';
import {
  HordeWorker,
  PutWorkerRequest,
  WorkerModifyResponse,
} from '../types/horde-worker';
import { AuthService } from './auth.service';
import { HordeApiCacheService, CacheTTL } from './horde-api-cache.service';

@Injectable({
  providedIn: 'root',
})
export class AdminWorkerService {
  private readonly httpClient = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly cache = inject(HordeApiCacheService);
  private readonly baseUrl = 'https://aihorde.net/api/v2';

  /**
   * Get all workers in the horde
   */
  public getWorkers(): Observable<HordeWorker[]> {
    const apiKey = this.auth.getStoredApiKey();
    const options = apiKey ? { headers: { apikey: apiKey } } : {};

    return this.cache
      .cachedGet<
        HordeWorker[]
      >(`${this.baseUrl}/workers`, options, { ttl: CacheTTL.SHORT, category: 'admin-workers' })
      .pipe(catchError(() => of([])));
  }

  /**
   * Get a specific worker by ID
   */
  public getWorker(id: string): Observable<HordeWorker | null> {
    const apiKey = this.auth.getStoredApiKey();
    const options = apiKey ? { headers: { apikey: apiKey } } : {};

    return this.cache.cachedGet<HordeWorker>(
      `${this.baseUrl}/workers/${id}`,
      options,
      {
        ttl: CacheTTL.SHORT,
        category: 'admin-workers',
      },
    );
  }

  /**
   * Get multiple workers by their IDs (includes inactive workers)
   * This is useful for fetching all workers belonging to a user
   */
  public getWorkersByIds(workerIds: string[]): Observable<HordeWorker[]> {
    if (!workerIds || workerIds.length === 0) {
      return of([]);
    }

    return from(workerIds).pipe(
      mergeMap((id) =>
        this.getWorker(id).pipe(
          catchError(() => of(null)),
          map((worker) => ({ id, worker })),
        ),
      ),
      scan((workersById, result) => {
        if (result.worker) {
          workersById.set(result.id, result.worker);
        }
        return workersById;
      }, new Map<string, HordeWorker>()),
      map((workersById) =>
        workerIds
          .map((id) => workersById.get(id))
          .filter((worker): worker is HordeWorker => worker !== undefined),
      ),
      distinctUntilChanged(
        (prev, curr) =>
          prev.length === curr.length &&
          prev.every((worker, idx) => worker.id === curr[idx]?.id),
      ),
      catchError(() => of([])),
    );
  }

  /**
   * Modify a worker (requires moderator or owner permissions)
   */
  public updateWorker(
    id: string,
    data: PutWorkerRequest,
  ): Observable<WorkerModifyResponse | null> {
    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) {
      return of(null);
    }

    return this.httpClient
      .put<WorkerModifyResponse>(`${this.baseUrl}/workers/${id}`, data, {
        headers: { apikey: apiKey },
      })
      .pipe(tap(() => this.cache.invalidate({ category: 'admin-workers' })));
  }

  /**
   * Set worker to maintenance mode
   */
  public setMaintenance(
    id: string,
    maintenance: boolean,
    message?: string,
  ): Observable<WorkerModifyResponse | null> {
    const data: PutWorkerRequest = {
      maintenance,
      maintenance_msg: maintenance ? message : '',
    };
    return this.updateWorker(id, data);
  }

  /**
   * Set worker paused state
   */
  public setPaused(
    id: string,
    paused: boolean,
  ): Observable<WorkerModifyResponse | null> {
    return this.updateWorker(id, { paused });
  }

  /**
   * Delete a worker (requires moderator or owner permissions)
   */
  public deleteWorker(
    id: string,
  ): Observable<{ deleted_id: string; deleted_name: string } | null> {
    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) {
      return of(null);
    }

    return this.httpClient
      .delete<{ deleted_id: string; deleted_name: string }>(
        `${this.baseUrl}/workers/${id}`,
        {
          headers: { apikey: apiKey },
        },
      )
      .pipe(tap(() => this.cache.invalidate({ category: 'admin-workers' })));
  }

  /**
   * Get a specific worker by name (case insensitive)
   */
  public getWorkerByName(name: string): Observable<HordeWorker | null> {
    const apiKey = this.auth.getStoredApiKey();
    const options = apiKey ? { headers: { apikey: apiKey } } : {};

    return this.cache.cachedGet<HordeWorker>(
      `${this.baseUrl}/workers/name/${encodeURIComponent(name)}`,
      options,
      {
        ttl: CacheTTL.SHORT,
        category: 'admin-workers',
      },
    );
  }
}
