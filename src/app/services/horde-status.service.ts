import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { HordeStatusModes } from '../types/horde-status';

@Injectable({
  providedIn: 'root',
})
export class HordeStatusService {
  private readonly httpClient = inject(HttpClient);
  private readonly baseUrl = 'https://aihorde.net/api/v2';

  /**
   * Get current horde status modes (maintenance, invite only, raid)
   */
  public getStatusModes(): Observable<HordeStatusModes | null> {
    return this.httpClient
      .get<HordeStatusModes>(`${this.baseUrl}/status/modes`)
      .pipe(catchError(() => of(null)));
  }
}
