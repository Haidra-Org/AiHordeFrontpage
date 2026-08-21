/**
 * The written guide: a short walkthrough of making a first image, then the
 * panel's own field notes gathered under the card each field belongs to.
 *
 * The reference half is a scannable summary rather than a second explanation:
 * every term it lists links to that setting's page, which is the one place the
 * setting is written out in full.
 */

/** One card of the control panel, and the settings that card carries. */
export interface GuideSection {
  /** Suffix of the section's anchor id, and of nothing else. */
  id: string;
  /**
   * The panel's own label for the card. Reused rather than restated so the
   * guide cannot come to name a section differently from the form does.
   */
  labelKey: string;
  /** Setting ids, in the order the panel and the reference show them. */
  topics: readonly string[];
  /**
   * The worked example that puts this section's settings to work, where one
   * covers them. Set only where the walkthrough really is about the section:
   * reading about a dial and then being handed an example that never touches it
   * is worse than being offered nothing.
   */
  practiceFlow?: string;
}

/**
 * The reference half of the guide, mirroring the control panel top to bottom.
 *
 * Every card is listed, including the two whose topics are ideas rather than
 * rows: what a prompt is doing and what a size is measured against are written
 * up in the book like any dial, so the guide links to them like any dial. The
 * walkthrough above still carries their pictures, and a topic whose strip the
 * walkthrough has already shown is listed here without repeating it.
 */
export const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: 'prompt',
    labelKey: 'generate.form.prompt_section',
    topics: ['prompt', 'negative', 'prompt_emphasis'],
  },
  {
    id: 'dimensions',
    labelKey: 'generate.form.dimensions_section',
    topics: ['size', 'native_resolution', 'oversize', 'hires', 'hires_denoise'],
  },
  {
    id: 'source',
    labelKey: 'generate.source.section',
    topics: [
      'source',
      'img2img',
      'denoise',
      'img2img_mask',
      'inpainting',
      'outpainting',
      'remix',
    ],
  },
  {
    id: 'sampling',
    labelKey: 'generate.form.sampling_section',
    topics: [
      'steps',
      'cfg',
      'sampler',
      'seed',
      'clip_skip',
      'karras',
      'tiling',
      'requirements',
    ],
    practiceFlow: 'txt2img',
  },
  {
    id: 'loras',
    labelKey: 'generate.form.loras_section',
    topics: ['loras'],
  },
  {
    id: 'post',
    labelKey: 'generate.form.post_processing_section',
    topics: ['upscaler', 'facefixer', 'facefixer_strength'],
  },
  {
    id: 'output',
    labelKey: 'generate.form.output_section',
    topics: ['batch', 'nsfw', 'censor_nsfw'],
  },
  {
    id: 'horde',
    labelKey: 'generate.form.horde_section',
    topics: [
      'trusted_workers',
      'slow_workers',
      'extra_slow_workers',
      'allow_downgrade',
      'replacement_filter',
      'webhook',
      'workers',
      'remember_extras',
    ],
  },
  {
    id: 'workflows',
    labelKey: 'generate.zones.workflows',
    topics: ['transparent', 'qr'],
  },
];

/** One step of the walkthrough, and the strips it can show under its copy. */
export interface GuideStep {
  /** Suffix of the step's `generate.guide.steps.<id>` copy. */
  id: string;
  /**
   * Sweep parameters the step offers, in the order they are read. A step is
   * where a reader first meets the idea, so it is where the picture of it does
   * the most work; the reference half below links to the same settings and
   * leaves the strips to the step rather than showing them twice on one page.
   */
  sweeps: readonly string[];
}

/** The walkthrough, in the order a first image is actually made. */
export const GUIDE_STEPS: readonly GuideStep[] = [
  { id: 'prompt', sweeps: ['prompt_emphasis', 'negative_prompt'] },
  { id: 'model', sweeps: [] },
  { id: 'dimensions', sweeps: ['resolution'] },
  { id: 'generate', sweeps: [] },
  { id: 'results', sweeps: [] },
  { id: 'settings', sweeps: [] },
];

/** The DOM id of a part of the guide, which is what the contents rail aims at. */
export function guideSectionId(id: string): string {
  return `gs-guide-sec-${id}`;
}
