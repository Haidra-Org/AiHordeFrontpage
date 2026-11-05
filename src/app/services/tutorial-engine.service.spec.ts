import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ModelAvailability,
  TutorialEngineService,
  TutorialStudioHost,
  canonicalFlowId,
  hasWorldVariants,
  resolveFlowId,
  worldFlowId,
} from './tutorial-engine.service';
import {
  CONCEPT_FLOWS,
  flowFollowable,
  flowSteps,
  isConceptFlow,
} from '../content/flows';
import { sectionFor } from '../content/sections';
import { GsHelpService } from './gs-help.service';
import { TutorialAnchorService } from './tutorial-anchor.service';
import {
  GenerateFormValue,
  GenerateSourceMode,
} from '../pages/generate/generate-form.model';
import manifest from '../testing/fixtures/example-manifest.stub.json';
import { EXAMPLES_ROOT } from '../content/examples';
import request from '../testing/fixtures/example-request.stub.json';
import meta from '../testing/fixtures/example-meta.stub.json';
import { splitCombinedPrompt } from '../pages/generate/generate-form.model';
import type { ExampleManifest } from '../content/examples';

const LEVEL_KEY = 'aihorde.generate.learn.level';
const WORLD_KEY = 'aihorde.generate.learn.world';
const SESSION_KEY = 'aihorde.generate.learn.session';
/** The studio's own key, mirrored here so the spy can answer across a reload. */
const SET_ASIDE_KEY = 'aihorde.generate.learn.set_aside';

// The committed payload carries the negative inline, the way the horde takes
// it. Every value the tutorial shows is read back off that one string, so the
// halves are recovered here rather than written out a second time.
const [PROMPT, NEGATIVE] = splitCombinedPrompt(request.prompt);

/** Records what the studio was asked to do, and answers for the form's state. */
class HostSpy implements TutorialStudioHost {
  public readonly applied: Partial<GenerateFormValue>[] = [];
  public readonly sourceModes: GenerateSourceMode[] = [];
  public readonly bulk: GenerateFormValue[] = [];
  /** Every anchor the engine asked the panel to unfold the group of. */
  public readonly openedGroupsFor: string[] = [];
  /**
   * The fields whose group is currently folded, which is what the panel's own
   * first visit looks like. Unfolding one is what the engine narrates, so the
   * spy has to be able to answer whether anything actually moved.
   */
  public readonly folded = new Set<string>([
    'steps',
    'cfg',
    'sampler',
    'seed',
    'transparent',
    'qr',
  ]);
  public sourceMode: GenerateSourceMode = 'none';

  /**
   * What the live model list says about each model. A model nothing is said
   * about is being carried, which is the case every other test runs in.
   */
  public readonly availability = new Map<string, ModelAvailability>();

  public modelAvailability(name: string): ModelAvailability {
    return this.availability.get(name) ?? 'available';
  }

  public applyFields(fields: Partial<GenerateFormValue>): void {
    this.applied.push(fields);
    // The studio writes the panel, so a step that applies the source mode moves
    // the state the next step's reveal is measured against.
    if (fields.sourceMode !== undefined) {
      this.sourceMode = fields.sourceMode;
    }
  }
  public currentSourceMode(): GenerateSourceMode {
    return this.sourceMode;
  }
  public setSourceMode(mode: GenerateSourceMode): void {
    this.sourceMode = mode;
    this.sourceModes.push(mode);
  }
  public openFieldGroup(anchorId: string): boolean {
    this.openedGroupsFor.push(anchorId);
    return this.folded.delete(anchorId);
  }
  public openBulkApply(example: GenerateFormValue): void {
    this.bulk.push(example);
  }
  /** Every clearing of the panel the engine asked for, in order. */
  public readonly setAsides: { flowId: string; keepSource: boolean }[] = [];
  public restored = 0;

  /**
   * Whether settings are put away. Kept in storage as the studio keeps them, so
   * a spy standing in for a studio built after a reload answers what the real
   * one would rather than starting from nothing.
   */
  public get held(): boolean {
    return localStorage.getItem(SET_ASIDE_KEY) !== null;
  }
  public set held(value: boolean) {
    if (value) {
      localStorage.setItem(SET_ASIDE_KEY, '{}');
    } else {
      localStorage.removeItem(SET_ASIDE_KEY);
    }
  }

