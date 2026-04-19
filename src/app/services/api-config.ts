import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiBaseUrl,
});

export const RATINGS_API_BASE_URL = new InjectionToken<string>(
  'RATINGS_API_BASE_URL',
  {
    providedIn: 'root',
    factory: () => environment.ratingsApiBaseUrl,
  },
);
