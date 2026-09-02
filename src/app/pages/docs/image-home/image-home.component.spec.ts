import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsImageHomeComponent } from './image-home.component';
import { FLOWS } from '../../../content/flows';
import { ExampleFlow, ExampleManifest } from '../../../content/examples';
import en from '../../../../assets/i18n/en.json';
import manifest from '../../../testing/fixtures/example-manifest.stub.json';
import { EXAMPLES_ROOT } from '../../../content/examples';
import {
  TutorialEngineService,
  canonicalFlowId,
  resolveFlowId,
} from '../../../services/tutorial-engine.service';

// The real committed manifest is the fixture: a landing page offering a
// technique there is no worked example of is exactly what this guards.
const MANIFEST = manifest as unknown as ExampleManifest;
const TRANSLATIONS = en as Record<string, string>;

/** The ids the page enumerates: a world variant is not a card of its own. */
const CANONICAL = MANIFEST.flows.filter(
  (flow) => canonicalFlowId(flow.id) === flow.id,
);
const PUBLISHED = MANIFEST.flows
  .filter((flow) => flow.status === 'available')
  .map((flow) => flow.id);

/** The committed set with every world but the first taken back out again. */
const NO_VARIANTS: ExampleManifest = { ...MANIFEST, flows: CANONICAL };

/**
 * The same library with one technique unserved. Every published example is
 * available at the moment, so the state is built here rather than pinned into
 * the fixture; remix is the flow that really reaches it, being served on Stable
 * Cascade alone and generated only when a worker is carrying one.
 */
const SKIPPED_ID = 'remix';
const SKIPPED_REASON =
  'No workers were serving Stable Cascade 1.0 when the examples were generated.';
const SKIPPED_MANIFEST: ExampleManifest = {
  ...MANIFEST,
  flows: MANIFEST.flows.map((flow) =>
    flow.id === SKIPPED_ID ? skip(flow) : flow,
  ),
};

/** One manifest entry as the generator writes it when nothing was produced. */
function skip(flow: ExampleFlow): ExampleFlow {
  const { id, directory, title, summary } = flow;
  return {
    id,
    directory,
    title,
    summary,
    status: 'skipped',
    files: ['SKIPPED.md'],
    skipped_reason: SKIPPED_REASON,
  };
}

/** The keys the page writes out itself rather than deriving from a flow. */
const OWN_KEYS = [
  'hero_eyebrow',
  'hero_title',
  'hero_sub',
  'hero_cta',
  'hero_cta_hint',
  'hero_migrate_cta',
  'hero_migrate_hint',
  'understand_head',
  'understand_images_title',
  'understand_images_hint',
  'understand_horde_title',
  'understand_horde_hint',
  'understand_start',
  'further_head',
  'further_kind',
  'world_label',
  'world_note',
  'world.w1',
  'world.w2',
  'world.w3',
];

