import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { TranslatorService } from './translator.service';
import { TranslocoService } from '@jsverse/transloco';

describe('TranslatorService', () => {
  let service: TranslatorService;
  let mockTransloco: {
    getActiveLang: ReturnType<typeof vi.fn>;
    translate: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>;
    config: { fallbackLang: string };
  };

  beforeEach(() => {
    mockTransloco = {
      getActiveLang: vi.fn().mockReturnValue('en'),
      translate: vi.fn().mockReturnValue('translated'),
      load: vi.fn().mockReturnValue(of({})),
      config: { fallbackLang: 'en' },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: TranslocoService, useValue: mockTransloco }],
    });

    service = TestBed.inject(TranslatorService);
  });

  describe('get()', () => {
    it('translates a key after loading the active language', () => {
      mockTransloco.translate.mockReturnValue('Hello World');

      let result: string | undefined;
      service.get('greeting').subscribe((r) => (result = r));

      expect(result).toBe('Hello World');
      expect(mockTransloco.translate).toHaveBeenCalledWith(
        'greeting',
        undefined,
      );
    });

    it('passes params to transloco.translate', () => {
      service.get('welcome', { name: 'Alice' }).subscribe();

      expect(mockTransloco.translate).toHaveBeenCalledWith('welcome', {
        name: 'Alice',
      });
    });

    it('loads active language on first call', () => {
      mockTransloco.getActiveLang.mockReturnValue('de');
      mockTransloco.config.fallbackLang = 'en';

      service.get('key').subscribe();

      expect(mockTransloco.load).toHaveBeenCalledWith('de');
      expect(mockTransloco.load).toHaveBeenCalledWith('en');
    });

    it('does not reload a language that was already loaded', () => {
      mockTransloco.getActiveLang.mockReturnValue('fr');
      mockTransloco.config.fallbackLang = 'en';

      service.get('key1').subscribe();
      const loadCount = mockTransloco.load.mock.calls.length;

      service.get('key2').subscribe();
      // 'fr' and 'en' were already loaded, so no additional load calls
      expect(mockTransloco.load).toHaveBeenCalledTimes(loadCount);
    });

    it('loads the fallback language even when it differs from active', () => {
      mockTransloco.getActiveLang.mockReturnValue('ja');
      mockTransloco.config.fallbackLang = 'en';

      service.get('key').subscribe();

      // Should load both ja (active) and en (fallback)
      expect(mockTransloco.load).toHaveBeenCalledWith('ja');
      expect(mockTransloco.load).toHaveBeenCalledWith('en');
    });

    it('skips loading fallback when it matches already-loaded active', () => {
      mockTransloco.getActiveLang.mockReturnValue('en');
      mockTransloco.config.fallbackLang = 'en';

      service.get('key').subscribe();

      // 'en' loaded as active language; fallback is also 'en' so skipped
      expect(mockTransloco.load).toHaveBeenCalledTimes(1);
    });
  });
});
