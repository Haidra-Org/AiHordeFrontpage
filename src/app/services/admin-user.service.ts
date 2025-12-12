import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, map, forkJoin } from 'rxjs';
import {
  AdminUserDetails,
  PutUserRequest,
  UserListEntry,
} from '../types/horde-user-admin';
import { SharedKeyDetails } from '../types/shared-key';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class AdminUserService {
  private readonly httpClient = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = 'https://aihorde.net/api/v2';

  /**
   * Get user by ID with full admin details
   */
  public getUser(id: number): Observable<AdminUserDetails | null> {
    const apiKey = this.auth.getStoredApiKey();
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['apikey'] = apiKey;
    }

    return this.httpClient
      .get<AdminUserDetails>(`${this.baseUrl}/users/${id}`, { headers })
      .pipe(catchError(() => of(null)));
  }

  /**
   * Search users by username (partial match)
   * Note: The API doesn't have a search endpoint, so we fetch all users and filter client-side
   * In production, this should be cached and periodically refreshed
   */
  public searchUsers(query: string): Observable<UserListEntry[]> {
    // For now, we just search the current user if they match
    // A full implementation would require a cached user list
    const currentUser = this.auth.currentUser();
    if (
      currentUser &&
      currentUser.username.toLowerCase().includes(query.toLowerCase())
    ) {
      return of([{ id: currentUser.id, username: currentUser.username }]);
    }
    return of([]);
  }

  /**
   * Modify user properties (requires moderator permissions)
   */
  public updateUser(
    id: number,
    data: PutUserRequest,
  ): Observable<PutUserRequest | null> {
    const apiKey = this.auth.getStoredApiKey();
    if (!apiKey) {
      return of(null);
    }

    return this.httpClient
      .put<PutUserRequest>(`${this.baseUrl}/users/${id}`, data, {
        headers: { apikey: apiKey },
      })
      .pipe(catchError(() => of(null)));
  }

  /**
   * Toggle user trusted status
   */
  public setTrusted(
    id: number,
    trusted: boolean,
  ): Observable<PutUserRequest | null> {
    return this.updateUser(id, { trusted });
  }

  /**
   * Toggle user flagged status
   */
  public setFlagged(
    id: number,
    flagged: boolean,
  ): Observable<PutUserRequest | null> {
    return this.updateUser(id, { flagged });
  }

  /**
   * Reset user's suspicion counter
   */
  public resetSuspicion(id: number): Observable<PutUserRequest | null> {
    return this.updateUser(id, { reset_suspicion: true });
  }

  /**
   * Set user VPN access
   */
  public setVpnAccess(
    id: number,
    vpn: boolean,
  ): Observable<PutUserRequest | null> {
    return this.updateUser(id, { vpn });
  }

  /**
   * Set worker invites count
   */
  public setWorkerInvites(
    id: number,
    count: number,
  ): Observable<PutUserRequest | null> {
    return this.updateUser(id, { worker_invite: count });
  }

  /**
   * Get shared key details by ID
   */
  public getSharedKey(
    sharedKeyId: string,
  ): Observable<SharedKeyDetails | null> {
    return this.httpClient
      .get<SharedKeyDetails>(`${this.baseUrl}/sharedkeys/${sharedKeyId}`)
      .pipe(catchError(() => of(null)));
  }

  /**
   * Get multiple shared keys by their IDs
   */
  public getSharedKeysByIds(
    sharedKeyIds: string[],
  ): Observable<SharedKeyDetails[]> {
    if (sharedKeyIds.length === 0) {
      return of([]);
    }

    const requests = sharedKeyIds.map((id) =>
      this.getSharedKey(id).pipe(catchError(() => of(null))),
    );

    return forkJoin(requests).pipe(
      map((results) =>
        results.filter((key): key is SharedKeyDetails => key !== null),
      ),
    );
  }
}
