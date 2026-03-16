import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { combineLatest, map } from 'rxjs';
import { TranslatorService } from '../services/translator.service';

/**
 * Sets the page title in the format "Page Title | App Title",
 * with cleanup tied to the component's lifecycle via DestroyRef.
 */
export function setPageTitle(
  translator: TranslatorService,
  title: Title,
  destroyRef: DestroyRef,
  pageKey: string,
  separator = ' | ',
): void {
  combineLatest([translator.get(pageKey), translator.get('app_title')])
    .pipe(
      map(([page, app]) => `${page}${separator}${app}`),
      takeUntilDestroyed(destroyRef),
    )
    .subscribe((t) => title.setTitle(t));
}

/**
 * Sets the page title to just the app title (for the homepage).
 */
export function setAppTitle(
  translator: TranslatorService,
  title: Title,
  destroyRef: DestroyRef,
): void {
  translator
    .get('app_title')
    .pipe(takeUntilDestroyed(destroyRef))
    .subscribe((t) => title.setTitle(t));
}
