import { Injectable, inject } from '@angular/core';
import { catchError, Observable, of } from 'rxjs';
import { HordeApiCacheService, CacheTTL } from './horde-api-cache.service';
import { STATUS_API_BASE_URL } from './api-config';
import {
  PublicComponentsResponse,
  PublicHistoryResponse,
  PublicIncidentsResponse,
  PublicMaintenanceResponse,
} from '../types/status';

/**
 * Reads the public surface of the AI Horde status-page backend
 * (`ai-horde-service-alerts`). Every endpoint is unauthenticated and
 * structural-only; nothing here writes or touches the moderator API.
 *
 * Failures resolve to `null` rather than throwing so the page can fall back
 * to a graceful "status unavailable" state instead of erroring out.
 */
@Injectable({ providedIn: 'root' })
export class StatusService {
  private readonly cache = inject(HordeApiCacheService);
  private readonly baseUrl = inject(STATUS_API_BASE_URL);

  public getComponents(): Observable<PublicComponentsResponse | null> {
    return this.cache
      .cachedGet<PublicComponentsResponse>(
        `${this.baseUrl}/public/components`,
        undefined,
        { ttl: CacheTTL.SHORT, category: 'status' },
      )
      .pipe(catchError(() => of(null)));
  }

  public getIncidents(): Observable<PublicIncidentsResponse | null> {
    return this.cache
      .cachedGet<PublicIncidentsResponse>(
        `${this.baseUrl}/public/incidents`,
        undefined,
        { ttl: CacheTTL.SHORT, category: 'status' },
      )
      .pipe(catchError(() => of(null)));
  }

  public getMaintenance(): Observable<PublicMaintenanceResponse | null> {
    return this.cache
      .cachedGet<PublicMaintenanceResponse>(
        `${this.baseUrl}/public/maintenance`,
        undefined,
        { ttl: CacheTTL.SHORT, category: 'status' },
      )
      .pipe(catchError(() => of(null)));
  }

  /** Daily uptime buckets for a single component's history bars. */
  public getHistory(
    componentId: string,
    days = 90,
  ): Observable<PublicHistoryResponse | null> {
    const component = encodeURIComponent(componentId);
    return this.cache
      .cachedGet<PublicHistoryResponse>(
        `${this.baseUrl}/public/history?component=${component}&days=${days}`,
        undefined,
        { ttl: CacheTTL.MEDIUM, category: 'status' },
      )
      .pipe(catchError(() => of(null)));
  }
}
