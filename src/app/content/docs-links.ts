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

/** The image studio's documentation: examples, the reference, the control types. */
export const DOCS_IMAGE = `${DOCS_ROOT}/image`;

/** The settings reference index. */
export const DOCS_IMAGE_SETTINGS = `${DOCS_IMAGE}/settings`;

/** The worked examples, one page per technique. */
export const DOCS_IMAGE_EXAMPLES = `${DOCS_IMAGE}/learn`;

/** Every guidance mode a ControlNet render can be held to, with pictures. */
export const DOCS_IMAGE_CONTROL_TYPES = `${DOCS_IMAGE}/control-types`;

/** The alchemy studio's documentation: one page per thing it is used for. */
export const DOCS_ALCHEMY = `${DOCS_ROOT}/alchemy`;

/** The studios themselves, which is where reading turns into doing. */
export const STUDIO_IMAGE = '/generate/image';
export const STUDIO_ALCHEMY = '/generate/alchemy';

/**
 * Where a URL naming nothing stows the name it named, so the index it is sent
 * to can say what happened rather than appearing for no reason. Navigation
 * state rather than the URL: the reader is being shown the index, and a query
 * string would leave them holding a link to a page that no longer says this.
 */
export const DOCS_UNKNOWN_ID_STATE = 'docsUnknownId';

/** The name a redirect stowed, on an arrival that came from one. */
export function readUnknownId(
  state: Record<string, unknown> | undefined,
): string | null {
  const named = state?.[DOCS_UNKNOWN_ID_STATE];
  return typeof named === 'string' && named !== '' ? named : null;
}

/** One setting's page in the reference. */
export function docsSettingLink(id: string): string {
  return `${DOCS_IMAGE_SETTINGS}/${id}`;
}

/** One technique's worked example. */
export function docsExampleLink(flowId: string): string {
  return `${DOCS_IMAGE_EXAMPLES}/${flowId}`;
}

/**
 * The place on the control types page where one mode is shown. The whole page
 * is one subject read group by group, so a mode is a place on it rather than a
 * page of its own.
 */
export function docsControlTypeAnchor(type: string): string {
  return `gs-ref-ctl-${type}`;
}

/** One thing alchemy is used for, and the forms that do it. */
export function docsAlchemyUseCaseLink(id: string): string {
  return `${DOCS_ALCHEMY}/${id}`;
}

/**
 * The band on the image landing that shelves every technique. There is no page
 * of tutorials on their own, so a surface offering all of them points here.
 * It is rendered as the section id in image-home.component.html.
 */
export const DOCS_IMAGE_EXAMPLES_ANCHOR = 'gs-learn-band-further';
