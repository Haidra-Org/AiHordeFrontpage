import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { GsAnchorLinkComponent } from '../../../components/gs-anchor-link/gs-anchor-link.component';
import { IconComponent } from '../../../components/icon/icon.component';
import { GsWorldPickerComponent } from '../../../components/gs-world-picker/gs-world-picker.component';
import {
  TutorialEngineService,
  hasWorldVariants,
  resolveFlowId,
} from '../../../services/tutorial-engine.service';
import {
  ExampleFlow,
  ExampleManifest,
  exampleManifestUrl,
  exampleResultUrl,
} from '../../../content/examples';
import {
  DOCS_IMAGE_GUIDE,
  STUDIO_IMAGE,
  docsExampleLink,
} from '../../../content/docs-links';
import { FLOWS } from '../../../content/flows';
import { setPageMeta } from '../../../helper/page-meta';
import { DocsPageContextService } from '../../../services/docs-page-context.service';

/** The flow the hero's first door starts, and the one the page is written around. */
const HERO_FLOW = 'txt2img';

/**
 * The flow the hero's second door starts: the track for a reader who already
 * generates somewhere else and needs the vocabulary mapped rather than taught.
 */
const HERO_MIGRATE_FLOW = 'concepts_migrating';

/**
 * The techniques the shelf offers, in the order they are worth meeting: the
 * two that start from a picture you already have, then the ones that change
 * what comes out, then the ones that need the most setting up.
 *
 * The hero flow is deliberately absent: the page has already offered it.
 */
const SHELF_FLOWS: readonly string[] = [
  'img2img',
  'inpainting',
  'transparent',
  'facefix',
  'qr_code',
  'controlnet',
  'remix',
];

/**
 * One card of the shelf: the technique it names, and whatever the library has
 * published about it. A card with nothing published is still a card.
 */
export interface ShelfCard {
  /** The canonical flow id, which is the card's identity and its URL. */
  id: string;
  published: ExampleFlow | null;
  /** The result image, or '' before the library has answered. */
  image: string;
  unavailable: boolean;
  skippedReason: string;
}

/**
 * One door of the page, in the hero or in the "understand it" band. A door
 * either routes to a page of its own or starts a flow in the studio, and
 * carries whichever of the two it is: nothing on the page has both.
 */
interface LearnDoor {
  titleKey: string;
  hintKey: string;
  link?: string;
  flow?: string;
  icon: string;
}

/**
 * The Learn area's landing page: one way in for a reader who has never made an
 * image, one way in for a reader who wants to know what the panel's controls
 * are, and a shelf of the techniques beyond the first one.
 *
 * Everything on the shelf is read from the committed manifest, so the page
 * cannot offer a technique there is no worked example of, and a technique the
 * horde could not serve keeps saying so here as it does on its own page.
 */
