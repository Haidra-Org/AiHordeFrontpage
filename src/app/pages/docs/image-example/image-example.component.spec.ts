import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsImageExampleComponent } from './image-example.component';
import { ExampleFlow, ExampleManifest } from '../../../content/examples';
import { FLOWS, flowSteps } from '../../../content/flows';
import en from '../../../../assets/i18n/en.json';
import manifest from '../../../testing/fixtures/example-manifest.stub.json';
import { EXAMPLES_ROOT } from '../../../content/examples';
import {
  TUTORIAL_LEVELS,
  TutorialEngineService,
  TutorialWorld,
  canonicalFlowId,
  hasWorldVariants,
  resolveFlowId,
} from '../../../services/tutorial-engine.service';

/**
 * Flows the registry is asked to call unrunnable for the length of one test.
 * Every published technique is wired, so the state the Start button's disabled
 * branch exists for has to be made rather than found; everything else about the
 * registry stays real.
 */
const followability = vi.hoisted(() => ({ unrunnable: new Set<string>() }));

vi.mock('../../../content/flows', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../content/flows')>();
  return {
    ...actual,
    flowFollowable: (id: string): boolean =>
      !followability.unrunnable.has(id) && actual.flowFollowable(id),
  };
});

// The real committed manifest is the fixture: a page describing examples that
// do not exist is exactly what these tests are for.
const MANIFEST = manifest as unknown as ExampleManifest;
// Every id the page enumerates. A world variant is another set of pictures for
// a flow already on the list, so it is deliberately not one of these.
const CANONICAL = MANIFEST.flows.filter(
  (flow) => canonicalFlowId(flow.id) === flow.id,
);
const AVAILABLE = CANONICAL.filter((flow) => flow.status === 'available');

/**
 * The same library with one technique unserved. Every published example is
 * available at the moment, so the state is built here rather than pinned into
 * the fixture: the committed manifest stays the thing the page is read against,
 * and remix is the flow that really reaches this state, being served on Stable
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

/** The ids an example has actually been published under. */
const PUBLISHED = MANIFEST.flows
  .filter((flow) => flow.status === 'available')
  .map((flow) => flow.id);

// Which flows were drawn more than once is the generator's business and grows
// over time, so the world tests read it off the committed set rather than
// naming a flow that may be pinned tomorrow.
const VARIANT_FLOW = CANONICAL.find((flow) =>
  hasWorldVariants(flow.id, PUBLISHED),
)!;
const PINNED_FLOW = CANONICAL.find(
  (flow) =>
    flow.status === 'available' && !hasWorldVariants(flow.id, PUBLISHED),
)!;

/** Page chrome keys, which are written out in the template rather than built. */
const CHROME_KEYS = [
  'loading',
  'load_error',
  'picker_label',
  'unavailable_tag',
  'unavailable_head',
  'unavailable_note',
  'mode_label',
  'mode_user',
  'mode_developer',
  'steps_head',
  'images_head',
  'shot_source',
  'shot_mask',
  'shot_reference',
  'shot_before',
  'shot_result',
  'enlarge',
  'enlarge_close',
  'enlarged_title',
  // The full-size layer is shared, and a surface that opens a set of pictures
  // rather than one steps through them from its band.
  'enlarge_prev',
  'enlarge_next',
  'enlarge_step',
  'evidence_note',
  'meta_model',
  'meta_seed',
  'meta_made_with',
  'meta_made_with_horde',
  'meta_made_with_local',
  'meta_kudos',
  'meta_time',
  'run_cost',
  'run_time',
  'recipe_label',
  'recipe_model',
  'recipe_size',
  'recipe_steps',
  'recipe_cfg',
  'recipe_sampler',
  'recipe_seed',
  'recipe_denoise',
  'recipe_karras',
  'recipe_hires',
  'recipe_post',
  'recipe_batch',
  'raw_show',
  'meta_time_value',
  'deviation_label',
  'dev_head',
  'dev_lead',
  'dev_headers_head',
  'dev_lifecycle_head',
  'dev_payload_head',
  'dev_payload_before_head',
  'dev_payload_after_head',
  'dev_payload_diff_note',
  'dev_payload_base64_note',
];

/**
 * Keys of the same namespace the walkthrough owns rather than this page: the
 * phone sheet names the example's pictures and the offer to see them whole.
 * Listed here because the check below holds the whole namespace to account.
 */
const SHEET_KEYS = [
  'example_result',
  'example_result_enlarge',
  'example_source',
  'example_source_enlarge',
];

