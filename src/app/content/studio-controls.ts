/**
 * Every mark in the image studio that has no word beside it.
 *
 * A button carrying only a glyph is readable once you know it and opaque until
 * then, and a badge nobody pressed is never explained at all. The glossary
 * answers "what is that?" for the vocabulary; this answers it for the panel
 * itself, so the same place serves both questions.
 *
 * A control belongs here only while it is unlabelled. The moment its purpose is
 * written next to it on the page, its entry is redundant and should go.
 */
export interface StudioControl {
  /** Also the stem of the entry's strings. */
  id: string;
  /** The icon registry name the control itself draws, so the two never drift. */
  icon: string;
  labelKey: string;
  bodyKey: string;
}

/** The glossary namespace the section's strings live under. */
const CONTROL_KEY_ROOT = 'help.glossary.controls';

function control(id: string, icon: string): StudioControl {
  return {
    id,
    icon,
    labelKey: `${CONTROL_KEY_ROOT}.${id}.title`,
    bodyKey: `${CONTROL_KEY_ROOT}.${id}.body`,
  };
}

/**
 * Read in the order the studio is met: the tools that sit with the panel's own
 * title, then the cards, then the results, then the marks that are read rather
 * than pressed.
 */
export const STUDIO_CONTROLS: readonly StudioControl[] = [
  control('presets', 'folder'),
  control('reset', 'refresh-alt'),
  control('request_view', 'code-bracket'),
  control('panel_size', 'panel-widen'),
  control('help', 'question-mark-circle'),
  control('prompt_expand', 'arrows-pointing-out'),
  control('prompt_history', 'clock'),
  control('style_clear', 'x-mark'),
  control('seed_random', 'refresh-alt'),
  control('lint', 'warning-triangle'),
  control('select_images', 'check-circle'),
  control('tile_actions', 'ellipsis-vertical'),
  control('tile_prompt', 'chevron-right'),
  control('viewer_nav', 'chevron-right'),
  control('source_clear', 'trash-modern'),
  control('close', 'x-mark'),
  control('section_chip', 'sec-sampling'),
  control('style_lock', 'lock-closed'),
  control('retry_badge', 'refresh-alt'),
  control('tutorial_door', 'academic-cap'),
  control('studio_door', 'adjustments-horizontal'),
];
