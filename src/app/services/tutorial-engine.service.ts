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
import {
  HIGHLIGHT_CLASS,
  TutorialAnchorService,
} from './tutorial-anchor.service';
import { GsHelpDockService } from './gs-help-dock.service';
import {
  GenerateFormValue,
  GenerateMode,
  GenerateSourceMode,
  requestToFormValue,
} from '../pages/generate/generate-form.model';
import { ImageGenerationRequest } from '../types/generation';
import { sectionFor, sectionIdentity } from '../content/sections';
import {
  ExampleFlow,
  ExampleManifest,
  exampleAssetUrl,
  exampleManifestUrl,
  exampleResultUrl,
} from '../content/examples';
import {
  FlowReveal,
  FlowStep,
  flowDef,
  flowFollowable,
  flowSteps,
  isConceptFlow,
} from '../content/flows';

const LEVEL_KEY = 'aihorde.generate.learn.level';

const WORLD_KEY = 'aihorde.generate.learn.world';

/**
 * Which cast the worked examples are drawn from. The three tell the same lesson
 * about the same settings with different subject matter, so the choice is the
 * reader's taste and nothing more; it is held globally because a reader who has
 * said which one they want has said it for every surface at once.
 */
export const TUTORIAL_WORLDS = ['w1', 'w2', 'w3'] as const;
export type TutorialWorld = (typeof TUTORIAL_WORLDS)[number];

/**
 * The naming contract between the asset generator and this app, written here
 * and nowhere else: the first world's flow ids are bare, and every other world
 * suffixes the same id. Only flows whose subject survives the change are
 * generated in more than one world, so most ids have no variant at all.
 */
const WORLD_SUFFIX = /--w[23]$/;

/** The flow a variant id belongs to, which is the id itself when it is one. */
export function canonicalFlowId(flowId: string): string {
  return flowId.replace(WORLD_SUFFIX, '');
}

/** The id a flow's assets are published under in the given world. */
export function worldFlowId(flowId: string, world: TutorialWorld): string {
  const canonical = canonicalFlowId(flowId);
  return world === 'w1' ? canonical : `${canonical}--${world}`;
}

/**
 * The id a surface should actually open for a canonical flow: the active
 * world's variant where one has been published, and the canonical flow where
 * one has not. A world is never a dead end, because a flow with no variant in
 * it simply keeps the example it already had.
 */
export function resolveFlowId(
  flowId: string,
  world: TutorialWorld,
  published: readonly string[],
): string {
  const wanted = worldFlowId(flowId, world);
  return published.includes(wanted) ? wanted : canonicalFlowId(flowId);
}

/** Whether more than one world's example has been published for a flow. */
export function hasWorldVariants(
  flowId: string,
  published: readonly string[],
): boolean {
  const canonical = canonicalFlowId(flowId);
  return TUTORIAL_WORLDS.some(
    (world) =>
      world !== 'w1' && published.includes(worldFlowId(canonical, world)),
  );
}

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

/**
 * The values the step prose interpolates, read off a committed request. Named
 * after the fields rather than after the steps, so one set serves every
 * register, and shared by every surface that shows a step (the studio pane and
 * the documentation page), so the same body reads the same wherever it is.
 */
export function tutorialCopyParams(
  example: GenerateFormValue,
): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  params['prompt'] = example.prompt;
  // The payload carries both halves in one string; the prose names them
  // apart, as the panel does, so a step can talk about either one.
  params['negative'] = example.negativePrompt;
  params['model'] = example.model;
  params['width'] = example.width;
  params['height'] = example.height;
  params['steps'] = example.steps;
  params['cfg'] = example.cfg_scale;
  params['sampler'] = example.sampler_name;
  params['seed'] = example.seed;
  // The sourced flows' two numbers. They are meaningless on a request with no
  // source image, and the prose of a flow that has none never names them.
  params['denoise'] = example.denoising_strength;
  params['control'] = example.control_type;
  // The workflow and finishing flows' values. `post` is a list because the
  // field is one, and a flow that runs a single processor reads as its name.
  params['qr'] = example.qrText;
  params['post'] = example.post_processing.join(', ');
  params['facefix'] = example.facefixer_strength;
  return params;
}

/**
 * What a step's field is called above its title. Anchors reuse the panel's own
 * vocabulary, so most of them are named by the `?` note they share an id with;
 * the handful the panel labels rather than explains are listed here, and the
 * Generate button is named by the tutorial because it is not a setting anything
 * else has a name for.
 */
const STEP_FIELD_LABEL_KEY: Readonly<Record<string, string>> = {
  prompt: 'generate.form.prompt_label',
  model: 'generate.form.model_label',
  size: 'generate.sections.size',
  source: 'generate.sections.source',
  source_mode: 'generate.learn.fields.source_mode',
  control_type: 'generate.source.control_type_label',
  mask: 'generate.learn.fields.mask',
  remix_extras: 'generate.learn.fields.remix_extras',
  generate: 'generate.learn.fields.generate',
};

