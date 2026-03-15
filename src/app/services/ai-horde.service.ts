import { Injectable, inject } from '@angular/core';
import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
} from '@angular/common/http';
import { catchError, map, Observable, of, zip } from 'rxjs';
import { ImageTotalStats } from '../types/image-total-stats';
import { HordePerformance } from '../types/horde-performance';
import { TextTotalStats } from '../types/text-total-stats';
import { NewsItem } from '../types/news.types';
import { SingleInterrogationStatPoint } from '../types/single-interrogation-stat-point';
import { HtmlHordeDocument } from '../types/horde-document';
import { HordeNewsItem } from '../types/horde-news-item';
import { HordeUser } from '../types/horde-user';
import { ActiveModel, ModelType } from '../types/active-model';
import { ImageModelStats } from '../types/image-model-stats';
import { TextModelStats } from '../types/text-model-stats';
import { LeaderboardUser } from '../types/leaderboard-user';
import {
  ImageGenerationRequest,
  ImageGenerationResponse,
  GenerationCheckResponse,
  GenerationStatusResponse,
  TextGenerationStatusResponse,
  AlchemyStatusResponse,
  GENERATION_NOT_FOUND,
} from '../types/generation';
import { HordeApiCacheService, CacheTTL } from './horde-api-cache.service';
import { CLIENT_AGENT } from './interceptors/client-agent.interceptor';

const BASE = 'https://aihorde.net/api/v2';

@Injectable({
  providedIn: 'root',
})
export class AiHordeService {
  private readonly httpClient = inject(HttpClient);
  private readonly cache = inject(HordeApiCacheService);

  public get imageStats(): Observable<ImageTotalStats> {
    return this.cache.cachedGet<ImageTotalStats>(
      `${BASE}/stats/img/totals`,
      undefined,
      {
        ttl: CacheTTL.LONG,
        category: 'stats',
      },
    );
  }

  public get textStats(): Observable<TextTotalStats> {
    return this.cache.cachedGet<TextTotalStats>(
      `${BASE}/stats/text/totals`,
      undefined,
      {
        ttl: CacheTTL.LONG,
        category: 'stats',
      },
    );
  }

  public get performance(): Observable<HordePerformance> {
    return this.cache.cachedGet<HordePerformance>(
      `${BASE}/status/performance`,
      undefined,
      {
        ttl: CacheTTL.MEDIUM,
        category: 'performance',
      },
    );
  }

  public get interrogationStats(): Observable<SingleInterrogationStatPoint> {
    return of({
      processed: 663723,
    });
  }

  public get terms(): Observable<string> {
    return this.cache
      .cachedGet<HtmlHordeDocument>(
        `${BASE}/documents/terms?format=html`,
        undefined,
        {
          ttl: CacheTTL.VERY_LONG,
          category: 'documents',
        },
      )
      .pipe(map((response) => response.html));
  }

  public get privacyPolicy(): Observable<string> {
    return this.cache
      .cachedGet<HtmlHordeDocument>(
        `${BASE}/documents/privacy?format=html`,
        undefined,
        {
          ttl: CacheTTL.VERY_LONG,
          category: 'documents',
        },
      )
      .pipe(map((response) => response.html));
  }

  public getNews(count?: number): Observable<NewsItem[]> {
    return this.cache
      .cachedGet<
        HordeNewsItem[]
      >(`${BASE}/status/news`, undefined, { ttl: CacheTTL.VERY_LONG, category: 'news' })
      .pipe(
        map((newsItems) => (count ? newsItems.slice(0, count) : newsItems)),
        map((newsItems) => {
          const titleMap = new Map<string, number>();
          return newsItems.map((newsItem) => {
            let title = newsItem.title;
            if (titleMap.has(title)) {
              const count = titleMap.get(title)! + 1;
              titleMap.set(title, count);
              title = `${title} (${count})`;
            } else {
              titleMap.set(title, 1);
            }
            return {
              title: title,
              datePublished: newsItem.date_published,
              excerpt: newsItem.newspiece,
              moreLink:
                newsItem.more_info_urls.length > 0
                  ? newsItem.more_info_urls[0]
                  : null,
            };
          });
        }),
      );
  }
  public getUserByApiKey(apiKey: string): Observable<HordeUser | null> {
    return this.cache
      .cachedGet<HordeUser>(
        `${BASE}/find_user`,
        { headers: { apikey: apiKey } },
        { ttl: CacheTTL.MEDIUM, category: 'user' },
      )
      .pipe(catchError(() => of(null)));
  }

