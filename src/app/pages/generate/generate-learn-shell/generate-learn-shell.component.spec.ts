import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  GenerateLearnShellComponent,
  LEARN_NAV,
} from './generate-learn-shell.component';
import en from '../../../../assets/i18n/en.json';

/** Stands in for the area's pages, so the subnav has somewhere to navigate. */
@Component({ template: 'page' })
class StubPageComponent {}

describe('GenerateLearnShellComponent', () => {
  let fixture: ComponentFixture<GenerateLearnShellComponent>;
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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        GenerateLearnShellComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([
          { path: 'generate/learn', component: StubPageComponent },
          {
            path: 'generate/learn/tutorials/:flow',
            component: StubPageComponent,
          },
          { path: 'generate/learn/settings', component: StubPageComponent },
          {
            path: 'generate/learn/settings/:param',
            component: StubPageComponent,
          },
          { path: 'generate/learn/guide', component: StubPageComponent },
        ]),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(GenerateLearnShellComponent);
    fixture.detectChanges();
  });

  it('offers one entry per page, in order, each with its own href', () => {
    expect(links()).toHaveLength(LEARN_NAV.length);
    expect(links().map((link) => link.getAttribute('href'))).toEqual(
      LEARN_NAV.map((entry) => entry.link),
    );
  });

  it('carries the entry glyph beside a label of its own', () => {
    expect(
      links().every(
        (link) =>
          link.querySelector('.gs-hub-nav-mark') !== null &&
          link.querySelector('.gs-hub-nav-label') !== null,
      ),
    ).toBe(true);
  });

  it('says which page is on screen once, through aria-current alone', async () => {
    await router.navigateByUrl('/generate/learn/settings');
    fixture.detectChanges();

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

  it('has an English label for every entry and for the nav itself', () => {
    const translations = en as Record<string, string>;

    expect(translations['generate.learn.nav_label']).toBeTruthy();
    for (const entry of LEARN_NAV) {
      expect(
        translations[entry.labelKey],
        `missing translation ${entry.labelKey}`,
      ).toBeTruthy();
    }
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.gs-hub-nav')
        ?.getAttribute('aria-label'),
    ).toBe(translations['generate.learn.nav_label']);
  });

  it('marks the landing page only on the landing page', async () => {
    const translations = en as Record<string, string>;

    await router.navigateByUrl('/generate/learn');
    fixture.detectChanges();

    expect(current()).toBe(translations['generate.learn.nav_overview']);
  });

  it('keeps the examples entry marked for whichever flow is on screen', async () => {
    const translations = en as Record<string, string>;

    await router.navigateByUrl('/generate/learn/tutorials/inpainting');
    fixture.detectChanges();

    // The entry deep-links txt2img, so its own href is not the URL on screen.
    expect(current()).toBe(translations['generate.learn.nav_tutorials']);
    expect(links()[0].getAttribute('aria-current')).toBeNull();
  });

  it('offers the settings reference between the examples and the guide', () => {
    expect(LEARN_NAV.map((entry) => entry.labelKey)).toEqual([
      'generate.learn.nav_overview',
      'generate.learn.nav_tutorials',
      'generate.learn.nav_settings',
      'generate.learn.nav_guide',
    ]);
  });

  it('keeps the settings entry marked on one setting page', async () => {
    const translations = en as Record<string, string>;

    await router.navigateByUrl('/generate/learn/settings/steps');
    fixture.detectChanges();

    expect(current()).toBe(translations['generate.learn.nav_settings']);
  });

  it('marks the guide entry on the guide page', async () => {
    const translations = en as Record<string, string>;

    await router.navigateByUrl('/generate/learn/guide');
    fixture.detectChanges();

    expect(current()).toBe(translations['generate.learn.nav_guide']);
  });

  it('renders the page the route names beneath the subnav', async () => {
    await router.navigateByUrl('/generate/learn/guide');
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.gs-learn-outlet')
        ?.textContent,
    ).toContain('page');
  });
});
