/** Null marks a baseline whose catalog compatibility is explicitly unknown. */
export type CivitaiBaseModelMap = Readonly<
  Record<string, readonly string[] | null>
>;

/**
 * The CivitAI base-model labels whose LoRAs each horde baseline can load.
 *
 * The table lives here because this site is its only reader and the CivitAI
 * vocabulary changes at CivitAI's pace. The model reference does not publish it.
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
  moss_image: ['MOSS Image'],
  // CivitAI files Z-Image LoRAs under two labels. Only the Turbo one is listed
  // because the horde serves Turbo, and Base LoRAs have not been shown to load
  // on it.
  z_image_turbo: ['ZImageTurbo'],
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
  mapping: CivitaiBaseModelMap = CIVITAI_BASE_MODELS_BY_BASELINE,
): readonly string[] {
  if (baseline === null || !Object.hasOwn(mapping, baseline)) {
    return [];
  }
  return mapping[baseline] ?? [];
}

/**
 * The baseline a CivitAI label implies, or null when the table has no opinion.
 * A shared label answers with its combined token rather than a split one, so a
 * reverse lookup never invents a distinction the label does not carry.
 */
export function baselineForCivitaiBaseModel(
  label: string,
  mapping: CivitaiBaseModelMap = CIVITAI_BASE_MODELS_BY_BASELINE,
): string | null {
  let fallback: string | null = null;
  for (const [baseline, labels] of Object.entries(mapping)) {
    if (!labels?.includes(label)) {
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
  mapping: CivitaiBaseModelMap = CIVITAI_BASE_MODELS_BY_BASELINE,
): boolean {
  if (!label || baseline === null) {
    return true;
  }
  const labels = Object.hasOwn(mapping, baseline) ? mapping[baseline] : null;
  if (labels == null) {
    return true;
  }
  if (baselineForCivitaiBaseModel(label, mapping) === null) {
    return true;
  }
  return labels.includes(label);
}

/** One group per baseline, for the picker's base-model selector. */
export function civitaiBaseModelGroups(mapping: CivitaiBaseModelMap) {
  return Object.entries(mapping).flatMap(([baseline, labels]) =>
    labels?.length ? [{ baseline, labels }] : [],
  );
}
