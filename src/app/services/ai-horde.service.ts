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
import {
  HtmlHordeDocument,
  MarkdownHordeDocument,
} from '../types/horde-document';
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
  SubmitTextGenerationResult,
  TextGenerationDryRunResponse,
  TextGenerationRequest,
  TextGenerationResponse,
  TextGenerationStatusResponse,
  AlchemyStatusResponse,
  InterrogationRequest,
  InterrogationResponse,
  GENERATION_NOT_FOUND,
  SubmitImageResult,
  SubmitInterrogationResult,
  CheckImageResult,
  CheckTextResult,
  HordeApiError,
} from '../types/generation';
import { extractApiErrorField } from '../helper/extract-api-error';
import { HordeApiCacheService, CacheTTL } from './horde-api-cache.service';
import { CLIENT_AGENT } from './interceptors/client-agent.interceptor';
import { API_BASE_URL } from './api-config';

@Injectable({
  providedIn: 'root',
})
export class AiHordeService {
  private readonly httpClient = inject(HttpClient);
  private readonly cache = inject(HordeApiCacheService);
  private readonly baseUrl = inject(API_BASE_URL);

  public get imageStats(): Observable<ImageTotalStats> {
    return this.cache.cachedGet<ImageTotalStats>(
      `${this.baseUrl}/stats/img/totals`,
      undefined,
      {
        ttl: CacheTTL.LONG,
        category: 'stats',
      },
    );
  }

  public get textStats(): Observable<TextTotalStats> {
    return this.cache.cachedGet<TextTotalStats>(
      `${this.baseUrl}/stats/text/totals`,
      undefined,
      {
        ttl: CacheTTL.LONG,
        category: 'stats',
      },
    );
  }

  public get performance(): Observable<HordePerformance> {
    return this.cache.cachedGet<HordePerformance>(
      `${this.baseUrl}/status/performance`,
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
        `${this.baseUrl}/documents/terms?format=html`,
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
        `${this.baseUrl}/documents/privacy?format=html`,
        undefined,
        {
          ttl: CacheTTL.VERY_LONG,
          category: 'documents',
        },
      )
      .pipe(map((response) => response.html));
  }

  /**
   * The sponsors document in markdown rather than html: the page reads it into
   * its own parts, so it wants the source the document is written in.
   */
  public get sponsorsDocument(): Observable<string> {
    return this.cache
      .cachedGet<MarkdownHordeDocument>(
        `${this.baseUrl}/documents/sponsors?format=markdown`,
        undefined,
        {
          ttl: CacheTTL.VERY_LONG,
          category: 'documents',
        },
      )
      .pipe(map((response) => response.markdown));
  }

