import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import {
  Injectable,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DatabaseService } from './database.service';
import { GsHelpService } from './gs-help.service';
import { TutorialAnchorService } from './tutorial-anchor.service';
import {
  GenerateFormValue,
  GenerateMode,
  GenerateSourceMode,
  requestToFormValue,
} from '../pages/generate/generate-form.model';
import { ImageGenerationRequest } from '../types/generation';
import type {
  TutorialFlow,
  TutorialManifest,
} from '../pages/generate/generate-tutorials/generate-tutorials.component';

/** Where the committed example set lives, relative to the served root. */
const TUTORIALS_ROOT = '/assets/tutorials';

const LEVEL_KEY = 'aihorde.generate.learn.level';

/**
 * How much the reader wants told to them. The three registers change the prose
 * of a step and nothing else: the same steps run, in the same order, writing the
 * same values, whichever one is chosen.
 */
export const TUTORIAL_LEVELS = [
  'new_to_this',
  'comfortable',
  'expert',
] as const;
export type TutorialLevel = (typeof TUTORIAL_LEVELS)[number];

/** What a step needs shown before it can point at anything. */
export interface TutorialReveal {
  mode?: GenerateMode;
  sourceMode?: GenerateSourceMode;
}

/** One step of a flow, as authored. */
export interface TutorialStepDef {
  /** Suffix of the step's i18n keys, and of nothing else. */
  id: string;
  /** The {@link TutorialAnchorService} id this step points at. */
  anchorId?: string;
  /** The `generate.help.<topic>` note to expand when the step becomes current. */
  helpTopic?: string;
  reveal?: TutorialReveal;
  /**
   * The parameter-sweep strip that shows this step's setting changing, if one is
   * published for it. Only set on steps whose value is a number a reader has no
   * intuition for; a step without one simply offers no images.
   */
  sweepParameter?: string;
  /**
   * The fields this step's Apply writes, read off the committed request rather
   * than restated here, so a step can never set something the example did not.
   */
  apply?: (example: GenerateFormValue) => Partial<GenerateFormValue>;
}

/**
 * The follow-along steps, per flow. Only `txt2img` is authored: the remaining
 * flows are listed on the Learn page with their tutorial offer disabled.
 */
export const TUTORIAL_STEPS: Readonly<
  Record<string, readonly TutorialStepDef[]>
> = {
  txt2img: [
    {
      id: 'prompt',
      anchorId: 'prompt',
      apply: (example) => ({ prompt: example.prompt }),
    },
    {
      id: 'model',
      anchorId: 'model',
      apply: (example) => ({ model: example.model }),
    },
    {
      // The panel sets width and height from one control (the size presets), so
      // this step writes the pair the reader would have set with one press.
      id: 'size',
      anchorId: 'size',
      apply: (example) => ({ width: example.width, height: example.height }),
    },
    {
      id: 'steps',
      anchorId: 'steps',
      helpTopic: 'steps',
      sweepParameter: 'steps',
      reveal: { mode: 'advanced' },
      apply: (example) => ({ steps: example.steps }),
    },
    {
      id: 'cfg',
      anchorId: 'cfg',
      helpTopic: 'cfg',
      sweepParameter: 'cfg_scale',
      reveal: { mode: 'advanced' },
      apply: (example) => ({ cfg_scale: example.cfg_scale }),
    },
    {
      id: 'sampler',
      anchorId: 'sampler',
      helpTopic: 'sampler',
      reveal: { mode: 'advanced' },
      apply: (example) => ({ sampler_name: example.sampler_name }),
    },
    {
      id: 'seed',
      anchorId: 'seed',
      helpTopic: 'seed',
      reveal: { mode: 'advanced' },
      apply: (example) => ({ seed: example.seed }),
    },
    // The finale offers nothing to apply: pressing Generate is the step.
    { id: 'generate', anchorId: 'generate' },
  ],
};

/** Whether a flow has follow-along steps at all. */
export function tutorialAvailable(flowId: string): boolean {
  return (TUTORIAL_STEPS[flowId]?.length ?? 0) > 0;
}

/**
 * What the tutorial needs the studio to do on its behalf. The studio page
 * registers itself; the engine never reaches into the form directly.
 */
export interface TutorialStudioHost {
  /** Write the named fields, leaving everything else alone. */
  applyFields(fields: Partial<GenerateFormValue>): void;
  currentMode(): GenerateMode;
  setMode(mode: GenerateMode): void;
  setSourceMode(mode: GenerateSourceMode): void;
  /** Offer the whole example through the studio's review-and-apply panel. */
  openBulkApply(example: GenerateFormValue): void;
}

/** The CSS hook the current step's anchor wears while it is current. */
const HIGHLIGHT_CLASS = 'gs-tut-target';

