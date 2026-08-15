import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import {
  FindHighlightPart,
  GsFindFieldComponent,
  findHighlightParts,
} from '../../../components/gs-find-field/gs-find-field.component';
import {
  GsIndexRailComponent,
  GsIndexRailEntry,
} from '../../../components/gs-index-rail/gs-index-rail.component';
import { GsDoorComponent } from '../../../components/gs-door/gs-door.component';
import { GsSweepGridComponent } from '../../../components/gs-sweep-grid/gs-sweep-grid.component';
import { GsSweepScrubComponent } from '../../../components/gs-sweep-scrub/gs-sweep-scrub.component';
import { TutorialEngineService } from '../../../services/tutorial-engine.service';
import {
  SECTION_IDENTITIES,
  SectionId,
  SectionIdentity,
  sectionFor,
  sectionIdentity,
} from '../../../content/sections';
import {
  hasReference,
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

/** One walkthrough step as the page draws it, with its title marked up. */
interface GuideStepView {
  id: string;
  /** The step's place in the walkthrough, which filtering must not renumber. */
  number: number;
  sweeps: readonly string[];
  title: readonly FindHighlightPart[];
  /** The panel area the step's card wears, or null where it is about none. */
  identity: SectionIdentity | null;
}

/** One reference section as the page draws it, with its heading marked up. */
interface GuideSectionView {
  section: GuideSection;
  title: readonly FindHighlightPart[];
}

/**
 * The panel area each walkthrough step is about, which is the mark and hue its
 * card carries. The step ids are the guide's own, so the registry's tutorial
 * lookup does not answer for them: the Dimensions card is the size area, and
 * pressing Generate is a question put to the horde. Reading the results is
 * about the page rather than about a card, so it maps to nothing and takes no
 * mark, the way the worked examples' own spine treats such a step.
 */
const SECTION_BY_GUIDE_STEP: Readonly<Record<string, SectionId>> = {
  prompt: 'prompt',
  model: 'model',
  dimensions: 'size',
  generate: 'horde',
  advanced: 'sampling',
};

/** What a topic with no strip published for it offers, without allocating. */
const NO_SWEEPS: readonly string[] = [];

/**
 * Every strip the walkthrough already puts on this page. The reference half
 * below covers the same settings, and a strip shown twice on one page reads as
 * two pieces of evidence rather than one: the walkthrough is where the reader
 * meets it, so the walkthrough is where it stays.
 */
const WALKTHROUGH_SWEEPS: ReadonlySet<string> = new Set(
  GUIDE_STEPS.flatMap((step) => step.sweeps),
);

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
    GsDoorComponent,
    GsSweepScrubComponent,
    GsSweepGridComponent,
    GsFindFieldComponent,
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

  private readonly transloco = inject(TranslocoService);

  /** What the reader has typed into the find field. */
  public readonly query = signal('');

  /** Re-read the copy whenever the language or the loaded file changes. */
  private readonly translations = toSignal(this.transloco.events$, {
    initialValue: null,
  });

  public readonly sections = GUIDE_SECTIONS;
  public readonly steps = GUIDE_STEPS;

  /**
   * The walkthrough steps the page draws. A step is kept when the query is in
   * its heading or in its copy, and its number is its place in the walkthrough
   * rather than its place in what is left.
   */
  public readonly visibleSteps = computed<readonly GuideStepView[]>(() => {
    const needle = this.needle();
    return GUIDE_STEPS.map((step, index) => ({
      step,
      index,
      title: this.copyFor(`generate.guide.steps.${step.id}.title`),
      body: this.copyFor(`generate.guide.steps.${step.id}.body`),
    }))
      .filter(
        (step) =>
          !needle ||
          `${step.title} ${step.body}`.toLowerCase().includes(needle),
      )
      .map((step) => ({
        id: step.step.id,
        number: step.index + 1,
        sweeps: step.step.sweeps,
        title: findHighlightParts(step.title, needle),
        identity: sectionIdentity(SECTION_BY_GUIDE_STEP[step.step.id]),
      }));
  });

  /**
   * The reference sections the page draws. A section's body is the terms it
   * lists, so looking for a setting keeps the card that names it and drops the
   * cards that do not.
   */
  public readonly visibleSections = computed<readonly GuideSectionView[]>(
    () => {
      const needle = this.needle();
      return GUIDE_SECTIONS.map((section) => ({
        section,
        title: this.copyFor(section.labelKey),
      }))
        .filter(
          (entry) =>
            !needle ||
            `${entry.title} ${this.sectionBody(entry.section)}`
              .toLowerCase()
              .includes(needle),
        )
        .map((entry) => ({
          section: entry.section,
          title: findHighlightParts(entry.title, needle),
        }));
    },
  );

  /** How much of the page is left, which is what the find field announces. */
  public readonly matchCount = computed(
    () => this.visibleSteps().length + this.visibleSections().length,
  );

  private needle(): string {
    return this.query().trim().toLowerCase();
  }

  /** A line of copy, or an empty string where the book has not written it. */
  private copyFor(key: string): string {
    this.translations();
    const line = this.transloco.translate(key);
    return line === key ? '' : line;
  }

  /** Everything a reference section says: the terms it lists and their notes. */
  private sectionBody(section: GuideSection): string {
    return section.topics
      .flatMap((topic) => [
        topic,
        this.copyFor(settingTitleKey(topic)),
        this.copyFor(settingNoteKey(topic)),
      ])
      .join(' ');
  }
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

  /**
   * Whether the reference has a page for the setting. A row whose setting has
   * none is the note and nothing else: a link that lands on a missing page is
   * worse than a title a reader cannot press.
   */
  public hasSettingPage(topic: string): boolean {
    return hasReference(topic);
  }

  /** The strips a reference entry has pictures for, in the order they read. */
  public sweepFor(topic: string): readonly string[] {
    const parameter = settingSweepStrip(topic);
    return parameter && !WALKTHROUGH_SWEEPS.has(parameter)
      ? [parameter]
      : NO_SWEEPS;
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
