import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { AiHordeService } from './ai-horde.service';
import { DatabaseService, StorageType } from './database.service';
import { HordeUser } from '../types/horde-user';
import { API_BASE } from '../testing/api-test-helpers';

function fakeUser(overrides: Partial<HordeUser> = {}): HordeUser {
  return {
    username: 'testuser',
    id: 42,
    kudos: 1000,
    trusted: true,
    ...overrides,
  } as HordeUser;
}

describe('AuthService', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;
  let mockDb: {
    store: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let mockHorde: {
    getUserByApiKey: ReturnType<typeof vi.fn>;
    inferPublicWorkers: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockDb = {
      store: vi.fn(),
      get: vi.fn().mockReturnValue(null),
    };

    mockHorde = {
      getUserByApiKey: vi.fn().mockReturnValue(of(null)),
      inferPublicWorkers: vi.fn().mockReturnValue(of(true)),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DatabaseService, useValue: mockDb },
        { provide: AiHordeService, useValue: mockHorde },
      ],
    });

    service = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  // ===========================================================================
  // Initialisation
  // ===========================================================================

  it('is initialized immediately when no stored API key exists', () => {
    expect(service.isInitialized()).toBe(true);
    expect(service.isLoggedIn()).toBe(false);
    expect(service.currentUser()).toBeNull();
  });

  // ===========================================================================
  // login()
  // ===========================================================================

  describe('login()', () => {
    it('fetches user and stores API key on success', () => {
      const user = fakeUser();
      mockHorde.getUserByApiKey.mockReturnValue(of(user));

      let result: HordeUser | null = null;
      service.login('test-key', true).subscribe((u) => (result = u));

      expect(result).toBeTruthy();
      expect(result!.username).toBe('testuser');
      expect(service.currentUser()).toEqual(
        expect.objectContaining({
          username: 'testuser',
          public_workers: false,
        }),
      );
      expect(service.isLoggedIn()).toBe(true);
      expect(mockDb.store).toHaveBeenCalledWith('remember_api_key', true);
      expect(mockDb.store).toHaveBeenCalledWith(
        'api_key',
        'test-key',
        StorageType.Permanent,
      );
    });

    it('stores key in session storage when remember=false', () => {
      mockHorde.getUserByApiKey.mockReturnValue(of(fakeUser()));

      service.login('key', false).subscribe();

      expect(mockDb.store).toHaveBeenCalledWith(
        'api_key',
        'key',
        StorageType.Session,
      );
    });

    it('returns null and does not store on API failure', () => {
      mockHorde.getUserByApiKey.mockReturnValue(
        throwError(() => new Error('network')),
      );

      let result: HordeUser | null = undefined as unknown as HordeUser | null;
      service.login('bad-key').subscribe((u) => (result = u));

      expect(result).toBeNull();
      expect(service.isLoggedIn()).toBe(false);
      expect(service.isLoading()).toBe(false);
    });

    it('infers public_workers for users with workers', () => {
      const user = fakeUser({ worker_count: 3, id: 99 });
      mockHorde.getUserByApiKey.mockReturnValue(of(user));
      mockHorde.inferPublicWorkers.mockReturnValue(of(true));

      service.login('key').subscribe();

      expect(mockHorde.inferPublicWorkers).toHaveBeenCalledWith(99);
      expect(service.currentUser()?.public_workers).toBe(true);
    });
  });

  // ===========================================================================
  // logout()
  // ===========================================================================

  describe('logout()', () => {
    it('clears user state and wipes stored keys', () => {
      mockHorde.getUserByApiKey.mockReturnValue(of(fakeUser()));
      service.login('key').subscribe();

      service.logout();

      expect(service.currentUser()).toBeNull();
      expect(service.isLoggedIn()).toBe(false);
      expect(mockDb.store).toHaveBeenCalledWith(
        'api_key',
        '',
        StorageType.Permanent,
      );
      expect(mockDb.store).toHaveBeenCalledWith(
        'api_key',
        '',
        StorageType.Session,
      );
    });
  });

  // ===========================================================================
  // refreshUser()
  // ===========================================================================

  describe('refreshUser()', () => {
    it('returns null when no API key is stored', () => {
      let result: HordeUser | null = undefined as unknown as HordeUser | null;
      service.refreshUser().subscribe((u) => (result = u));
      expect(result).toBeNull();
    });

    it('re-fetches user data from the API', () => {
      // Simulate stored key
      mockDb.get = vi.fn((key: string, ..._args: unknown[]) => {
        if (key === 'remember_api_key') return true;
        if (key === 'api_key') return 'stored-key';
        return null;
      }) as typeof mockDb.get;

      const updatedUser = fakeUser({ kudos: 9999 });
      mockHorde.getUserByApiKey.mockReturnValue(of(updatedUser));

      let result: HordeUser | null = null;
      service.refreshUser().subscribe((u) => (result = u));

      expect(result).not.toBeNull();
      expect(result!.kudos).toBe(9999);
    });
  });

  // ===========================================================================
  // getStoredApiKey()
  // ===========================================================================

  describe('getStoredApiKey()', () => {
    it('reads the key from the correct storage type based on remember flag', () => {
      mockDb.get = vi.fn((key: string, ..._args: unknown[]) => {
        if (key === 'remember_api_key') return false;
        if (key === 'api_key') return 'session-key';
        return null;
      }) as typeof mockDb.get;

      expect(service.getStoredApiKey()).toBe('session-key');
    });
  });

  // ===========================================================================
  // updateCurrentUserActiveGenerations()
  // ===========================================================================

  describe('updateCurrentUserActiveGenerations()', () => {
    it('merges active generations into the current user', () => {
      mockHorde.getUserByApiKey.mockReturnValue(of(fakeUser()));
      service.login('key').subscribe();

      service.updateCurrentUserActiveGenerations({
        image: ['gen-1'],
        text: [],
      });

      expect(service.currentUser()?.active_generations).toEqual({
        image: ['gen-1'],
        text: [],
      });
    });

    it('is a no-op when no user is logged in', () => {
      service.updateCurrentUserActiveGenerations({ image: ['gen-1'] });
      expect(service.currentUser()).toBeNull();
    });
  });

  // ===========================================================================
  // deleteUser()
  // ===========================================================================

  describe('deleteUser()', () => {
    it('returns error when not logged in', () => {
      let result: unknown;
      service.deleteUser().subscribe((r) => (result = r));
      expect(result).toEqual({
        success: false,
        error: { message: 'Not logged in' },
      });
    });

    it('sends DELETE request and returns success', () => {
      mockHorde.getUserByApiKey.mockReturnValue(of(fakeUser({ id: 42 })));
      mockDb.get = vi.fn((key: string) => {
        if (key === 'remember_api_key') return true;
        if (key === 'api_key') return 'my-key';
        return null;
      }) as typeof mockDb.get;

      service.login('my-key').subscribe();

      let result: unknown;
      service.deleteUser().subscribe((r) => (result = r));

      const req = httpTesting.expectOne(`${API_BASE}/users/42`);
      expect(req.request.method).toBe('DELETE');
      expect(req.request.headers.get('apikey')).toBe('my-key');
      req.flush({ deleted_id: '42', deleted_name: 'testuser' });

      expect(result).toEqual({
        success: true,
        data: { deleted_id: '42', deleted_name: 'testuser' },
      });
    });
  });

  // ===========================================================================
  // undeleteUser()
  // ===========================================================================

  describe('undeleteUser()', () => {
    it('returns error when not logged in', () => {
      let result: unknown;
      service.undeleteUser().subscribe((r) => (result = r));
      expect(result).toEqual({ success: false, error: 'Not logged in' });
    });

    it('sends PUT with undelete=true and returns success', () => {
      mockHorde.getUserByApiKey.mockReturnValue(of(fakeUser({ id: 42 })));
      mockDb.get = vi.fn((key: string) => {
        if (key === 'remember_api_key') return true;
        if (key === 'api_key') return 'my-key';
        return null;
      }) as typeof mockDb.get;

      service.login('my-key').subscribe();

      let result: unknown;
      service.undeleteUser().subscribe((r) => (result = r));

      const req = httpTesting.expectOne(`${API_BASE}/users/42`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ undelete: true });
      req.flush({});

      expect(result).toEqual({ success: true });
    });
  });

  // ===========================================================================
  // updateProfile()
  // ===========================================================================

  describe('updateProfile()', () => {
    it('returns error when not logged in', () => {
      let result: unknown;
      service
        .updateProfile({ username: 'newname' })
        .subscribe((r) => (result = r));
      expect(result).toEqual({ success: false, error: 'Not logged in' });
    });
  });
});
