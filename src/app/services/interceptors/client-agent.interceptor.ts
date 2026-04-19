import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_BASE_URL } from '../api-config';

/**
 * Set this context token on individual requests to override the default
 * Client-Agent value (e.g. 'AiHordeFrontpage:generate').
 */
export const CLIENT_AGENT = new HttpContextToken<string>(
  () => 'AiHordeFrontpage:web',
);

export const clientAgentInterceptor: HttpInterceptorFn = (req, next) => {
  const apiHost = new URL(inject(API_BASE_URL)).hostname;

  if (!req.url.includes(apiHost)) {
    return next(req);
  }

  const agent = req.context.get(CLIENT_AGENT);
  const patched = req.clone({
    setHeaders: { 'Client-Agent': agent },
  });
  return next(patched);
};
