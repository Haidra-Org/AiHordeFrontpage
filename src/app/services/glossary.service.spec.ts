import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import {
  GlossaryService,
  PageGlossaryContext,
  GLOSSARY_TERMS,
  GLOSSARY_CATEGORIES,
} from './glossary.service';
import { referenceEntry } from '../pages/generate/reference-data';

describe('GlossaryService', () => {
  let service: GlossaryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GlossaryService);
  });

  // ===========================================================================
  // Initial state
  // ===========================================================================

  it('starts closed with no active term', () => {
    expect(service.isOpen()).toBe(false);
    expect(service.activeTermId()).toBeNull();
    expect(service.activeTab()).toBe('dictionary');
    expect(service.pageContext()).toBeNull();
  });

  // ===========================================================================
  // open / close
  // ===========================================================================

  describe('open()', () => {
    it('opens the glossary in dictionary mode when called without args', () => {
      service.open();
      expect(service.isOpen()).toBe(true);
      expect(service.activeTab()).toBe('dictionary');
      expect(service.activeTermId()).toBeNull();
    });

    it('opens to a specific term in dictionary mode', () => {
      service.open('kudos');
      expect(service.isOpen()).toBe(true);
      expect(service.activeTermId()).toBe('kudos');
      expect(service.activeTab()).toBe('dictionary');
    });

    it('opens to this-page tab when page contexts exist and no term specified', () => {
      service.registerPageContext(makePage('workers'));
      service.open();
      expect(service.activeTab()).toBe('this-page');
    });
  });

  describe('close()', () => {
    it('closes the glossary and clears active term', () => {
      service.open('kudos');
      service.close();
      expect(service.isOpen()).toBe(false);
      expect(service.activeTermId()).toBeNull();
    });
  });

  describe('openToPageEntry()', () => {
    it('opens to the this-page tab with specific page and entry', () => {
      service.registerPageContext(makePage('workers'));
      service.openToPageEntry('workers', 'entry-1');
      expect(service.isOpen()).toBe(true);
      expect(service.activeTab()).toBe('this-page');
      expect(service.activePageId()).toBe('workers');
      expect(service.activeTermId()).toBe('entry-1');
    });
  });

  // ===========================================================================
  // Page context management
  // ===========================================================================

  describe('registerPageContext()', () => {
    it('registers a page context and makes it active', () => {
      service.registerPageContext(makePage('page-a'));
      expect(service.pageContexts().size).toBe(1);
      expect(service.activePageId()).toBe('page-a');
      expect(service.pageContext()?.pageId).toBe('page-a');
    });

    it('allows multiple page contexts but keeps the first as active', () => {
      service.registerPageContext(makePage('page-a'));
      service.registerPageContext(makePage('page-b'));
      expect(service.pageContexts().size).toBe(2);
      expect(service.activePageId()).toBe('page-a');
    });

    it('overwrites an existing page context with the same id', () => {
      service.registerPageContext(makePage('p', 'Title V1'));
      service.registerPageContext(makePage('p', 'Title V2'));
      expect(service.pageContexts().size).toBe(1);
      expect(service.pageContext()?.pageTitleKey).toBe('Title V2');
    });
  });

  describe('clearPageContext()', () => {
    it('removes a specific page context by id', () => {
      service.registerPageContext(makePage('a'));
      service.registerPageContext(makePage('b'));
      service.clearPageContext('a');
      expect(service.pageContexts().size).toBe(1);
      expect(service.pageContexts().has('a')).toBe(false);
    });

    it('switches activePageId to the next available context when the active one is removed', () => {
      service.registerPageContext(makePage('a'));
      service.registerPageContext(makePage('b'));
      service.clearPageContext('a');
      expect(service.activePageId()).toBe('b');
    });

    it('sets activePageId to null when the last context is removed', () => {
      service.registerPageContext(makePage('only'));
      service.clearPageContext('only');
      expect(service.activePageId()).toBeNull();
    });

    it('clears all contexts when called without an id', () => {
      service.registerPageContext(makePage('a'));
      service.registerPageContext(makePage('b'));
      service.clearPageContext();
      expect(service.pageContexts().size).toBe(0);
      expect(service.activePageId()).toBeNull();
    });
  });

  // ===========================================================================
  // pageContext computed
  // ===========================================================================

  describe('pageContext computed', () => {
    it('returns the active page context', () => {
      service.registerPageContext(makePage('a'));
      service.registerPageContext(makePage('b'));
      service.activePageId.set('b');
      expect(service.pageContext()?.pageId).toBe('b');
    });

    it('falls back to the first context if activePageId is invalid', () => {
      service.registerPageContext(makePage('a'));
      service.activePageId.set('nonexistent');
      expect(service.pageContext()?.pageId).toBe('a');
    });

    it('returns null when no contexts are registered', () => {
      expect(service.pageContext()).toBeNull();
    });
  });

  // ===========================================================================
  // Static data integrity
  // ===========================================================================

  describe('GLOSSARY_TERMS data integrity', () => {
    it('every term has a unique id', () => {
      const ids = GLOSSARY_TERMS.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('every term belongs to a known category', () => {
      const categoryIds = new Set(GLOSSARY_CATEGORIES.map((c) => c.id));
      for (const term of GLOSSARY_TERMS) {
        expect(categoryIds.has(term.category)).toBe(true);
      }
    });

    it('all categories have at least one term', () => {
      for (const cat of GLOSSARY_CATEGORIES) {
        const terms = GLOSSARY_TERMS.filter((t) => t.category === cat.id);
        expect(terms.length).toBeGreaterThan(0);
      }
    });

    it('files the panel parameters under their own category', () => {
      const parameters = GLOSSARY_TERMS.filter(
        (t) => t.category === 'generation_settings',
      ).map((t) => t.id);

      expect(parameters).toEqual([
        'steps',
        'cfg',
        'sampler',
        'seed',
        'clip_skip',
        'karras',
        'hires_fix',
        'denoise',
        'tiling',
      ]);
    });

    it('sends every term that links to the reference at a setting that exists', () => {
      const settingLinks = GLOSSARY_TERMS.flatMap((term) =>
        (term.links ?? [])
          .map((link) => link.routerLink)
          .filter((link) => link.startsWith('/generate/learn/settings/')),
      );

      // Every parameter term carries one, and the terms that predate the
      // reference (LoRA, ControlNet, img2img, inpainting, post-processing) too.
      expect(settingLinks.length).toBeGreaterThan(9);
      for (const link of settingLinks) {
        const topic = link.slice('/generate/learn/settings/'.length);
        expect(referenceEntry(topic)?.id).toBe(topic);
      }
    });
  });

  // ===========================================================================
  // Actionable this-page entries
  // ===========================================================================

  describe('page entry actions', () => {
    it('hands an entry action back to the modal untouched', () => {
      const action = vi.fn();
      service.registerPageContext({
        ...makePage('studio'),
        entries: [
          {
            id: 'sampling',
            titleKey: 'title',
            descriptionKey: 'desc',
            action,
          },
        ],
      });

      service.pageContext()?.entries[0].action?.();

      expect(action).toHaveBeenCalledOnce();
    });

    it('leaves an entry without one alone', () => {
      service.registerPageContext({
        ...makePage('static'),
        entries: [{ id: 'a', titleKey: 'title', descriptionKey: 'desc' }],
      });

      expect(service.pageContext()?.entries[0].action).toBeUndefined();
    });
  });
});

function makePage(
  pageId: string,
  titleKey = `page.${pageId}.title`,
): PageGlossaryContext {
  return {
    pageId,
    pageTitleKey: titleKey,
    relevantTermIds: [],
    entries: [],
  };
}
