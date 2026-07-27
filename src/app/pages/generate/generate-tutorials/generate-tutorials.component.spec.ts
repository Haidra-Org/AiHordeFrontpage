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
import {
  GenerateTutorialsComponent,
  TUTORIAL_FLOW_STEPS,
  TutorialManifest,
} from './generate-tutorials.component';
import en from '../../../../assets/i18n/en.json';
import manifest from '../../../../assets/tutorials/manifest.json';
import { TutorialEngineService } from '../../../services/tutorial-engine.service';

// The real committed manifest is the fixture: a page describing examples that
// do not exist is exactly what these tests are for.
const MANIFEST = manifest as unknown as TutorialManifest;
const AVAILABLE = MANIFEST.flows.filter((flow) => flow.status === 'available');
const SKIPPED = MANIFEST.flows.filter((flow) => flow.status === 'skipped');

/** Page chrome keys, which are written out in the template rather than built. */
const CHROME_KEYS = [
  'title',
  'lead',
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
  'shot_before',
  'shot_result',
  'meta_model',
  'meta_seed',
  'meta_kudos',
  'meta_worker',
  'meta_time',
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

interface Harness {
  fixture: ComponentFixture<GenerateTutorialsComponent>;
  component: GenerateTutorialsComponent;
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
): Promise<Harness> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [
      GenerateTutorialsComponent,
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

  const fixture = TestBed.createComponent(GenerateTutorialsComponent);
  const http = TestBed.inject(HttpTestingController);
  // The page sends a URL naming no known flow to the Learn landing page, and
  // a real navigation would tear the fixture down mid-test.
  const navigate = vi
    .spyOn(TestBed.inject(Router), 'navigate')
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

/** Answers the manifest request and the companion files it then triggers. */
function flushAll(harness: Harness): void {
  harness.http.expectOne('/assets/tutorials/manifest.json').flush(MANIFEST);
  harness.fixture.detectChanges();

  const flow = harness.component.activeFlow();
  if (!flow || flow.status !== 'available') {
    return;
  }

  const base = `/assets/tutorials/${flow.directory}`;
  harness.http.expectOne(`${base}/meta.json`).flush({
    model: flow.model,
    seed: flow.seed,
    worker_name: 'a-worker',
    kudos_charged: 45,
    wall_time_seconds: 41.7,
    deviations: 'the requested model was swapped',
  });
  harness.http
    .expectOne(`${base}/${flow.request}`)
    .flush('{\n  "prompt": "hello",\n  "source_image": "<base64>"\n}');
  if (flow.files.includes('request-before.json')) {
    harness.http
      .expectOne(`${base}/request-before.json`)
      .flush('{\n  "prompt": "hello"\n}');
  }
  harness.fixture.detectChanges();
}

describe('GenerateTutorialsComponent', () => {
  let harness: Harness;

  beforeEach(async () => {
    // The rail keeps the active chip in its window on every render, and jsdom
    // has no implementation of its own to do it with.
    Element.prototype.scrollIntoView = vi.fn();
    harness = await createPage();
  });

  it('loads the manifest and offers a chip for every flow', () => {
    flushAll(harness);

    expect(harness.query('.gs-tut-chip')).toHaveLength(MANIFEST.flows.length);
    expect(harness.component.flows()).toHaveLength(MANIFEST.flows.length);
  });

  it('sends a URL naming no flow to the Learn landing page', async () => {
    const bare = await createPage(null);
    flushAll(bare);

    expect(bare.component.activeFlow()).toBeNull();
    expect(bare.navigate).toHaveBeenCalledWith(['/generate/learn']);
    // No stand-in flow is shown on the way out.
    expect(bare.query('.gs-tut-flow')).toHaveLength(0);
  });

  it('reports a failed manifest fetch instead of rendering an empty page', () => {
    harness.http
      .expectOne('/assets/tutorials/manifest.json')
      .error(new ProgressEvent('failed'));
    harness.fixture.detectChanges();

    expect(harness.component.loadFailed()).toBe(true);
    expect(harness.query('.gs-tut-chip')).toHaveLength(0);
  });

  it('shows the flow named by a deep link, with its steps and images', async () => {
    harness = await createPage('inpainting');
    flushAll(harness);

    const flow = harness.component.activeFlow();
    expect(flow?.id).toBe('inpainting');
    expect(harness.query('.gs-guide-step')).toHaveLength(
      TUTORIAL_FLOW_STEPS['inpainting'].length,
    );
    // Source, mask and result: the inputs are shown, not only the outcome.
    expect(harness.query('.gs-tut-img')).toHaveLength(3);
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
    expect(harness.navigate).toHaveBeenCalledWith(['/generate/learn']);
  });

  it('waits for the manifest before deciding a URL names nothing', async () => {
    const late = await createPage('inpainting');

    expect(late.navigate).not.toHaveBeenCalled();

    flushAll(late);

    expect(late.component.activeFlow()?.id).toBe('inpainting');
    expect(late.navigate).not.toHaveBeenCalled();
  });

  it('brings the chip of a deep-linked flow into the rail', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const late = MANIFEST.flows[MANIFEST.flows.length - 1];

    harness = await createPage(late.id);
    flushAll(harness);

    expect(harness.query('.gs-tut-chip--on')).toHaveLength(1);
    expect(scrollIntoView).toHaveBeenCalled();
    // Only as far as it has to move, and along the rail rather than the page.
    expect(scrollIntoView.mock.calls.at(-1)?.[0]).toMatchObject({
      block: 'nearest',
      inline: 'nearest',
    });
  });

  it('reports what the run deviated from', () => {
    flushAll(harness);

    expect(harness.text()).toContain('the requested model was swapped');
  });

  it('swaps the walkthrough for the wire detail in developer mode', async () => {
    harness = await createPage('txt2img');
    flushAll(harness);

    const translations = en as Record<string, string>;
    expect(harness.query('.gs-tut-code')).toHaveLength(0);
    expect(harness.query('.gs-tut-card')[0].textContent).toContain(
      translations['generate.tutorials.steps_head'],
    );

    harness.query<HTMLButtonElement>('.gs-devtab')[1].click();
    harness.fixture.detectChanges();

    expect(harness.component.mode()).toBe('developer');
    expect(harness.query('.gs-tut-code')).toHaveLength(1);
    expect(harness.text()).toContain('/generate/async');
    expect(harness.text()).toContain('/generate/check/:id');
    expect(harness.text()).toContain('/generate/status/:id');
    // The card under the toggle is the one the toggle names, and the user
    // walkthrough is not left above it.
    expect(harness.query('.gs-tut-card')[0].textContent).toContain(
      translations['generate.tutorials.dev_head'],
    );
    expect(harness.text()).not.toContain(
      translations['generate.tutorials.steps_head'],
    );
    expect(harness.query('.gs-guide-step').length).toBe(
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
    const skipped = SKIPPED[0];
    harness = await createPage(skipped.id);
    flushAll(harness);

    expect(harness.component.activeFlow()?.id).toBe(skipped.id);
    expect(harness.text()).toContain(skipped.skipped_reason ?? '');
    // Nothing is claimed about a run that never happened.
    expect(harness.query('.gs-tut-img')).toHaveLength(0);
    expect(harness.query('.gs-devtab')).toHaveLength(0);
  });

  it('has an English string for every key the page asks for', () => {
    const translations = en as Record<string, string>;
    const expected = new Set(
      CHROME_KEYS.map((key) => `generate.tutorials.${key}`),
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
    for (const flow of MANIFEST.flows) {
      expected.add(`generate.tutorials.flows.${flow.id}.task_name`);
      // Every flow overrides the manifest's own summary, which is written for
      // someone who already knows the technique.
      expected.add(`generate.tutorials.flows.${flow.id}.summary`);
    }
    for (const flow of AVAILABLE) {
      const steps = TUTORIAL_FLOW_STEPS[flow.id];
      expect(steps, `no steps written for ${flow.id}`).toBeTruthy();
      for (const step of steps) {
        expected.add(`generate.tutorials.flows.${flow.id}.steps.${step}.title`);
        expected.add(`generate.tutorials.flows.${flow.id}.steps.${step}.body`);
      }
    }

    for (const key of expected) {
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

    expect(harness.component.summaryFor(flow)).toBe(
      translations[`generate.tutorials.flows.${flow.id}.summary`],
    );
    expect(harness.component.summaryFor(flow)).not.toBe(flow.summary);
  });

  it('falls back to the manifest summary for a flow with no override', () => {
    const invented = { ...MANIFEST.flows[0], id: 'not-a-flow' };

    expect(harness.component.summaryFor(invented)).toBe(invented.summary);
  });

  it('offers a studio walkthrough only where steps have been written', () => {
    flushAll(harness);

    const start = harness.query<HTMLButtonElement>('.gs-tut-start-btn')[0];

    expect(harness.component.canStart(MANIFEST.flows[0])).toBe(true);
    expect(start.disabled).toBe(false);
    expect(harness.text()).not.toContain(
      (en as Record<string, string>)['generate.learn.start_soon'],
    );
  });

  it('disables the walkthrough, with a note, for a flow still being written', async () => {
    const other = await createPage('img2img');
    flushAll(other);

    const start = other.query<HTMLButtonElement>('.gs-tut-start-btn')[0];

    expect(start.disabled).toBe(true);
    expect(other.text()).toContain(
      (en as Record<string, string>)['generate.learn.start_soon'],
    );
  });

  it('arms the flow and goes to the studio when the walkthrough is started', () => {
    flushAll(harness);
    const engine = TestBed.inject(TutorialEngineService);

    harness.query<HTMLButtonElement>('.gs-tut-start-btn')[0].click();

    expect(harness.navigate).toHaveBeenCalledWith(['/generate/image']);
    // Held in memory rather than routed, so a reload lands on a plain studio.
    expect(engine.consumeArmed()).toBe('txt2img');
  });

  it('points every chip at the canonical Learn URL for its flow', () => {
    flushAll(harness);

    expect(
      harness
        .query<HTMLAnchorElement>('.gs-tut-chip')
        .map((chip) => chip.getAttribute('href')),
    ).toEqual(
      MANIFEST.flows.map((flow) => `/generate/learn/tutorials/${flow.id}`),
    );
  });

  it('links the guide entry point at the studio shell', () => {
    const translations = en as Record<string, string>;

    expect(translations['generate.guide.tutorials_link']).toBeTruthy();
    expect(translations['generate.shell.tab_tutorials']).toBeTruthy();
  });
});
