import { GenerateFormValue } from '../pages/generate/generate-form.model';
import { SectionId, SECTION_IDS } from './sections';

/**
 * A setting's value, in the type the API takes it in. Numbers stay numbers and
 * flags stay flags all the way to the surface that renders them: a value that
 * has been turned into a string somewhere upstream has already lost the one
 * thing a reader needs it to keep, which is what kind of thing it is.
 */
export type SettingValue = string | number | boolean;

/** Which way a setting moves the wait, as the reader turns it up or on. */
export type SettingSpeed = 'faster' | 'slower' | 'varies';

/** Which way a setting moves the kudos cost, as the reader turns it up or on. */
export type SettingKudos = 'cheaper' | 'costlier' | 'varies';

/**
 * What a setting costs, where the cost is known and points one way. Every field
 * is optional and the whole record is absent on the settings that trade nothing:
 * an empty meta-line is worse than no meta-line, and a guessed one is worse
 * still.
 */
export interface SettingTradeoffs {
  speed?: SettingSpeed;
  kudos?: SettingKudos;
  /** Full i18n key of one line about what the setting does to the picture. */
  quality?: string;
}

/**
 * The numbers a control is bounded and usually set to. `min` and `max` are the
 * form's own bounds, so they are read off the panel rather than off the API.
 *
 * `typical` is a display string because the useful answer is often a band
 * ("20-40") rather than a number. Where the help prose gives no band, it carries
 * the form's default instead, and `default` is then left off: two chips saying
 * the same number is noise.
 */
export interface SettingRange {
  min?: number;
  max?: number;
  typical: string;
  default?: string;
}

/**
 * A value the reference offers to put in the form on the reader's say-so.
 *
 * `fields` is written exactly as the form holds it, so a chip can never offer
 * something the panel would reject and no code has to translate between the two
 * vocabularies. `display` is the number the chip reads back, and `anchorId` the
 * {@link TutorialAnchorService} id of the row that lights up when it lands: the
 * whole point of a try-it chip is seeing where the value went.
 */
export interface SettingApply {
  display: string;
  anchorId: string;
  fields: Partial<GenerateFormValue>;
}

/** A way out of the reference to somewhere else in the site. */
export interface SettingLink {
  labelKey: string;
  routerLink: string;
}

/**
 * The written reference's half of a setting: everything a page about it needs
 * beyond its name. Present only on the settings the book has a page for, which
 * is what every surface asking "is there more to read about this" tests.
 */
export interface SettingReference {
  tradeoffs?: SettingTradeoffs;
  range?: SettingRange;
  /**
   * Values the reader can put in the form from the entry. Only authored where
   * the prose already names a number: a chip offering a value the reference
   * never argued for would be the reference guessing on the reader's behalf.
   */
  applies?: readonly SettingApply[];
  /** Other settings worth reading next, by id. */
  related?: readonly string[];
  links?: readonly SettingLink[];
  /**
   * Dictionary terms this entry leans on, by {@link GLOSSARY_TERMS} id. Only the
   * horde's own vocabulary: a setting explained in ordinary words needs no
   * glossary, and a reader sent to a definition of what they are already reading
   * has been sent in a circle.
   */
  glossaryTerms?: readonly string[];
}

/**
 * Which published strips illustrate a setting. The names are the library's own
 * parameter names, which are API field names, because the library is generated
 * against the API rather than against this app.
 */
export interface SettingSweeps {
  /** The strip that shows the setting changing across its range. */
  strip?: string;
  /**
   * The two-axis plate offered beside the strip. A grid answers "how does this
   * interact with the setting next to it", which is a second question rather
   * than a fuller answer to the first, so two settings can share one plate.
   */
  grid?: string;
  /**
   * The second strip the same setting can be read on, offered as a choice.
   * Steps behave differently depending on whether the sampler re-rolls the
   * detail on every change or settles towards one picture, and one strip can
   * only show one of those.
   */
  variant?: string;
}

