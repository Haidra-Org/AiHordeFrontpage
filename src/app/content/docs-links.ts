/**
 * Where everything the documentation and the studio point at actually lives.
 *
 * The two areas link to each other constantly: a `?` note offers the setting's
 * page, a settings page offers to try its value in the studio, a worked example
 * arms a walkthrough and sends the reader to the panel. Writing those paths at
 * each site is how a rename becomes a set of dead links, so they are written
 * once here and nowhere else.
 */

/** The documentation area's front door. */
export const DOCS_ROOT = '/docs';

/** The image studio's documentation: examples, the guide, the reference. */
export const DOCS_IMAGE = `${DOCS_ROOT}/image`;

/** The written walkthrough of making a first image. */
export const DOCS_IMAGE_GUIDE = `${DOCS_IMAGE}/guide`;

/** The settings reference index. */
export const DOCS_IMAGE_SETTINGS = `${DOCS_IMAGE}/settings`;

/** The worked examples, one page per technique. */
export const DOCS_IMAGE_EXAMPLES = `${DOCS_IMAGE}/learn`;

/** The alchemy studio's documentation. */
export const DOCS_ALCHEMY = `${DOCS_ROOT}/alchemy`;

/** The studios themselves, which is where reading turns into doing. */
export const STUDIO_IMAGE = '/generate/image';
export const STUDIO_ALCHEMY = '/generate/alchemy';

/** One setting's page in the reference. */
export function docsSettingLink(id: string): string {
  return `${DOCS_IMAGE_SETTINGS}/${id}`;
}

/** One technique's worked example. */
export function docsExampleLink(flowId: string): string {
  return `${DOCS_IMAGE_EXAMPLES}/${flowId}`;
}