describe('DocsImageHomeComponent', () => {
  let fixture: ComponentFixture<DocsImageHomeComponent>;
  let component: DocsImageHomeComponent;
  let http: HttpTestingController;

  const query = <T extends Element>(selector: string): T[] =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<T>(selector),
    );

  const text = (): string =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  /** Answers the manifest request the page makes on construction. */
  function flush(manifestData: ExampleManifest = MANIFEST): void {
    http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifestData);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    // The world preference is global and persisted; one test's choice must not
    // reach the next one.
    localStorage.clear();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        DocsImageHomeComponent,
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

    fixture = TestBed.createComponent(DocsImageHomeComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  it('leads with the walkthrough, backed by the image that example made', () => {
    flush();

    const hero = query<HTMLImageElement>('.gs-learn-hero-bg')[0];
    const txt2img = MANIFEST.flows.find((flow) => flow.id === 'txt2img');

    expect(hero.getAttribute('src')).toBe(
      `${EXAMPLES_ROOT}/${txt2img?.directory}/${txt2img?.result}`,
    );
    // A backdrop, not content: the copy over it says everything it says.
    expect(hero.getAttribute('alt')).toBe('');
    expect(query('.gs-learn-hero-title')[0].textContent).toContain(
      TRANSLATIONS['generate.learn.hero_title'],
    );
    // The title is the page's only h1: everything under it is a band.
    expect(query('h1')).toHaveLength(1);
    expect(query('.gs-learn-hero-title')[0].tagName).toBe('H1');
  });

  it('sets the area landmark over the title', () => {
    flush();

    expect(query('.gs-learn-hero-eyebrow')[0].textContent).toContain(
      TRANSLATIONS['generate.learn.hero_eyebrow'],
    );
  });

  it('arms the first walkthrough and goes to the studio from the hero', () => {
    flush();
    const engine = TestBed.inject(TutorialEngineService);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    query<HTMLButtonElement>('.gs-learn-hero-door')[0].click();

    expect(navigate).toHaveBeenCalledWith('/generate/image');
    // Held in memory rather than routed, as the examples page hands off too.
    expect(engine.consumeArmed()).toBe('txt2img');
  });

  it('offers the reader arriving from another tool a door of equal rank', () => {
    flush();

    const doors = query<HTMLButtonElement>('.gs-learn-hero-door');

    expect(component.heroDoors.map((door) => door.flow)).toEqual([
      'txt2img',
      'concepts_migrating',
    ]);
    expect(doors).toHaveLength(2);
    // One treatment across the pair: the second is another way in rather than a
    // footnote to the first, so neither carries a class the other does not.
    expect(new Set(doors.map((door) => door.className)).size).toBe(1);
    expect(doors[0].textContent).toContain(
      TRANSLATIONS['generate.learn.hero_cta'],
    );
    expect(doors[1].textContent).toContain(
      TRANSLATIONS['generate.learn.hero_migrate_cta'],
    );
    expect(doors[1].textContent).toContain(
      TRANSLATIONS['generate.learn.hero_migrate_hint'],
    );
  });

  it('arms the migrating track from the hero, as the walkthrough door does', () => {
    flush();
    const engine = TestBed.inject(TutorialEngineService);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    query<HTMLButtonElement>('.gs-learn-hero-door')[1].click();

    expect(navigate).toHaveBeenCalledWith('/generate/image');
    expect(engine.consumeArmed()).toBe('concepts_migrating');
  });

  it('makes every door of the band a track that is started', () => {
    flush();

    // The band is the two concept tracks and nothing else: what the panel's
    // controls do is the settings reference's subject, and the subnav is where
    // that is offered.
    expect(query('a.gs-learn-door')).toHaveLength(0);
    expect(query('.gs-learn-door')).toHaveLength(
      component.understandDoors.length,
    );
  });

  it('carries a mark and an affordance on every entry of the band', () => {
    flush();

    const doors = query<HTMLElement>('.gs-learn-door');

    expect(
      doors.every((door) => door.querySelector('.gs-learn-door-mark') !== null),
    ).toBe(true);
    expect(
      doors.map((door) =>
        door.querySelector('.gs-learn-door-go')?.textContent?.trim(),
      ),
    ).toEqual([
      TRANSLATIONS['generate.learn.understand_start'],
      TRANSLATIONS['generate.learn.understand_start'],
    ]);
  });

  it('leads the band with the two concept tracks', () => {
    flush();

    const tracks = query<HTMLButtonElement>('button.gs-learn-door');

    expect(component.understandDoors.map((door) => door.flow)).toEqual([
      'concepts_images',
      'concepts_horde',
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
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    query<HTMLButtonElement>('button.gs-learn-door')[1].click();

    expect(navigate).toHaveBeenCalledWith('/generate/image');
    expect(engine.consumeArmed()).toBe('concepts_horde');
  });

  it('shelves every technique but the one the hero already offers', () => {
    flush();

    const cards = query<HTMLAnchorElement>('.gs-home-card');

    expect(cards).toHaveLength(CANONICAL.length - 1);
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
      component.shelf().map((flow) => `/docs/image/learn/${flow.id}`),
    );
  });

  it('names each card by what it makes, over the image it made', () => {
    flush();

    const cards = query<HTMLAnchorElement>('.gs-home-card');

    const shelf = component.shelf();

    shelf.forEach((card, index) => {
      expect(
        cards[index].querySelector('.gs-home-card-title')?.textContent,
      ).toContain(
        TRANSLATIONS[`generate.tutorials.flows.${card.id}.task_name`],
      );
      expect(cards[index].textContent).toContain(component.summaryFor(card));
      // Every card says what kind of thing it is before it says which one.
      expect(
        cards[index].querySelector('.gs-learn-eyebrow')?.textContent,
      ).toContain(TRANSLATIONS['generate.learn.further_kind']);
    });
    // A card carries an image exactly when its example produced one, and never
    // eagerly: the shelf is a screen below where the page opens.
    expect(
      cards.map(
        (card) =>
          card.querySelector('.gs-home-card-img')?.getAttribute('loading') ??
          null,
      ),
    ).toEqual(shelf.map((card) => (card.image ? 'lazy' : null)));
  });

  it('asks for no per-flow summary on a concept track', () => {
    // A track's copy is written per step, so the summary key a technique has is
    // one a track never gets; probing for it would put the key itself on the
    // card and a missing-translation warning in the console.
    const track = FLOWS.find((flow) => flow.concept)!;
    flush();

    expect(
      TRANSLATIONS[`generate.tutorials.flows.${track.id}.summary`],
    ).toBeUndefined();
    expect(
      component.summaryFor({
        id: track.id,
        published: null,
        image: '',
        unavailable: false,
        skippedReason: '',
      }),
    ).toBe('');
  });

  it('keeps an unserved technique on the shelf, saying why', () => {
    flush(SKIPPED_MANIFEST);

    const card = query<HTMLAnchorElement>('.gs-home-card').at(-1);

    expect(component.shelf().at(-1)?.id).toBe(SKIPPED_ID);
    // A passive badge qualifying the example, so it rides the card's eyebrow
    // rather than the title of the technique itself.
    expect(
      card?.querySelector('.gs-learn-eyebrow .gs-tut-chip-tag')?.textContent,
    ).toContain(TRANSLATIONS['generate.tutorials.unavailable_tag']);
    expect(card?.textContent).toContain(SKIPPED_REASON);
    // Nothing is shown for a run that never happened.
    expect(card?.querySelector('.gs-home-card-img')).toBeNull();
  });

  it('still shelves every technique when the library cannot be reached', () => {
    // The shelf is the list of what there is to read, which the app knows on
    // its own. Losing the library costs the cards their pictures and their
    // one-line summaries, not their place on the shelf or their link.
    http
      .expectOne(`${EXAMPLES_ROOT}/manifest.json`)
      .error(new ProgressEvent('failed'));
    fixture.detectChanges();

    expect(component.loadFailed()).toBe(true);
    expect(query('.gs-home-card').length).toBeGreaterThan(0);
    expect(query('.gs-home-card-img')).toHaveLength(0);
    expect(text()).toContain(TRANSLATIONS['generate.tutorials.load_error']);
  });

  describe('the world the examples are drawn from', () => {
    it('offers no switcher while every example is drawn once', () => {
      flush(NO_VARIANTS);

      expect(component.worldChoice()).toBe(false);
      expect(query('.gs-learn-worlds')).toHaveLength(0);
    });

    it('offers the three worlds once any of them has been drawn', () => {
      flush();

      const options = query<HTMLButtonElement>('.gs-learn-worlds .gs-world');

      expect(component.worldChoice()).toBe(true);
      expect(
        options.map((option) =>
          option.querySelector('.gs-world-name')?.textContent?.trim(),
        ),
      ).toEqual([
        TRANSLATIONS['generate.learn.world.w1'],
        TRANSLATIONS['generate.learn.world.w2'],
        TRANSLATIONS['generate.learn.world.w3'],
      ]);
      expect(
        options.map((option) => option.getAttribute('aria-pressed')),
      ).toEqual(['true', 'false', 'false']);
    });

    it('re-draws the hero and the shelf from the chosen world', () => {
      flush();

      const before = query<HTMLAnchorElement>('.gs-home-card').map((card) =>
        card.getAttribute('href'),
      );

      query<HTMLButtonElement>('.gs-learn-worlds .gs-world')[1].click();
      fixture.detectChanges();

      // Every card takes the second world's pictures where it has them and
      // keeps the first world's where it has not, and no card's URL moves,
      // because a variant is not a technique of its own.
      const canonical = before.map((href) => href!.split('/').pop()!);

      expect(component.heroImage()).toContain('/txt2img--w2/');
      expect(component.shelf().map((flow) => flow.id)).toEqual(
        canonical.map((id) => resolveFlowId(id, 'w2', PUBLISHED)),
      );
      expect(component.shelf().map((flow) => canonicalFlowId(flow.id))).toEqual(
        canonical,
      );
      expect(
        query<HTMLAnchorElement>('.gs-home-card').map((card) =>
          card.getAttribute('href'),
        ),
      ).toEqual(before);
      expect(before.join(' ')).not.toContain('--w');
    });

    it('keeps the choice for the tutorial the studio then runs', () => {
      flush();

      query<HTMLButtonElement>('.gs-learn-worlds .gs-world')[2].click();

      expect(TestBed.inject(TutorialEngineService).world()).toBe('w3');
      expect(localStorage.getItem('aihorde.generate.learn.world')).toContain(
        'w3',
      );
    });
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
