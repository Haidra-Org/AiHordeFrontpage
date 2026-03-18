import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, map, Observable, throwError } from 'rxjs';
import { FaqItem } from '../types/faq-item';
import { TranslocoService } from '@jsverse/transloco';
import { ToolItem } from '../types/tool-item';
import { SortedItems } from '../types/sorted-items';
import { PrivacyPolicyItem } from '../types/privacy-policy-item';
import { GuiItem } from '../types/gui-item';
import { replaceContext } from '../helper/context-replacer';
import { HordeApiCacheService, CacheTTL } from './horde-api-cache.service';

type ObjectWithMappableKey<
  TObject,
  TKey extends keyof TObject,
> = TObject[TKey] extends string | null | string[] ? TObject : never;

@Injectable({
  providedIn: 'root',
})
export class DataService {
  private readonly httpClient = inject(HttpClient);
  private readonly transloco = inject(TranslocoService);
  private readonly cache = inject(HordeApiCacheService);

  public get faq(): Observable<SortedItems<FaqItem>> {
    return this.getData<FaqItem>('faq').pipe(
      map((faq) => this.formatToMapped(faq, 'section')),
    );
  }

  public get tools(): Observable<SortedItems<ToolItem>> {
    return this.getData<ToolItem>('tools').pipe(
      map((tools) => this.formatToMapped(tools, 'categories')),
    );
  }

  public get imageGuis(): Observable<SortedItems<GuiItem>> {
    return this.getData<GuiItem>('image-guis').pipe(
      map((items) =>
        items.map((item) =>
          replaceContext(item, ['description', 'downloadButtonText']),
        ),
      ),
      map((items) => this.formatToMapped(items, 'categories')),
    );
  }

  public get textGuis(): Observable<SortedItems<GuiItem>> {
    return this.getData<GuiItem>('text-guis').pipe(
      map((items) =>
        items.map((item) =>
          replaceContext(item, ['description', 'downloadButtonText']),
        ),
      ),
      map((items) => this.formatToMapped(items, 'categories')),
    );
  }

  public get resources(): Observable<SortedItems<GuiItem>> {
    return this.getData<GuiItem>('resource').pipe(
      map((items) =>
        items.map((item) =>
          replaceContext(item, ['description', 'downloadButtonText']),
        ),
      ),
      map((items) => this.formatToMapped(items, 'categories')),
    );
  }

  public get privacyPolicy(): Observable<
    Map<string, Map<string, PrivacyPolicyItem[]>>
  > {
    return this.getData<PrivacyPolicyItem>('privacy').pipe(
      map((items) => {
        const sorted = this.formatToMapped(items, 'section');
        const result: Map<string, Map<string, PrivacyPolicyItem[]>> = new Map<
          string,
          Map<string, PrivacyPolicyItem[]>
        >();

        // todo move to context replacer function
        sorted.forEach((value, key) => {
          const subSorted = this.formatToMapped(
            value.map((item) => {
              const copy = { ...item };
              if (copy.context !== undefined) {
                for (const key of Object.keys(copy.context)) {
                  const contextItem = copy.context[key];
                  let targetContextValue: string;
                  switch (contextItem.valueType) {
                    case 'date':
                      targetContextValue = new Intl.DateTimeFormat(
                        this.transloco.getActiveLang(),
                        {
                          dateStyle: 'long',
                          timeStyle: undefined,
                        },
                      ).format(new Date(contextItem.value));
                      break;
                    default:
                      throw new Error(
                        `Unsupported type: ${String(contextItem.valueType)}`,
                      );
                  }

                  copy.text = copy.text.replaceAll(
                    `{${key}}`,
                    targetContextValue,
                  );
                }
              }
              return copy;
            }),
            'subsection',
          );
          result.set(key, subSorted);
        });

        return result;
      }),
    );
  }

  private formatToMapped<TObject, TKey extends keyof TObject>(
    objects: ObjectWithMappableKey<TObject, TKey>[],
    key: TKey,
  ): SortedItems<TObject> {
    const result: SortedItems<TObject> = new Map<string, TObject[]>();
    for (const object of objects) {
      let targetSortingValues = object[key] as string | string[] | null;
      if (targetSortingValues === null) {
        targetSortingValues = [''];
      }
      if (!Array.isArray(targetSortingValues)) {
        targetSortingValues = [targetSortingValues];
      }

      for (const targetSortingValue of targetSortingValues) {
        if (!result.has(targetSortingValue)) {
          result.set(targetSortingValue, []);
        }
        result.get(targetSortingValue)!.push(object);
      }
    }

    return result;
  }

  private getData<T>(file: string): Observable<T[]> {
    const lang = this.transloco.getActiveLang();
    const primaryUrl = `/assets/data/${file}.${lang}.json`;
    return this.cache
      .cachedGet<
        T[]
      >(primaryUrl, {}, { ttl: CacheTTL.VERY_LONG, category: 'local-data' })
      .pipe(
        catchError((e: unknown) => {
          if (e instanceof HttpErrorResponse && e.status !== 404) {
            return throwError(() => e);
          }
          if (!(e instanceof HttpErrorResponse)) {
            return throwError(() => e);
          }

          return this.cache.cachedGet<T[]>(
            `/assets/data/${file}.en.json`,
            {},
            { ttl: CacheTTL.VERY_LONG, category: 'local-data' },
          );
        }),
      );
  }
}