/**
 * The in-pane follow-along tutorial: which flow is running, which step is
 * current, and how talkative the prose should be.
 *
 * Step values are read from the committed example request rather than written
 * out here, so what a step says and what its Apply writes cannot come apart from
 * the payload that actually produced the image beside it.
 */
@Injectable({ providedIn: 'root' })
export class TutorialEngineService {
  private readonly http = inject(HttpClient);
  private readonly db = inject(DatabaseService);
  private readonly anchors = inject(TutorialAnchorService);
  private readonly help = inject(GsHelpService);
  private readonly injector = inject(Injector);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private host: TutorialStudioHost | null = null;

  private readonly flowId = signal<string | null>(null);
  private readonly flowMeta = signal<TutorialFlow | null>(null);
  private readonly request = signal<ImageGenerationRequest | null>(null);
  private readonly index = signal(0);
  private readonly loading = signal(false);
  private readonly failed = signal(false);
  private readonly revealed = signal<string | null>(null);
  private readonly finished = signal(false);

  /** The flow the Learn page asked for, consumed once by the studio. */
  private armed: string | null = null;

  private highlighted: HTMLElement | null = null;

  public readonly level = signal<TutorialLevel>(this.loadLevel());
  public readonly levels = TUTORIAL_LEVELS;

  public readonly activeFlowId = this.flowId.asReadonly();
  public readonly flow = this.flowMeta.asReadonly();
  public readonly stepIndex = this.index.asReadonly();
  public readonly isLoading = this.loading.asReadonly();
  public readonly loadFailed = this.failed.asReadonly();
  /**
   * The `generate.learn.reveal.<id>` note for a section this step opened, or
   * null when the reader was already looking at it.
   */
  public readonly revealNote = this.revealed.asReadonly();
  /** A generation was submitted on the finale step and the tutorial stood down. */
  public readonly completed = this.finished.asReadonly();

  public readonly active = computed(() => this.flowId() !== null);

  public readonly steps = computed<readonly TutorialStepDef[]>(
    () => TUTORIAL_STEPS[this.flowId() ?? ''] ?? [],
  );

  public readonly step = computed<TutorialStepDef | null>(
    () => this.steps()[this.index()] ?? null,
  );

  public readonly total = computed(() => this.steps().length);

  public readonly onFinale = computed(
    () => this.total() > 0 && this.index() === this.total() - 1,
  );

  /** The committed request projected onto form fields; every step's value. */
  public readonly example = computed<GenerateFormValue | null>(() => {
    const request = this.request();
    return request ? requestToFormValue(request) : null;
  });

  /**
   * The values the step prose interpolates. Named after the fields rather than
   * after the steps, so one set serves every register.
   */
  public readonly copyParams = computed<Record<string, string | number>>(() => {
    const example = this.example();
    const params: Record<string, string | number> = {};
    if (!example) {
      return params;
    }
    params['prompt'] = example.prompt;
    params['model'] = example.model;
    params['width'] = example.width;
    params['height'] = example.height;
    params['steps'] = example.steps;
    params['cfg'] = example.cfg_scale;
    params['sampler'] = example.sampler_name;
    params['seed'] = example.seed;
    return params;
  });

  /** The example image the reader is working towards, or '' before it loads. */
  public readonly exampleImage = computed(() => {
    const flow = this.flowMeta();
    return flow?.result
      ? `${TUTORIALS_ROOT}/${flow.directory}/${flow.result}`
      : '';
  });

  public registerHost(host: TutorialStudioHost): void {
    this.host = host;
  }

  public unregisterHost(host: TutorialStudioHost): void {
    if (this.host === host) {
      this.host = null;
    }
  }

  /**
   * Ask for a flow to start once the studio is on screen. Held in memory only:
   * a reload should land on an ordinary studio rather than resurrecting a
   * tutorial the reader has since navigated away from.
   */
  public arm(flowId: string): void {
    this.armed = flowId;
  }

  public consumeArmed(): string | null {
    const flowId = this.armed;
    this.armed = null;
    return flowId;
  }

  /** Begin a flow, fetching the example it teaches from. */
  public async start(flowId: string): Promise<void> {
    if (!tutorialAvailable(flowId)) {
      return;
    }
    this.finished.set(false);
    this.failed.set(false);
    this.flowId.set(flowId);
    this.index.set(0);
    if (this.request() === null || this.flowMeta()?.id !== flowId) {
      this.loading.set(true);
      try {
        await this.load(flowId);
      } catch {
        this.failed.set(true);
        this.loading.set(false);
        return;
      }
      this.loading.set(false);
    }
    this.enterStep();
  }

  /** Leave the tutorial, putting the results back. */
  public stop(): void {
    this.flowId.set(null);
    this.index.set(0);
    this.revealed.set(null);
    this.clearHighlight();
    this.help.releaseRequested();
  }

  public next(): void {
    this.goTo(this.index() + 1);
  }

