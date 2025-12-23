import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, map } from 'rxjs';
import { AuthService } from './auth.service';
import {
  IPTimeout,
  AddTimeoutIPInput,
  AddWorkerTimeout,
  SimpleResponse,
} from '../types/ip-operations';

/**
 * Service for managing IP operations (timeouts and blocks).
 * Provides methods for all /v2/operations/* endpoints.
 * Requires moderator permissions for all operations.
 */
@Injectable({
  providedIn: 'root',
})
export class AdminOperationsService {
  private readonly httpClient = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = 'https://aihorde.net/api/v2';

  /**
   * Get authorization headers for API requests.
   */
  private getHeaders(): Record<string, string> {
    const apiKey = this.auth.getStoredApiKey();
    return apiKey ? { apikey: apiKey } : {};
  }

  /**
   * Get all existing IP block timeouts.
   * GET /v2/operations/ipaddr
   *
   * @returns Observable of IP timeout array, or empty array on error
   */
  public getIPTimeouts(): Observable<IPTimeout[]> {
    return this.httpClient
      .get<IPTimeout[]>(`${this.baseUrl}/operations/ipaddr`, {
        headers: this.getHeaders(),
      })
      .pipe(catchError(() => of([])));
  }

  /**
   * Check if a specific IP or CIDR is in timeout.
   * GET /v2/operations/ipaddr/{ipaddr}
   *
   * @param ipaddr The IP address or CIDR to check
   * @returns Observable of IP timeout info, or null if not found/error
   */
  public getIPTimeout(ipaddr: string): Observable<IPTimeout | null> {
    const encodedIP = encodeURIComponent(ipaddr);
    return this.httpClient
      .get<IPTimeout[]>(`${this.baseUrl}/operations/ipaddr/${encodedIP}`, {
        headers: this.getHeaders(),
      })
      .pipe(
        map((result) => (result && result.length > 0 ? result[0] : null)),
        catchError(() => of(null)),
      );
  }

  /**
   * Add an IP or CIDR to timeout.
   * POST /v2/operations/ipaddr
   *
   * @param data The IP and duration to add
   * @returns Observable of SimpleResponse on success, or null on error
   */
  public addIPTimeout(
    data: AddTimeoutIPInput,
  ): Observable<SimpleResponse | null> {
    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) {
      return of(null);
    }

    return this.httpClient
      .post<SimpleResponse>(`${this.baseUrl}/operations/ipaddr`, data, {
        headers: { apikey: apiKey },
      })
      .pipe(catchError(() => of(null)));
  }

  /**
   * Remove an IP from timeout.
   * DELETE /v2/operations/ipaddr
   *
   * @param ipaddr The IP address or CIDR to remove
   * @returns Observable of true if successful, false on error
   */
  public removeIPTimeout(ipaddr: string): Observable<boolean> {
    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) {
      return of(false);
    }

    return this.httpClient
      .delete<SimpleResponse>(`${this.baseUrl}/operations/ipaddr`, {
        headers: { apikey: apiKey },
        body: { ipaddr },
      })
      .pipe(
        map(() => true),
        catchError(() => of(false)),
      );
  }

  /**
   * Block a worker's IP address for a specified number of days.
   * PUT /v2/operations/block_worker_ipaddr/{worker_id}
   *
   * @param workerId The UUID of the worker to block
   * @param days Duration of the block in days (1-30)
   * @returns Observable of SimpleResponse on success, or null on error
   */
  public blockWorkerIP(
    workerId: string,
    days: number,
  ): Observable<SimpleResponse | null> {
    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) {
      return of(null);
    }

    const data: AddWorkerTimeout = { days };
    return this.httpClient
      .put<SimpleResponse>(
        `${this.baseUrl}/operations/block_worker_ipaddr/${workerId}`,
        data,
        {
          headers: { apikey: apiKey },
        },
      )
      .pipe(catchError(() => of(null)));
  }

  /**
   * Remove an IP block for a worker.
   * DELETE /v2/operations/block_worker_ipaddr/{worker_id}
   *
   * @param workerId The UUID of the worker to unblock
   * @returns Observable of true if successful, false on error
   */
  public unblockWorkerIP(workerId: string): Observable<boolean> {
    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) {
      return of(false);
    }

    return this.httpClient
      .delete<SimpleResponse>(
        `${this.baseUrl}/operations/block_worker_ipaddr/${workerId}`,
        {
          headers: { apikey: apiKey },
        },
      )
      .pipe(
        map(() => true),
        catchError(() => of(false)),
      );
  }
}
