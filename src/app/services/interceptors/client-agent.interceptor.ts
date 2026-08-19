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

  /* Exact host match only. A substring test would tag every other host under
     the same domain, such as the evidence library on a sibling subdomain, and
     the extra header turns a plain cross-origin GET into one that needs a
     preflight the other host does not answer. */
  if (requestHost(req.url) !== apiHost) {
    return next(req);
  }

  const agent = req.context.get(CLIENT_AGENT);
  const patched = req.clone({
    setHeaders: { 'Client-Agent': agent },
  });
  return next(patched);
};

/** The hostname of an absolute URL, or null for a relative one. */
function requestHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
