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
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { forkJoin, map, of } from 'rxjs';
import { IconComponent } from '../../../components/icon/icon.component';
import {
  GsIndexRailComponent,
  GsIndexRailEntry,
} from '../../../components/gs-index-rail/gs-index-rail.component';
import {
  GsRecipeChipsComponent,
  RecipeRequest,
} from '../../../components/gs-recipe-chips/gs-recipe-chips.component';
import { highlightJson } from '../../../helper/json-formatter';
import {
  SECTION_BY_STEP_ID,
  SectionIdentity,
  sectionIdentity,
} from '../../../content/sections';
import {
  TutorialEngineService,
  TutorialWorld,
  canonicalFlowId,
  hasWorldVariants,
  resolveFlowId,
} from '../../../services/tutorial-engine.service';
import { flowDef, flowFollowable, flowSteps } from '../../../content/flows';
import {
  DOCS_IMAGE,
  STUDIO_IMAGE,
  docsExampleLink,
} from '../../../content/docs-links';
import { setPageMeta } from '../../../helper/page-meta';
import {
  ExampleFlow,
  ExampleManifest,
  ExampleMeta,
  exampleAssetUrl,
  exampleManifestUrl,
} from '../../../content/examples';

/**
 * One picture in a flow's evidence rail, in the order the run produced it:
 * what went in, then what came back.
 */
export interface TutorialShot {
  /** The key naming the picture, which is both its caption and its alt text. */
  labelKey: string;
  src: string;
  /** Whether the picture is read through rather than read on the card. */
  alpha: boolean;
}