  public getSelfUserByApiKeyUncached(
    apiKey: string,
  ): Observable<HordeUser | null> {
    return this.httpClient
      .get<HordeUser>(`${BASE}/find_user`, {
        headers: { apikey: apiKey },
      })
      .pipe(catchError(() => of(null)));
  }

  public getUserById(id: number): Observable<HordeUser | null> {
    return this.cache
      .cachedGet<HordeUser>(`${BASE}/users/${id}`, undefined, {
        ttl: CacheTTL.MEDIUM,
        category: 'user',
      })
      .pipe(catchError(() => of(null)));
  }

  /**
   * The API doesn't return public_workers in GET responses, so we infer it
   * by making an anonymous call and checking if worker_ids is visible.
   */
  public inferPublicWorkers(userId: number): Observable<boolean> {
    return this.cache
      .cachedGet<HordeUser>(
        `${BASE}/users/${userId}`,
        { headers: { apikey: '0000000000' } },
        { ttl: CacheTTL.MEDIUM, category: 'user' },
      )
      .pipe(
        map(
          (user) =>
            Array.isArray(user.worker_ids) && user.worker_ids.length > 0,
        ),
        catchError(() => of(false)),
      );
  }

  public transferKudos(
    apiKey: string,
    targetUser: string,
    amount: number,
  ): Observable<boolean> {
    return this.httpClient
      .post<unknown>(
        `${BASE}/kudos/transfer`,
        {
          username: targetUser,
          amount: amount,
        },
        {
          headers: {
            apikey: apiKey,
          },
        },
      )
      .pipe(
        map(() => true),
        catchError(() => of(false)),
      );
  }

  public getEducatorAccounts(): Observable<HordeUser[]> {
    // todo once filtering is available, filter it on the api, this is only temporary solution
    const userIds = [258170];

    return zip(
      userIds.map((userId) =>
        this.getUserById(userId).pipe(map((user) => user!)),
      ),
    );
  }

  /**
   * Get active models by type.
   * @param type - The model type: 'image' or 'text'
   * @param modelState - Filter by model state: 'known', 'custom', or 'all'
   */
  public getModels(
    type: ModelType = 'image',
    modelState: 'known' | 'custom' | 'all' = 'all',
  ): Observable<ActiveModel[]> {
    return this.cache.cachedGet<ActiveModel[]>(
      `${BASE}/status/models?type=${type}&model_state=${modelState}`,
      undefined,
      { ttl: CacheTTL.LONG, category: 'models' },
    );
  }

  /** Get active image models. */
  public getImageModels(
    modelState: 'known' | 'custom' | 'all' = 'all',
  ): Observable<ActiveModel[]> {
    return this.getModels('image', modelState);
  }

  /** Get active text models. */
  public getTextModels(
    modelState: 'known' | 'custom' | 'all' = 'all',
  ): Observable<ActiveModel[]> {
    return this.getModels('text', modelState);
  }

  /**
   * Get image generation stats per model.
   * @param modelState - Filter by model state: 'known', 'custom', or 'all'
   */
  public getImageModelStats(
    modelState: 'known' | 'custom' | 'all' = 'known',
  ): Observable<ImageModelStats> {
    return this.cache.cachedGet<ImageModelStats>(
      `${BASE}/stats/img/models?model_state=${modelState}`,
      undefined,
      {
        ttl: CacheTTL.LONG,
        category: 'stats',
      },
    );
  }

