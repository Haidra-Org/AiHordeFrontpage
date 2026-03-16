import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { TranslocoHttpLoader } from './transloco-loader';
import { provideTransloco } from '@jsverse/transloco';
import { clientAgentInterceptor } from './services/interceptors/client-agent.interceptor';
import { rateLimitInterceptor } from './services/interceptors/rate-limit.interceptor';
import { IconRegistryService } from './services/icon-registry.service';
import { APP_ICONS } from './icons';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAppInitializer(() =>
      inject(IconRegistryService).registerAll(APP_ICONS),
    ),
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
    ),
    provideClientHydration(),
    provideHttpClient(
      withFetch(),
      withInterceptors([clientAgentInterceptor, rateLimitInterceptor]),
    ),
    provideTransloco({
      config: {
        availableLangs: ['en'],
        defaultLang: 'en',
        // Remove this option if your application doesn't support changing language in runtime.
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        fallbackLang: 'en',
      },
      loader: TranslocoHttpLoader,
    }),
  ],
};
