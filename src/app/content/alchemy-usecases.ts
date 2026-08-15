import { ALCHEMY_DATA_FORMS, AlchemyFormName } from '../types/generation';
import { DOCS_IMAGE_SETTINGS, docsSettingLink } from './docs-links';
import { SettingLink } from './settings';

/**
 * What the alchemy studio is used for, as the panel, its `?` notes and its
 * documentation all know it.
 *
 * The studio submits twenty-three forms and a reader wants four things. Filing
 * the forms under the thing they do is what lets the documentation be four
 * pages instead of twenty-three stubs, and what lets a card in the panel and a
 * page in the book be the same subject rather than two arrangements of it.
 *
 * The form lists here are the studio's own: the panel builds its operation
 * groups from them, so a form cannot be offered by the tool and missing from
 * the page about it.
 */
export type AlchemyUseCaseId = 'describe' | 'enlarge' | 'fix_faces' | 'cut_out';

/**
 * The upscalers, in the order the panel offers them. They are one use case with
 * eleven variants rather than eleven operations: the choice between them is
 * which kind of picture is being enlarged, not what enlarging is.
 */
export const ALCHEMY_UPSCALER_FORMS: readonly AlchemyFormName[] = [
  'RealESRGAN_x4plus',
  'RealESRGAN_x2plus',
  'RealESRGAN_x4plus_anime_6B',
  'NMKD_Siax',
  '4x_AnimeSharp',
  '4xNomos8kSC',
  '4xLSDIRplus',
  '4xNomosWebPhoto_RealPLKSR',
  '4xNomos2_realplksr_dysample',
  '4xNomos2_hq_dat2',
  '2xModernSpanimationV1',
];

export const ALCHEMY_FACE_FIXER_FORMS: readonly AlchemyFormName[] = [
  'GFPGAN',
  'GFPGANv1.3',
  'CodeFormers',
  'RestoreFormer',
];

export const ALCHEMY_BACKGROUND_FORMS: readonly AlchemyFormName[] = [
  'strip_background',
];

/** One thing the studio is used for, and everything said about it. */
export interface AlchemyUseCase {
  id: AlchemyUseCaseId;
  /**
   * The operation group in the panel this use case documents. The card wears
   * the `?` glyph that opens this entry, so the two are named together rather
   * than matched by hand at the template.
   */
  groupId: string;
  /** Registry name of the glyph the panel's card already carries. */
  icon: string;
  /** The forms filed under it, in the order the panel offers them. */
  forms: readonly AlchemyFormName[];
  /** Other use cases worth reading next. */
  related?: readonly AlchemyUseCaseId[];
  /**
   * The published strip that shows the member forms against one another on one
   * source. Only the upscalers have one: a comparison needs the forms to differ
   * in a way a picture can carry, and four face fixers on one face do not.
   */
  strip?: string;
  /** Ways out of the entry to somewhere else in the site. */
  links?: readonly SettingLink[];
}

/** Where a reader goes to see what the image studio does with the same idea. */
const UPSCALER_SETTING_LINK: SettingLink = {
  labelKey: 'alchemy.usecases.link_upscaler',
  routerLink: docsSettingLink('upscaler'),
};

const FACEFIXER_SETTING_LINK: SettingLink = {
  labelKey: 'alchemy.usecases.link_facefixer',
  routerLink: docsSettingLink('facefixer'),
};

const SETTINGS_LINK: SettingLink = {
  labelKey: 'alchemy.usecases.link_settings',
  routerLink: DOCS_IMAGE_SETTINGS,
};

export const ALCHEMY_USE_CASES: readonly AlchemyUseCase[] = [
  {
    id: 'describe',
    groupId: 'analyze',
    icon: 'document-text',
    // Every form that answers with words or numbers rather than a picture.
    forms: ALCHEMY_DATA_FORMS,
    related: ['enlarge'],
    links: [SETTINGS_LINK],
  },
  {
    id: 'enlarge',
    groupId: 'upscale',
    icon: 'photo',
    forms: ALCHEMY_UPSCALER_FORMS,
    related: ['fix_faces', 'cut_out'],
    // The library publishes one source run through every upscaler, which is the
    // only honest way to answer "which of these eleven".
    strip: 'upscaler_form',
    links: [UPSCALER_SETTING_LINK],
  },
  {
    id: 'fix_faces',
    groupId: 'facefix',
    icon: 'paintbrush',
    forms: ALCHEMY_FACE_FIXER_FORMS,
    related: ['enlarge'],
    links: [FACEFIXER_SETTING_LINK],
  },
  {
    id: 'cut_out',
    groupId: 'background',
    icon: 'cube-transparent',
    forms: ALCHEMY_BACKGROUND_FORMS,
    related: ['enlarge', 'describe'],
  },
];

const USE_CASE_BY_ID: ReadonlyMap<string, AlchemyUseCase> = new Map(
  ALCHEMY_USE_CASES.map((useCase) => [useCase.id, useCase]),
);

const USE_CASE_BY_GROUP: ReadonlyMap<string, AlchemyUseCase> = new Map(
  ALCHEMY_USE_CASES.map((useCase) => [useCase.groupId, useCase]),
);

/** The use case an id names, or undefined where it names none. */
export function alchemyUseCase(id: string): AlchemyUseCase | undefined {
  return USE_CASE_BY_ID.get(id);
}

/** The use case a panel operation group documents. */
export function alchemyUseCaseForGroup(
  groupId: string,
): AlchemyUseCase | undefined {
  return USE_CASE_BY_GROUP.get(groupId);
}

/** The name the studio and the book both call a use case by. */
export function alchemyUseCaseTitleKey(id: string): string {
  return `alchemy.usecases.${id}.title`;
}

/** The two or three lines the panel's `?` note shows. */
export function alchemyUseCaseNoteKey(id: string): string {
  return `alchemy.usecases.${id}.note`;
}

/** One sentence for someone meeting the use case. */
export function alchemyUseCaseLeadKey(id: string): string {
  return `alchemy.usecases.${id}.lead`;
}

/** The depth beneath the lead. */
export function alchemyUseCaseBodyKey(id: string): string {
  return `alchemy.usecases.${id}.body`;
}

/**
 * What a form is, as the panel's own operation rows already say it. The forms
 * are variants of their use case rather than subjects of their own, so the page
 * about the use case reads the tool's copy rather than a second description of
 * the same thing written for the book.
 */
export function alchemyFormNameKey(form: string): string {
  return `alchemy.form_names.${form}`;
}

export function alchemyFormNoteKey(form: string): string {
  return `alchemy.form_meta.${form}.desc`;
}
