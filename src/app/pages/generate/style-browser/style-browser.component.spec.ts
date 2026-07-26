import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StyleBrowserComponent,
  isMatureStyle,
} from './style-browser.component';
import {
  DEFAULT_GENERATE_FORM_VALUE,
  GenerateFormGroup,
  StylePickerGroup,
  createGenerateForm,
} from '../generate-form.model';
import { StyleUsageService } from '../../../services/style-usage.service';

const PREVIEWS_URL =
  'https://raw.githubusercontent.com/amiantos/AI-Horde-Styles-Previews/main/previews.json';
const HASHES_URL =
  'https://raw.githubusercontent.com/amiantos/AI-Horde-Styles-Previews/main/hashes.json';

const GROUPS: StylePickerGroup[] = [
  { category: 'featured', names: ['Cinematic', 'Anime'] },
  { category: 'artistic', names: ['Watercolor'] },
];

/** Adds a mature-by-name style and a third category, for the filter tests. */
const GROUPS_WITH_MATURE: StylePickerGroup[] = [
  ...GROUPS,
  { category: 'horrors', names: ['dreadhorror'] },
];

const PREVIEWS = {
  Cinematic: {
    person: 'https://img/cine-person.webp',
    place: 'https://img/cine-place.webp',
    thing: 'https://img/cine-thing.webp',
  },
  Anime: { thing: 'https://img/anime-thing.webp' },
  dreadhorror: { person: 'https://img/dread-person.webp' },
};

/** A remembered fullscreen preference, for the restore-on-open tests. */
const FULL_PREF = { 'aihorde.generate.style_browser_fullscreen': true };

interface Harness {
  fixture: ComponentFixture<StyleBrowserComponent>;
  component: StyleBrowserComponent;
  form: GenerateFormGroup;
  el: HTMLElement;
  closeCount: () => number;
  usage: StyleUsageService;
}

