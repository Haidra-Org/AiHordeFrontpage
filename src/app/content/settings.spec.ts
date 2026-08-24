import { describe, expect, it } from 'vitest';
import {
  SETTINGS,
  SETTINGS_INDEX,
  SETTING_FALLBACK_LABEL_KEY,
  hasReference,
  settingBodyKey,
  settingEntry,
  settingIdFor,
  settingLabelKey,
  settingLeadKey,
  settingNeighbours,
  settingNoteKey,
  settingProseLabelKey,
  settingSection,
  settingSweepAlsoStrips,
  settingSweepGrid,
  settingSweepStrip,
  settingSweepStripControlType,
  settingTitleKey,
  sweepVariantPair,
} from './settings';
import { FACE_FIXERS } from '../pages/generate/generate-form.model';
import { GLOSSARY_TERMS } from '../services/glossary.service';
import en from '../../assets/i18n/en.json';

const translations = en as Record<string, string>;

/** The settings the written reference has a page for. */
const documented = SETTINGS.filter((entry) => entry.reference !== undefined);

/** Which band of the index an id landed in, named so a failure says which. */
const groupOf = (id: string): string | undefined =>
  SETTINGS_INDEX.find((group) => group.ids.includes(id))?.section;

describe('settings registry', () => {
  it('names each setting once', () => {
    expect(new Set(SETTINGS.map((entry) => entry.id)).size).toBe(
      SETTINGS.length,
    );
  });

  it('finds a setting by id, and nothing by a made-up one', () => {
    expect(settingEntry('steps')?.id).toBe('steps');
    expect(settingEntry('not_a_setting')).toBeUndefined();
    expect(settingSection('not_a_setting')).toBeUndefined();
  });

  it('resolves an API field name onto the studio id it is an alias for', () => {
    expect(settingIdFor('cfg_scale')).toBe('cfg');
    expect(settingIdFor('denoising_strength')).toBe('denoise');
    expect(settingIdFor('hires_fix')).toBe('hires');
    expect(settingIdFor('steps')).toBe('steps');
    expect(settingEntry('sampler_name')?.id).toBe('sampler');
  });

  it('never aliases a name that is already a setting of its own', () => {
    const collisions = SETTINGS.map((entry) => entry.id).filter(
      (id) => settingIdFor(id) !== id,
    );

    expect(collisions).toEqual([]);
  });

  it('calls an unknown setting "this", which reads beside the control', () => {
    expect(settingLabelKey('not_a_setting')).toBe(SETTING_FALLBACK_LABEL_KEY);
    expect(settingProseLabelKey('not_a_setting')).toBe(
      SETTING_FALLBACK_LABEL_KEY,
    );
  });

  it('names every setting in English, in a chip and in a sentence', () => {
    const missing = SETTINGS.flatMap((entry) =>
      [settingLabelKey(entry.id), settingProseLabelKey(entry.id)].filter(
        (key) => !translations[key],
      ),
    );

    expect(missing).toEqual([]);
  });

  it('falls back to the note heading where a setting names no chip label', () => {
    // The `?` note's title is already the field's short name, so a setting that
    // does not override it is named by it rather than by nothing.
    expect(settingEntry('upscaler')?.labelKey).toBeUndefined();
    expect(settingLabelKey('upscaler')).toBe(settingTitleKey('upscaler'));
  });

  it('writes a `?` note and a reference page for every documented setting', () => {
    const missing = documented.flatMap((entry) =>
      [
        settingTitleKey(entry.id),
        settingNoteKey(entry.id),
        settingLeadKey(entry.id),
        settingBodyKey(entry.id),
      ].filter((key) => !translations[key]),
    );

    expect(missing).toEqual([]);
  });

  it('bounds every range coherently, with the typical value inside it', () => {
    const problems = documented.flatMap((entry) => {
      const range = entry.reference?.range;
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

  it('points related settings at pages that exist, and never at itself', () => {
    const problems = documented.flatMap((entry) =>
      (entry.reference?.related ?? [])
        .filter((sibling) => sibling === entry.id || !hasReference(sibling))
        .map((sibling) => `${entry.id} -> ${sibling}`),
    );

    expect(problems).toEqual([]);
  });

  it('names glossary terms the dictionary actually holds', () => {
    const known = new Set(GLOSSARY_TERMS.map((term) => term.id));
    const problems = documented.flatMap((entry) =>
      (entry.reference?.glossaryTerms ?? [])
        .filter((id) => !known.has(id))
        .map((id) => `${entry.id} -> ${id}`),
    );

    expect(problems).toEqual([]);
    // The horde's own vocabulary is the point of the row, so at least the
    // worker settings carry one.
    expect(settingEntry('trusted_workers')?.reference?.glossaryTerms).toContain(
      'worker',
    );
  });

  it('gives every tradeoff line and every link an English label', () => {
    const missing = documented.flatMap((entry) => [
      ...[entry.reference?.tradeoffs?.quality ?? ''].filter(
        (key) => key !== '' && !translations[key],
      ),
      ...(entry.reference?.links ?? [])
        .filter(
          (link) =>
            !translations[link.labelKey] || !link.routerLink.startsWith('/'),
        )
        .map((link) => link.labelKey),
    ]);

    expect(missing).toEqual([]);
  });

  it('offers try-it values the form would accept, aimed at a real row', () => {
    const problems = documented.flatMap((entry) =>
      (entry.reference?.applies ?? [])
        .filter(
          (option) =>
            option.display === '' ||
            option.anchorId === '' ||
            Object.keys(option.fields).length === 0,
        )
        .map((option) => `${entry.id} -> ${option.display}`),
    );

    expect(problems).toEqual([]);
  });

  it('leaves a face fixer enabled behind any face-fixer strength it offers', () => {
    // The strength does nothing on its own: the horde only reads it while a
    // fixer is post-processing, so an entry offering one has to name a fixer.
    const problems = documented.flatMap((entry) =>
      (entry.reference?.applies ?? [])
        .filter(
          (option) =>
            option.fields.facefixer_strength !== undefined &&
            !(option.addPostProcessors ?? []).some((processor) =>
              FACE_FIXERS.includes(processor),
            ),
        )
        .map((option) => `${entry.id} -> ${option.display}`),
    );

    expect(problems).toEqual([]);
  });
});

describe('settings sweeps', () => {
  it('answers with the strip, grid and second reading a setting declares', () => {
    expect(settingSweepStrip('steps')).toBe('steps');
    expect(settingSweepGrid('steps')).toBe('steps_cfg_grid');
    expect(sweepVariantPair('steps')?.parameter).toBe('steps_converging');
    expect(sweepVariantPair('step_preview')?.parameter).toBe(
      'step_preview_guess',
    );
    expect(settingSweepStrip('cfg')).toBe('cfg_scale');
    expect(sweepVariantPair('cfg')).toBeNull();
  });

  it('reaches a setting the same way through its API field name', () => {
    expect(settingSweepStrip('cfg_scale')).toBe(settingSweepStrip('cfg'));
    expect(settingSweepStrip('hires_fix')).toBe(settingSweepStrip('hires'));
  });

  it('shares one plate between the two settings it is about', () => {
    // A grid answers "how does this interact with the setting next to it", so
    // both sides of the interaction offer the same plate.
    expect(settingSweepGrid('cfg')).toBe(settingSweepGrid('steps'));
  });

  it('gives each pair of strips its own words for the two readings', () => {
    // One set of labels for every pair would name neither: which sampler a
    // strip was rendered with and which reading of a part-finished render is
    // on show are answers to different questions.
    const pairs = ['steps', 'step_preview'].map((parameter) =>
      sweepVariantPair(parameter),
    );
    const missing = pairs.flatMap((pair) =>
      [pair?.groupLabelKey, pair?.baseLabelKey, pair?.altLabelKey].filter(
        (key) => !key || !translations[key],
      ),
    );

    expect(missing).toEqual([]);
    expect(new Set(pairs.map((pair) => pair?.baseLabelKey)).size).toBe(2);
    // The folded note answers "which kind of sampler is mine", so it belongs to
    // the sampler pair alone.
    expect(sweepVariantPair('steps')?.samplerNote).toBe(true);
    expect(sweepVariantPair('step_preview')?.samplerNote).toBeUndefined();
  });

  it('reads the second strip of a pair as the setting the first one is', () => {
    // The chip under the frames has to say "Step 12" whichever of the two is on
    // show, so both parameters resolve onto the one entry that names them.
    expect(settingIdFor('step_preview_guess')).toBe('step_preview');
    expect(settingLabelKey('step_preview_guess')).toBe(
      settingLabelKey('step_preview'),
    );
    expect(settingLabelKey('step_preview')).not.toBe(
      SETTING_FALLBACK_LABEL_KEY,
    );
  });

  it('shows the QR workflow the strength strip rendered for it', () => {
    // The treatments have no control of their own, so they are filed under the
    // payload box that selects the workflow. The strength is a setting in its
    // own right, and the strip the workflow shows is the one rendered without a
    // detector, which the library picks out by control type.
    expect(settingSweepStrip('qr')).toBe('control_strength');
    expect(settingSweepStripControlType('qr')).toBeNull();
    expect(settingSweepAlsoStrips('qr')).toEqual([{ parameter: 'qr_style' }]);
    expect(settingIdFor('qr_style')).toBe('qr');
    expect(settingLabelKey('qr_style')).toBe(settingLabelKey('qr'));
  });

  it('reads control strength as its own setting, on a map it names', () => {
    expect(settingIdFor('control_strength')).toBe('control_strength');
    expect(settingSection('control_strength')).toBe('source');
    expect(settingLabelKey('control_strength')).toBe(
      settingTitleKey('control_strength'),
    );
    // Without a named mode the picker would offer the QR workflow's strip,
    // which is a different subject rendered from the same field.
    expect(settingSweepStrip('control_strength')).toBe('control_strength');
    expect(settingSweepStripControlType('control_strength')).toBe('canny');
  });

  it('has nothing to show for a setting no strip was rendered for', () => {
    expect(settingSweepStrip('webhook')).toBeNull();
    expect(settingSweepGrid('webhook')).toBeNull();
    expect(sweepVariantPair('not_a_setting')).toBeNull();
  });
});

describe('reference index', () => {
  it('groups every documented setting exactly once', () => {
    const grouped = SETTINGS_INDEX.flatMap((group) => group.ids);

    expect(grouped.length).toBe(documented.length);
    expect([...grouped].sort()).toEqual(
      documented.map((entry) => entry.id).sort(),
    );
  });

  it('leaves the settings the book has no page for out of the index', () => {
    const grouped = new Set(SETTINGS_INDEX.flatMap((group) => group.ids));

    expect(grouped.has('model')).toBe(false);
    expect(grouped.has('post')).toBe(false);
    // Embeddings used to sit here as an undocumented setting. They have a page
    // now, so the index has to list them like any other.
    expect(grouped.has('tis')).toBe(true);
    // The prompt box used to be one of these. It is a chapter now, so the
    // index has to list it like any other page the book holds.
    expect(grouped.has('prompt')).toBe(true);
  });

  it('lays the areas out in the order the control panel shows them', () => {
    expect(SETTINGS_INDEX.map((group) => group.section)).toEqual([
      'prompt',
      'model',
      'size',
      'source',
      'sampling',
      'finishing',
      'horde',
      'workflows',
    ]);
  });

  it('reads the prompt and size chapters in the order they were written', () => {
    // Both chapters run from the field the reader can see to the idea behind
    // it, so declaration order is reading order and the way onwards follows it.
    const ids = (section: string): readonly string[] =>
      SETTINGS_INDEX.find((group) => group.section === section)?.ids ?? [];

    expect(ids('prompt')).toEqual(['prompt', 'negative', 'prompt_emphasis']);
    // Hires fix follows, since it is the answer to going past the native size.
    expect(ids('size')).toEqual([
      'size',
      'native_resolution',
      'oversize',
      'hires',
      'hires_denoise',
    ]);
    // Native resolution and going past it are pages about ideas rather than
    // about rows of the panel, which is a page the book has without a note the
    // panel shows.
    expect(settingEntry('native_resolution')?.reference).toBeDefined();
  });

  it('groups each setting under its own section', () => {
    const misfiled = documented
      .map((entry) => entry.id)
      .filter((id) => groupOf(id) !== settingSection(id));

    expect(misfiled).toEqual([]);
  });

  it('walks neighbours in index order within a section', () => {
    const sampling =
      SETTINGS_INDEX.find((group) => group.section === 'sampling')?.ids ?? [];

    expect(settingNeighbours(sampling[1])).toEqual({
      previous: sampling[0],
      next: sampling[2],
    });
  });

  it('walks on across a section boundary rather than stopping at it', () => {
    const sequence = SETTINGS_INDEX.flatMap((group) => group.ids);
    const sampling =
      SETTINGS_INDEX.find((group) => group.section === 'sampling')?.ids ?? [];
    const first = sampling[0];
    const last = sampling[sampling.length - 1];

    // The entry before Sampling's first and after its last are both in other
    // areas, which is exactly the join the reader is walked over.
    expect(settingNeighbours(first).previous).toBe(
      sequence[sequence.indexOf(first) - 1],
    );
    expect(settingSection(settingNeighbours(first).previous ?? '')).not.toBe(
      'sampling',
    );
    expect(settingNeighbours(last).next).toBe(
      sequence[sequence.indexOf(last) + 1],
    );
    expect(settingSection(settingNeighbours(last).next ?? '')).not.toBe(
      'sampling',
    );
  });

  it('stops only at the two ends of the whole reference', () => {
    const sequence = SETTINGS_INDEX.flatMap((group) => group.ids);

    expect(settingNeighbours(sequence[0])).toEqual({
      previous: null,
      next: sequence[1],
    });
    expect(settingNeighbours(sequence[sequence.length - 1])).toEqual({
      previous: sequence[sequence.length - 2],
      next: null,
    });
    const dead = sequence.filter((id) => {
      const { previous, next } = settingNeighbours(id);
      return previous === null || next === null;
    });
    expect(dead).toEqual([sequence[0], sequence[sequence.length - 1]]);
  });

  it('has no neighbours for a setting the reference does not have', () => {
    expect(settingNeighbours('not_a_setting')).toEqual({
      previous: null,
      next: null,
    });
  });
});
