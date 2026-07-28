import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';
import { GenerateSettingsIndexComponent } from './generate-settings-index.component';
import { GlossaryService } from '../../../services/glossary.service';
import { HIGHLIGHT_CLASS } from '../../../services/tutorial-anchor.service';
import { environment } from '../../../../environments/environment';
import { REFERENCE_ENTRIES, REFERENCE_INDEX } from '../reference-data';
import { SECTION_IDENTITIES } from '../section-identity';
import en from '../../../../assets/i18n/en.json';
import stubIndex from '../../../testing/fixtures/sweep-index.stub.json';

const translations = en as Record<string, string>;

describe('GenerateSettingsIndexComponent', () => {
  let fixture: ComponentFixture<GenerateSettingsIndexComponent>;
  let http: HttpTestingController;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const all = <T extends Element>(selector: string): T[] =>
    Array.from(el().querySelectorAll<T>(selector));

  async function setUp(options?: { empty?: boolean }): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        GenerateSettingsIndexComponent,
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
    fixture = TestBed.createComponent(GenerateSettingsIndexComponent);
    fixture.detectChanges();

    const request = http.expectOne(
      `${environment.sweepLibraryBaseUrl}/index.json`,
    );
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

    expect(all('.gs-ref-group')).toHaveLength(REFERENCE_INDEX.length);
    expect(heads.map((head) => head.textContent?.trim())).toEqual(
      REFERENCE_INDEX.map(
        (group) => translations[SECTION_IDENTITIES[group.section].labelKey],
      ),
    );
    // The band carries the area's identity, so its hairline and every chip
    // under it are hued from one place.
    expect(all('.gs-ref-group')[0].classList).toContain(
      SECTION_IDENTITIES[REFERENCE_INDEX[0].section].className,
    );
  });

  it('indexes the bands in a rail, aimed at the ids they already carry', async () => {
    await setUp();
    const lines = all<HTMLButtonElement>('.gs-index-entry');

    expect(lines).toHaveLength(REFERENCE_INDEX.length);
    expect(lines.map((line) => line.textContent?.trim())).toEqual(
      REFERENCE_INDEX.map(
        (group) => translations[SECTION_IDENTITIES[group.section].labelKey],
      ),
    );
    for (const group of REFERENCE_INDEX) {
      expect(
        el().querySelector(`#gs-ref-group-${group.section}`),
      ).not.toBeNull();
    }
  });

  it('offers a card per setting, linking to that setting page', async () => {
    await setUp();
    const cards = all<HTMLAnchorElement>('.gs-ref-card');

    expect(cards).toHaveLength(REFERENCE_ENTRIES.length);
    expect(cards.map((card) => card.getAttribute('href'))).toEqual(
      REFERENCE_INDEX.flatMap((group) =>
        group.ids.map((id) => `/generate/learn/settings/${id}`),
      ),
    );
  });

  it('names each card and leads it with the entry sentence', async () => {
    await setUp();
    const first = all('.gs-ref-card')[0];
    const id = REFERENCE_INDEX[0].ids[0];

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
      expect(thumb.getAttribute('src')).toContain(
        environment.sweepLibraryBaseUrl,
      );
      // Decoration beside a named link, so it takes no alt text of its own.
      expect(thumb.getAttribute('alt')).toBe('');
    }
  });

  it('is all text and no gaps when the library is unpublished', async () => {
    await setUp({ empty: true });

    expect(all('.gs-ref-card-img')).toHaveLength(0);
    expect(all('.gs-ref-card')).toHaveLength(REFERENCE_ENTRIES.length);
  });

  describe('glossary: what this page is made of', () => {
    it('offers the index its own bands, and takes them back on the way out', async () => {
      await setUp();
      const glossary = TestBed.inject(GlossaryService);
      const context = glossary.pageContexts().get('learn-settings');

      expect(context?.entries.map((entry) => entry.id)).toEqual(
        REFERENCE_INDEX.map((group) => group.section),
      );
      expect(context?.entries[0].titleKey).toBe(
        SECTION_IDENTITIES[REFERENCE_INDEX[0].section].labelKey,
      );

      fixture.destroy();

      expect(glossary.pageContexts().has('learn-settings')).toBe(false);
    });

    it('jumps down the page to the band an entry names', async () => {
      await setUp();
      const band = el().querySelector(
        `#gs-ref-group-${REFERENCE_INDEX[0].section}`,
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
