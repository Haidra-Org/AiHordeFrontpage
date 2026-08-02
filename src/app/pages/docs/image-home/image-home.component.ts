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
import { IconComponent } from '../../../components/icon/icon.component';
import {
  TutorialEngineService,
  TutorialWorld,
  canonicalFlowId,
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
import { setPageMeta } from '../../../helper/page-meta';

/** The flow the hero door starts, and the one the page is written around. */
const HERO_FLOW = 'txt2img';

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
 * One door of the "understand it" band. A door either routes to a page of its
 * own or starts a concept track in the studio, and carries whichever of the two
 * it is: nothing on the page has both.
 */
interface UnderstandDoor {
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
  imports: [TranslocoPipe, RouterLink, IconComponent],
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
   * The doors of the "understand it" band: the two concept tracks first, since
   * a reader who does not know what a model is has no use for a list of what
   * each control does, and the written reference last.
   */
  public readonly understandDoors: readonly UnderstandDoor[] = [
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
   * The shelf's flows, in the page's order, as far as the manifest has them,
   * each one shown in the world the reader has chosen. The order is written in
   * canonical ids: a world variant is another set of pictures for a card that
   * is already here rather than a card of its own.
   */
  public readonly shelf = computed<readonly ExampleFlow[]>(() => {
    const flows = this.manifest()?.flows ?? [];
    return SHELF_FLOWS.map((id) => this.inWorld(id, flows)).filter(
      (flow): flow is ExampleFlow => flow !== undefined,
    );
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
  public readonly worldChoice = computed(() => {
    const published = this.published();
    return [HERO_FLOW, ...SHELF_FLOWS].some((id) =>
      hasWorldVariants(id, published),
    );
  });

  public readonly worlds = this.tutorial.worlds;
  public readonly world = this.tutorial.world;

  constructor() {
    setPageMeta({
      titleKey: 'generate.learn.hero_title',
      descriptionKey: 'generate.learn.hero_sub',
    });
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
  public goKey(door: UnderstandDoor): string {
    return door.flow
      ? 'generate.learn.understand_start'
      : 'generate.learn.understand_read';
  }

  /** A flow's result image, where it has one. */
  public resultUrl(flow: ExampleFlow): string {
    return exampleResultUrl(flow);
  }

  public flowLink(flow: ExampleFlow): string {
    return docsExampleLink(canonicalFlowId(flow.id));
  }

  /** The key naming a flow by what it makes, as the examples page names it. */
  public taskNameKey(flow: ExampleFlow): string {
    return `generate.tutorials.flows.${canonicalFlowId(flow.id)}.task_name`;
  }

  /** Whether a card is the alpha-channel example, in whichever world. */
  public isTransparent(flow: ExampleFlow): boolean {
    return canonicalFlowId(flow.id) === 'transparent';
  }

  /** The name a world is offered under in the switcher. */
  public worldKey(world: TutorialWorld): string {
    return `generate.learn.world.${world}`;
  }

  public setWorld(world: TutorialWorld): void {
    this.tutorial.setWorld(world);
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
  public summaryFor(flow: ExampleFlow): string {
    const key = `generate.tutorials.flows.${canonicalFlowId(flow.id)}.summary`;
    const text = this.transloco.translate(key);
    return !text || text === key ? flow.summary : text;
  }

  /**
   * Arm the first walkthrough and go to the studio, the same handoff the
   * examples page makes: held in memory rather than in the URL, so reloading
   * the studio lands on an ordinary studio.
   */
  public startHero(): void {
    this.start(HERO_FLOW);
  }

  /**
   * A concept track's door, which makes the same handoff the hero does: the
   * tracks run in the studio's follow-along pane like everything else, so there
   * is no page of their own to route to.
   */
  public startTrack(door: UnderstandDoor): void {
    if (door.flow) {
      this.start(door.flow);
    }
  }

  private start(flowId: string): void {
    this.tutorial.arm(flowId);
    void this.router.navigateByUrl(STUDIO_IMAGE);
  }
}
