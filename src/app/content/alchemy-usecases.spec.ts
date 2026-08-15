import { describe, expect, it } from 'vitest';
import {
  ALCHEMY_USE_CASES,
  alchemyFormNameKey,
  alchemyFormNoteKey,
  alchemyUseCase,
  alchemyUseCaseBodyKey,
  alchemyUseCaseForGroup,
  alchemyUseCaseLeadKey,
  alchemyUseCaseNoteKey,
  alchemyUseCaseTitleKey,
} from './alchemy-usecases';
import {
  ALCHEMY_DATA_FORMS,
  ALCHEMY_POST_PROCESSOR_FORMS,
} from '../types/generation';
import { APP_ICONS } from '../icons';
import en from '../../assets/i18n/en.json';

const translations = en as Record<string, string>;

const filed = ALCHEMY_USE_CASES.flatMap((useCase) => useCase.forms);

/**
 * The horde's twenty-four alchemy forms and the use case each belongs to, as
 * the evidence library enumerates them from `KNOWN_ALCHEMY_TYPES` in its
 * `assets/param-sweeps/alchemy/manifest.json`. Mirrored here rather than
 * derived from the app's own constants: the app's constants are what it can
 * submit, and asserting the registry against them would let the documentation
 * drift away from the horde without a test noticing.
 */
const KNOWN_ALCHEMY_FORMS: Readonly<Record<string, readonly string[]>> = {
  describe: [
    'caption',
    'interrogation',
    'nsfw',
    'describe',
    'aesthetic',
    'palette',
    'annotation',
  ],
  enlarge: [
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
    'vectorize',
  ],
  fix_faces: ['GFPGAN', 'CodeFormers', 'GFPGANv1.3', 'RestoreFormer'],
  cut_out: ['strip_background'],
};

describe('alchemy use cases', () => {
  it('files every form the horde knows of, under the use case it belongs to', () => {
    const byUseCase = Object.fromEntries(
      ALCHEMY_USE_CASES.map((useCase) => [
        useCase.id,
        [...useCase.forms].sort(),
      ]),
    );
    const expected = Object.fromEntries(
      Object.entries(KNOWN_ALCHEMY_FORMS).map(([id, forms]) => [
        id,
        [...forms].sort(),
      ]),
    );

    expect(byUseCase).toEqual(expected);
    expect(filed.length).toBe(24);
  });

  it('offers only the forms the studio can put in a request', () => {
    const submittable = new Set<string>([
      ...ALCHEMY_DATA_FORMS,
      ...ALCHEMY_POST_PROCESSOR_FORMS,
    ]);
    const operable = ALCHEMY_USE_CASES.flatMap(
      (useCase) => useCase.operableForms,
    );

    expect(operable.filter((form) => !submittable.has(form))).toEqual([]);
    expect(operable.filter((form) => !filed.includes(form))).toEqual([]);
  });

  it('documents without offering exactly the forms the studio cannot send', () => {
    const submittable = new Set<string>([
      ...ALCHEMY_DATA_FORMS,
      ...ALCHEMY_POST_PROCESSOR_FORMS,
    ]);
    const operable = new Set<string>(
      ALCHEMY_USE_CASES.flatMap((useCase) => useCase.operableForms),
    );

    expect(filed.filter((form) => !operable.has(form))).toEqual(['annotation']);
    expect(filed.filter((form) => !submittable.has(form))).toEqual([
      'annotation',
    ]);
  });

  it('files each form under exactly one use case', () => {
    expect(new Set(filed).size).toBe(filed.length);
  });

  it('finds a use case by id and by the panel group it documents', () => {
    expect(alchemyUseCase('enlarge')?.groupId).toBe('upscale');
    expect(alchemyUseCaseForGroup('upscale')?.id).toBe('enlarge');
    expect(alchemyUseCase('not_a_use_case')).toBeUndefined();
    expect(alchemyUseCaseForGroup('not_a_group')).toBeUndefined();
  });

  it('draws each use case with an icon the registry carries', () => {
    expect(
      ALCHEMY_USE_CASES.filter((useCase) => !APP_ICONS[useCase.icon]),
    ).toEqual([]);
  });

  it('writes every word each use case is read by', () => {
    const keys = ALCHEMY_USE_CASES.flatMap((useCase) => [
      alchemyUseCaseTitleKey(useCase.id),
      alchemyUseCaseNoteKey(useCase.id),
      alchemyUseCaseLeadKey(useCase.id),
      alchemyUseCaseBodyKey(useCase.id),
    ]);

    expect(keys.filter((key) => !translations[key])).toEqual([]);
  });

  it("names and describes every form it files, in the tool's own words", () => {
    const keys = filed.flatMap((form) => [
      alchemyFormNameKey(form),
      alchemyFormNoteKey(form),
    ]);

    expect(keys.filter((key) => !translations[key])).toEqual([]);
  });

  it('points every related link at another use case there is', () => {
    const known = new Set(ALCHEMY_USE_CASES.map((useCase) => useCase.id));
    const wrong = ALCHEMY_USE_CASES.flatMap((useCase) =>
      (useCase.related ?? []).filter(
        (sibling) => !known.has(sibling) || sibling === useCase.id,
      ),
    );

    expect(wrong).toEqual([]);
  });

  it('writes the label of every way out of an entry', () => {
    const links = ALCHEMY_USE_CASES.flatMap((useCase) => useCase.links ?? []);

    expect(links.length).toBeGreaterThan(0);
    expect(links.filter((link) => !translations[link.labelKey])).toEqual([]);
    expect(links.filter((link) => !link.routerLink.startsWith('/'))).toEqual(
      [],
    );
  });
});