  public getNews(count?: number): Observable<NewsItem[]> {
    return this.cache
      .cachedGet<
        HordeNewsItem[]
      >(`${this.baseUrl}/status/news`, undefined, { ttl: CacheTTL.VERY_LONG, category: 'news' })
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
              moreLink: newsItem.more_info_urls?.at(0) ?? null,
            };
          });
        }),
      );
  }
  public getUserByApiKey(apiKey: string): Observable<HordeUser | null> {
    return this.cache
      .cachedGet<HordeUser>(
        `${this.baseUrl}/find_user`,
        { headers: { apikey: apiKey } },
        { ttl: CacheTTL.MEDIUM, category: 'user' },
      )
      .pipe(catchError(() => of(null)));
  }

  public getSelfUserByApiKeyUncached(
    apiKey: string,
  ): Observable<HordeUser | null> {
    return this.httpClient
      .get<HordeUser>(`${this.baseUrl}/find_user`, {
        headers: { apikey: apiKey },
      })
      .pipe(catchError(() => of(null)));
  }

  public getUserById(id: number): Observable<HordeUser | null> {
    return this.cache
      .cachedGet<HordeUser>(`${this.baseUrl}/users/${id}`, undefined, {
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
        `${this.baseUrl}/users/${userId}`,
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
        `${this.baseUrl}/kudos/transfer`,
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

    return zip(userIds.map((userId) => this.getUserById(userId))).pipe(
      map((users) => users.filter((user): user is HordeUser => user !== null)),
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
      `${this.baseUrl}/status/models?type=${type}&model_state=${modelState}`,
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
      `${this.baseUrl}/stats/img/models?model_state=${modelState}`,
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
      `${this.baseUrl}/stats/text/models`,
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
      >(`${this.baseUrl}/users?page=${page}&sort=kudos`, undefined, { ttl: CacheTTL.MEDIUM, category: 'leaderboard' })
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
      >(`${this.baseUrl}/users?page=${page}&sort=kudos`, undefined, { ttl: CacheTTL.MEDIUM, category: 'leaderboard' })
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

  private postGenerateAsync(
    apiKey: string,
    request: ImageGenerationRequest,
  ): Observable<ImageGenerationResponse> {
    return this.httpClient.post<ImageGenerationResponse>(
      `${this.baseUrl}/generate/async`,
      request,
      {
        headers: { apikey: apiKey },
        context: this.generateContext,
      },
    );
  }

  public submitImageGeneration(
    apiKey: string,
    request: ImageGenerationRequest,
  ): Observable<ImageGenerationResponse | null> {
    return this.postGenerateAsync(apiKey, request).pipe(
      catchError(() => of(null)),
    );
  }

  /**
   * Submit a generation, surfacing the HTTP status on failure. The queue engine
   * needs to distinguish a 429 (submit backoff) from a 4xx validation rejection
   * (permanent job error), which the `null`-collapsing method above cannot.
   */
  public submitImageGenerationResult(
    apiKey: string,
    request: ImageGenerationRequest,
  ): Observable<SubmitImageResult> {
    return this.postGenerateAsync(apiKey, request).pipe(
      map((response) => ({ kind: 'success' as const, response })),
      catchError((err: unknown) =>
        of({ kind: 'error' as const, error: this.toHordeApiError(err) }),
      ),
    );
  }

  private getCheck(id: string): Observable<GenerationCheckResponse> {
    return this.httpClient.get<GenerationCheckResponse>(
      `${this.baseUrl}/generate/check/${encodeURIComponent(id)}`,
    );
  }

  // Generation status checks are never cached — they need real-time data
  public checkImageGeneration(
    id: string,
  ): Observable<GenerationCheckResponse | typeof GENERATION_NOT_FOUND | null> {
    return this.getCheck(id).pipe(
      catchError((err: unknown) => this.catchNotFound(err)),
    );
  }

  /**
   * Poll a generation, surfacing whether the failure was a 404 (job expired) or
   * some other status (for example a 429 the engine should back off from).
   */
  public checkImageGenerationResult(id: string): Observable<CheckImageResult> {
    return this.getCheck(id).pipe(
      map((check) => ({ kind: 'success' as const, check })),
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 404) {
          return of({ kind: 'not_found' as const });
        }
        return of({ kind: 'error' as const, error: this.toHordeApiError(err) });
      }),
    );
  }

  /**
   * Cancel an in-flight generation. The horde returns the check payload with any
   * already-finished images preserved; a 404 means it was already gone.
   */
  public cancelImageGeneration(
    id: string,
  ): Observable<GenerationCheckResponse | typeof GENERATION_NOT_FOUND | null> {
    return this.httpClient
      .delete<GenerationCheckResponse>(
        `${this.baseUrl}/generate/status/${encodeURIComponent(id)}`,
      )
      .pipe(catchError((err: unknown) => this.catchNotFound(err)));
  }

  private toHordeApiError(err: unknown): HordeApiError {
    const status = err instanceof HttpErrorResponse ? err.status : 0;
    const message =
      extractApiErrorField(err, 'message') ??
      extractApiErrorField(err, 'detail') ??
      'Request failed';
    return { status, message, rc: extractApiErrorField(err, 'rc') };
  }

  public getImageGenerationStatus(
    id: string,
  ): Observable<GenerationStatusResponse | typeof GENERATION_NOT_FOUND | null> {
    return this.httpClient
      .get<GenerationStatusResponse>(
        `${this.baseUrl}/generate/status/${encodeURIComponent(id)}`,
      )
      .pipe(catchError((err: unknown) => this.catchNotFound(err)));
  }

  /**
   * Submit a text request, surfacing the horde's refusal on failure the way
   * an alchemy request does.
   */
  public submitTextGeneration(
    apiKey: string,
    request: TextGenerationRequest,
  ): Observable<SubmitTextGenerationResult> {
    return this.httpClient
      .post<TextGenerationResponse>(
        `${this.baseUrl}/generate/text/async`,
        request,
        {
          headers: { apikey: apiKey },
          context: this.generateContext,
        },
      )
      .pipe(
        map((response) => ({ kind: 'success' as const, response })),
        catchError((err: unknown) =>
          of({ kind: 'error' as const, error: this.toHordeApiError(err) }),
        ),
      );
  }

  /**
   * What a text request would cost, without queueing it. A refusal is answered
   * with no price rather than an error: the caller is showing a hint beside a
   * button, and has nothing useful to say about a rejected dry run.
   */
  public dryRunTextGeneration(
    apiKey: string,
    request: TextGenerationRequest,
  ): Observable<number | null> {
    return this.httpClient
      .post<TextGenerationDryRunResponse>(
        `${this.baseUrl}/generate/text/async`,
        { ...request, dry_run: true },
        {
          headers: { apikey: apiKey },
          context: this.generateContext,
        },
      )
      .pipe(
        map((response) =>
          typeof response?.kudos === 'number' ? response.kudos : null,
        ),
        catchError(() => of(null)),
      );
  }

  public getTextGenerationStatus(
    id: string,
  ): Observable<
    TextGenerationStatusResponse | typeof GENERATION_NOT_FOUND | null
  > {
    return this.httpClient
      .get<TextGenerationStatusResponse>(
        `${this.baseUrl}/generate/text/status/${encodeURIComponent(id)}`,
      )
      .pipe(catchError((err: unknown) => this.catchNotFound(err)));
  }

  /**
   * Poll a text request, surfacing whether the failure was a 404 (the request
   * expired) or some other status, such as a 429 the queue should back off from.
   */
  public checkTextGenerationResult(id: string): Observable<CheckTextResult> {
    return this.httpClient
      .get<TextGenerationStatusResponse>(
        `${this.baseUrl}/generate/text/status/${encodeURIComponent(id)}`,
      )
      .pipe(
        map((status) => ({ kind: 'success' as const, status })),
        catchError((err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 404) {
            return of({ kind: 'not_found' as const });
          }
          return of({
            kind: 'error' as const,
            error: this.toHordeApiError(err),
          });
        }),
      );
  }

  /**
   * Cancel a text request. The horde answers with the full status, every take
   * already written included; a 404 means it was already gone.
   */
  public cancelTextGeneration(
    id: string,
  ): Observable<
    TextGenerationStatusResponse | typeof GENERATION_NOT_FOUND | null
  > {
    return this.httpClient
      .delete<TextGenerationStatusResponse>(
        `${this.baseUrl}/generate/text/status/${encodeURIComponent(id)}`,
      )
      .pipe(catchError((err: unknown) => this.catchNotFound(err)));
  }

  /**
   * Submit an alchemy request, surfacing the horde's refusal on failure. The
   * refusal carries the return code and sentence the reader is shown, so a
   * request the horde would not take is not reported as a connection problem.
   */
  public submitInterrogation(
    apiKey: string,
    request: InterrogationRequest,
  ): Observable<SubmitInterrogationResult> {
    return this.httpClient
      .post<InterrogationResponse>(
        `${this.baseUrl}/interrogate/async`,
        request,
        {
          headers: { apikey: apiKey },
          context: this.generateContext,
        },
      )
      .pipe(
        map((response) => ({ kind: 'success' as const, response })),
        catchError((err: unknown) =>
          of({ kind: 'error' as const, error: this.toHordeApiError(err) }),
        ),
      );
  }

  public getAlchemyStatus(
    id: string,
  ): Observable<AlchemyStatusResponse | typeof GENERATION_NOT_FOUND | null> {
    return this.httpClient
      .get<AlchemyStatusResponse>(
        `${this.baseUrl}/interrogate/status/${encodeURIComponent(id)}`,
      )
      .pipe(catchError((err: unknown) => this.catchNotFound(err)));
  }

  // Cancelling returns the status with any already-completed forms preserved.
  public cancelInterrogation(
    id: string,
  ): Observable<AlchemyStatusResponse | typeof GENERATION_NOT_FOUND | null> {
    return this.httpClient
      .delete<AlchemyStatusResponse>(
        `${this.baseUrl}/interrogate/status/${encodeURIComponent(id)}`,
      )
      .pipe(catchError((err: unknown) => this.catchNotFound(err)));
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
