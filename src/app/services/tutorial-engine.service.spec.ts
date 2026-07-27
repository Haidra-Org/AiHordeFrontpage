import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TUTORIAL_STEPS,
  TutorialEngineService,
  TutorialStudioHost,
  tutorialAvailable,
} from './tutorial-engine.service';
import { GsHelpService } from './gs-help.service';
import { TutorialAnchorService } from './tutorial-anchor.service';
import {
  GenerateFormValue,
  GenerateMode,
  GenerateSourceMode,
} from '../pages/generate/generate-form.model';
import manifest from '../../assets/tutorials/manifest.json';
import request from '../../assets/tutorials/txt2img/request.json';

const LEVEL_KEY = 'aihorde.generate.learn.level';

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

  it('offers follow-along steps for txt2img only', () => {
    expect(tutorialAvailable('txt2img')).toBe(true);
    for (const flow of ['img2img', 'controlnet', 'inpainting', 'facefix']) {
      expect(tutorialAvailable(flow)).toBe(false);
    }
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

      expect(example?.prompt).toBe(request.prompt);
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

    it('names exactly one control per step, the size pair aside', () => {
      const example = engine.example()!;

      const named = TUTORIAL_STEPS['txt2img']
        .filter((step) => step.apply)
        .map((step) => [step.id, Object.keys(step.apply!(example))]);

      expect(named).toEqual([
        ['prompt', ['prompt']],
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
      expect(host.applied).toEqual([{ prompt: request.prompt }]);

      engine.goTo(1);
      engine.applyStep();
      expect(host.applied[1]).toEqual({ model: request.models[0] });

      engine.goTo(3);
      engine.applyStep();
      expect(host.applied[2]).toEqual({ steps: request.params.steps });
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
        prompt: request.prompt,
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
