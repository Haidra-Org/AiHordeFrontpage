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
        const language = this.transloco.config.fallbackLang as string;
        if (this.loadedLanguages.includes(language)) {
          return of(void 0);
        }

        return this.transloco.load(language);
      }),
      tap((result) => {
        if (result === null) {
          return;
        }
        const language = this.transloco.config.fallbackLang as string;
        this.loadedLanguages.push(language);
      }),
      map(() => void 0),
    );
  }
}
