import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { vi } from 'vitest';
import { TeamService } from './team.service';
import { AuthService } from './auth.service';
import { HordeApiCacheService } from './horde-api-cache.service';
import { of, throwError } from 'rxjs';
import { ApiError } from '../types/api-error';
import type {
  Team,
  TeamModifyResponse,
  DeletedTeamResponse,
} from '../types/team';
import { API_BASE } from '../testing/api-test-helpers';

const BASE = `${API_BASE}/teams`;

describe('TeamService', () => {
  let svc: TeamService;
  let http: HttpTestingController;
  let mockAuth: { getStoredApiKey: ReturnType<typeof vi.fn> };
  let mockCache: {
    cachedGet: ReturnType<typeof vi.fn>;
    invalidate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockAuth = { getStoredApiKey: vi.fn().mockReturnValue('test-key') };
    mockCache = {
      cachedGet: vi.fn().mockReturnValue(of([])),
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

    svc = TestBed.inject(TeamService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('getTeams', () => {
    it('delegates to cache and returns teams', () => {
      const teams: Team[] = [{ id: 't1', name: 'Alpha' }];
      mockCache.cachedGet.mockReturnValue(of(teams));

      svc.getTeams().subscribe((result) => expect(result).toEqual(teams));
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        BASE,
        expect.anything(),
        expect.objectContaining({ category: 'teams' }),
      );
    });

    it('returns empty array on cache error', () => {
      mockCache.cachedGet.mockReturnValue(throwError(() => new Error('fail')));
      svc.getTeams().subscribe((result) => expect(result).toEqual([]));
    });
  });

  describe('getTeam', () => {
    it('fetches a specific team by id', () => {
      const team: Team = { id: 't1', name: 'Alpha' };
      mockCache.cachedGet.mockReturnValue(of(team));

      svc.getTeam('t1').subscribe((result) => expect(result).toEqual(team));
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        `${BASE}/t1`,
        expect.anything(),
        expect.anything(),
      );
    });

    it('returns null on error', () => {
      mockCache.cachedGet.mockReturnValue(throwError(() => new Error('fail')));
      svc.getTeam('t1').subscribe((result) => expect(result).toBeNull());
    });
  });

  describe('createTeam', () => {
    it('posts to API and invalidates cache', () => {
      const response: TeamModifyResponse = { id: 't2', name: 'Beta' };

      svc.createTeam({ name: 'Beta' }).subscribe((result) => {
        expect(result).toEqual(response);
      });

      const req = http.expectOne(BASE);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('apikey')).toBe('test-key');
      req.flush(response);
      expect(mockCache.invalidate).toHaveBeenCalledWith({ category: 'teams' });
    });

    it('throws ApiError when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);

      svc.createTeam({ name: 'X' }).subscribe({
        error: (err: unknown) => {
          expect(err).toBeInstanceOf(ApiError);
          expect((err as ApiError).status).toBe(401);
        },
      });
    });

    it('wraps HttpErrorResponse into ApiError', () => {
      svc.createTeam({ name: 'Fail' }).subscribe({
        error: (err: unknown) => expect(err).toBeInstanceOf(ApiError),
      });

      const req = http.expectOne(BASE);
      req.flush(
        { message: 'Forbidden', rc: 'ForbiddenErr' },
        { status: 403, statusText: 'Forbidden' },
      );
    });
  });

  describe('updateTeam', () => {
    it('patches team and invalidates cache', () => {
      svc.updateTeam('t1', { info: 'new info' }).subscribe();

      const req = http.expectOne(`${BASE}/t1`);
      expect(req.request.method).toBe('PATCH');
      req.flush({ id: 't1' });
      expect(mockCache.invalidate).toHaveBeenCalled();
    });

    it('throws ApiError when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);

      svc.updateTeam('t1', {}).subscribe({
        error: (err: unknown) => expect(err).toBeInstanceOf(ApiError),
      });
    });
  });

  describe('deleteTeam', () => {
    it('deletes team and invalidates cache', () => {
      const response: DeletedTeamResponse = { deleted_id: 't1' };

      svc.deleteTeam('t1').subscribe((result) => {
        expect(result).toEqual(response);
      });

      const req = http.expectOne(`${BASE}/t1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(response);
      expect(mockCache.invalidate).toHaveBeenCalled();
    });

    it('throws ApiError when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);

      svc.deleteTeam('t1').subscribe({
        error: (err: unknown) => {
          expect(err).toBeInstanceOf(ApiError);
          expect((err as ApiError).status).toBe(401);
        },
      });
    });
  });

  describe('handleError', () => {
    it('wraps non-HttpErrorResponse Error into ApiError', () => {
      let caught: unknown;
      svc.createTeam({ name: 'X' }).subscribe({
        error: (e: unknown) => (caught = e),
      });

      const req = http.expectOne(BASE);
      req.error(new ProgressEvent('error'));
      expect(caught).toBeInstanceOf(ApiError);
    });
  });
});
