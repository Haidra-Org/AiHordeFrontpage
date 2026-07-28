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
  CONCEPT_FLOWS,
  TUTORIAL_LEVELS,
  TUTORIAL_STEPS,
  TutorialEngineService,
  TutorialStudioHost,
} from '../../../services/tutorial-engine.service';
import {
  GenerateFormValue,
  GenerateMode,
  GenerateSourceMode,
} from '../generate-form.model';
import { environment } from '../../../../environments/environment';
import en from '../../../../assets/i18n/en.json';
import stubIndex from '../../../testing/fixtures/sweep-index.stub.json';
import manifest from '../../../../assets/tutorials/manifest.json';
import request from '../../../../assets/tutorials/txt2img/request.json';

const TRANSLATIONS = en as Record<string, string>;

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
    http.expectOne('/assets/tutorials/manifest.json').flush(manifest);
    await new Promise((resolve) => setTimeout(resolve, 0));
    http
      .expectOne('/assets/tutorials/txt2img/request.json')
      .flush(structuredClone(request));
    await started;

    fixture = TestBed.createComponent(GenerateLearnPanelComponent);
    fixture.detectChanges();
  });

  it('lists every step of the flow, the current one marked', () => {
    const steps = query<HTMLButtonElement>('.gs-learn-step');

    expect(steps).toHaveLength(TUTORIAL_STEPS['txt2img'].length);
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
    expect(query('.gs-learn-card .gs-guide-head .gs-sec-chip')).toHaveLength(1);
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
    expect(body()).toContain(request.prompt);
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

    expect(host.applied).toEqual([{ prompt: request.prompt }]);
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
    expect(host.bulk[0].prompt).toBe(request.prompt);
    expect(host.applied).toEqual([]);
  });

  it('leaves the tutorial from the exit control', () => {
    query<HTMLButtonElement>('.gs-learn-exit')[0].click();

    expect(engine.active()).toBe(false);
  });

  it('names the flow by its outcome, with the technique behind it', () => {
    expect(text()).toContain(
      TRANSLATIONS['generate.tutorials.flows.txt2img.task_name'],
    );
    expect(text()).toContain('Text to image');
  });

  it('has prose for every step of every flow, in all three registers', () => {
    for (const [flowId, steps] of Object.entries(TUTORIAL_STEPS)) {
      for (const step of steps) {
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
    const handoffs = Object.entries(TUTORIAL_STEPS).flatMap(([flowId, steps]) =>
      steps
        .filter((step) => step.startsFlow)
        .map((step) => `generate.learn.flows.${flowId}.steps.${step.id}.cta`),
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

  describe('a concept track', () => {
    beforeEach(async () => {
      await engine.start('concepts_images');
      fixture.detectChanges();
    });

    it('lists its steps and names itself from its own prose', () => {
      expect(query('.gs-learn-step')).toHaveLength(
        TUTORIAL_STEPS['concepts_images'].length,
      );
      expect(text()).toContain(
        TRANSLATIONS['generate.learn.flows.concepts_images.task_name'],
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
      http.expectOne('/assets/tutorials/manifest.json').flush(manifest);
      await new Promise((resolve) => setTimeout(resolve, 0));
      http
        .expectOne('/assets/tutorials/txt2img/request.json')
        .flush(structuredClone(request));
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();

      expect(engine.step()?.id).toBe('prompt');
      expect(query('.gs-learn-apply')).toHaveLength(1);
    });
  });

  describe('parameter sweeps', () => {
    const SWEEP_INDEX = `${environment.sweepLibraryBaseUrl}/index.json`;

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
      expect(text()).toContain(TRANSLATIONS['generate.sweeps.expand']);
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

    it('leaves no residue when the library cannot be reached', async () => {
      engine.goTo(3);
      fixture.detectChanges();
      TestBed.inject(HttpTestingController)
        .expectOne(SWEEP_INDEX)
        .error(new ProgressEvent('offline'), { status: 0, statusText: '' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();

      expect(query('.gs-sweep')).toHaveLength(0);
      expect(text()).not.toContain(TRANSLATIONS['generate.sweeps.expand']);
    });
  });

  it('names each register and the reveal it can narrate', () => {
    for (const level of TUTORIAL_LEVELS) {
      expect(TRANSLATIONS[`generate.learn.level.${level}`]).toBeTruthy();
    }
    expect(TRANSLATIONS['generate.learn.reveal.advanced']).toBeTruthy();
    expect(TRANSLATIONS['generate.learn.reveal.source']).toBeTruthy();
  });
});
