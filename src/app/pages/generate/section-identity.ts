/**
 * The eight areas of the control panel, and the icon, hue class and name each
 * one is known by wherever it is referred to.
 *
 * The studio talks about the same eight areas in four places: the panel's own
 * cards, the written guide, the follow-along steps and the `?` field notes.
 * Holding the identity here rather than at each surface is what keeps a reader
 * who learned "Sampling is the crimson dial" in the guide from meeting a
 * different glyph on the card it sent them to.
 */
export type SectionId =
  | 'prompt'
  | 'model'
  | 'size'
  | 'source'
  | 'sampling'
  | 'finishing'
  | 'horde'
  | 'workflows';

/** What a surface needs to render a section's mark and name. */
export interface SectionIdentity {
  /** Registry name of the section's duotone glyph. */
  icon: string;
  /** Hue-variable class, set on the element the identity should tint from. */
  className: string;
  /** `generate.sections.<id>`, the short name used beside the glyph. */
  labelKey: string;
}

const SECTION_IDS: readonly SectionId[] = [
  'prompt',
  'model',
  'size',
  'source',
  'sampling',
  'finishing',
  'horde',
  'workflows',
];

function identityFor(id: SectionId): SectionIdentity {
  return {
    icon: `sec-${id}`,
    className: `gs-sec--${id}`,
    labelKey: `generate.sections.${id}`,
  };
}

export const SECTION_IDENTITIES: Record<SectionId, SectionIdentity> =
  Object.fromEntries(SECTION_IDS.map((id) => [id, identityFor(id)])) as Record<
    SectionId,
    SectionIdentity
  >;

/**
 * The guide's reference sections, which are cut by help topic rather than by
 * card: `loras` is part of the model area, and post-processing and output are
 * both the finishing area.
 */
export const SECTION_BY_GUIDE_ID: Record<string, SectionId> = {
  source: 'source',
  sampling: 'sampling',
  loras: 'model',
  post: 'finishing',
  output: 'finishing',
  horde: 'horde',
  workflows: 'workflows',
};

/**
 * Tutorial step ids, across both authorings: the Learn page's per-flow step
 * lists and the follow-along engine's steps.
 *
 * Only steps that set a field in one of the panel's areas are listed. Pressing
 * Generate and reading the result are steps about the page rather than about a
 * card, so they map to nothing and take no mark.
 */
export const SECTION_BY_STEP_ID: Record<string, SectionId> = {
  prompt: 'prompt',
  model: 'model',
  size: 'size',
  source: 'source',
  mode: 'source',
  mask: 'source',
  denoise: 'source',
  control_type: 'source',
  sampling: 'sampling',
  steps: 'sampling',
  cfg: 'sampling',
  sampler: 'sampling',
  seed: 'sampling',
  facefixer: 'finishing',
  transparent: 'workflows',
  qr: 'workflows',
};

/**
 * Help topics, by the card their `?` glyph sits in. `batch` is the one topic
 * whose control lives in the footer rather than a card; it is filed with the
 * output settings, as the guide already lists it.
 */
export const SECTION_BY_HELP_TOPIC: Record<string, SectionId> = {
  loras: 'model',
  source_modes: 'source',
  denoise: 'source',
  requirements: 'sampling',
  steps: 'sampling',
  cfg: 'sampling',
  sampler: 'sampling',
  seed: 'sampling',
  clip_skip: 'sampling',
  karras: 'sampling',
  hires_fix: 'sampling',
  tiling: 'sampling',
  hires_denoise: 'sampling',
  upscaler: 'finishing',
  facefixer: 'finishing',
  facefixer_strength: 'finishing',
  nsfw: 'finishing',
  censor_nsfw: 'finishing',
  batch: 'finishing',
  trusted_workers: 'horde',
  slow_workers: 'horde',
  extra_slow_workers: 'horde',
  allow_downgrade: 'horde',
  replacement_filter: 'horde',
  webhook: 'horde',
  workers: 'horde',
  remember_extras: 'horde',
  transparent: 'workflows',
  qr: 'workflows',
};

const LOOKUPS: Record<'guide' | 'step' | 'help', Record<string, SectionId>> = {
  guide: SECTION_BY_GUIDE_ID,
  step: SECTION_BY_STEP_ID,
  help: SECTION_BY_HELP_TOPIC,
};

/**
 * The section a guide id, step id or help topic belongs to, or undefined where
 * it belongs to none: a caller renders no mark rather than a neutral one.
 */
export function sectionFor(
  kind: 'guide' | 'step' | 'help',
  id: string,
): SectionId | undefined {
  return LOOKUPS[kind][id];
}
