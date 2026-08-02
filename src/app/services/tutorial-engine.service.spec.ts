import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONCEPT_FLOWS,
  TUTORIAL_STEPS,
  TutorialEngineService,
  TutorialStudioHost,
  canonicalFlowId,
  hasWorldVariants,
  isConceptFlow,
  resolveFlowId,
  tutorialAvailable,
  worldFlowId,
} from './tutorial-engine.service';
import { sectionFor } from '../content/sections';
import { GsHelpService } from './gs-help.service';
import { TutorialAnchorService } from './tutorial-anchor.service';
import {
  GenerateFormValue,
  GenerateMode,
  GenerateSourceMode,
} from '../pages/generate/generate-form.model';
import manifest from '../../assets/tutorials/manifest.json';
import request from '../../assets/tutorials/txt2img/request.json';
import { splitCombinedPrompt } from '../pages/generate/generate-form.model';
import type { TutorialManifest } from '../pages/generate/generate-tutorials/generate-tutorials.component';

const LEVEL_KEY = 'aihorde.generate.learn.level';
const WORLD_KEY = 'aihorde.generate.learn.world';

// The committed payload carries the negative inline, the way the horde takes
// it. Every value the tutorial shows is read back off that one string, so the
// halves are recovered here rather than written out a second time.
const [PROMPT, NEGATIVE] = splitCombinedPrompt(request.prompt);

/** Records what the studio was asked to do, and answers for the form's state. */
class HostSpy implements TutorialStudioHost {
  public readonly applied: Partial<GenerateFormValue>[] = [];
  public readonly modes: GenerateMode[] = [];
  public readonly sourceModes: GenerateSourceMode[] = [];
  public readonly bulk: GenerateFormValue[] = [];
  public mode: GenerateMode = 'simple';

  public applyFields(fields: Partial<GenerateFormValue>): void {
    this.applied.push(fields);
  }
  public currentMode(): GenerateMode {
    return this.mode;
  }
  public setMode(mode: GenerateMode): void {
    this.mode = mode;
    this.modes.push(mode);
  }
  public setSourceMode(mode: GenerateSourceMode): void {
    this.sourceModes.push(mode);
  }
  public openBulkApply(example: GenerateFormValue): void {
    this.bulk.push(example);
  }
}

/**
 * Run `body` with `document.getAnimations` answering the given stand-ins. jsdom
 * implements no part of the animation API, so the method has to be put on the
 * document for the duration and taken off again after.
 */
function withAnimations(
  animations: { animationName: string; startTime: number }[],
  body: () => void,
): void {
  const doc = document as Document & { getAnimations?: () => Animation[] };
  doc.getAnimations = () => animations as unknown as Animation[];
  try {
    body();
  } finally {
    delete doc.getAnimations;
  }
}

