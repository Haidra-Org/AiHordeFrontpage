import { describe, expect, it } from 'vitest';
import {
  CIVITAI_BASE_MODELS_BY_BASELINE,
  CIVITAI_BASE_MODEL_GROUPS,
  SPLIT_BASELINE_TOKENS,
  baselineForCivitaiBaseModel,
  civitaiBaseModelMatchesBaseline,
  civitaiBaseModelsFor,
} from './civitai-base-models';
import { normalizeBaseline } from './model-reference.service';

describe('the CivitAI base-model table', () => {
  it('keys every row in the vocabulary the model reference produces', () => {
    // A key the reference could never emit is a row that can never match, and
    // nothing else in the app would say so.
    for (const baseline of Object.keys(CIVITAI_BASE_MODELS_BY_BASELINE)) {
      expect(normalizeBaseline(baseline)).toBe(baseline);
    }
  });

  it('files each label under one broad baseline, narrowing only through a split token', () => {
    const owners = new Map<string, string[]>();
    for (const [baseline, labels] of Object.entries(
      CIVITAI_BASE_MODELS_BY_BASELINE,
    )) {
      for (const label of labels) {
        owners.set(label, [...(owners.get(label) ?? []), baseline]);
      }
    }
    for (const [label, baselines] of owners) {
      const broad = baselines.filter(
        (baseline) => !SPLIT_BASELINE_TOKENS.includes(baseline),
      );
      // Two broad baselines claiming one label means a lookup would have to
      // guess, and the picker would filter to whichever came first.
      expect({ label, broad }).toEqual({ label, broad: broad.slice(0, 1) });
    }
  });

  it('names only baselines it also maps in its split-token list', () => {
    for (const token of SPLIT_BASELINE_TOKENS) {
      expect(CIVITAI_BASE_MODELS_BY_BASELINE[token]).toBeDefined();
    }
  });

  it('round-trips a label back to the broad baseline that serves it', () => {
    expect(baselineForCivitaiBaseModel('Pony')).toBe('stable_diffusion_xl');
    expect(baselineForCivitaiBaseModel('SD 1.5')).toBe('stable_diffusion_1');
    expect(baselineForCivitaiBaseModel('Stable Cascade')).toBe(
      'stable_cascade',
    );
    // Shared between the combined token and a split one; the combined wins.
    expect(baselineForCivitaiBaseModel('Flux.1 S')).toBe('flux_1');
    expect(baselineForCivitaiBaseModel('SD 2.1 768')).toBe(
      'stable_diffusion_2',
    );
  });

  it('has no opinion about a label it does not carry', () => {
    expect(baselineForCivitaiBaseModel('Other')).toBeNull();
    expect(baselineForCivitaiBaseModel('Chroma')).toBeNull();
    // Pony V7 is an AuraFlow-family model. Filing it with the SDXL Ponys would
    // recommend it for models that cannot load it.
    expect(baselineForCivitaiBaseModel('Pony V7')).toBeNull();
  });

  it('offers no filter for a baseline it does not know', () => {
    expect(civitaiBaseModelsFor(null)).toEqual([]);
    expect(civitaiBaseModelsFor('some_new_family')).toEqual([]);
    expect(civitaiBaseModelsFor('stable_cascade')).toEqual(['Stable Cascade']);
  });

  describe('matching a label against a baseline', () => {
    it('fails open whenever either side is unknown', () => {
      expect(civitaiBaseModelMatchesBaseline(undefined, 'flux_1')).toBe(true);
      expect(civitaiBaseModelMatchesBaseline('SD 1.5', null)).toBe(true);
      expect(civitaiBaseModelMatchesBaseline('SD 1.5', 'brand_new')).toBe(true);
      // A family the table has not learned about must not be warned against.
      expect(civitaiBaseModelMatchesBaseline('Other', 'flux_1')).toBe(true);
    });

    it('answers a genuine mismatch between two families it knows', () => {
      expect(
        civitaiBaseModelMatchesBaseline('Pony', 'stable_diffusion_1'),
      ).toBe(false);
      expect(
        civitaiBaseModelMatchesBaseline('SD 1.5', 'stable_diffusion_xl'),
      ).toBe(false);
      expect(
        civitaiBaseModelMatchesBaseline('Pony', 'stable_diffusion_xl'),
      ).toBe(true);
    });
  });

  it('groups every row for the selector', () => {
    expect(CIVITAI_BASE_MODEL_GROUPS).toHaveLength(
      Object.keys(CIVITAI_BASE_MODELS_BY_BASELINE).length,
    );
    expect(
      CIVITAI_BASE_MODEL_GROUPS.every((group) => group.labels.length > 0),
    ).toBe(true);
  });
});
