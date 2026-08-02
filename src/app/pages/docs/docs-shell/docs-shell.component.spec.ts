import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { DOCS_AREAS, DocsShellComponent } from './docs-shell.component';
import en from '../../../../assets/i18n/en.json';

/** Stands in for the area's pages, so the subnav has somewhere to navigate. */
@Component({ template: 'page' })
class StubPageComponent {}

const translations = en as Record<string, string>;

/** The image area, which is the one the shell is exercised through. */
const IMAGE = DOCS_AREAS.find((area) => area.id === 'image')!;

describe('DocsShellComponent', () => {
  let fixture: ComponentFixture<DocsShellComponent>;
  let router: Router;

  const links = (): HTMLAnchorElement[] =>
    Array.from(
      (
        fixture.nativeElement as HTMLElement
      ).querySelectorAll<HTMLAnchorElement>('.gs-hub-nav-link'),
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
          { path: 'docs/image/guide', component: StubPageComponent },
        ]),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(DocsShellComponent);
    fixture.detectChanges();
  });

  it('carries no area chrome on the front door', async () => {
    // The front door is the page that says which areas there are, so a subnav
    // naming the pages of one of them would answer a question not yet asked.
    await go('/docs');

    expect(links()).toHaveLength(0);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.gs-docs-crumbs'),
    ).toBeNull();
  });

  it('names the area being read, and the way back out of it', async () => {
    await go('/docs/image/settings');

    const crumbs = (fixture.nativeElement as HTMLElement).querySelector(
      '.gs-docs-crumbs',
    );
    expect(crumbs?.textContent).toContain(translations['docs.title']);
    expect(crumbs?.textContent).toContain(translations[IMAGE.labelKey]);
    expect(crumbs?.querySelector('a')?.getAttribute('href')).toBe('/docs');
  });

  it('offers one entry per page of the area, in order, each with its href', async () => {
    await go('/docs/image');

    expect(links()).toHaveLength(IMAGE.entries.length);
    expect(links().map((link) => link.getAttribute('href'))).toEqual(
      IMAGE.entries.map((entry) => entry.link),
    );
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

  it('offers the settings reference between the examples and the guide', () => {
    expect(IMAGE.entries.map((entry) => entry.labelKey)).toEqual([
      'generate.learn.nav_overview',
      'generate.learn.nav_tutorials',
      'generate.learn.nav_settings',
      'generate.learn.nav_guide',
    ]);
  });

  it('keeps the settings entry marked on one setting page', async () => {
    await go('/docs/image/settings/steps');

    expect(current()).toBe(translations['generate.learn.nav_settings']);
  });

  it('marks the guide entry on the guide page', async () => {
    await go('/docs/image/guide');

    expect(current()).toBe(translations['generate.learn.nav_guide']);
  });

  it('renders the page the route names beneath the subnav', async () => {
    await go('/docs/image/guide');

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.gs-learn-outlet')
        ?.textContent,
    ).toContain('page');
  });
});