/**
 * One setting, as the whole studio knows it.
 *
 * This is the single registry behind the chips on a worked example, the caption
 * under a sweep, the headers of a grid plate, the metadata panel's rows, the
 * panel's `?` notes and the written reference. A setting cannot come to wear one
 * glyph in one place and another somewhere else, be called "Guidance" here and
 * "CFG" there, or have a page in the book that the panel does not know about.
 *
 * The id is the studio's own short name for the setting, and it is *also* the
 * help topic and the reference page's slug. Those used to be three vocabularies
 * with maps between them; they are one now, and the API's field names are
 * aliases onto it (see {@link SETTING_ID_BY_PARAMETER}).
 */
export interface SettingEntry {
  id: string;
  /** The panel area the setting lives in, for its glyph and hue. */
  section: SectionId;
  /**
   * The short name that sits beside the value in a chip. Defaults to the `?`
   * note's own title, which is already the field's short name; it is overridden
   * only where a chip needs to be terser than a note's heading.
   */
  labelKey?: string;
  /**
   * The name for prose that says the setting mid-sentence, where the chip name
   * is too terse to read as English. Absent where the two are the same word.
   */
  proseLabelKey?: string;
  reference?: SettingReference;
  sweeps?: SettingSweeps;
}

/** Where a reader goes to see what a model is and what it suggests. */
const MODELS_LINK: SettingLink = {
  labelKey: 'generate.reference.link_models',
  routerLink: '/details/models',
};

/**
 * Every setting the studio names or explains, in the order the reference reads
 * them: by section, and within a section in the order the panel shows them.
 *
 * Bounds and defaults are the form's, taken from `generate-form.model.ts` and
 * the panel's own sliders. Nothing here states a behaviour the help prose does
 * not already state.
 *
 * A setting with no `reference` is one the studio can name but the book has no
 * page for: the prompt itself, the model, the list of textual inversions. A
 * setting with no `labelKey` is named by its `?` note's title.
 */
