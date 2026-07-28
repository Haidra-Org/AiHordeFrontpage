import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  inject,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import {
  GsIndexRailComponent,
  GsIndexRailEntry,
} from '../../../components/gs-index-rail/gs-index-rail.component';
import {
  GLOSSARY_TERMS,
  GlossaryService,
} from '../../../services/glossary.service';
import { SweepLibraryService } from '../../../services/sweep-library.service';
import { REFERENCE_INDEX, referenceSweep } from '../reference-data';
import { SECTION_IDENTITIES } from '../section-identity';

/** What the glossary files the reference index's this-page entries under. */
const GLOSSARY_PAGE_ID = 'learn-settings';

/** One card of the index: a setting, said in as few words as it can be. */
interface IndexCard {
  id: string;
  titleKey: string;
  link: string;
  icon: string;
  /** A frame from the middle of the setting's sweep, or null when it has none. */
  thumb: string | null;
}

/** One band of the index: a panel area and the settings filed under it. */
interface IndexGroup {
  section: string;
  labelKey: string;
  icon: string;
  className: string;
  cards: readonly IndexCard[];
}

/**
 * The reference's front door: every setting the panel explains, grouped by the
 * area it lives in and led by the one sentence that says what it is.
 *
 * The bands are the panel's own areas in the panel's own order, so the index is
 * a map of the thing it describes rather than an alphabetical list. Two of the
 * eight areas carry no `?` glyph and so no entries; they are left out rather
 * than headed and left empty.
 *
 * A card's picture is the middle frame of the setting's own sweep, which makes
 * the settings that can be seen changing look different from the ones that
 * cannot. Where the library is missing or unpublished, every card is text, and
 * the grid has to look finished that way too.
 */
@Component({
  selector: 'app-generate-settings-index',
  imports: [TranslocoPipe, RouterLink, IconComponent, GsIndexRailComponent],
  templateUrl: './generate-settings-index.component.html',
  host: {
    class: 'gs-ref-index',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateSettingsIndexComponent {
  private readonly sweeps = inject(SweepLibraryService);
  private readonly glossary = inject(GlossaryService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  public readonly groups = computed<readonly IndexGroup[]>(() =>
    REFERENCE_INDEX.map((group) => {
      const identity = SECTION_IDENTITIES[group.section];
      return {
        section: group.section,
        labelKey: identity.labelKey,
        icon: identity.icon,
        className: identity.className,
        cards: group.ids.map((id) => this.cardFor(id, identity.icon)),
      };
    }),
  );

  /**
   * The bands as the contents rail names them: the same areas, in the same
   * order, aimed at the ids the bands already carry for the glossary.
   */
  public readonly railEntries = computed<readonly GsIndexRailEntry[]>(() =>
    this.groups().map((group) => ({
      id: group.section,
      labelKey: group.labelKey,
      icon: group.icon,
      hueClass: group.className,
      targetId: `gs-ref-group-${group.section}`,
    })),
  );

  constructor() {
    void this.sweeps.ensureLoaded();
    this.registerGlossaryContext();
  }

  /**
   * Offer the index's own bands as the glossary's this-page list. The reader is
   * already looking at the page the entries describe, so pressing one is a jump
   * down the page rather than a journey, and it is not flashed on arrival:
   * nothing changed, and a ring would say something did.
   */
  private registerGlossaryContext(): void {
    this.glossary.registerPageContext({
      pageId: GLOSSARY_PAGE_ID,
      pageTitleKey: 'help.glossary.page.learn_settings',
      relevantTermIds: GLOSSARY_TERMS.filter(
        (term) => term.category === 'generation_settings',
      ).map((term) => term.id),
      entries: REFERENCE_INDEX.map((group) => {
        const identity = SECTION_IDENTITIES[group.section];
        return {
          id: group.section,
          titleKey: identity.labelKey,
          descriptionKey: `generate.reference.section_hint.${group.section}`,
          iconName: identity.icon,
          iconColorClass: `glossary-sec--${group.section}`,
          action: () => this.showGroup(group.section),
        };
      }),
    });
    this.destroyRef.onDestroy(() =>
      this.glossary.clearPageContext(GLOSSARY_PAGE_ID),
    );
  }

  private showGroup(section: string): void {
    if (!this.isBrowser) {
      return;
    }
    const reduced = globalThis.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    this.document.getElementById(`gs-ref-group-${section}`)?.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  private cardFor(id: string, icon: string): IndexCard {
    return {
      id,
      titleKey: `generate.help.${id}.title`,
      link: `/generate/learn/settings/${id}`,
      icon,
      thumb: this.thumbFor(id),
    };
  }

  /**
   * The frame that stands for a setting on its card: the middle of its strip,
   * as the collapsed sweep uses, so the thumbnail advertises the typical rather
   * than the extreme.
   */
  private thumbFor(id: string): string | null {
    const parameter = referenceSweep(id);
    if (!parameter) {
      return null;
    }
    const strip = this.sweeps.strip(parameter);
    if (!strip) {
      return null;
    }
    const stop = strip.stops[Math.floor((strip.stops.length - 1) / 2)];
    return stop ? this.sweeps.imageUrl(stop) : null;
  }
}
