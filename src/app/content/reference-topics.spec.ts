import { describe, expect, it } from 'vitest';
import {
  ALCHEMY_TOPICS,
  alchemyTopic,
  referenceTopic,
} from './reference-topics';
import { ALCHEMY_USE_CASES } from './alchemy-usecases';
import { SECTION_IDENTITIES } from './sections';
import { settingNoteKey, settingTitleKey } from './settings';

describe('reference topics', () => {
  it('answers for an image setting with the settings registry', () => {
    const topic = referenceTopic('steps');
    expect(topic?.section).toBe('sampling');
    expect(topic?.titleKey).toBe(settingTitleKey('steps'));
    expect(topic?.noteKey).toBe(settingNoteKey('steps'));
    expect(topic?.hasEntry).toBe(true);
    expect(topic?.fullLink).toBe('/docs/image/settings/steps');
    expect(topic?.strip).toBe('steps');
    expect(topic?.variants).toEqual([]);
  });

  it('reports a setting the book has no page for as having no entry', () => {
    expect(referenceTopic('model')?.hasEntry).toBe(false);
  });

  it('answers for an alchemy use case with the alchemy registry', () => {
    const topic = referenceTopic(alchemyTopic('enlarge'));
    expect(topic?.section).toBe('alchemy');
    expect(topic?.identity).toBe(SECTION_IDENTITIES.alchemy);
    expect(topic?.titleKey).toBe('alchemy.usecases.enlarge.title');
    expect(topic?.noteKey).toBe('alchemy.usecases.enlarge.note');
    expect(topic?.hasEntry).toBe(true);
    expect(topic?.fullLink).toBe('/docs/alchemy/enlarge');
    expect(topic?.strip).toBe('upscaler_form');
  });

  it('carries the member forms of a use case as its variants', () => {
    for (const useCase of ALCHEMY_USE_CASES) {
      const topic = referenceTopic(alchemyTopic(useCase.id));
      expect(topic?.variants.map((variant) => variant.id)).toEqual([
        ...useCase.forms,
      ]);
    }
  });

  it('offers no form value to write into a form from an alchemy entry', () => {
    for (const topic of ALCHEMY_TOPICS) {
      expect(referenceTopic(topic)?.applies).toEqual([]);
    }
  });

  it('answers with nothing for an alchemy topic naming no use case', () => {
    expect(referenceTopic(alchemyTopic('not_a_use_case'))).toBeNull();
  });

  it('keeps related links inside the registry that answered', () => {
    const alchemy = referenceTopic(alchemyTopic('enlarge'));
    for (const related of alchemy?.related ?? []) {
      expect(related.link.startsWith('/docs/alchemy/')).toBe(true);
    }
    const setting = referenceTopic('steps');
    for (const related of setting?.related ?? []) {
      expect(related.link.startsWith('/docs/image/settings/')).toBe(true);
    }
  });
});