async function createBrowser(
  options: {
    styleName?: string;
    usage?: Record<string, number>;
    groups?: StylePickerGroup[];
    /** Remembered browser preferences, seeded after the storage reset. */
    prefs?: Record<string, unknown>;
  } = {},
): Promise<Harness> {
  TestBed.resetTestingModule();
  // Each harness starts cold, so the previews fetch is always exercised rather
  // than served from a sibling test's stale-while-revalidate cache.
  localStorage.clear();
  for (const [key, value] of Object.entries(options.prefs ?? {})) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  await TestBed.configureTestingModule({
    imports: [
      StyleBrowserComponent,
      TranslocoTestingModule.forRoot({
        langs: { en: {} },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();

  const usage = TestBed.inject(StyleUsageService);
  for (const [name, count] of Object.entries(options.usage ?? {})) {
    for (let index = 0; index < count; index++) {
      usage.increment(name);
    }
  }

  const fixture = TestBed.createComponent(StyleBrowserComponent);
  const form = createGenerateForm({
    ...DEFAULT_GENERATE_FORM_VALUE,
    styleName: options.styleName ?? '',
  });
  fixture.componentRef.setInput('form', form);
  fixture.componentRef.setInput('styleGroups', options.groups ?? GROUPS);

  let closed = 0;
  fixture.componentInstance.closed.subscribe(() => closed++);
  fixture.detectChanges();

  // The previews fetch is lazy and fires from ngOnInit; answer it so cards can
  // show real images.
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(HASHES_URL).flush({ v: 1 });
  http.expectOne(PREVIEWS_URL).flush(PREVIEWS);
  fixture.detectChanges();

  return {
    fixture,
    component: fixture.componentInstance,
    form,
    el: fixture.nativeElement,
    closeCount: () => closed,
    usage,
  };
}

const cardNames = (el: HTMLElement): string[] =>
  [...el.querySelectorAll('.gs-sb-card .gs-sb-name')].map((node) =>
    (node.textContent ?? '').trim(),
  );

describe('StyleBrowserComponent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders one section per curated category and no most-used strip', async () => {
    const { el } = await createBrowser();
    const titles = [...el.querySelectorAll('.gs-sb-section-title')].map(
      (node) => (node.textContent ?? '').trim(),
    );
    expect(titles).toEqual(['featured', 'artistic']);
    expect(cardNames(el)).toEqual(['Cinematic', 'Anime', 'Watercolor']);
  });

  it('pins a most-used strip above the categories when there is history', async () => {
    const { el } = await createBrowser({
      usage: { Anime: 3, Watercolor: 1, Retired: 9 },
    });
    const sections = [...el.querySelectorAll('.gs-sb-section')];
    // The strip leads, and a style no longer in the catalogue is left out.
    expect(
      [...sections[0].querySelectorAll('.gs-sb-name')].map((node) =>
        (node.textContent ?? '').trim(),
      ),
    ).toEqual(['Anime', 'Watercolor']);
    expect(sections.length).toBe(3);
  });

  it('shows a usage badge only for used styles', async () => {
    const { el } = await createBrowser({ usage: { Anime: 2 } });
    expect(el.querySelectorAll('.gs-sb-badge').length).toBeGreaterThan(0);
    const anime = [...el.querySelectorAll('.gs-sb-card')].find((card) =>
      (card.textContent ?? '').includes('Anime'),
    );
    expect(anime?.querySelector('.gs-sb-badge')).not.toBeNull();
    const watercolor = [...el.querySelectorAll('.gs-sb-card')].find((card) =>
      (card.textContent ?? '').includes('Watercolor'),
    );
    expect(watercolor?.querySelector('.gs-sb-badge')).toBeNull();
  });

  it('filters by case-insensitive substring', async () => {
    const { component, fixture, el } = await createBrowser();
    component.setQuery('ciNE');
    fixture.detectChanges();
    expect(cardNames(el)).toEqual(['Cinematic']);

    component.setQuery('nothing here');
    fixture.detectChanges();
    expect(cardNames(el)).toEqual([]);
    expect(el.querySelector('.gs-modal-state')).not.toBeNull();
  });

  it('shows every available subject per card by default', async () => {
    const { component, el } = await createBrowser();
    expect(component.variant()).toBe('all');
    expect(component.isAllVariants()).toBe(true);

    const cards = [...el.querySelectorAll('.gs-sb-card')];
    // Cinematic has all three renders, Anime only one, Watercolor none.
    expect(cards.map((card) => card.querySelectorAll('img').length)).toEqual([
      3, 1, 0,
    ]);
    expect(el.querySelectorAll('.gs-sb-grid--all').length).toBe(2);
    for (const img of el.querySelectorAll('.gs-sb-thumb img')) {
      expect(img.getAttribute('loading')).toBe('lazy');
    }
  });

  it('switches every card to the chosen subject, falling back per style', async () => {
    const { component, fixture, el } = await createBrowser();
    const sources = (): (string | null)[] =>
      [...el.querySelectorAll<HTMLImageElement>('.gs-sb-thumb img')].map(
        (img) => img.getAttribute('src'),
      );

    component.setVariant('person');
    fixture.detectChanges();
    expect(sources()).toEqual([
      'https://img/cine-person.webp',
      // Anime only has a "thing" render, so it falls back to it.
      'https://img/anime-thing.webp',
    ]);

    component.setVariant('place');
    fixture.detectChanges();
    expect(sources()).toEqual([
      'https://img/cine-place.webp',
      'https://img/anime-thing.webp',
    ]);

    // A style with no preview at all renders the placeholder instead, and the
    // compact single-thumb grid is back.
    expect(el.querySelectorAll('.gs-sb-thumb-empty').length).toBe(1);
    expect(el.querySelectorAll('.gs-sb-grid--all').length).toBe(0);
  });

  it('lists a single flat most-used ordering in the used sort', async () => {
    const { component, fixture, el } = await createBrowser({
      usage: { Watercolor: 5, Anime: 2 },
    });
    component.setSort('used');
    fixture.detectChanges();

    expect(el.querySelectorAll('.gs-sb-section').length).toBe(0);
    expect(cardNames(el)).toEqual(['Watercolor', 'Anime', 'Cinematic']);
  });

  it('selects a style through the form control and closes', async () => {
    const { fixture, el, form, closeCount } = await createBrowser();
    const anime = [...el.querySelectorAll<HTMLButtonElement>('.gs-sb-card')][1];
    anime.click();
    fixture.detectChanges();

    expect(form.controls.styleName.value).toBe('Anime');
    expect(form.controls.styleName.dirty).toBe(true);
    expect(closeCount()).toBe(1);
  });

  it('marks the selected style card as active', async () => {
    const { el } = await createBrowser({ styleName: 'Watercolor' });
    const active = el.querySelectorAll('.gs-sb-card--active');
    expect(active.length).toBe(1);
    expect((active[0].textContent ?? '').includes('Watercolor')).toBe(true);
  });

  it('offers a clear-style button in the header only when a style is set', async () => {
    const none = await createBrowser();
    expect(none.el.querySelector('.gs-clear-style')).toBeNull();

    const picked = await createBrowser({ styleName: 'Cinematic' });
    const clear = picked.el.querySelector<HTMLButtonElement>('.gs-clear-style');
    expect(clear).not.toBeNull();
    clear!.click();
    picked.fixture.detectChanges();
    expect(picked.form.controls.styleName.value).toBe('');
    expect(picked.closeCount()).toBe(1);
  });

  it('closes on Escape and on a backdrop click', async () => {
    const { el, closeCount } = await createBrowser();
    const overlay = el.querySelector<HTMLElement>('.gs-modal-overlay')!;
    overlay.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(closeCount()).toBe(1);

    overlay.click();
    expect(closeCount()).toBe(2);
  });

  it('keeps working when previews cannot be loaded', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        StyleBrowserComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture = TestBed.createComponent(StyleBrowserComponent);
    fixture.componentRef.setInput(
      'form',
      createGenerateForm({ ...DEFAULT_GENERATE_FORM_VALUE }),
    );
    fixture.componentRef.setInput('styleGroups', GROUPS);
    fixture.detectChanges();

    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne(HASHES_URL)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'boom' });
    http
      .expectOne(PREVIEWS_URL)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'boom' });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(cardNames(el)).toEqual(['Cinematic', 'Anime', 'Watercolor']);
    // Every card falls back to the name-only placeholder.
    expect(el.querySelectorAll('.gs-sb-thumb-empty').length).toBe(3);
    expect(el.querySelectorAll('.gs-sb-thumb img').length).toBe(0);
    expect(el.querySelector('.gs-sb-note')).not.toBeNull();
  });

  describe('mature filter', () => {
    it('flags mature style names case-insensitively and leaves the rest alone', () => {
      for (const name of [
        'dreadhorror',
        'Nova Furry XL',
        'hentai_raw',
        'wai-nsfw-illustrious',
        'yiffy',
      ]) {
        expect(isMatureStyle(name)).toBe(true);
      }
      for (const name of ['Cinematic', 'Anime', 'Watercolor', 'steampunk']) {
        expect(isMatureStyle(name)).toBe(false);
      }
    });

    it('hides mature styles by default and restores them when toggled on', async () => {
      const { component, fixture, el } = await createBrowser({
        groups: GROUPS_WITH_MATURE,
      });
      expect(component.showMature()).toBe(false);
      expect(cardNames(el)).not.toContain('dreadhorror');
      // The category is left with nothing to show, so it drops out entirely.
      expect(
        [...el.querySelectorAll('.gs-sb-section-title')].map((node) =>
          (node.textContent ?? '').trim(),
        ),
      ).not.toContain('horrors');

      component.toggleMature();
      fixture.detectChanges();
      expect(cardNames(el)).toContain('dreadhorror');
      expect(
        localStorage.getItem('aihorde.generate.style_browser_mature'),
      ).toBe('true');
    });

    it('keeps mature styles out of the flat used ordering too', async () => {
      const { component, fixture, el } = await createBrowser({
        groups: GROUPS_WITH_MATURE,
        usage: { dreadhorror: 5 },
      });
      component.setSort('used');
      fixture.detectChanges();
      expect(cardNames(el)).not.toContain('dreadhorror');
      expect(component.visibleNames()).not.toContain('dreadhorror');
    });
  });

  describe('category search and contents', () => {
    it('matches on category name as well as style name', async () => {
      const { component, fixture, el } = await createBrowser();
      component.setQuery('artist');
      fixture.detectChanges();
      // "artistic" names no style, so only the category match can surface this.
      expect(cardNames(el)).toEqual(['Watercolor']);
    });

    it('lists only the categories that still have cards', async () => {
      const { component, fixture, el } = await createBrowser();
      const chips = (): string[] =>
        [...el.querySelectorAll('.gs-sb-toc-chip')].map((node) =>
          (node.textContent ?? '').trim(),
        );
      expect(chips()).toEqual(['featured', 'artistic']);

      component.setQuery('water');
      fixture.detectChanges();
      // One section left, so the contents row has nothing to navigate.
      expect(el.querySelector('.gs-sb-toc')).toBeNull();
    });

    it('scrolls to the section a contents chip names', async () => {
      const { el } = await createBrowser();
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;

      el.querySelectorAll<HTMLButtonElement>('.gs-sb-toc-chip')[1].click();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(
        el.querySelector('#gs-sb-sec-artistic .gs-sb-section-title')
          ?.textContent,
      ).toContain('artistic');
    });

    it('drops the contents row in the flat used sort', async () => {
      const { component, fixture, el } = await createBrowser();
      component.setSort('used');
      fixture.detectChanges();
      expect(el.querySelector('.gs-sb-toc')).toBeNull();
    });
  });

  describe('control bar layout', () => {
    it('orders the controls search, mature, subject, sort', async () => {
      const { el } = await createBrowser();
      const bar = el.querySelector('.gs-sb-bar')!;
      // Source order is the mobile stacking order too, so one check covers both
      // breakpoints; only the desktop bar's wrapping differs.
      const classes = [...bar.children].map((node) => node.className);
      expect(classes).toEqual([
        expect.stringContaining('gs-sb-fold'),
        expect.stringContaining('gs-modal-search'),
        expect.stringContaining('gs-sb-mature'),
        expect.stringContaining('gs-sb-variant'),
        expect.stringContaining('gs-sb-sort'),
      ]);
    });
  });

  describe('fullscreen', () => {
    it('toggles the panel and overlay classes and remembers the choice', async () => {
      const { component, fixture, el } = await createBrowser();
      const toggle = el.querySelector<HTMLButtonElement>('.gs-sb-full')!;
      expect(component.fullscreen()).toBe(false);
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
      expect(el.querySelector('.gs-modal-panel--browser-full')).toBeNull();

      toggle.click();
      fixture.detectChanges();
      expect(el.querySelector('.gs-modal-panel--browser-full')).not.toBeNull();
      expect(el.querySelector('.gs-modal-overlay--full')).not.toBeNull();
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
      expect(
        localStorage.getItem('aihorde.generate.style_browser_fullscreen'),
      ).toBe('true');

      toggle.click();
      fixture.detectChanges();
      expect(el.querySelector('.gs-modal-panel--browser-full')).toBeNull();
    });

    it('restores the remembered choice on the next open', async () => {
      const { component, el } = await createBrowser({ prefs: FULL_PREF });
      expect(component.fullscreen()).toBe(true);
      expect(el.querySelector('.gs-modal-panel--browser-full')).not.toBeNull();
    });

    it('adds no Escape layer: Escape still closes the browser', async () => {
      const { el, closeCount, component } = await createBrowser({
        prefs: FULL_PREF,
      });
      el.querySelector<HTMLElement>('.gs-modal-overlay')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      expect(closeCount()).toBe(1);
      // The size choice survives: it is not something Escape unwound.
      expect(component.fullscreen()).toBe(true);
    });
  });

  describe('enlarged preview', () => {
    const openFirst = (harness: Harness): void => {
      harness.el.querySelector<HTMLButtonElement>('.gs-sb-expand')?.click();
      harness.fixture.detectChanges();
    };

    it('offers an expand button only on cards that have a preview', async () => {
      const { el } = await createBrowser();
      // Watercolor has no render at all, so it has nothing to enlarge.
      expect(el.querySelectorAll('.gs-sb-expand').length).toBe(2);
    });

    it('opens the enlarged layer without selecting the style', async () => {
      const harness = await createBrowser();
      openFirst(harness);

      expect(harness.el.querySelector('.gs-sb-viewer')).not.toBeNull();
      expect(
        harness.el.querySelector<HTMLImageElement>('.gs-sb-viewer-img')?.src,
      ).toBe('https://img/cine-person.webp');
      expect(harness.form.controls.styleName.value).toBe('');
      expect(harness.closeCount()).toBe(0);
    });

    it('steps through the visible order with the arrow keys, wrapping', async () => {
      const harness = await createBrowser();
      openFirst(harness);
      const name = (): string =>
        (
          harness.el.querySelector('.gs-sb-viewer-name')?.textContent ?? ''
        ).trim();
      expect(name()).toBe('Cinematic');

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight' }),
      );
      harness.fixture.detectChanges();
      expect(name()).toBe('Anime');

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft' }),
      );
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft' }),
      );
      harness.fixture.detectChanges();
      expect(name()).toBe('Watercolor');
    });

    it('switches subject inside the layer without moving the grid', async () => {
      const harness = await createBrowser();
      openFirst(harness);
      harness.component.setExpandedVariant('place');
      harness.fixture.detectChanges();

      expect(
        harness.el.querySelector<HTMLImageElement>('.gs-sb-viewer-img')?.src,
      ).toBe('https://img/cine-place.webp');
      // The grid behind is untouched: it is still showing every subject.
      expect(harness.component.variant()).toBe('all');
    });

    it('closes only the enlarged layer on Escape', async () => {
      const harness = await createBrowser();
      openFirst(harness);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      harness.fixture.detectChanges();
      expect(harness.el.querySelector('.gs-sb-viewer')).toBeNull();
      expect(
        harness.el.querySelector('.gs-modal-panel--browser'),
      ).not.toBeNull();
      expect(harness.closeCount()).toBe(0);
    });

    it('selects the style from the enlarged layer and closes the browser', async () => {
      const harness = await createBrowser();
      openFirst(harness);
      harness.el.querySelector<HTMLButtonElement>('.gs-sb-viewer-use')!.click();
      harness.fixture.detectChanges();

      expect(harness.form.controls.styleName.value).toBe('Cinematic');
      expect(harness.closeCount()).toBe(1);
    });
  });
});