  public back(): void {
    this.goTo(this.index() - 1);
  }

  public goTo(index: number): void {
    if (index < 0 || index >= this.total()) {
      return;
    }
    this.index.set(index);
    this.enterStep();
  }

  public setLevel(level: TutorialLevel): void {
    this.level.set(level);
    this.db.store(LEVEL_KEY, level);
  }

  /** Whether the current step has anything to write. */
  public canApply(): boolean {
    return this.step()?.apply !== undefined && this.example() !== null;
  }

  /** Write the current step's fields, and only those. */
  public applyStep(): void {
    const step = this.step();
    const example = this.example();
    if (!step?.apply || !example || !this.host) {
      return;
    }
    this.host.applyFields(step.apply(example));
  }

  /**
   * Hand the whole example to the studio's review-and-apply panel. A tutorial
   * never overwrites a panelful of settings on its own say-so: the reader picks
   * over the same list they would for a past generation.
   */
  public applyAll(): void {
    const example = this.example();
    if (!example || !this.host) {
      return;
    }
    this.host.openBulkApply(example);
  }

  /**
   * A generation was submitted. On the finale step that is the tutorial finishing
   * itself: the pane stands down so the image can land where the reader is
   * looking, and leaves a note behind. Called from the studio's submit path, so
   * nothing has to watch the queue.
   */
  public notifySubmitted(): void {
    if (!this.active() || !this.onFinale()) {
      return;
    }
    this.finished.set(true);
    this.stop();
  }

  public dismissCompletion(): void {
    this.finished.set(false);
  }

  /**
   * Reveal what the step needs shown, then point at it. Reveal comes first and
   * the pointing waits for the next render, because the section a step lives in
   * may not have existed when the step became current.
   */
  private enterStep(): void {
    const step = this.step();
    if (!step) {
      return;
    }
    this.revealed.set(this.applyReveal(step.reveal));
    if (!this.isBrowser) {
      return;
    }
    afterNextRender(() => this.focusStep(), { injector: this.injector });
  }

  /**
   * Show the section the step lives in, returning the `generate.learn.reveal.*`
   * key naming what was opened, or null when nothing had to change.
   */
  private applyReveal(reveal: TutorialReveal | undefined): string | null {
    if (!reveal || !this.host) {
      return null;
    }
    let note: string | null = null;
    if (reveal.mode) {
      // Only news when the reader was not already there; narrating a section
      // that never moved would teach them to distrust the narration.
      if (this.host.currentMode() !== reveal.mode) {
        note = reveal.mode === 'advanced' ? 'advanced' : null;
      }
      this.host.setMode(reveal.mode);
    }
    if (reveal.sourceMode) {
      this.host.setSourceMode(reveal.sourceMode);
      note = note ?? 'source';
    }
    return note;
  }

  /**
   * Scroll the current step's field into view, ring it, and expand its `?` note.
   * Public so the pane can re-point at the field without moving the step.
   */
  public focusStep(): void {
    const step = this.step();
    this.clearHighlight();
    if (!step?.helpTopic) {
      // A step that names no note takes the last one down with it: leaving the
      // previous field's note expanded would describe the wrong field.
      this.help.releaseRequested();
    }
    if (!step?.anchorId) {
      return;
    }
    const element = this.anchors.element(step.anchorId);
    if (!element) {
      return;
    }
    element.classList.add(HIGHLIGHT_CLASS);
    this.highlighted = element;
    element.scrollIntoView({
      behavior: this.scrollBehavior(),
      block: 'center',
    });
    if (step.helpTopic) {
      this.help.requestTopic(step.helpTopic);
    }
  }

  private clearHighlight(): void {
    this.highlighted?.classList.remove(HIGHLIGHT_CLASS);
    this.highlighted = null;
  }

  private scrollBehavior(): ScrollBehavior {
    const reduced =
      this.isBrowser &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return reduced ? 'auto' : 'smooth';
  }

  private async load(flowId: string): Promise<void> {
    const manifest = await firstValueFrom(
      this.http.get<TutorialManifest>(`${TUTORIALS_ROOT}/manifest.json`),
    );
    const flow = manifest.flows.find((entry) => entry.id === flowId);
    if (!flow) {
      throw new Error(`Unknown tutorial flow: ${flowId}`);
    }
    const request = await firstValueFrom(
      this.http.get<ImageGenerationRequest>(
        `${TUTORIALS_ROOT}/${flow.directory}/${flow.request ?? 'request.json'}`,
      ),
    );
    this.flowMeta.set(flow);
    this.request.set(request);
  }

  private loadLevel(): TutorialLevel {
    const stored = this.db.get(LEVEL_KEY);
    return TUTORIAL_LEVELS.includes(stored as TutorialLevel)
      ? (stored as TutorialLevel)
      : 'new_to_this';
  }
}
