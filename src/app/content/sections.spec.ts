import { describe, expect, it } from 'vitest';
import { APP_ICONS } from '../icons';
import { FLOWS } from './flows';
import {
  SECTION_BY_STEP_ID,
  SECTION_IDENTITIES,
  SectionId,
  sectionFor,
  sectionIdentity,
} from './sections';
import { SETTINGS } from './settings';

describe('section identities', () => {
  const identities = Object.entries(SECTION_IDENTITIES) as [
    SectionId,
    (typeof SECTION_IDENTITIES)[SectionId],
  ][];

  it('names each identity after its own id', () => {
    for (const [id, identity] of identities) {
      expect(identity.icon).toBe(`sec-${id}`);
      expect(identity.className).toBe(`gs-sec--${id}`);
      expect(identity.labelKey).toBe(`generate.sections.${id}`);
    }
  });

  it('draws each identity with an icon the registry carries', () => {
    for (const [, identity] of identities) {
      expect(APP_ICONS[identity.icon]).toBeTruthy();
    }
  });

  it('resolves every claimed step id against the one step authoring', () => {
    const authored = new Set(
      FLOWS.flatMap((flow) => flow.steps.map((step) => step.id)),
    );

    for (const id of Object.keys(SECTION_BY_STEP_ID)) {
      expect(authored.has(id)).toBe(true);
    }
  });

  it('leaves the steps that belong to no card unmarked', () => {
    // Pressing Generate and reading what came back are steps about the page.
    for (const id of ['generate', 'generate_before', 'regenerate', 'results']) {
      expect(sectionFor(id)).toBeUndefined();
    }
  });

  it('points every mapping at an identity that exists', () => {
    const known = new Set(Object.keys(SECTION_IDENTITIES));
    const mapped = [
      ...Object.values(SECTION_BY_STEP_ID),
      ...SETTINGS.map((entry) => entry.section),
    ];

    for (const id of mapped) {
      expect(known.has(id)).toBe(true);
    }
  });

  it('returns nothing for an id no surface authors', () => {
    expect(sectionFor('nonexistent')).toBeUndefined();
  });

  it('answers with no identity where there is no section', () => {
    expect(sectionIdentity(undefined)).toBeNull();
    expect(sectionIdentity(null)).toBeNull();
    expect(sectionIdentity('sampling')).toBe(SECTION_IDENTITIES.sampling);
  });
});
