import { DestroyRef } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { setPageTitle, setAppTitle } from './page-title';
import { TranslatorService } from '../services/translator.service';

describe('page-title helpers', () => {
  let mockTranslator: { get: ReturnType<typeof vi.fn> };
  let mockTitle: { setTitle: ReturnType<typeof vi.fn> };
  let mockDestroyRef: DestroyRef;

  beforeEach(() => {
    mockTranslator = {
      get: vi.fn((key: string) => of(`[${key}]`)),
    };

    mockTitle = {
      setTitle: vi.fn(),
    };

    mockDestroyRef = {
      onDestroy: vi.fn((cb) => cb),
    } as unknown as DestroyRef;
  });

  describe('setPageTitle()', () => {
    it('sets title as "Page | App"', () => {
      setPageTitle(
        mockTranslator as unknown as TranslatorService,
        mockTitle as unknown as Title,
        mockDestroyRef,
        'nav.about',
      );

      expect(mockTitle.setTitle).toHaveBeenCalledWith(
        '[nav.about] | [app_title]',
      );
    });

    it('uses a custom separator when provided', () => {
      setPageTitle(
        mockTranslator as unknown as TranslatorService,
        mockTitle as unknown as Title,
        mockDestroyRef,
        'nav.about',
        ' — ',
      );

      expect(mockTitle.setTitle).toHaveBeenCalledWith(
        '[nav.about] — [app_title]',
      );
    });
  });

  describe('setAppTitle()', () => {
    it('sets title to just the app title', () => {
      setAppTitle(
        mockTranslator as unknown as TranslatorService,
        mockTitle as unknown as Title,
        mockDestroyRef,
      );

      expect(mockTitle.setTitle).toHaveBeenCalledWith('[app_title]');
    });
  });
});
