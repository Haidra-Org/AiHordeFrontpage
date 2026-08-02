import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { GenerateShellComponent } from './generate-shell.component';
import { GlossaryService } from '../../services/glossary.service';
import { DOCS_IMAGE } from '../../content/docs-links';
import en from '../../../assets/i18n/en.json';

@Component({ template: 'studio' })
class StubPageComponent {}

const translations = en as Record<string, string>;

describe('GenerateShellComponent', () => {
  let fixture: ComponentFixture<GenerateShellComponent>;
  let router: Router;

  const links = (): HTMLAnchorElement[] =>
    Array.from(
      (
        fixture.nativeElement as HTMLElement
      ).querySelectorAll<HTMLAnchorElement>('.gs-subtab'),
    );

  const go = async (url: string): Promise<void> => {
    await router.navigateByUrl(url);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        GenerateShellComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([
          { path: 'generate/image', component: StubPageComponent },
          { path: 'generate/alchemy', component: StubPageComponent },
          { path: 'docs/image', component: StubPageComponent },
        ]),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(GenerateShellComponent);
    fixture.detectChanges();
  });

  it('is navigation rather than a tab set', () => {
    // Every one of these navigates, and the last leaves the studio entirely.
    // `tab` promises a panel that switches in place and a selected state to go
    // with it, neither of which is what happens here.
    const nav = (fixture.nativeElement as HTMLElement).querySelector('nav');

    expect(nav?.getAttribute('role')).toBeNull();
    expect(nav?.getAttribute('aria-label')).toBe(
      translations['generate.shell.tabs_label'],
    );
    expect(links().some((link) => link.getAttribute('role') === 'tab')).toBe(
      false,
    );
  });

  it('offers the two tools and the way out to the documentation', () => {
    expect(links().map((link) => link.getAttribute('href'))).toEqual([
      '/generate/image',
      '/generate/alchemy',
      DOCS_IMAGE,
    ]);
  });

  it('says which tool is on screen through aria-current', async () => {
    await go('/generate/alchemy');

    expect(links().map((link) => link.getAttribute('aria-current'))).toEqual([
      null,
      'page',
      null,
    ]);
  });

  it('never marks the documentation as the page on screen', async () => {
    // Reaching it means leaving this shell, so it is a way out rather than a
    // third tool that could be the current one.
    await go('/generate/image');

    expect(links()[2].getAttribute('aria-current')).toBeNull();
  });

  it('carries the only way into the glossary the studio has', () => {
    const glossary = TestBed.inject(GlossaryService);
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      '.gs-subtab-glossary',
    ) as HTMLButtonElement;

    expect(button.getAttribute('aria-label')).toBe(
      translations['help.open_glossary'],
    );
    button.click();

    expect(glossary.isOpen()).toBe(true);
  });
});
