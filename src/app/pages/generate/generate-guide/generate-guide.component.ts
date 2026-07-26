import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';

/** One card of the control panel, and the help topics that card carries. */
interface GuideSection {
  /** Suffix of the section's anchor id, and of nothing else. */
  id: string;
  /**
   * The panel's own label for the card. Reused rather than restated so the
   * guide cannot come to name a section differently from the form does.
   */
  labelKey: string;
  /** `generate.help.<topic>` entries, in the order the panel shows them. */
  topics: readonly string[];
}

/**
 * The reference half of the guide, mirroring the control panel top to bottom.
 * Cards that carry no help topics of their own (prompt, dimensions) are covered
 * by the walkthrough instead, so they would list nothing here.
 */
const GUIDE_SECTIONS: readonly GuideSection[] = [
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
      'hires_denoise',
      'requirements',
    ],
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

/** The walkthrough, in the order a first image is actually made. */
const GUIDE_STEPS = [
  'prompt',
  'model',
  'generate',
  'results',
  'advanced',
] as const;

/**
 * The studio's written guide: a short walkthrough of a first generation,
 * followed by every field note the panel's `?` glyphs carry, gathered under the
 * card each field belongs to.
 *
 * It renders in place of the results list rather than as a modal or a separate
 * route: the guide is read while the panel beside it is being filled in, and a
 * dialog would cover the very controls it describes.
 */
@Component({
  selector: 'app-generate-guide',
  imports: [TranslocoPipe, RouterLink, IconComponent],
  templateUrl: './generate-guide.component.html',
  host: {
    class: 'gs-results-body gs-guide',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateGuideComponent {
  private readonly platformId = inject(PLATFORM_ID);

  private readonly flow = viewChild<ElementRef<HTMLElement>>('flow');

  /** The reader is done with the guide and wants the results back. */
  public readonly closed = output<void>();

  public readonly sections = GUIDE_SECTIONS;
  public readonly steps = GUIDE_STEPS;

  /** The DOM id of a section, so the contents rail can target it. */
  public sectionId(id: string): string {
    return `gs-guide-sec-${id}`;
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