export const SETTINGS: readonly SettingEntry[] = [
  // --- prompt ---
  { id: 'prompt', section: 'prompt', labelKey: 'generate.sections.prompt' },
  {
    id: 'negative',
    section: 'prompt',
    labelKey: 'generate.form.negative_prompt_label',
  },
  {
    id: 'prompt_emphasis',
    section: 'prompt',
    labelKey: 'generate.sweeps.param_prompt_emphasis',
  },

  // --- model ---
  {
    id: 'model',
    section: 'model',
    labelKey: 'generate.tutorials.recipe_model',
  },
  {
    id: 'loras',
    section: 'model',
    reference: {
      range: { min: -5, max: 5, typical: '1' },
      related: ['requirements'],
      links: [MODELS_LINK],
    },
  },
  { id: 'tis', section: 'model', labelKey: 'generate.results.meta_row_tis' },

  // --- size ---
  { id: 'size', section: 'size', labelKey: 'generate.tutorials.recipe_size' },

  // --- source image ---
  {
    id: 'source',
    section: 'source',
    labelKey: 'generate.sections.source',
    reference: { related: ['denoise'] },
  },
  {
    id: 'denoise',
    section: 'source',
    labelKey: 'generate.tutorials.recipe_denoise',
    proseLabelKey: 'generate.help.denoise.title',
    reference: {
      range: { min: 0.01, max: 1, typical: '0.75' },
      applies: [
        {
          display: '0.75',
          anchorId: 'denoise',
          fields: { denoising_strength: 0.75 },
        },
      ],
      related: ['source', 'hires_denoise'],
    },
    sweeps: { strip: 'denoising_strength' },
  },

  // --- sampling ---
  {
    id: 'steps',
    section: 'sampling',
    labelKey: 'generate.tutorials.recipe_steps',
    reference: {
      tradeoffs: {
        speed: 'slower',
        kudos: 'costlier',
        quality: 'generate.reference.quality_steps',
      },
      range: { min: 1, max: 500, typical: '20-40', default: '25' },
      // The ends of the band the prose names, rather than a midpoint nothing
      // states: the useful comparison is the cheap setting against the dear one.
      applies: [
        { display: '20', anchorId: 'steps', fields: { steps: 20 } },
        { display: '40', anchorId: 'steps', fields: { steps: 40 } },
      ],
      related: ['cfg', 'sampler', 'requirements'],
    },
    sweeps: {
      strip: 'steps',
      grid: 'steps_cfg_grid',
      variant: 'steps_converging',
    },
  },
  {
    id: 'cfg',
    section: 'sampling',
    labelKey: 'generate.tutorials.recipe_cfg',
    proseLabelKey: 'generate.help.cfg.title',
    reference: {
      tradeoffs: { quality: 'generate.reference.quality_cfg' },
      range: { min: 0, max: 100, typical: '5-10', default: '7.5' },
      applies: [
        { display: '5', anchorId: 'cfg', fields: { cfg_scale: 5 } },
        { display: '10', anchorId: 'cfg', fields: { cfg_scale: 10 } },
      ],
      related: ['steps', 'sampler', 'requirements'],
    },
    sweeps: { strip: 'cfg_scale', grid: 'steps_cfg_grid' },
  },
  {
    id: 'sampler',
    section: 'sampling',
    labelKey: 'generate.tutorials.recipe_sampler',
    reference: {
      tradeoffs: {
        speed: 'varies',
        quality: 'generate.reference.quality_sampler',
      },
      related: ['steps', 'karras', 'requirements'],
    },
    sweeps: { strip: 'sampler', grid: 'sampler_steps_grid' },
  },
  {
    id: 'seed',
    section: 'sampling',
    labelKey: 'generate.tutorials.recipe_seed',
    reference: { related: ['batch'] },
    sweeps: { strip: 'seed' },
  },
  {
    id: 'clip_skip',
    section: 'sampling',
    reference: {
      range: { min: 1, max: 12, typical: '1-2', default: '1' },
      applies: [
        { display: '1', anchorId: 'clip_skip', fields: { clip_skip: 1 } },
        { display: '2', anchorId: 'clip_skip', fields: { clip_skip: 2 } },
      ],
      related: ['requirements'],
    },
    sweeps: { strip: 'clip_skip' },
  },
  {
    id: 'karras',
    section: 'sampling',
    labelKey: 'generate.tutorials.recipe_karras',
    proseLabelKey: 'generate.help.karras.title',
    reference: {
      tradeoffs: { quality: 'generate.reference.quality_karras' },
      related: ['sampler', 'steps', 'requirements'],
    },
    sweeps: { strip: 'karras', grid: 'karras_grid' },
  },
  {
    id: 'hires',
    section: 'sampling',
    labelKey: 'generate.tutorials.recipe_hires',
    reference: {
      tradeoffs: {
        speed: 'slower',
        kudos: 'costlier',
        quality: 'generate.reference.quality_hires_fix',
      },
      related: ['hires_denoise', 'upscaler'],
    },
    sweeps: { strip: 'hires_fix', grid: 'hires_grid' },
  },
  {
    id: 'hires_denoise',
    section: 'sampling',
    reference: {
      range: { min: 0.01, max: 1, typical: '0.65' },
      // The slider only exists while hires fix is on, so the chip turns it on:
      // writing a value into a control the reader cannot see is not an offer.
      applies: [
        {
          display: '0.65',
          anchorId: 'hires_denoise',
          fields: { hires_fix: true, hires_fix_denoising_strength: 0.65 },
        },
      ],
      related: ['hires', 'denoise'],
    },
  },
  {
    id: 'tiling',
    section: 'sampling',
    reference: {},
    sweeps: { strip: 'tiling' },
  },
  {
    id: 'requirements',
    section: 'sampling',
    reference: {
      related: ['steps', 'cfg', 'sampler', 'clip_skip', 'karras'],
      links: [MODELS_LINK],
    },
  },

  // --- finishing ---
  {
    id: 'post',
    section: 'finishing',
    labelKey: 'generate.tutorials.recipe_post',
  },
  {
    id: 'upscaler',
    section: 'finishing',
    reference: {
      tradeoffs: {
        speed: 'slower',
        kudos: 'costlier',
        quality: 'generate.reference.quality_upscaler',
      },
      related: ['hires', 'facefixer'],
    },
  },
  {
    id: 'facefixer',
    section: 'finishing',
    reference: {
      tradeoffs: {
        speed: 'slower',
        kudos: 'costlier',
        quality: 'generate.reference.quality_facefixer',
      },
      related: ['facefixer_strength', 'upscaler'],
    },
  },
  {
    id: 'facefixer_strength',
    section: 'finishing',
    reference: {
      range: { min: 0, max: 1, typical: '0.75' },
      applies: [
        {
          display: '0.75',
          anchorId: 'facefixer_strength',
          fields: { facefixer_strength: 0.75 },
        },
      ],
      related: ['facefixer'],
    },
  },
  {
    id: 'batch',
    section: 'finishing',
    labelKey: 'generate.tutorials.recipe_batch',
    proseLabelKey: 'generate.help.batch.title',
    reference: {
      tradeoffs: { speed: 'slower', kudos: 'costlier' },
      range: { min: 1, max: 10, typical: '1' },
      related: ['seed', 'qr'],
      glossaryTerms: ['kudos'],
    },
  },
  {
    id: 'nsfw',
    section: 'finishing',
    reference: {
      related: ['censor_nsfw', 'replacement_filter'],
      glossaryTerms: ['nsfw'],
    },
  },
  {
    id: 'censor_nsfw',
    section: 'finishing',
    reference: { related: ['nsfw'], glossaryTerms: ['nsfw'] },
  },

  // --- horde ---
  {
    id: 'trusted_workers',
    section: 'horde',
    reference: {
      tradeoffs: { speed: 'slower' },
      related: ['slow_workers', 'workers'],
      glossaryTerms: ['worker', 'trusted'],
    },
  },
  {
    id: 'slow_workers',
    section: 'horde',
    reference: {
      related: ['extra_slow_workers', 'trusted_workers'],
      glossaryTerms: ['worker', 'queue'],
    },
  },
  {
    id: 'extra_slow_workers',
    section: 'horde',
    reference: {
      tradeoffs: { speed: 'slower' },
      related: ['slow_workers', 'allow_downgrade'],
      glossaryTerms: ['worker', 'queue'],
    },
  },
  {
    id: 'allow_downgrade',
    section: 'horde',
    reference: {
      related: ['steps', 'extra_slow_workers'],
      glossaryTerms: ['worker', 'kudos'],
    },
  },
  {
    id: 'replacement_filter',
    section: 'horde',
    reference: { related: ['nsfw'] },
  },
  {
    id: 'webhook',
    section: 'horde',
    reference: { related: ['remember_extras'] },
  },
  {
    id: 'workers',
    section: 'horde',
    reference: { related: ['trusted_workers', 'remember_extras'] },
  },
  {
    id: 'remember_extras',
    section: 'horde',
    reference: { related: ['webhook', 'workers'] },
  },

  // --- workflows ---
  {
    id: 'transparent',
    section: 'workflows',
    reference: { related: ['upscaler'] },
  },
  { id: 'qr', section: 'workflows', reference: { related: ['batch'] } },
];