  /**
   * Get text generation stats per model.
   */
  public getTextModelStats(): Observable<TextModelStats> {
    return this.cache.cachedGet<TextModelStats>(
      `${BASE}/stats/text/models`,
      undefined,
      {
        ttl: CacheTTL.LONG,
        category: 'stats',
      },
    );
  }

  /**
   * Get kudos leaderboard - top users sorted by kudos.
   * @param page - Page number (1-indexed)
   * @param limit - Number of users per page (max 25)
   */
  public getKudosLeaderboard(
    page = 1,
    limit = 25,
  ): Observable<LeaderboardUser[]> {
    return this.cache
      .cachedGet<
        HordeUser[]
      >(`${BASE}/users?page=${page}&sort=kudos`, undefined, { ttl: CacheTTL.MEDIUM, category: 'leaderboard' })
      .pipe(
        map((users) =>
          users.slice(0, limit).map((user) => ({
            username: user.username,
            id: user.id,
            kudos: user.kudos,
          })),
        ),
        catchError(() => of([])),
      );
  }

  /**
   * Get a page of users sorted by kudos for rank lookup.
   * @param page - Page number (1-indexed)
   */
  public getKudosLeaderboardPage(page: number): Observable<LeaderboardUser[]> {
    return this.cache
      .cachedGet<
        HordeUser[]
      >(`${BASE}/users?page=${page}&sort=kudos`, undefined, { ttl: CacheTTL.MEDIUM, category: 'leaderboard' })
      .pipe(
        map((users) =>
          users.map((user) => ({
            username: user.username,
            id: user.id,
            kudos: user.kudos,
          })),
        ),
        catchError(() => of([])),
      );
  }

  private readonly generateContext = new HttpContext().set(
    CLIENT_AGENT,
    'AiHordeFrontpage:generate',
  );

  public submitImageGeneration(
    apiKey: string,
    request: ImageGenerationRequest,
  ): Observable<ImageGenerationResponse | null> {
    return this.httpClient
      .post<ImageGenerationResponse>(`${BASE}/generate/async`, request, {
        headers: { apikey: apiKey },
        context: this.generateContext,
      })
      .pipe(catchError(() => of(null)));
  }

  // Generation status checks are never cached — they need real-time data
  public checkImageGeneration(
    id: string,
  ): Observable<GenerationCheckResponse | typeof GENERATION_NOT_FOUND | null> {
    return this.httpClient
      .get<GenerationCheckResponse>(
        `${BASE}/generate/check/${encodeURIComponent(id)}`,
      )
      .pipe(catchError((err) => this.catchNotFound(err)));
  }

  public getImageGenerationStatus(
    id: string,
  ): Observable<GenerationStatusResponse | typeof GENERATION_NOT_FOUND | null> {
    return this.httpClient
      .get<GenerationStatusResponse>(
        `${BASE}/generate/status/${encodeURIComponent(id)}`,
      )
      .pipe(catchError((err) => this.catchNotFound(err)));
  }

  public getTextGenerationStatus(
    id: string,
  ): Observable<
    TextGenerationStatusResponse | typeof GENERATION_NOT_FOUND | null
  > {
    return this.httpClient
      .get<TextGenerationStatusResponse>(
        `${BASE}/generate/text/status/${encodeURIComponent(id)}`,
      )
      .pipe(catchError((err) => this.catchNotFound(err)));
  }

  public getAlchemyStatus(
    id: string,
  ): Observable<AlchemyStatusResponse | typeof GENERATION_NOT_FOUND | null> {
    return this.httpClient
      .get<AlchemyStatusResponse>(
        `${BASE}/interrogate/status/${encodeURIComponent(id)}`,
      )
      .pipe(catchError((err) => this.catchNotFound(err)));
  }

  private catchNotFound(
    err: unknown,
  ): Observable<typeof GENERATION_NOT_FOUND | null> {
    if (err instanceof HttpErrorResponse && err.status === 404) {
      return of(GENERATION_NOT_FOUND);
    }
    return of(null);
  }
}
