import { GenerateFormValue } from '../pages/generate/generate-form.model';
import { ImagePostProcessor } from '../types/style';
import { DOCS_IMAGE_CONTROL_TYPES } from './docs-links';
import { SectionId, PANEL_SECTION_IDS } from './sections';

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
  /**
   * Post-processors the value needs switched on to mean anything, added to
   * whatever the form already runs rather than written over it. A strength has
   * no effect unless its processor is selected, so the entry offering the
   * strength names the processor beside it; the studio decides what actually
   * has to change, and never swaps a processor the reader picked themselves.
   */
  addPostProcessors?: readonly ImagePostProcessor[];
  /**
   * The value only survives a submit on a request that starts from an image:
   * the form strips it otherwise. A chip beside a live form is withheld where
   * the studio is on a sourceless mode rather than offered and then quietly
   * dropped, which would teach the reader that the panel ignores them.
   */
  requiresSource?: boolean;
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
 * One published strip, named the way a surface asks for it.
 *
 * A parameter is usually enough, because the library publishes one strip per
 * parameter that a surface with no model in hand would want. Where it publishes
 * several scenes of one parameter and they teach different things, the scene has
 * to be named too: both negative-prompt strips are `negative_prompt`, and one is
 * about repairing anatomy while the other is about taking a named thing out of
 * the frame.
 */
export interface SweepStripRef {
  parameter: string;
  /** The library's `scene_id`, where the parameter alone would not pick it out. */
  scene?: string;
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
   * The guidance mode that strip was rendered against, where the library swept
   * the field once per detector. Absent everywhere else, and absent is itself a
   * choice: it asks for the strip rendered against no detector at all.
   */
  stripControlType?: string;
  /**
   * Further strips shown under the primary one, in declaration order. A second
   * strip here is evidence about the same setting from another angle rather
   * than a second setting: the steps entry carries the per-step canvas of one
   * real render, which is what a step count is a count of, and the prompt
   * entries carry the second scene the library published of their own parameter.
   */
  alsoStrips?: readonly SweepStripRef[];
  /**
   * Whether the further strips are peers of the first rather than footnotes to
   * it. A setting whose page is about one knob has one picture and the rest are
   * more about it, so they take the compact card; a page that is about four
   * knobs at once has four subjects of equal standing, and singling one out as
   * the page's evidence would say the other three matter less. Peers all take
   * the full card, and none of them opens itself: there is no one picture for
   * the page to lead with.
   */
  coequal?: boolean;
  /**
   * The two-axis plate offered beside the strip. A grid answers "how does this
   * interact with the setting next to it", which is a second question rather
   * than a fuller answer to the first, so two settings can share one plate.
   */
  grid?: string;
}

/**
 * How a parameter published as two strips offers the choice between them.
 *
 * Some things a strip is asked to show have two readings rather than one fuller
 * one, and the toggle between them belongs wherever the frames are. What the two
 * sides are called is part of the pairing: "a sampler that re-rolls" and "the
 * model's guess" are answers to different questions, and one set of words for
 * both would name neither.
 */
export interface SweepVariantPair {
  /** The parameter of the second strip. */
  parameter: string;
  /** What the two buttons are, together. */
  groupLabelKey: string;
  /** The strip the parameter itself names, and the one offered beside it. */
  baseLabelKey: string;
  altLabelKey: string;
  /**
   * Whether the folded note listing the two sampler families sits under the
   * toggle. It answers "which kind is mine", which only the sampler pair asks.
   */
  samplerNote?: boolean;
}

/**
 * Every parameter the library publishes two strips for, keyed by the one a
 * surface asks for. The second strip is never asked for directly: it is reached
 * through the first, which is what makes the pair one viewer rather than two
 * offers side by side.
 */
const SWEEP_VARIANTS: Readonly<Record<string, SweepVariantPair>> = {
  // Steps read differently on a sampler that re-rolls the detail than on one
  // that settles towards a single picture.
  steps: {
    parameter: 'steps_converging',
    groupLabelKey: 'generate.sweeps.variant_label',
    baseLabelKey: 'generate.sweeps.variant_base',
    altLabelKey: 'generate.sweeps.variant_alt',
    samplerNote: true,
  },
  // Denoising strength reads differently on a re-rolling sampler too: part of
  // what moves along the ancestral strip is the sampler rather than the
  // strength, and the settling strip is how a reader tells the two apart.
  denoising_strength: {
    parameter: 'denoising_strength_converging',
    groupLabelKey: 'generate.sweeps.variant_label',
    baseLabelKey: 'generate.sweeps.variant_base',
    altLabelKey: 'generate.sweeps.variant_alt',
    samplerNote: true,
  },
  // What the canvas actually holds part-way through a render, against what the
  // model thinks it is heading towards from there. The first is why an
  // unfinished picture looks like static; the second is why it is not random.
  step_preview: {
    parameter: 'step_preview_guess',
    groupLabelKey: 'generate.sweeps.preview_variant_label',
    baseLabelKey: 'generate.sweeps.preview_variant_base',
    altLabelKey: 'generate.sweeps.preview_variant_alt',
  },
};

