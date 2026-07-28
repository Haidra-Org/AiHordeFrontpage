import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { forkJoin, map, of } from 'rxjs';
import { IconComponent } from '../../../components/icon/icon.component';
import {
  GsRecipeChipsComponent,
  RecipeRequest,
} from '../../../components/gs-recipe-chips/gs-recipe-chips.component';
import { highlightJson } from '../../../helper/json-formatter';
import {
  TutorialEngineService,
  tutorialAvailable,
} from '../../../services/tutorial-engine.service';

/** Where the committed example set lives, relative to the served root. */
const TUTORIALS_ROOT = '/assets/tutorials';

/** One entry of `manifest.json`. */
export interface TutorialFlow {
  id: string;
  directory: string;
  title: string;
  summary: string;
  status: 'available' | 'skipped';
  skipped_reason?: string;
  model?: string;
  seed?: string;
  result?: string;
  source?: string;
  mask?: string;
  before?: string;
  request?: string;
  files: string[];
}

export interface TutorialManifest {
  /** The API the examples were actually submitted to. */
  generated_against: string;
  flows: TutorialFlow[];
}

/** The subset of a flow's `meta.json` this page reports. */
interface TutorialMeta {
  model?: string;
  seed?: string;
  kudos_charged?: number;
  wall_time_seconds?: number;
  deviations?: string;
}

/** A flow's fetched companion files, once they have arrived. */
interface TutorialDetail {
  meta: TutorialMeta;
  /**
   * The payload exactly as committed. Kept as text rather than parsed and
   * re-serialised so what a reader copies is the file, byte for byte.
   */
  request: string;
  /** facefix only: the same request without the post-processor. */
  requestBefore: string | null;
}

/**
 * The walkthrough each flow gets, in the order the control panel presents the
 * fields being set. Written per flow rather than shared, because the point of
 * each example is the one or two fields that make it that flow.
 */
export const TUTORIAL_FLOW_STEPS: Readonly<Record<string, readonly string[]>> =
  {
    txt2img: ['prompt', 'model', 'size', 'sampling', 'seed', 'generate'],
    img2img: ['source', 'mode', 'denoise', 'prompt', 'model', 'generate'],
    controlnet: [
      'source',
      'mode',
      'control_type',
      'denoise',
      'prompt',
      'model',
      'size',
      'generate',
    ],
    inpainting: ['source', 'mode', 'mask', 'prompt', 'model', 'generate'],
    qr_code: ['prompt', 'qr', 'model', 'size', 'cfg', 'generate'],
    transparent: ['prompt', 'transparent', 'model', 'size', 'generate'],
    facefix: [
      'prompt',
      'model',
      'size',
      'generate_before',
      'facefixer',
      'regenerate',
    ],
  };

/** The three calls every image request makes, in order. */
const LIFECYCLE = ['submit', 'check', 'status'] as const;

/** The headers the submit call needs. */
const REQUEST_HEADERS = ['apikey', 'client_agent', 'content_type'] as const;

/**
 * The learning surface for the image studio: for each flow, the request that
 * was actually submitted, the image that came back, and the steps that produce
 * the same thing from the control panel. Everything shown is read from the
 * committed asset set, so the page cannot describe a request that was never
 * sent.
 */
