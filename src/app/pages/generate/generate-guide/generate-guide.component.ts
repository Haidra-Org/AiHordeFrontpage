import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  inject,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { GsSweepGridComponent } from '../../../components/gs-sweep-grid/gs-sweep-grid.component';
import { GsSweepScrubComponent } from '../../../components/gs-sweep-scrub/gs-sweep-scrub.component';
import {
  SWEEP_GRID_PARAMETER_BY_HELP_TOPIC,
  SWEEP_PARAMETER_BY_HELP_TOPIC,
} from '../../../services/sweep-library.service';
import { TutorialEngineService } from '../../../services/tutorial-engine.service';
import {
  SECTION_IDENTITIES,
  SectionIdentity,
  sectionFor,
} from '../section-identity';

/** One card of the control panel, and the help topics that card carries. */
export interface GuideSection {
  /** Suffix of the section's anchor id, and of nothing else. */
  id: string;
  /**
   * The panel's own label for the card. Reused rather than restated so the
   * guide cannot come to name a section differently from the form does.
   */
  labelKey: string;
  /** `generate.help.<topic>` entries, in the order the panel shows them. */
  topics: readonly string[];
  /**
   * The worked example that puts this section's settings to work, where one
   * covers them. Set only where the walkthrough really is about the section:
   * reading about a dial and then being handed an example that never touches it
   * is worse than being offered nothing.
   */
  practiceFlow?: string;
}

/**
 * The reference half of the guide, mirroring the control panel top to bottom.
 * Cards that carry no help topics of their own (prompt, dimensions) are covered
 * by the walkthrough instead, so they would list nothing here.
 */
export const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: 'source',
    labelKey: 'generate.source.section',
    topics: ['source_modes', 'denoise'],
  },
  {
    id: 'sampling',
    labelKey: 'generate.form.sampling_section',
    topics: [
      'steps',
      'cfg',
      'sampler',
      'seed',
      'clip_skip',
      'karras',
      'hires_fix',
      'tiling',
      'hires_denoise',
      'requirements',
    ],
    practiceFlow: 'txt2img',
  },
  {
    id: 'loras',
    labelKey: 'generate.form.loras_section',
    topics: ['loras'],
  },
  {
    id: 'post',
    labelKey: 'generate.form.post_processing_section',
    topics: ['upscaler', 'facefixer', 'facefixer_strength'],
  },
  {
    id: 'output',
    labelKey: 'generate.form.output_section',
    topics: ['batch', 'nsfw', 'censor_nsfw'],
  },
  {
    id: 'horde',
    labelKey: 'generate.form.horde_section',
    topics: [
      'trusted_workers',
      'slow_workers',
      'extra_slow_workers',
      'allow_downgrade',
      'replacement_filter',
      'webhook',
      'workers',
      'remember_extras',
    ],
  },
  {
    id: 'workflows',
    labelKey: 'generate.form.workflows_section',
    topics: ['transparent', 'qr'],
  },
];

/** One step of the walkthrough, and the strips it can show under its copy. */
interface GuideStep {
  /** Suffix of the step's `generate.guide.steps.<id>` copy. */
  id: string;
  /**
   * Sweep parameters the step offers, in the order they are read. These are
   * the settings the walkthrough covers instead of the reference half, so the
   * pictures have nowhere else to hang: the panel cards they belong to carry no
   * `?` glyph of their own.
   */
  sweeps: readonly string[];
}

/** The walkthrough, in the order a first image is actually made. */
const GUIDE_STEPS: readonly GuideStep[] = [
  { id: 'prompt', sweeps: ['prompt_emphasis', 'negative_prompt'] },
  { id: 'model', sweeps: [] },
  { id: 'dimensions', sweeps: ['resolution'] },
  { id: 'generate', sweeps: [] },
  { id: 'results', sweeps: [] },
  { id: 'advanced', sweeps: [] },
];

/** What a topic with no strip published for it offers, without allocating. */
const NO_SWEEPS: readonly string[] = [];

/**
 * The studio's written guide: a short walkthrough of a first generation,
 * followed by every field note the panel's `?` glyphs carry, gathered under the
 * card each field belongs to.
 *
 * It is a page of the Learn area rather than a pane of the studio: the
 * reference half runs to a screen and a half of prose, which the results pane
 * could only offer a column of, and a reader sent here from the studio wants
 * to read rather than to keep half an eye on a queue.
 */
@Component({
  selector: 'app-generate-guide',
  imports: [
    TranslocoPipe,
    RouterLink,
    IconComponent,
    GsSweepScrubComponent,
    GsSweepGridComponent,
  ],
  templateUrl: './generate-guide.component.html',
  host: {
    class: 'gs-guide',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateGuideComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly tutorial = inject(TutorialEngineService);

  private readonly flow = viewChild<ElementRef<HTMLElement>>('flow');

  public readonly sections = GUIDE_SECTIONS;
  public readonly steps = GUIDE_STEPS;

  /**
   * The panel area a reference section stands for, so the guide names it with
   * the same glyph and hue the card carries.
   */
  public identityFor(id: string): SectionIdentity | null {
    const section = sectionFor('guide', id);
    return section ? SECTION_IDENTITIES[section] : null;
  }

  /** The strips a reference entry has pictures for, in the order they read. */
  public sweepFor(topic: string): readonly string[] {
    const parameter = SWEEP_PARAMETER_BY_HELP_TOPIC[topic];
    return parameter ? [parameter] : NO_SWEEPS;
  }

  /** The two-axis plate a reference entry can offer beside its strip. */
  public sweepGridFor(topic: string): string | null {
    return SWEEP_GRID_PARAMETER_BY_HELP_TOPIC[topic] ?? null;
  }

  /** The DOM id of a section, so the contents rail can target it. */
  public sectionId(id: string): string {
    return `gs-guide-sec-${id}`;
  }

  /**
   * Arm the section's worked example and go to the studio, the same handoff the
   * Learn pages make: held in memory rather than in the URL, so reloading the
   * studio lands on an ordinary studio rather than restarting the walkthrough.
   */
  public startPractice(section: GuideSection): void {
    if (!section.practiceFlow) {
      return;
    }
    this.tutorial.arm(section.practiceFlow);
    void this.router.navigate(['/generate/image']);
  }

  /** Scroll the pane to a section of the guide. */
  public jumpToSection(id: string): void {
    const target = this.flow()?.nativeElement.querySelector<HTMLElement>(
      `#${this.sectionId(id)}`,
    );
    target?.scrollIntoView({ behavior: this.scrollBehavior(), block: 'start' });
  }

  private scrollBehavior(): ScrollBehavior {
    const reduced =
      isPlatformBrowser(this.platformId) &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return reduced ? 'auto' : 'smooth';
  }
}
