import { Injectable, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, catchError, map, tap, BehaviorSubject } from 'rxjs';
import { DatabaseService, StorageType } from './database.service';
import { AiHordeService } from './ai-horde.service';
import { HordeUser } from '../types/horde-user';

export interface DeleteUserResponse {
  deleted_id: string;
  deleted_name: string;
}

export interface DeleteUserError {
  message: string;
  rc?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly database = inject(DatabaseService);
  private readonly aiHorde = inject(AiHordeService);
  private readonly httpClient = inject(HttpClient);
  private readonly baseUrl = 'https://aihorde.net/api/v2';

  private readonly _currentUser = signal<HordeUser | null>(null);
  private readonly _isLoading = signal<boolean>(false);
  private readonly _isInitialized = signal<boolean>(false);

  public readonly currentUser = this._currentUser.asReadonly();
  public readonly isLoading = this._isLoading.asReadonly();
  public readonly isLoggedIn = computed(() => this._currentUser() !== null);
  public readonly isInitialized = this._isInitialized.asReadonly();

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
      this.aiHorde.getUserByApiKey(apiKey).subscribe({
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

  public login(
    apiKey: string,
    remember: boolean = false,
  ): Observable<HordeUser | null> {
    this._isLoading.set(true);

    return this.aiHorde.getUserByApiKey(apiKey).pipe(
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

    return this.aiHorde.getUserByApiKey(apiKey).pipe(
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

  public getStoredApiKey(): string | null {
    const remember = this.database.get('remember_api_key', true);
    return this.database.get<string | null>(
      'api_key',
      null,
      remember ? StorageType.Permanent : StorageType.Session,
    );
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
        catchError((err: HttpErrorResponse) => {
          const message =
            err.error?.message ??
            err.error?.detail ??
            'Failed to delete account';
          return of({
            success: false as const,
            error: { message, rc: err.error?.rc },
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
        catchError((err: HttpErrorResponse) => {
          const message =
            err.error?.message ??
            err.error?.detail ??
            'Failed to restore account';
          return of({ success: false, error: message });
        }),
      );
  }
}
