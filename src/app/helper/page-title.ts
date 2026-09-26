import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  PLATFORM_ID,
  Signal,
  effect,
  inject,
  untracked,
} from '@angular/core';
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
 * A studio's tab: what the page is called, and what it is doing. A generation
 * runs for minutes and the reader spends them in another tab, so the count of
 * jobs still to come back is on the tab itself, and what arrived while they
 * were away is waiting there when they look at the tab strip. Looking at the
 * page is the answer to that note, so it goes as soon as the tab is the one on
 * screen, and the studio's own name comes back.
 *
 * What arrived is counted in jobs by default. A studio whose jobs each come back
 * with several pictures passes `finished`, its running count of what came back,
 * and the note then counts what that count grew by while the tab was hidden.
 * That count can move apart from the running one: a studio that stores a
 * result's bytes after the job has settled raises it later, and one whose job
 * settles form by form raises it earlier. Growth while hidden is therefore held
 * until a job leaves the running set in the same absence, and counted straight
 * away after one has.
 *
 * Call from a constructor or field initializer, where injection is available.
 * The whole title is set here, so a page using this does not set one elsewhere.
 */
export function useStudioTitle(
  pageKey: string,
  pending: Signal<number>,
  finished?: Signal<number>,
): void {
  const translator = inject(TranslatorService);
  const title = inject(Title);
  const destroyRef = inject(DestroyRef);
  const document = inject(DOCUMENT);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  let names: { page: string; app: string } | null = null;
  /** How many came back while the reader was looking at something else. */
  let awayDone = 0;
  let lastPending = 0;
  let lastFinished: number | null = null;
  /** Growth in `finished` while hidden that no departing job has vouched for. */
  let heldFinished = 0;
  /** Whether a job has left the running set since the tab was hidden. */
  let departedAway = false;
  /** Which reading is the current one, so a slow one cannot overwrite it. */
  let reading = 0;

  const show = (key: string, params: Record<string, number>): void => {
    const mine = ++reading;
    translator
      .get(key, params)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((lead) => {
        if (names && mine === reading) {
          title.setTitle(`${lead} | ${names.app}`);
        }
      });
  };
  const render = (): void => {
    if (!names) {
      return;
    }
    const running = untracked(pending);
    if (running > 0) {
      show('studio.tab_generating', { count: running });
      return;
    }
    if (awayDone > 0) {
      show('studio.tab_done', { count: awayDone });
      return;
    }
    reading++;
    title.setTitle(`${names.page} | ${names.app}`);
  };

  combineLatest([translator.get(pageKey), translator.get('app_title')])
    .pipe(
      map(([page, app]) => ({ page, app })),
      takeUntilDestroyed(destroyRef),
    )
    .subscribe((read) => {
      names = read;
      render();
    });

  effect(() => {
    const running = pending();
    const came = finished?.();
    untracked(() => {
      // Only a job leaving the running set is an arrival. History loading
      // from storage also raises `finished`, usually alongside the running
      // count, and a deletion lowers it.
      const away = isBrowser && document.hidden;
      const arrived = away && running < lastPending;
      if (came === undefined) {
        if (arrived) {
          awayDone += lastPending - running;
        }
      } else {
        if (
          away &&
          running <= lastPending &&
          lastFinished !== null &&
          came > lastFinished
        ) {
          heldFinished += came - lastFinished;
        }
        if (arrived) {
          departedAway = true;
        }
        if (departedAway) {
          awayDone += heldFinished;
          heldFinished = 0;
        }
        lastFinished = came;
      }
      lastPending = running;
      render();
    });
  });

  if (isBrowser) {
    const onVisible = (): void => {
      if (document.hidden) {
        return;
      }
      awayDone = 0;
      heldFinished = 0;
      departedAway = false;
      render();
    };
    document.addEventListener('visibilitychange', onVisible);
    destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisible);
      // Whatever the studio was doing stops being this tab's business the
      // moment the reader leaves it, and the page they land on sets its own.
      awayDone = 0;
      heldFinished = 0;
      departedAway = false;
      lastPending = 0;
      lastFinished = null;
      if (names) {
        title.setTitle(`${names.page} | ${names.app}`);
      }
    });
  }
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