interface Harness {
  fixture: ComponentFixture<DocsImageExampleComponent>;
  component: DocsImageExampleComponent;
  http: HttpTestingController;
  navigate: ReturnType<typeof vi.spyOn>;
  query: <T extends Element>(selector: string) => T[];
  text: () => string;
}

/**
 * Builds the page for a `:flow` deep link, defaulting to the first example.
 * Passing null builds it for a URL naming no flow, which the route no longer
 * produces but which the page still has to answer for.
 */
async function createPage(
  flowId: string | null = MANIFEST.flows[0].id,
  world: TutorialWorld | null = null,
): Promise<Harness> {
  // The world preference is global and persisted; a page built for one test
  // must not inherit the choice another one made, and a test that needs one
  // already chosen seeds it the way the store holds it.
  localStorage.clear();
  if (world) {
    localStorage.setItem('aihorde.generate.learn.world', JSON.stringify(world));
  }
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [
      DocsImageExampleComponent,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
      }),
    ],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap(flowId ? { flow: flowId } : {})),
        },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(DocsImageExampleComponent);
  const http = TestBed.inject(HttpTestingController);
  // The page sends a URL naming no known flow to the Learn landing page, and
  // a real navigation would tear the fixture down mid-test.
  const navigate = vi
    .spyOn(TestBed.inject(Router), 'navigateByUrl')
    .mockResolvedValue(true);
  fixture.detectChanges();

  return {
    fixture,
    component: fixture.componentInstance,
    http,
    navigate,
    query: <T extends Element>(selector: string) =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<T>(selector),
      ),
    text: () => (fixture.nativeElement as HTMLElement).textContent ?? '',
  };
}

/**
 * The payload every flow is answered with, in the shape the committed examples
 * are really in: the recipe chips are read off this and nothing else, so it has
 * to be a request rather than a stub.
 */
const REQUEST_TEXT = JSON.stringify(
  {
    prompt: 'hello',
    source_image: '<base64>',
    models: ['AlbedoBase XL (SDXL)'],
    params: {
      sampler_name: 'k_euler_a',
      cfg_scale: 7.5,
      width: 1024,
      height: 1024,
      steps: 30,
      seed: '1234567890',
      karras: true,
      n: 1,
    },
  },
  null,
  2,
);

/** Answers the manifest request and the companion files it then triggers. */
function flushAll(
  harness: Harness,
  manifestData: ExampleManifest = MANIFEST,
): void {
  harness.http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifestData);
  harness.fixture.detectChanges();

  flushDetail(harness);
}

/** Answers the companion files of whichever flow is on screen. */
function flushDetail(harness: Harness): void {
  const flow = harness.component.activeFlow();
  if (!flow || flow.status !== 'available') {
    return;
  }

  const base = `${EXAMPLES_ROOT}/${flow.directory}`;
  harness.http.expectOne(`${base}/meta.json`).flush({
    model: flow.model,
    seed: flow.seed,
    worker_name: 'a-worker',
    kudos_charged: 45,
    wall_time_seconds: 41.7,
    deviations: 'the requested model was swapped',
  });
  harness.http.expectOne(`${base}/${flow.request}`).flush(REQUEST_TEXT);
  if (flow.files.includes('request-before.json')) {
    harness.http
      .expectOne(`${base}/request-before.json`)
      .flush('{\n  "prompt": "hello"\n}');
  }
  harness.fixture.detectChanges();
}

