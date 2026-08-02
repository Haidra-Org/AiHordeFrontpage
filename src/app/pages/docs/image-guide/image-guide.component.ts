import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import {
  GsIndexRailComponent,
  GsIndexRailEntry,
} from '../../../components/gs-index-rail/gs-index-rail.component';
import { GsSweepGridComponent } from '../../../components/gs-sweep-grid/gs-sweep-grid.component';
import { GsSweepScrubComponent } from '../../../components/gs-sweep-scrub/gs-sweep-scrub.component';
import { TutorialEngineService } from '../../../services/tutorial-engine.service';
import {
  SECTION_IDENTITIES,
  SectionIdentity,
  sectionFor,
  sectionIdentity,
} from '../../../content/sections';
import {
  settingNoteKey,
  settingSweepGrid,
  settingSweepStrip,
  settingTitleKey,
} from '../../../content/settings';
import {
  DOCS_IMAGE,
  STUDIO_IMAGE,
  docsSettingLink,
} from '../../../content/docs-links';
import {
  GUIDE_SECTIONS,
  GUIDE_STEPS,
  GuideSection,
  guideSectionId,
} from '../../../content/guide';
import { setPageMeta } from '../../../helper/page-meta';

/** What a topic with no strip published for it offers, without allocating. */
const NO_SWEEPS: readonly string[] = [];

/**
 * The contents of the page: the walkthrough, then the reference sections in the
 * panel's own order. The walkthrough belongs to no card of the panel, so it
 * takes the page's own glyph and no hue rather than borrowing a section's.
 */
const RAIL_ENTRIES: readonly GsIndexRailEntry[] = [
  {
    id: 'walkthrough',
    labelKey: 'generate.guide.toc_walkthrough',
    icon: 'document-text',
    targetId: guideSectionId('walkthrough'),
  },
  ...GUIDE_SECTIONS.map((section) => {
    const identity = sectionFor('guide', section.id);
    return {
      id: section.id,
      labelKey: section.labelKey,
      icon: identity ? SECTION_IDENTITIES[identity].icon : undefined,
      hueClass: identity ? SECTION_IDENTITIES[identity].className : undefined,
      targetId: guideSectionId(section.id),
    };
  }),
];

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
  selector: 'app-docs-image-guide',
  imports: [
    TranslocoPipe,
    RouterLink,
    IconComponent,
    GsIndexRailComponent,
    GsSweepScrubComponent,
    GsSweepGridComponent,
  ],
  templateUrl: './image-guide.component.html',
  host: {
    class: 'gs-guide',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsImageGuideComponent {
  private readonly router = inject(Router);
  private readonly tutorial = inject(TutorialEngineService);

  constructor() {
    setPageMeta({
      titleKey: 'generate.guide.title',
      descriptionKey: 'generate.guide.lead',
    });
  }

  public readonly sections = GUIDE_SECTIONS;
  public readonly steps = GUIDE_STEPS;
  public readonly railEntries = RAIL_ENTRIES;
  /** The way back up to the area this page is one of. */
  public readonly learnLink = DOCS_IMAGE;

  /**
   * The panel area a reference section stands for, so the guide names it with
   * the same glyph and hue the card carries.
   */
  public identityFor(id: string): SectionIdentity | null {
    return sectionIdentity(sectionFor('guide', id));
  }

  /** What the panel calls the setting, which is what the summary is headed by. */
  public titleKey(topic: string): string {
    return settingTitleKey(topic);
  }

  /** The `?` note's own lines, which are the summary this list carries. */
  public noteKey(topic: string): string {
    return settingNoteKey(topic);
  }

  /** Where the setting is written out in full. */
  public settingLink(topic: string): string {
    return docsSettingLink(topic);
  }

  /** The strips a reference entry has pictures for, in the order they read. */
  public sweepFor(topic: string): readonly string[] {
    const parameter = settingSweepStrip(topic);
    return parameter ? [parameter] : NO_SWEEPS;
  }

  /** The two-axis plate a reference entry can offer beside its strip. */
  public sweepGridFor(topic: string): string | null {
    return settingSweepGrid(topic);
  }

  /** The DOM id of a section, so the contents rail can target it. */
  public sectionId(id: string): string {
    return guideSectionId(id);
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
    void this.router.navigateByUrl(STUDIO_IMAGE);
  }
}
