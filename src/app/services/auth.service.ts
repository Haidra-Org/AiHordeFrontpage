import { Injectable, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, of, catchError, map, tap, BehaviorSubject } from 'rxjs';
import { DatabaseService, StorageType } from './database.service';
import { AiHordeService } from './ai-horde.service';
import { HordeUser } from '../types/horde-user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly database = inject(DatabaseService);
  private readonly aiHorde = inject(AiHordeService);

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
}
