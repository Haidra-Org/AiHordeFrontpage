import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { StyleBrowserComponent } from './style-browser.component';
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

const PREVIEWS = {
  Cinematic: {
    person: 'https://img/cine-person.webp',
    place: 'https://img/cine-place.webp',
    thing: 'https://img/cine-thing.webp',
  },
  Anime: { thing: 'https://img/anime-thing.webp' },
};

interface Harness {
  fixture: ComponentFixture<StyleBrowserComponent>;
  component: StyleBrowserComponent;
  form: GenerateFormGroup;
  el: HTMLElement;
  closeCount: () => number;
  usage: StyleUsageService;
}

async function createBrowser(
  options: { styleName?: string; usage?: Record<string, number> } = {},
): Promise<Harness> {
  TestBed.resetTestingModule();
  // Each harness starts cold, so the previews fetch is always exercised rather
  // than served from a sibling test's stale-while-revalidate cache.
  localStorage.clear();
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
  fixture.componentRef.setInput('styleGroups', GROUPS);

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
});
