import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  HordeWorker,
  PutWorkerRequest,
  WorkerModifyResponse,
} from '../types/horde-worker';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class AdminWorkerService {
  private readonly httpClient = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = 'https://aihorde.net/api/v2';

  /**
   * Get all workers in the horde
   */
  public getWorkers(): Observable<HordeWorker[]> {
    const apiKey = this.auth.getStoredApiKey();
    const options = apiKey ? { headers: { apikey: apiKey } } : {};

    return this.httpClient
      .get<HordeWorker[]>(`${this.baseUrl}/workers`, options)
      .pipe(catchError(() => of([])));
  }

  /**
   * Get a specific worker by ID
   */
  public getWorker(id: string): Observable<HordeWorker | null> {
    const apiKey = this.auth.getStoredApiKey();
    const options = apiKey ? { headers: { apikey: apiKey } } : {};

    return this.httpClient
      .get<HordeWorker>(`${this.baseUrl}/workers/${id}`, options)
      .pipe(catchError(() => of(null)));
  }

  /**
   * Get multiple workers by their IDs (includes inactive workers)
   * This is useful for fetching all workers belonging to a user
   */
  public getWorkersByIds(workerIds: string[]): Observable<HordeWorker[]> {
    if (!workerIds || workerIds.length === 0) {
      return of([]);
    }

    // Fetch each worker individually using forkJoin
    const workerRequests = workerIds.map((id) => this.getWorker(id));

    return forkJoin(workerRequests).pipe(
      map((workers) => workers.filter((w): w is HordeWorker => w !== null)),
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
      .pipe(catchError(() => of(null)));
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
}