const SETTING_BY_ID: ReadonlyMap<string, SettingEntry> = new Map(
  SETTINGS.map((entry) => [entry.id, entry]),
);

/**
 * The API's field names, and the sweep library's parameter names, onto the ids
 * above. The two readings of steps are one setting: which sampler the strip was
 * rendered with is a property of the strip rather than of the field.
 */
const SETTING_ID_BY_PARAMETER: Readonly<Record<string, string>> = {
  cfg_scale: 'cfg',
  denoising_strength: 'denoise',
  hires_fix: 'hires',
  hires_fix_denoising_strength: 'hires_denoise',
  negative_prompt: 'negative',
  post_processing: 'post',
  resolution: 'size',
  sampler_name: 'sampler',
  steps_converging: 'steps',
};

/** What a setting with no entry is called: "this", the control being beside it. */
export const SETTING_FALLBACK_LABEL_KEY = 'generate.sweeps.param_this';

/** The studio's id for a setting, given either its id or an API field name. */
export function settingIdFor(parameter: string): string {
  return SETTING_ID_BY_PARAMETER[parameter] ?? parameter;
}

/** What the studio knows about a setting, or undefined where it knows nothing. */
export function settingEntry(parameter: string): SettingEntry | undefined {
  return SETTING_BY_ID.get(settingIdFor(parameter));
}

