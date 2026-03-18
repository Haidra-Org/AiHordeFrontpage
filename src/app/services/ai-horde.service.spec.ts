import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AiHordeService } from './ai-horde.service';
import {
  GENERATION_NOT_FOUND,
  ImageGenerationRequest,
} from '../types/generation';
import { clientAgentInterceptor } from './interceptors/client-agent.interceptor';

describe('AiHordeService', () => {
  let service: AiHordeService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([clientAgentInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AiHordeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  // -----------------------------------------------------------------------
  // submitImageGeneration
  // -----------------------------------------------------------------------
  describe('submitImageGeneration', () => {
    const apiKey = 'test-api-key';
    const request: ImageGenerationRequest = {
      prompt: 'a cat',
      params: { steps: 25 },
      nsfw: false,
      censor_nsfw: true,
      models: ['stable_diffusion'],
      r2: true,
    };

    it('should POST to the async endpoint with correct headers', () => {
      service.submitImageGeneration(apiKey, request).subscribe();

      const req = http.expectOne('https://aihorde.net/api/v2/generate/async');
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('apikey')).toBe(apiKey);
      expect(req.request.headers.get('Client-Agent')).toBe(
        'AiHordeFrontpage:generate',
      );
      expect(req.request.body).toEqual(request);
      req.flush({ id: 'gen-abc', kudos: 10 });
    });

    it('should return the response on success', (done: DoneFn) => {
      service.submitImageGeneration(apiKey, request).subscribe((res) => {
        expect(res).toEqual({ id: 'gen-abc', kudos: 10 });
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/generate/async')
        .flush({ id: 'gen-abc', kudos: 10 });
    });

    it('should return null on HTTP error', (done: DoneFn) => {
      service.submitImageGeneration(apiKey, request).subscribe((res) => {
        expect(res).toBeNull();
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/generate/async')
        .flush('Server error', {
          status: 500,
          statusText: 'Internal Server Error',
        });
    });
  });

  // -----------------------------------------------------------------------
  // checkImageGeneration
  // -----------------------------------------------------------------------
  describe('checkImageGeneration', () => {
    it('should GET the check endpoint with encoded ID', () => {
      service.checkImageGeneration('gen-123').subscribe();

      const req = http.expectOne(
        'https://aihorde.net/api/v2/generate/check/gen-123',
      );
      expect(req.request.method).toBe('GET');
      req.flush({
        finished: 0,
        processing: 1,
        restarted: 0,
        waiting: 0,
        done: false,
        faulted: false,
        wait_time: 15,
        queue_position: 3,
        kudos: 10,
        is_possible: true,
      });
    });

    it('should encode special characters in the ID', () => {
      service.checkImageGeneration('gen/special+id').subscribe();

      const req = http.expectOne(
        'https://aihorde.net/api/v2/generate/check/gen%2Fspecial%2Bid',
      );
      expect(req.request.method).toBe('GET');
      req.flush({
        finished: 0,
        processing: 0,
        restarted: 0,
        waiting: 1,
        done: false,
        faulted: false,
        wait_time: 30,
        queue_position: 5,
        kudos: 10,
        is_possible: true,
      });
    });

    it('should return GENERATION_NOT_FOUND on 404', (done: DoneFn) => {
      service.checkImageGeneration('gen-404').subscribe((res) => {
        expect(res).toBe(GENERATION_NOT_FOUND);
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/generate/check/gen-404')
        .flush('Not found', { status: 404, statusText: 'Not Found' });
    });

    it('should return null on non-404 HTTP error', (done: DoneFn) => {
      service.checkImageGeneration('gen-500').subscribe((res) => {
        expect(res).toBeNull();
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/generate/check/gen-500')
        .flush('Server error', {
          status: 500,
          statusText: 'Internal Server Error',
        });
    });
  });

  // -----------------------------------------------------------------------
  // getImageGenerationStatus
  // -----------------------------------------------------------------------
  describe('getImageGenerationStatus', () => {
    it('should GET the status endpoint', (done: DoneFn) => {
      const mockStatus = {
        finished: 1,
        processing: 0,
        restarted: 0,
        waiting: 0,
        done: true,
        faulted: false,
        wait_time: 0,
        queue_position: 0,
        kudos: 10,
        is_possible: true,
        generations: [
          {
            img: 'https://example.com/img.webp',
            seed: '42',
            id: 'out-1',
            censored: false,
            model: 'sd',
            state: 'ok' as const,
            worker_id: 'w1',
            worker_name: 'W1',
          },
        ],
      };

      service.getImageGenerationStatus('gen-done').subscribe((res) => {
        expect(res).toEqual(mockStatus);
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/generate/status/gen-done')
        .flush(mockStatus);
    });

    it('should return null on HTTP error', (done: DoneFn) => {
      service.getImageGenerationStatus('bad-id').subscribe((res) => {
        expect(res).toBeNull();
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/generate/status/bad-id')
        .flush('Error', { status: 500, statusText: 'Server Error' });
    });
  });

  // -----------------------------------------------------------------------
  // getTextGenerationStatus
  // -----------------------------------------------------------------------
  describe('getTextGenerationStatus', () => {
    it('should GET the text status endpoint', (done: DoneFn) => {
      const mockStatus = {
        finished: 1,
        processing: 0,
        restarted: 0,
        waiting: 0,
        done: true,
        faulted: false,
        wait_time: 0,
        queue_position: 0,
        kudos: 5,
        is_possible: true,
        generations: [
          {
            text: 'Hello world',
            model: 'koboldcpp',
            seed: 1,
            state: 'ok',
            worker_id: 'w2',
            worker_name: 'W2',
          },
        ],
      };

      service.getTextGenerationStatus('txt-1').subscribe((res) => {
        expect(res).toEqual(mockStatus);
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/generate/text/status/txt-1')
        .flush(mockStatus);
    });

    it('should return GENERATION_NOT_FOUND on 404', (done: DoneFn) => {
      service.getTextGenerationStatus('txt-bad').subscribe((res) => {
        expect(res).toBe(GENERATION_NOT_FOUND);
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/generate/text/status/txt-bad')
        .flush('Error', { status: 404, statusText: 'Not Found' });
    });

    it('should return null on non-404 HTTP error', (done: DoneFn) => {
      service.getTextGenerationStatus('txt-err').subscribe((res) => {
        expect(res).toBeNull();
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/generate/text/status/txt-err')
        .flush('Error', { status: 500, statusText: 'Internal Server Error' });
    });
  });

  // -----------------------------------------------------------------------
  // getAlchemyStatus
  // -----------------------------------------------------------------------
  describe('getAlchemyStatus', () => {
    it('should GET the interrogate status endpoint', (done: DoneFn) => {
      const mockStatus = {
        state: 'done',
        forms: [{ form: 'caption', state: 'done' }],
      };

      service.getAlchemyStatus('alch-1').subscribe((res) => {
        expect(res).toEqual(mockStatus);
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/interrogate/status/alch-1')
        .flush(mockStatus);
    });

    it('should return null on HTTP error', (done: DoneFn) => {
      service.getAlchemyStatus('alch-bad').subscribe((res) => {
        expect(res).toBeNull();
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/interrogate/status/alch-bad')
        .flush('Error', { status: 500, statusText: 'Server Error' });
    });
  });

  // -----------------------------------------------------------------------
  // getUserByApiKey
  // -----------------------------------------------------------------------
  describe('getUserByApiKey', () => {
    it('should GET find_user with the apikey header', () => {
      service.getUserByApiKey('my-key').subscribe();

      const req = http.expectOne('https://aihorde.net/api/v2/find_user');
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('apikey')).toBe('my-key');
      req.flush({ username: 'TestUser', id: 1, kudos: 500 });
    });

    it('should return null on HTTP error', (done: DoneFn) => {
      service.getUserByApiKey('bad-key').subscribe((res) => {
        expect(res).toBeNull();
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/find_user')
        .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    });
  });

  // -----------------------------------------------------------------------
  // getSelfUserByApiKeyUncached
  // -----------------------------------------------------------------------
  describe('getSelfUserByApiKeyUncached', () => {
    it('should GET find_user with the apikey header', () => {
      service.getSelfUserByApiKeyUncached('my-key').subscribe();

      const req = http.expectOne('https://aihorde.net/api/v2/find_user');
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('apikey')).toBe('my-key');
      req.flush({ username: 'TestUser', id: 1, kudos: 500 });
    });

    it('should issue a new request for each call (no shared cache)', () => {
      service.getSelfUserByApiKeyUncached('my-key').subscribe();
      service.getSelfUserByApiKeyUncached('my-key').subscribe();

      const reqs = http.match('https://aihorde.net/api/v2/find_user');
      expect(reqs.length).toBe(2);
      expect(reqs[0].request.headers.get('apikey')).toBe('my-key');
      expect(reqs[1].request.headers.get('apikey')).toBe('my-key');

      reqs[0].flush({ username: 'TestUser', id: 1, kudos: 500 });
      reqs[1].flush({ username: 'TestUser', id: 1, kudos: 500 });
    });

    it('should return null on HTTP error', (done: DoneFn) => {
      service.getSelfUserByApiKeyUncached('bad-key').subscribe((res) => {
        expect(res).toBeNull();
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/find_user')
        .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    });
  });

  // -----------------------------------------------------------------------
  // getUserById
  // -----------------------------------------------------------------------
  describe('getUserById', () => {
    it('should GET the user endpoint with numeric ID', (done: DoneFn) => {
      service.getUserById(42).subscribe((res) => {
        expect(res).toEqual(
          jasmine.objectContaining({ id: 42, username: 'User42' }),
        );
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/users/42')
        .flush({ username: 'User42', id: 42, kudos: 100 });
    });

    it('should return null on HTTP error', (done: DoneFn) => {
      service.getUserById(9999).subscribe((res) => {
        expect(res).toBeNull();
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/users/9999')
        .flush('Not found', { status: 404, statusText: 'Not Found' });
    });
  });

  // -----------------------------------------------------------------------
  // getModels / getImageModels / getTextModels
  // -----------------------------------------------------------------------
  describe('getModels', () => {
    it('should default to image type and all state', () => {
      service.getModels().subscribe();

      const req = http.expectOne(
        'https://aihorde.net/api/v2/status/models?type=image&model_state=all',
      );
      expect(req.request.method).toBe('GET');
    });

    it('should pass type and state query parameters', () => {
      service.getModels('text', 'known').subscribe();

      const req = http.expectOne(
        'https://aihorde.net/api/v2/status/models?type=text&model_state=known',
      );
      expect(req.request.method).toBe('GET');
    });
  });

  describe('getImageModels', () => {
    it('should request image models with the given state', () => {
      service.getImageModels('known').subscribe();

      const req = http.expectOne(
        'https://aihorde.net/api/v2/status/models?type=image&model_state=known',
      );
      expect(req.request.method).toBe('GET');
    });

    it('should default to all state', () => {
      service.getImageModels().subscribe();

      const req = http.expectOne(
        'https://aihorde.net/api/v2/status/models?type=image&model_state=all',
      );
      expect(req.request.method).toBe('GET');
    });
  });

  describe('getTextModels', () => {
    it('should request text models', () => {
      service.getTextModels('custom').subscribe();

      const req = http.expectOne(
        'https://aihorde.net/api/v2/status/models?type=text&model_state=custom',
      );
      expect(req.request.method).toBe('GET');
    });
  });

  // -----------------------------------------------------------------------
  // transferKudos
  // -----------------------------------------------------------------------
  describe('transferKudos', () => {
    it('should POST to the kudos transfer endpoint', () => {
      service.transferKudos('my-key', 'recipient', 100).subscribe();

      const req = http.expectOne('https://aihorde.net/api/v2/kudos/transfer');
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('apikey')).toBe('my-key');
      expect(req.request.body).toEqual({ username: 'recipient', amount: 100 });
      req.flush({ transferred: 100 });
    });

    it('should return true on success', (done: DoneFn) => {
      service.transferKudos('key', 'user', 50).subscribe((res) => {
        expect(res).toBeTrue();
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/kudos/transfer')
        .flush({ transferred: 50 });
    });

    it('should return false on HTTP error', (done: DoneFn) => {
      service.transferKudos('key', 'user', 50).subscribe((res) => {
        expect(res).toBeFalse();
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/kudos/transfer')
        .flush('Error', { status: 400, statusText: 'Bad Request' });
    });
  });

  // -----------------------------------------------------------------------
  // Stats endpoints
  // -----------------------------------------------------------------------
  describe('imageStats', () => {
    it('should GET image totals', () => {
      service.imageStats.subscribe();
      const req = http.expectOne('https://aihorde.net/api/v2/stats/img/totals');
      expect(req.request.method).toBe('GET');
    });
  });

  describe('textStats', () => {
    it('should GET text totals', () => {
      service.textStats.subscribe();
      const req = http.expectOne(
        'https://aihorde.net/api/v2/stats/text/totals',
      );
      expect(req.request.method).toBe('GET');
    });
  });

  describe('performance', () => {
    it('should GET performance stats', () => {
      service.performance.subscribe();
      const req = http.expectOne(
        'https://aihorde.net/api/v2/status/performance',
      );
      expect(req.request.method).toBe('GET');
    });
  });

  // -----------------------------------------------------------------------
  // News
  // -----------------------------------------------------------------------
  describe('getNews', () => {
    const mockItems = [
      {
        title: 'Update 1',
        date_published: '2024-01-01',
        newspiece: 'Content 1',
        more_info_urls: ['https://example.com'],
      },
      {
        title: 'Update 2',
        date_published: '2024-01-02',
        newspiece: 'Content 2',
        more_info_urls: [],
      },
      {
        title: 'Update 3',
        date_published: '2024-01-03',
        newspiece: 'Content 3',
        more_info_urls: [],
      },
    ];

    it('should GET news from the status endpoint', () => {
      service.getNews().subscribe();
      const req = http.expectOne('https://aihorde.net/api/v2/status/news');
      expect(req.request.method).toBe('GET');
    });

    it('should map HordeNewsItem to NewsItem format', (done: DoneFn) => {
      service.getNews().subscribe((news) => {
        expect(news.length).toBe(3);
        expect(news[0].title).toBe('Update 1');
        expect(news[0].datePublished).toBe('2024-01-01');
        expect(news[0].excerpt).toBe('Content 1');
        expect(news[0].moreLink).toBe('https://example.com');
        done();
      });

      http.expectOne('https://aihorde.net/api/v2/status/news').flush(mockItems);
    });

    it('should set moreLink to null when no URLs', (done: DoneFn) => {
      service.getNews().subscribe((news) => {
        expect(news[1].moreLink).toBeNull();
        done();
      });

      http.expectOne('https://aihorde.net/api/v2/status/news').flush(mockItems);
    });

    it('should slice results when count is provided', (done: DoneFn) => {
      service.getNews(2).subscribe((news) => {
        expect(news.length).toBe(2);
        done();
      });

      http.expectOne('https://aihorde.net/api/v2/status/news').flush(mockItems);
    });

    it('should deduplicate titles with numeric suffix', (done: DoneFn) => {
      const dupes = [
        {
          title: 'Same',
          date_published: '2024-01-01',
          newspiece: 'A',
          more_info_urls: [],
        },
        {
          title: 'Same',
          date_published: '2024-01-02',
          newspiece: 'B',
          more_info_urls: [],
        },
      ];

      service.getNews().subscribe((news) => {
        expect(news[0].title).toBe('Same');
        expect(news[1].title).toBe('Same (2)');
        done();
      });

      http.expectOne('https://aihorde.net/api/v2/status/news').flush(dupes);
    });

    it('should handle missing more_info_urls gracefully', (done: DoneFn) => {
      const items = [
        {
          title: 'No URLs field',
          date_published: '2024-06-01',
          newspiece: 'Content',
          // more_info_urls is undefined/missing entirely
        },
      ];

      service.getNews().subscribe((news) => {
        expect(news.length).toBe(1);
        expect(news[0].moreLink).toBeNull();
        done();
      });

      http.expectOne('https://aihorde.net/api/v2/status/news').flush(items);
    });

    it('should handle null more_info_urls gracefully', (done: DoneFn) => {
      const items = [
        {
          title: 'Null URLs',
          date_published: '2024-06-01',
          newspiece: 'Content',
          more_info_urls: null,
        },
      ];

      service.getNews().subscribe((news) => {
        expect(news.length).toBe(1);
        expect(news[0].moreLink).toBeNull();
        done();
      });

      http.expectOne('https://aihorde.net/api/v2/status/news').flush(items);
    });
  });

  // -----------------------------------------------------------------------
  // Documents
  // -----------------------------------------------------------------------
  describe('terms', () => {
    it('should GET terms and extract HTML', (done: DoneFn) => {
      service.terms.subscribe((html) => {
        expect(html).toBe('<p>Terms content</p>');
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/documents/terms?format=html')
        .flush({ html: '<p>Terms content</p>' });
    });
  });

  describe('privacyPolicy', () => {
    it('should GET privacy policy and extract HTML', (done: DoneFn) => {
      service.privacyPolicy.subscribe((html) => {
        expect(html).toBe('<p>Privacy content</p>');
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/documents/privacy?format=html')
        .flush({ html: '<p>Privacy content</p>' });
    });
  });

  // -----------------------------------------------------------------------
  // Leaderboard
  // -----------------------------------------------------------------------
  describe('getKudosLeaderboard', () => {
    it('should GET users sorted by kudos with page parameter', () => {
      service.getKudosLeaderboard(2).subscribe();
      const req = http.expectOne(
        'https://aihorde.net/api/v2/users?page=2&sort=kudos',
      );
      expect(req.request.method).toBe('GET');
    });

    it('should map response to LeaderboardUser, limited to 25 by default', (done: DoneFn) => {
      const users = Array.from({ length: 30 }, (_, i) => ({
        username: `user-${i}`,
        id: i,
        kudos: 1000 - i,
      }));

      service.getKudosLeaderboard().subscribe((result) => {
        expect(result.length).toBe(25);
        expect(result[0]).toEqual({ username: 'user-0', id: 0, kudos: 1000 });
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/users?page=1&sort=kudos')
        .flush(users);
    });

    it('should return empty array on error', (done: DoneFn) => {
      service.getKudosLeaderboard().subscribe((result) => {
        expect(result).toEqual([]);
        done();
      });

      http
        .expectOne('https://aihorde.net/api/v2/users?page=1&sort=kudos')
        .flush('Error', { status: 500, statusText: 'Server Error' });
    });
  });

  // -----------------------------------------------------------------------
  // Model stats
  // -----------------------------------------------------------------------
  describe('getImageModelStats', () => {
    it('should default to known state', () => {
      service.getImageModelStats().subscribe();
      const req = http.expectOne(
        'https://aihorde.net/api/v2/stats/img/models?model_state=known',
      );
      expect(req.request.method).toBe('GET');
    });

    it('should pass the model_state parameter', () => {
      service.getImageModelStats('all').subscribe();
      const req = http.expectOne(
        'https://aihorde.net/api/v2/stats/img/models?model_state=all',
      );
      expect(req.request.method).toBe('GET');
    });
  });

  describe('getTextModelStats', () => {
    it('should GET text model stats', () => {
      service.getTextModelStats().subscribe();
      const req = http.expectOne(
        'https://aihorde.net/api/v2/stats/text/models',
      );
      expect(req.request.method).toBe('GET');
    });
  });
});