/**
 * The strips whose frames are one render over time rather than several renders
 * at different values.
 *
 * Everything a surface does differently with these follows from that. They are
 * badged as one picture pass by pass, so a reader does not take them for a
 * comparison; and they open at their first frame rather than their middle one,
 * because a range strip's middle stands in for the range while a timeline's
 * first frame is the static a render starts from, which is what makes every
 * frame after it mean anything.
 */
const SWEEP_TIMELINES: ReadonlySet<string> = new Set([
  'step_preview',
  'step_preview_guess',
]);

/**
 * The two-frame strips laid out side by side rather than wiped, by parameter.
 *
 * A wipe holds a comparison for the reader where the difference is in one place
 * on one composition. Where the two frames are different pictures of the same
 * request the divider reads as a collage instead, and the honest presentation is
 * the pair itself, with the wipe still there for whoever wants it.
 */
const SWEEP_PAIRS_APART: ReadonlySet<string> = new Set(['hires_fix']);

/**
 * The one sentence a plate needs beyond its own axis captions, by parameter.
 *
 * Only where the plate would otherwise be misread: the hires plate's off column
 * is the same request failing at a size the model was not trained at, and a
 * reader who takes it for a second photoshoot learns nothing from it.
 */
const SWEEP_GRID_NOTES: Readonly<Record<string, string>> = {
  hires_grid: 'generate.sweeps.grid_note_hires',
};

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
 * Where the thirty-three guidance modes are shown rather than listed. The
 * choice between them is a comparison, and the entry here is what the picker
 * does with one rather than what each of them keeps.
 */
