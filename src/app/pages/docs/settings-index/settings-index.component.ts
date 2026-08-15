import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { GsFindFieldComponent } from '../../../components/gs-find-field/gs-find-field.component';
import {
  GsIndexRailComponent,
  GsIndexRailEntry,
} from '../../../components/gs-index-rail/gs-index-rail.component';
import {
  GLOSSARY_TERMS,
  GlossaryService,
} from '../../../services/glossary.service';
import { SweepLibraryService } from '../../../services/sweep-library.service';
import { SECTION_IDENTITIES } from '../../../content/sections';
import {
  SETTINGS_INDEX,
  SETTING_ID_BY_PARAMETER,
  settingLeadKey,
  settingProseLabelKey,
  settingSweepStrip,
  settingTitleKey,
} from '../../../content/settings';
import { docsSettingLink } from '../../../content/docs-links';
import { setPageMeta } from '../../../helper/page-meta';

/**
 * The API's field names, gathered under the setting they name. A reader who
 * knows the horde by its payload looks for `cfg_scale`, and the alias map is
 * where the studio already keeps that knowledge, so the find field reads it
 * rather than restating it.
 */
const ALIASES_BY_ID: ReadonlyMap<string, readonly string[]> = Object.entries(
  SETTING_ID_BY_PARAMETER,
).reduce((map, [alias, id]) => {
  map.set(id, [...(map.get(id) ?? []), alias]);
  return map;
}, new Map<string, string[]>());

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
  selector: 'app-docs-settings-index',
  imports: [
    TranslocoPipe,
    RouterLink,
    IconComponent,
    GsIndexRailComponent,
    GsFindFieldComponent,
  ],
  templateUrl: './settings-index.component.html',
  host: {
    class: 'gs-ref-index',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsSettingsIndexComponent {
  private readonly sweeps = inject(SweepLibraryService);
  private readonly glossary = inject(GlossaryService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly transloco = inject(TranslocoService);

  /** What the reader has typed into the find field, trimmed when it is used. */
  public readonly query = signal('');

  /** Re-read the copy whenever the language or the loaded file changes. */
  private readonly translations = toSignal(this.transloco.events$, {
    initialValue: null,
  });

  private readonly allGroups = computed<readonly IndexGroup[]>(() =>
    SETTINGS_INDEX.map((group) => {
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
   * The bands the page draws: every band while the field is empty, and only the
   * cards carrying the query once it is not. A band whose cards have all gone
   * is dropped rather than left as a heading over nothing.
   */
  public readonly groups = computed<readonly IndexGroup[]>(() => {
    const needle = this.query().trim().toLowerCase();
    if (!needle) {
      return this.allGroups();
    }
    return this.allGroups()
      .map((group) => ({
        ...group,
        cards: group.cards.filter((card) =>
          this.haystack(card.id).includes(needle),
        ),
      }))
      .filter((group) => group.cards.length > 0);
  });

  /** How many cards survived, which is what the find field announces. */
  public readonly matchCount = computed(() =>
    this.groups().reduce((total, group) => total + group.cards.length, 0),
  );

  /**
   * Everything a setting can be looked for by: what the panel calls it, what
   * prose calls it, the sentence the entry leads with, the studio's own id, and
   * every API field name that is an alias onto that id.
   */
  private haystack(id: string): string {
    this.translations();
    const copy = [
      settingTitleKey(id),
      settingProseLabelKey(id),
      settingLeadKey(id),
    ].map((key) => this.copyFor(key));
    return [id, ...(ALIASES_BY_ID.get(id) ?? []), ...copy]
      .join(' ')
      .toLowerCase();
  }

  /**
   * A line of copy, or nothing where the book has not written it: the service
   * answers an unwritten key with the key itself, and a key is made of words no
   * reader would type.
   */
  private copyFor(key: string): string {
    const line = this.transloco.translate(key);
    return line === key ? '' : line;
  }

  /**
   * The bands as the contents rail names them: the same areas, in the same
   * order, aimed at the ids the bands already carry for the glossary.
   */
  public readonly railEntries = computed<readonly GsIndexRailEntry[]>(() =>
    this.allGroups().map((group) => ({
      id: group.section,
      labelKey: group.labelKey,
      icon: group.icon,
      hueClass: group.className,
      targetId: `gs-ref-group-${group.section}`,
    })),
  );

  constructor() {
    setPageMeta({
      titleKey: 'generate.reference.head',
      descriptionKey: 'generate.reference.lead',
    });
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
      entries: SETTINGS_INDEX.map((group) => {
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
      titleKey: settingTitleKey(id),
      link: docsSettingLink(id),
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
    const parameter = settingSweepStrip(id);
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