@Component({
  selector: 'app-docs-image-home',
  imports: [
    TranslocoPipe,
    RouterLink,
    IconComponent,
    GsAnchorLinkComponent,
    GsWorldPickerComponent,
  ],
  templateUrl: './image-home.component.html',
  host: {
    class: 'gs-learn-home',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsImageHomeComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly tutorial = inject(TutorialEngineService);

  private readonly manifest = signal<ExampleManifest | null>(null);
  public readonly loadFailed = signal(false);

  /**
   * The hero's two ways in, of equal rank: one for a reader who has never made
   * an image, one for a reader who has made plenty somewhere else. Both leave
   * for the studio, so both are doors rather than one door and one aside.
   */
  public readonly heroDoors: readonly LearnDoor[] = [
    {
      titleKey: 'generate.learn.hero_cta',
      hintKey: 'generate.learn.hero_cta_hint',
      flow: HERO_FLOW,
      icon: 'star',
    },
    {
      titleKey: 'generate.learn.hero_migrate_cta',
      hintKey: 'generate.learn.hero_migrate_hint',
      flow: HERO_MIGRATE_FLOW,
      icon: 'adjustments-horizontal',
    },
  ];

  /**
   * The doors of the "understand it" band: the two concept tracks first, since
   * a reader who does not know what a model is has no use for a list of what
   * each control does, and the written reference last.
   */
  public readonly understandDoors: readonly LearnDoor[] = [
    {
      titleKey: 'generate.learn.understand_images_title',
      hintKey: 'generate.learn.understand_images_hint',
      flow: 'concepts_images',
      icon: 'photo-simple',
    },
    {
      titleKey: 'generate.learn.understand_horde_title',
      hintKey: 'generate.learn.understand_horde_hint',
      flow: 'concepts_horde',
      icon: 'user-group',
    },
    {
      titleKey: 'generate.learn.understand_guide_title',
      hintKey: 'generate.learn.understand_guide_hint',
      link: DOCS_IMAGE_GUIDE,
      icon: 'question-mark-circle',
    },
  ];

  /** The ids an example has actually been published under. */
  private readonly published = computed<readonly string[]>(() =>
    (this.manifest()?.flows ?? [])
      .filter((flow) => flow.status === 'available')
      .map((flow) => flow.id),
  );

  /**
   * The shelf, in the page's order: every technique the documentation teaches,
   * whether or not its pictures have arrived. The order is written in canonical
   * ids, and a world variant is another set of pictures for a card already here
   * rather than a card of its own.
   *
   * The cards come from the app rather than from the library so the shelf is a
   * complete list of what there is to read, and so the links to those pages
   * exist in the page as built rather than only after a fetch.
   */
  public readonly shelf = computed<readonly ShelfCard[]>(() => {
    const flows = this.manifest()?.flows ?? [];
    return SHELF_FLOWS.map((id) => {
      const published = this.inWorld(id, flows);
      return {
        id,
        published: published ?? null,
        image: published ? exampleResultUrl(published) : '',
        unavailable: published?.status === 'skipped',
        skippedReason: published?.skipped_reason ?? '',
      };
    });
  });

  /** The hero's backdrop: the image the walkthrough it starts actually made. */
  public readonly heroImage = computed(() => {
    const flow = this.inWorld(HERO_FLOW, this.manifest()?.flows ?? []);
    return flow ? exampleResultUrl(flow) : '';
  });

  /**
   * Whether anything the page offers was drawn in more than one world. With
   * nothing to switch between, the control would be a preference with no
   * visible effect, so it is not put on the page at all.
   */
  /** How far the reader has come, and where to go next, from the engine's memory. */
  public readonly doneCount = this.tutorial.doneCount;
  public readonly techniqueCount = FLOWS.filter((flow) => !flow.concept).length;
  public readonly nextUndone = this.tutorial.nextUndone;
  public isDone(flowId: string): boolean {
    return this.tutorial.isDone(flowId);
  }
  public nextTaskKey(): string {
    const next = this.nextUndone();
    return next ? `generate.tutorials.flows.${next}.task_name` : '';
  }

  public readonly worldChoice = computed(() => {
    const published = this.published();
    return [HERO_FLOW, ...SHELF_FLOWS].some((id) =>
      hasWorldVariants(id, published),
    );
  });

  private readonly docsPage = inject(DocsPageContextService);

  constructor() {
    setPageMeta({
      titleKey: 'generate.learn.hero_title',
      descriptionKey: 'generate.learn.hero_sub',
    });
    this.docsPage.declare('docs.nav_overview');
    this.http
      .get<ExampleManifest>(exampleManifestUrl())
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (manifest) => this.manifest.set(manifest),
        error: () => this.loadFailed.set(true),
      });
  }

  /**
   * The word a door's affordance is read by. A track is started rather than
   * opened, and the written guide is a page rather than something that runs, so
   * the two say different things about what pressing them costs.
   */
  public goKey(door: LearnDoor): string {
    return door.flow
      ? 'generate.learn.understand_start'
      : 'generate.learn.understand_read';
  }

  public flowLink(card: ShelfCard): string {
    return docsExampleLink(card.id);
  }

  public flowLinkFor(flowId: string): string {
    return docsExampleLink(flowId);
  }

  /** The key naming a technique by what it makes, as its own page names it. */
  public taskNameKey(card: ShelfCard): string {
    return `generate.tutorials.flows.${card.id}.task_name`;
  }

  /** Whether a card is the alpha-channel example, in whichever world. */
  public isTransparent(card: ShelfCard): boolean {
    return card.id === 'transparent';
  }

  /**
   * A canonical flow's manifest entry for the world in play, falling back to
   * the canonical entry where that world has no example of it.
   */
  private inWorld(
    flowId: string,
    flows: readonly ExampleFlow[],
  ): ExampleFlow | undefined {
    const id = resolveFlowId(flowId, this.tutorial.world(), this.published());
    return flows.find((flow) => flow.id === id);
  }

  /**
   * The flow's one-line description in the page's own voice, falling back to
   * the manifest's where a flow has no override, exactly as the examples page
   * does: the manifest is written for someone who already knows the technique.
   */
  public summaryFor(card: ShelfCard): string {
    const key = `generate.tutorials.flows.${card.id}.summary`;
    const text = this.transloco.translate(key);
    if (text && text !== key) {
      return text;
    }
    return card.published?.summary ?? '';
  }

  /**
   * A door that leaves for the studio, which every door on this page but the
   * written guide does: the walkthroughs and the tracks alike run in the
   * follow-along pane, so there is no page of their own to route to. The flow
   * is held in memory rather than in the URL, as the examples page hands off
   * too, so reloading the studio lands on an ordinary studio.
   */
  public startTrack(door: LearnDoor): void {
    if (door.flow) {
      this.start(door.flow);
    }
  }

  private start(flowId: string): void {
    this.tutorial.arm(flowId);
    void this.router.navigateByUrl(STUDIO_IMAGE);
  }
}
