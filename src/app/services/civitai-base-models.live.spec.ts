import { describe, expect, it } from 'vitest';
import live from '../testing/fixtures/civitai-enums.stub.json';
import { CIVITAI_BASE_MODELS_BY_BASELINE } from './civitai-base-models';

/**
 * CivitAI does not validate the `baseModels` search parameter: a label it has
 * never heard of returns an empty page rather than an error. A typo in the
 * table is therefore invisible at runtime and shows up only as a picker that
 * finds nothing. This reads a captured `/api/v1/enums` response so a label that
 * was mistyped, or retired upstream, says so here.
 */
describe('the base-model table against the published CivitAI vocabulary', () => {
  const published = new Set<string>(live.BaseModel);

  it('names only labels CivitAI publishes', () => {
    const unknown = [
      ...new Set(Object.values(CIVITAI_BASE_MODELS_BY_BASELINE).flat()),
    ]
      .filter((label) => !published.has(label))
      .sort();

    expect(unknown).toEqual([]);
  });

  it('reads the vocabulary it is checking against', () => {
    // Guards the assertion above against a fixture that parsed to nothing,
    // which would let every label pass.
    expect(published.size).toBeGreaterThan(50);
    expect(published.has('SD 1.5')).toBe(true);
  });

  it('leaves the families the horde has no baseline for unmapped', () => {
    const mapped = new Set(
      Object.values(CIVITAI_BASE_MODELS_BY_BASELINE).flat(),
    );
    // Each of these is a real CivitAI family with no horde counterpart. Mapping
    // one would filter the picker to a family no worker can serve.
    for (const label of ['Pony V7', 'SD 3.5', 'Chroma', 'HiDream', 'Other']) {
      expect({ label, mapped: mapped.has(label) }).toEqual({
        label,
        mapped: false,
      });
    }
  });

  it('still lists DoRA as a type the LoRA path can load', () => {
    // The service searches LORA + LoCon + DoRA; a vocabulary that dropped one
    // would silently narrow every search.
    for (const type of ['LORA', 'LoCon', 'DoRA', 'TextualInversion']) {
      expect(live.ModelType).toContain(type);
    }
  });
});