@Component({
  selector: 'app-generate-tutorials',
  imports: [TranslocoPipe, RouterLink, IconComponent, GsRecipeChipsComponent],
  templateUrl: './generate-tutorials.component.html',
  host: {
    class: 'gs-tut',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateTutorialsComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly tutorial = inject(TutorialEngineService);

  public readonly manifest = signal<TutorialManifest | null>(null);
  public readonly loadFailed = signal(false);

  /** Same steps and images either way; developer adds the wire detail. */
  public readonly mode = signal<'user' | 'developer'>('user');

  public readonly lifecycle = LIFECYCLE;
  public readonly requestHeaders = REQUEST_HEADERS;

  private readonly details = signal<Readonly<Record<string, TutorialDetail>>>(
    {},
  );

  /** The picker rail, so the flow on screen can be kept inside its window. */
  private readonly rail = viewChild<ElementRef<HTMLElement>>('rail');

  private readonly routeFlowId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('flow'))),
    { initialValue: null },
  );

  public readonly flows = computed(() => this.manifest()?.flows ?? []);

  /**
   * The flow on screen, and only ever the one the URL names. An unknown or
   * absent `:flow` resolves to nothing and is sent to the Learn landing page,
   * which is the index this page used to stand in for.
   */
  public readonly activeFlow = computed<TutorialFlow | null>(() => {
    const id = this.routeFlowId();
    return this.flows().find((flow) => flow.id === id) ?? null;
  });

  public readonly activeDetail = computed<TutorialDetail | null>(() => {
    const flow = this.activeFlow();
    return flow ? (this.details()[flow.id] ?? null) : null;
  });

  public readonly steps = computed<readonly string[]>(
    () => TUTORIAL_FLOW_STEPS[this.activeFlow()?.id ?? ''] ?? [],
  );

  /** The submit endpoint, named against the API the examples were run on. */
  public readonly submitUrl = computed(
    () => `${this.manifest()?.generated_against ?? ''}/generate/async`,
  );

  public readonly requestJson = computed(() =>
    highlightJson(this.activeDetail()?.request ?? ''),
  );

  public readonly requestBeforeJson = computed(() =>
    highlightJson(this.activeDetail()?.requestBefore ?? ''),
  );

  /**
   * The same payload parsed, for the recipe chips. The text stays the thing
   * that is shown; this is only read from, and a file that will not parse
   * renders no chips rather than taking the page down with it.
   */
  public readonly requestObject = computed<RecipeRequest | null>(() => {
    const text = this.activeDetail()?.request;
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text) as RecipeRequest;
    } catch {
      return null;
    }
  });

  /** Whether the recipe card has the payload itself open under the chips. */
  public readonly rawOpen = signal(false);

  constructor() {
    this.http
      .get<TutorialManifest>(`${TUTORIALS_ROOT}/manifest.json`)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (manifest) => this.manifest.set(manifest),
        error: () => this.loadFailed.set(true),
      });

    effect(() => {
      const flow = this.activeFlow();
      if (flow && flow.status === 'available' && !this.details()[flow.id]) {
        this.loadDetail(flow);
      }
    });

    // A reader who opened one example's payload has not asked to be shown the
    // next one's.
    effect(() => {
      this.activeFlow();
      this.rawOpen.set(false);
    });

    // Waits for the manifest: until it has arrived there is nothing to say a
    // URL is wrong with, and a reader who deep-linked a real flow would be
    // thrown off it.
    effect(() => {
      if (this.manifest() && !this.activeFlow()) {
        void this.router.navigate(['/generate/learn']);
      }
    });

    // The rail scrolls, so a flow late in the manifest is reached by a deep
    // link with its chip outside the scrolled window or clipped by its edge.
    // Runs after render so the chip carrying the active class is the one that
    // exists, and only ever moves the rail as far as it has to.
    afterRenderEffect(() => {
      this.activeFlow();
      const chip =
        this.rail()?.nativeElement.querySelector<HTMLElement>(
          '.gs-tut-chip--on',
        );
      chip?.scrollIntoView({
        behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
          .matches
          ? 'auto'
          : 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    });
  }

  /** An asset of the active flow, by its manifest file name. */
  public assetUrl(file: string | undefined): string {
    const flow = this.activeFlow();
    return flow && file ? `${TUTORIALS_ROOT}/${flow.directory}/${file}` : '';
  }

  public toggleRaw(): void {
    this.rawOpen.update((open) => !open);
  }

  public isMode(mode: 'user' | 'developer'): boolean {
    return this.mode() === mode;
  }

  public setMode(mode: 'user' | 'developer'): void {
    this.mode.set(mode);
  }

  /**
   * The key naming a flow by what it makes. The manifest's own title names the
   * technique instead, which is the wrong thing to lead a reader with, so it is
   * kept as a second line rather than as the name.
   */
  public taskNameKey(flow: TutorialFlow): string {
    return `generate.tutorials.flows.${flow.id}.task_name`;
  }

  public isActive(flow: TutorialFlow): boolean {
    return flow.id === this.activeFlow()?.id;
  }

  /**
   * The flow's one-line description in the page's own plain voice, falling back
   * to the manifest's when a flow has no override. The manifest is generated
   * from the example run and is written for someone who already knows the
   * technique, which is the wrong register for the first thing a reader reads.
   */
  public summaryFor(flow: TutorialFlow): string {
    const key = `generate.tutorials.flows.${flow.id}.summary`;
    const text = this.transloco.translate(key);
    return !text || text === key ? flow.summary : text;
  }

  /** Whether the studio can walk a reader through this flow field by field. */
  public canStart(flow: TutorialFlow): boolean {
    return flow.status === 'available' && tutorialAvailable(flow.id);
  }

  /**
   * Arm the flow and go to the studio. The arming is held in memory rather than
   * put in the URL, so reloading the studio lands on an ordinary studio instead
   * of restarting a tutorial the reader has moved past.
   */
  public startTutorial(flow: TutorialFlow): void {
    this.tutorial.arm(flow.id);
    void this.router.navigate(['/generate/image']);
  }

  /**
   * Whether the payload carries a placeholder in place of a base64 blob. Worth
   * saying out loud: the committed file is not something you could POST as-is.
   */
  public hasImagePlaceholder(): boolean {
    return (this.activeDetail()?.request ?? '').includes('<base64');
  }

  private loadDetail(flow: TutorialFlow): void {
    const before = flow.files.includes('request-before.json');
    forkJoin({
      meta: this.http.get<TutorialMeta>(
        `${TUTORIALS_ROOT}/${flow.directory}/meta.json`,
      ),
      request: this.http.get(
        `${TUTORIALS_ROOT}/${flow.directory}/${flow.request ?? 'request.json'}`,
        { responseType: 'text' },
      ),
      requestBefore: before
        ? this.http.get(
            `${TUTORIALS_ROOT}/${flow.directory}/request-before.json`,
            { responseType: 'text' },
          )
        : of(null),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) =>
          this.details.update((current) => ({
            ...current,
            [flow.id]: detail,
          })),
        error: () => this.loadFailed.set(true),
      });
  }
}