/** Let the engine's two chained fetches settle around their flushes. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('TutorialEngineService', () => {
  let engine: TutorialEngineService;
  let http: HttpTestingController;
  let host: HostSpy;

  async function startTxt2img(): Promise<void> {
    const started = engine.start('txt2img');
    http.expectOne('/assets/tutorials/manifest.json').flush(manifest);
    await settle();
    http
      .expectOne('/assets/tutorials/txt2img/request.json')
      .flush(structuredClone(request));
    await started;
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    engine = TestBed.inject(TutorialEngineService);
    http = TestBed.inject(HttpTestingController);
    host = new HostSpy();
    engine.registerHost(host);
  });

  afterEach(() => {
    http.verify();
  });

  it('offers steps for txt2img and the concept tracks, and nothing else', () => {
    expect(tutorialAvailable('txt2img')).toBe(true);
    for (const flow of CONCEPT_FLOWS) {
      expect(tutorialAvailable(flow)).toBe(true);
      expect(isConceptFlow(flow)).toBe(true);
    }
    for (const flow of ['img2img', 'controlnet', 'inpainting', 'facefix']) {
      expect(tutorialAvailable(flow)).toBe(false);
      expect(isConceptFlow(flow)).toBe(false);
    }
    expect(isConceptFlow(null)).toBe(false);
  });

  it('holds an armed flow in memory and hands it over exactly once', () => {
    engine.arm('txt2img');

    expect(engine.consumeArmed()).toBe('txt2img');
    expect(engine.consumeArmed()).toBeNull();
  });

  describe('once a flow has started', () => {
    beforeEach(async () => {
      await startTxt2img();
    });

    it('starts on the first step of the flow', () => {
      expect(engine.active()).toBe(true);
      expect(engine.stepIndex()).toBe(0);
      expect(engine.step()?.id).toBe('prompt');
      expect(engine.total()).toBe(TUTORIAL_STEPS['txt2img'].length);
    });

    it('reads its values off the committed request', () => {
      const example = engine.example();

      // The payload spells the negative inline; the tutorial shows the two
      // halves apart, as the panel that is being taught does.
      expect(request.prompt).toContain('###');
      expect(NEGATIVE).toBeTruthy();
      expect(example?.prompt).toBe(PROMPT);
      expect(example?.prompt).not.toContain('###');
      expect(example?.negativePrompt).toBe(NEGATIVE);
      expect(example?.model).toBe(request.models[0]);
      expect(example?.steps).toBe(request.params.steps);
      expect(example?.cfg_scale).toBe(request.params.cfg_scale);
      expect(example?.sampler_name).toBe(request.params.sampler_name);
      expect(example?.seed).toBe(request.params.seed);
      expect(example?.width).toBe(request.params.width);
    });

    it('walks forward and back, and refuses to step off either end', () => {
      engine.next();
      expect(engine.step()?.id).toBe('model');

      engine.back();
      expect(engine.stepIndex()).toBe(0);

      engine.back();
      expect(engine.stepIndex()).toBe(0);

      engine.goTo(engine.total() - 1);
      engine.next();
      expect(engine.stepIndex()).toBe(engine.total() - 1);
    });

    it('jumps to a step picked from the list', () => {
      engine.goTo(2);

      expect(engine.step()?.id).toBe('size');
    });

    it('opens advanced settings before a step that lives there, and says so', () => {
      engine.goTo(3);

      expect(host.modes).toEqual(['advanced']);
      expect(engine.step()?.id).toBe('steps');
      expect(engine.revealNote()).toBe('advanced');
    });

    it('says nothing about a section the reader already had open', () => {
      host.mode = 'advanced';

      engine.goTo(3);

      expect(host.modes).toEqual(['advanced']);
      expect(engine.revealNote()).toBeNull();
    });

    it('leaves no reveal note on a step that needs nothing revealed', () => {
      engine.goTo(3);
      engine.goTo(0);

      expect(engine.revealNote()).toBeNull();
    });

    it('names the fields of one control per step, and no others', () => {
      const example = engine.example()!;

      const named = TUTORIAL_STEPS['txt2img']
        .filter((step) => step.apply)
        .map((step) => [step.id, Object.keys(step.apply!(example))]);

      expect(named).toEqual([
        // The payload folds the negative into the prompt field, and the finale
        // is a real generation: writing one half without the other would send
        // the reader off to a different picture from the one on the page.
        ['prompt', ['prompt', 'negativePrompt']],
        ['model', ['model']],
        // Width and height come off one control in the panel (the size
        // presets), so one press stays one step.
        ['size', ['width', 'height']],
        ['steps', ['steps']],
        ['cfg', ['cfg_scale']],
        ['sampler', ['sampler_name']],
        ['seed', ['seed']],
      ]);
    });

    it('writes only the field the current step names', () => {
      engine.applyStep();
      expect(host.applied).toEqual([
        { prompt: PROMPT, negativePrompt: NEGATIVE },
      ]);

      engine.goTo(1);
      engine.applyStep();
      expect(host.applied[1]).toEqual({ model: request.models[0] });

      engine.goTo(3);
      engine.applyStep();
      expect(host.applied[2]).toEqual({ steps: request.params.steps });
    });

    it('offers both halves of the prompt to the prose', () => {
      expect(engine.copyParams()['prompt']).toBe(PROMPT);
      expect(engine.copyParams()['negative']).toBe(NEGATIVE);
    });

    it('has nothing to apply on the finale', () => {
      engine.goTo(engine.total() - 1);

      expect(engine.step()?.id).toBe('generate');
      expect(engine.canApply()).toBe(false);

      engine.applyStep();

      expect(host.applied).toEqual([]);
    });

    it('hands the whole example to the studio review panel for a bulk apply', () => {
      engine.applyAll();

      expect(host.bulk).toHaveLength(1);
      expect(host.bulk[0]).toMatchObject({
        // The bulk offer carries both halves, split as the form holds them.
        prompt: PROMPT,
        negativePrompt: NEGATIVE,
        model: request.models[0],
        steps: request.params.steps,
        cfg_scale: request.params.cfg_scale,
        sampler_name: request.params.sampler_name,
        seed: request.params.seed,
        width: request.params.width,
        height: request.params.height,
      });
      // The bulk route never writes on its own account.
      expect(host.applied).toEqual([]);
    });

    it('marks the current step field and expands its help note', () => {
      const anchors = TestBed.inject(TutorialAnchorService);
      const help = TestBed.inject(GsHelpService);
      const element = document.createElement('div');
      element.scrollIntoView = vi.fn();
      anchors.register('steps', element);

      engine.goTo(3);
      engine.focusStep();

      expect(element.classList.contains('gs-tut-target')).toBe(true);
      expect(element.scrollIntoView).toHaveBeenCalled();
      expect(help.requestedTopic()).toBe('steps');
    });

    it('rings the field only when the reader asks where it is', () => {
      const anchors = TestBed.inject(TutorialAnchorService);
      const element = document.createElement('div');
      element.scrollIntoView = vi.fn();
      anchors.register('steps', element);

      engine.goTo(3);
      engine.focusStep();
      expect(element.classList.contains('gs-tut-ping')).toBe(false);

      engine.focusStep(true);
      expect(element.classList.contains('gs-tut-ping')).toBe(true);
    });

    it('takes the mark off the field it has moved on from', () => {
      const anchors = TestBed.inject(TutorialAnchorService);
      const steps = document.createElement('div');
      const seed = document.createElement('div');
      steps.scrollIntoView = vi.fn();
      seed.scrollIntoView = vi.fn();
      anchors.register('steps', steps);
      anchors.register('seed', seed);

      engine.goTo(3);
      engine.focusStep();
      engine.goTo(6);
      engine.focusStep();

      expect(steps.classList.contains('gs-tut-target')).toBe(false);
      expect(seed.classList.contains('gs-tut-target')).toBe(true);
    });

    it('tints the marked field with the area the step is about', () => {
      const anchors = TestBed.inject(TutorialAnchorService);
      const prompt = document.createElement('div');
      const steps = document.createElement('div');
      prompt.scrollIntoView = vi.fn();
      steps.scrollIntoView = vi.fn();
      anchors.register('prompt', prompt);
      anchors.register('steps', steps);

      engine.focusStep();
      expect(prompt.classList.contains('gs-sec--prompt')).toBe(true);

      engine.goTo(3);
      engine.focusStep();

      expect(prompt.classList.contains('gs-sec--prompt')).toBe(false);
      expect(steps.classList.contains('gs-sec--sampling')).toBe(true);
    });

    it('puts every breathing glow back to the same phase on the next frame', () => {
      const anchors = TestBed.inject(TutorialAnchorService);
      const element = document.createElement('div');
      element.scrollIntoView = vi.fn();
      anchors.register('steps', element);

      const frames: FrameRequestCallback[] = [];
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        frames.push(cb);
        return frames.length;
      });
      const paired = { animationName: 'gs-breathe', startTime: 1200 };
      const unrelated = { animationName: 'gs-shimmer', startTime: 340 };
      withAnimations([paired, unrelated], () => {
        engine.goTo(3);
        engine.focusStep();

        // Nothing is touched until the frame the new overlays exist in.
        expect(paired.startTime).toBe(1200);
        for (const frame of frames) {
          frame(0);
        }

        expect(paired.startTime).toBe(0);
        expect(unrelated.startTime).toBe(340);
      });
    });

    it('marks the field as usual where the animation API is missing', () => {
      const anchors = TestBed.inject(TutorialAnchorService);
      const element = document.createElement('div');
      element.scrollIntoView = vi.fn();
      anchors.register('steps', element);
      engine.goTo(3);

      expect((document as Partial<Document>).getAnimations).toBeUndefined();
      expect(() => engine.focusStep()).not.toThrow();
      expect(element.classList.contains('gs-tut-target')).toBe(true);
    });

    it('closes the note it opened when the next step describes no field', () => {
      const anchors = TestBed.inject(TutorialAnchorService);
      const help = TestBed.inject(GsHelpService);
      const steps = document.createElement('div');
      steps.scrollIntoView = vi.fn();
      anchors.register('steps', steps);

      engine.goTo(3);
      engine.focusStep();
      help.claimTopic('gs-help-steps-0');
      expect(help.isOpen('gs-help-steps-0')).toBe(true);

      engine.goTo(engine.total() - 1);
      engine.focusStep();

      expect(help.isOpen('gs-help-steps-0')).toBe(false);
      expect(help.requestedTopic()).toBeNull();
    });

    it('leaves a note the reader opened themselves alone', () => {
      const help = TestBed.inject(GsHelpService);
      help.toggle('gs-help-seed-1');

      engine.goTo(engine.total() - 1);
      engine.focusStep();

      expect(help.isOpen('gs-help-seed-1')).toBe(true);
    });

    it('stands down and leaves a note when a generation is submitted on the finale', () => {
      engine.goTo(engine.total() - 1);

      engine.notifySubmitted();

      expect(engine.active()).toBe(false);
      expect(engine.completed()).toBe(true);
    });

    it('ignores a submission made partway through the flow', () => {
      engine.goTo(2);

      engine.notifySubmitted();

      expect(engine.active()).toBe(true);
      expect(engine.completed()).toBe(false);
    });

    it('drops the completion note when it is dismissed', () => {
      engine.goTo(engine.total() - 1);
      engine.notifySubmitted();

      engine.dismissCompletion();

      expect(engine.completed()).toBe(false);
    });

    it('leaves the flow on exit', () => {
      engine.goTo(2);

      engine.stop();

      expect(engine.active()).toBe(false);
      expect(engine.stepIndex()).toBe(0);
    });
  });

  describe('the concept tracks', () => {
    it('teaches from prose alone, asking the network for nothing', async () => {
      await engine.start('concepts_images');

      expect(engine.active()).toBe(true);
      expect(engine.total()).toBe(TUTORIAL_STEPS['concepts_images'].length);
      expect(engine.step()?.id).toBe('noise_to_picture');
      expect(engine.example()).toBeNull();
      expect(engine.exampleImage()).toBe('');
      expect(engine.loadFailed()).toBe(false);
      // The verify in afterEach is the assertion: a track fetches nothing.
    });

    it('points at no field and writes none', async () => {
      for (const flowId of CONCEPT_FLOWS) {
        await engine.start(flowId);
        for (const step of TUTORIAL_STEPS[flowId]) {
          expect(step.anchorId).toBeUndefined();
          expect(step.apply).toBeUndefined();
          expect(step.helpTopic).toBeUndefined();
          // A concept step belongs to no card, so no surface gives it a hue.
          expect(sectionFor('step', step.id)).toBeUndefined();
        }
        expect(engine.canApply()).toBe(false);
      }
    });

    it('walks through and finishes without touching the studio', async () => {
      await engine.start('concepts_horde');

      while (!engine.onFinale()) {
        engine.next();
      }

      expect(engine.step()?.id).toBe('where_next');
      expect(engine.step()?.startsFlow).toBe('txt2img');
      expect(host.applied).toEqual([]);
      expect(host.modes).toEqual([]);

      engine.stop();
      expect(engine.active()).toBe(false);
    });

    it('focuses nothing and leaves no note open on a step with no anchor', async () => {
      const help = TestBed.inject(GsHelpService);
      await engine.start('concepts_images');
      help.requestTopic('steps');
      help.claimTopic('gs-help-steps-0');

      expect(() => engine.focusStep()).not.toThrow();

      expect(help.requestedTopic()).toBeNull();
      expect(help.isOpen('gs-help-steps-0')).toBe(false);
    });

    it('is not finished by a generation submitted while it is read', async () => {
      await engine.start('concepts_horde');
      engine.goTo(engine.total() - 1);

      engine.notifySubmitted();

      expect(engine.active()).toBe(true);
      expect(engine.completed()).toBe(false);
    });

    it('drops the example of a previous flow rather than showing it here', async () => {
      await startTxt2img();
      expect(engine.example()).not.toBeNull();

      await engine.start('concepts_images');

      expect(engine.example()).toBeNull();
      expect(engine.flow()).toBeNull();
    });
  });

  it('writes an empty negative for an example that carries none', async () => {
    const plain = { ...structuredClone(request), prompt: 'a lighthouse' };
    const started = engine.start('txt2img');
    http.expectOne('/assets/tutorials/manifest.json').flush(manifest);
    await settle();
    http.expectOne('/assets/tutorials/txt2img/request.json').flush(plain);
    await started;

    engine.applyStep();

    // Nothing to steer away from is written as nothing, which is what the form
    // already holds: the step never has to know whether it has a pair.
    expect(engine.example()?.negativePrompt).toBe('');
    expect(host.applied).toEqual([
      { prompt: 'a lighthouse', negativePrompt: '' },
    ]);
  });

  it('reports a failure to fetch the example rather than running blind', async () => {
    const started = engine.start('txt2img');
    http
      .expectOne('/assets/tutorials/manifest.json')
      .error(new ProgressEvent('failed'));
    await started;

    expect(engine.loadFailed()).toBe(true);
    expect(engine.example()).toBeNull();
  });

  it('defaults to the most talkative register', () => {
    expect(engine.level()).toBe('new_to_this');
  });

  it('persists the chosen register', () => {
    engine.setLevel('expert');

    expect(localStorage.getItem(LEVEL_KEY)).toContain('expert');
  });

  describe('the world the examples are drawn from', () => {
    const MANIFEST = manifest as unknown as TutorialManifest;
    const PUBLISHED = MANIFEST.flows
      .filter((flow) => flow.status === 'available')
      .map((flow) => flow.id);
    // Which flows were drawn more than once grows as the example set does, so
    // the fallback is asserted against whichever flow is still pinned.
    const PINNED = MANIFEST.flows.find(
      (flow) =>
        flow.status === 'available' &&
        canonicalFlowId(flow.id) === flow.id &&
        !hasWorldVariants(flow.id, PUBLISHED),
    )!.id;

    it('defaults to the first world', () => {
      expect(engine.world()).toBe('w1');
    });

    it('persists the chosen world', () => {
      engine.setWorld('w3');

      expect(localStorage.getItem(WORLD_KEY)).toContain('w3');
    });

    it('restores the persisted world on a later visit', () => {
      engine.setWorld('w2');

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const fresh = TestBed.inject(TutorialEngineService);
      http = TestBed.inject(HttpTestingController);

      expect(fresh.world()).toBe('w2');
    });

    it('names a variant off its canonical flow, and reads it back', () => {
      expect(worldFlowId('txt2img', 'w1')).toBe('txt2img');
      expect(worldFlowId('txt2img', 'w2')).toBe('txt2img--w2');
      expect(canonicalFlowId('txt2img--w3')).toBe('txt2img');
      // Idempotent, so a variant id can be handed in anywhere a flow id can.
      expect(canonicalFlowId('txt2img')).toBe('txt2img');
      expect(worldFlowId('txt2img--w2', 'w3')).toBe('txt2img--w3');
    });

    it('falls back to the canonical example rather than to nothing', () => {
      expect(resolveFlowId('txt2img', 'w2', PUBLISHED)).toBe('txt2img--w2');
      expect(hasWorldVariants('txt2img', PUBLISHED)).toBe(true);
      // A flow drawn once is answered with the example it has, in every world.
      expect(hasWorldVariants(PINNED, PUBLISHED)).toBe(false);
      expect(resolveFlowId(PINNED, 'w2', PUBLISHED)).toBe(PINNED);
      expect(resolveFlowId(PINNED, 'w3', PUBLISHED)).toBe(PINNED);
      // And a world nothing at all was published in is not a dead end either.
      expect(resolveFlowId('txt2img', 'w3', [])).toBe('txt2img');
    });

    it('loads the assets of the chosen world, keeping canonical steps', async () => {
      engine.setWorld('w2');

      const started = engine.start('txt2img');
      http.expectOne('/assets/tutorials/manifest.json').flush(manifest);
      await settle();
      http
        .expectOne('/assets/tutorials/txt2img--w2/request.json')
        .flush(structuredClone(request));
      await started;

      expect(engine.flow()?.id).toBe('txt2img--w2');
      expect(engine.exampleImage()).toContain('/txt2img--w2/');
      // The flow being taught is still txt2img: one set of steps, one set of
      // prose, whichever pictures stand behind them.
      expect(engine.total()).toBe(TUTORIAL_STEPS['txt2img'].length);
      expect(engine.step()?.id).toBe('prompt');
    });

    it('re-fetches when the world changes under a flow it has already read', async () => {
      await startTxt2img();
      expect(engine.flow()?.id).toBe('txt2img');

      engine.setWorld('w2');
      const restarted = engine.start('txt2img');
      http.expectOne('/assets/tutorials/manifest.json').flush(manifest);
      await settle();
      http
        .expectOne('/assets/tutorials/txt2img--w2/request.json')
        .flush(structuredClone(request));
      await restarted;

      expect(engine.flow()?.id).toBe('txt2img--w2');
    });

    it('takes a variant id as the flow it belongs to', () => {
      engine.arm('txt2img--w2');

      expect(engine.consumeArmed()).toBe('txt2img');
    });
  });

  it('restores the persisted register on a later visit', () => {
    engine.setLevel('comfortable');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fresh = TestBed.inject(TutorialEngineService);
    http = TestBed.inject(HttpTestingController);

    expect(fresh.level()).toBe('comfortable');
  });
});
