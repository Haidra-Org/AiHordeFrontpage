/**
 * The areas the creation tools are read in, and the icon, hue class and name
 * each one is known by wherever it is referred to.
 *
 * The studio talks about the same areas in four places: the panel's own cards,
 * the written guide, the follow-along steps and the `?` field notes. Holding
 * the identity here rather than at each surface is what keeps a reader who
 * learned "Sampling is the crimson dial" in the guide from meeting a different
 * glyph on the card it sent them to.
 *
 * Eight of them are cards of the image panel. The ninth, `alchemy`, is the
 * other studio taken whole: its operations are one family of work rather than
 * nine cards of one form, and giving it one identity is what lets its cards,
 * its `?` notes and its documentation wear the same mark the image areas do.
 *
 * Which area a *setting* belongs to is not here: a setting knows its own area,
 * and the registry in `./settings` is the one place that says so.
 */
export type SectionId =
  | 'prompt'
  | 'model'
  | 'size'
  | 'source'
  | 'sampling'
  | 'finishing'
  | 'horde'
  | 'workflows'
  | 'alchemy';

/** What a surface needs to render a section's mark and name. */
export interface SectionIdentity {
  /** Registry name of the section's duotone glyph. */
  icon: string;
  /** Hue-variable class, set on the element the identity should tint from. */
  className: string;
  /** `generate.sections.<id>`, the short name used beside the glyph. */
  labelKey: string;
}

/**
 * The areas that are cards of the image control panel, in the order the panel
 * shows them. Surfaces that mean "the parts of that panel" ask for these rather
 * than for every identity: the alchemy studio is an identity and is not a card
 * of the image form.
 */
export const PANEL_SECTION_IDS: readonly SectionId[] = [
  'prompt',
  'model',
  'size',
  'source',
  'sampling',
  'finishing',
  'horde',
  'workflows',
];

export const SECTION_IDS: readonly SectionId[] = [
  ...PANEL_SECTION_IDS,
  'alchemy',
];

function buildIdentity(id: SectionId): SectionIdentity {
  return {
    icon: `sec-${id}`,
    className: `gs-sec--${id}`,
    labelKey: `generate.sections.${id}`,
  };
}

export const SECTION_IDENTITIES: Record<SectionId, SectionIdentity> =
  Object.fromEntries(
    SECTION_IDS.map((id) => [id, buildIdentity(id)]),
  ) as Record<SectionId, SectionIdentity>;

/**
 * The guide's reference sections, which are cut by help topic rather than by
 * card: `loras` is part of the model area, post-processing and output are both
 * the finishing area, and the Dimensions card is the size area under the name
 * the panel prints on it.
 */
export const SECTION_BY_GUIDE_ID: Record<string, SectionId> = {
  prompt: 'prompt',
  dimensions: 'size',
  source: 'source',
  sampling: 'sampling',
  loras: 'model',
  post: 'finishing',
  output: 'finishing',
  horde: 'horde',
  workflows: 'workflows',
};

/**
 * Tutorial step ids, across both authorings: the worked example's step spine and
 * the follow-along engine's steps.
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
  extras: 'source',
  denoise: 'source',
  control_type: 'source',
  steps: 'sampling',
  cfg: 'sampling',
  sampler: 'sampling',
  seed: 'sampling',
  facefixer: 'finishing',
  transparent: 'workflows',
  qr: 'workflows',
};

const LOOKUPS: Record<'guide' | 'step', Record<string, SectionId>> = {
  guide: SECTION_BY_GUIDE_ID,
  step: SECTION_BY_STEP_ID,
};

/**
 * The section a guide id or a tutorial step id belongs to, or undefined where it
 * belongs to none: a caller renders no mark rather than a neutral one.
 *
 * Settings are not looked up here. They carry their own section in the settings
 * registry, so `settingSection` is what asks that question.
 */
export function sectionFor(
  kind: 'guide' | 'step',
  id: string,
): SectionId | undefined {
  return LOOKUPS[kind][id];
}

/**
 * The mark and hue of a section, for the many surfaces that hold a possibly
 * absent section and want a possibly absent identity. Written once here because
 * every one of them was writing the same conditional.
 */
export function sectionIdentity(
  section: SectionId | undefined | null,
): SectionIdentity | null {
  return section ? SECTION_IDENTITIES[section] : null;
}
