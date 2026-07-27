import { describe, expect, it } from 'vitest';
import {
  REFERENCE_ENTRIES,
  REFERENCE_INDEX,
  REFERENCE_TOPICS,
  referenceEntry,
  referenceNeighbours,
  referenceSection,
  referenceSweep,
  referenceSweepGrid,
} from './reference-data';
import { SECTION_BY_HELP_TOPIC } from './section-identity';
import {
  SWEEP_GRID_PARAMETER_BY_HELP_TOPIC,
  SWEEP_PARAMETER_BY_HELP_TOPIC,
} from '../../services/sweep-library.service';
import { GLOSSARY_TERMS } from '../../services/glossary.service';
import en from '../../../assets/i18n/en.json';

const translations = en as Record<string, string>;

/** Keys the index does not group, named so a failure says which. */
const groupOf = (id: string): string | undefined =>
  REFERENCE_INDEX.find((group) => group.ids.includes(id))?.section;

describe('reference registry', () => {
  it('covers every help topic the panel has, and invents none', () => {
    expect(REFERENCE_ENTRIES.map((entry) => entry.id).sort()).toEqual(
      [...REFERENCE_TOPICS].sort(),
    );
    expect(REFERENCE_TOPICS).toEqual(Object.keys(SECTION_BY_HELP_TOPIC));
  });

  it('names each entry once', () => {
    expect(new Set(REFERENCE_ENTRIES.map((entry) => entry.id)).size).toBe(
      REFERENCE_ENTRIES.length,
    );
  });

  it('files every entry under a section, looked up rather than stored', () => {
    const filed = REFERENCE_ENTRIES.map((entry) => [
      entry.id,
      referenceSection(entry.id),
    ]);

    expect(filed).toEqual(
      REFERENCE_ENTRIES.map((entry) => [
        entry.id,
        SECTION_BY_HELP_TOPIC[entry.id],
      ]),
    );
  });

  it('finds an entry by id, and nothing by a made-up one', () => {
    expect(referenceEntry('steps')?.id).toBe('steps');
    expect(referenceEntry('not_a_setting')).toBeUndefined();
  });

  it('reads sweeps off the library maps rather than a copy of them', () => {
    const resolved = REFERENCE_ENTRIES.map((entry) => [
      referenceSweep(entry.id),
      referenceSweepGrid(entry.id),
    ]);

    expect(resolved).toEqual(
      REFERENCE_ENTRIES.map((entry) => [
        SWEEP_PARAMETER_BY_HELP_TOPIC[entry.id] ?? null,
        SWEEP_GRID_PARAMETER_BY_HELP_TOPIC[entry.id] ?? null,
      ]),
    );
  });

  it('has an entry for every topic the library published a strip for', () => {
    const published = Object.keys(SWEEP_PARAMETER_BY_HELP_TOPIC);

    expect(
      published.filter((topic) => referenceEntry(topic) === undefined),
    ).toEqual([]);
  });

  it('bounds every range coherently, with the typical value inside it', () => {
    const problems = REFERENCE_ENTRIES.flatMap((entry) => {
      const range = entry.range;
      if (!range) {
        return [];
      }
      const faults: string[] = [];
      if (!range.typical) {
        faults.push(`${entry.id}: no typical value`);
      }
      if (
        range.min !== undefined &&
        range.max !== undefined &&
        range.min >= range.max
      ) {
        faults.push(`${entry.id}: min ${range.min} is not below ${range.max}`);
      }
      // A typical band reads "20-40"; either end of it has to sit within the
      // bounds the panel's own control allows.
      const ends = range.typical.split('-').map(Number).filter(Number.isFinite);
      for (const value of ends) {
        if (range.min !== undefined && value < range.min) {
          faults.push(`${entry.id}: typical ${value} is below ${range.min}`);
        }
        if (range.max !== undefined && value > range.max) {
          faults.push(`${entry.id}: typical ${value} is above ${range.max}`);
        }
      }
      return faults;
    });

    expect(problems).toEqual([]);
  });

  it('points related entries at entries that exist, and never at itself', () => {
    const problems = REFERENCE_ENTRIES.flatMap((entry) =>
      (entry.related ?? [])
        .filter(
          (sibling) =>
            sibling === entry.id || referenceEntry(sibling) === undefined,
        )
        .map((sibling) => `${entry.id} -> ${sibling}`),
    );

    expect(problems).toEqual([]);
  });

  it('names glossary terms the dictionary actually holds', () => {
    const known = new Set(GLOSSARY_TERMS.map((term) => term.id));
    const problems = REFERENCE_ENTRIES.flatMap((entry) =>
      (entry.glossaryTerms ?? [])
        .filter((id) => !known.has(id))
        .map((id) => `${entry.id} -> ${id}`),
    );

    expect(problems).toEqual([]);
    // The horde's own vocabulary is the point of the row, so at least the
    // worker settings carry one.
    expect(referenceEntry('trusted_workers')?.glossaryTerms).toContain(
      'worker',
    );
  });

  it('gives every tradeoff line and every link an English label', () => {
    const missing = REFERENCE_ENTRIES.flatMap((entry) => [
      ...[entry.tradeoffs?.quality ?? ''].filter(
        (key) => key !== '' && !translations[key],
      ),
      ...(entry.links ?? [])
        .filter(
          (link) =>
            !translations[link.labelKey] || !link.routerLink.startsWith('/'),
        )
        .map((link) => link.labelKey),
    ]);

    expect(missing).toEqual([]);
  });

  it('has written a lead and a body for every entry', () => {
    const missing = REFERENCE_ENTRIES.flatMap((entry) =>
      ['lead', 'body']
        .map((part) => `generate.reference.${entry.id}.${part}`)
        .filter((key) => !translations[key]),
    );

    expect(missing).toEqual([]);
  });
});

describe('reference index', () => {
  it('groups every entry exactly once', () => {
    const grouped = REFERENCE_INDEX.flatMap((group) => group.ids);

    expect(grouped.length).toBe(REFERENCE_ENTRIES.length);
    expect([...grouped].sort()).toEqual(
      REFERENCE_ENTRIES.map((entry) => entry.id).sort(),
    );
  });

  it('lays the areas out in the order the control panel shows them', () => {
    expect(REFERENCE_INDEX.map((group) => group.section)).toEqual([
      'model',
      'source',
      'sampling',
      'finishing',
      'horde',
      'workflows',
    ]);
  });

  it('leaves out the two areas that carry no help topic', () => {
    // Prompt and size have no `?` glyph in the panel, so they have nothing to
    // group, and a heading over an empty band would read as a bug.
    const sections = REFERENCE_INDEX.map((group) => group.section);

    expect(sections).not.toContain('prompt');
    expect(sections).not.toContain('size');
  });

  it('groups each entry under its own section', () => {
    const misfiled = REFERENCE_ENTRIES.map((entry) => entry.id).filter(
      (id) => groupOf(id) !== referenceSection(id),
    );

    expect(misfiled).toEqual([]);
  });

  it('walks neighbours within a section and stops at its ends', () => {
    const sampling =
      REFERENCE_INDEX.find((group) => group.section === 'sampling')?.ids ?? [];
    const first = sampling[0];
    const last = sampling[sampling.length - 1];

    expect(referenceNeighbours(first)).toEqual({
      previous: null,
      next: sampling[1],
    });
    expect(referenceNeighbours(last).next).toBeNull();
  });

  it('has no neighbours for a setting the reference does not have', () => {
    expect(referenceNeighbours('not_a_setting')).toEqual({
      previous: null,
      next: null,
    });
  });
});
