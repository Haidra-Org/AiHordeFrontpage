import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { AiHordeService } from './ai-horde.service';
import {
  GENERATION_NOT_FOUND,
  ImageGenerationRequest,
} from '../types/generation';
import { clientAgentInterceptor } from './interceptors/client-agent.interceptor';
import { API_BASE } from '../testing/api-test-helpers';

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

      const req = http.expectOne(`${API_BASE}/generate/async`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('apikey')).toBe(apiKey);
      // Integration: also verifies interceptor adds Client-Agent header
      expect(req.request.headers.get('Client-Agent')).toBe(
        'AiHordeFrontpage:generate',
      );
      expect(req.request.body).toEqual(request);
      req.flush({ id: 'gen-abc', kudos: 10 });
    });

    it('should return the response on success', async () => {
      const promise = firstValueFrom(
        service.submitImageGeneration(apiKey, request),
      );

      http
        .expectOne(`${API_BASE}/generate/async`)
        .flush({ id: 'gen-abc', kudos: 10 });

      expect(await promise).toEqual({ id: 'gen-abc', kudos: 10 });
    });

    it('should return null on HTTP error', async () => {
      const promise = firstValueFrom(
        service.submitImageGeneration(apiKey, request),
      );

      http.expectOne(`${API_BASE}/generate/async`).flush('Server error', {
        status: 500,
        statusText: 'Internal Server Error',
      });

      expect(await promise).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // checkImageGeneration
  // -----------------------------------------------------------------------
  describe('checkImageGeneration', () => {
    it('should GET the check endpoint with encoded ID', () => {
      service.checkImageGeneration('gen-123').subscribe();

      const req = http.expectOne(`${API_BASE}/generate/check/gen-123`);
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
        `${API_BASE}/generate/check/gen%2Fspecial%2Bid`,
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

    it('should return GENERATION_NOT_FOUND on 404', async () => {
      const promise = firstValueFrom(service.checkImageGeneration('gen-404'));

      http
        .expectOne(`${API_BASE}/generate/check/gen-404`)
        .flush('Not found', { status: 404, statusText: 'Not Found' });

      expect(await promise).toBe(GENERATION_NOT_FOUND);
    });

    it('should return null on non-404 HTTP error', async () => {
      const promise = firstValueFrom(service.checkImageGeneration('gen-500'));

      http
        .expectOne(`${API_BASE}/generate/check/gen-500`)
        .flush('Server error', {
          status: 500,
          statusText: 'Internal Server Error',
        });

      expect(await promise).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getImageGenerationStatus
  // -----------------------------------------------------------------------
  describe('getImageGenerationStatus', () => {
    it('should GET the status endpoint and return the response', async () => {
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

      const promise = firstValueFrom(
        service.getImageGenerationStatus('gen-done'),
      );

      http.expectOne(`${API_BASE}/generate/status/gen-done`).flush(mockStatus);

      expect(await promise).toEqual(mockStatus);
    });

    it('should return null on HTTP error', async () => {
      const promise = firstValueFrom(
        service.getImageGenerationStatus('bad-id'),
      );

      http
        .expectOne(`${API_BASE}/generate/status/bad-id`)
        .flush('Error', { status: 500, statusText: 'Server Error' });

      expect(await promise).toBeNull();
    });

    it('should return GENERATION_NOT_FOUND on 404', async () => {
      const promise = firstValueFrom(
        service.getImageGenerationStatus('gen-gone'),
      );

      http
        .expectOne(`${API_BASE}/generate/status/gen-gone`)
        .flush('Not found', { status: 404, statusText: 'Not Found' });

      expect(await promise).toBe(GENERATION_NOT_FOUND);
    });
  });

  // -----------------------------------------------------------------------
  // getTextGenerationStatus
  // -----------------------------------------------------------------------
  describe('getTextGenerationStatus', () => {
    it('should GET the text status endpoint', async () => {
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

      const promise = firstValueFrom(service.getTextGenerationStatus('txt-1'));

      http
        .expectOne(`${API_BASE}/generate/text/status/txt-1`)
        .flush(mockStatus);

      expect(await promise).toEqual(mockStatus);
    });

    it('should return GENERATION_NOT_FOUND on 404', async () => {
      const promise = firstValueFrom(
        service.getTextGenerationStatus('txt-bad'),
      );

      http
        .expectOne(`${API_BASE}/generate/text/status/txt-bad`)
        .flush('Error', { status: 404, statusText: 'Not Found' });

      expect(await promise).toBe(GENERATION_NOT_FOUND);
    });

    it('should return null on non-404 HTTP error', async () => {
      const promise = firstValueFrom(
        service.getTextGenerationStatus('txt-err'),
      );

      http
        .expectOne(`${API_BASE}/generate/text/status/txt-err`)
        .flush('Error', { status: 500, statusText: 'Internal Server Error' });

      expect(await promise).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getAlchemyStatus
  // -----------------------------------------------------------------------
  describe('getAlchemyStatus', () => {
    it('should GET the interrogate status endpoint', async () => {
      const mockStatus = {
        state: 'done',
        forms: [{ form: 'caption', state: 'done' }],
      };

      const promise = firstValueFrom(service.getAlchemyStatus('alch-1'));

      http.expectOne(`${API_BASE}/interrogate/status/alch-1`).flush(mockStatus);

      expect(await promise).toEqual(mockStatus);
    });

    it('should return GENERATION_NOT_FOUND on 404', async () => {
      const promise = firstValueFrom(service.getAlchemyStatus('alch-gone'));

      http
        .expectOne(`${API_BASE}/interrogate/status/alch-gone`)
        .flush('Not found', { status: 404, statusText: 'Not Found' });

      expect(await promise).toBe(GENERATION_NOT_FOUND);
    });

    it('should return null on non-404 HTTP error', async () => {
      const promise = firstValueFrom(service.getAlchemyStatus('alch-bad'));

      http
        .expectOne(`${API_BASE}/interrogate/status/alch-bad`)
        .flush('Error', { status: 500, statusText: 'Server Error' });

      expect(await promise).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getUserByApiKey
  // -----------------------------------------------------------------------
  describe('getUserByApiKey', () => {
    it('should GET find_user with the apikey header', () => {
      service.getUserByApiKey('my-key').subscribe();

      const req = http.expectOne(`${API_BASE}/find_user`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('apikey')).toBe('my-key');
      req.flush({ username: 'TestUser', id: 1, kudos: 500 });
    });

    it('should return null on HTTP error', async () => {
      const promise = firstValueFrom(service.getUserByApiKey('bad-key'));

      http
        .expectOne(`${API_BASE}/find_user`)
        .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      expect(await promise).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getSelfUserByApiKeyUncached
  // -----------------------------------------------------------------------
  describe('getSelfUserByApiKeyUncached', () => {
    it('should GET find_user with the apikey header', () => {
      service.getSelfUserByApiKeyUncached('my-key').subscribe();

      const req = http.expectOne(`${API_BASE}/find_user`);
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('apikey')).toBe('my-key');
      req.flush({ username: 'TestUser', id: 1, kudos: 500 });
    });

    it('should issue a new request for each call (no shared cache)', () => {
      service.getSelfUserByApiKeyUncached('my-key').subscribe();
      service.getSelfUserByApiKeyUncached('my-key').subscribe();

      const reqs = http.match(`${API_BASE}/find_user`);
      expect(reqs.length).toBe(2);
      expect(reqs[0].request.headers.get('apikey')).toBe('my-key');
      expect(reqs[1].request.headers.get('apikey')).toBe('my-key');

      reqs[0].flush({ username: 'TestUser', id: 1, kudos: 500 });
      reqs[1].flush({ username: 'TestUser', id: 1, kudos: 500 });
    });

    it('should return null on HTTP error', async () => {
      const promise = firstValueFrom(
        service.getSelfUserByApiKeyUncached('bad-key'),
      );

      http
        .expectOne(`${API_BASE}/find_user`)
        .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      expect(await promise).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getUserById
  // -----------------------------------------------------------------------
  describe('getUserById', () => {
    it('should GET the user endpoint with numeric ID', async () => {
      const promise = firstValueFrom(service.getUserById(42));

      http
        .expectOne(`${API_BASE}/users/42`)
        .flush({ username: 'User42', id: 42, kudos: 100 });

      expect(await promise).toEqual(
        expect.objectContaining({ id: 42, username: 'User42' }),
      );
    });

    it('should return null on HTTP error', async () => {
      const promise = firstValueFrom(service.getUserById(9999));

      http
        .expectOne(`${API_BASE}/users/9999`)
        .flush('Not found', { status: 404, statusText: 'Not Found' });

      expect(await promise).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getModels / getImageModels / getTextModels
  // -----------------------------------------------------------------------
  describe('getModels', () => {
    it('should default to image type and all state', () => {
      service.getModels().subscribe();

      const req = http.expectOne(
        `${API_BASE}/status/models?type=image&model_state=all`,
      );
      expect(req.request.method).toBe('GET');
    });

    it('should pass type and state query parameters', () => {
      service.getModels('text', 'known').subscribe();

      const req = http.expectOne(
        `${API_BASE}/status/models?type=text&model_state=known`,
      );
      expect(req.request.method).toBe('GET');
    });
  });

  describe('getImageModels', () => {
    it('should request image models with the given state', () => {
      service.getImageModels('known').subscribe();

      const req = http.expectOne(
        `${API_BASE}/status/models?type=image&model_state=known`,
      );
      expect(req.request.method).toBe('GET');
    });

    it('should default to all state', () => {
      service.getImageModels().subscribe();

      const req = http.expectOne(
        `${API_BASE}/status/models?type=image&model_state=all`,
      );
      expect(req.request.method).toBe('GET');
    });
  });

  describe('getTextModels', () => {
    it('should request text models', () => {
      service.getTextModels('custom').subscribe();

      const req = http.expectOne(
        `${API_BASE}/status/models?type=text&model_state=custom`,
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

      const req = http.expectOne(`${API_BASE}/kudos/transfer`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('apikey')).toBe('my-key');
      expect(req.request.body).toEqual({ username: 'recipient', amount: 100 });
      req.flush({ transferred: 100 });
    });

    it('should return true on success', async () => {
      const promise = firstValueFrom(service.transferKudos('key', 'user', 50));

      http.expectOne(`${API_BASE}/kudos/transfer`).flush({ transferred: 50 });

      expect(await promise).toBe(true);
    });

    it('should return false on HTTP error', async () => {
      const promise = firstValueFrom(service.transferKudos('key', 'user', 50));

      http
        .expectOne(`${API_BASE}/kudos/transfer`)
        .flush('Error', { status: 400, statusText: 'Bad Request' });

      expect(await promise).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Stats endpoints
  // -----------------------------------------------------------------------
  describe('imageStats', () => {
    it('should GET image totals', () => {
      service.imageStats.subscribe();
      const req = http.expectOne(`${API_BASE}/stats/img/totals`);
      expect(req.request.method).toBe('GET');
    });
  });

  describe('textStats', () => {
    it('should GET text totals', () => {
      service.textStats.subscribe();
      const req = http.expectOne(`${API_BASE}/stats/text/totals`);
      expect(req.request.method).toBe('GET');
    });
  });

  describe('performance', () => {
    it('should GET performance stats', () => {
      service.performance.subscribe();
      const req = http.expectOne(`${API_BASE}/status/performance`);
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
      const req = http.expectOne(`${API_BASE}/status/news`);
      expect(req.request.method).toBe('GET');
    });

    it('should map HordeNewsItem to NewsItem format', async () => {
      const promise = firstValueFrom(service.getNews());

      http.expectOne(`${API_BASE}/status/news`).flush(mockItems);

      const news = await promise;
      expect(news.length).toBe(3);
      expect(news[0].title).toBe('Update 1');
      expect(news[0].datePublished).toBe('2024-01-01');
      expect(news[0].excerpt).toBe('Content 1');
      expect(news[0].moreLink).toBe('https://example.com');
    });

    it('should set moreLink to null when no URLs', async () => {
      const promise = firstValueFrom(service.getNews());

      http.expectOne(`${API_BASE}/status/news`).flush(mockItems);

      const news = await promise;
      expect(news[1].moreLink).toBeNull();
    });

    it('should slice results when count is provided', async () => {
      const promise = firstValueFrom(service.getNews(2));

      http.expectOne(`${API_BASE}/status/news`).flush(mockItems);

      const news = await promise;
      expect(news.length).toBe(2);
    });

    it('should deduplicate titles with numeric suffix', async () => {
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

      const promise = firstValueFrom(service.getNews());

      http.expectOne(`${API_BASE}/status/news`).flush(dupes);

      const news = await promise;
      expect(news[0].title).toBe('Same');
      expect(news[1].title).toBe('Same (2)');
    });

    it('should produce incrementing suffixes for 3+ duplicates', async () => {
      const tripleItems = [
        {
          title: 'Dupe',
          date_published: '2024-01-01',
          newspiece: 'A',
          more_info_urls: [],
        },
        {
          title: 'Dupe',
          date_published: '2024-01-02',
          newspiece: 'B',
          more_info_urls: [],
        },
        {
          title: 'Dupe',
          date_published: '2024-01-03',
          newspiece: 'C',
          more_info_urls: [],
        },
        {
          title: 'Dupe',
          date_published: '2024-01-04',
          newspiece: 'D',
          more_info_urls: [],
        },
      ];

      const promise = firstValueFrom(service.getNews());

      http.expectOne(`${API_BASE}/status/news`).flush(tripleItems);

      const news = await promise;
      expect(news[0].title).toBe('Dupe');
      expect(news[1].title).toBe('Dupe (2)');
      expect(news[2].title).toBe('Dupe (3)');
      expect(news[3].title).toBe('Dupe (4)');
    });

    it('should handle missing more_info_urls gracefully', async () => {
      const items = [
        {
          title: 'No URLs field',
          date_published: '2024-06-01',
          newspiece: 'Content',
        },
      ];

      const promise = firstValueFrom(service.getNews());

      http.expectOne(`${API_BASE}/status/news`).flush(items);

      const news = await promise;
      expect(news.length).toBe(1);
      expect(news[0].moreLink).toBeNull();
    });

    it('should handle null more_info_urls gracefully', async () => {
      const items = [
        {
          title: 'Null URLs',
          date_published: '2024-06-01',
          newspiece: 'Content',
          more_info_urls: null,
        },
      ];

      const promise = firstValueFrom(service.getNews());

      http.expectOne(`${API_BASE}/status/news`).flush(items);

      const news = await promise;
      expect(news.length).toBe(1);
      expect(news[0].moreLink).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Documents
  // -----------------------------------------------------------------------
  describe('terms', () => {
    it('should GET terms and extract HTML', async () => {
      const promise = firstValueFrom(service.terms);

      http
        .expectOne(`${API_BASE}/documents/terms?format=html`)
        .flush({ html: '<p>Terms content</p>' });

      expect(await promise).toBe('<p>Terms content</p>');
    });
  });

  describe('privacyPolicy', () => {
    it('should GET privacy policy and extract HTML', async () => {
      const promise = firstValueFrom(service.privacyPolicy);

      http
        .expectOne(`${API_BASE}/documents/privacy?format=html`)
        .flush({ html: '<p>Privacy content</p>' });

      expect(await promise).toBe('<p>Privacy content</p>');
    });
  });

  // -----------------------------------------------------------------------
  // Leaderboard
  // -----------------------------------------------------------------------
  describe('getKudosLeaderboard', () => {
    it('should GET users sorted by kudos with page parameter', () => {
      service.getKudosLeaderboard(2).subscribe();
      const req = http.expectOne(`${API_BASE}/users?page=2&sort=kudos`);
      expect(req.request.method).toBe('GET');
    });

    it('should map response to LeaderboardUser, limited to 25 by default', async () => {
      const users = Array.from({ length: 30 }, (_, i) => ({
        username: `user-${i}`,
        id: i,
        kudos: 1000 - i,
      }));

      const promise = firstValueFrom(service.getKudosLeaderboard());

      http.expectOne(`${API_BASE}/users?page=1&sort=kudos`).flush(users);

      const result = await promise;
      expect(result.length).toBe(25);
      expect(result[0]).toEqual({ username: 'user-0', id: 0, kudos: 1000 });
    });

    it('should return empty array on error', async () => {
      const promise = firstValueFrom(service.getKudosLeaderboard());

      http
        .expectOne(`${API_BASE}/users?page=1&sort=kudos`)
        .flush('Error', { status: 500, statusText: 'Server Error' });

      expect(await promise).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Model stats
  // -----------------------------------------------------------------------
  describe('getImageModelStats', () => {
    it('should default to known state', () => {
      service.getImageModelStats().subscribe();
      const req = http.expectOne(
        `${API_BASE}/stats/img/models?model_state=known`,
      );
      expect(req.request.method).toBe('GET');
    });

    it('should pass the model_state parameter', () => {
      service.getImageModelStats('all').subscribe();
      const req = http.expectOne(
        `${API_BASE}/stats/img/models?model_state=all`,
      );
      expect(req.request.method).toBe('GET');
    });
  });

  describe('getTextModelStats', () => {
    it('should GET text model stats', () => {
      service.getTextModelStats().subscribe();
      const req = http.expectOne(`${API_BASE}/stats/text/models`);
      expect(req.request.method).toBe('GET');
    });
  });

  // -----------------------------------------------------------------------
  // interrogationStats
  // -----------------------------------------------------------------------
  describe('interrogationStats', () => {
    it('should return a valid processed-count payload', async () => {
      const result = await firstValueFrom(service.interrogationStats);
      expect(result).toEqual({ processed: expect.any(Number) });
      expect(result.processed).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // inferPublicWorkers
  // -----------------------------------------------------------------------
  describe('inferPublicWorkers', () => {
    it('should call user endpoint with anonymous API key', () => {
      service.inferPublicWorkers(42).subscribe();

      const req = http.expectOne(`${API_BASE}/users/42`);
      expect(req.request.headers.get('apikey')).toBe('0000000000');
      req.flush({ username: 'test', id: 42, worker_ids: ['w1'] });
    });

    it('should return true when worker_ids is a non-empty array', async () => {
      const promise = firstValueFrom(service.inferPublicWorkers(42));

      http.expectOne(`${API_BASE}/users/42`).flush({
        username: 'test',
        id: 42,
        worker_ids: ['w1', 'w2'],
      });

      expect(await promise).toBe(true);
    });

    it('should return false when worker_ids is an empty array', async () => {
      const promise = firstValueFrom(service.inferPublicWorkers(42));

      http.expectOne(`${API_BASE}/users/42`).flush({
        username: 'test',
        id: 42,
        worker_ids: [],
      });

      expect(await promise).toBe(false);
    });

    it('should return false when worker_ids is undefined', async () => {
      const promise = firstValueFrom(service.inferPublicWorkers(42));

      http.expectOne(`${API_BASE}/users/42`).flush({
        username: 'test',
        id: 42,
      });

      expect(await promise).toBe(false);
    });

    it('should return false on API error', async () => {
      const promise = firstValueFrom(service.inferPublicWorkers(42));

      http
        .expectOne(`${API_BASE}/users/42`)
        .flush('Forbidden', { status: 403, statusText: 'Forbidden' });

      expect(await promise).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getEducatorAccounts
  // -----------------------------------------------------------------------
  describe('getEducatorAccounts', () => {
    it('should fetch the hardcoded educator user ID', async () => {
      const promise = firstValueFrom(service.getEducatorAccounts());

      http.expectOne(`${API_BASE}/users/258170`).flush({
        username: 'educator',
        id: 258170,
        kudos: 1000,
      });

      const result = await promise;
      expect(result).toEqual([
        { username: 'educator', id: 258170, kudos: 1000 },
      ]);
    });

    it('should filter out null users when a lookup fails', async () => {
      const promise = firstValueFrom(service.getEducatorAccounts());

      http.expectOne(`${API_BASE}/users/258170`).flush('Gone', {
        status: 404,
        statusText: 'Not Found',
      });

      await expect(promise).resolves.toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getKudosLeaderboardPage
  // -----------------------------------------------------------------------
  describe('getKudosLeaderboardPage', () => {
    it('should GET users with the page parameter', () => {
      service.getKudosLeaderboardPage(3).subscribe();
      const req = http.expectOne(`${API_BASE}/users?page=3&sort=kudos`);
      expect(req.request.method).toBe('GET');
    });

    it('should map all users without slicing', async () => {
      const users = Array.from({ length: 30 }, (_, i) => ({
        username: `user-${i}`,
        id: i,
        kudos: 1000 - i,
      }));

      const promise = firstValueFrom(service.getKudosLeaderboardPage(1));

      http.expectOne(`${API_BASE}/users?page=1&sort=kudos`).flush(users);

      const result = await promise;
      // Unlike getKudosLeaderboard which slices to 25, this returns all users
      expect(result.length).toBe(30);
      expect(result[0]).toEqual({ username: 'user-0', id: 0, kudos: 1000 });
      expect(result[29]).toEqual({ username: 'user-29', id: 29, kudos: 971 });
    });

    it('should return empty array on error', async () => {
      const promise = firstValueFrom(service.getKudosLeaderboardPage(1));

      http
        .expectOne(`${API_BASE}/users?page=1&sort=kudos`)
        .flush('Error', { status: 500, statusText: 'Server Error' });

      expect(await promise).toEqual([]);
    });
  });
});
