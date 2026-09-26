import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, catchError, map, tap, switchMap } from 'rxjs';
import { extractApiErrorField } from '../helper/extract-api-error';
import { DatabaseService, StorageType } from './database.service';
import { AiHordeService } from './ai-horde.service';
import { ActiveGenerations, HordeUser } from '../types/horde-user';
import { PutUserRequest } from '../types/horde-user-admin';
import { API_BASE_URL } from './api-config';
export interface DeleteUserResponse {
  deleted_id: string;
  deleted_name: string;
}

export interface DeleteUserError {
  message: string;
  rc?: string;
}

/** Why a read of the account record came back without one. */
export type UserReadError = 'rate_limited' | 'unauthorized' | 'network';

/** The account record, or the reason the horde did not give it. */
export type UserRead = { user: HordeUser } | { error: UserReadError };

function classifyReadError(error: unknown): UserReadError {
  if (!(error instanceof HttpErrorResponse)) {
    return 'network';
  }
  if (error.status === 429) {
    return 'rate_limited';
  }
  // The horde answers an unknown or revoked key on find_user with one of these.
  if (error.status === 401 || error.status === 403 || error.status === 404) {
    return 'unauthorized';
  }
  return 'network';
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly database = inject(DatabaseService);
  private readonly aiHorde = inject(AiHordeService);
  private readonly httpClient = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  private readonly _currentUser = signal<HordeUser | null>(null);
  private readonly _isLoading = signal<boolean>(false);
  private readonly _isInitialized = signal<boolean>(false);

  public readonly currentUser = this._currentUser.asReadonly();
  public readonly isLoading = this._isLoading.asReadonly();
  public readonly isLoggedIn = computed(() => this._currentUser() !== null);
  public readonly isInitialized = this._isInitialized.asReadonly();

  /**
   * The current user's kudos balance, or null when logged out. Derived from the
   * stored user object (populated by `find_user`, cached by `AiHordeService`);
   * `refreshUser()` re-fetches it. Exposed as a computed for header consumers.
   */
  public readonly kudos = computed(() => this._currentUser()?.kudos ?? null);

  constructor() {
    this.initializeFromStorage();
  }

  private initializeFromStorage(): void {
    const remember = this.database.get('remember_api_key', true);
    const apiKey = this.database.get<string | null>(
      'api_key',
      null,
      remember ? StorageType.Permanent : StorageType.Session,
    );

    if (apiKey) {
      this._isLoading.set(true);
      this.fetchAndEnrichUser(apiKey).subscribe({
        next: (user) => {
          this._currentUser.set(user);
          this._isLoading.set(false);
          this._isInitialized.set(true);
        },
        error: () => {
          this._isLoading.set(false);
          this._isInitialized.set(true);
        },
      });
    } else {
      this._isInitialized.set(true);
    }
  }

  public login(apiKey: string, remember = false): Observable<HordeUser | null> {
    this._isLoading.set(true);

    return this.fetchAndEnrichUser(apiKey).pipe(
      tap((user) => {
        if (user) {
          this.database.store('remember_api_key', remember);
          this.database.store(
            'api_key',
            apiKey,
            remember ? StorageType.Permanent : StorageType.Session,
          );
          this._currentUser.set(user);
        }
        this._isLoading.set(false);
      }),
      catchError(() => {
        this._isLoading.set(false);
        return of(null);
      }),
    );
  }

  public logout(): void {
    this._currentUser.set(null);
    this.database.store('api_key', '', StorageType.Permanent);
    this.database.store('api_key', '', StorageType.Session);
  }

  public refreshUser(): Observable<HordeUser | null> {
    const remember = this.database.get('remember_api_key', true);
    const apiKey = this.database.get<string | null>(
      'api_key',
      null,
      remember ? StorageType.Permanent : StorageType.Session,
    );

    if (!apiKey) {
      return of(null);
    }

    this._isLoading.set(true);

    return this.fetchAndEnrichUser(apiKey).pipe(
      tap((user) => {
        this._currentUser.set(user);
        this._isLoading.set(false);
      }),
      catchError(() => {
        this._isLoading.set(false);
        return of(null);
      }),
    );
  }

  /**
   * Re-read the stored key's account record and say why when there is none.
   * `refreshUser()` folds every failure into `null`, which cannot tell a rate
   * limit from a revoked key; a caller that reads on a timer needs the
   * difference to decide whether to wait or stop. A failed read leaves the
   * current user in place.
   */
  public readUser(): Observable<UserRead> {
    const apiKey = this.getStoredApiKey();
    if (!apiKey) {
      return of({ error: 'unauthorized' });
    }
    return this.aiHorde.readUserByApiKey(apiKey).pipe(
      switchMap((user) => (user ? this.enrichUser(user) : of(null))),
      map((user): UserRead => {
        if (!user) {
          return { error: 'unauthorized' };
        }
        this._currentUser.set(user);
        return { user };
      }),
      catchError((error: unknown) =>
        of<UserRead>({ error: classifyReadError(error) }),
      ),
    );
  }

  public getStoredApiKey(): string | null {
    const remember = this.database.get('remember_api_key', true);
    return this.database.get<string | null>(
      'api_key',
      null,
      remember ? StorageType.Permanent : StorageType.Session,
    );
  }

  public updateCurrentUserActiveGenerations(
    activeGenerations: ActiveGenerations | undefined,
  ): void {
    const user = this._currentUser();
    if (!user) {
      return;
    }

    this._currentUser.set({
      ...user,
      active_generations: activeGenerations,
    });
  }

  private fetchAndEnrichUser(apiKey: string): Observable<HordeUser | null> {
    return this.aiHorde
      .getUserByApiKey(apiKey)
      .pipe(switchMap((user) => (user ? this.enrichUser(user) : of(user))));
  }

  private enrichUser(user: HordeUser): Observable<HordeUser> {
    if (!user.worker_count) {
      user.public_workers = false;
      return of(user);
    }
    return this.aiHorde
      .inferPublicWorkers(user.id)
      .pipe(map((isPublic) => ({ ...user, public_workers: isPublic })));
  }

  /**
   * Delete the current user's account.
   * First delete marks for deletion (30-day grace period).
   * If already marked for deletion and 30 days passed, permanently deletes.
   * @returns Observable with success response or error details
   */
  public deleteUser(): Observable<
    | { success: true; data: DeleteUserResponse }
    | { success: false; error: DeleteUserError }
  > {
    const apiKey = this.getStoredApiKey();
    const user = this._currentUser();
    if (!apiKey || !user) {
      return of({ success: false, error: { message: 'Not logged in' } });
    }

    return this.httpClient
      .delete<DeleteUserResponse>(`${this.baseUrl}/users/${user.id}`, {
        headers: { apikey: apiKey },
      })
      .pipe(
        map((data) => ({ success: true as const, data })),
        catchError((err: unknown) => {
          const message =
            extractApiErrorField(err, 'message') ??
            extractApiErrorField(err, 'detail') ??
            'Failed to delete account';
          return of({
            success: false as const,
            error: { message, rc: extractApiErrorField(err, 'rc') },
          });
        }),
      );
  }

  /**
   * Undelete the current user's account (cancel pending deletion).
   * @returns Observable with success or error
   */
  public undeleteUser(): Observable<{ success: boolean; error?: string }> {
    const apiKey = this.getStoredApiKey();
    const user = this._currentUser();
    if (!apiKey || !user) {
      return of({ success: false, error: 'Not logged in' });
    }

    return this.httpClient
      .put<unknown>(
        `${this.baseUrl}/users/${user.id}`,
        { undelete: true },
        { headers: { apikey: apiKey } },
      )
      .pipe(
        map(() => ({ success: true })),
        catchError((err: unknown) => {
          const message =
            extractApiErrorField(err, 'message') ??
            extractApiErrorField(err, 'detail') ??
            'Failed to restore account';
          return of({ success: false, error: message });
        }),
      );
  }

  /**
   * Update the current user's profile fields.
   * Uses PUT /users/{id} with the user's own API key.
   * Refreshes user data on success so signals stay in sync.
   */
  public updateProfile(
    data: Partial<
      Pick<PutUserRequest, 'username' | 'contact' | 'public_workers'>
    >,
  ): Observable<{ success: boolean; error?: string }> {
    const apiKey = this.getStoredApiKey();
    const user = this._currentUser();
    if (!apiKey || !user) {
      return of({ success: false, error: 'Not logged in' });
    }

    return this.httpClient
      .put<unknown>(`${this.baseUrl}/users/${user.id}`, data, {
        headers: { apikey: apiKey },
      })
      .pipe(
        switchMap(() => this.refreshUser()),
        map(() => ({ success: true })),
        catchError((err: unknown) => {
          const message =
            extractApiErrorField(err, 'message') ??
            extractApiErrorField(err, 'detail') ??
            'Failed to update profile';
          return of({ success: false, error: message });
        }),
      );
  }
}
