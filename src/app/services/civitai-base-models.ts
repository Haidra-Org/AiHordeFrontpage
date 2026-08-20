/**
 * Which CivitAI base-model labels a horde model baseline can actually serve.
 *
 * Two different kinds of data meet here and only one of them belongs in this
 * file. The *vocabulary* — which label strings CivitAI publishes — is CivitAI's
 * and changes without notice, so it is read from the live enums endpoint rather
 * than written down. The *mapping* below is a judgement about model
 * architecture that no endpoint publishes: `Pony` serves an SDXL-baseline model
 * because Pony Diffusion V6 XL is an SDXL finetune, and nothing in any API
 * response says so.
 */

/**
 * Normalised horde baseline -> the CivitAI `baseModel` labels it can serve.
 *
 * Keys are what {@link normalizeBaseline} produces, not a closed enum: the live
 * model reference decides the vocabulary and has grown before. A baseline absent
 * from this table means "no opinion", which is why every reader fails open.
 *
 * Labels deliberately mapped nowhere, because the horde has no baseline for
 * them: `Pony V7` (an AuraFlow-family model, so filing it under SDXL would be
 * actively wrong), `SD 3`, `SD 3.5*`, `Chroma`, `HiDream`, `PixArt a`,
 * `PixArt E`, `Playground v2`, `AuraFlow`, `Kolors`, `Lumina`, `Other`, and
 * every video or audio family. That is the correct resting state for them, not
 * an omission for a later reader to complete by guesswork.
 */
export const CIVITAI_BASE_MODELS_BY_BASELINE: Readonly<
  Record<string, readonly string[]>
> = {
  stable_diffusion_1: ['SD 1.5', 'SD 1.5 LCM', 'SD 1.5 Hyper', 'SD 1.4'],
  // The live image reference publishes the unsplit `stable diffusion 2` for its
  // SD 2 models, while the sweep library's vocabulary distinguishes the two
  // training resolutions. Both spellings are answered so neither source loses
  // its default filter.
  stable_diffusion_2: [
    'SD 2.0',
    'SD 2.1',
    'SD 2.0 768',
    'SD 2.1 768',
    'SD 2.1 Unclip',
  ],
  stable_diffusion_2_512: ['SD 2.0', 'SD 2.1', 'SD 2.1 Unclip'],
  stable_diffusion_2_768: ['SD 2.0 768', 'SD 2.1 768'],
  // Pony, Illustrious and NoobAI are SDXL finetunes and together carry far more
  // of the catalogue than plain `SDXL 1.0`, so a row naming only the base
  // release would hide most of what an SDXL model can actually load.
  stable_diffusion_xl: [
    'SDXL 1.0',
    'Pony',
    'Illustrious',
    'NoobAI',
    'SDXL 1.0 LCM',
    'SDXL Lightning',
    'SDXL Hyper',
    'SDXL Turbo',
    'SDXL Distilled',
    'SDXL 0.9',
  ],
  stable_cascade: ['Stable Cascade'],
  flux_1: ['Flux.1 D', 'Flux.1 S', 'Flux.1 Krea', 'Flux.1 Kontext'],
  // Not in the image reference today, but the studio already names these in
  // FLOW_SHIFT_BASELINES, so answering them now costs nothing and stops the
  // table needing a second visit when the reference grows.
  flux_dev: ['Flux.1 D', 'Flux.1 Krea', 'Flux.1 Kontext'],
  flux_schnell: ['Flux.1 S'],
  qwen_image: ['Qwen'],
};

/**
 * Baselines that name a narrower slice of a family another key already covers.
 * A reverse lookup prefers the broader token, so a label shared between the two
 * never invents a distinction it does not carry.
 */
export const SPLIT_BASELINE_TOKENS: readonly string[] = [
  'flux_dev',
  'flux_schnell',
  'stable_diffusion_2_512',
  'stable_diffusion_2_768',
];

/** The labels to search when a baseline is known; empty means "do not filter". */
export function civitaiBaseModelsFor(
  baseline: string | null,
): readonly string[] {
  if (baseline === null) {
    return [];
  }
  return CIVITAI_BASE_MODELS_BY_BASELINE[baseline] ?? [];
}

/**
 * The baseline a CivitAI label implies, or null when the table has no opinion.
 * A shared label answers with its combined token rather than a split one, so a
 * reverse lookup never invents a distinction the label does not carry.
 */
export function baselineForCivitaiBaseModel(label: string): string | null {
  let fallback: string | null = null;
  for (const [baseline, labels] of Object.entries(
    CIVITAI_BASE_MODELS_BY_BASELINE,
  )) {
    if (!labels.includes(label)) {
      continue;
    }
    if (!SPLIT_BASELINE_TOKENS.includes(baseline)) {
      return baseline;
    }
    fallback ??= baseline;
  }
  return fallback;
}

/**
 * Whether a LoRA published for `label` can serve a model on `baseline`.
 *
 * Fails open on either side being unknown, matching the contract the model
 * reference's own capability helpers set: gating exists to steer someone away
 * from a combination that will not work, so a label the table has not learned
 * about must not produce a warning against a model it may well suit.
 */
export function civitaiBaseModelMatchesBaseline(
  label: string | undefined,
  baseline: string | null,
): boolean {
  if (!label || baseline === null) {
    return true;
  }
  const labels = CIVITAI_BASE_MODELS_BY_BASELINE[baseline];
  if (labels === undefined) {
    return true;
  }
  if (baselineForCivitaiBaseModel(label) === null) {
    return true;
  }
  return labels.includes(label);
}

/** One group per baseline, for the picker's base-model selector. */
export const CIVITAI_BASE_MODEL_GROUPS: readonly {
  baseline: string;
  labels: readonly string[];
}[] = Object.entries(CIVITAI_BASE_MODELS_BY_BASELINE).map(
  ([baseline, labels]) => ({ baseline, labels }),
);
