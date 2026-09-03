import { DestroyRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { setPageTitle, setAppTitle, useStudioTitle } from './page-title';
import { TranslatorService } from '../services/translator.service';

describe('page-title helpers', () => {
  let mockTranslator: { get: ReturnType<typeof vi.fn> };
  let mockTitle: { setTitle: ReturnType<typeof vi.fn> };
  let mockDestroyRef: DestroyRef;

  beforeEach(() => {
    mockTranslator = {
      get: vi.fn((key: string, params?: { count: number }) =>
        of(params ? `[${key}:${params.count}]` : `[${key}]`),
      ),
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

  describe('useStudioTitle()', () => {
    const pending = signal(0);
    /** Whether the reader is looking at another tab. */
    let hidden = false;

    function start(): void {
      pending.set(0);
      hidden = false;
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => hidden,
      });
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: TranslatorService, useValue: mockTranslator },
          { provide: Title, useValue: mockTitle },
        ],
      });
      TestBed.runInInjectionContext(() =>
        useStudioTitle('generate.title', pending),
      );
      TestBed.tick();
    }

    /** Look away from the tab, or back at it. */
    function look(away: boolean): void {
      hidden = away;
      document.dispatchEvent(new Event('visibilitychange'));
    }

    const shown = (): string =>
      mockTitle.setTitle.mock.calls.at(-1)?.[0] as string;

    it('names the studio while nothing is running', () => {
      start();

      expect(shown()).toBe('[generate.title] | [app_title]');
    });

    it('counts what is still to come back', () => {
      start();

      pending.set(2);
      TestBed.tick();

      expect(shown()).toBe('[studio.tab_generating:2] | [app_title]');
    });

    it('says what arrived while the reader was on another tab', () => {
      start();
      pending.set(2);
      TestBed.tick();

      look(true);
      pending.set(0);
      TestBed.tick();

      expect(shown()).toBe('[studio.tab_done:2] | [app_title]');
    });

    it('drops the note as soon as the tab is the one being read', () => {
      start();
      pending.set(2);
      TestBed.tick();
      look(true);
      pending.set(0);
      TestBed.tick();

      look(false);

      expect(shown()).toBe('[generate.title] | [app_title]');
    });

    it('leaves nothing behind when the reader leaves the studio', () => {
      start();
      pending.set(3);
      TestBed.tick();

      TestBed.resetTestingModule();

      expect(shown()).toBe('[generate.title] | [app_title]');
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
