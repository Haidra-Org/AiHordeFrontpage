import { describe, expect, it } from 'vitest';
import { APP_ICONS } from '../../icons';
import { TUTORIAL_STEPS } from '../../services/tutorial-engine.service';
import { GUIDE_SECTIONS } from './generate-guide/generate-guide.component';
import { TUTORIAL_FLOW_STEPS } from './generate-tutorials/generate-tutorials.component';
import {
  SECTION_BY_GUIDE_ID,
  SECTION_BY_HELP_TOPIC,
  SECTION_BY_STEP_ID,
  SECTION_IDENTITIES,
  SectionId,
  sectionFor,
} from './section-identity';

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

  it('gives every guide section an identity', () => {
    for (const section of GUIDE_SECTIONS) {
      expect(sectionFor('guide', section.id)).toBeTruthy();
    }
  });

  it('resolves every claimed step id, in both step authorings', () => {
    const authored = new Set([
      ...Object.values(TUTORIAL_FLOW_STEPS).flat(),
      ...Object.values(TUTORIAL_STEPS).flatMap((steps) =>
        steps.map((step) => step.id),
      ),
    ]);

    for (const id of Object.keys(SECTION_BY_STEP_ID)) {
      expect(authored.has(id)).toBe(true);
    }
  });

  it('leaves the steps that belong to no card unmarked', () => {
    // Pressing Generate and reading what came back are steps about the page.
    for (const id of ['generate', 'generate_before', 'regenerate']) {
      expect(sectionFor('step', id)).toBeUndefined();
    }
  });

  it('files every help topic the guide lists under a section', () => {
    for (const section of GUIDE_SECTIONS) {
      for (const topic of section.topics) {
        expect(sectionFor('help', topic)).toBeTruthy();
      }
    }
  });

  it('points every mapping at an identity that exists', () => {
    const known = new Set(Object.keys(SECTION_IDENTITIES));
    const mapped = [
      ...Object.values(SECTION_BY_GUIDE_ID),
      ...Object.values(SECTION_BY_STEP_ID),
      ...Object.values(SECTION_BY_HELP_TOPIC),
    ];

    for (const id of mapped) {
      expect(known.has(id)).toBe(true);
    }
  });

  it('returns nothing for an id no surface authors', () => {
    expect(sectionFor('guide', 'nonexistent')).toBeUndefined();
    expect(sectionFor('help', 'nonexistent')).toBeUndefined();
  });
});
