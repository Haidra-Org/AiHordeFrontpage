import {
  AlchemyDocumentedFormName,
  AlchemyFormName,
  AnnotationControlType,
} from '../types/generation';
import {
  DOCS_IMAGE_SETTINGS,
  docsExampleLink,
  docsSettingLink,
} from './docs-links';
import { SettingLink } from './settings';

/**
 * What the alchemy studio is used for, as the panel, its `?` notes and its
 * documentation all know it.
 *
 * The horde knows twenty-four forms and a reader wants four things. Filing the
 * forms under the thing they do is what lets the documentation be five pages
 * instead of twenty-four stubs, and what lets a card in the panel and a page in
 * the book be the same subject rather than two arrangements of it.
 *
 * A use case files every form the horde's enumeration puts under it, and names
 * separately the subset this studio can submit. The panel builds its operation
 * groups from that subset, so a form cannot be offered by the tool and missing
 * from the page about it.
 */
export type AlchemyUseCaseId =
  | 'describe'
  | 'control_map'
  | 'enlarge'
  | 'fix_faces'
  | 'cut_out';

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
 * The describe use case as the horde enumerates it.
 */
export const ALCHEMY_DESCRIBE_FORMS: readonly AlchemyDocumentedFormName[] = [
  ...ALCHEMY_ANALYSIS_FORMS,
];

/** Forms that extract reusable structural guidance from an image. */
export const ALCHEMY_CONTROL_MAP_FORMS: readonly AlchemyFormName[] = [
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
/**
 * The detectors a control-map request can ask for, filed under what each one
 * reads out of the picture. The horde publishes them as one flat list of
 * thirty-three names; a reader picking one is choosing between edges, depth and
 * pose rather than between spellings, so the picker groups them that way.
 *
 * Every name the horde knows appears exactly once, and the names themselves are
 * the horde's: renaming a detector in the picker would leave the reader unable
 * to match what they chose against the request or against any other client.
 */
export interface AnnotationDetectorGroup {
  /** Suffix of `alchemy.annotation.group_*` naming what the group reads. */
  id: string;
  types: readonly AnnotationControlType[];
}

export const ANNOTATION_DETECTOR_GROUPS: readonly AnnotationDetectorGroup[] = [
  {
    id: 'edges',
    types: [
      'canny',
      'hed',
      'pidinet',
      'teed',
      'pyracanny',
      'binary',
      'scribble',
      'fakescribbles',
      'scribble_xdog',
      'scribble_pidinet',
    ],
  },
  {
    id: 'lines',
    types: [
      'standard_lineart',
      'lineart',
      'lineart_anime',
      'lineart_anime_denoise',
      'mlsd',
    ],
  },
  {
    id: 'depth',
    types: [
      'depth',
      'midas_depth',
      'zoe_depth',
      'depth_anything',
      'depth_anything_v2',
    ],
  },
  { id: 'surface', types: ['normal', 'normal_bae'] },
  { id: 'pose', types: ['openpose'] },
  { id: 'regions', types: ['seg', 'oneformer_ade20k', 'oneformer_coco'] },
  {
    id: 'colour',
    types: [
      'color',
      'shuffle',
      'recolor_luminance',
      'recolor_intensity',
      'tile',
      'tile_ttplanet_guided',
      'tile_ttplanet_simple',
    ],
  },
];

/** The i18n key naming what a detector group reads out of the picture. */
export function annotationGroupLabelKey(id: string): string {
  return `alchemy.annotation.group_${id}`;
}

/** The i18n key describing what one detector reads out of the picture. */
export function annotationDetectorDescriptionKey(
  type: AnnotationControlType,
): string {
  return `alchemy.annotation.detector.${type}`;
}

/**
 * The i18n key naming one detector as a reader would say it aloud, e.g.
 * `Depth Anything v2` for `depth_anything_v2`.
 *
 * The horde's own name is the id and stays the thing a request is matched by,
 * so this never replaces it: a surface that gives a detector a heading shows
 * the name there and keeps the id beside it.
 */
export function annotationDetectorNameKey(type: AnnotationControlType): string {
  return `alchemy.annotation.detector_name.${type}`;
}

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
   * source. Only the upscalers have one: eleven of them is more than a page of
   * pairs can hold. Everywhere else each form is read as its own source beside
   * its own result, which is the comparison at the size it is worth.
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

/**
 * The other half of the control map story. Alchemy runs the detector; the
 * lesson and the setting are where the map is used to hold a render to it, and
 * a reader who came for the map is usually on the way there.
 */
const CONTROLNET_FLOW_LINK: SettingLink = {
  labelKey: 'alchemy.usecases.link_controlnet',
  routerLink: docsExampleLink('controlnet'),
};

const SOURCE_SETTING_LINK: SettingLink = {
  labelKey: 'alchemy.usecases.link_source',
  routerLink: docsSettingLink('source'),
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
    // Every form whose answer is words or numbers read from the picture.
    forms: ALCHEMY_DESCRIBE_FORMS,
    operableForms: ALCHEMY_ANALYSIS_FORMS,
    related: ['control_map', 'enlarge'],
    links: [SETTINGS_LINK],
  },
  {
    id: 'control_map',
    groupId: 'control_map',
    icon: 'photo',
    forms: ALCHEMY_CONTROL_MAP_FORMS,
    operableForms: ALCHEMY_CONTROL_MAP_FORMS,
    related: ['describe'],
    links: [CONTROLNET_FLOW_LINK, SOURCE_SETTING_LINK],
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
