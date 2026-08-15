import {
  AlchemyDocumentedFormName,
  AlchemyFormName,
} from '../types/generation';
import { DOCS_IMAGE_SETTINGS, docsSettingLink } from './docs-links';
import { SettingLink } from './settings';

/**
 * What the alchemy studio is used for, as the panel, its `?` notes and its
 * documentation all know it.
 *
 * The horde knows twenty-four forms and a reader wants four things. Filing the
 * forms under the thing they do is what lets the documentation be four pages
 * instead of twenty-four stubs, and what lets a card in the panel and a page in
 * the book be the same subject rather than two arrangements of it.
 *
 * A use case files every form the horde's enumeration puts under it, and names
 * separately the subset this studio can submit. The panel builds its operation
 * groups from that subset, so a form cannot be offered by the tool and missing
 * from the page about it, and a form the tool cannot send cannot become a
 * control that produces failed jobs.
 */
export type AlchemyUseCaseId = 'describe' | 'enlarge' | 'fix_faces' | 'cut_out';

/**
 * The forms that answer a question about the picture, in the order the panel
 * offers them.
 */
export const ALCHEMY_ANALYSIS_FORMS: readonly AlchemyFormName[] = [
  'caption',
  'interrogation',
  'nsfw',
  'palette',
  'describe',
  'aesthetic',
];

/**
 * The describe use case as the horde enumerates it. `annotation` reads edges,
 * depth or pose out of a picture and answers with a map of them, which is a
 * question about the picture answered in an image; the studio does not submit
 * it, so it is documented here and absent from the panel.
 */
export const ALCHEMY_DESCRIBE_FORMS: readonly AlchemyDocumentedFormName[] = [
  ...ALCHEMY_ANALYSIS_FORMS,
  'annotation',
];

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

/**
 * The enlarge use case: the upscalers and `vectorize`, which is the other answer
 * to the same question. An SVG has no resolution to run out of, so it belongs
 * with making a picture bigger rather than with reading one.
 */
export const ALCHEMY_ENLARGE_FORMS: readonly AlchemyFormName[] = [
  ...ALCHEMY_UPSCALER_FORMS,
  'vectorize',
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
  /** Every form filed under it, in the order the documentation reads them. */
  forms: readonly AlchemyDocumentedFormName[];
  /**
   * The forms of this use case the studio can submit, in the order the panel
   * offers them. Everything else it files is documented only.
   */
  operableForms: readonly AlchemyFormName[];
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
    // Every form whose answer is a read of the picture rather than a change to
    // it, which is words or numbers in all but the annotation case.
    forms: ALCHEMY_DESCRIBE_FORMS,
    operableForms: ALCHEMY_ANALYSIS_FORMS,
    related: ['enlarge'],
    links: [SETTINGS_LINK],
  },
  {
    id: 'enlarge',
    groupId: 'upscale',
    icon: 'photo',
    forms: ALCHEMY_ENLARGE_FORMS,
    operableForms: ALCHEMY_ENLARGE_FORMS,
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
    operableForms: ALCHEMY_FACE_FIXER_FORMS,
    related: ['enlarge'],
    links: [FACEFIXER_SETTING_LINK],
  },
  {
    id: 'cut_out',
    groupId: 'background',
    icon: 'cube-transparent',
    forms: ALCHEMY_BACKGROUND_FORMS,
    operableForms: ALCHEMY_BACKGROUND_FORMS,
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
