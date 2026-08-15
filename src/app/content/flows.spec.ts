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
      flow.steps.flatMap((step) =>
        (step.sweepParameters ?? [])
          .filter(
            (parameter) =>
              settingLabelKey(parameter) === SETTING_FALLBACK_LABEL_KEY,
          )
          .map((parameter) => `${flow.id}.${step.id} -> ${parameter}`),
      ),
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
      .filter((step) => step.sweepParameters?.length)
      .map((step) => `${step.id}:${step.sweepParameters!.join('+')}`);

    // The knobs step names both of them: a reader being shown what "the knobs"
    // are learns only half of it from one strip.
    expect(attached).toEqual([
      'noise_to_picture:step_preview',
      'the_knobs:steps+cfg_scale',
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

describe('the techniques that work from a source image', () => {
  const SOURCED = ['img2img', 'inpainting', 'controlnet', 'remix'];

  /** The controls the panel only draws under one of the source modes. */
  const GATED_BY: Record<string, readonly string[]> = {
    denoise: ['img2img', 'controlnet'],
    control_type: ['controlnet'],
    mask: ['inpainting'],
    remix_extras: ['remix'],
  };

  it('points every step at a control, so the pane can run them', () => {
    for (const id of SOURCED) {
      expect(flowFollowable(id)).toBe(true);
      for (const step of flowSteps(id)) {
        expect(step.anchorId, `${id}.${step.id}`).toBeTruthy();
      }
    }
  });

  it('narrates the picture rather than claiming to write it', () => {
    // The source image is a blob the reader attaches; the committed request
    // carries it as base64 the form value never holds. Same for the mask, which
    // is painted onto a canvas rather than set, and for remix's references,
    // whose blobs and weights live on the request alone.
    for (const id of SOURCED) {
      const first = flowSteps(id)[0];
      expect(first.id).toBe('source');
      expect(first.applyFields).toBeUndefined();
    }
    const mask = flowSteps('inpainting').find((step) => step.id === 'mask');
    expect(mask?.anchorId).toBe('mask');
    expect(mask?.applyFields).toBeUndefined();
    const extras = flowSteps('remix').find((step) => step.id === 'extras');
    expect(extras?.anchorId).toBe('remix_extras');
    expect(extras?.applyFields).toBeUndefined();
  });

  it('opens the panel and the mode each control lives under', () => {
    // The source card is advanced-only, and the strength, the control type and
    // the brush each exist only under one of the modes.
    const problems = SOURCED.flatMap((id) =>
      flowSteps(id)
        .filter((step) => GATED_BY[step.anchorId ?? ''])
        .filter(
          (step) =>
            step.reveal?.mode !== 'advanced' ||
            !GATED_BY[step.anchorId!].includes(step.reveal.sourceMode ?? ''),
        )
        .map((step) => `${id}.${step.id}`),
    );

    expect(problems).toEqual([]);
  });

  it('takes the source mode from the example rather than restating it', () => {
    for (const id of SOURCED) {
      const mode = flowSteps(id).find((step) => step.id === 'mode');
      expect(mode?.applyFields).toEqual(['sourceMode']);
    }
  });
});

describe('the techniques that live in the workflow and finishing cards', () => {
  it('runs the transparent flow off the one switch that makes it', () => {
    expect(flowSteps('transparent').map((step) => step.id)).toEqual([
      'prompt',
      'transparent',
      'model',
      'size',
      'generate',
    ]);
    const toggle = flowSteps('transparent').find(
      (step) => step.id === 'transparent',
    );
    expect(toggle?.anchorId).toBe('transparent');
    expect(toggle?.applyFields).toEqual(['transparent']);
    expect(toggle?.reveal).toEqual({ mode: 'advanced' });
  });

  it('writes the QR payload, and the sampling recipe as one set', () => {
    expect(flowSteps('qr_code').map((step) => step.id)).toEqual([
      'prompt',
      'qr',
      'model',
      'size',
      'cfg',
      'generate',
    ]);
    const qr = flowSteps('qr_code').find((step) => step.id === 'qr');
    expect(qr?.anchorId).toBe('qr');
    // Typing the payload is what selects the workflow, so the text is all there
    // is to write: control_strength has no control in the panel to point at.
    expect(qr?.applyFields).toEqual(['qrText']);
    const recipe = flowSteps('qr_code').find((step) => step.id === 'cfg');
    expect(recipe?.applyFields).toEqual([
      'cfg_scale',
      'steps',
      'sampler_name',
      'karras',
    ]);
  });

  it('turns the face fixer and its strength on together', () => {
    expect(flowSteps('facefix').map((step) => step.id)).toEqual([
      'prompt',
      'model',
      'size',
      'generate_before',
      'facefixer',
      'regenerate',
    ]);
    const fixer = flowSteps('facefix').find((step) => step.id === 'facefixer');
    expect(fixer?.anchorId).toBe('facefixer');
    // The strength row does not exist until a fixer is picked, so one without
    // the other would send the reader after a slider that had just appeared.
    expect(fixer?.applyFields).toEqual([
      'post_processing',
      'facefixer_strength',
    ]);
    // Both runs of the pair press the same button, and neither writes anything.
    for (const id of ['generate_before', 'regenerate']) {
      const step = flowSteps('facefix').find((entry) => entry.id === id);
      expect(step?.anchorId).toBe('generate');
      expect(step?.applyFields).toBeUndefined();
    }
  });

  it('reads remix down the same spine as the other sourced flows', () => {
    expect(flowSteps('remix').map((step) => step.id)).toEqual([
      'source',
      'mode',
      'extras',
      'prompt',
      'model',
      'generate',
    ]);
    const model = flowSteps('remix').find((step) => step.id === 'model');
    expect(model?.applyFields).toEqual(['model', 'width', 'height']);
  });
});

describe('followability', () => {
  it('runs a track, which is read rather than performed', () => {
    for (const id of CONCEPT_FLOWS) {
      expect(flowFollowable(id)).toBe(true);
    }
  });

  it('runs every technique the app teaches', () => {
    const unwired = techniques
      .filter((flow) => !flowFollowable(flow.id))
      .map((flow) => flow.id);

    expect(unwired).toEqual([]);
    // Followability is derived from the steps rather than declared, so this
    // holds by every technique naming the controls its steps are about.
    for (const flow of techniques) {
      for (const step of flow.steps) {
        expect(step.anchorId, `${flow.id}.${step.id}`).toBeTruthy();
      }
    }
  });

  it('runs nothing for a flow that does not exist or has no steps', () => {
    expect(flowFollowable('not_a_flow')).toBe(false);
    expect(flowSteps('not_a_flow')).toEqual([]);
  });
});
