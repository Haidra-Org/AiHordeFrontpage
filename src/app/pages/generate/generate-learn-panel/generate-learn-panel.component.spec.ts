import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { GenerateLearnPanelComponent } from './generate-learn-panel.component';
import {
  TUTORIAL_LEVELS,
  TutorialEngineService,
  TutorialStudioHost,
  stepFieldLabelKey,
} from '../../../services/tutorial-engine.service';
import {
  CONCEPT_FLOWS,
  FLOWS,
  flowFollowable,
  flowSteps,
} from '../../../content/flows';
import {
  GenerateFormValue,
  GenerateMode,
  GenerateSourceMode,
} from '../generate-form.model';
import { environment } from '../../../../environments/environment';
import en from '../../../../assets/i18n/en.json';
import stubIndex from '../../../testing/fixtures/sweep-index.stub.json';
import manifest from '../../../testing/fixtures/example-manifest.stub.json';
import { EXAMPLES_ROOT } from '../../../content/examples';
import request from '../../../testing/fixtures/example-request.stub.json';
import { splitCombinedPrompt } from '../generate-form.model';

const TRANSLATIONS = en as Record<string, string>;

// The committed payload spells the negative inline, so the halves the panel
// renders apart are recovered from it rather than restated here.
const [PROMPT, NEGATIVE] = splitCombinedPrompt(request.prompt);

class HostStub implements TutorialStudioHost {
  public readonly applied: Partial<GenerateFormValue>[] = [];
  public readonly bulk: GenerateFormValue[] = [];
  public applyFields(fields: Partial<GenerateFormValue>): void {
    this.applied.push(fields);
  }
  public currentMode(): GenerateMode {
    return 'advanced';
  }
  public setMode(): void {
    /* the panel never reveals on its own account */
  }
  public currentSourceMode(): GenerateSourceMode {
    return 'none';
  }
  public setSourceMode(_mode: GenerateSourceMode): void {
    /* txt2img attaches no source image */
  }
  public openBulkApply(example: GenerateFormValue): void {
    this.bulk.push(example);
  }
}

