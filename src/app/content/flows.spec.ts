import { describe, expect, it } from 'vitest';
import {
  CONCEPT_FLOWS,
  FLOWS,
  flowDef,
  flowFollowable,
  flowSteps,
  isConceptFlow,
} from './flows';
import { SECTION_IDENTITIES } from './sections';
import { SETTING_FALLBACK_LABEL_KEY, settingLabelKey } from './settings';
import { DEFAULT_GENERATE_FORM_VALUE } from '../pages/generate/generate-form.model';
import { existsSync, readFileSync } from 'node:fs';

/** Where the evidence library's example manifest sits in a working checkout. */
const LIBRARY_MANIFEST =
  'docs/haidra-assets/assets/param-sweeps/tutorials/manifest.json';

/** The techniques, which are every flow that is not a concept track. */
const techniques = FLOWS.filter((flow) => !flow.concept);

describe('flow registry', () => {
  it('names each flow once', () => {
    expect(new Set(FLOWS.map((flow) => flow.id)).size).toBe(FLOWS.length);
  });

  it('names each step once within its own flow', () => {
    const repeated = FLOWS.filter(
      (flow) =>
        new Set(flow.steps.map((step) => step.id)).size !== flow.steps.length,
    ).map((flow) => flow.id);

    expect(repeated).toEqual([]);
  });

  it('files every flow that claims a section under one that exists', () => {
    const known = new Set(Object.keys(SECTION_IDENTITIES));
    const problems = FLOWS.filter(
      (flow) => flow.section !== undefined && !known.has(flow.section),
    ).map((flow) => flow.id);

    expect(problems).toEqual([]);
  });

  it('has a flow for every technique the published examples cover', () => {
    // Read from the evidence library on disk rather than from a fixture: the
    // question is whether the app describes something that was never generated,
    // and a fixture would only ever agree with itself. The library is published
    // rather than committed, so on a checkout without it there is nothing to
    // check and the invariant is the publish step's; the machine that renders
    // the assets is where this drifts and where this runs.
    const published = existsSync(LIBRARY_MANIFEST)
      ? (
          JSON.parse(readFileSync(LIBRARY_MANIFEST, 'utf8')) as {
            flows: { id: string }[];
          }
        ).flows.map((flow) => flow.id.replace(/--w[23]$/, ''))
      : [];
    const unauthored = [...new Set(published)].filter(
      (id) => flowDef(id) === undefined,
    );

    expect(unauthored).toEqual([]);
  });

  it('writes only fields the form actually holds', () => {
    const fields = new Set(Object.keys(DEFAULT_GENERATE_FORM_VALUE));
    const problems = FLOWS.flatMap((flow) =>
      flow.steps.flatMap((step) =>
        (step.applyFields ?? [])
          .filter((field) => !fields.has(field))
          .map((field) => `${flow.id}.${step.id} -> ${String(field)}`),
      ),
    );

    expect(problems).toEqual([]);
  });

  it('only offers Apply on a step that also points at the control', () => {
    // Writing a value into a row the reader is not being shown is a change they
    // did not see happen.
    const problems = FLOWS.flatMap((flow) =>
      flow.steps
        .filter((step) => step.applyFields?.length && !step.anchorId)
        .map((step) => `${flow.id}.${step.id}`),
    );

    expect(problems).toEqual([]);
  });

  it('names every strip it attaches in the vocabulary the studio uses', () => {
    // A step's strip is captioned with a chip, so a parameter the settings
    // registry cannot name would put "this 12" under the pictures.
    const unnamed = FLOWS.flatMap((flow) =>
      flow.steps
        .filter(
          (step) =>
            step.sweepParameter &&
            settingLabelKey(step.sweepParameter) === SETTING_FALLBACK_LABEL_KEY,
        )
        .map((step) => `${flow.id}.${step.id} -> ${step.sweepParameter}`),
    );

    expect(unnamed).toEqual([]);
  });

  it('hands off only to flows that exist', () => {
    const problems = FLOWS.flatMap((flow) =>
      flow.steps
        .filter((step) => step.startsFlow && !flowDef(step.startsFlow))
        .map((step) => `${flow.id}.${step.id} -> ${step.startsFlow}`),
    );

    expect(problems).toEqual([]);
  });
});

describe('concept tracks', () => {
  it('knows which flows are tracks', () => {
    expect(CONCEPT_FLOWS).toEqual(['concepts_images', 'concepts_horde']);
    for (const id of CONCEPT_FLOWS) {
      expect(isConceptFlow(id)).toBe(true);
    }
    expect(isConceptFlow('txt2img')).toBe(false);
    expect(isConceptFlow(null)).toBe(false);
    expect(isConceptFlow('not_a_flow')).toBe(false);
  });

  it('points at no field and writes none', () => {
    for (const id of CONCEPT_FLOWS) {
      for (const step of flowSteps(id)) {
        expect(step.anchorId).toBeUndefined();
        expect(step.applyFields).toBeUndefined();
        expect(step.helpTopic).toBeUndefined();
      }
    }
  });

  it('reads the images track in the order its pictures teach it', () => {
    // The render comes first and everything after it points back at something
    // the reader has already watched happen, so the order is pinned here rather
    // than left to whichever step was written first.
    expect(flowSteps('concepts_images').map((step) => step.id)).toEqual([
      'noise_to_picture',
      'prompt_as_conditioning',
      'what_a_model_is',
      'the_knobs',
      'why_it_differs',
      'try_it',
    ]);
  });

  it('hands the images track the evidence each of its steps is read against', () => {
    const attached = flowSteps('concepts_images')
      .filter((step) => step.sweepParameter)
      .map((step) => `${step.id}:${step.sweepParameter}`);

    expect(attached).toEqual([
      'noise_to_picture:step_preview',
      'the_knobs:steps',
      'why_it_differs:seed',
    ]);
  });

  it('ends each track by offering somewhere to go next', () => {
    for (const id of CONCEPT_FLOWS) {
      const steps = flowSteps(id);
      expect(steps[steps.length - 1].startsFlow).toBeTruthy();
    }
  });
});

describe('followability', () => {
  it('runs a track, which is read rather than performed', () => {
    for (const id of CONCEPT_FLOWS) {
      expect(flowFollowable(id)).toBe(true);
    }
  });

  it('runs a technique once its steps name the controls they are about', () => {
    expect(flowFollowable('txt2img')).toBe(true);
    // A technique whose steps are written but not yet wired is a page to read.
    // As each one is wired this list shrinks on its own; it is not a target.
    const unwired = techniques
      .filter((flow) => !flowFollowable(flow.id))
      .map((flow) => flow.id);

    for (const id of unwired) {
      expect(flowSteps(id).every((step) => !step.anchorId)).toBe(true);
    }
  });

  it('runs nothing for a flow that does not exist or has no steps', () => {
    expect(flowFollowable('not_a_flow')).toBe(false);
    expect(flowSteps('not_a_flow')).toEqual([]);
    // remix has no worked example: Stable Cascade had no workers when the
    // examples were made, so there are no steps to follow.
    expect(flowFollowable('remix')).toBe(false);
  });
});
