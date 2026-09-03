import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';
import { DocsSettingsIndexComponent } from './settings-index.component';
import { GlossaryService } from '../../../services/glossary.service';
import { HIGHLIGHT_CLASS } from '../../../services/tutorial-anchor.service';
import { environment } from '../../../../environments/environment';
import { SECTION_IDENTITIES } from '../../../content/sections';
import { SETTINGS_INDEX } from '../../../content/settings';

/** Every setting the index has a card for: the book's pages, not the registry. */
const DOCUMENTED = SETTINGS_INDEX.flatMap((group) => group.ids);
import en from '../../../../assets/i18n/en.json';
import stubIndex from '../../../testing/fixtures/sweep-index.stub.json';

const translations = en as Record<string, string>;

describe('DocsSettingsIndexComponent', () => {
  let fixture: ComponentFixture<DocsSettingsIndexComponent>;
  let http: HttpTestingController;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));

  async function setUp(options?: {
    empty?: boolean;
    unknownId?: string;
  }): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        DocsSettingsIndexComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    if (options?.unknownId) {
      // The redirect off a setting page that does not exist stows the name it
      // named in the navigation that mounts this page.
      vi.spyOn(TestBed.inject(Router), 'getCurrentNavigation').mockReturnValue({
        extras: { state: { docsUnknownId: options.unknownId } },
      } as unknown as ReturnType<Router['getCurrentNavigation']>);
    }
    fixture = TestBed.createComponent(DocsSettingsIndexComponent);
    fixture.detectChanges();

    const request = http.expectOne(`${environment.evidenceBaseUrl}/index.json`);
    if (options?.empty) {
      request.error(new ProgressEvent('offline'), {
        status: 0,
        statusText: '',
      });
    } else {
      request.flush(stubIndex);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  it('lays out one band per area the reference has entries for', async () => {
    await setUp();
    const heads = all('.gs-ref-group .gs-guide-head');

    expect(all('.gs-ref-group')).toHaveLength(SETTINGS_INDEX.length);
    expect(heads.map((head) => head.textContent?.trim())).toEqual(
      SETTINGS_INDEX.map(
        (group) => translations[SECTION_IDENTITIES[group.section].labelKey],
      ),
    );
    // The band carries the area's identity, so its hairline and every chip
    // under it are hued from one place.
    expect(all('.gs-ref-group')[0].classList).toContain(
      SECTION_IDENTITIES[SETTINGS_INDEX[0].section].className,
    );
  });

  it('indexes the bands in a rail, aimed at the ids they already carry', async () => {
    await setUp();
    const lines = all<HTMLButtonElement>('.gs-index-entry');

    expect(lines).toHaveLength(SETTINGS_INDEX.length);
    expect(lines.map((line) => line.textContent?.trim())).toEqual(
      SETTINGS_INDEX.map(
        (group) => translations[SECTION_IDENTITIES[group.section].labelKey],
      ),
    );
    for (const group of SETTINGS_INDEX) {
      expect(
        el().querySelector(`#gs-ref-group-${group.section}`),
      ).not.toBeNull();
    }
  });

  it('offers a card per setting, linking to that setting page', async () => {
    await setUp();
    const cards = all<HTMLAnchorElement>('.gs-ref-card');

    expect(cards).toHaveLength(DOCUMENTED.length);
    expect(cards.map((card) => card.getAttribute('href'))).toEqual(
      SETTINGS_INDEX.flatMap((group) =>
        group.ids.map((id) => `/docs/image/settings/${id}`),
      ),
    );
  });

  it('names each card and leads it with the entry sentence', async () => {
    await setUp();
    const first = all('.gs-ref-card')[0];
    const id = SETTINGS_INDEX[0].ids[0];

    expect(first.querySelector('.gs-ref-card-title')?.textContent).toContain(
      translations[`generate.help.${id}.title`],
    );
    expect(first.querySelector('.gs-ref-card-lead')?.textContent?.trim()).toBe(
      translations[`generate.reference.${id}.lead`],
    );
    expect(first.querySelector('.gs-sec-chip')).not.toBeNull();
  });

  it('thumbnails the settings the library published a strip for, lazily', async () => {
    await setUp();
    const thumbs = all<HTMLImageElement>('.gs-ref-card-img');

    expect(thumbs.length).toBeGreaterThan(0);
    for (const thumb of thumbs) {
      expect(thumb.getAttribute('loading')).toBe('lazy');
      expect(thumb.getAttribute('src')).toContain(environment.evidenceBaseUrl);
      // Decoration beside a named link, so it takes no alt text of its own.
      expect(thumb.getAttribute('alt')).toBe('');
    }
  });

  it('is all text and no gaps when the library is unpublished', async () => {
    await setUp({ empty: true });

    expect(all('.gs-ref-card-img')).toHaveLength(0);
    expect(all('.gs-ref-card')).toHaveLength(DOCUMENTED.length);
  });

  describe('glossary: what this page is made of', () => {
    it('offers the index its own bands, and takes them back on the way out', async () => {
      await setUp();
      const glossary = TestBed.inject(GlossaryService);
      const context = glossary.pageContexts().get('learn-settings');

      expect(context?.entries.map((entry) => entry.id)).toEqual(
        SETTINGS_INDEX.map((group) => group.section),
      );
      expect(context?.entries[0].titleKey).toBe(
        SECTION_IDENTITIES[SETTINGS_INDEX[0].section].labelKey,
      );

      fixture.destroy();

      expect(glossary.pageContexts().has('learn-settings')).toBe(false);
    });

    it('jumps down the page to the band an entry names', async () => {
      await setUp();
      const band = el().querySelector(
        `#gs-ref-group-${SETTINGS_INDEX[0].section}`,
      );
      const scrollIntoView = vi.fn();
      (band as HTMLElement).scrollIntoView = scrollIntoView;

      TestBed.inject(GlossaryService)
        .pageContexts()
        .get('learn-settings')
        ?.entries[0].action?.();

      expect(scrollIntoView).toHaveBeenCalled();
      // Nothing changed on the page, so nothing is rung.
      expect(band?.classList.contains(HIGHLIGHT_CLASS)).toBe(false);
    });
  });

  describe('find on this page', () => {
    const type = (text: string): void => {
      const field = el().querySelector<HTMLInputElement>('.gs-find-input')!;
      field.value = text;
      field.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const titles = (): (string | undefined)[] =>
      all('.gs-ref-card-title').map((title) => title.textContent?.trim());

    it('shows the whole index until something is typed', async () => {
      await setUp();

      expect(all('.gs-ref-card')).toHaveLength(DOCUMENTED.length);
      expect(el().querySelector('.gs-find-empty')).toBeNull();
    });

    it('finds a setting by the API field name that is an alias onto it', async () => {
      await setUp();
      type('cfg_scale');

      expect(titles()).toEqual([translations['generate.help.cfg.title']]);
      // The band the card is in is the only one left standing.
      expect(all('.gs-ref-group')).toHaveLength(1);
    });

    it('finds the same setting by its id and by what it is called', async () => {
      await setUp();

      type('CFG');
      expect(titles()).toContain(translations['generate.help.cfg.title']);

      type('guidance');
      expect(titles()).toContain(translations['generate.help.cfg.title']);
    });

    it('says so when nothing on the page carries the word', async () => {
      await setUp();
      type('zzzz');

      expect(all('.gs-ref-card')).toHaveLength(0);
      expect(all('.gs-ref-group')).toHaveLength(0);
      expect(el().querySelector('.gs-find-empty')?.textContent?.trim()).toBe(
        translations['docs.find.empty'].replace('{{ query }}', 'zzzz'),
      );
    });

    it('leaves the contents rail naming only the areas still on the page', async () => {
      await setUp();
      expect(all('.gs-index-entry')).toHaveLength(SETTINGS_INDEX.length);

      type('cfg_scale');

      // One band survives the filter, so a rail still listing eight would send
      // a reader to seven places the page no longer has.
      expect(all('.gs-ref-group')).toHaveLength(1);
      expect(all('.gs-index-entry')).toHaveLength(1);
    });
  });

  it('says which setting was asked for when a wrong URL sent the reader here', async () => {
    await setUp({ unknownId: 'not_a_param' });

    expect(el().querySelector('.gs-unknown-id-note')?.textContent?.trim()).toBe(
      translations['docs.unknown_id'].replace('{{ id }}', 'not_a_param'),
    );
  });

  it('says nothing when the reader came here on purpose', async () => {
    await setUp();

    expect(el().querySelector('.gs-unknown-id-note')).toBeNull();
  });

  it('has an English heading and lead of its own', async () => {
    await setUp();

    expect(el().querySelector('.gs-ref-index-title')?.textContent?.trim()).toBe(
      translations['generate.reference.head'],
    );
    expect(el().querySelector('.gs-ref-index-lead')?.textContent?.trim()).toBe(
      translations['generate.reference.lead'],
    );
  });
});
