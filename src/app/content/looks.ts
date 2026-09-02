/**
 * The looks offered as chips beside the Style select.
 *
 * The select lists every style the horde publishes, under the names their
 * authors gave them, and a reader who has never chosen one has no way to guess
 * what any of them does. These seven are named for what comes out, and each is
 * one of those same styles, so pressing a chip and picking the style by name
 * are one act rather than two.
 *
 * `name` is matched against the catalogue the studio loaded, so a look whose
 * style has been withdrawn is offered nowhere rather than offered dead.
 */
export interface StudioLook {
  /** The style's name in the catalogue, and nothing else. */
  name: string;
  labelKey: string;
}

function look(id: string, name: string): StudioLook {
  return { name, labelKey: `generate.form.looks.${id}` };
}

/**
 * Read in the order the panel offers them: the model a beginner is likeliest to
 * be on first, then the drawn looks, then the photographic and illustrated ones.
 */
export const STUDIO_LOOKS: readonly StudioLook[] = [
  look('flux', 'flux'),
  look('cartoon', 'flat simple cartoon'),
  look('oil_painting', 'impressionist oil painting'),
  look('photo', 'sdxl-photo'),
  look('anime', 'sdxlanime'),
  look('watercolor', 'watercolorscenery'),
  look('pixel_art', 'pixelart'),
];
