import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { AdminUserService } from './admin-user.service';
import { AuthService } from './auth.service';
import { HordeApiCacheService } from './horde-api-cache.service';
import { API_BASE } from '../testing/api-test-helpers';

describe('AdminUserService', () => {
  let service: AdminUserService;
  let httpTesting: HttpTestingController;
  let mockAuth: {
    getStoredApiKey: ReturnType<typeof vi.fn>;
    currentUser: ReturnType<typeof signal>;
  };
  let mockCache: {
    cachedGet: ReturnType<typeof vi.fn>;
    invalidate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockAuth = {
      getStoredApiKey: vi.fn().mockReturnValue('admin-key'),
      currentUser: signal({ id: 1, username: 'admin' }),
    };
    mockCache = {
      cachedGet: vi.fn().mockReturnValue(of(null)),
      invalidate: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuth },
        { provide: HordeApiCacheService, useValue: mockCache },
      ],
    });

    service = TestBed.inject(AdminUserService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  // ===========================================================================
  // getUser
  // ===========================================================================

  describe('getUser()', () => {
    it('fetches user via cache with apikey header', () => {
      const user = { id: 42, username: 'bob' };
      mockCache.cachedGet.mockReturnValue(of(user));

      let result: unknown;
      service.getUser(42).subscribe((r) => (result = r));

      expect(result).toEqual(user);
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.stringContaining('/users/42'),
        expect.objectContaining({ headers: { apikey: 'admin-key' } }),
        expect.objectContaining({ category: 'admin-users' }),
      );
    });

    it('omits apikey header when no key is stored', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);
      mockCache.cachedGet.mockReturnValue(of(null));

      service.getUser(1).subscribe();

      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ headers: {} }),
        expect.anything(),
      );
    });
  });

  // ===========================================================================
  // searchUsers
  // ===========================================================================

  describe('searchUsers()', () => {
    it('returns current user when their name matches', () => {
      let result: unknown[] = [];
      service.searchUsers('adm').subscribe((r) => (result = r));
      expect(result).toEqual([{ id: 1, username: 'admin' }]);
    });

    it('returns empty array when no match', () => {
      let result: unknown[] = [];
      service.searchUsers('zzz').subscribe((r) => (result = r));
      expect(result).toEqual([]);
    });

    it('performs case-insensitive search', () => {
      let result: unknown[] = [];
      service.searchUsers('ADMIN').subscribe((r) => (result = r));
      expect(result).toHaveLength(1);
    });
  });

  // ===========================================================================
  // updateUser
  // ===========================================================================

  describe('updateUser()', () => {
    it('sends PUT with apikey and invalidates cache', () => {
      service.updateUser(42, { trusted: true }).subscribe();

      const req = httpTesting.expectOne(`${API_BASE}/users/42`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.headers.get('apikey')).toBe('admin-key');
      expect(req.request.body).toEqual({ trusted: true });
      req.flush({ trusted: true });

      expect(mockCache.invalidate).toHaveBeenCalledWith({
        category: 'admin-users',
      });
    });

    it('returns null when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);
      let result: unknown = 'not-null';
      service.updateUser(42, {}).subscribe((r) => (result = r));
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // Convenience methods delegate to updateUser
  // ===========================================================================

  it('setTrusted sends { trusted } payload', () => {
    service.setTrusted(42, true).subscribe();
    const req = httpTesting.expectOne(`${API_BASE}/users/42`);
    expect(req.request.body).toEqual({ trusted: true });
    req.flush({});
  });

  it('setFlagged sends { flagged } payload', () => {
    service.setFlagged(42, false).subscribe();
    const req = httpTesting.expectOne(`${API_BASE}/users/42`);
    expect(req.request.body).toEqual({ flagged: false });
    req.flush({});
  });

  it('resetSuspicion sends { reset_suspicion: true }', () => {
    service.resetSuspicion(42).subscribe();
    const req = httpTesting.expectOne(`${API_BASE}/users/42`);
    expect(req.request.body).toEqual({ reset_suspicion: true });
    req.flush({});
  });

  it('setVpnAccess sends { vpn } payload', () => {
    service.setVpnAccess(42, true).subscribe();
    const req = httpTesting.expectOne(`${API_BASE}/users/42`);
    expect(req.request.body).toEqual({ vpn: true });
    req.flush({});
  });

  it('setWorkerInvites sends { worker_invite } payload', () => {
    service.setWorkerInvites(42, 5).subscribe();
    const req = httpTesting.expectOne(`${API_BASE}/users/42`);
    expect(req.request.body).toEqual({ worker_invite: 5 });
    req.flush({});
  });

  // ===========================================================================
  // Shared keys
  // ===========================================================================

  describe('getSharedKey()', () => {
    it('fetches via cache', () => {
      mockCache.cachedGet.mockReturnValue(of({ id: 'sk1' }));
      let result: unknown;
      service.getSharedKey('sk1').subscribe((r) => (result = r));
      expect(result).toEqual({ id: 'sk1' });
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.stringContaining('/sharedkeys/sk1'),
        expect.anything(),
        expect.objectContaining({ category: 'admin-sharedkeys' }),
      );
    });
  });

  describe('getSharedKeysByIds()', () => {
    it('returns empty array for empty input', () => {
      let result: unknown[] = [];
      service.getSharedKeysByIds([]).subscribe((r) => (result = r));
      expect(result).toEqual([]);
    });

    it('fetches multiple keys and filters out nulls', () => {
      mockCache.cachedGet
        .mockReturnValueOnce(of({ id: 'a' }))
        .mockReturnValueOnce(of(null))
        .mockReturnValueOnce(of({ id: 'c' }));

      let result: unknown[] = [];
      service
        .getSharedKeysByIds(['a', 'b', 'c'])
        .subscribe((r) => (result = r));
      expect(result).toEqual([{ id: 'a' }, { id: 'c' }]);
    });
  });
});
