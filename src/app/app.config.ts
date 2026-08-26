import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import {
  provideClientHydration,
  withEventReplay,
} from '@angular/platform-browser';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TranslocoHttpLoader } from './transloco-loader';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { clientAgentInterceptor } from './services/interceptors/client-agent.interceptor';
import { rateLimitInterceptor } from './services/interceptors/rate-limit.interceptor';
import { IconRegistryService } from './services/icon-registry.service';
import { APP_ICONS } from './icons';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAppInitializer(() =>
      inject(IconRegistryService).registerAll(APP_ICONS),
    ),
    provideAppInitializer(() => {
      // Some pages read copy imperatively with translate() while building their
      // view, which only answers once the language file has resolved. Loading it
      // before the first render keeps those calls truthful; without it the
      // server renders the keys as missing and the text only appears on
      // hydration, so the prerendered HTML ships without them. A failed
      // fetch still lets the app boot: untranslated keys beat a blank page.
      const transloco = inject(TranslocoService);
      return firstValueFrom(transloco.load(transloco.getDefaultLang())).catch(
        () => undefined,
      );
    }),
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
    ),
    provideClientHydration(withEventReplay()),
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
