import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';
import {
  DatasetImagePopResponse,
  RatePostInput,
  RatePostResponse,
} from '../types/ratings';

const RATINGS_API = 'https://ratings.aihorde.net/api/v1';
const ANON_API_KEY = '0000000000';

@Injectable({ providedIn: 'root' })
export class RatingsApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private getApiKey(): string {
    return this.auth.getStoredApiKey() ?? ANON_API_KEY;
  }

  getNewImage(): Observable<DatasetImagePopResponse> {
    return this.http.get<DatasetImagePopResponse>(`${RATINGS_API}/rating/new`, {
      headers: { apikey: this.getApiKey() },
    });
  }

  submitRating(
    imageId: string,
    rating: number,
    artifacts: number,
  ): Observable<RatePostResponse> {
    const body: RatePostInput = { rating, artifacts };
    return this.http.post<RatePostResponse>(
      `${RATINGS_API}/rating/${encodeURIComponent(imageId)}`,
      body,
      { headers: { apikey: this.getApiKey() } },
    );
  }
}
