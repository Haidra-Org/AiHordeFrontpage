import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HomepageIntroComponent } from './homepage-intro.component';
import { StickyRegistryService } from '../../../../services/sticky-registry.service';

// ScrollRevealDirective uses IntersectionObserver which jsdom lacks
globalThis.IntersectionObserver ??= class IntersectionObserver {
  constructor(
    _cb: IntersectionObserverCallback,
    _opts?: IntersectionObserverInit,
  ) {
    /* no-op */
  }
  observe() {
    /* no-op */
  }
  unobserve() {
    /* no-op */
  }
  disconnect() {
    /* no-op */
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];
} as unknown as typeof globalThis.IntersectionObserver;

describe('HomepageIntroComponent', () => {
  let component: HomepageIntroComponent;
  let fixture: ComponentFixture<HomepageIntroComponent>;
  let injectedDoc: Document;

  function createComponent(platformId: string) {
    TestBed.configureTestingModule({
      imports: [
        HomepageIntroComponent,
        RouterModule.forRoot([]),
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        { provide: PLATFORM_ID, useValue: platformId },
        {
          provide: StickyRegistryService,
          useValue: { totalOffset: () => 64, offsetFor: () => 0 },
        },
      ],
    }).compileComponents();

    injectedDoc = TestBed.inject(DOCUMENT);
    fixture = TestBed.createComponent(HomepageIntroComponent);
    component = fixture.componentInstance;
  }

  describe('in browser environment', () => {
    beforeEach(() => createComponent('browser'));

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should use injected DOCUMENT for getElementById', () => {
      const mockElement = {
        getBoundingClientRect: () => ({ top: 200, height: 20 }),
      };
      vi.spyOn(injectedDoc, 'getElementById').mockReturnValue(
        mockElement as unknown as HTMLElement,
      );
      const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
        /* no-op */
      });
      vi.spyOn(window, 'scrollY', 'get').mockReturnValue(100);

      const event = new Event('click');
      vi.spyOn(event, 'preventDefault');

      component.scrollToFragment('quickstart', event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(injectedDoc.getElementById).toHaveBeenCalledWith('quickstart');
      expect(scrollSpy).toHaveBeenCalled();
      const options = scrollSpy.mock.calls.at(-1)![0] as ScrollToOptions;
      // top = getBoundingClientRect().top(200) + scrollY(100) - offset(64) - SCROLL_PADDING(16) = 220
      expect(options.top).toBe(220);
      expect(options.behavior).toBe('smooth');
    });

    it('should not scroll if element is not found', () => {
      vi.spyOn(injectedDoc, 'getElementById').mockReturnValue(null);

      const event = new Event('click');
      component.scrollToFragment('nonexistent', event);

      expect(injectedDoc.getElementById).toHaveBeenCalledWith('nonexistent');
    });
  });

  describe('in server environment', () => {
    beforeEach(() => createComponent('server'));

    it('should not access document on server', () => {
      vi.spyOn(injectedDoc, 'getElementById');

      const event = new Event('click');
      vi.spyOn(event, 'preventDefault');

      component.scrollToFragment('quickstart', event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(injectedDoc.getElementById).not.toHaveBeenCalled();
    });
  });
});
