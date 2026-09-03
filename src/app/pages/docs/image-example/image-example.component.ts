import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Signal,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { forkJoin, map, of } from 'rxjs';
import { GsAnchorLinkComponent } from '../../../components/gs-anchor-link/gs-anchor-link.component';
import { IconComponent } from '../../../components/icon/icon.component';
import {
  GsIndexRailComponent,
  GsIndexRailEntry,
} from '../../../components/gs-index-rail/gs-index-rail.component';
import { GsDoorComponent } from '../../../components/gs-door/gs-door.component';
import { GsProseComponent } from '../../../components/gs-prose/gs-prose.component';
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
  TutorialLevel,
  canonicalFlowId,
  hasWorldVariants,
  resolveFlowId,
  tutorialCopyParams,
  worldFlowId,
} from '../../../services/tutorial-engine.service';
import {
  CONCEPT_FLOWS,
  FLOWS,
  FlowDef,
  FlowStep,
  flowDef,
  flowFollowable,
  flowSteps,
  isConceptFlow,
} from '../../../content/flows';
import { GsSweepScrubComponent } from '../../../components/gs-sweep-scrub/gs-sweep-scrub.component';
import { GsWorldPickerComponent } from '../../../components/gs-world-picker/gs-world-picker.component';
import {
  GsPixelBadgeComponent,
  PixelSize,
} from '../../../components/gs-pixel-badge/gs-pixel-badge.component';
import { GsShotViewerComponent } from '../../../components/gs-shot-viewer/gs-shot-viewer.component';
import { GsCompareWipeComponent } from '../../../components/gs-compare-wipe/gs-compare-wipe.component';
import { requestToFormValue } from '../../generate/generate-form.model';
import { ImageGenerationRequest } from '../../../types/generation';
import {
  DOCS_IMAGE,
  DOCS_UNKNOWN_ID_STATE,
  STUDIO_IMAGE,
  docsExampleLink,
} from '../../../content/docs-links';
import { tutorialCardUrl } from '../../../content/share-cards';
import { setPageMeta } from '../../../helper/page-meta';
import { scrollWithin } from '../../../helper/scroll-utils';
import { DocsPageContextService } from '../../../services/docs-page-context.service';
import {
  ExampleFlow,
  ExampleManifest,
  ExampleMeta,
  ExampleRunCost,
  exampleAssetUrl,
  exampleManifestUrl,
  exampleRunCost,
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
 * The mark each short read is known by, which is the one the area's landing
 * page already gives it. A read has no panel area behind it, so it takes no
 * section hue and this is the only thing that tells one from another in a list.
 */
const CONCEPT_MARKS: Readonly<Record<string, string>> = {
  concepts_images: 'photo-simple',
  concepts_horde: 'user-group',
  concepts_migrating: 'adjustments-horizontal',
};

/** One fragment of the line under the lead, and what it interpolates. */
interface MetaFragment {
  key: string;
  params?: Record<string, number>;
}

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
    RouterLink,
    TranslocoPipe,
    IconComponent,
    GsAnchorLinkComponent,
    GsIndexRailComponent,
    GsDoorComponent,
    GsRecipeChipsComponent,
    GsProseComponent,
    GsSweepScrubComponent,
    GsWorldPickerComponent,
    GsCompareWipeComponent,
    GsShotViewerComponent,
    GsPixelBadgeComponent,
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
  private readonly docsPage = inject(DocsPageContextService);
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

  /**
   * The picker rail, so the flow on screen can be kept inside its window. Read
   * as an element rather than as the component: what has to be scrolled is the
   * host, which is what the column form makes scrollable.
   */
  private readonly rail: Signal<ElementRef<HTMLElement> | undefined> =
    viewChild('rail', { read: ElementRef });

  private readonly shotTriggers =
    viewChildren<ElementRef<HTMLButtonElement>>('shotTrigger');

  /** Which stage the enlarged view was opened from, or null while it is shut. */
  private readonly enlargedAt = signal<number | null>(null);

  /**
   * What each published picture is in pixels, by its path, as the browser found
   * it once the file arrived. The tutorial manifest lists a flow's files and
   * what it was rendered on but nothing about their size, so this is the only
   * answer available here; every other evidence surface takes the size from the
   * library that published it.
   */
  private readonly measured = signal<Readonly<Record<string, PixelSize>>>({});

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
   * The techniques the page enumerates, which is what the app teaches rather
   * than what happens to have been published. A world variant is another set of
   * pictures for a technique already on this list rather than one of its own, so
   * it never takes a line of the picker or a URL: the world settles which assets
   * a canonical id opens with, at the moment it is opened.
   */
  public readonly flows = computed<readonly FlowDef[]>(() =>
    FLOWS.filter((flow) => !flow.concept),
  );

  /**
   * The technique the URL names.
   *
   * Answered from the registry rather than from the manifest, so the page knows
   * what it is about before, and without, the evidence library. That is what
   * lets it be built ahead of time: a page whose own identity waited on a fetch
   * would be published as the state it is in while waiting.
   */
  public readonly activeId = computed<string | null>(() => {
    const id = this.routeFlowId();
    const canonical = id === null ? null : canonicalFlowId(id);
    return canonical !== null && flowDef(canonical) !== undefined
      ? canonical
      : null;
  });

  /**
   * Whether the page is a short read rather than a worked technique.
   *
   * A read teaches an idea: there is no committed request behind it, so no
   * pictures, no recipe and nothing for the walkthrough to write. What is left
   * is the prose, which is the whole of what the page has to be.
   */
  public readonly isConcept = computed(() => isConceptFlow(this.activeId()));

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

  private readonly world = this.tutorial.world;

  /**
   * Whether the pictures on screen are the first world's standing in for the
   * one the reader chose. Said on the page when it happens, and only then: a
   * note that is always there stops being read.
   */
  public readonly worldStandIn = computed(() => {
    const canonical = this.activeId();
    const flow = this.activeFlow();
    const world = this.world();
    return (
      canonical !== null &&
      flow !== null &&
      world !== 'w1' &&
      flow.id !== worldFlowId(canonical, world)
    );
  });

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
    for (const reference of flow.references ?? []) {
      shots.push({
        labelKey: 'generate.tutorials.shot_reference',
        src: this.assetUrl(reference),
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

  /**
   * The before and after of a flow that has one, for the wipe: what went in
   * against what came out where the technique repaints a picture, and the
   * untouched render against the fixed one where it post-processes. The
   * difference is in one place, and a wipe reads it better than two tiles set
   * apart. Flows that start from nothing, or from a source that is not the
   * frame being repainted, offer no pair.
   */
  public readonly comparison = computed<{
    before: TutorialShot;
    after: TutorialShot;
  } | null>(() => {
    const flow = this.activeFlow();
    if (!flow || flow.status !== 'available' || !flow.result) {
      return null;
    }
    const kind = canonicalFlowId(flow.id);
    const after: TutorialShot = {
      labelKey: 'generate.tutorials.shot_result',
      src: this.assetUrl(flow.result),
      alpha: false,
    };
    if (flow.before) {
      return {
        before: {
          labelKey: 'generate.tutorials.shot_before',
          src: this.assetUrl(flow.before),
          alpha: false,
        },
        after,
      };
    }
    if (
      flow.source &&
      (kind === 'img2img' || kind === 'controlnet' || kind === 'inpainting')
    ) {
      return {
        before: {
          labelKey: 'generate.tutorials.shot_source',
          src: this.assetUrl(flow.source),
          alpha: false,
        },
        after,
      };
    }
    return null;
  });

  /** The technique this one hands on to, or null at the end of the chain. */
  public readonly nextFlowId = computed<string | null>(() => {
    const id = this.activeId();
    return id ? (flowDef(id)?.next ?? null) : null;
  });

  /**
   * The other area that does this technique's job to a finished picture, for
   * the reader who has one already. Null on every flow that names none.
   */
  public readonly relatedElsewhere = computed<FlowDef['related'] | null>(() => {
    const id = this.activeId();
    return id ? (flowDef(id)?.related ?? null) : null;
  });

  public goToFlow(flowId: string): void {
    void this.router.navigateByUrl(docsExampleLink(flowId));
  }

  /** The size of one published picture, once the browser has found it. */
  public shotSize(src: string): PixelSize | null {
    return this.measured()[src] ?? null;
  }

  /** A picture has arrived, so the browser can be asked what it is. */
  public onShotLoad(src: string, event: Event): void {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.naturalWidth) {
      return;
    }
    const size = { width: image.naturalWidth, height: image.naturalHeight };
    this.measured.update((current) => ({ ...current, [src]: size }));
  }

  /** The picture the enlarged view is showing, if it is open. */
  public readonly enlargedShot = computed<TutorialShot | null>(() => {
    const at = this.enlargedAt();
    return at === null ? null : (this.shots()[at] ?? null);
  });

  public readonly steps = computed<readonly FlowStep[]>(() =>
    flowSteps(this.activeId() ?? ''),
  );

  /**
   * How much the reader wants told to them. The same register the studio pane
   * uses, held by the engine and remembered in this browser, so a reader who
   * picks a depth on the page meets that depth when they start the walkthrough,
   * and the other way round.
   */
  public readonly levels = this.tutorial.levels;
  public readonly level = this.tutorial.level;

  /**
   * The values the step prose interpolates, read off the request on screen: the
   * page and the studio pane render one body set, and the world's request is
   * what makes a step read as that world.
   */
  public readonly copyParams = computed<Record<string, string | number>>(() => {
    const request = this.requestObject();
    return request
      ? tutorialCopyParams(
          requestToFormValue(request as ImageGenerationRequest),
        )
      : {};
  });

  /**
   * The spine as it is drawn: each step, the panel area it is about, and whether
   * it opens that area's run rather than continuing one. Consecutive steps in
   * one area are a band with a single name over it; every step after the first
   * carries the name unseen instead, so the reading order is the same whether
   * the eyebrows are visible or read aloud.
   */
  public readonly spine = computed<
    readonly {
      step: FlowStep;
      identity: SectionIdentity | null;
      tucked: boolean;
    }[]
  >(() => {
    let running: string | undefined;
    return this.steps().map((step) => {
      const section = SECTION_BY_STEP_ID[step.id];
      const tucked = section !== undefined && section === running;
      running = section;
      return { step, identity: sectionIdentity(section), tucked };
    });
  });

  /**
   * Whether this technique starts from a picture the reader has to bring. Read
   * off the step that points at the source card, so a technique that gains or
   * loses one says the right thing without anybody remembering to edit a line.
   */
  private readonly needsSource = computed(() =>
    this.steps().some((step) => step.anchorId === 'source'),
  );

  /**
   * The line under the lead: how much there is, and what the reader has to have
   * before they start. Both parts are read off what the page already knows, so
   * neither can drift from the flow it describes.
   *
   * A read carries the same line in its own terms. It asks the reader for
   * nothing, so what is left to say is that it is a read and how many parts it
   * comes in.
   */
  public readonly metaRow = computed<readonly MetaFragment[]>(() => {
    const count = this.spine().length;
    if (count === 0) {
      return [];
    }
    if (this.isConcept()) {
      return [
        { key: 'generate.learn.badge_read' },
        {
          key:
            count === 1
              ? 'generate.learn.meta_parts_one'
              : 'generate.learn.meta_parts',
          params: { count },
        },
      ];
    }
    const fragments: MetaFragment[] = [
      {
        key:
          count === 1
            ? 'generate.tutorials.meta_steps_one'
            : 'generate.tutorials.meta_steps',
        params: { count },
      },
    ];
    fragments.push({
      key: this.needsSource()
        ? 'generate.tutorials.meta_prepare_source'
        : 'generate.tutorials.meta_prepare_nothing',
    });
    return fragments;
  });

  /**
   * On a technique only the newcomer register gets the sweep strips, as in the
   * studio pane: the other registers assume the reader knows what the number
   * does and want the page shorter.
   */
  public readonly showsSweep = computed(() => this.level() === 'new_to_this');

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
   * settings reference use, routing rather than scrolling. Each line is named by
   * what the flow makes, with the technique behind it under the name, so a
   * reader who came looking for "ControlNet" finds it without opening pages. A
   * flow the horde could not serve is offered all the same, muted and
   * annotated, because what is missing is worth reading before it is clicked.
   */
  public readonly pickerEntries = computed<readonly GsIndexRailEntry[]>(() => {
    const unavailable = new Set(
      this.allFlows()
        .filter((flow) => flow.status === 'skipped')
        .map((flow) => canonicalFlowId(flow.id)),
    );
    const techniques = this.flows().map((flow) => {
      const identity = sectionIdentity(flow.section);
      return {
        id: flow.id,
        labelKey: `generate.tutorials.flows.${flow.id}.task_name`,
        subLabelKey: `generate.tutorials.flows.${flow.id}.technique`,
        done: this.tutorial.isDone(flow.id),
        icon: identity?.icon,
        hueClass: identity?.className,
        link: docsExampleLink(flow.id),
        noteKey: unavailable.has(flow.id)
          ? 'generate.tutorials.unavailable_tag'
          : undefined,
      };
    });
    // The short reads after the techniques rather than among them: a reader
    // scanning for a technique is scanning a list of things that make a
    // picture, and each read says under its name that it is a read instead.
    const reads = CONCEPT_FLOWS.map((id) => ({
      id,
      labelKey: this.taskNameKey(id),
      subLabelKey: 'generate.learn.badge_read',
      done: this.tutorial.isDone(id),
      icon: CONCEPT_MARKS[id],
      link: docsExampleLink(id),
    }));
    return [...techniques, ...reads];
  });

  constructor() {
    // The technique the URL names, so a shared link previews as the thing it is
    // about rather than as the area it lives in. The manifest is fetched, so the
    // task name comes from the flow id, which the URL already carries.
    setPageMeta({
      titleKey: () => {
        const id = this.activeId();
        return id ? this.taskNameKey(id) : null;
      },
      descriptionKey: () => {
        const id = this.activeId();
        return id ? this.summaryKey(id) : null;
      },
      image: () => {
        const id = this.activeId();
        // A card is drawn from a flow's published run, and a short read has no
        // run behind it. Naming one anyway would unfurl a link as a missing
        // picture; null asks for the site's own card instead.
        return id && !isConceptFlow(id) ? tutorialCardUrl(id) : null;
      },
    });
    // The page is named by the technique it is showing, so the name follows the
    // URL rather than being fixed when the page mounts.
    this.docsPage.declare(() => {
      const id = this.activeId();
      return id ? this.taskNameKey(id) : null;
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

    // Waits for the manifest: until it has arrived there is nothing to say a
    // URL is wrong with, and a reader who deep-linked a real flow would be
    // thrown off it. A short read has no manifest entry by design, so it is
    // never measured against one. The name goes with the redirect, so the
    // landing page can say why it is the page in front of the reader.
    effect(() => {
      if (this.manifest() && !this.isConcept() && !this.activeFlow()) {
        const named = this.routeFlowId();
        void (named
          ? this.router.navigateByUrl(DOCS_IMAGE, {
              state: { [DOCS_UNKNOWN_ID_STATE]: named },
            })
          : this.router.navigateByUrl(DOCS_IMAGE));
      }
    });

    // The rail scrolls, so a flow late in the manifest is reached by a deep
    // link with its line outside the scrolled window or clipped by its edge.
    // Runs after render so the line carrying the mark is the one that exists,
    // and only ever moves the rail as far as it has to. The rail is moved
    // rather than the line brought into view, which would hand Chromium a new
    // place to start tabbing from and skip the page's header.
    afterRenderEffect(() => {
      this.activeFlow();
      const rail = this.rail()?.nativeElement;
      const line = rail?.querySelector<HTMLElement>(
        '.gs-index-entry[aria-current]',
      );
      if (!rail || !line) {
        return;
      }
      const behavior: ScrollBehavior = globalThis.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches
        ? 'auto'
        : 'smooth';
      // The column form scrolls on the rail itself, the row form on the strip
      // of names inside it; whichever cannot move stays where it is.
      scrollWithin(rail, line, 'nearest', behavior);
      const row = rail.querySelector<HTMLElement>('.gs-index-rail-nav');
      if (row) {
        scrollWithin(row, line, 'nearest', behavior);
      }
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
  public taskNameKey(flowId: string): string {
    // A concept track is named under the learn keys; only the worked
    // techniques have tutorial entries.
    return isConceptFlow(flowId)
      ? `generate.learn.flows.${flowId}.task_name`
      : `generate.tutorials.flows.${canonicalFlowId(flowId)}.task_name`;
  }

  /** The mark and hue the technique on screen is read by. */
  public readonly activeIdentity = computed<SectionIdentity | null>(() => {
    const id = this.activeId();
    return id ? sectionIdentity(flowDef(id)?.section) : null;
  });

  /** The key holding a flow's one-line description of itself. */
  public summaryKey(flowId: string): string {
    return isConceptFlow(flowId)
      ? `generate.learn.flows.${flowId}.summary`
      : `generate.tutorials.flows.${flowId}.summary`;
  }

  /**
   * The label of a read's closing handoff, in that read's own words. The same
   * key the studio pane reads, so the offer is worded once.
   */
  public stepCtaKey(flowId: string, step: FlowStep): string {
    return `generate.learn.flows.${flowId}.steps.${step.id}.cta`;
  }

  /** A step's title: the same key the studio pane reads. */
  public stepTitleKey(flowId: string, step: FlowStep): string {
    return `generate.learn.flows.${canonicalFlowId(flowId)}.steps.${step.id}.title`;
  }

  /** A step's body in the chosen register: the same key the studio pane reads. */
  public stepBodyKey(flowId: string, step: FlowStep): string {
    return `generate.learn.flows.${canonicalFlowId(flowId)}.steps.${step.id}.body.${this.level()}`;
  }

  /** What the strips under a step are, where they are not this example's own. */
  public stepEvidenceNoteKey(flowId: string, step: FlowStep): string {
    return `generate.learn.flows.${canonicalFlowId(flowId)}.steps.${step.id}.evidence_note`;
  }

  public levelKey(level: TutorialLevel): string {
    return `generate.learn.level.${level}`;
  }

  public setLevel(level: TutorialLevel): void {
    this.tutorial.setLevel(level);
  }

  /**
   * What the published run cost, rounded for prose, or null where the example
   * carries no timing. Taken from the run's own manifest rather than written
   * into the copy, which otherwise goes stale the next time the library is
   * regenerated. Null is a complete answer: the submitting step reads as a
   * whole sentence without it.
   */
  public readonly runCost = computed<ExampleRunCost | null>(() =>
    exampleRunCost(this.activeDetail()?.meta),
  );

  /** The run's cost, for the one step that submits the request. */
  public runCostFor(step: string): ExampleRunCost | null {
    return step === 'generate' ? this.runCost() : null;
  }

  /**
   * The flow's one-line description in the page's own plain voice, falling back
   * to the manifest's when a flow has no override. The manifest is generated
   * from the example run and is written for someone who already knows the
   * technique, which is the wrong register for the first thing a reader reads.
   *
   * A short read has no manifest entry at all, so its own key is the only
   * answer there is.
   */
  public readonly activeSummary = computed<string>(() => {
    const id = this.activeId();
    if (!id) {
      return '';
    }
    const key = this.summaryKey(id);
    const text = this.transloco.translate(key);
    if (text && text !== key) {
      return text;
    }
    return this.activeFlow()?.summary ?? '';
  });

  /**
   * Why the horde could not serve this technique when the examples were made,
   * or null where it could. Read from the manifest, so it is only known once the
   * library has answered; until then the page reads as an ordinary one, which
   * is what it is for every technique but the one exception.
   */
  public readonly skippedReason = computed<string | null>(() => {
    const flow = this.activeFlow();
    return flow?.status === 'skipped' ? (flow.skipped_reason ?? '') : null;
  });

  /** Whether the studio can walk a reader through this technique field by field. */
  public canStart(): boolean {
    const id = this.activeId();
    return id !== null && this.skippedReason() === null && flowFollowable(id);
  }

  /**
   * Arm the flow and go to the studio. The arming is held in memory rather than
   * put in the URL, so reloading the studio lands on an ordinary studio instead
   * of restarting a tutorial the reader has moved past.
   */
  public startTutorial(): void {
    const id = this.activeId();
    if (id === null) {
      return;
    }
    this.tutorial.arm(id);
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
