import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Set this context token on individual requests to override the default
 * Client-Agent value (e.g. 'AiHordeFrontpage:generate').
 */
export const CLIENT_AGENT = new HttpContextToken<string>(
  () => 'AiHordeFrontpage:web',
);

const HORDE_API_HOST = new URL(environment.apiBaseUrl).hostname;

export const clientAgentInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes(HORDE_API_HOST)) {
    return next(req);
  }

  const agent = req.context.get(CLIENT_AGENT);
  const patched = req.clone({
    setHeaders: { 'Client-Agent': agent },
  });
  return next(patched);
};
