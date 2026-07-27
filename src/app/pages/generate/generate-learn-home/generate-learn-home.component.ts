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
import { TutorialEngineService } from '../../../services/tutorial-engine.service';
import {
  TutorialFlow,
  TutorialManifest,
} from '../generate-tutorials/generate-tutorials.component';

/** Where the committed example set lives, relative to the served root. */
const TUTORIALS_ROOT = '/assets/tutorials';

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

/** One door of the "understand it" band. */
interface UnderstandDoor {
  titleKey: string;
  hintKey: string;
  link: string;
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
  selector: 'app-generate-learn-home',
  imports: [TranslocoPipe, RouterLink, IconComponent],
  templateUrl: './generate-learn-home.component.html',
  host: {
    class: 'gs-learn-home',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateLearnHomeComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly tutorial = inject(TutorialEngineService);

  private readonly manifest = signal<TutorialManifest | null>(null);
  public readonly loadFailed = signal(false);

  /** The single door of the "understand it" band, as a list it can grow into. */
  public readonly understandDoors: readonly UnderstandDoor[] = [
    {
      titleKey: 'generate.learn.understand_guide_title',
      hintKey: 'generate.learn.understand_guide_hint',
      link: '/generate/learn/guide',
      icon: 'question-mark-circle',
    },
  ];

  /** The shelf's flows, in the page's order, as far as the manifest has them. */
  public readonly shelf = computed<readonly TutorialFlow[]>(() => {
    const flows = this.manifest()?.flows ?? [];
    return SHELF_FLOWS.map((id) => flows.find((flow) => flow.id === id)).filter(
      (flow): flow is TutorialFlow => flow !== undefined,
    );
  });

  /** The hero's backdrop: the image the walkthrough it starts actually made. */
  public readonly heroImage = computed(() => {
    const flow = this.manifest()?.flows.find((entry) => entry.id === HERO_FLOW);
    return flow?.result
      ? `${TUTORIALS_ROOT}/${flow.directory}/${flow.result}`
      : '';
  });

  constructor() {
    this.http
      .get<TutorialManifest>(`${TUTORIALS_ROOT}/manifest.json`)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (manifest) => this.manifest.set(manifest),
        error: () => this.loadFailed.set(true),
      });
  }

  /** A flow's result image, where it has one. */
  public resultUrl(flow: TutorialFlow): string {
    return flow.result
      ? `${TUTORIALS_ROOT}/${flow.directory}/${flow.result}`
      : '';
  }

  public flowLink(flow: TutorialFlow): string[] {
    return ['/generate/learn/tutorials', flow.id];
  }

  /** The key naming a flow by what it makes, as the examples page names it. */
  public taskNameKey(flow: TutorialFlow): string {
    return `generate.tutorials.flows.${flow.id}.task_name`;
  }

  /**
   * The flow's one-line description in the page's own voice, falling back to
   * the manifest's where a flow has no override, exactly as the examples page
   * does: the manifest is written for someone who already knows the technique.
   */
  public summaryFor(flow: TutorialFlow): string {
    const key = `generate.tutorials.flows.${flow.id}.summary`;
    const text = this.transloco.translate(key);
    return !text || text === key ? flow.summary : text;
  }

  /**
   * Arm the first walkthrough and go to the studio, the same handoff the
   * examples page makes: held in memory rather than in the URL, so reloading
   * the studio lands on an ordinary studio.
   */
  public startHero(): void {
    this.tutorial.arm(HERO_FLOW);
    void this.router.navigate(['/generate/image']);
  }
}
