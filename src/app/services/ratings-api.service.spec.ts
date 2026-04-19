import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { vi } from 'vitest';
import { RatingsApiService } from './ratings-api.service';
import { AuthService } from './auth.service';
import { RATINGS_API_BASE } from '../testing/api-test-helpers';

const RATINGS_API = RATINGS_API_BASE;
const ANON_KEY = '0000000000';

describe('RatingsApiService', () => {
  let svc: RatingsApiService;
  let http: HttpTestingController;
  let mockAuth: { getStoredApiKey: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockAuth = { getStoredApiKey: vi.fn().mockReturnValue(null) };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuth },
      ],
    });

    svc = TestBed.inject(RatingsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('getNewImage', () => {
    it('uses anonymous key when user is not logged in', () => {
      svc.getNewImage().subscribe();

      const req = http.expectOne(`${RATINGS_API}/rating/new`);
      expect(req.request.headers.get('apikey')).toBe(ANON_KEY);
      req.flush({ id: 'img-1', url: 'https://example.com/img.png' });
    });

    it('uses stored key when user is logged in', () => {
      mockAuth.getStoredApiKey.mockReturnValue('user-key');

      svc.getNewImage().subscribe();

      const req = http.expectOne(`${RATINGS_API}/rating/new`);
      expect(req.request.headers.get('apikey')).toBe('user-key');
      req.flush({ id: 'img-1', url: 'https://example.com/img.png' });
    });
  });

  describe('submitRating', () => {
    it('posts rating with correct body and encodes image id', () => {
      svc.submitRating('img/special', 8, 2).subscribe();

      const req = http.expectOne(`${RATINGS_API}/rating/img%2Fspecial`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ rating: 8, artifacts: 2 });
      req.flush({ reward: 5 });
    });
  });
});
