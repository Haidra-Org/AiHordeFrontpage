import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateLearnHomeComponent } from './generate-learn-home.component';
import { TutorialManifest } from '../generate-tutorials/generate-tutorials.component';
import en from '../../../../assets/i18n/en.json';
import manifest from '../../../../assets/tutorials/manifest.json';
import { TutorialEngineService } from '../../../services/tutorial-engine.service';

// The real committed manifest is the fixture: a landing page offering a
// technique there is no worked example of is exactly what this guards.
const MANIFEST = manifest as unknown as TutorialManifest;
const TRANSLATIONS = en as Record<string, string>;

/** The keys the page writes out itself rather than deriving from a flow. */
const OWN_KEYS = [
  'hero_title',
  'hero_sub',
  'hero_cta',
  'understand_head',
  'understand_images_title',
  'understand_images_hint',
  'understand_horde_title',
  'understand_horde_hint',
  'understand_guide_title',
  'understand_guide_hint',
  'further_head',
];

describe('GenerateLearnHomeComponent', () => {
  let fixture: ComponentFixture<GenerateLearnHomeComponent>;
  let component: GenerateLearnHomeComponent;
  let http: HttpTestingController;

  const query = <T extends Element>(selector: string): T[] =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<T>(selector),
    );

  const text = (): string =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  /** Answers the manifest request the page makes on construction. */
  function flush(): void {
    http.expectOne('/assets/tutorials/manifest.json').flush(MANIFEST);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        GenerateLearnHomeComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GenerateLearnHomeComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  it('leads with the walkthrough, backed by the image that example made', () => {
    flush();

    const hero = query<HTMLImageElement>('.gs-learn-hero-bg')[0];
    const txt2img = MANIFEST.flows.find((flow) => flow.id === 'txt2img');

    expect(hero.getAttribute('src')).toBe(
      `/assets/tutorials/${txt2img?.directory}/${txt2img?.result}`,
    );
    // A backdrop, not content: the copy over it says everything it says.
    expect(hero.getAttribute('alt')).toBe('');
    expect(query('.gs-learn-hero-title')[0].textContent).toContain(
      TRANSLATIONS['generate.learn.hero_title'],
    );
  });

  it('arms the first walkthrough and goes to the studio from the hero', () => {
    flush();
    const engine = TestBed.inject(TutorialEngineService);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    query<HTMLButtonElement>('.gs-learn-hero-cta')[0].click();

    expect(navigate).toHaveBeenCalledWith(['/generate/image']);
    // Held in memory rather than routed, as the examples page hands off too.
    expect(engine.consumeArmed()).toBe('txt2img');
  });

  it('offers the written guide as a door of its own', () => {
    flush();

    const routed = query<HTMLAnchorElement>('a.gs-learn-door');

    expect(query('.gs-learn-door')).toHaveLength(
      component.understandDoors.length,
    );
    expect(routed).toHaveLength(1);
    expect(routed[0].getAttribute('href')).toBe('/generate/learn/guide');
    expect(routed[0].textContent).toContain(
      TRANSLATIONS['generate.learn.understand_guide_title'],
    );
  });

  it('leads the band with the two concept tracks', () => {
    flush();

    const tracks = query<HTMLButtonElement>('button.gs-learn-door');

    expect(component.understandDoors.map((door) => door.flow)).toEqual([
      'concepts_images',
      'concepts_horde',
      undefined,
    ]);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].textContent).toContain(
      TRANSLATIONS['generate.learn.understand_images_title'],
    );
    expect(tracks[0].textContent).toContain(
      TRANSLATIONS['generate.learn.understand_images_hint'],
    );
    expect(tracks[1].textContent).toContain(
      TRANSLATIONS['generate.learn.understand_horde_title'],
    );
  });

  it('arms a track and goes to the studio, as the hero does', () => {
    flush();
    const engine = TestBed.inject(TutorialEngineService);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    query<HTMLButtonElement>('button.gs-learn-door')[1].click();

    expect(navigate).toHaveBeenCalledWith(['/generate/image']);
    expect(engine.consumeArmed()).toBe('concepts_horde');
  });

  it('shelves every technique but the one the hero already offers', () => {
    flush();

    const cards = query<HTMLAnchorElement>('.gs-home-card');

    expect(cards).toHaveLength(MANIFEST.flows.length - 1);
    expect(component.shelf().map((flow) => flow.id)).toEqual([
      'img2img',
      'inpainting',
      'transparent',
      'facefix',
      'qr_code',
      'controlnet',
      'remix',
    ]);
    expect(cards.map((card) => card.getAttribute('href'))).toEqual(
      component.shelf().map((flow) => `/generate/learn/tutorials/${flow.id}`),
    );
  });

  it('names each card by what it makes, over the image it made', () => {
    flush();

    const cards = query<HTMLAnchorElement>('.gs-home-card');

    const shelf = component.shelf();

    shelf.forEach((flow, index) => {
      expect(cards[index].textContent).toContain(
        TRANSLATIONS[`generate.tutorials.flows.${flow.id}.task_name`],
      );
      expect(cards[index].textContent).toContain(component.summaryFor(flow));
    });
    // A card carries an image exactly when its example produced one, and never
    // eagerly: the shelf is a screen below where the page opens.
    expect(
      cards.map(
        (card) =>
          card.querySelector('.gs-home-card-img')?.getAttribute('loading') ??
          null,
      ),
    ).toEqual(shelf.map((flow) => (flow.result ? 'lazy' : null)));
  });

  it('keeps the unserved technique on the shelf, saying why', () => {
    flush();

    const skipped = MANIFEST.flows.find((flow) => flow.status === 'skipped');
    const card = query<HTMLAnchorElement>('.gs-home-card').at(-1);

    expect(component.shelf().at(-1)?.id).toBe(skipped?.id);
    expect(card?.textContent).toContain(
      TRANSLATIONS['generate.tutorials.unavailable_tag'],
    );
    expect(card?.textContent).toContain(skipped?.skipped_reason ?? '');
    // Nothing is shown for a run that never happened.
    expect(card?.querySelector('.gs-home-card-img')).toBeNull();
  });

  it('says the shelf could not be loaded rather than showing an empty one', () => {
    http
      .expectOne('/assets/tutorials/manifest.json')
      .error(new ProgressEvent('failed'));
    fixture.detectChanges();

    expect(component.loadFailed()).toBe(true);
    expect(query('.gs-home-card')).toHaveLength(0);
    expect(text()).toContain(TRANSLATIONS['generate.tutorials.load_error']);
  });

  it('has an English string for every key the page asks for', () => {
    for (const key of OWN_KEYS) {
      expect(
        TRANSLATIONS[`generate.learn.${key}`],
        `missing translation generate.learn.${key}`,
      ).toBeTruthy();
    }
    expect(TRANSLATIONS['generate.learn.example_alt']).toBeTruthy();
  });
});
