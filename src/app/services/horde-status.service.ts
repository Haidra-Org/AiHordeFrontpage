import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { HordeStatusModes } from '../types/horde-status';
import { HordeApiCacheService, CacheTTL } from './horde-api-cache.service';
import { API_BASE_URL } from './api-config';

@Injectable({
  providedIn: 'root',
})
export class HordeStatusService {
  private readonly cache = inject(HordeApiCacheService);
  private readonly baseUrl = inject(API_BASE_URL);

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
}