describe('DocsImageExampleComponent', () => {
  let harness: Harness;

  beforeEach(async () => {
    // The rail keeps the active chip in its window on every render, and jsdom
    // has no implementation of its own to do it with.
    Element.prototype.scrollIntoView = vi.fn();
    harness = await createPage();
  });

  it('loads the manifest and offers a picker line for every flow', () => {
    flushAll(harness);

    const translations = en as Record<string, string>;
    const lines = harness.query<HTMLElement>('.gs-index-entry');

    expect(lines).toHaveLength(CANONICAL.length);
    expect(harness.component.flows()).toHaveLength(CANONICAL.length);
    // Named by what each one makes, not by the technique behind it.
    expect(
      lines.map((line) =>
        line.querySelector('.gs-index-entry-label')?.textContent?.trim(),
      ),
    ).toEqual(
      CANONICAL.map(
        (flow) => translations[`generate.tutorials.flows.${flow.id}.task_name`],
      ),
    );
  });

  it('names the technique under the task on every picker line', () => {
    flushAll(harness);

    const translations = en as Record<string, string>;
    const lines = harness.query<HTMLElement>('.gs-index-entry');

    // The technique is what a reader who already knows one comes looking for,
    // so it is on the line rather than only inside the page.
    expect(
      lines.map((line) =>
        line.querySelector('.gs-index-entry-sub')?.textContent?.trim(),
      ),
    ).toEqual(
      CANONICAL.map(
        (flow) => translations[`generate.tutorials.flows.${flow.id}.technique`],
      ),
    );
  });

  it('lays the picker out as the contents column the wide step gives it', () => {
    flushAll(harness);

    const rail = harness.query<HTMLElement>('app-gs-index-rail')[0];

    // The page is on the shared contents layout, which is a plain column with
    // the rail as a bar above the dossier below the wide step and a grid with
    // the rail beside it above one. Holding the bar form at every width is what
    // the `--bar` class does, and this page no longer asks for it.
    expect(rail.parentElement?.classList).toContain('gs-index-layout');
    expect(rail.classList).toContain('gs-tut-picker');
    expect(rail.classList).not.toContain('gs-index-rail--bar');
  });

  it('keeps a flow with no example in the picker, muted and annotated', () => {
    flushAll(harness, SKIPPED_MANIFEST);

    const translations = en as Record<string, string>;
    const lines = harness.query<HTMLElement>('.gs-index-entry');
    const muted = lines.filter((line) =>
      line.classList.contains('gs-index-entry--muted'),
    );

    expect(muted).toHaveLength(1);
    expect(
      muted[0].querySelector('.gs-index-entry-note')?.textContent?.trim(),
    ).toBe(translations['generate.tutorials.unavailable_tag']);
    // Muted, not withheld: the flow is still a place a reader can go.
    expect(muted[0].getAttribute('href')).toBe(
      `/docs/image/learn/${SKIPPED_ID}`,
    );
  });

  it('leaves every published technique unmuted', () => {
    flushAll(harness);

    expect(harness.query('.gs-index-entry--muted')).toHaveLength(0);
  });

  it('sends a URL naming no flow to the Learn landing page', async () => {
    const bare = await createPage(null);
    flushAll(bare);

    expect(bare.component.activeFlow()).toBeNull();
    expect(bare.navigate).toHaveBeenCalledWith('/docs/image');
    // No stand-in flow is shown on the way out.
    expect(bare.query('.gs-tut-flow')).toHaveLength(0);
  });

  it('is still the page it is when the evidence library cannot be reached', () => {
    // The pictures are published rather than shipped. Losing them costs the
    // page its evidence, not its identity: the technique it is about, the steps
    // that make it and the way to the other techniques are all the app's own.
    const translations = en as Record<string, string>;
    harness.http
      .expectOne(`${EXAMPLES_ROOT}/manifest.json`)
      .error(new ProgressEvent('failed'));
    harness.fixture.detectChanges();

    expect(harness.component.loadFailed()).toBe(true);
    expect(harness.query('.gs-index-entry').length).toBeGreaterThan(0);
    expect(harness.query('.gs-tut-step').length).toBeGreaterThan(0);
    expect(harness.text()).toContain(
      translations['generate.tutorials.flows.txt2img.task_name'],
    );
    expect(harness.text()).toContain(
      translations['generate.tutorials.load_error'],
    );
  });

  it('shows the flow named by a deep link, with its steps and images', async () => {
    harness = await createPage('inpainting');
    flushAll(harness);

    const flow = harness.component.activeFlow();
    expect(flow?.id).toBe('inpainting');
    expect(harness.query('.gs-tut-step')).toHaveLength(
      flowSteps('inpainting').length,
    );
    // Source, mask and result: the inputs are shown, not only the outcome.
    expect(harness.query('.gs-tut-img')).toHaveLength(3);
    // And the source is wiped against the result, because the change is in
    // one place and a divider reads it better than two tiles.
    expect(harness.query('.gs-tut-compare app-gs-compare-wipe')).toHaveLength(
      1,
    );
  });

  it('points a reader holding a finished picture at the alchemy page', async () => {
    harness = await createPage('facefix');
    flushAll(harness);

    const translations = en as Record<string, string>;
    const aside = harness.query<HTMLElement>('.gs-tut-related');
    expect(aside).toHaveLength(1);
    expect(aside[0].textContent).toContain(
      translations['generate.learn.flows.facefix.related.body'],
    );

    const link = aside[0].querySelector<HTMLAnchorElement>(
      '.gs-tut-related-link',
    );
    expect(link?.textContent?.trim()).toBe(
      translations['generate.learn.flows.facefix.related.link'],
    );
    expect(link?.getAttribute('href')).toBe('/docs/alchemy/fix_faces');
  });

  it('offers the finished-picture aside on no other technique', async () => {
    harness = await createPage('txt2img');
    flushAll(harness);

    expect(harness.query('.gs-tut-related')).toHaveLength(0);
  });

  it('offers no wipe for a flow that starts from nothing', async () => {
    harness = await createPage('txt2img');
    flushAll(harness);

    expect(harness.component.comparison()).toBeNull();
    expect(harness.query('.gs-tut-compare')).toHaveLength(0);
  });

  it('shows every reference a remix blended in, after the source', async () => {
    harness = await createPage('remix');
    flushAll(harness, {
      ...MANIFEST,
      flows: MANIFEST.flows.map((flow) =>
        flow.id === 'remix'
          ? {
              ...flow,
              references: ['reference-1.webp'],
              files: [...flow.files, 'reference-1.webp'],
            }
          : flow,
      ),
    });

    const translations = en as Record<string, string>;
    const captions = harness
      .query<HTMLElement>('.gs-tut-shot-cap')
      .map((cap) => cap.textContent?.trim());
    expect(captions).toEqual([
      translations['generate.tutorials.shot_source'],
      translations['generate.tutorials.shot_reference'],
      translations['generate.tutorials.shot_result'],
    ]);
  });

  it('reads its steps from the studio pane’s bodies, filled from the request on screen', async () => {
    harness = await createPage('txt2img');
    flushAll(harness);

    const translations = en as Record<string, string>;
    const engine = TestBed.inject(TutorialEngineService);
    engine.setLevel('expert');
    harness.fixture.detectChanges();

    const bodies = harness
      .query<HTMLElement>('.gs-tut-step-body')
      .map((el) => el.textContent ?? '');
    // The prompt step's expert body is "[[set:prompt]]: `{{ prompt }}`…", so
    // the request's own prompt is what the page shows, as a quoted literal.
    expect(bodies[0]).toContain('hello');
    expect(
      harness.query<HTMLElement>('.gs-tut-step-body')[0].querySelector('code')
        ?.textContent,
    ).toBe('hello');
    expect(harness.text()).toContain(
      translations['generate.learn.flows.txt2img.steps.seed.title'],
    );

    // The register is the engine's, so the page and the walkthrough agree.
    const seg = harness.query<HTMLButtonElement>('.gs-tut-level .gs-seg-opt');
    expect(seg.map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
    ]);
    seg[0].click();
    harness.fixture.detectChanges();
    expect(engine.level()).toBe('new_to_this');
  });

  it('leads with the task name and keeps the technique behind it', async () => {
    harness = await createPage('inpainting');
    flushAll(harness);

    const translations = en as Record<string, string>;
    const title = harness.query<HTMLElement>('.gs-tut-flow-title')[0];

    expect(title.textContent).toContain(
      translations['generate.tutorials.flows.inpainting.task_name'],
    );
    expect(title.querySelector('.gs-tut-technique')?.textContent?.trim()).toBe(
      MANIFEST.flows.find((flow) => flow.id === 'inpainting')?.title,
    );
  });

  it('sends an unknown deep link to the Learn landing page', async () => {
    harness = await createPage('no-such-flow');
    flushAll(harness);

    expect(harness.component.activeFlow()).toBeNull();
    expect(harness.navigate).toHaveBeenCalledWith('/docs/image');
  });

  it('waits for the manifest before deciding a URL names nothing', async () => {
    const late = await createPage('inpainting');

    expect(late.navigate).not.toHaveBeenCalled();

    flushAll(late);

    expect(late.component.activeFlow()?.id).toBe('inpainting');
    expect(late.navigate).not.toHaveBeenCalled();
  });

  it('brings the line of a deep-linked flow into the rail', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const late = CANONICAL[CANONICAL.length - 1];

    harness = await createPage(late.id);
    flushAll(harness);

    expect(harness.query('.gs-index-entry[aria-current]')).toHaveLength(1);
    expect(scrollIntoView).toHaveBeenCalled();
    // Only as far as it has to move, and along the rail rather than the page.
    expect(scrollIntoView.mock.calls.at(-1)?.[0]).toMatchObject({
      block: 'nearest',
      inline: 'nearest',
    });
  });

  it('puts every picture on a bounded stage that is its own way in', async () => {
    harness = await createPage('inpainting');
    flushAll(harness);

    const stages = harness.query<HTMLButtonElement>('.gs-tut-stage');

    // Source, mask and result: one stage each, and no bare image beside them.
    expect(stages).toHaveLength(3);
    expect(harness.query('.gs-tut-img')).toHaveLength(3);
    for (const stage of stages) {
      expect(stage.querySelector('.gs-tut-img')).toBeTruthy();
      expect(stage.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('says what each picture is in pixels, off the file it fetched', () => {
    flushAll(harness);

    // The tutorial manifest lists a flow's files and what it ran on, and
    // nothing about their size, so the file itself is the only answer here.
    expect(harness.query('.gs-tut-stage .gs-pixels-text')).toHaveLength(0);

    const image = harness.query<HTMLImageElement>('.gs-tut-img')[0];
    Object.defineProperty(image, 'naturalWidth', {
      value: 1024,
      configurable: true,
    });
    Object.defineProperty(image, 'naturalHeight', {
      value: 1024,
      configurable: true,
    });
    image.dispatchEvent(new Event('load'));
    harness.fixture.detectChanges();

    expect(
      harness
        .query<HTMLElement>('.gs-tut-stage .gs-pixels-text')[0]
        ?.textContent?.replace(/\s+/g, ' ')
        .trim(),
    ).toBe('1024 × 1024');
  });

  it('opens one picture enlarged and closes it on Escape', () => {
    flushAll(harness);

    const stage = harness.query<HTMLButtonElement>('.gs-tut-stage')[0];
    stage.click();
    harness.fixture.detectChanges();

    const panel = harness.query<HTMLElement>('.gs-tut-viewer-body')[0];
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(harness.query<HTMLImageElement>('.gs-tut-viewer-img')[0].src).toBe(
      (stage.querySelector('.gs-tut-img') as HTMLImageElement).src,
    );

    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    harness.fixture.detectChanges();

    expect(harness.query('.gs-tut-viewer')).toHaveLength(0);
    // Closing hands focus back to the stage the reader opened it from.
    expect(document.activeElement).toBe(stage);
  });

  it('closes the enlarged picture on the backdrop but not on the panel', () => {
    flushAll(harness);

    harness.query<HTMLButtonElement>('.gs-tut-stage')[0].click();
    harness.fixture.detectChanges();

    harness.query<HTMLElement>('.gs-tut-viewer-body')[0].click();
    harness.fixture.detectChanges();
    expect(harness.query('.gs-tut-viewer')).toHaveLength(1);

    harness.query<HTMLElement>('.gs-tut-viewer')[0].click();
    harness.fixture.detectChanges();
    expect(harness.query('.gs-tut-viewer')).toHaveLength(0);
  });

  it('keeps the provenance note at the foot of the evidence', () => {
    flushAll(harness);

    const note = harness.query<HTMLElement>('.gs-tut-evidence-note')[0];

    expect(note.textContent?.trim()).toBe(
      (en as Record<string, string>)['generate.tutorials.evidence_note'],
    );
    expect(note.closest('.gs-tut-evidence')).toBeTruthy();
  });

  it('reads the recipe off the request the example was submitted with', () => {
    flushAll(harness);

    // The recipe's own chips: the steps beside it set the same token inline
    // wherever their prose names a setting, and those report no value.
    const chips = harness
      .query<HTMLElement>('.gs-recipe .gs-setting-chip')
      .map((chip) => chip.textContent?.replace(/\s+/g, ' ').trim());

    // Model, size, steps, guidance, sampler, seed and the sigmas: every field
    // the payload sets, and nothing the studio would only have defaulted to.
    expect(chips).toHaveLength(7);
    expect(chips).toContain('Model AlbedoBase XL (SDXL)');
    expect(chips).toContain('Size 1024×1024');
    expect(chips).toContain('Karras On');
    // One image is what an unbatched request makes, so it is not a setting.
    expect(chips.join(' ')).not.toContain('Images');
  });

  it('leaves the worker that ran the example out of the card', () => {
    flushAll(harness);

    expect(harness.text()).not.toContain('a-worker');
    expect(
      (en as Record<string, string>)['generate.tutorials.meta_worker'],
    ).toBeUndefined();
  });

  it('keeps the payload behind an expander in the studio tab', () => {
    flushAll(harness);

    const toggle = harness.query<HTMLButtonElement>('.gs-tut-raw-toggle')[0];

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(harness.query('.gs-tut-code')).toHaveLength(0);

    toggle.click();
    harness.fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(harness.query('.gs-tut-code')).toHaveLength(1);
    expect(toggle.getAttribute('aria-controls')).toBe(
      harness.query('.gs-tut-code')[0].id,
    );
  });

  it('leaves the chips and the expander to the studio tab', () => {
    flushAll(harness);
    harness.component.setMode('developer');
    harness.fixture.detectChanges();

    expect(harness.query('.gs-recipe-chip')).toHaveLength(0);
    expect(harness.query('.gs-tut-raw-toggle')).toHaveLength(0);
  });

  it('reports what the run deviated from', () => {
    flushAll(harness);

    expect(harness.text()).toContain('the requested model was swapped');
  });

  it('reads the send step time and cost off the run, rounded', async () => {
    harness = await createPage('txt2img');
    flushAll(harness);

    // 41.7s in the manifest, whole seconds in the prose.
    expect(harness.text()).toContain(
      'This run took about 42 seconds and cost 45 kudos.',
    );
  });

  it('leaves the time and cost out where the run recorded neither', async () => {
    harness = await createPage('txt2img');
    harness.http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(MANIFEST);
    harness.fixture.detectChanges();

    const flow = harness.component.activeFlow()!;
    const base = `${EXAMPLES_ROOT}/${flow.directory}`;
    harness.http
      .expectOne(`${base}/meta.json`)
      .flush({ model: flow.model, seed: flow.seed });
    harness.http.expectOne(`${base}/${flow.request}`).flush(REQUEST_TEXT);
    harness.fixture.detectChanges();

    const text = harness.text();
    expect(harness.component.runCost()).toBeNull();
    expect(text).not.toContain('This run took');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('{{');
  });

  it('swaps the walkthrough for the wire detail in developer mode', async () => {
    harness = await createPage('txt2img');
    flushAll(harness);

    const translations = en as Record<string, string>;
    expect(harness.query('.gs-tut-code')).toHaveLength(0);
    expect(harness.query('.gs-tut-section')[0].textContent).toContain(
      translations['generate.tutorials.steps_head'],
    );

    harness.query<HTMLButtonElement>('.gs-devtab')[1].click();
    harness.fixture.detectChanges();

    expect(harness.component.mode()).toBe('developer');
    expect(harness.query('.gs-tut-code')).toHaveLength(1);
    expect(harness.text()).toContain('/generate/async');
    expect(harness.text()).toContain('/generate/check/:id');
    expect(harness.text()).toContain('/generate/status/:id');
    // The section under the toggle is the one the toggle names, and the user
    // walkthrough is not left above it.
    expect(harness.query('.gs-tut-section')[0].textContent).toContain(
      translations['generate.tutorials.dev_head'],
    );
    expect(harness.text()).not.toContain(
      translations['generate.tutorials.steps_head'],
    );
    expect(harness.query('.gs-tut-step').length).toBe(
      harness.component.lifecycle.length,
    );
    // What went in and what came out belongs to neither tab.
    expect(harness.query('.gs-tut-img').length).toBeGreaterThan(0);
  });

  it('shows both payloads for the flow that is a pair', async () => {
    harness = await createPage('facefix');
    flushAll(harness);
    harness.component.setMode('developer');
    harness.fixture.detectChanges();

    expect(harness.query('.gs-tut-code')).toHaveLength(2);
  });

  it('renders a skipped flow as an unavailable card, not a 404', async () => {
    harness = await createPage(SKIPPED_ID);
    flushAll(harness, SKIPPED_MANIFEST);

    expect(harness.component.activeFlow()?.id).toBe(SKIPPED_ID);
    expect(harness.text()).toContain(SKIPPED_REASON);
    // Nothing is claimed about a run that never happened.
    expect(harness.query('.gs-tut-img')).toHaveLength(0);
    expect(harness.query('.gs-devtab')).toHaveLength(0);
  });

  it('has an English string for every key the page asks for', () => {
    const translations = en as Record<string, string>;
    const expected = new Set(
      [...CHROME_KEYS, ...SHEET_KEYS].map((key) => `generate.tutorials.${key}`),
    );

    for (const header of ['apikey', 'client_agent', 'content_type']) {
      expected.add(`generate.tutorials.dev_header_${header}.name`);
      expected.add(`generate.tutorials.dev_header_${header}.desc`);
    }
    for (const call of ['submit', 'check', 'status']) {
      expected.add(`generate.tutorials.dev_call_${call}.route`);
      expected.add(`generate.tutorials.dev_call_${call}.desc`);
    }
    // Every flow is named by its task, the skipped one included: the chip has
    // to say what it would have made.
    for (const flow of CANONICAL) {
      expected.add(`generate.tutorials.flows.${flow.id}.task_name`);
      // And by the technique behind the task, which is the second name the
      // picker sets under the first.
      expected.add(`generate.tutorials.flows.${flow.id}.technique`);
      // Every flow overrides the manifest's own summary, which is written for
      // someone who already knows the technique.
      expected.add(`generate.tutorials.flows.${flow.id}.summary`);
    }
    // The steps are the studio pane's own, in every register, so the page and
    // the walkthrough teach from one body set.
    const stepKeys = new Set<string>();
    for (const flow of AVAILABLE) {
      const steps = flowSteps(flow.id);
      expect(steps.length, `no steps written for ${flow.id}`).toBeGreaterThan(
        0,
      );
      for (const step of steps) {
        stepKeys.add(`generate.learn.flows.${flow.id}.steps.${step.id}.title`);
        for (const level of TUTORIAL_LEVELS) {
          stepKeys.add(
            `generate.learn.flows.${flow.id}.steps.${step.id}.body.${level}`,
          );
        }
      }
    }

    for (const key of [...expected, ...stepKeys]) {
      expect(translations[key], `missing translation ${key}`).toBeTruthy();
    }

    // And nothing left behind: every tutorials key in en.json is one of these.
    const present = Object.keys(translations).filter((key) =>
      key.startsWith('generate.tutorials.'),
    );
    expect(present.filter((key) => !expected.has(key))).toEqual([]);
  });

  it('prefers its own summary over the manifest phrasing', () => {
    const translations = en as Record<string, string>;
    const flow = MANIFEST.flows[0];
    flushAll(harness);

    expect(harness.component.activeSummary()).toBe(
      translations[`generate.tutorials.flows.${flow.id}.summary`],
    );
    expect(harness.component.activeSummary()).not.toBe(flow.summary);
  });

  it('asks for no per-flow summary on a concept track', async () => {
    // A track's copy is written per step, so the summary key a technique has is
    // one a track never gets; probing for it would put the key itself on the
    // page and a missing-translation warning in the console.
    const track = FLOWS.find((flow) => flow.concept)!;
    const page = await createPage(track.id);
    flushAll(page);

    expect(
      (en as Record<string, string>)[
        `generate.tutorials.flows.${track.id}.summary`
      ],
    ).toBeUndefined();
    expect(page.component.activeSummary()).toBe('');
    expect(page.text()).not.toContain(
      `generate.tutorials.flows.${track.id}.summary`,
    );
  });

  it('leads with its own summary before the library has answered', () => {
    // Written in the app, so it is there to be read and to be previewed by a
    // link long before the manifest arrives.
    const translations = en as Record<string, string>;

    expect(harness.component.activeSummary()).toBe(
      translations['generate.tutorials.flows.txt2img.summary'],
    );
  });

  it('offers a studio walkthrough only where steps have been written', () => {
    flushAll(harness);

    const start = harness.query<HTMLButtonElement>('.gs-tut-start-btn')[0];

    expect(harness.component.canStart()).toBe(true);
    expect(start.disabled).toBe(false);
    expect(harness.text()).not.toContain(
      (en as Record<string, string>)['generate.learn.start_soon'],
    );
  });

  it('disables the walkthrough, with a note, for a flow the pane cannot run', async () => {
    // A page whose steps are written but name no control yet: it reads, and its
    // start button lights up on its own the moment those steps are wired. No
    // published technique is in that state now, so it is staged for one test.
    followability.unrunnable.add('facefix');
    try {
      const other = await createPage('facefix');
      flushAll(other);

      const start = other.query<HTMLButtonElement>('.gs-tut-start-btn')[0];

      expect(other.component.canStart()).toBe(false);
      expect(start.disabled).toBe(true);
      expect(other.text()).toContain(
        (en as Record<string, string>)['generate.learn.start_soon'],
      );
    } finally {
      followability.unrunnable.clear();
    }
  });

  it('offers the walkthrough on every technique the page enumerates', async () => {
    for (const flow of CANONICAL) {
      const page = await createPage(flow.id);
      flushAll(page);

      expect(page.component.canStart(), `${flow.id}`).toBe(true);
      expect(page.text()).not.toContain(
        (en as Record<string, string>)['generate.learn.start_soon'],
      );
    }
  });

  it('arms the flow and goes to the studio when the walkthrough is started', () => {
    flushAll(harness);
    const engine = TestBed.inject(TutorialEngineService);

    harness.query<HTMLButtonElement>('.gs-tut-start-btn')[0].click();

    expect(harness.navigate).toHaveBeenCalledWith('/generate/image');
    // Held in memory rather than routed, so a reload lands on a plain studio.
    expect(engine.consumeArmed()).toBe('txt2img');
  });

  it('points every picker line at the canonical Learn URL for its flow', () => {
    flushAll(harness);

    expect(
      harness
        .query<HTMLAnchorElement>('.gs-index-entry')
        .map((line) => line.getAttribute('href')),
    ).toEqual(CANONICAL.map((flow) => `/docs/image/learn/${flow.id}`));
  });

  describe('the world the pictures are drawn from', () => {
    const VARIANT_ID = `${VARIANT_FLOW.id}--w2`;

    it('keeps world variants out of the picker and out of the URLs', () => {
      flushAll(harness);

      const hrefs = harness
        .query<HTMLAnchorElement>('.gs-index-entry')
        .map((line) => line.getAttribute('href'));

      // The committed set really does carry variants, so this is a filter
      // being exercised rather than a manifest with nothing to leave out.
      expect(MANIFEST.flows.length).toBeGreaterThan(CANONICAL.length);
      expect(hrefs).toHaveLength(CANONICAL.length);
      expect(hrefs.join(' ')).not.toContain('--w');
      expect(harness.component.flows().map((flow) => flow.id)).toEqual(
        CANONICAL.map((flow) => flow.id),
      );
    });

    it('offers the switcher only where the flow was drawn more than once', async () => {
      harness = await createPage(VARIANT_FLOW.id);
      flushAll(harness);

      const options = harness.query<HTMLButtonElement>(
        '.gs-tut-worlds .gs-world',
      );
      const translations = en as Record<string, string>;

      expect(harness.component.worldChoice()).toBe(true);
      expect(
        options.map((option) =>
          option.querySelector('.gs-world-name')?.textContent?.trim(),
        ),
      ).toEqual([
        translations['generate.learn.world.w1'],
        translations['generate.learn.world.w2'],
        translations['generate.learn.world.w3'],
      ]);
      // The one in play is marked, and no world is offered as unavailable.
      expect(
        options.map((option) => option.getAttribute('aria-pressed')),
      ).toEqual(['true', 'false', 'false']);
      expect(options.some((option) => option.disabled)).toBe(false);
    });

    it('shows no switcher on a flow pinned to the first world', async () => {
      harness = await createPage(PINNED_FLOW.id);
      flushAll(harness);

      expect(harness.component.worldChoice()).toBe(false);
      expect(harness.query('.gs-tut-worlds')).toHaveLength(0);
    });

    it('re-resolves the page onto the chosen world, under the same URL', async () => {
      harness = await createPage(VARIANT_FLOW.id);
      flushAll(harness);

      const translations = en as Record<string, string>;
      const taskName =
        translations[`generate.tutorials.flows.${VARIANT_FLOW.id}.task_name`];
      const variant = MANIFEST.flows.find((flow) => flow.id === VARIANT_ID)!;

      harness.query<HTMLButtonElement>('.gs-tut-worlds .gs-world')[1].click();
      harness.fixture.detectChanges();
      flushDetail(harness);

      const title = harness.query<HTMLElement>('.gs-tut-flow-title')[0];

      expect(harness.component.activeFlow()?.id).toBe(VARIANT_ID);
      expect(
        harness.query<HTMLImageElement>('.gs-tut-img')[0].getAttribute('src'),
      ).toContain(`/${VARIANT_ID}/`);
      // The task, its URL and its steps are the flow's; only the pictures and
      // the technique line behind them belong to the world.
      expect(harness.component.activeId()).toBe(VARIANT_FLOW.id);
      expect(harness.query('.gs-tut-step')).toHaveLength(
        flowSteps(VARIANT_FLOW.id).length,
      );
      expect(title.textContent).toContain(taskName);
      expect(
        title.querySelector('.gs-tut-technique')?.textContent?.trim(),
      ).toBe(variant.title);
    });

    it('falls back to the canonical example where the world has none', async () => {
      harness = await createPage(PINNED_FLOW.id, 'w2');
      flushAll(harness);

      // A world nothing was drawn in for this flow is honoured by showing what
      // there is, rather than by refusing or by offering an empty page.
      expect(resolveFlowId(PINNED_FLOW.id, 'w2', PUBLISHED)).toBe(
        PINNED_FLOW.id,
      );
      expect(harness.component.activeFlow()?.id).toBe(PINNED_FLOW.id);
      expect(harness.query('.gs-tut-img').length).toBeGreaterThan(0);
    });
  });
});