/** The line naming the field a step points at, in the panel's own words. */
export function stepFieldLabelKey(anchorId: string): string {
  return STEP_FIELD_LABEL_KEY[anchorId] ?? `generate.help.${anchorId}.title`;
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
  currentSourceMode(): GenerateSourceMode;
  setSourceMode(mode: GenerateSourceMode): void;
  /** Offer the whole example through the studio's review-and-apply panel. */
  openBulkApply(example: GenerateFormValue): void;
}

/**
 * The animation the step card and the field it points at both run. They are
 * separate elements in separate panes, so what ties them together is the phase:
 * every one of these animations is restarted from the same time whenever the
 * step changes.
 */
const BREATHE_ANIMATION = 'gs-breathe';

/**
 * The one-shot ring a "Show me where" press draws on the field, and how long it
 * is worn for. The class outlives the 700ms animation by a margin so a press
 * that lands mid-ping still gets a whole ring rather than a clipped one.
 */
const PING_CLASS = 'gs-tut-ping';
const PING_MS = 800;

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
  private readonly dock = inject(GsHelpDockService);
  private readonly injector = inject(Injector);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private host: TutorialStudioHost | null = null;

  private readonly flowId = signal<string | null>(null);
  private readonly flowMeta = signal<ExampleFlow | null>(null);
  private readonly request = signal<ImageGenerationRequest | null>(null);
  private readonly index = signal(0);
  private readonly loading = signal(false);
  private readonly failed = signal(false);
  private readonly revealed = signal<string | null>(null);
  private readonly finished = signal(false);
  /** The technique that just finished, so the completion card can offer the next one. */
  private readonly finishedFlow = signal<string | null>(null);
  /** The technique that just finished, for the completion card's recap. */
  public readonly finishedFlowId = this.finishedFlow.asReadonly();

  /** The flow the Learn page asked for, consumed once by the studio. */
  private armed: string | null = null;

  private highlighted: HTMLElement | null = null;
  /** The `gs-sec--*` class put on {@link highlighted}, to take off again. */
  private highlightSection: string | null = null;
  /** The element wearing {@link PING_CLASS}, and the removal it is waiting on. */
  private pinged: HTMLElement | null = null;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;

  /** The world {@link flowMeta} was resolved under, so a change reloads it. */
  private loadedWorld: TutorialWorld | null = null;

  public readonly level = signal<TutorialLevel>(this.loadLevel());
  public readonly levels = TUTORIAL_LEVELS;

  public readonly world = signal<TutorialWorld>(this.loadWorld());
  public readonly worlds = TUTORIAL_WORLDS;

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

  public readonly steps = computed<readonly FlowStep[]>(() =>
    flowSteps(canonicalFlowId(this.flowId() ?? '')),
  );

  public readonly step = computed<FlowStep | null>(
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

  /** The values the step prose interpolates; see {@link tutorialCopyParams}. */
  public readonly copyParams = computed<Record<string, string | number>>(() => {
    const example = this.example();
    return example ? tutorialCopyParams(example) : {};
  });

  /** The example image the reader is working towards, or '' before it loads. */
  public readonly exampleImage = computed(() => {
    const flow = this.flowMeta();
    return flow?.result ? exampleResultUrl(flow) : '';
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
    this.armed = canonicalFlowId(flowId);
  }

  public consumeArmed(): string | null {
    const flowId = this.armed;
    this.armed = null;
    return flowId;
  }

  /** Begin a flow, fetching the example it teaches from. */
  public async start(requestedId: string): Promise<void> {
    // Steps, prose and section marks are all written against the canonical
    // flow; which world's assets stand behind them is settled at load time.
    const flowId = canonicalFlowId(requestedId);
    if (!flowFollowable(flowId)) {
      return;
    }
    // The dock and the follow-along pane are the same surface, and the dock is
    // the one gated above: a tutorial starting behind an open reference entry
    // would run its whole length where the reader cannot see it.
    this.dock.close();
    this.finished.set(false);
    this.failed.set(false);
    this.flowId.set(flowId);
    this.index.set(0);
    if (isConceptFlow(flowId)) {
      // A concept track has no committed request behind it. Clearing both
      // rather than leaving a previous flow's is what makes every surface that
      // keys off an example (Apply, the bulk offer, the result figure) find
      // none, instead of offering the last technique's values under this one.
      this.flowMeta.set(null);
      this.request.set(null);
      this.loadedWorld = null;
    } else if (
      this.request() === null ||
      canonicalFlowId(this.flowMeta()?.id ?? '') !== flowId ||
      this.loadedWorld !== this.world()
    ) {
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

  /**
   * Choose the cast the worked examples are drawn from. Global and persisted:
   * every surface that has a variant to offer reads the same answer, and the
   * next flow started picks its assets up from here.
   */
  public setWorld(world: TutorialWorld): void {
    this.world.set(world);
    this.db.store(WORLD_KEY, world);
  }

  /** Whether the current step has anything to write. */
  public canApply(): boolean {
    return (
      (this.step()?.applyFields?.length ?? 0) > 0 && this.example() !== null
    );
  }

  /**
   * Write the current step's fields, and only those. The values come out of the
   * committed request the whole walkthrough is standing next to, so a step can
   * only ever set what the example was actually generated with.
   */
  public applyStep(): void {
    const fields = this.step()?.applyFields;
    const example = this.example();
    if (!fields?.length || !example || !this.host) {
      return;
    }
    const written: Partial<GenerateFormValue> = {};
    for (const field of fields) {
      Object.assign(written, { [field]: example[field] });
    }
    this.host.applyFields(written);
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
    // A concept track is not finished by a generation: the reader submitting
    // one while reading about how the horde works has not reached the end of
    // anything the track was asking for, so the pane stays where it is.
    if (!this.active() || !this.onFinale() || isConceptFlow(this.flowId())) {
      return;
    }
    this.finishedFlow.set(this.flowId());
    this.finished.set(true);
    this.stop();
  }

  /**
   * The technique the flow that just finished hands on to, or null where the
   * chain ends. Read by the completion card; cleared with the card.
   */
  public readonly nextFlow = computed<string | null>(() => {
    const finished = this.finishedFlow();
    return finished ? (flowDef(finished)?.next ?? null) : null;
  });

  public dismissCompletion(): void {
    this.finished.set(false);
    this.finishedFlow.set(null);
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
  private applyReveal(reveal: FlowReveal | undefined): string | null {
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
      // Same rule as the mode above: a sourced flow revealing its mode on every
      // one of its steps would narrate an opening that happened once.
      if (this.host.currentSourceMode() !== reveal.sourceMode) {
        note = note ?? 'source';
      }
      this.host.setSourceMode(reveal.sourceMode);
    }
    return note;
  }

  /**
   * Scroll the current step's field into view, ring it, and expand its `?` note.
   * Public so the pane can re-point at the field without moving the step.
   *
   * `ping` is the difference between the step arriving and the reader asking
   * where it went: only the ask gets the one-shot ring, because on a step change
   * the highlight is already news and a second gesture on top of it is noise.
   */
  public focusStep(ping = false): void {
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
    // The field takes the hue of the area the step is about, so the glow it
    // shares with the step card is one colour rather than two.
    const identity = sectionIdentity(sectionFor('step', step.id));
    if (identity) {
      this.highlightSection = identity.className;
      element.classList.add(this.highlightSection);
    }
    this.highlighted = element;
    element.scrollIntoView({
      behavior: this.scrollBehavior(),
      block: 'center',
    });
    if (step.helpTopic) {
      this.help.requestTopic(step.helpTopic);
    }
    if (ping) {
      this.ping(element);
    }
    this.syncBreathing();
  }

  /**
   * Send one ring out from the field's halo. Re-adding a class the element is
   * already wearing restarts nothing, so the removal is forced through the
   * layout before the class goes back on: pressing "Show me where" twice has to
   * answer twice.
   */
  private ping(element: HTMLElement): void {
    this.clearPing();
    void element.offsetWidth;
    element.classList.add(PING_CLASS);
    this.pinged = element;
    this.pingTimer = setTimeout(() => this.clearPing(), PING_MS);
  }

  private clearPing(): void {
    if (this.pingTimer !== null) {
      clearTimeout(this.pingTimer);
      this.pingTimer = null;
    }
    this.pinged?.classList.remove(PING_CLASS);
    this.pinged = null;
  }

  private clearHighlight(): void {
    this.clearPing();
    this.highlighted?.classList.remove(HIGHLIGHT_CLASS);
    if (this.highlightSection) {
      this.highlighted?.classList.remove(this.highlightSection);
      this.highlightSection = null;
    }
    this.highlighted = null;
  }

  /**
   * Put every breathing glow on the page back to the same phase, a frame after
   * the classes that create them are set: the field's overlay is made by the
   * class just added and the step card's by the panel's own re-render, so
   * neither animation exists to be reset until the browser has drawn once.
   */
  private syncBreathing(): void {
    if (!this.isBrowser || typeof document.getAnimations !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      for (const animation of document.getAnimations()) {
        if ((animation as CSSAnimation).animationName === BREATHE_ANIMATION) {
          animation.startTime = 0;
        }
      }
    });
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
      this.http.get<ExampleManifest>(exampleManifestUrl()),
    );
    const world = this.world();
    const published = manifest.flows
      .filter((entry) => entry.status === 'available')
      .map((entry) => entry.id);
    const resolved = resolveFlowId(flowId, world, published);
    const flow = manifest.flows.find((entry) => entry.id === resolved);
    if (!flow) {
      throw new Error(`Unknown tutorial flow: ${flowId}`);
    }
    this.loadedWorld = world;
    const request = await firstValueFrom(
      this.http.get<ImageGenerationRequest>(
        exampleAssetUrl(flow, flow.request ?? 'request.json'),
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

  private loadWorld(): TutorialWorld {
    const stored = this.db.get(WORLD_KEY);
    return TUTORIAL_WORLDS.includes(stored as TutorialWorld)
      ? (stored as TutorialWorld)
      : 'w1';
  }
}
