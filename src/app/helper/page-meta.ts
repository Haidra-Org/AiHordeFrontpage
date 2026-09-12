import { DOCUMENT } from '@angular/common';
import { DestroyRef, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { combineLatest } from 'rxjs';
import { environment } from '../../environments/environment';
import { siteCardUrl } from '../content/share-cards';
import { TranslatorService } from '../services/translator.service';

/** A key that may be fixed for the page, or read from what the page is showing. */
type MetaKey = string | (() => string | null);

/** What a page says about itself, in the browser and to everything else. */
export interface PageMeta {
  /** Key of the page's own name, shown in the tab and in a link preview. */
  titleKey: MetaKey;
  /** Key of the sentence a search result or a link preview shows. */
  descriptionKey: MetaKey;
  /** Interpolations for either, where they name something. */
  params?: Record<string, unknown> | (() => Record<string, unknown>);
  /**
   * Absolute address of the picture a link preview shows. A page with a
   * picture of its own names it here; every other page shows the site's card.
   */
  image?: MetaKey;
  /**
   * Whether the document title is this call's to set. A page whose title says
   * something live, such as a studio counting its running work, keeps its own
   * title writer and asks only for the description, canonical and card here.
   */
  ownsTitle?: boolean;
}

function read(key: MetaKey): string | null {
  return typeof key === 'string' ? key : key();
}

/**
 * Say what a page is, both to a reader looking at a tab and to a reader who has
 * not opened it: the document title, the description a search result shows, the
 * canonical URL a shared link should collapse to, and the Open Graph pair a
 * preview card is built from.
 *
 * A page written to be linked to from outside needs all four, and needs them to
 * agree, so they are set together rather than a title here and a description
 * there. Keys may be fixed or read from what the page is currently showing; a
 * page whose subject comes out of the URL passes accessors and this re-runs when
 * they change.
 *
 * The canonical origin comes from configuration rather than from the document,
 * because at build time the document's origin is the prerender server's and
 * baking that into published HTML would point every canonical at localhost.
 */
export function setPageMeta(meta: PageMeta): void {
  const translator = inject(TranslatorService);
  const destroyRef = inject(DestroyRef);
  const title = inject(Title);
  const tags = inject(Meta);
  const document = inject(DOCUMENT);
  const router = inject(Router);

  effect(() => {
    const titleKey = read(meta.titleKey);
    const descriptionKey = read(meta.descriptionKey);
    const params =
      typeof meta.params === 'function' ? meta.params() : meta.params;
    if (!titleKey || !descriptionKey) {
      return;
    }

    combineLatest([
      translator.get(titleKey, params),
      translator.get(descriptionKey, params),
      translator.get('app_title'),
    ])
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(([pageTitle, description, appTitle]) => {
        if (meta.ownsTitle !== false) {
          title.setTitle(`${pageTitle} | ${appTitle}`);
        }
        tags.updateTag({ name: 'description', content: description });
        tags.updateTag({ property: 'og:title', content: pageTitle });
        tags.updateTag({ property: 'og:description', content: description });
      });

    // The URL without its query or fragment: two links to the same page that
    // differ only in how the reader arrived are one page.
    const path = router.url.split('?', 1).at(0)?.split('#', 1).at(0) ?? '';
    const canonical = `${environment.siteUrl}${path}`;
    tags.updateTag({ property: 'og:url', content: canonical });
    tags.updateTag({ property: 'og:type', content: 'article' });

    // The card is what a shared link shows before anyone opens it, so a page
    // whose subject comes out of the URL re-reads it with the rest.
    const image = (meta.image ? read(meta.image) : null) ?? siteCardUrl();
    tags.updateTag({ property: 'og:image', content: image });
    tags.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    tags.updateTag({ name: 'twitter:image', content: image });

    const head = document.head;
    if (!head) {
      return;
    }
    const existing = head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    const link = existing ?? document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', canonical);
    if (!existing) {
      head.appendChild(link);
    }
  });
}
