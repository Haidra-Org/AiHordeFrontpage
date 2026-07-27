import {
  SWEEP_GRID_PARAMETER_BY_HELP_TOPIC,
  SWEEP_PARAMETER_BY_HELP_TOPIC,
} from '../../services/sweep-library.service';
import { GenerateFormValue } from './generate-form.model';
import {
  SECTION_BY_HELP_TOPIC,
  SectionId,
  sectionFor,
} from './section-identity';

/** Which way a setting moves the wait, as the reader turns it up or on. */
export type ReferenceSpeed = 'faster' | 'slower' | 'varies';

/** Which way a setting moves the kudos cost, as the reader turns it up or on. */
export type ReferenceKudos = 'cheaper' | 'costlier' | 'varies';

/**
 * What a setting costs, where the cost is known and points one way. Every field
 * is optional and the whole record is absent on the settings that trade nothing:
 * an empty meta-line is worse than no meta-line, and a guessed one is worse
 * still.
 */
export interface ReferenceTradeoffs {
  speed?: ReferenceSpeed;
  kudos?: ReferenceKudos;
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
export interface ReferenceRange {
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
export interface ReferenceApply {
  display: string;
  anchorId: string;
  fields: Partial<GenerateFormValue>;
}

/** A way out of the reference to somewhere else in the site. */
export interface ReferenceLink {
  labelKey: string;
  routerLink: string;
}

/**
 * One setting, as the reference knows it. The id is the help topic, which is
 * what ties the entry to its `?` note, its prose and its place in the panel.
 *
 * What can be derived is not stored: the section comes from
 * {@link SECTION_BY_HELP_TOPIC} and the sweeps from the library's own maps, so
 * moving a field between cards or publishing a new strip needs no edit here.
 */
export interface ReferenceEntry {
  /** The `generate.help.<id>` topic this entry is the long form of. */
  id: string;
  tradeoffs?: ReferenceTradeoffs;
  range?: ReferenceRange;
  /**
   * Values the reader can put in the form from the entry. Only authored where
   * the prose already names a number: a chip offering a value the reference
   * never argued for would be the reference guessing on the reader's behalf.
   */
  applies?: readonly ReferenceApply[];
  /** Other entries worth reading next, by id. */
  related?: readonly string[];
  links?: readonly ReferenceLink[];
}

/** Where a reader goes to see what a model is and what it suggests. */
const MODELS_LINK: ReferenceLink = {
  labelKey: 'generate.reference.link_models',
  routerLink: '/details/models',
};

/**
 * Every setting the panel explains, in the order the reference reads them: by
 * section, and within a section in the order the panel and the guide show them.
 *
 * Bounds and defaults are the form's, taken from `generate-form.model.ts` and
 * the panel's own sliders. Nothing here states a behaviour the help prose does
 * not already state.
 */
export const REFERENCE_ENTRIES: readonly ReferenceEntry[] = [
  // --- model ---
  {
    id: 'loras',
    range: { min: -5, max: 5, typical: '1' },
    related: ['requirements'],
    links: [MODELS_LINK],
  },

  // --- source image ---
  { id: 'source_modes', related: ['denoise'] },
  {
    id: 'denoise',
    range: { min: 0.01, max: 1, typical: '0.75' },
    applies: [
      {
        display: '0.75',
        anchorId: 'denoise',
        fields: { denoising_strength: 0.75 },
      },
    ],
    related: ['source_modes', 'hires_denoise'],
  },

  // --- sampling ---
  {
    id: 'steps',
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
  {
    id: 'cfg',
    tradeoffs: { quality: 'generate.reference.quality_cfg' },
    range: { min: 0, max: 100, typical: '5-10', default: '7.5' },
    applies: [
      { display: '5', anchorId: 'cfg', fields: { cfg_scale: 5 } },
      { display: '10', anchorId: 'cfg', fields: { cfg_scale: 10 } },
    ],
    related: ['steps', 'sampler', 'requirements'],
  },
  {
    id: 'sampler',
    tradeoffs: {
      speed: 'varies',
      quality: 'generate.reference.quality_sampler',
    },
    related: ['steps', 'karras', 'requirements'],
  },
  { id: 'seed', related: ['batch'] },
  {
    id: 'clip_skip',
    range: { min: 1, max: 12, typical: '1-2', default: '1' },
    applies: [
      { display: '1', anchorId: 'clip_skip', fields: { clip_skip: 1 } },
      { display: '2', anchorId: 'clip_skip', fields: { clip_skip: 2 } },
    ],
    related: ['requirements'],
  },
  {
    id: 'karras',
    tradeoffs: { quality: 'generate.reference.quality_karras' },
    related: ['sampler', 'steps', 'requirements'],
  },
  {
    id: 'hires_fix',
    tradeoffs: {
      speed: 'slower',
      kudos: 'costlier',
      quality: 'generate.reference.quality_hires_fix',
    },
    related: ['hires_denoise', 'upscaler'],
  },
  {
    id: 'hires_denoise',
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
    related: ['hires_fix', 'denoise'],
  },
  { id: 'tiling' },
  {
    id: 'requirements',
    related: ['steps', 'cfg', 'sampler', 'clip_skip', 'karras'],
    links: [MODELS_LINK],
  },

  // --- finishing ---
  {
    id: 'upscaler',
    tradeoffs: {
      speed: 'slower',
      kudos: 'costlier',
      quality: 'generate.reference.quality_upscaler',
    },
    related: ['hires_fix', 'facefixer'],
  },
  {
    id: 'facefixer',
    tradeoffs: {
      speed: 'slower',
      kudos: 'costlier',
      quality: 'generate.reference.quality_facefixer',
    },
    related: ['facefixer_strength', 'upscaler'],
  },
  {
    id: 'facefixer_strength',
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
  {
    id: 'batch',
    tradeoffs: { speed: 'slower', kudos: 'costlier' },
    range: { min: 1, max: 10, typical: '1' },
    related: ['seed', 'qr'],
  },
  { id: 'nsfw', related: ['censor_nsfw', 'replacement_filter'] },
  { id: 'censor_nsfw', related: ['nsfw'] },

  // --- horde ---
  {
    id: 'trusted_workers',
    tradeoffs: { speed: 'slower' },
    related: ['slow_workers', 'workers'],
  },
  { id: 'slow_workers', related: ['extra_slow_workers', 'trusted_workers'] },
  {
    id: 'extra_slow_workers',
    tradeoffs: { speed: 'slower' },
    related: ['slow_workers', 'allow_downgrade'],
  },
  { id: 'allow_downgrade', related: ['steps', 'extra_slow_workers'] },
  { id: 'replacement_filter', related: ['nsfw'] },
  { id: 'webhook', related: ['remember_extras'] },
  { id: 'workers', related: ['trusted_workers', 'remember_extras'] },
  { id: 'remember_extras', related: ['webhook', 'workers'] },

  // --- workflows ---
  { id: 'transparent', related: ['upscaler'] },
  { id: 'qr', related: ['batch'] },
];

const ENTRY_BY_ID: ReadonlyMap<string, ReferenceEntry> = new Map(
  REFERENCE_ENTRIES.map((entry) => [entry.id, entry]),
);

/** The entry for a help topic, or undefined where the topic has none. */
export function referenceEntry(id: string): ReferenceEntry | undefined {
  return ENTRY_BY_ID.get(id);
}

/** The panel area an entry belongs to, read from the one place that says so. */
export function referenceSection(id: string): SectionId | undefined {
  return sectionFor('help', id);
}

/** The strip an entry has pictures for, or null when the library has none. */
export function referenceSweep(id: string): string | null {
  return SWEEP_PARAMETER_BY_HELP_TOPIC[id] ?? null;
}

/** The two-axis plate an entry can offer beside its strip, if there is one. */
export function referenceSweepGrid(id: string): string | null {
  return SWEEP_GRID_PARAMETER_BY_HELP_TOPIC[id] ?? null;
}

/** One section of the reference index, and the entries filed under it. */
export interface ReferenceGroup {
  section: SectionId;
  ids: readonly string[];
}

/**
 * The order the index lays the eight areas out in: the order the control panel
 * itself shows them, so a reader scanning the index is scanning the panel.
 */
const SECTION_ORDER: readonly SectionId[] = [
  'prompt',
  'model',
  'size',
  'source',
  'sampling',
  'finishing',
  'horde',
  'workflows',
];

/**
 * The index, grouped and ordered. Sections with nothing under them are left out
 * rather than rendered empty: the prompt and size areas carry no `?` glyph, so
 * they have no entries to group, and a heading over nothing reads as a bug.
 */
export const REFERENCE_INDEX: readonly ReferenceGroup[] = SECTION_ORDER.map(
  (section) => ({
    section,
    ids: REFERENCE_ENTRIES.filter(
      (entry) => referenceSection(entry.id) === section,
    ).map((entry) => entry.id),
  }),
).filter((group) => group.ids.length > 0);

/**
 * The entries either side of `id` within its own section, for the way onwards
 * at the foot of a detail page. Null at either end of a section: the reference
 * is eight short lists rather than one long one, and running the end of Sampling
 * into the start of Finishing would say otherwise.
 */
export function referenceNeighbours(id: string): {
  previous: string | null;
  next: string | null;
} {
  const group = REFERENCE_INDEX.find((entry) => entry.ids.includes(id));
  const at = group?.ids.indexOf(id) ?? -1;
  if (!group || at === -1) {
    return { previous: null, next: null };
  }
  return {
    previous: group.ids[at - 1] ?? null,
    next: group.ids[at + 1] ?? null,
  };
}

/** Every help topic the panel has, whether or not the reference reached it. */
export const REFERENCE_TOPICS: readonly string[] = Object.keys(
  SECTION_BY_HELP_TOPIC,
);
