import {
  ALCHEMY_USE_CASES,
  alchemyFormNameKey,
  alchemyFormNoteKey,
  alchemyUseCase,
  alchemyUseCaseBodyKey,
  alchemyUseCaseLeadKey,
  alchemyUseCaseNoteKey,
  alchemyUseCaseTitleKey,
} from './alchemy-usecases';
import { docsAlchemyUseCaseLink, docsSettingLink } from './docs-links';
import { SectionId, SectionIdentity, sectionIdentity } from './sections';
import {
  SettingApply,
  SettingLink,
  SettingRange,
  SettingTradeoffs,
  SweepStripRef,
  settingBodyKey,
  settingLeadKey,
  settingNoteKey,
  settingReference,
  settingSection,
  settingSweepAlsoStrips,
  settingSweepGrid,
  settingSweepStrip,
  settingTitleKey,
} from './settings';

/**
 * A topic the reference can be asked about, whichever studio it belongs to.
 *
 * The `?` note and the entry it opens used to read the image studio's settings
 * registry directly, which made them machinery of that one panel. They ask this
 * instead, so a second studio is a second registry and a case here rather than
 * a second note component and a second entry component saying the same things
 * in the same words.
 *
 * Everything is resolved to keys and paths on the way out. A surface rendering
 * a topic never learns which registry answered, and so cannot come to render
 * one kind of subject better than the other.
 */
export interface ReferenceTopic {
  /** The topic string a surface was asked about, unchanged. */
  id: string;
  /** The area the subject belongs to, for its glyph and hue. */
  section: SectionId | undefined;
  identity: SectionIdentity | null;
  /** The subject's short name: the note's heading and the entry's title. */
  titleKey: string;
  /** The `?` note's own two or three lines. */
  noteKey: string;
  /** One sentence for someone meeting the subject. */
  leadKey: string;
  /** The depth beneath the lead. */
  bodyKey: string;
  /** Whether there is a written entry a note can send a reader on to. */
  hasEntry: boolean;
  /** Where that entry is read in full. */
  fullLink: string;
  tradeoffs?: SettingTradeoffs;
  range?: SettingRange;
  /** Values the entry offers to write into a form, where it has any. */
  applies: readonly SettingApply[];
  related: readonly ReferenceRelated[];
  links: readonly SettingLink[];
  glossaryTerms: readonly string[];
  strip: string | null;
  alsoStrips: readonly SweepStripRef[];
  grid: string | null;
  /**
   * The named things the entry is about, where its subject is a family: the
   * eleven upscalers under "enlarge". Empty on a subject that is one thing.
   */
  variants: readonly ReferenceVariant[];
}

/** One way onwards from an entry to a sibling of the same kind. */
export interface ReferenceRelated {
  id: string;
  titleKey: string;
  link: string;
  icon: string;
  className: string;
}

/** One member of a family the entry documents. */
export interface ReferenceVariant {
  id: string;
  titleKey: string;
  noteKey: string;
}

/** What marks an alchemy use case out from an image setting of the same name. */
export const ALCHEMY_TOPIC_PREFIX = 'alchemy:';

/** The topic string standing for one alchemy use case. */
export function alchemyTopic(useCaseId: string): string {
  return `${ALCHEMY_TOPIC_PREFIX}${useCaseId}`;
}

/**
 * The subject a topic names, or null where nothing in either registry claims
 * it. Callers render nothing for null rather than an empty frame: a note with
 * no words in it is worse than no note.
 */
export function referenceTopic(topic: string): ReferenceTopic | null {
  return topic.startsWith(ALCHEMY_TOPIC_PREFIX)
    ? alchemyTopicFor(topic.slice(ALCHEMY_TOPIC_PREFIX.length))
    : settingTopicFor(topic);
}

function settingTopicFor(id: string): ReferenceTopic | null {
  const reference = settingReference(id);
  const section = settingSection(id);
  return {
    id,
    section,
    identity: sectionIdentity(section),
    titleKey: settingTitleKey(id),
    noteKey: settingNoteKey(id),
    leadKey: settingLeadKey(id),
    bodyKey: settingBodyKey(id),
    hasEntry: reference !== undefined,
    fullLink: docsSettingLink(id),
    tradeoffs: reference?.tradeoffs,
    range: reference?.range,
    applies: reference?.applies ?? [],
    related: (reference?.related ?? []).map((siblingId) => {
      const identity = sectionIdentity(settingSection(siblingId));
      return {
        id: siblingId,
        titleKey: settingTitleKey(siblingId),
        link: docsSettingLink(siblingId),
        icon: identity?.icon ?? '',
        className: identity?.className ?? '',
      };
    }),
    links: reference?.links ?? [],
    glossaryTerms: reference?.glossaryTerms ?? [],
    strip: settingSweepStrip(id),
    alsoStrips: settingSweepAlsoStrips(id),
    grid: settingSweepGrid(id),
    variants: [],
  };
}

function alchemyTopicFor(id: string): ReferenceTopic | null {
  const useCase = alchemyUseCase(id);
  if (!useCase) {
    return null;
  }
  const identity = sectionIdentity('alchemy');
  return {
    id: alchemyTopic(id),
    section: 'alchemy',
    identity,
    titleKey: alchemyUseCaseTitleKey(id),
    noteKey: alchemyUseCaseNoteKey(id),
    leadKey: alchemyUseCaseLeadKey(id),
    bodyKey: alchemyUseCaseBodyKey(id),
    // Every use case has a page, because the four pages are what the area is.
    hasEntry: true,
    fullLink: docsAlchemyUseCaseLink(id),
    applies: [],
    related: (useCase.related ?? []).map((siblingId) => ({
      id: alchemyTopic(siblingId),
      titleKey: alchemyUseCaseTitleKey(siblingId),
      link: docsAlchemyUseCaseLink(siblingId),
      icon: identity?.icon ?? '',
      className: identity?.className ?? '',
    })),
    links: useCase.links ?? [],
    glossaryTerms: [],
    strip: useCase.strip ?? null,
    alsoStrips: [],
    grid: null,
    variants: useCase.forms.map((form) => ({
      id: form,
      titleKey: alchemyFormNameKey(form),
      noteKey: alchemyFormNoteKey(form),
    })),
  };
}

/** Every alchemy topic, in the order the area reads them. */
export const ALCHEMY_TOPICS: readonly string[] = ALCHEMY_USE_CASES.map(
  (useCase) => alchemyTopic(useCase.id),
);