/** A flow's fetched companion files, once they have arrived. */
interface ExampleDetail {
  meta: ExampleMeta;
  /**
   * The payload exactly as committed. Kept as text rather than parsed and
   * re-serialised so what a reader copies is the file, byte for byte.
   */
  request: string;
  /** facefix only: the same request without the post-processor. */
  requestBefore: string | null;
}

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
  selector: 'app-docs-image-example',
  imports: [
    TranslocoPipe,
    IconComponent,
    GsIndexRailComponent,
    GsRecipeChipsComponent,
  ],
  templateUrl: './image-example.component.html',
  host: {
    class: 'gs-tut',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsImageExampleComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly tutorial = inject(TutorialEngineService);

  public readonly manifest = signal<ExampleManifest | null>(null);
  public readonly loadFailed = signal(false);

  /** Same steps and images either way; developer adds the wire detail. */
  public readonly mode = signal<'user' | 'developer'>('user');

  public readonly lifecycle = LIFECYCLE;
  public readonly requestHeaders = REQUEST_HEADERS;

  private readonly details = signal<Readonly<Record<string, ExampleDetail>>>(
    {},
  );

  /** The picker rail, so the flow on screen can be kept inside its window. */
  private readonly rail = viewChild<ElementRef<HTMLElement>>('rail');

  private readonly shotTriggers =
    viewChildren<ElementRef<HTMLButtonElement>>('shotTrigger');
  private readonly viewerPanel =
    viewChild<ElementRef<HTMLElement>>('viewerPanel');
  private readonly viewerClose =
    viewChild<ElementRef<HTMLButtonElement>>('viewerClose');

  /** The panel focus was last moved to, so a later render cannot re-take it. */
  private focusedPanel: HTMLElement | null = null;

  /** Which stage the enlarged view was opened from, or null while it is shut. */
  private readonly enlargedAt = signal<number | null>(null);

  /** Whether the evidence rail has the payload itself open under the chips. */
  public readonly rawOpen = signal(false);

  private readonly routeFlowId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('flow'))),
    { initialValue: null },
  );

  /** Every manifest entry, world variants included. */
  private readonly allFlows = computed(() => this.manifest()?.flows ?? []);

  /** The ids an example has actually been published under. */
  private readonly published = computed<readonly string[]>(() =>
    this.allFlows()
      .filter((flow) => flow.status === 'available')
      .map((flow) => flow.id),
  );

  /**
   * The flows the page enumerates. A world variant is another set of pictures
   * for a flow already on this list rather than a flow of its own, so it never
   * takes a line of the picker or a URL: the world settles which assets a
   * canonical id opens with, at the moment it is opened.
   */
  public readonly flows = computed(() =>
    this.allFlows().filter((flow) => canonicalFlowId(flow.id) === flow.id),
  );

  /** The flow the URL names, as the rest of the page's vocabulary knows it. */
  public readonly activeId = computed<string | null>(() => {
    const id = this.routeFlowId();
    const canonical = id === null ? null : canonicalFlowId(id);
    return this.flows().some((flow) => flow.id === canonical)
      ? canonical
      : null;
  });

  /**
   * The flow on screen, and only ever the one the URL names, in the world the
   * reader has asked for. An unknown or absent `:flow` resolves to nothing and
   * is sent to the Learn landing page, which is the index this page used to
   * stand in for.
   */
  public readonly activeFlow = computed<ExampleFlow | null>(() => {
    const canonical = this.activeId();
    if (canonical === null) {
      return null;
    }
    const id = resolveFlowId(
      canonical,
      this.tutorial.world(),
      this.published(),
    );
    return this.allFlows().find((flow) => flow.id === id) ?? null;
  });

  /**
   * Whether this flow was drawn in more than one world. A flow pinned to the
   * first one offers no choice rather than an inert control.
   */
  public readonly worldChoice = computed(() => {
    const canonical = this.activeId();
    return canonical !== null && hasWorldVariants(canonical, this.published());
  });

  public readonly worlds = this.tutorial.worlds;
  public readonly world = this.tutorial.world;

  public readonly activeDetail = computed<ExampleDetail | null>(() => {
    const flow = this.activeFlow();
    return flow ? (this.details()[flow.id] ?? null) : null;
  });

  /**
   * The pictures the evidence rail stands on. Built here rather than written
   * out four times in the template so every one of them lands on the same
   * bounded stage and carries the same way into the enlarged view.
   */
  public readonly shots = computed<readonly TutorialShot[]>(() => {
    const flow = this.activeFlow();
    if (!flow || flow.status !== 'available') {
      return [];
    }
    const shots: TutorialShot[] = [];
    if (flow.source) {
      shots.push({
        labelKey: 'generate.tutorials.shot_source',
        src: this.assetUrl(flow.source),
        alpha: false,
      });
    }
    if (flow.mask) {
      shots.push({
        labelKey: 'generate.tutorials.shot_mask',
        src: this.assetUrl(flow.mask),
        alpha: false,
      });
    }
    if (flow.before) {
      shots.push({
        labelKey: 'generate.tutorials.shot_before',
        src: this.assetUrl(flow.before),
        alpha: false,
      });
    }
    shots.push({
      labelKey: 'generate.tutorials.shot_result',
      src: this.assetUrl(flow.result),
      // The transparent flow's whole point is the alpha channel, so its result
      // is shown through a checkerboard rather than on the card.
      alpha: canonicalFlowId(flow.id) === 'transparent',
    });
    return shots;
  });

  /** The picture the enlarged view is showing, if it is open. */
  public readonly enlargedShot = computed<TutorialShot | null>(() => {
    const at = this.enlargedAt();
    return at === null ? null : (this.shots()[at] ?? null);
  });

  public readonly steps = computed<readonly string[]>(() =>
    flowSteps(this.activeId() ?? '').map((step) => step.id),
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

  /**
   * The flows as lines of the picker: the same contents idiom the guide and the
   * settings reference use, routing rather than scrolling. A flow the horde
   * could not serve is offered all the same, muted and annotated, because what
   * is missing is worth reading before it is clicked.
   */
  public readonly pickerEntries = computed<readonly GsIndexRailEntry[]>(() =>
    this.flows().map((flow) => {
      const identity = this.flowIdentity(flow);
      return {
        id: flow.id,
        labelKey: this.taskNameKey(flow),
        icon: identity?.icon,
        hueClass: identity?.className,
        link: docsExampleLink(flow.id),
        noteKey:
          flow.status === 'skipped'
            ? 'generate.tutorials.unavailable_tag'
            : undefined,
      };
    }),
  );

  constructor() {
    // The technique the URL names, so a shared link previews as the thing it is
    // about rather than as the area it lives in. The manifest is fetched, so the
    // task name comes from the flow id, which the URL already carries.
    setPageMeta({
      titleKey: () => {
        const id = this.activeId();
        return id ? `generate.tutorials.flows.${id}.task_name` : null;
      },
      descriptionKey: () => {
        const id = this.activeId();
        return id ? `generate.tutorials.flows.${id}.summary` : null;
      },
    });
    this.http
      .get<ExampleManifest>(exampleManifestUrl())
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
    // next one's, and an enlarged picture belongs to the flow it came from.
    effect(() => {
      this.activeFlow();
      this.rawOpen.set(false);
      this.enlargedAt.set(null);
    });

    // The enlarged picture takes focus as it opens, so the key that closes it
    // and the button that dismisses it are where the reader already is.
    afterRenderEffect(() => {
      const panel = this.viewerPanel()?.nativeElement ?? null;
      if (panel && panel !== this.focusedPanel) {
        panel.focus();
      }
      this.focusedPanel = panel;
    });

    // Waits for the manifest: until it has arrived there is nothing to say a
    // URL is wrong with, and a reader who deep-linked a real flow would be
    // thrown off it.
    effect(() => {
      if (this.manifest() && !this.activeFlow()) {
        void this.router.navigateByUrl(DOCS_IMAGE);
      }
    });

    // The rail scrolls, so a flow late in the manifest is reached by a deep
    // link with its line outside the scrolled window or clipped by its edge.
    // Runs after render so the line carrying the mark is the one that exists,
    // and only ever moves the rail as far as it has to.
    afterRenderEffect(() => {
      this.activeFlow();
      const line = this.rail()?.nativeElement.querySelector<HTMLElement>(
        '.gs-index-entry[aria-current]',
      );
      line?.scrollIntoView({
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
    return flow && file ? exampleAssetUrl(flow, file) : '';
  }

  /**
   * Open one picture at the size the bounded stage cannot give it. Single
   * image, no stepping: the rail is three pictures at most and each one is
   * already a click away.
   */
  public openEnlarged(index: number): void {
    this.enlargedAt.set(index);
  }

  /** Closing hands focus back to the stage that opened the enlarged view. */
  public closeEnlarged(): void {
    const at = this.enlargedAt();
    this.enlargedAt.set(null);
    if (at !== null) {
      this.shotTriggers()[at]?.nativeElement.focus();
    }
  }

  /** The backdrop closes; a press that landed on the panel itself does not. */
  public onViewerBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeEnlarged();
    }
  }

  /**
   * Escape closes. Tab is held inside the layer by hand: the panel carries one
   * control, so keeping focus on it is the whole trap.
   */
  public onViewerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closeEnlarged();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      this.viewerClose()?.nativeElement.focus();
    }
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
  public taskNameKey(flow: ExampleFlow): string {
    return `generate.tutorials.flows.${canonicalFlowId(flow.id)}.task_name`;
  }

  /** The mark and hue a flow is read by, where its technique has one. */
  public flowIdentity(flow: ExampleFlow): SectionIdentity | null {
    return sectionIdentity(flowDef(canonicalFlowId(flow.id))?.section);
  }

  /** The name a world is offered under in the switcher. */
  public worldKey(world: TutorialWorld): string {
    return `generate.learn.world.${world}`;
  }

  public setWorld(world: TutorialWorld): void {
    this.tutorial.setWorld(world);
  }

  /**
   * The panel area a walkthrough step sets a field in, which is what the step's
   * eyebrow is marked and hued from. Pressing Generate is a step about the page
   * rather than about a card, so it takes no mark and carries no eyebrow.
   */
  public stepIdentity(step: string): SectionIdentity | null {
    return sectionIdentity(SECTION_BY_STEP_ID[step]);
  }

  /** A step's prose, which is written per flow rather than shared. */
  public stepKey(flow: ExampleFlow, step: string, part: string): string {
    const id = canonicalFlowId(flow.id);
    return `generate.tutorials.flows.${id}.steps.${step}.${part}`;
  }

  /**
   * The flow's one-line description in the page's own plain voice, falling back
   * to the manifest's when a flow has no override. The manifest is generated
   * from the example run and is written for someone who already knows the
   * technique, which is the wrong register for the first thing a reader reads.
   */
  public summaryFor(flow: ExampleFlow): string {
    const key = `generate.tutorials.flows.${canonicalFlowId(flow.id)}.summary`;
    const text = this.transloco.translate(key);
    return !text || text === key ? flow.summary : text;
  }

  /** Whether the studio can walk a reader through this flow field by field. */
  public canStart(flow: ExampleFlow): boolean {
    return (
      flow.status === 'available' && flowFollowable(canonicalFlowId(flow.id))
    );
  }

  /**
   * Arm the flow and go to the studio. The arming is held in memory rather than
   * put in the URL, so reloading the studio lands on an ordinary studio instead
   * of restarting a tutorial the reader has moved past.
   */
  public startTutorial(flow: ExampleFlow): void {
    this.tutorial.arm(flow.id);
    void this.router.navigateByUrl(STUDIO_IMAGE);
  }

  /**
   * Whether the payload carries a placeholder in place of a base64 blob. Worth
   * saying out loud: the committed file is not something you could POST as-is.
   */
  public hasImagePlaceholder(): boolean {
    return (this.activeDetail()?.request ?? '').includes('<base64');
  }

  private loadDetail(flow: ExampleFlow): void {
    const before = flow.files.includes('request-before.json');
    forkJoin({
      meta: this.http.get<ExampleMeta>(exampleAssetUrl(flow, 'meta.json')),
      request: this.http.get(
        exampleAssetUrl(flow, flow.request ?? 'request.json'),
        { responseType: 'text' },
      ),
      requestBefore: before
        ? this.http.get(exampleAssetUrl(flow, 'request-before.json'), {
            responseType: 'text',
          })
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