const CONTROL_TYPES_LINK: SettingLink = {
  labelKey: 'generate.reference.link_control_types',
  routerLink: DOCS_IMAGE_CONTROL_TYPES,
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
 * page for: the model, the list of textual inversions, the post-processor
 * picker. A setting with no `labelKey` is named by its `?` note's title.
 *
 * Not every entry is a row of the panel. The prompt and size chapters document
 * what the fields around them are for, so they include ideas the reader can
 * neither type into nor drag: what a model's native size is, and what happens
 * above it. Those carry a reference and no `?` glyph, which is the difference
 * between a page the book has and a note the panel shows.
 */
export const SETTINGS: readonly SettingEntry[] = [
  // --- prompt ---
  {
    id: 'prompt',
    section: 'prompt',
    labelKey: 'generate.sections.prompt',
    reference: {
      related: ['negative', 'prompt_emphasis', 'loras'],
      links: [MODELS_LINK],
    },
  },
  {
    id: 'negative',
    section: 'prompt',
    labelKey: 'generate.form.negative_prompt_label',
    reference: {
      tradeoffs: { quality: 'generate.reference.quality_negative' },
      related: ['prompt', 'prompt_emphasis', 'cfg'],
    },
    sweeps: {
      strip: 'negative_prompt',
      // The two scenes are the two jobs a negative prompt does. The portrait is
      // the one the parameter answers with by default, and the harbour is the
      // other half: naming a thing you asked for by implication and do not want.
      alsoStrips: [{ parameter: 'negative_prompt', scene: 'harbour' }],
    },
  },
  {
    id: 'prompt_emphasis',
    section: 'prompt',
    labelKey: 'generate.sweeps.param_prompt_emphasis',
    reference: {
      tradeoffs: { quality: 'generate.reference.quality_prompt_emphasis' },
      // No bounds: the weights are prompt syntax rather than a control the
      // panel holds, so there is no slider to read a minimum and a maximum off.
      range: { typical: '0.9-1.3' },
      related: ['prompt', 'negative', 'cfg'],
    },
    sweeps: {
      strip: 'prompt_emphasis',
      // One phrase walked up and down says where the usable range ends; two
      // phrases traded against each other says what a weight is. A gradient
      // cannot show the second, which is why both were rendered.
      alsoStrips: [{ parameter: 'prompt_emphasis', scene: 'person' }],
    },
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
      related: ['tis', 'requirements'],
      links: [MODELS_LINK],
    },
  },
  {
    // An embedding is not a weaker LoRA: it teaches one prompt word rather than
    // changing how the model paints, and the horde names it by model page
    // rather than by version. Both differences want saying somewhere.
    id: 'tis',
    section: 'model',
    labelKey: 'generate.results.meta_row_tis',
    reference: {
      range: { min: -5, max: 5, typical: '1' },
      related: ['loras', 'requirements'],
      links: [MODELS_LINK],
    },
  },
  {
    // The suggested lines come out of the selected model's own reference entry,
    // so the question they answer is "what is this model asking for" rather than
    // "how do I sample": they are filed with the model that publishes them.
    id: 'requirements',
    section: 'model',
    reference: {
      related: ['steps', 'cfg', 'sampler', 'clip_skip', 'karras'],
      links: [MODELS_LINK],
    },
  },

  // --- size ---
  {
    id: 'size',
    section: 'size',
    labelKey: 'generate.tutorials.recipe_size',
    reference: {
      tradeoffs: {
        speed: 'slower',
        kudos: 'costlier',
        quality: 'generate.reference.quality_size',
      },
      range: { min: 64, max: 3072, typical: '512-1024' },
      related: ['native_resolution', 'oversize', 'hires'],
      glossaryTerms: ['megapixelsteps'],
    },
  },
  {
    // Not a control: the size a model was trained at is a property of the
    // model, and the panel only ever reports it. It has a page because it is
    // the thing width and height are read against, and because the strip that
    // shows a request walked away from it had nowhere else to hang.
    id: 'native_resolution',
    section: 'size',
    reference: {
      related: ['size', 'oversize', 'requirements'],
      links: [MODELS_LINK],
      glossaryTerms: ['model'],
    },
    sweeps: { strip: 'resolution' },
  },
  {
    // The problem, filed beside the sizes that cause it. The control that
    // answers it is the hires pass, which is written up in Sampling: this
    // entry says what goes wrong and points there rather than restating it.
    id: 'oversize',
    section: 'size',
    reference: {
      tradeoffs: { quality: 'generate.reference.quality_oversize' },
      related: ['hires', 'native_resolution', 'size', 'upscaler'],
      glossaryTerms: ['hires_fix'],
    },
  },

  // --- source image ---
  {
    // The chapter's opening page: what attaching a picture does at all, and
    // which of the four things the horde can do with one a reader wants. Each
    // has its own page because they are different pipelines with different
    // answers, and because a reader arriving from another tool is looking for
    // one of them by name.
    id: 'source',
    section: 'source',
    labelKey: 'generate.sections.source',
    reference: {
      related: [
        'img2img',
        'img2img_mask',
        'inpainting',
        'outpainting',
        'remix',
      ],
      glossaryTerms: ['img2img'],
    },
  },
  {
    id: 'img2img',
    section: 'source',
    reference: {
      related: ['denoise', 'img2img_mask', 'source'],
      glossaryTerms: ['img2img'],
    },
    sweeps: { strip: 'denoising_strength' },
  },
  {
    id: 'img2img_mask',
    section: 'source',
    reference: {
      applies: [
        {
          display: '0.45',
          anchorId: 'denoise',
          fields: {
            sourceMode: 'img2img',
            maskEnabled: true,
            denoising_strength: 0.45,
          },
          requiresSource: true,
        },
      ],
      related: ['inpainting', 'denoise', 'img2img'],
      glossaryTerms: ['inpainting'],
    },
    sweeps: {
      strip: 'masked_denoising_strength',
      grid: 'masking_grid',
    },
  },
  {
    id: 'inpainting',
    section: 'source',
    reference: {
      related: ['img2img_mask', 'outpainting', 'source'],
      glossaryTerms: ['inpainting'],
    },
    // The grid is the page's whole argument: the column that erases what was
    // there, beside the one that keeps it.
    sweeps: { grid: 'masking_grid' },
  },
  {
    id: 'outpainting',
    section: 'source',
    reference: {
      related: ['inpainting', 'size', 'source'],
      glossaryTerms: ['inpainting'],
    },
    sweeps: { strip: 'outpaint_extent' },
  },
  {
    id: 'remix',
    section: 'source',
    reference: {
      related: ['source', 'img2img'],
      glossaryTerms: ['model'],
    },
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
          requiresSource: true,
        },
      ],
      related: ['source', 'hires_denoise'],
    },
    sweeps: { strip: 'denoising_strength' },
  },
  {
    // Which reading of the source the render is held to. The picker is the one
    // control in the studio whose thirty-three values are the subject rather
    // than a scale, so the entry says what choosing one does and sends the
    // reader to the page that shows what each of them keeps.
    id: 'control_type',
    section: 'source',
    reference: {
      related: ['source', 'img2img', 'denoise'],
      links: [CONTROL_TYPES_LINK],
      glossaryTerms: ['controlnet'],
    },
  },
  {
    // The weight on the hold a control map has over the render. It rides beside
    // a chosen guidance mode and nowhere else, so the panel only offers it once
    // one is chosen, and leaves it unset until the reader moves it.
    id: 'control_strength',
    section: 'source',
    reference: {
      // The bounds are the horde's own; the typical band is where the strips
      // stopped paying for themselves.
      range: { min: 0.01, max: 3, typical: '0.5-0.9', default: '1' },
      related: ['control_type', 'source', 'denoise'],
      links: [CONTROL_TYPES_LINK],
      glossaryTerms: ['controlnet'],
    },
    // The field was swept once per detector, so the strip has to name the one
    // it is read on. Naming none would offer the strip rendered against no
    // detector at all, which is the QR workflow's own.
    sweeps: { strip: 'control_strength', stripControlType: 'canny' },
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
      // What a step count is a count of, under the strip of what changing it
      // does: the timeline is the same evidence read along the other axis.
      alsoStrips: [{ parameter: 'step_preview' }],
      grid: 'steps_cfg_grid',
    },
  },
  {
    // Not a control anybody sets: the per-step canvas of one real render, which
    // the concept track is read against. It is named here because the chip
    // under those frames has to say what the number on them is, and because the
    // sampling card is where a reader who wants to move it would go.
    id: 'step_preview',
    section: 'sampling',
    labelKey: 'generate.sweeps.param_step',
    // The chip under a frame says "Step 12", which is the number on that frame;
    // an offer capsule headed "Step" beside one headed "Steps" names neither.
    proseLabelKey: 'generate.help.step_preview.title',
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
      related: ['steps', 'scheduler', 'sampler_settings', 'requirements'],
    },
    // The four-stop strip is the lesson; the gallery is every sampler the horde
    // publishes on the same seed, for a reader choosing from the advanced tier.
    sweeps: {
      strip: 'sampler',
      alsoStrips: [{ parameter: 'sampler_gallery' }],
      grid: 'sampler_steps_grid',
    },
  },
  {
    // The whole schedule rather than the one flag: which of them the panel can
    // offer is the horde's answer rather than this studio's, so the page says
    // what a schedule is and leaves the list to the control.
    id: 'scheduler',
    section: 'sampling',
    reference: {
      tradeoffs: { quality: 'generate.reference.quality_scheduler' },
      related: ['sampler', 'karras', 'steps', 'sampler_settings'],
    },
    sweeps: { strip: 'scheduler', grid: 'scheduler_steps_grid' },
  },
  {
    // The solver knobs the contract exposes per sampler: eta, noise scale,
    // churn and its window, solver order and solver type. One page for all of
    // them, because a reader meets them as one disclosure and each strip holds
    // every other knob at its default. No knob here is the subject and the rest
    // its supporting evidence, so the four strips stand as peers.
    id: 'sampler_settings',
    section: 'sampling',
    reference: {
      related: ['sampler', 'scheduler', 'flow_shift'],
    },
    sweeps: {
      strip: 'sampler_eta',
      alsoStrips: [
        { parameter: 'sampler_s_noise' },
        { parameter: 'sampler_s_churn' },
        { parameter: 'sampler_solver_type' },
      ],
      coequal: true,
    },
  },
  // The knobs themselves, so a strip about one of them is named after it rather
  // than after the page. They are read on the shared page above and have none
  // of their own; the panel names each with its form label.
  // Every sampler the horde publishes on one seed: read on the sampler page,
  // named for what it is so its row does not read as the four-stop strip again.
  {
    id: 'sampler_gallery',
    section: 'sampling',
    labelKey: 'generate.sweeps.sampler_gallery_label',
    sweeps: { strip: 'sampler_gallery' },
  },
  {
    id: 'sampler_eta',
    section: 'sampling',
    labelKey: 'generate.form.sampler_eta_label',
    sweeps: { strip: 'sampler_eta' },
  },
  {
    id: 'sampler_s_noise',
    section: 'sampling',
    labelKey: 'generate.form.sampler_s_noise_label',
    sweeps: { strip: 'sampler_s_noise' },
  },
  {
    id: 'sampler_s_churn',
    section: 'sampling',
    labelKey: 'generate.form.sampler_s_churn_label',
    sweeps: { strip: 'sampler_s_churn' },
  },
  {
    id: 'sampler_solver_type',
    section: 'sampling',
    labelKey: 'generate.form.sampler_solver_type_label',
    sweeps: { strip: 'sampler_solver_type' },
  },
  {
    // A Flux and Qwen Image control. The panel only shows it where the selected
    // model reads it, so the page is mostly about why it is usually missing.
    id: 'flow_shift',
    section: 'sampling',
    reference: {
      range: { min: 0, max: 100, typical: '2-4' },
      related: ['scheduler', 'sampler_settings', 'steps', 'requirements'],
    },
    sweeps: { strip: 'flow_shift' },
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
      related: ['sampler', 'scheduler', 'steps', 'requirements'],
    },
    sweeps: { strip: 'karras', grid: 'karras_grid' },
  },
  {
    id: 'hires',
    section: 'size',
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
    section: 'size',
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
    sweeps: { strip: 'hires_fix_denoising_strength' },
  },
  {
    id: 'tiling',
    section: 'sampling',
    reference: {},
    sweeps: { strip: 'tiling' },
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
          addPostProcessors: ['GFPGAN'],
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
  {
    id: 'qr',
    section: 'workflows',
    reference: { related: ['batch', 'prompt'] },
    sweeps: {
      // The strength strip is the workflow's one dial, rendered locally because
      // the public API has no field to carry it. The style strip is what the
      // workflow is for once that argument is settled: three finished codes,
      // with the layout entries that ride beside the payload.
      strip: 'control_strength',
      alsoStrips: [{ parameter: 'qr_style' }],
    },
  },
];

