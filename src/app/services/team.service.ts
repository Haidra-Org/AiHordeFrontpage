import { Injectable, inject } from '@angular/core';
import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';
import {
  Team,
  TeamApiError,
  TeamModifyResponse,
  CreateTeamRequest,
  UpdateTeamRequest,
  DeletedTeamResponse,
} from '../types/team';
import { AuthService } from './auth.service';
import { HordeApiCacheService, CacheTTL } from './horde-api-cache.service';
import { CLIENT_AGENT } from './interceptors/client-agent.interceptor';

@Injectable({
  providedIn: 'root',
})
export class TeamService {
  private readonly httpClient = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly cache = inject(HordeApiCacheService);
  private readonly baseUrl = 'https://aihorde.net/api/v2/teams';

  private readonly teamContext = new HttpContext().set(
    CLIENT_AGENT,
    'AiHordeFrontpage:teams',
  );

  private ensureApiKey(): string | null {
    return this.auth.getStoredApiKey();
  }

  private handleError = (error: HttpErrorResponse) => {
    const apiError: TeamApiError = {
      status: error.status ?? 0,
      message:
        error.error?.message ?? 'Unexpected error while contacting the API.',
      rc: error.error?.rc,
    };
    return throwError(() => apiError);
  };

  /**
   * Get all teams (lightweight list)
   */
  public getTeams(): Observable<Team[]> {
    return this.cache
      .cachedGet<
        Team[]
      >(this.baseUrl, { context: this.teamContext }, { ttl: CacheTTL.LONG, category: 'teams' })
      .pipe(catchError(() => of([])));
  }

  /**
   * Get a specific team by ID
   */
  public getTeam(teamId: string): Observable<Team | null> {
    return this.cache
      .cachedGet<Team>(
        `${this.baseUrl}/${teamId}`,
        { context: this.teamContext },
        { ttl: CacheTTL.LONG, category: 'teams' },
      )
      .pipe(catchError(() => of(null)));
  }

  /**
   * Create a new team (requires trusted user)
   */
  public createTeam(
    payload: CreateTeamRequest,
  ): Observable<TeamModifyResponse> {
    const apiKey = this.ensureApiKey();
    if (!apiKey) {
      return throwError(
        () =>
          ({
            status: 401,
            message: 'Missing API key. Please log in again to manage teams.',
          }) satisfies TeamApiError,
      );
    }

    return this.httpClient
      .post<TeamModifyResponse>(this.baseUrl, payload, {
        headers: { apikey: apiKey },
        context: this.teamContext,
      })
      .pipe(
        tap(() => this.cache.invalidate({ category: 'teams' })),
        catchError(this.handleError),
      );
  }

  /**
   * Update an existing team (requires team creator or moderator)
   */
  public updateTeam(
    teamId: string,
    payload: UpdateTeamRequest,
  ): Observable<TeamModifyResponse> {
    const apiKey = this.ensureApiKey();
    if (!apiKey) {
      return throwError(
        () =>
          ({
            status: 401,
            message: 'Missing API key. Please log in again to manage teams.',
          }) satisfies TeamApiError,
      );
    }

    return this.httpClient
      .patch<TeamModifyResponse>(`${this.baseUrl}/${teamId}`, payload, {
        headers: { apikey: apiKey },
        context: this.teamContext,
      })
      .pipe(
        tap(() => this.cache.invalidate({ category: 'teams' })),
        catchError(this.handleError),
      );
  }

  /**
   * Delete a team (requires team creator or moderator)
   */
  public deleteTeam(teamId: string): Observable<DeletedTeamResponse> {
    const apiKey = this.ensureApiKey();
    if (!apiKey) {
      return throwError(
        () =>
          ({
            status: 401,
            message: 'Missing API key. Please log in again to manage teams.',
          }) satisfies TeamApiError,
      );
    }

    return this.httpClient
      .delete<DeletedTeamResponse>(`${this.baseUrl}/${teamId}`, {
        headers: { apikey: apiKey },
        context: this.teamContext,
      })
      .pipe(
        tap(() => this.cache.invalidate({ category: 'teams' })),
        catchError(this.handleError),
      );
  }
}
