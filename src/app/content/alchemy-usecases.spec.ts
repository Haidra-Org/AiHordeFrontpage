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

describe('alchemy use cases', () => {
  it('files every form the studio can submit, and no other', () => {
    const offered = [...ALCHEMY_DATA_FORMS, ...ALCHEMY_POST_PROCESSOR_FORMS];
    expect([...filed].sort()).toEqual([...offered].sort());
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