describe('GenerateLearnPanelComponent', () => {
  let fixture: ComponentFixture<GenerateLearnPanelComponent>;
  let engine: TutorialEngineService;
  let host: HostStub;

  const query = <T extends Element>(selector: string): T[] =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<T>(selector),
    );
  const text = (): string =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(async () => {
    localStorage.clear();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        GenerateLearnPanelComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    engine = TestBed.inject(TutorialEngineService);
    host = new HostStub();
    engine.registerHost(host);

    const http = TestBed.inject(HttpTestingController);
    const started = engine.start('txt2img');
    http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .expectOne(`${EXAMPLES_ROOT}/txt2img/request.json`)
      .flush(structuredClone(request));
    await started;

    fixture = TestBed.createComponent(GenerateLearnPanelComponent);
    fixture.detectChanges();
  });

  it('lists every step of the flow, the current one marked', () => {
    const steps = query<HTMLButtonElement>('.gs-learn-step');

    expect(steps).toHaveLength(flowSteps('txt2img').length);
    expect(steps[0].getAttribute('aria-current')).toBe('step');
    expect(steps[1].getAttribute('aria-current')).toBeNull();
  });

  it('marks a step with the panel area it points at, current or not', () => {
    const steps = query<HTMLButtonElement>('.gs-learn-step');

    // The first step is the prompt; the last is pressing Generate, which
    // belongs to no card and so takes no hue.
    expect(steps[0].classList).toContain('gs-learn-step');
    expect(steps[0].classList).toContain('gs-sec--prompt');
    expect(steps[0].classList).toContain('gs-learn-step--on');
    expect(steps[steps.length - 1].className).not.toContain('gs-sec--');
    expect(query('.gs-learn-card .gs-learn-eyebrow .gs-sec-chip')).toHaveLength(
      1,
    );
  });

  it('breathes with the field its step is pointing at, and only then', () => {
    const card = (): HTMLElement => query<HTMLElement>('.gs-learn-card')[0];

    expect(card().classList).toContain('gs-tut-breathe');
    expect(card().classList).toContain('gs-sec--prompt');

    engine.goTo(3);
    fixture.detectChanges();
    expect(card().classList).toContain('gs-tut-breathe');

    // The finale points at the Generate button, which belongs to no section:
    // the card must not answer it with a differently-hued glow.
    engine.goTo(engine.steps().length - 1);
    fixture.detectChanges();
    expect(card().classList).not.toContain('gs-tut-breathe');

    expect(fixture.componentInstance.breathes({ id: 'nowhere' })).toBe(false);
  });

  it('says where in the flow the reader is', () => {
    engine.goTo(2);
    fixture.detectChanges();

    expect(text()).toContain(`Step 3 of ${engine.total()}`);
  });

  it('moves to a step picked from the list', () => {
    query<HTMLButtonElement>('.gs-learn-step')[3].click();
    fixture.detectChanges();

    expect(engine.step()?.id).toBe('steps');
  });

  it('renders the step body in the chosen register, and only the body', () => {
    const title = (): string =>
      query<HTMLElement>('.gs-guide-head')[0].textContent?.trim() ?? '';
    const body = (): string =>
      query<HTMLElement>('.gs-guide-step-body')[0].textContent?.trim() ?? '';

    const novice = body();
    const noviceTitle = title();

    fixture.componentInstance.setLevel('expert');
    fixture.detectChanges();

    expect(body()).not.toBe(novice);
    // Both halves are named, and neither carries the separator across.
    expect(body()).toContain(PROMPT);
    expect(body()).toContain(NEGATIVE);
    expect(body()).not.toContain('###');
    // A step is called the same thing however much explanation goes with it.
    expect(title()).toBe(noviceTitle);
    // The step itself never moves when the register does.
    expect(engine.stepIndex()).toBe(0);
    expect(engine.step()?.id).toBe('prompt');
  });

  it('interpolates the committed request into the prose', () => {
    engine.goTo(3);
    fixture.detectChanges();

    expect(text()).toContain(String(request.params.steps));
  });

  it('applies only the current step from its own button', () => {
    query<HTMLButtonElement>('.gs-learn-apply')[0].click();

    // Both halves: the picture the walkthrough is reproducing was made with
    // the pair, so the step's own button has to write the pair.
    expect(host.applied).toEqual([
      { prompt: PROMPT, negativePrompt: NEGATIVE },
    ]);
  });

  it('offers no apply button on the finale, only the submit prompt', () => {
    engine.goTo(engine.total() - 1);
    fixture.detectChanges();

    expect(query('.gs-learn-apply')).toHaveLength(0);
    expect(text()).toContain(TRANSLATIONS['generate.learn.finale_hint']);
  });

  it('sends a bulk apply through the studio review panel', () => {
    query<HTMLButtonElement>('.gs-learn-all')[0].click();

    expect(host.bulk).toHaveLength(1);
    expect(host.bulk[0].prompt).toBe(PROMPT);
    expect(host.bulk[0].negativePrompt).toBe(NEGATIVE);
    expect(host.applied).toEqual([]);
  });

  it('has prose for every step the pane can run, in all three registers', () => {
    // Only the flows the pane can actually run: a technique whose steps do not
    // name their controls yet is a page to read, not a walkthrough to follow,
    // and it enters this assertion on its own the moment it is wired. Every
    // flow is one of those now, which is what the count below holds.
    expect(FLOWS.filter((entry) => flowFollowable(entry.id))).toHaveLength(
      FLOWS.length,
    );
    for (const flow of FLOWS.filter((entry) => flowFollowable(entry.id))) {
      for (const step of flow.steps) {
        const flowId = flow.id;
        const base = `generate.learn.flows.${flowId}.steps.${step.id}`;
        expect(
          TRANSLATIONS[`${base}.title`],
          `missing translation ${base}.title`,
        ).toBeTruthy();
        for (const level of TUTORIAL_LEVELS) {
          expect(
            TRANSLATIONS[`${base}.body.${level}`],
            `missing translation ${base}.body.${level}`,
          ).toBeTruthy();
        }
      }
    }
    // The closing step of a track labels its own handoff.
    const handoffs = FLOWS.flatMap((flow) =>
      flow.steps
        .filter((step) => step.startsFlow)
        .map((step) => `generate.learn.flows.${flow.id}.steps.${step.id}.cta`),
    );
    expect(handoffs).toHaveLength(CONCEPT_FLOWS.length);
    for (const key of handoffs) {
      expect(TRANSLATIONS[key], `missing translation ${key}`).toBeTruthy();
    }
    // A track is named where the rest of its prose lives: it has no worked
    // example to be listed among the ones the examples page names.
    for (const flowId of CONCEPT_FLOWS) {
      expect(
        TRANSLATIONS[`generate.learn.flows.${flowId}.task_name`],
      ).toBeTruthy();
    }
  });

  it("names the field every step points at in the panel's own words", () => {
    // The eyebrow above a step's title is the control's name, and an anchor
    // whose name has no translation would show the reader a key.
    const unnamed = FLOWS.filter((flow) => flowFollowable(flow.id))
      .flatMap((flow) => flow.steps)
      .filter((step) => step.anchorId)
      .map((step) => stepFieldLabelKey(step.anchorId!))
      .filter((key) => !TRANSLATIONS[key]);

    expect([...new Set(unnamed)]).toEqual([]);
  });

  describe('a concept track', () => {
    beforeEach(async () => {
      await engine.start('concepts_images');
      fixture.detectChanges();
    });

    it('lists its steps and names itself from its own prose', () => {
      expect(query('.gs-learn-step')).toHaveLength(
        flowSteps('concepts_images').length,
      );
      expect(text()).toContain(
        TRANSLATIONS[
          'generate.learn.flows.concepts_images.steps.noise_to_picture.title'
        ],
      );
    });

    it('offers nothing to apply, point at, or load', () => {
      expect(query('.gs-learn-apply')).toHaveLength(0);
      expect(query('.gs-learn-show')).toHaveLength(0);
      expect(query('.gs-learn-all')).toHaveLength(0);
      expect(query('.gs-learn-example')).toHaveLength(0);
    });

    it('takes no section hue, since no step is about a card', () => {
      for (const step of query<HTMLElement>('.gs-learn-step')) {
        expect(step.className).not.toContain('gs-sec--');
      }
      expect(query<HTMLElement>('.gs-learn-card')[0].className).not.toContain(
        'gs-tut-breathe',
      );
    });

    it('closes with the walkthrough rather than an ask to press Generate', async () => {
      engine.goTo(engine.total() - 1);
      fixture.detectChanges();

      expect(text()).not.toContain(TRANSLATIONS['generate.learn.finale_hint']);
      const cta = query<HTMLButtonElement>('.gs-learn-cta');
      expect(cta).toHaveLength(1);
      expect(cta[0].textContent?.trim()).toBe(
        TRANSLATIONS['generate.learn.flows.concepts_images.steps.try_it.cta'],
      );

      cta[0].click();
      const http = TestBed.inject(HttpTestingController);
      http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
      await new Promise((resolve) => setTimeout(resolve, 0));
      http
        .expectOne(`${EXAMPLES_ROOT}/txt2img/request.json`)
        .flush(structuredClone(request));
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();

      expect(engine.step()?.id).toBe('prompt');
      expect(query('.gs-learn-apply')).toHaveLength(1);
    });
  });

  describe('parameter sweeps', () => {
    const SWEEP_INDEX = `${environment.evidenceBaseUrl}/index.json`;

    /** Answer the one index fetch a rendered scrubber makes. */
    async function serveLibrary(body: unknown): Promise<void> {
      const http = TestBed.inject(HttpTestingController);
      http.expectOne(SWEEP_INDEX).flush(body);
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    }

    it('offers the sweep under a step a newcomer is reading', async () => {
      // Step 4 is `steps`, which carries a sweep parameter.
      engine.goTo(3);
      fixture.detectChanges();
      await serveLibrary(stubIndex);

      expect(query('.gs-sweep-offer')).toHaveLength(1);
      // The capsule names the setting and its payload, so two of them on one
      // page are told apart before either is opened.
      expect(text()).toContain('Sampling · Interactive explorer');
      expect(text()).toContain('3 frames · 4 → 30');
    });

    it('offers nothing to the registers that are past needing it', () => {
      fixture.componentInstance.setLevel('comfortable');
      engine.goTo(3);
      fixture.detectChanges();

      expect(query('.gs-sweep-offer')).toHaveLength(0);
      TestBed.inject(HttpTestingController).expectNone(SWEEP_INDEX);
    });

    it('offers nothing on a step with no strip published for it', () => {
      // Step 6 is `sampler`, which carries no sweep parameter at all, so
      // nothing is even asked of the library.
      engine.goTo(5);
      fixture.detectChanges();

      expect(query('.gs-sweep-offer')).toHaveLength(0);
      TestBed.inject(HttpTestingController).expectNone(SWEEP_INDEX);
    });

    it('shows a track its evidence in every register, already open', async () => {
      // On a track the pictures are the lesson rather than a newcomer's aid, so
      // the register the reader is in does not decide whether they see them.
      await engine.start('concepts_images');
      fixture.componentInstance.setLevel('expert');
      fixture.detectChanges();
      await serveLibrary(stubIndex);

      expect(query('.gs-sweep-offer')).toHaveLength(0);
      expect(query('.gs-sweep-open')).toHaveLength(1);
      // Both readings of the render, as one viewer with a choice in it.
      const variants = query<HTMLButtonElement>('.gs-sweep-variant');
      expect(variants.map((button) => button.textContent?.trim())).toEqual([
        TRANSLATIONS['generate.sweeps.preview_variant_base'],
        TRANSLATIONS['generate.sweeps.preview_variant_alt'],
      ]);
    });

    it('shows a track nothing where the library has no strip for the step', async () => {
      // The strips are published separately from the app, so a step whose
      // evidence is not there yet has to read as a finished step.
      await engine.start('concepts_images');
      // The step about seeds asks for a strip the stub library never published.
      engine.goTo(4);
      fixture.detectChanges();
      await serveLibrary(stubIndex);

      expect(query('.gs-sweep')).toHaveLength(0);
    });

    it('leaves no residue when the library cannot be reached', async () => {
      engine.goTo(3);
      fixture.detectChanges();
      TestBed.inject(HttpTestingController)
        .expectOne(SWEEP_INDEX)
        .error(new ProgressEvent('offline'), { status: 0, statusText: '' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();

      expect(query('.gs-sweep')).toHaveLength(0);
      expect(text()).not.toContain('See what changing');
    });
  });

  it('names each register and the reveal it can narrate', () => {
    for (const level of TUTORIAL_LEVELS) {
      expect(TRANSLATIONS[`generate.learn.level.${level}`]).toBeTruthy();
    }
    // The picker says what it is on the screen as well as to a screen reader:
    // three unlabelled words leave a reader guessing what they choose between.
    expect(
      query<HTMLElement>('.gs-learn-levels-label')[0].textContent?.trim(),
    ).toBe(TRANSLATIONS['generate.learn.level_label']);
    expect(
      query<HTMLElement>('.gs-learn-levels .gs-seg')[0].getAttribute(
        'aria-label',
      ),
    ).toBe(TRANSLATIONS['generate.learn.level_label']);
    expect(TRANSLATIONS['generate.learn.reveal.advanced']).toBeTruthy();
    expect(TRANSLATIONS['generate.learn.reveal.source']).toBeTruthy();
  });
});