/** The panel area a setting belongs to, or undefined where it belongs to none. */
export function settingSection(parameter: string): SectionId | undefined {
  return settingEntry(parameter)?.section;
}

/** The `?` note's heading, which is the field's short name. */
export function settingTitleKey(id: string): string {
  return `generate.help.${id}.title`;
}

/** The `?` note's own two or three lines. */
export function settingNoteKey(id: string): string {
  return `generate.help.${id}.body`;
}

/** One sentence of the reference, for someone meeting the setting. */
export function settingLeadKey(id: string): string {
  return `generate.reference.${id}.lead`;
}

/** The depth beneath the lead. */
export function settingBodyKey(id: string): string {
  return `generate.reference.${id}.body`;
}

/** The short name a chip puts beside the value. */
export function settingLabelKey(parameter: string): string {
  const entry = settingEntry(parameter);
  if (!entry) {
    return SETTING_FALLBACK_LABEL_KEY;
  }
  return entry.labelKey ?? settingTitleKey(entry.id);
}

/**
 * The name a sentence uses for the setting. Falls back to the chip name, and
 * then to "this", which reads as intended because the sentence is always beside
 * the control it is about.
 */
export function settingProseLabelKey(parameter: string): string {
  return settingEntry(parameter)?.proseLabelKey ?? settingLabelKey(parameter);
}

/** The written reference's half of a setting, where the book has a page for it. */
export function settingReference(id: string): SettingReference | undefined {
  return settingEntry(id)?.reference;
}

/** Whether the reference has a page a `?` note can send a reader on to. */
export function hasReference(id: string): boolean {
  return settingReference(id) !== undefined;
}

/** The strip a setting has pictures for, or null when the library has none. */
export function settingSweepStrip(id: string): string | null {
  return settingEntry(id)?.sweeps?.strip ?? null;
}

/** The two-axis plate a setting can offer beside its strip, if there is one. */
export function settingSweepGrid(id: string): string | null {
  return settingEntry(id)?.sweeps?.grid ?? null;
}

/** The second strip a setting can be read on, offered as a choice beside it. */
export function settingSweepVariant(id: string): string | null {
  return settingEntry(id)?.sweeps?.variant ?? null;
}

/** One section of the reference index, and the settings filed under it. */
export interface SettingGroup {
  section: SectionId;
  ids: readonly string[];
}

/**
 * The index, grouped and ordered: the sections in the order the control panel
 * itself shows them, so a reader scanning the index is scanning the panel.
 *
 * Sections with nothing under them are left out rather than rendered empty, and
 * only settings the book has a page for are listed: an index entry leading to a
 * page with nothing on it reads as a bug.
 */
export const SETTINGS_INDEX: readonly SettingGroup[] = SECTION_IDS.map(
  (section) => ({
    section,
    ids: SETTINGS.filter(
      (entry) => entry.section === section && entry.reference !== undefined,
    ).map((entry) => entry.id),
  }),
).filter((group) => group.ids.length > 0);

/**
 * Every reference page in index order. This is the order a reader walking the
 * detail pages passes through, so it is the order the way onwards follows.
 */
const REFERENCE_SEQUENCE: readonly string[] = SETTINGS_INDEX.flatMap(
  (group) => group.ids,
);

/**
 * The entries either side of `id` across the whole reference, for the way
 * onwards at the foot of a detail page. Null only at the two ends of the
 * sequence: the reference reads as one book, and a section boundary is
 * something the link says out loud rather than something it stops at.
 */
export function settingNeighbours(id: string): {
  previous: string | null;
  next: string | null;
} {
  const at = REFERENCE_SEQUENCE.indexOf(id);
  if (at === -1) {
    return { previous: null, next: null };
  }
  return {
    previous: REFERENCE_SEQUENCE[at - 1] ?? null,
    next: REFERENCE_SEQUENCE[at + 1] ?? null,
  };
}
