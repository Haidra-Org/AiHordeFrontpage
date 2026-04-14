import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { DataService } from './data.service';

describe('DataService', () => {
  let service: DataService;
  let httpTesting: HttpTestingController;
  let mockTransloco: { getActiveLang: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockTransloco = { getActiveLang: vi.fn().mockReturnValue('en') };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TranslocoService, useValue: mockTransloco },
      ],
    });
    service = TestBed.inject(DataService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  // -----------------------------------------------------------------------
  // getData language fallback
  // -----------------------------------------------------------------------
  describe('getData language fallback', () => {
    it('should load locale-specific file on success', async () => {
      mockTransloco.getActiveLang.mockReturnValue('fr');

      const promise = firstValueFrom(service.faq);

      httpTesting
        .expectOne('/assets/data/faq.fr.json')
        .flush([{ question: 'Q1', answer: 'A1', section: 'general' }]);

      const result = await promise;
      expect(result.get('general')?.length).toBe(1);
      expect(result.get('general')![0].question).toBe('Q1');
    });

    it('should fall back to en.json on 404', async () => {
      mockTransloco.getActiveLang.mockReturnValue('ja');

      const promise = firstValueFrom(service.faq);

      // Locale-specific returns 404
      httpTesting
        .expectOne('/assets/data/faq.ja.json')
        .flush('Not found', { status: 404, statusText: 'Not Found' });

      // Falls back to English
      httpTesting
        .expectOne('/assets/data/faq.en.json')
        .flush([
          { question: 'English Q', answer: 'English A', section: 'help' },
        ]);

      const result = await promise;
      expect(result.get('help')?.length).toBe(1);
      expect(result.get('help')![0].question).toBe('English Q');
    });

    it('should rethrow non-404 HTTP errors', async () => {
      mockTransloco.getActiveLang.mockReturnValue('de');

      const promise = firstValueFrom(service.faq);

      httpTesting.expectOne('/assets/data/faq.de.json').flush('Server error', {
        status: 500,
        statusText: 'Internal Server Error',
      });

      httpTesting.expectNone('/assets/data/faq.en.json');
      await expect(promise).rejects.toMatchObject({ status: 500 });
    });
  });

  // -----------------------------------------------------------------------
  // formatToMapped
  // -----------------------------------------------------------------------
  describe('formatToMapped / faq grouping', () => {
    it('should group items by their section key', async () => {
      const promise = firstValueFrom(service.faq);

      httpTesting.expectOne('/assets/data/faq.en.json').flush([
        { question: 'Q1', answer: 'A1', section: 'basics' },
        { question: 'Q2', answer: 'A2', section: 'advanced' },
        { question: 'Q3', answer: 'A3', section: 'basics' },
      ]);

      const result = await promise;
      expect(result.get('basics')?.length).toBe(2);
      expect(result.get('advanced')?.length).toBe(1);
    });

    it('should place items with null section key under empty string', async () => {
      const promise = firstValueFrom(service.faq);

      httpTesting
        .expectOne('/assets/data/faq.en.json')
        .flush([{ question: 'Q1', answer: 'A1', section: null }]);

      const result = await promise;
      expect(result.get('')?.length).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // tools - multi-value categories
  // -----------------------------------------------------------------------
  describe('tools / array category grouping', () => {
    it('should place items under each category when categories is an array', async () => {
      const promise = firstValueFrom(service.tools);

      httpTesting.expectOne('/assets/data/tools.en.json').flush([
        {
          name: 'Tool A',
          url: 'https://example.com',
          description: 'Desc',
          categories: ['cat1', 'cat2'],
        },
      ]);

      const result = await promise;
      // Should appear in both categories
      expect(result.get('cat1')?.length).toBe(1);
      expect(result.get('cat2')?.length).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // privacyPolicy - date context replacement
  // -----------------------------------------------------------------------
  describe('privacyPolicy', () => {
    it('should replace {date} context with locale-formatted date', async () => {
      mockTransloco.getActiveLang.mockReturnValue('en');

      const promise = firstValueFrom(service.privacyPolicy);

      httpTesting.expectOne('/assets/data/privacy.en.json').flush([
        {
          text: 'Effective as of {lastUpdated}.',
          section: 'Overview',
          subsection: null,
          context: {
            lastUpdated: { valueType: 'date', value: '2024-06-15' },
          },
        },
      ]);

      const result = await promise;

      const overviewSection = result.get('Overview');
      expect(overviewSection).toBeTruthy();

      const nullSubsection = overviewSection!.get('');
      expect(nullSubsection).toBeTruthy();

      const item = nullSubsection![0];
      const expectedDate = new Intl.DateTimeFormat('en', {
        dateStyle: 'long',
        timeStyle: undefined,
      }).format(new Date('2024-06-15'));

      // The date should be formatted with Intl.DateTimeFormat, not raw
      expect(item.text).not.toContain('{lastUpdated}');
      expect(item.text).toBe(`Effective as of ${expectedDate}.`);
    });

    it('should group by section then subsection', async () => {
      const promise = firstValueFrom(service.privacyPolicy);

      httpTesting.expectOne('/assets/data/privacy.en.json').flush([
        {
          text: 'Item 1',
          section: 'Data',
          subsection: 'Collection',
        },
        {
          text: 'Item 2',
          section: 'Data',
          subsection: 'Retention',
        },
        {
          text: 'Item 3',
          section: 'Rights',
          subsection: null,
        },
      ]);

      const result = await promise;

      const dataSection = result.get('Data');
      expect(dataSection).toBeTruthy();
      expect(dataSection!.get('Collection')?.length).toBe(1);
      expect(dataSection!.get('Retention')?.length).toBe(1);

      const rightsSection = result.get('Rights');
      expect(rightsSection).toBeTruthy();
      // null subsection becomes empty string key
      expect(rightsSection!.get('')?.length).toBe(1);
    });
  });
});
