import { SectionId } from './section-identity';

/**
 * A setting's value, in the type the API takes it in. Numbers stay numbers and
 * flags stay flags all the way to the surface that renders them: a value that
 * has been turned into a string somewhere upstream has already lost the one
 * thing a reader needs it to keep, which is what kind of thing it is.
 */
export type SettingValue = string | number | boolean;

/** What every surface needs to name a setting and place it on the panel. */
export interface SettingVocabularyEntry {
  /** The panel area the setting lives in, for its glyph and hue. */
  section: SectionId;
  /** The short name that sits beside the value in a chip. */
  labelKey: string;
  /**
   * The name for prose that says the setting mid-sentence, where the chip name
   * is too terse to read as English. Absent where the two are the same word.
   */
  proseLabelKey?: string;
}

/**
 * Every setting the studio names, and the one place it is named. The chips on a
 * worked example, the caption under a sweep, the headers of a grid plate, the
 * viewer's caption and the metadata panel all read this, so a setting cannot
 * come to wear one glyph in one place and another somewhere else, or be called
 * "Guidance" on one surface and "CFG" on the next.
 *
 * Keyed by the studio's own short ids rather than by API field names; the API's
 * names are aliases onto them, below.
 */
export const SETTING_VOCABULARY: Readonly<
  Record<string, SettingVocabularyEntry>
> = {
  prompt: { section: 'prompt', labelKey: 'generate.sections.prompt' },
  negative: {
    section: 'prompt',
    labelKey: 'generate.form.negative_prompt_label',
  },
  prompt_emphasis: {
    section: 'prompt',
    labelKey: 'generate.sweeps.param_prompt_emphasis',
  },
  model: { section: 'model', labelKey: 'generate.tutorials.recipe_model' },
  loras: { section: 'model', labelKey: 'generate.help.loras.title' },
  tis: { section: 'model', labelKey: 'generate.results.meta_row_tis' },
  size: { section: 'size', labelKey: 'generate.tutorials.recipe_size' },
  source: { section: 'source', labelKey: 'generate.sections.source' },
  denoise: {
    section: 'source',
    labelKey: 'generate.tutorials.recipe_denoise',
    proseLabelKey: 'generate.help.denoise.title',
  },
  steps: { section: 'sampling', labelKey: 'generate.tutorials.recipe_steps' },
  cfg: {
    section: 'sampling',
    labelKey: 'generate.tutorials.recipe_cfg',
    proseLabelKey: 'generate.help.cfg.title',
  },
  sampler: {
    section: 'sampling',
    labelKey: 'generate.tutorials.recipe_sampler',
  },
  seed: { section: 'sampling', labelKey: 'generate.tutorials.recipe_seed' },
  clip_skip: { section: 'sampling', labelKey: 'generate.help.clip_skip.title' },
  karras: {
    section: 'sampling',
    labelKey: 'generate.tutorials.recipe_karras',
    proseLabelKey: 'generate.help.karras.title',
  },
  hires: { section: 'sampling', labelKey: 'generate.tutorials.recipe_hires' },
  tiling: { section: 'sampling', labelKey: 'generate.help.tiling.title' },
  post: { section: 'finishing', labelKey: 'generate.tutorials.recipe_post' },
  batch: {
    section: 'finishing',
    labelKey: 'generate.tutorials.recipe_batch',
    proseLabelKey: 'generate.help.batch.title',
  },
};

/**
 * The API's field names, and the sweep library's parameter names, onto the ids
 * above. The two readings of steps are one setting: which sampler the strip was
 * rendered with is a property of the strip rather than of the field.
 */
const SETTING_ID_BY_PARAMETER: Readonly<Record<string, string>> = {
  cfg_scale: 'cfg',
  denoising_strength: 'denoise',
  hires_fix: 'hires',
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
export function settingEntry(
  parameter: string,
): SettingVocabularyEntry | undefined {
  return SETTING_VOCABULARY[settingIdFor(parameter)];
}

/** The panel area a setting belongs to, or undefined where it belongs to none. */
export function settingSection(parameter: string): SectionId | undefined {
  return settingEntry(parameter)?.section;
}

/** The short name a chip puts beside the value. */
export function settingLabelKey(parameter: string): string {
  return settingEntry(parameter)?.labelKey ?? SETTING_FALLBACK_LABEL_KEY;
}

/**
 * The name a sentence uses for the setting. Falls back to the chip name, and
 * then to "this", which reads as intended because the sentence is always beside
 * the control it is about.
 */
export function settingProseLabelKey(parameter: string): string {
  const entry = settingEntry(parameter);
  return entry?.proseLabelKey ?? entry?.labelKey ?? SETTING_FALLBACK_LABEL_KEY;
}