const SETTING_BY_ID: ReadonlyMap<string, SettingEntry> = new Map(
  SETTINGS.map((entry) => [entry.id, entry]),
);

/**
 * The API's field names, and the sweep library's parameter names, onto the ids
 * above. The two readings of steps are one setting: which sampler the strip was
 * rendered with is a property of the strip rather than of the field.
 */
export const SETTING_ID_BY_PARAMETER: Readonly<Record<string, string>> = {
  cfg_scale: 'cfg',
  // The treatments are a reading of the one field the panel has: the payload
  // box that selects the workflow. The strength beside them is the control
  // strength setting, which has an entry of its own.
  qr_style: 'qr',
  denoising_strength: 'denoise',
  // The masked readings belong to the mode that adds them, not to the plain
  // strength page: what they teach is what a mask does to it.
  masked_denoising_strength: 'img2img_mask',
  masking_grid: 'img2img_mask',
  outpaint_extent: 'outpainting',
  hires_fix: 'hires',
  hires_fix_denoising_strength: 'hires_denoise',
  negative_prompt: 'negative',
  post_processing: 'post',
  resolution: 'size',
  sampler_name: 'sampler',
  // The alchemy library sweeps the upscaler by the name of the form that runs
  // it, which is the finishing setting the panel already names.
  upscaler_form: 'upscaler',
  step_preview_guess: 'step_preview',
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

/** The guidance mode a setting's strip was rendered against, where it names one. */
export function settingSweepStripControlType(id: string): string | null {
  return settingEntry(id)?.sweeps?.stripControlType ?? null;
}

/** The further strips shown under a setting's primary one, in reading order. */
export function settingSweepAlsoStrips(id: string): readonly SweepStripRef[] {
  return settingEntry(id)?.sweeps?.alsoStrips ?? [];
}

/** Whether a setting's strips stand as peers rather than one and its footnotes. */
export function settingSweepsAreCoequal(id: string): boolean {
  return settingEntry(id)?.sweeps?.coequal ?? false;
}

/** The two-axis plate a setting can offer beside its strip, if there is one. */
export function settingSweepGrid(id: string): string | null {
  return settingEntry(id)?.sweeps?.grid ?? null;
}

/** Whether a strip's frames are one render over time rather than a comparison. */
export function sweepIsTimeline(parameter: string): boolean {
  return SWEEP_TIMELINES.has(parameter);
}

/** Whether a strip opens on its first frame rather than the middle of its range. */
export function sweepOpensAtFirstStop(parameter: string): boolean {
  return sweepIsTimeline(parameter);
}

/** Whether a two-frame strip is laid out side by side before it is wiped. */
export function sweepPairStartsApart(parameter: string): boolean {
  return SWEEP_PAIRS_APART.has(parameter);
}

/** The plate's own footnote, where one plate needs a sentence the rest do not. */
export function sweepGridNoteKey(parameter: string): string | null {
  return SWEEP_GRID_NOTES[parameter] ?? null;
}

/** How a parameter's two strips are offered, or null where it has only one. */
export function sweepVariantPair(parameter: string): SweepVariantPair | null {
  return SWEEP_VARIANTS[parameter] ?? null;
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
export const SETTINGS_INDEX: readonly SettingGroup[] = PANEL_SECTION_IDS.map(
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
