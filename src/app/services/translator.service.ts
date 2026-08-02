import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { map, Observable, of, switchMap, tap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class TranslatorService {
  private loadedLanguages: string[] = [];

  private readonly transloco = inject(TranslocoService);

  public get(
    key: string,
    params?: Record<string, unknown>,
  ): Observable<string> {
    return this.loadCurrentLanguage().pipe(
      map(() => this.transloco.translate(key, params)),
    );
  }

  /** The configured fallback language, or null where none is configured. */
  private fallbackLanguage(): string | null {
    const language = this.transloco.config.fallbackLang;
    return typeof language === 'string' && language !== '' ? language : null;
  }

  private loadCurrentLanguage(): Observable<void> {
    return of(void 0).pipe(
      switchMap(() => {
        const language = this.transloco.getActiveLang();
        if (this.loadedLanguages.includes(language)) {
          return of(null);
        }

        return this.transloco.load(language);
      }),
      tap((result) => {
        if (result === null) {
          return;
        }
        const language = this.transloco.getActiveLang();
        this.loadedLanguages.push(language);
      }),
      switchMap(() => {
        // The fallback is configuration and may simply not be set, which a test
        // harness in particular often leaves out. Asking transloco to load
        // `undefined` throws from inside its scope resolution, so the absence is
        // read as "there is no fallback to load" rather than cast away.
        const language = this.fallbackLanguage();
        if (language === null || this.loadedLanguages.includes(language)) {
          return of(void 0);
        }

        return this.transloco.load(language);
      }),
      tap((result) => {
        const language = this.fallbackLanguage();
        if (result === null || language === null) {
          return;
        }
        this.loadedLanguages.push(language);
      }),
      map(() => void 0),
    );
  }
}