  public setAside(flowId: string, keepSource: boolean): void {
    if (this.held) {
      return;
    }
    this.held = true;
    this.setAsides.push({ flowId, keepSource });
  }
  public hasSetAside(): boolean {
    return this.held;
  }
  public restoreSetAside(): boolean {
    if (!this.held) {
      return false;
    }
    this.held = false;
    this.restored++;
    return true;
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
  const original = document.getAnimations;
  document.getAnimations = () => animations as unknown as Animation[];
  try {
    body();
  } finally {
    document.getAnimations = original;
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

  /**
   * Answer the two files a flow's example is made of. They are asked for
   * together, so a test that answered only the payload would leave the engine
   * waiting on a request it never sees.
   */
  function flushExample(directory: string, payload: object = request): void {
    http
      .expectOne(`${EXAMPLES_ROOT}/${directory}/request.json`)
      .flush(structuredClone(payload));
    http.expectOne(`${EXAMPLES_ROOT}/${directory}/meta.json`).flush(meta);
  }

  async function startTxt2img(): Promise<void> {
    const started = engine.start('txt2img');
    http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
    await settle();
    flushExample('txt2img');
    await started;
  }

  /** Every page scroll the engine asked for, in order. */
  let scrolled: ScrollToOptions[];
  const scrolls = (): ScrollToOptions[] => scrolled;

  /**
   * A control at a known place on a page of a known height. The engine puts a
   * control in the strip of page a sheet leaves, so the maths needs a box to
   * read and jsdom lays nothing out.
   */
  function placed(top: number, height: number): HTMLElement {
    const element = document.createElement('div');
    element.getBoundingClientRect = (): DOMRect => ({
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    return element;
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
    scrolled = [];
    vi.stubGlobal('scrollTo', (options: ScrollToOptions) => {
      scrolled.push(options);
    });
  });

  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty('--gs-sheet-clearance');
  });

  it('offers steps for every technique and for the concept tracks', () => {
    for (const flow of [
      'txt2img',
      'img2img',
      'controlnet',
      'inpainting',
      'remix',
      'transparent',
      'qr_code',
    ]) {
      expect(flowFollowable(flow), `${flow}`).toBe(true);
      expect(isConceptFlow(flow)).toBe(false);
    }
    for (const flow of CONCEPT_FLOWS) {
      expect(flowFollowable(flow)).toBe(true);
      expect(isConceptFlow(flow)).toBe(true);
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
      expect(engine.total()).toBe(flowSteps('txt2img').length);
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

    it('unfolds the group a folded field sits in, and says so', () => {
      engine.goTo(3);

      expect(host.openedGroupsFor).toContain('steps');
      expect(engine.step()?.id).toBe('steps');
      expect(engine.revealNote()).toBe('group');
    });

    it('says nothing about a group the reader already had open', () => {
      host.folded.delete('steps');

      engine.goTo(3);

      expect(host.openedGroupsFor).toContain('steps');
      expect(engine.revealNote()).toBeNull();
    });

    it('leaves no reveal note on a step that needs nothing revealed', () => {
      engine.goTo(3);
      engine.goTo(0);

      expect(engine.revealNote()).toBeNull();
    });

    it('names only the fields taught by each step', () => {
      const named = flowSteps('txt2img')
        .filter((step) => step.applyFields?.length)
        .map((step) => [step.id, [...step.applyFields!]]);

      expect(named).toEqual([
        // The payload folds the negative into the prompt field, and the finale
        // is a real generation: writing one half without the other would send
        // the reader off to a different picture from the one on the page.
        ['prompt', ['prompt', 'negativePrompt']],
        ['model', ['model', 'clip_skip']],
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
      expect(host.applied[1]).toEqual({
        model: request.models[0],
        clip_skip: request.params.clip_skip ?? 1,
      });

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

    it('rings every control a step wrote, so the write is seen as well as said', () => {
      const anchors = TestBed.inject(TutorialAnchorService);
      const size = document.createElement('div');
      const model = document.createElement('div');
      size.scrollIntoView = vi.fn();
      model.scrollIntoView = vi.fn();
      anchors.register('size', size);
      anchors.register('model', model);

      // The size step writes width and height, which share the size control.
      engine.goTo(2);
      engine.applyStep();

      expect(size.classList.contains('gs-tut-ping')).toBe(true);
      expect(model.classList.contains('gs-tut-ping')).toBe(false);
      // The written control is brought into view as a pointed one is, and only
      // the first of them: two scrolls would leave the reader at the second.
      expect(scrolls()).toHaveLength(1);
    });

    it('answers the keyboard while it has the pane, and not from inside a field', () => {
      const key = (k: string, target?: HTMLElement): KeyboardEvent => {
        const event = new KeyboardEvent('keydown', { key: k, bubbles: true });
        if (target) {
          Object.defineProperty(event, 'target', { value: target });
        }
        return event;
      };
      engine.goTo(2);

      expect(engine.handleKey(key(']'))).toBe(true);
      expect(engine.stepIndex()).toBe(3);
      expect(engine.handleKey(key('['))).toBe(true);
      expect(engine.stepIndex()).toBe(2);

      // Typing in a field: the bracket is a bracket.
      const input = document.createElement('input');
      expect(engine.handleKey(key(']', input))).toBe(false);
      expect(engine.stepIndex()).toBe(2);

      // Escape parks, from anywhere.
      expect(engine.handleKey(key('Escape', input))).toBe(true);
      expect(engine.parked()).toBe(true);
      // Parked, the keys are nobody's.
      expect(engine.handleKey(key(']'))).toBe(false);
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
      expect(scrolls()).toHaveLength(1);
      expect(help.requestedTopic()).toBe('steps');
    });

    it('centres the field in the page a sheet leaves, not in the viewport', () => {
      const anchors = TestBed.inject(TutorialAnchorService);
      // A sheet 300 tall leaves 468 of a 768 screen.
      document.documentElement.style.setProperty(
        '--gs-sheet-clearance',
        '300px',
      );
      anchors.register('steps', placed(500, 100));

      engine.goTo(3);
      engine.focusStep();

      // Centred in what is left: (468 - 100) / 2 = 184 above the control, and
      // not the 334 that centring in the whole screen would put above it.
      expect(scrolls()[0].top).toBe(316);
    });

    it('puts a control taller than that page at the top of it', () => {
      const anchors = TestBed.inject(TutorialAnchorService);
      document.documentElement.style.setProperty(
        '--gs-sheet-clearance',
        '300px',
      );
      // Taller than the 412 the sheet leaves, and with no row registered under
      // it: the head of the control is what has to be on the screen.
      anchors.register('steps', placed(500, 600));

      engine.goTo(3);
      engine.focusStep();

      expect(scrolls()[0].top).toBe(484);
    });

    it('moves the panel a field scrolls inside, where the page has nothing to move', () => {
      const anchors = TestBed.inject(TutorialAnchorService);
      // Beside the results the settings panel scrolls itself: on the screen
      // from 100 to 700, with 2000 of content and 250 of it already scrolled.
      const panel = document.createElement('div');
      panel.style.overflowY = 'auto';
      Object.defineProperty(panel, 'scrollHeight', { value: 2000 });
      Object.defineProperty(panel, 'clientHeight', { value: 600 });
      panel.scrollTop = 250;
      const moved = vi.fn();
      panel.scrollTo = moved;
      panel.getBoundingClientRect = (): DOMRect =>
        ({ top: 100, bottom: 700, height: 600 }) as DOMRect;
      const field = placed(900, 100);
      panel.appendChild(field);
      document.body.appendChild(panel);
      anchors.register('steps', field);

      try {
        engine.goTo(3);
        engine.focusStep(true);

        // Centred in the part of the panel on the screen: (600 - 100) / 2 = 250
        // above the field, so the panel moves to 250 + 900 - 100 - 250 = 800.
        expect(moved).toHaveBeenCalledTimes(1);
        expect((moved.mock.calls[0][0] as ScrollToOptions).top).toBe(800);
        expect(scrolls()).toHaveLength(0);
      } finally {
        panel.remove();
      }
    });

    it('points at the row inside a group the page has no room for', () => {
      const anchors = TestBed.inject(TutorialAnchorService);
      document.documentElement.style.setProperty(
        '--gs-sheet-clearance',
        '300px',
      );
      const group = placed(200, 600);
      const row = placed(400, 100);
      anchors.register('size', group);
      anchors.register('size.row', row);

      engine.goTo(2);
      engine.focusStep();

      expect(row.classList.contains('gs-tut-target')).toBe(true);
      expect(group.classList.contains('gs-tut-target')).toBe(false);
    });

    it('keeps the group where the page has room for the whole of it', () => {
      const anchors = TestBed.inject(TutorialAnchorService);
      const group = placed(200, 300);
      const row = placed(400, 100);
      anchors.register('size', group);
      anchors.register('size.row', row);

      engine.goTo(2);
      engine.focusStep();

      expect(group.classList.contains('gs-tut-target')).toBe(true);
      expect(row.classList.contains('gs-tut-target')).toBe(false);
    });

    it('leaves the field note shut while a sheet is over the form', () => {
      const anchors = TestBed.inject(TutorialAnchorService);
      const help = TestBed.inject(GsHelpService);
      document.documentElement.style.setProperty(
        '--gs-sheet-clearance',
        '300px',
      );
      anchors.register('steps', placed(500, 100));

      engine.goTo(3);
      engine.focusStep();

      // The note would double the height of the row and push the control it
      // describes off the page the sheet leaves. The `?` still opens it.
      expect(help.requestedTopic()).toBeNull();
    });

    it('asks the panel to unfold the field before pointing at it', () => {
      const anchors = TestBed.inject(TutorialAnchorService);
      const element = document.createElement('div');
      element.scrollIntoView = vi.fn();
      anchors.register('steps', element);

      engine.goTo(3);
      engine.focusStep();

      // A folded group holds nothing to point at, so the unfolding is asked for
      // whether or not the reader had folded it.
      expect(host.openedGroupsFor).toContain('steps');
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

    it('remembers a finished technique and suggests the next undone one', () => {
      expect(engine.isDone('txt2img')).toBe(false);
      expect(engine.nextUndone()).toBe('txt2img');

      engine.goTo(engine.total() - 1);
      engine.notifySubmitted();

      expect(engine.isDone('txt2img')).toBe(true);
      expect(engine.doneCount()).toBe(1);
      expect(engine.nextUndone()).toBe('img2img');
      // Kept in this browser, so a fresh engine knows it too.
      expect(
        JSON.parse(localStorage.getItem('aihorde.generate.learn.done') ?? '[]'),
      ).toEqual(['txt2img']);
    });

    it('offers the technique that follows the one just finished, until dismissed', () => {
      engine.goTo(engine.total() - 1);

      engine.notifySubmitted();

      // The finished flow is the one the note recaps; its successor is the
      // one the note offers to start.
      expect(engine.finishedFlowId()).toBe('txt2img');
      expect(engine.nextFlow()).toBe('img2img');

      engine.dismissCompletion();

      expect(engine.finishedFlowId()).toBeNull();
      expect(engine.nextFlow()).toBeNull();
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

  describe('a flow that works from a source image', () => {
    // The same committed payload with the two things that make it img2img: the
    // source processing the horde is told about, and the strength that says how
    // far the render may travel from the picture.
    const sourced = {
      ...structuredClone(request),
      params: { ...request.params, denoising_strength: 0.55 },
      source_processing: 'img2img',
    };

    async function startImg2img(): Promise<void> {
      const started = engine.start('img2img');
      http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
      await settle();
      flushExample('img2img', sourced);
      await started;
    }

    beforeEach(async () => {
      await startImg2img();
    });

    it('offers the picture the run started from as well as the one it made', () => {
      expect(engine.exampleSource()).toContain('/img2img/source.webp');
      expect(engine.exampleImage()).toContain('/img2img/result.webp');
    });

    it('reads the source mode back off the committed request', () => {
      expect(engine.example()?.sourceMode).toBe('img2img');
      expect(engine.example()?.denoising_strength).toBe(0.55);
      expect(engine.copyParams()['denoise']).toBe(0.55);
    });

    it('walks every step to the finale, writing what each one names', () => {
      const written: [string, Partial<GenerateFormValue>][] = [];
      const visited: string[] = [];
      for (let index = 0; index < engine.total(); index++) {
        engine.goTo(index);
        const id = engine.step()!.id;
        visited.push(id);
        if (engine.canApply()) {
          engine.applyStep();
          written.push([id, host.applied[host.applied.length - 1]]);
        }
      }

      expect(visited).toEqual([
        'mode',
        'source',
        'denoise',
        'prompt',
        'model',
        'generate',
      ]);
      expect(written).toEqual([
        // The picture itself is the reader's: the source step narrates.
        ['mode', { sourceMode: 'img2img' }],
        ['denoise', { denoising_strength: 0.55 }],
        ['prompt', { prompt: PROMPT, negativePrompt: NEGATIVE }],
        [
          'model',
          {
            model: request.models[0],
            width: request.params.width,
            height: request.params.height,
            clip_skip: request.params.clip_skip,
          },
        ],
      ]);
      expect(engine.onFinale()).toBe(true);
      expect(engine.canApply()).toBe(false);

      engine.notifySubmitted();
      expect(engine.completed()).toBe(true);
    });

    it('opens the source section the steps live in', () => {
      // The source card is one of the always-open ones, so its first step has
      // nothing to narrate; the source mode follows on the step that needs the
      // strength slider to exist.
      expect(engine.revealNote()).toBeNull();

      engine.goTo(2);

      expect(host.sourceModes).toEqual(['img2img']);
      expect(engine.revealNote()).toBe('source');
    });

    it('says nothing about a source mode the reader has already set', () => {
      engine.goTo(0);
      engine.applyStep();

      engine.goTo(2);

      expect(engine.revealNote()).toBeNull();
    });
  });

  describe('a flow that runs a workflow', () => {
    // The committed payload with what makes it a QR request: the text the
    // workflow is selected by, and the sampling recipe it was scan-tested with
    // rather than the defaults the other examples share.
    const QR_TEXT = 'https://aihorde.net';
    const qr = {
      ...structuredClone(request),
      params: {
        ...request.params,
        sampler_name: 'k_euler',
        cfg_scale: 7.5,
        steps: 25,
        karras: false,
        workflow: 'qr_code',
        extra_texts: [{ text: QR_TEXT, reference: 'qr_code' }],
      },
    };

    beforeEach(async () => {
      const started = engine.start('qr_code');
      http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
      await settle();
      flushExample('qr_code', qr);
      await started;
    });

    it('reads the workflow payload back out of extra_texts', () => {
      expect(engine.example()?.qrText).toBe(QR_TEXT);
      expect(engine.copyParams()['qr']).toBe(QR_TEXT);
      expect(engine.copyParams()['sampler']).toBe('k_euler');
      expect(engine.copyParams()['cfg']).toBe(7.5);
    });

    it('walks every step to the finale, writing what each one names', () => {
      const written: [string, Partial<GenerateFormValue>][] = [];
      const visited: string[] = [];
      for (let index = 0; index < engine.total(); index++) {
        engine.goTo(index);
        const id = engine.step()!.id;
        visited.push(id);
        if (engine.canApply()) {
          engine.applyStep();
          written.push([id, host.applied[host.applied.length - 1]]);
        }
      }

      expect(visited).toEqual([
        'model',
        'prompt',
        'qr',
        'size',
        'cfg',
        'generate',
      ]);
      expect(written).toEqual([
        [
          'model',
          {
            model: request.models[0],
            clip_skip: request.params.clip_skip ?? 1,
          },
        ],
        ['prompt', { prompt: PROMPT, negativePrompt: NEGATIVE }],
        // Typing the text is what selects the workflow, so it is the whole of
        // what this step writes.
        ['qr', { qrText: QR_TEXT }],
        [
          'size',
          { width: request.params.width, height: request.params.height },
        ],
        // The comparison uses the recorded settings together.
        [
          'cfg',
          {
            cfg_scale: 7.5,
            steps: 25,
            sampler_name: 'k_euler',
            scheduler: 'normal',
          },
        ],
      ]);
      // The sampling values are the payload's, not the studio's defaults.
      expect(engine.onFinale()).toBe(true);
      expect(engine.canApply()).toBe(false);

      engine.notifySubmitted();
      expect(engine.completed()).toBe(true);
    });

    it('unfolds the group holding the field the workflow is chosen by', () => {
      // Model selection needs no disclosure; the QR field does.
      expect(engine.revealNote()).toBeNull();

      engine.goTo(2);

      expect(engine.revealNote()).toBe('group');
      expect(host.openedGroupsFor).toContain('qr');
    });
  });

  describe('the concept tracks', () => {
    it('teaches from prose alone, asking the network for nothing', async () => {
      await engine.start('concepts_images');

      expect(engine.active()).toBe(true);
      expect(engine.total()).toBe(flowSteps('concepts_images').length);
      expect(engine.step()?.id).toBe('noise_to_picture');
      expect(engine.example()).toBeNull();
      expect(engine.exampleImage()).toBe('');
      expect(engine.loadFailed()).toBe(false);
      // The verify in afterEach is the assertion: a track fetches nothing.
    });

    it('points at no field and writes none', async () => {
      for (const flowId of CONCEPT_FLOWS) {
        await engine.start(flowId);
        for (const step of flowSteps(flowId)) {
          expect(step.anchorId).toBeUndefined();
          expect(step.applyFields).toBeUndefined();
          expect(step.helpTopic).toBeUndefined();
          // A concept step belongs to no card, so no surface gives it a hue.
          expect(sectionFor(step.id)).toBeUndefined();
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
      expect(host.openedGroupsFor).toEqual([]);

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

  describe('the model the step writes', () => {
    /** Where the model step stands in the technique the tests follow. */
    const modelStep = flowSteps('txt2img').findIndex(
      (step) => step.anchorId === 'model',
    );

    /** The model the committed example was generated with. */
    function exampleModel(): string {
      return engine.example()?.model ?? '';
    }

    it('says nothing while a worker is carrying it', async () => {
      await startTxt2img();

      engine.goTo(modelStep);

      expect(engine.stepModelNoteKey()).toBeNull();
    });

    it('says the picture will wait where nobody is carrying it', async () => {
      await startTxt2img();
      host.availability.set(exampleModel(), 'no_workers');

      engine.goTo(modelStep);

      expect(engine.stepModelNoteKey()).toBe('generate.learn.model_no_workers');
    });

    it('says to pick another where the horde no longer lists it', async () => {
      await startTxt2img();
      host.availability.set(exampleModel(), 'unknown');

      engine.goTo(modelStep);

      expect(engine.stepModelNoteKey()).toBe('generate.learn.model_gone');
    });

    it('says nothing on a step that is about something else', async () => {
      await startTxt2img();
      host.availability.set(exampleModel(), 'unknown');

      engine.goTo(0);

      expect(flowSteps('txt2img')[0].anchorId).not.toBe('model');
      expect(engine.stepModelNoteKey()).toBeNull();
    });

    it('says nothing on a concept track, which writes no model', async () => {
      await startTxt2img();
      host.availability.set(exampleModel(), 'unknown');

      await engine.start('concepts_images');

      expect(engine.stepModelNoteKey()).toBeNull();
    });
  });

  it('writes an empty negative for an example that carries none', async () => {
    const plain = { ...structuredClone(request), prompt: 'a lighthouse' };
    const started = engine.start('txt2img');
    http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
    await settle();
    flushExample('txt2img', plain);
    await started;

    engine.applyStep();

    // Nothing to steer away from is written as nothing, which is what the form
    // already holds: the step never has to know whether it has a pair.
    expect(engine.example()?.negativePrompt).toBe('');
    expect(host.applied).toEqual([
      { prompt: 'a lighthouse', negativePrompt: '' },
    ]);
  });

  it('applies CLIP skip 2 from an anime example rather than the form default', async () => {
    const started = engine.start('txt2img');
    http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
    await settle();
    flushExample('txt2img', {
      ...request,
      models: ['Nova Anime XL'],
      params: { ...request.params, clip_skip: 2 },
    });
    await started;
    engine.goTo(1);
    engine.applyStep();
    expect(host.applied).toEqual([{ model: 'Nova Anime XL', clip_skip: 2 }]);
    expect(engine.copyParams()['clip_skip']).toBe(2);
  });

  it('reports a failure to fetch the example rather than running blind', async () => {
    const started = engine.start('txt2img');
    http
      .expectOne(`${EXAMPLES_ROOT}/manifest.json`)
      .error(new ProgressEvent('failed'));
    await started;

    expect(engine.loadFailed()).toBe(true);
    expect(engine.example()).toBeNull();
  });

  it('reports what the published run took, off the record of the run', async () => {
    await startTxt2img();

    expect(engine.runCost()).toEqual({ time: 8, kudos: 12.5 });
  });

  it('defaults to the most talkative register', () => {
    expect(engine.level()).toBe('new_to_this');
  });

  it('persists the chosen register', () => {
    engine.setLevel('expert');

    expect(localStorage.getItem(LEVEL_KEY)).toContain('expert');
  });

  describe('the world the examples are drawn from', () => {
    const MANIFEST = manifest as unknown as ExampleManifest;
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
      http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
      await settle();
      flushExample('txt2img--w2');
      await started;

      expect(engine.flow()?.id).toBe('txt2img--w2');
      expect(engine.exampleImage()).toContain('/txt2img--w2/');
      // The flow being taught is still txt2img: one set of steps, one set of
      // prose, whichever pictures stand behind them.
      expect(engine.total()).toBe(flowSteps('txt2img').length);
      expect(engine.step()?.id).toBe('prompt');
    });

    it('re-fetches when the world changes under a flow it has already read', async () => {
      await startTxt2img();
      expect(engine.flow()?.id).toBe('txt2img');

      engine.setWorld('w2');
      http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
      await settle();
      flushExample('txt2img--w2');
      await settle();

      expect(engine.flow()?.id).toBe('txt2img--w2');
    });

    it('changes the example under the reader without moving them', async () => {
      await startTxt2img();
      engine.next();
      engine.next();
      const wasAt = engine.stepIndex();
      expect(wasAt).toBeGreaterThan(0);

      engine.setWorld('w2');
      http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
      await settle();
      flushExample('txt2img--w2', {
        ...structuredClone(request),
        prompt: 'a fox shrine at dusk',
      });
      await settle();

      // The step the reader is on, the register they chose and the flow being
      // taught are all where they were; only the worked example moved.
      expect(engine.stepIndex()).toBe(wasAt);
      expect(engine.activeFlowId()).toBe('txt2img');
      expect(engine.copyParams()['prompt']).toBe('a fox shrine at dusk');
      expect(engine.exampleImage()).toContain('/txt2img--w2/');
      expect(engine.isLoading()).toBe(false);
    });

    it('leaves a track alone, which has no example to change', async () => {
      await engine.start('concepts_images');

      engine.setWorld('w2');

      expect(engine.world()).toBe('w2');
      http.expectNone(`${EXAMPLES_ROOT}/manifest.json`);
    });

    it('keeps the world chosen last when an earlier fetch lands late', async () => {
      await startTxt2img();

      engine.setWorld('w2');
      engine.setWorld('w1');
      const manifests = http.match(`${EXAMPLES_ROOT}/manifest.json`);
      expect(manifests).toHaveLength(2);

      // The world chosen last answers first, and the one abandoned on the way
      // answers after it.
      manifests[1].flush(manifest);
      await settle();
      flushExample('txt2img');
      await settle();
      manifests[0].flush(manifest);
      await settle();
      flushExample('txt2img--w2');
      await settle();

      expect(engine.flow()?.id).toBe('txt2img');
      expect(engine.exampleImage()).not.toContain('--w2');
    });

    it('takes a variant id as the flow it belongs to', () => {
      engine.arm('txt2img--w2');

      expect(engine.consumeArmed()).toBe('txt2img');
    });
  });

  describe('the clean bench a technique starts on', () => {
    it('has the studio put the settings away, once per set', async () => {
      await startTxt2img();

      expect(host.setAsides).toEqual([
        { flowId: 'txt2img', keepSource: false },
      ]);
      expect(engine.settingsSetAside()).toBe(true);

      // Starting the same lesson again must not save the cleared panel over the
      // settings the first start put away. The example is already loaded, so
      // this start fetches nothing.
      await engine.start('txt2img');

      expect(host.setAsides).toHaveLength(1);
    });

    it('keeps an attached picture for a technique whose steps use one', async () => {
      const started = engine.start('img2img');
      http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
      await settle();
      flushExample('img2img');
      await started;

      expect(host.setAsides).toEqual([{ flowId: 'img2img', keepSource: true }]);
    });

    it('clears nothing for a concept track', async () => {
      await engine.start('concepts_images');

      expect(host.setAsides).toEqual([]);
      expect(engine.settingsSetAside()).toBe(false);
    });

    it('brings the settings back only when asked, and only once', async () => {
      await startTxt2img();

      engine.restoreSettings();

      expect(host.restored).toBe(1);
      expect(engine.settingsSetAside()).toBe(false);

      engine.restoreSettings();

      expect(host.restored).toBe(1);
    });

    it('leaves the settings put away when the tutorial ends', async () => {
      await startTxt2img();

      engine.stop();

      expect(host.restored).toBe(0);
      expect(engine.settingsSetAside()).toBe(true);
    });

    it('reads the studio answer when a studio registers', () => {
      const waiting = new HostSpy();
      waiting.held = true;

      engine.registerHost(waiting);

      expect(engine.settingsSetAside()).toBe(true);
    });
  });

  describe('the tutorial a reload interrupted', () => {
    /** A fresh service over whatever is in storage, as a reload builds one. */
    function reopen(): TutorialEngineService {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const fresh = TestBed.inject(TutorialEngineService);
      http = TestBed.inject(HttpTestingController);
      host = new HostSpy();
      fresh.registerHost(host);
      return fresh;
    }

    it('writes down the step it is on and offers it back', async () => {
      await startTxt2img();
      engine.goTo(2);

      const fresh = reopen();

      expect(fresh.resumeOffered()).toBe(true);
      expect(fresh.resumableFlowId()).toBe('txt2img');
      expect(fresh.resumableStep()).toBe(3);
      expect(fresh.resumableTotal()).toBe(flowSteps('txt2img').length);
      // The offer is an offer: nothing has started.
      expect(fresh.active()).toBe(false);
    });

    it('picks the tutorial up at the step it was left on', async () => {
      await startTxt2img();
      engine.goTo(2);
      const fresh = reopen();

      const continued = fresh.continueSession();
      http.expectOne(`${EXAMPLES_ROOT}/manifest.json`).flush(manifest);
      await settle();
      flushExample('txt2img');
      await continued;

      expect(fresh.active()).toBe(true);
      expect(fresh.stepIndex()).toBe(2);
      expect(fresh.resumeOffered()).toBe(false);
    });

    it('drops the offer when the reader turns it down', async () => {
      await startTxt2img();
      const fresh = reopen();

      fresh.leaveSession();

      expect(fresh.resumeOffered()).toBe(false);
      // Turning the tutorial down says nothing about the settings it put away.
      expect(fresh.settingsSetAside()).toBe(true);
      expect(reopen().resumeOffered()).toBe(false);
    });

    it('forgets a tutorial that finished', async () => {
      await startTxt2img();
      engine.goTo(flowSteps('txt2img').length - 1);
      engine.notifySubmitted();

      expect(reopen().resumeOffered()).toBe(false);
    });

    it('forgets a tutorial left more than a day ago', async () => {
      await startTxt2img();
      const stored = JSON.parse(
        localStorage.getItem(SESSION_KEY) ?? 'null',
      ) as {
        savedAt: number;
      };
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          ...stored,
          savedAt: stored.savedAt - 25 * 60 * 60 * 1000,
        }),
      );

      expect(reopen().resumeOffered()).toBe(false);
    });

    it('writes nothing down for a concept track', async () => {
      await engine.start('concepts_images');

      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
      expect(reopen().resumeOffered()).toBe(false);
    });

    it('lets a tutorial asked for by name replace the one written down', async () => {
      await startTxt2img();

      engine.arm('img2img');

      expect(engine.resumeOffered()).toBe(false);
      expect(reopen().resumeOffered()).toBe(false);
    });

    it('ignores a stored step the flow no longer has', async () => {
      await startTxt2img();
      const stored = JSON.parse(
        localStorage.getItem(SESSION_KEY) ?? 'null',
      ) as object;
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ ...stored, index: 99 }),
      );

      expect(reopen().resumeOffered()).toBe(false);
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
