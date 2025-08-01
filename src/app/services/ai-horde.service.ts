import {Injectable} from '@angular/core';
import {HttpClient} from "@angular/common/http";
import {catchError, map, Observable, of, zip} from "rxjs";
import {ImageTotalStats} from "../types/image-total-stats";
import {HordePerformance} from "../types/horde-performance";
import {TextTotalStats} from "../types/text-total-stats";
import {NewsItem} from "../types/news.types";
import {SingleInterrogationStatPoint} from "../types/single-interrogation-stat-point";
import {HtmlHordeDocument} from "../types/horde-document";
import {HordeNewsItem} from "../types/horde-news-item";
import {HordeUser} from "../types/horde-user";

@Injectable({
  providedIn: 'root'
})
export class AiHordeService {
  constructor(
    private readonly httpClient: HttpClient,
  ) {
  }

  public get imageStats(): Observable<ImageTotalStats> {
    // return of({
    //   month: { images: 105150339, ps: 1553239485353984 },
    //   total: { images: 105150339, ps: 1553239485353984 },
    //   day: { images: 105150339, ps: 1553239485353984 },
    //   hour: { images: 105150339, ps: 1553239485353984 },
    //   minute: { images: 105150339, ps: 1553239485353984 },
    // });
    return this.httpClient.get<ImageTotalStats>('https://aihorde.net/api/v2/stats/img/totals');
  }

  public get textStats(): Observable<TextTotalStats> {
    // return of({
    //   total: { requests: 111931745, tokens: 20444501084 },
    //   day: { requests: 111931745, tokens: 20444501084 },
    //   hour: { requests: 111931745, tokens: 20444501084 },
    //   minute: { requests: 111931745, tokens: 20444501084 },
    //   month: { requests: 111931745, tokens: 20444501084 },
    // });
    return this.httpClient.get<TextTotalStats>('https://aihorde.net/api/v2/stats/text/totals');
  }

  public get performance(): Observable<HordePerformance> {
    return this.httpClient.get<HordePerformance>('https://aihorde.net/api/v2/status/performance');
  }

  public get interrogationStats(): Observable<SingleInterrogationStatPoint> {
    return of({
      processed: 663723,
    });
  }

  public get terms(): Observable<string> {
    return this.httpClient.get<HtmlHordeDocument>('https://aihorde.net/api/v2/documents/terms?format=html').pipe(
      map(response => response.html),
    );
  }

  public get privacyPolicy(): Observable<string> {
    return this.httpClient.get<HtmlHordeDocument>('https://aihorde.net/api/v2/documents/privacy?format=html').pipe(
      map(response => response.html),
    );
  }

  public getNews(count?: number): Observable<NewsItem[]> {
      return this.httpClient.get<HordeNewsItem[]>('https://aihorde.net/api/v2/status/news').pipe(
        map(newsItems => count ? newsItems.slice(0, count) : newsItems),
        map(newsItems => {
          const titleMap = new Map<string, number>();
          return newsItems.map(newsItem => {
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
              moreLink: newsItem.more_info_urls.length > 0 ? newsItem.more_info_urls[0] : null,
            };
          });
        }),
      );
    }
  public getUserByApiKey(apiKey: string): Observable<HordeUser | null> {
    return this.httpClient.get<HordeUser>('https://aihorde.net/api/v2/find_user', {
      headers: {
        apikey: apiKey,
      }
    }).pipe(
      catchError(() => of(null)),
    );
  }

  public getUserById(id: number): Observable<HordeUser | null> {
    return this.httpClient.get<HordeUser>(`https://aihorde.net/api/v2/users/${id}`).pipe(
      catchError(() => of(null)),
    );
  }

  public transferKudos(apiKey: string, targetUser: string, amount: number): Observable<boolean> {
    return this.httpClient.post<any>('https://aihorde.net/api/v2/kudos/transfer', {
      username: targetUser,
      amount: amount,
    }, {
      headers: {
        apikey: apiKey,
      },
    }).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }

  public getEducatorAccounts(): Observable<HordeUser[]> {
    // todo once filtering is available, filter it on the api, this is only temporary solution
    const userIds = [258170];

    return zip(
      userIds.map(userId => this.getUserById(userId).pipe(
        map(user => user!),
      ))
    )
  }
}
