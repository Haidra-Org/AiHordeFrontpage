import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { By } from '@angular/platform-browser';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollLockService } from '../../../helper/scroll-lock';
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

/** Stands in for the shared page lock, so the holds can be counted. */
const scrollLock = { acquire: vi.fn(), release: vi.fn() };

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
  scrollLock.acquire.mockClear();
  scrollLock.release.mockClear();
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
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ScrollLockService, useValue: scrollLock },
    ],
  }).compileComponents();

  const usage = TestBed.inject(StyleUsageService);
  // The options name presets, which is what these tests are about; the browser
  // keys everything by source, so the names are qualified on the way in.
  for (const [name, count] of Object.entries(options.usage ?? {})) {
    for (let index = 0; index < count; index++) {
      usage.increment(`curated:${name}`);
    }
  }

  const fixture = TestBed.createComponent(StyleBrowserComponent);
  const form = createGenerateForm({
    ...DEFAULT_GENERATE_FORM_VALUE,
    styleName: options.styleName ? `curated:${options.styleName}` : '',
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

/** A pointer event jsdom can build, with the fields the swipe maths reads. */
const pointer = (type: string, clientY: number, clientX = 100): PointerEvent =>
  new MouseEvent(type, {
    clientX,
    clientY,
    bubbles: true,
  }) as unknown as PointerEvent;

/** Drag the control dock from `from` to `to`, as a finger would. */
const swipeDock = (el: HTMLElement, from: number, to: number): void => {
  const bar = el.querySelector<HTMLElement>('.gs-sb-bar')!;
  bar.dispatchEvent(pointer('pointerdown', from));
  bar.dispatchEvent(pointer('pointermove', to));
  bar.dispatchEvent(pointer('pointerup', to));
};

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

  it('selects a style through the card Use button and closes', async () => {
    const { fixture, el, form, closeCount } = await createBrowser();
    const anime = [...el.querySelectorAll<HTMLButtonElement>('.gs-sb-use')][1];
    anime.click();
    fixture.detectChanges();

    expect(form.controls.styleName.value).toBe('curated:Anime');
    expect(form.controls.styleName.dirty).toBe(true);
    expect(closeCount()).toBe(1);
  });

  it('opens the preview from a card click rather than selecting', async () => {
    const { fixture, el, form, closeCount } = await createBrowser();
    [...el.querySelectorAll<HTMLButtonElement>('.gs-sb-card')][1].click();
    fixture.detectChanges();

    expect(el.querySelector('.gs-sb-viewer')).not.toBeNull();
    expect(form.controls.styleName.value).toBe('');
    expect(closeCount()).toBe(0);
  });

  it('carries the selected state on the Use button, not the card', async () => {
    const { el } = await createBrowser({ styleName: 'Watercolor' });
    const pressed = [
      ...el.querySelectorAll<HTMLButtonElement>('.gs-sb-use'),
    ].filter((node) => node.getAttribute('aria-pressed') === 'true');
    expect(pressed.length).toBe(1);
    // The card is the preview target now, so it carries no pressed state.
    expect(el.querySelector('.gs-sb-card[aria-pressed]')).toBeNull();
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

  describe('modal behaviour', () => {
    it('blocks the page while it is open and frees it on close', async () => {
      const { fixture } = await createBrowser();
      expect(scrollLock.acquire).toHaveBeenCalledTimes(1);
      expect(scrollLock.release).not.toHaveBeenCalled();

      fixture.destroy();
      expect(scrollLock.release).toHaveBeenCalledTimes(1);
    });

    it('opens with the search field focused', async () => {
      const { el } = await createBrowser();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(document.activeElement).toBe(
        el.querySelector('.gs-modal-search input'),
      );
    });

    it('traps the tab run in the panel and in the enlarged layer', async () => {
      const { fixture, component, el } = await createBrowser();
      const trapped = () =>
        fixture.debugElement
          .queryAll(By.directive(CdkTrapFocus))
          .map((node) => (node.nativeElement as HTMLElement).className);
      expect(trapped()).toEqual([
        expect.stringContaining('gs-modal-panel--browser'),
      ]);

      component.openExpanded('Cinematic');
      fixture.detectChanges();
      expect(trapped()).toEqual([
        expect.stringContaining('gs-modal-panel--browser'),
        expect.stringContaining('gs-sb-viewer-body'),
      ]);
      expect(el.querySelector('.gs-sb-viewer-body')).not.toBeNull();
    });
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
    it('flags a style by the categories it is filed under', () => {
      expect(isMatureStyle('dreadhorror', ['horrors'])).toBe(true);
      expect(isMatureStyle('bb95 furry', ['Furries'])).toBe(true);
      expect(isMatureStyle('blendermix', ['ponies'])).toBe(true);
      // Membership counts wherever it appears, not only in the first category.
      expect(isMatureStyle('nova furry pony', ['new', 'furries'])).toBe(true);
      expect(isMatureStyle('blendermix', ['anime'])).toBe(false);
    });

    it('flags unambiguous name markers wherever the style is filed', () => {
      for (const name of ['hentai_raw', 'wai-nsfw-illustrious', 'yiffy']) {
        expect(isMatureStyle(name, [])).toBe(true);
      }
    });

    it('no longer takes the judgment-call name keywords', () => {
      // These were collateral of the old name-only heuristic: none of them is
      // mature by anything but a word in its title.
      for (const name of [
        'impressionist horror comic',
        'spooky horror',
        'terror ink',
        'nightmare fairytale',
        'babes',
      ]) {
        expect(isMatureStyle(name, ['mediums'])).toBe(false);
      }
      for (const name of ['Cinematic', 'Anime', 'Watercolor', 'steampunk']) {
        expect(isMatureStyle(name, [])).toBe(false);
      }
    });

    it('lets a _raw variant inherit its base style categories', async () => {
      const { component, el } = await createBrowser({
        groups: [
          ...GROUPS,
          { category: 'furries', names: ['nova furry pony'] },
          // The catalogue files the raw variant outside the category.
          { category: 'anime', names: ['nova furry pony_raw'] },
        ],
      });
      expect(cardNames(el)).not.toContain('nova furry pony_raw');
      expect(component.visibleKeys()).not.toContain(
        'curated:nova furry pony_raw',
      );
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
      expect(component.visibleKeys()).not.toContain('curated:dreadhorror');
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
      const lines = (): string[] =>
        [...el.querySelectorAll('.gs-sb-toc .gs-index-entry-label')].map(
          (node) => (node.textContent ?? '').trim(),
        );
      expect(lines()).toEqual(['featured', 'artistic']);

      component.setQuery('water');
      fixture.detectChanges();
      // One section left, so the contents rail has nothing to navigate.
      expect(el.querySelector('.gs-sb-toc')).toBeNull();
    });

    it('scrolls to the section a contents entry names', async () => {
      const { el } = await createBrowser();
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;

      el.querySelectorAll<HTMLButtonElement>(
        '.gs-sb-toc .gs-index-entry',
      )[1].click();
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
    it('orders the controls area, search, mature, subject, sort', async () => {
      const { el } = await createBrowser();
      const bar = el.querySelector('.gs-sb-bar')!;
      // Source order is the mobile stacking order too, so one check covers both
      // breakpoints; only the desktop bar's wrapping differs.
      const classes = [...bar.children].map((node) => node.className);
      expect(classes).toEqual([
        expect.stringContaining('gs-sb-fold'),
        expect.stringContaining('gs-sb-area'),
        expect.stringContaining('gs-modal-search'),
        expect.stringContaining('gs-sb-mature'),
        expect.stringContaining('gs-sb-variant'),
        expect.stringContaining('gs-sb-sort'),
      ]);
    });

    it('folds the dock away on a swipe down and back on a swipe up', async () => {
      const { component, el } = await createBrowser();
      expect(component.barFolded()).toBe(false);

      swipeDock(el, 700, 740);
      expect(component.barFolded()).toBe(true);

      swipeDock(el, 740, 700);
      expect(component.barFolded()).toBe(false);
    });

    it('leaves the dock alone for travel too short to be a swipe', async () => {
      const { component, el } = await createBrowser();
      swipeDock(el, 700, 710);
      expect(component.barFolded()).toBe(false);
    });

    it('reads a swipe the way the dock already is as nothing', async () => {
      const { component, el } = await createBrowser();
      swipeDock(el, 700, 660);
      expect(component.barFolded()).toBe(false);
    });

    it('leaves a mostly sideways drag to the controls under it', async () => {
      const { component, el } = await createBrowser();
      const bar = el.querySelector<HTMLElement>('.gs-sb-bar')!;
      bar.dispatchEvent(pointer('pointerdown', 700, 100));
      bar.dispatchEvent(pointer('pointermove', 740, 200));
      bar.dispatchEvent(pointer('pointerup', 740, 200));
      expect(component.barFolded()).toBe(false);
    });

    it('ignores a drag that starts in the search field', async () => {
      const { component, el } = await createBrowser();
      const input = el.querySelector<HTMLElement>('.gs-modal-search input')!;
      input.dispatchEvent(pointer('pointerdown', 700));
      input.dispatchEvent(pointer('pointermove', 740));
      input.dispatchEvent(pointer('pointerup', 740));
      expect(component.barFolded()).toBe(false);
    });

    it('swallows the click a swipe leaves on the chip it started from', async () => {
      const { component, el, fixture } = await createBrowser();
      const chip = el.querySelector<HTMLElement>('.gs-sb-mature')!;
      chip.dispatchEvent(pointer('pointerdown', 700));
      chip.dispatchEvent(pointer('pointermove', 740));
      chip.dispatchEvent(pointer('pointerup', 740));
      chip.click();
      fixture.detectChanges();
      expect(component.barFolded()).toBe(true);
      expect(component.showMature()).toBe(false);

      // The next tap is an ordinary tap again.
      chip.click();
      fixture.detectChanges();
      expect(component.showMature()).toBe(true);
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
      harness.el.querySelector<HTMLButtonElement>('.gs-sb-card')?.click();
      harness.fixture.detectChanges();
    };

    const sheetSources = (harness: Harness): (string | null)[] =>
      [
        ...harness.el.querySelectorAll<HTMLImageElement>(
          '.gs-sb-viewer-shot img',
        ),
      ].map((img) => img.getAttribute('src'));

    it('opens on the contact sheet showing every subject the style has', async () => {
      const harness = await createBrowser();
      openFirst(harness);

      expect(harness.el.querySelector('.gs-sb-viewer')).not.toBeNull();
      expect(harness.component.expandedVariant()).toBe('all');
      expect(sheetSources(harness)).toEqual([
        'https://img/cine-person.webp',
        'https://img/cine-place.webp',
        'https://img/cine-thing.webp',
      ]);
      // The sheet lists real renders only, with no fallback substitution.
      expect(harness.el.querySelector('.gs-sb-viewer-img')).toBeNull();
      expect(harness.form.controls.styleName.value).toBe('');
      expect(harness.closeCount()).toBe(0);
    });

    it('jumps to a single subject when its sheet image is clicked', async () => {
      const harness = await createBrowser();
      openFirst(harness);
      harness.el
        .querySelectorAll<HTMLButtonElement>('.gs-sb-viewer-shot')[1]
        .click();
      harness.fixture.detectChanges();

      expect(harness.component.expandedVariant()).toBe('place');
      expect(harness.el.querySelectorAll('.gs-sb-viewer-shot').length).toBe(0);
      expect(
        harness.el.querySelector<HTMLImageElement>('.gs-sb-viewer-img')?.src,
      ).toBe('https://img/cine-place.webp');
    });

    it('offers All alongside the three subjects and returns to it', async () => {
      const harness = await createBrowser();
      openFirst(harness);
      const options = [
        ...harness.el.querySelectorAll('.gs-sb-viewer-variant .gs-seg-opt'),
      ].map((node) => (node.textContent ?? '').trim());
      expect(options.length).toBe(4);

      harness.component.setExpandedVariant('thing');
      harness.fixture.detectChanges();
      expect(harness.el.querySelector('.gs-sb-viewer-img')).not.toBeNull();

      harness.component.setExpandedVariant('all');
      harness.fixture.detectChanges();
      expect(harness.el.querySelectorAll('.gs-sb-viewer-shot').length).toBe(3);
    });

    it('always opens on All, whatever the grid and the last visit were', async () => {
      const harness = await createBrowser();
      harness.component.setVariant('place');
      harness.fixture.detectChanges();
      openFirst(harness);
      expect(harness.component.expandedVariant()).toBe('all');

      harness.component.setExpandedVariant('thing');
      harness.fixture.detectChanges();
      harness.component.closeExpanded();
      harness.fixture.detectChanges();
      openFirst(harness);
      expect(harness.component.expandedVariant()).toBe('all');
    });

    it('shows a style with one render as a one-up sheet', async () => {
      const harness = await createBrowser();
      // Anime has only a "thing" render.
      harness.el.querySelectorAll<HTMLButtonElement>('.gs-sb-card')[1].click();
      harness.fixture.detectChanges();
      expect(sheetSources(harness)).toEqual(['https://img/anime-thing.webp']);
    });

    it('says so when a style has no render at all', async () => {
      const harness = await createBrowser();
      // Watercolor has no preview; the card still opens the layer, which keeps
      // prev/next and Use reachable rather than making it a dead end.
      harness.el.querySelectorAll<HTMLButtonElement>('.gs-sb-card')[2].click();
      harness.fixture.detectChanges();
      expect(harness.el.querySelector('.gs-sb-viewer-empty')).not.toBeNull();
      expect(harness.el.querySelector('.gs-sb-viewer-use')).not.toBeNull();
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

    it('keeps the chosen subject while stepping, and All while in All', async () => {
      const harness = await createBrowser();
      openFirst(harness);
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight' }),
      );
      harness.fixture.detectChanges();
      // Stepping out of Cinematic stays on the sheet.
      expect(harness.component.expandedVariant()).toBe('all');

      harness.component.setExpandedVariant('thing');
      harness.fixture.detectChanges();
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft' }),
      );
      harness.fixture.detectChanges();
      expect(harness.component.expandedVariant()).toBe('thing');
      expect(
        harness.el.querySelector<HTMLImageElement>('.gs-sb-viewer-img')?.src,
      ).toBe('https://img/cine-thing.webp');
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

      expect(harness.form.controls.styleName.value).toBe('curated:Cinematic');
      expect(harness.closeCount()).toBe(1);
    });
  });
  describe('published styles', () => {
    /** A published style as the horde serves it, examples left off. */
    const published = (
      id: string,
      name: string,
      creator?: string,
    ): Record<string, unknown> => ({
      id,
      name,
      prompt: '{p}{np}',
      params: {},
      models: [],
      nsfw: false,
      ...(creator ? { creator } : {}),
    });

    /** Answer the community list request that switching areas fires. */
    const flushCommunity = (
      harness: Harness,
      styles: Record<string, unknown>[],
    ): void => {
      harness.component.setArea('community');
      TestBed.inject(HttpTestingController)
        .expectOne((request) => request.url.endsWith('/styles/image'))
        .flush(styles);
      harness.fixture.detectChanges();
    };

    it('lists published styles flat, with creator and usage, and no cards', async () => {
      const harness = await createBrowser();
      harness.usage.increment('native:s1');
      flushCommunity(harness, [
        published('s1', 'Dreamy', 'someone'),
        published('s2', 'Stark'),
      ]);

      const rows = [...harness.el.querySelectorAll('.gs-sb-row')];
      expect(rows.length).toBe(2);
      expect(harness.el.querySelector('.gs-sb-card')).toBeNull();
      expect(
        rows[0].querySelector('.gs-sb-row-name')?.textContent?.trim(),
      ).toBe('Dreamy');
      expect(rows[0].querySelector('.gs-sb-row-by')).not.toBeNull();
      expect(rows[0].querySelector('.gs-sb-badge')).not.toBeNull();
      // A style whose author is not named carries no creator line.
      expect(rows[1].querySelector('.gs-sb-row-by')).toBeNull();
    });

    it('opens the preview from a row and commits from its button', async () => {
      const harness = await createBrowser();
      flushCommunity(harness, [published('s1', 'Dreamy', 'someone')]);

      harness.el.querySelector<HTMLButtonElement>('.gs-sb-row-open')!.click();
      harness.fixture.detectChanges();
      expect(harness.el.querySelector('.gs-sb-viewer')).not.toBeNull();

      harness.component.closeExpanded();
      harness.fixture.detectChanges();
      harness.el.querySelector<HTMLButtonElement>('.gs-sb-row-use')!.click();
      harness.fixture.detectChanges();
      expect(harness.form.controls.styleName.value).toBe('native:s1');
      expect(harness.closeCount()).toBe(1);
    });

    it('swaps to cards on the previews toggle and remembers the choice', async () => {
      const harness = await createBrowser();
      flushCommunity(harness, [published('s1', 'Dreamy', 'someone')]);

      harness.el.querySelector<HTMLButtonElement>('.gs-sb-previews')!.click();
      harness.fixture.detectChanges();
      expect(harness.el.querySelector('.gs-sb-row')).toBeNull();
      expect(harness.el.querySelector('.gs-sb-card')).not.toBeNull();

      const next = await createBrowser({
        prefs: { 'aihorde.generate.style_browser_previews': true },
      });
      expect(next.component.recordPreviews()).toBe(true);
    });

    it('keeps preset cards whatever the toggle says', async () => {
      const harness = await createBrowser();
      expect(harness.component.recordPreviews()).toBe(false);
      expect(harness.el.querySelectorAll('.gs-sb-card').length).toBe(3);
      expect(harness.el.querySelector('.gs-sb-row')).toBeNull();
    });
  });
});
