import { Component, WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateShellComponent } from './generate-shell.component';
import { GlossaryService } from '../../services/glossary.service';
import { FullscreenService } from '../../services/fullscreen.service';
import { DOCS_IMAGE } from '../../content/docs-links';
import en from '../../../assets/i18n/en.json';

@Component({ template: 'studio' })
class StubPageComponent {}

const translations = en as Record<string, string>;

describe('GenerateShellComponent', () => {
  let fixture: ComponentFixture<GenerateShellComponent>;
  let router: Router;
  let fullscreenActive: WritableSignal<boolean>;

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
    fullscreenActive = signal(false);
    const fullscreen = {
      available: true,
      active: fullscreenActive.asReadonly(),
      immersive: signal(false),
      phone: signal(false),
      // The one state the shell draws from: either route to the whole screen.
      filling: fullscreenActive.asReadonly(),
      setTarget: () => undefined,
      toggle: () => Promise.resolve(),
      enter: () => Promise.resolve(),
      exit: () => {
        fullscreenActive.set(false);
        return Promise.resolve();
      },
      exitImmersive: () => undefined,
    } as unknown as FullscreenService;

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
        { provide: FullscreenService, useValue: fullscreen },
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

  it('names each tool twice, so a narrow bar can say it shorter', () => {
    // The bottom bar gives each tool a third of a phone, which the full names
    // do not fit into. Both are rendered and CSS picks one, so neither width
    // arrives with a clipped word.
    expect(
      links().map((link) => [
        link
          .querySelector('.gs-subtab-long')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim(),
        link.querySelector('.gs-subtab-short')?.textContent?.trim(),
      ]),
    ).toEqual([
      // The image tool wears the studio's Beta chip beside its name.
      [
        `${translations['generate.shell.tab_image']} ${translations['generate.beta_badge']}`,
        'Image',
      ],
      [translations['generate.shell.tab_alchemy'], 'Alchemy'],
      [translations['generate.shell.tab_docs'], 'Learn'],
    ]);
  });

  it('reads out the long name whichever one is drawn', () => {
    // The short word is for the eye. A reader who cannot see the icon over it
    // gets the name that says what the tool is.
    expect(links().map((link) => link.getAttribute('aria-label'))).toEqual([
      translations['generate.shell.tab_image'],
      translations['generate.shell.tab_alchemy'],
      translations['generate.shell.tab_docs'],
    ]);
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

  it('offers the way back only while the studio has the screen', () => {
    // jsdom grants no fullscreen, so the state is driven directly: what matters
    // here is that the floating control follows it and names itself plainly.
    const exit = (): HTMLButtonElement | null =>
      (fixture.nativeElement as HTMLElement).querySelector('.gs-fs-exit');

    expect(exit()).toBeNull();

    fullscreenActive.set(true);
    fixture.detectChanges();

    expect(exit()?.getAttribute('aria-label')).toBe(
      translations['generate.shell.fullscreen_exit'],
    );

    fullscreenActive.set(false);
    fixture.detectChanges();

    expect(exit()).toBeNull();
  });

  it('has a short name for every tool to fall back on', () => {
    // Guards the pair: a tool whose short key went missing would render an
    // empty word in the bottom bar rather than falling back to the long one.
    for (const key of [
      'generate.shell.tab_image_short',
      'generate.shell.tab_alchemy_short',
      'generate.shell.tab_docs_short',
    ]) {
      expect(translations[key]).toBeTruthy();
    }
  });
});

describe('GenerateShellComponent in-page whole screen', () => {
  afterEach(() => {
    document.body.classList.remove('gs-immersive');
    vi.unstubAllGlobals();
  });

  it('takes the in-page mode with it when the reader leaves the studio', async () => {
    // The real service here: the mark is on the body, which outlives this
    // component, so a page reached from the studio would otherwise arrive with
    // no nav bar and no way to ask for one back.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        media: '',
        addEventListener: (): void => undefined,
        removeEventListener: (): void => undefined,
        // The CDK's breakpoint observer still reaches for the old pair.
        addListener: (): void => undefined,
        removeListener: (): void => undefined,
      })),
    );
    await TestBed.configureTestingModule({
      imports: [
        GenerateShellComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideRouter([])],
    }).compileComponents();

    const shell = TestBed.createComponent(GenerateShellComponent);
    shell.detectChanges();
    const fullscreen = TestBed.inject(FullscreenService);

    expect(fullscreen.available).toBe(false);
    expect(fullscreen.phone()).toBe(true);

    await fullscreen.toggle();
    shell.detectChanges();

    expect(fullscreen.immersive()).toBe(true);
    expect(document.body.classList.contains('gs-immersive')).toBe(true);
    expect(
      (shell.nativeElement as HTMLElement).querySelector('.gs-fs-exit'),
    ).not.toBeNull();

    shell.destroy();

    expect(fullscreen.immersive()).toBe(false);
    expect(document.body.classList.contains('gs-immersive')).toBe(false);
  });
});
