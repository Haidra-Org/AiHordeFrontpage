import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { AdminOperationsService } from './admin-operations.service';
import { AuthService } from './auth.service';
import { HordeApiCacheService } from './horde-api-cache.service';
import { API_BASE } from '../testing/api-test-helpers';

const BASE = API_BASE;

describe('AdminOperationsService', () => {
  let svc: AdminOperationsService;
  let http: HttpTestingController;
  let mockAuth: { getStoredApiKey: ReturnType<typeof vi.fn> };
  let mockCache: {
    cachedGet: ReturnType<typeof vi.fn>;
    invalidate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockAuth = { getStoredApiKey: vi.fn().mockReturnValue('mod-key') };
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

    svc = TestBed.inject(AdminOperationsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('getIPTimeouts', () => {
    it('delegates to cache with admin-ops category', () => {
      const timeouts = [{ ipaddr: '1.2.3.4', seconds: 3600 }];
      mockCache.cachedGet.mockReturnValue(of(timeouts));

      svc
        .getIPTimeouts()
        .subscribe((result) => expect(result).toEqual(timeouts));
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        `${BASE}/operations/ipaddr`,
        expect.anything(),
        expect.objectContaining({ category: 'admin-ops' }),
      );
    });
  });

  describe('getIPTimeout', () => {
    it('returns first item from array response', () => {
      const entry = { ipaddr: '10.0.0.1', seconds: 600 };
      mockCache.cachedGet.mockReturnValue(of([entry]));

      svc
        .getIPTimeout('10.0.0.1')
        .subscribe((result) => expect(result).toEqual(entry));
    });

    it('returns null for empty array', () => {
      mockCache.cachedGet.mockReturnValue(of([]));

      svc
        .getIPTimeout('10.0.0.1')
        .subscribe((result) => expect(result).toBeNull());
    });

    it('encodes special characters in IP/CIDR', () => {
      mockCache.cachedGet.mockReturnValue(of([]));

      svc.getIPTimeout('192.168.0.0/24').subscribe();
      expect(mockCache.cachedGet).toHaveBeenCalledWith(
        expect.stringContaining('192.168.0.0%2F24'),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('addIPTimeout', () => {
    it('posts to API and invalidates cache', () => {
      const data = { ipaddr: '1.2.3.4', hours: 24 };

      svc.addIPTimeout(data).subscribe((result) => {
        expect(result).toEqual({ message: 'OK' });
      });

      const req = http.expectOne(`${BASE}/operations/ipaddr`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('apikey')).toBe('mod-key');
      expect(req.request.body).toEqual(data);
      req.flush({ message: 'OK' });
      expect(mockCache.invalidate).toHaveBeenCalledWith({
        category: 'admin-ops',
      });
    });

    it('returns null when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);

      svc.addIPTimeout({ ipaddr: '1.2.3.4', hours: 1 }).subscribe((result) => {
        expect(result).toBeNull();
      });
    });
  });

  describe('removeIPTimeout', () => {
    it('sends DELETE with IP in body and returns true', () => {
      svc.removeIPTimeout('1.2.3.4').subscribe((result) => {
        expect(result).toBe(true);
      });

      const req = http.expectOne(`${BASE}/operations/ipaddr`);
      expect(req.request.method).toBe('DELETE');
      expect(req.request.body).toEqual({ ipaddr: '1.2.3.4' });
      req.flush({ message: 'OK' });
      expect(mockCache.invalidate).toHaveBeenCalled();
    });

    it('returns false when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);

      svc.removeIPTimeout('1.2.3.4').subscribe((result) => {
        expect(result).toBe(false);
      });
    });
  });

  describe('blockWorkerIP', () => {
    it('sends PUT with days and returns response', () => {
      svc.blockWorkerIP('worker-1', 7).subscribe((result) => {
        expect(result).toEqual({ message: 'OK' });
      });

      const req = http.expectOne(
        `${BASE}/operations/block_worker_ipaddr/worker-1`,
      );
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ days: 7 });
      req.flush({ message: 'OK' });
      expect(mockCache.invalidate).toHaveBeenCalled();
    });

    it('returns null when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);

      svc.blockWorkerIP('worker-1', 7).subscribe((result) => {
        expect(result).toBeNull();
      });
    });
  });

  describe('unblockWorkerIP', () => {
    it('sends DELETE and returns true', () => {
      svc.unblockWorkerIP('worker-1').subscribe((result) => {
        expect(result).toBe(true);
      });

      const req = http.expectOne(
        `${BASE}/operations/block_worker_ipaddr/worker-1`,
      );
      expect(req.request.method).toBe('DELETE');
      req.flush({ message: 'OK' });
      expect(mockCache.invalidate).toHaveBeenCalled();
    });

    it('returns false when no API key', () => {
      mockAuth.getStoredApiKey.mockReturnValue(null);

      svc.unblockWorkerIP('worker-1').subscribe((result) => {
        expect(result).toBe(false);
      });
    });
  });
});
