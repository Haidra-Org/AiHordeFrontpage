import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { HordeHeartbeat, HordeStatusModes } from '../types/horde-status';
import { HordeApiCacheService, CacheTTL } from './horde-api-cache.service';
import { API_BASE_URL } from './api-config';

@Injectable({
  providedIn: 'root',
})
export class HordeStatusService {
  private readonly cache = inject(HordeApiCacheService);
  private readonly baseUrl = inject(API_BASE_URL);

  /**
   * The heartbeat read, shared by every caller. A successful read is kept for
   * the life of the page; a failed one is dropped, so the next call asks again.
   */
  private heartbeat$: Observable<boolean> | null = null;

  private readonly _reachable = signal(false);

  /**
   * Whether the heartbeat has answered in this page load. The heartbeat is
   * unkeyed and on every horde, so its answer is proof that the horde can be
   * reached, and a keyed request that fails before reaching it is refused by
   * the horde itself (see `AdminModerationService`).
   */
  public readonly reachable = this._reachable.asReadonly();

  /**
   * Get current horde status modes (maintenance, invite only, raid)
   */
  public getStatusModes(): Observable<HordeStatusModes | null> {
    return this.cache
      .cachedGet<HordeStatusModes>(
        `${this.baseUrl}/status/modes`,
        {},
        { ttl: CacheTTL.LONG, category: 'status' },
      )
      .pipe(catchError(() => of(null)));
  }

  /**
   * Whether the horde answers its heartbeat. True for the rest of the page
   * load once it has; false when this read failed, and the next call reads
   * again.
   */
  public checkReachable(): Observable<boolean> {
    this.heartbeat$ ??= this.cache
      .cachedGet<HordeHeartbeat>(
        `${this.baseUrl}/status/heartbeat`,
        {},
        { ttl: CacheTTL.NEVER },
      )
      .pipe(
        map(() => true),
        tap(() => this._reachable.set(true)),
        catchError(() => {
          this.heartbeat$ = null;
          return of(false);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.heartbeat$;
  }
}
