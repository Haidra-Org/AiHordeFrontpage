import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { HordeStatusModes } from '../types/horde-status';
import { HordeApiCacheService, CacheTTL } from './horde-api-cache.service';

@Injectable({
  providedIn: 'root',
})
export class HordeStatusService {
  private readonly cache = inject(HordeApiCacheService);
  private readonly baseUrl = 'https://aihorde.net/api/v2';

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
