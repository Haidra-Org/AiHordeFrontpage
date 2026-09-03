import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCS_AREAS, DocsShellComponent } from './docs-shell.component';
import {
  DOCS_IMAGE,
  STUDIO_ALCHEMY,
  STUDIO_IMAGE,
} from '../../../content/docs-links';
import en from '../../../../assets/i18n/en.json';
import { StickyRegistryService } from '../../../services/sticky-registry.service';
import { GlossaryService } from '../../../services/glossary.service';

/** Stands in for the area's pages, so the subnav has somewhere to navigate. */
@Component({ template: 'page' })
class StubPageComponent {}

const translations = en as Record<string, string>;

/** The image area, which is the one the shell is exercised through. */
const IMAGE = DOCS_AREAS.find((area) => area.id === 'image')!;

/** The second area, which is what proves the shell knows areas rather than pages. */
const ALCHEMY = DOCS_AREAS.find((area) => area.id === 'alchemy')!;

describe('DocsShellComponent', () => {
  let fixture: ComponentFixture<DocsShellComponent>;
  let router: Router;

  /** The row's page entries. The glossary shares their shape and goes nowhere. */
  const links = (): HTMLAnchorElement[] =>
    Array.from(
      (
        fixture.nativeElement as HTMLElement
      ).querySelectorAll<HTMLAnchorElement>('a.gs-hub-nav-link'),
    );

  const glossaryEntry = (): HTMLButtonElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.gs-hub-nav-glossary',
    );

  const areaLinks = (): HTMLAnchorElement[] =>
    Array.from(
      (
        fixture.nativeElement as HTMLElement
      ).querySelectorAll<HTMLAnchorElement>('.gs-docs-area-link'),
    );

  const studioLinks = (): HTMLAnchorElement[] =>
    Array.from(
      (
        fixture.nativeElement as HTMLElement
      ).querySelectorAll<HTMLAnchorElement>('.gs-docs-studio-link'),
    );

  /** The phone's bottom bar of creation tools, drawn by the shell. */
  const tools = (): HTMLAnchorElement[] =>
    Array.from(
      (
        fixture.nativeElement as HTMLElement
      ).querySelectorAll<HTMLAnchorElement>('.gs-subtab'),
    );

  /** The entry the subnav is currently marking as the page on screen. */
  const current = (): string | null =>
    links()
      .find((link) => link.getAttribute('aria-current') === 'page')
      ?.textContent?.trim() ?? null;

  const go = async (url: string): Promise<void> => {
    await router.navigateByUrl(url);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        DocsShellComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([
          { path: 'docs', component: StubPageComponent },
          { path: 'docs/image', component: StubPageComponent },
          { path: 'docs/image/learn/:flow', component: StubPageComponent },
          { path: 'docs/image/settings', component: StubPageComponent },
          { path: 'docs/image/settings/:param', component: StubPageComponent },
          { path: 'docs/image/control-types', component: StubPageComponent },
          { path: 'docs/alchemy', component: StubPageComponent },
          { path: 'docs/alchemy/:useCase', component: StubPageComponent },
          // Stands for a page that needs the foot of the screen for itself.
          {
            path: 'docs/quiet',
            component: StubPageComponent,
            data: { toolTabs: false },
          },
        ]),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    // The row moves to keep the entry it marks in view, which the test DOM has
    // no implementation of either call for.
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.scrollTo = vi.fn();
    fixture = TestBed.createComponent(DocsShellComponent);
    fixture.detectChanges();
  });

  it('carries no area chrome on the front door', async () => {
    // The front door is the page that says which areas there are, so a subnav
    // naming the pages of one of them would answer a question not yet asked.
    await go('/docs');

    expect(links()).toHaveLength(0);
    expect(areaLinks()).toHaveLength(0);
    expect(studioLinks()).toHaveLength(0);
  });

  it('offers one entry per page of the area, in order, each with its href', async () => {
    await go('/docs/image');

    expect(links()).toHaveLength(IMAGE.entries.length);
    expect(links().map((link) => link.getAttribute('href'))).toEqual(
      IMAGE.entries.map((entry) => entry.link),
    );
  });

  it('keeps the two docs areas visible as one switcher and marks the one being read', async () => {
    await go('/docs/alchemy/enlarge');

    expect(areaLinks().map((link) => link.getAttribute('href'))).toEqual([
      '/docs/image',
      '/docs/alchemy',
    ]);
    expect(
      areaLinks().map((link) => link.getAttribute('aria-current')),
    ).toEqual([null, 'page']);
  });

  it('keeps a direct return link into the studio of the area being read', async () => {
    await go('/docs/image/control-types');
    expect(studioLinks().map((link) => link.getAttribute('href'))).toEqual([
      STUDIO_IMAGE,
    ]);

    await go('/docs/alchemy');
    expect(studioLinks().map((link) => link.getAttribute('href'))).toEqual([
      STUDIO_ALCHEMY,
    ]);
  });

  it('carries the entry glyph beside a label of its own', async () => {
    await go('/docs/image');

    expect(
      links().every(
        (link) =>
          link.querySelector('.gs-hub-nav-mark') !== null &&
          link.querySelector('.gs-hub-nav-label') !== null,
      ),
    ).toBe(true);
  });

  it('says which page is on screen once, through aria-current alone', async () => {
    await go('/docs/image/settings');

    // The underline is drawn from `aria-current`, so a second state class
    // would be a second place for the two to disagree.
    expect(links().map((link) => link.getAttribute('aria-current'))).toEqual([
      null,
      null,
      'page',
      null,
    ]);
    expect(links().some((link) => link.className.includes('--on'))).toBe(false);
  });

  it('has an English label for every entry and for the nav itself', async () => {
    await go('/docs/image');

    expect(translations['generate.learn.nav_label']).toBeTruthy();
    expect(translations['docs.area_switcher_label']).toBeTruthy();
    expect(translations['docs.studio_jump_label']).toBeTruthy();
    expect(translations['docs.studio_jump']).toBeTruthy();
    for (const area of DOCS_AREAS) {
      expect(
        translations[area.labelKey],
        `missing translation ${area.labelKey}`,
      ).toBeTruthy();
      for (const entry of area.entries) {
        expect(
          translations[entry.labelKey],
          `missing translation ${entry.labelKey}`,
        ).toBeTruthy();
      }
    }
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.gs-hub-nav')
        ?.getAttribute('aria-label'),
    ).toBe(translations['generate.learn.nav_label']);
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.gs-docs-areas')
        ?.getAttribute('aria-label'),
    ).toBe(translations['docs.area_switcher_label']);
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.gs-docs-studio-link')
        ?.getAttribute('aria-label'),
    ).toBe(translations['docs.studio_jump_label']);
  });

  it('marks the area landing page only on the landing page', async () => {
    await go('/docs/image');

    expect(current()).toBe(translations['generate.learn.nav_overview']);
  });

  it('keeps the examples entry marked for whichever technique is on screen', async () => {
    await go('/docs/image/learn/inpainting');

    // The entry deep-links txt2img, so its own href is not the URL on screen.
    expect(current()).toBe(translations['generate.learn.nav_tutorials']);
    expect(links()[0].getAttribute('aria-current')).toBeNull();
  });

  it('offers the settings reference between the examples and the control types', () => {
    expect(IMAGE.entries.map((entry) => entry.labelKey)).toEqual([
      'generate.learn.nav_overview',
      'generate.learn.nav_tutorials',
      'generate.learn.nav_settings',
      'docs.nav_control_types',
    ]);
  });

  it('marks the control types entry on the page that shows them', async () => {
    await go('/docs/image/control-types');

    expect(current()).toBe(translations['docs.nav_control_types']);
  });

  it('keeps the settings entry marked on one setting page', async () => {
    await go('/docs/image/settings/steps');

    expect(current()).toBe(translations['generate.learn.nav_settings']);
  });

  it('switches to the alchemy area, chrome and all, on its own URLs', async () => {
    await go('/docs/alchemy/enlarge');

    expect(
      areaLinks().map((link) => link.getAttribute('aria-current')),
    ).toEqual([null, 'page']);
    expect(links()).toHaveLength(ALCHEMY.entries.length);
    // The row says the short name; the page it opens keeps the full one.
    expect(current()).toBe(translations['alchemy.usecases.enlarge.short']);
  });

  it('keeps the phone tool bar the reader arrived on, with the documentation as the page on screen', async () => {
    await go('/docs/image/control-types');

    const tabs = tools();
    expect(tabs.map((tab) => tab.getAttribute('href'))).toEqual([
      STUDIO_IMAGE,
      STUDIO_ALCHEMY,
      DOCS_IMAGE,
    ]);
    // Reading is where the reader is; the other two slots leave for the studio.
    expect(tabs.map((tab) => tab.getAttribute('aria-current'))).toEqual([
      null,
      null,
      'page',
    ]);
  });

  it('draws the bar only as the bottom bar, never as a second row of chrome', async () => {
    // The wide screen already has the docs bridge and the area's own row.
    await go('/docs/image');

    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.gs-subtabs')
        ?.classList.contains('gs-subtabs--phone-only'),
    ).toBe(true);
  });

  it('stands the bar down where the route asks for the foot of the screen', async () => {
    await go('/docs/quiet');

    expect(tools()).toHaveLength(0);
  });

  describe('the pinned chrome', () => {
    /** Listeners the stubbed media query is holding, so a test can cross it. */
    let listeners: Set<(event: MediaQueryListEvent) => void>;

    /** Stand in for a viewport on one side of the width the chrome pins at. */
    const stubViewport = (matches: boolean): void => {
      listeners = new Set();
      vi.stubGlobal('matchMedia', (media: string) => ({
        matches,
        media,
        addEventListener: (
          _type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => listeners.add(listener),
        removeEventListener: (
          _type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => listeners.delete(listener),
      }));
    };

    /** A shell built after the viewport is stubbed, on a page of an area. */
    const shellOnAPage = async (): Promise<
      ComponentFixture<DocsShellComponent>
    > => {
      await router.navigateByUrl('/docs/image/control-types');
      const shell = TestBed.createComponent(DocsShellComponent);
      shell.detectChanges();
      return shell;
    };

    afterEach(() => vi.unstubAllGlobals());

    it('takes its place in the sticky registry where it pins', async () => {
      stubViewport(true);
      const register = vi.spyOn(
        TestBed.inject(StickyRegistryService),
        'register',
      );

      const shell = await shellOnAPage();

      const chrome = (shell.nativeElement as HTMLElement).querySelector(
        '.gs-docs-chrome',
      );
      // Under the site nav, above anything a page of the area pins for itself.
      expect(register).toHaveBeenCalledWith(chrome, 10);
    });

    it('takes no place in the offset on a screen that does not pin it', async () => {
      stubViewport(false);
      const register = vi.spyOn(
        TestBed.inject(StickyRegistryService),
        'register',
      );

      const shell = await shellOnAPage();

      const chrome = (shell.nativeElement as HTMLElement).querySelector(
        '.gs-docs-chrome',
      );
      expect(register).not.toHaveBeenCalledWith(chrome, 10);
    });

    it('gives its place back when the window grows past the pinning width', async () => {
      stubViewport(true);
      const registry = TestBed.inject(StickyRegistryService);
      const unregister = vi.spyOn(registry, 'unregister');

      const shell = await shellOnAPage();
      for (const listener of listeners) {
        listener({ matches: false } as MediaQueryListEvent);
      }
      shell.detectChanges();

      const chrome = (shell.nativeElement as HTMLElement).querySelector(
        '.gs-docs-chrome',
      );
      expect(unregister).toHaveBeenCalledWith(chrome);
    });
  });

  it('renders the page the route names beneath the subnav', async () => {
    await go('/docs/image/control-types');

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.gs-learn-outlet')
        ?.textContent,
    ).toContain('page');
  });

  it('gives the page it renders the document its main landmark', async () => {
    await go('/docs/image/control-types');

    const mains = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'main',
    );
    expect(mains).toHaveLength(1);
    expect(mains[0].className).toContain('gs-learn-outlet');
  });

  it('brings the entry it marks into the middle of the row', async () => {
    const scrollIntoView = vi.fn();
    const scrollTo = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    Element.prototype.scrollTo = scrollTo;

    await go('/docs/image/settings');

    const marked = links().find(
      (link) => link.getAttribute('aria-current') === 'page',
    );
    expect(marked).toBeDefined();
    // The row is scrolled, not the entry brought into view: bringing it into
    // view would move the page and hand Chromium a new place to start tabbing.
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo.mock.instances.at(-1)).toBe(
      (fixture.nativeElement as HTMLElement).querySelector('.gs-hub-nav'),
    );
    expect(scrollTo.mock.calls.at(-1)?.[0]).toMatchObject({
      left: expect.any(Number),
      top: expect.any(Number),
    });
  });

  it('carries the glossary in the row, where the floating button is withheld', async () => {
    const glossary = TestBed.inject(GlossaryService);
    const open = vi.spyOn(glossary, 'open');

    await go('/docs/image/settings');
    const entry = glossaryEntry();
    expect(entry).not.toBeNull();
    expect(entry?.textContent?.trim()).toBe(translations['docs.nav_glossary']);

    entry?.click();
    expect(open).toHaveBeenCalled();
  });
});
