import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { GsAnchorLinkComponent } from '../../../components/gs-anchor-link/gs-anchor-link.component';
import { GsControlGalleryComponent } from '../../../components/gs-control-gallery/gs-control-gallery.component';
import { GsSweepScrubComponent } from '../../../components/gs-sweep-scrub/gs-sweep-scrub.component';
import { SECTION_IDENTITIES } from '../../../content/sections';
import {
  ANNOTATION_DETECTOR_GROUPS,
  annotationDetectorDescriptionKey,
  annotationGroupLabelKey,
} from '../../../content/alchemy-usecases';
import {
  DOCS_IMAGE,
  STUDIO_IMAGE,
  docsExampleLink,
} from '../../../content/docs-links';
import { setPageMeta } from '../../../helper/page-meta';

/**
 * The published examples the gallery is cut from, world one first.
 *
 * One mode read on three worlds rather than on one: a detector that holds a
 * photographed face says nothing about what it does to a shrine gate or to a
 * machine, and a reader choosing between thirty-three of them is choosing for
 * their own picture rather than for the library's.
 */
const GALLERY_WORLDS: readonly string[] = [
  'controlnet-gallery/deliberate/courier-ink',
  'controlnet-gallery/anything-diffusion/fox-shrine-ink',
  'controlnet-gallery/deliberate/robot-gardener-ink',
];

/**
 * The mode each group's strength strip was rendered against.
 *
 * The dial is the same field whichever mode is in play, and what changes is how
 * hard that kind of map can pull. So each group is read against the one of its
 * own members the library swept, rather than against a single strip standing in
 * for all seven kinds of guidance.
 */
const GROUP_STRENGTH_TYPE: Readonly<Record<string, string>> = {
  edges: 'canny',
  lines: 'mlsd',
  depth: 'depth_anything_v2',
  surface: 'normal_bae',
  pose: 'openpose',
  regions: 'oneformer_ade20k',
  colour: 'tile',
};

/**
 * The further line a mode carries beyond what it reads.
 *
 * `hough` is the older spelling of `mlsd` and the horde still accepts it, so it
 * is said on the mlsd tile rather than given a tile of its own: two tiles of the
 * same detector would be a reader's first wrong choice.
 */
const CONTROL_TYPE_NOTES: Readonly<Record<string, string>> = {
  mlsd: 'generate.control_types.note_hough',
};

/** One group of guidance modes, as the page reads it. */
interface ControlGroup {
  id: string;
  sectionId: string;
  labelKey: string;
  introKey: string;
  types: readonly string[];
  /** The mode the group's strength strip was swept against, if one was. */
  strengthType: string | null;
}

/**
 * Every way a render can be held to a picture, and what each one keeps.
 *
 * The studio's control type picker offers thirty-three names in seven groups
 * and says one line about each. That is enough to choose between neighbours and
 * not enough to choose a group, because the difference between holding an
 * outline and holding a distance is something a reader has to see. So this is
 * one page rather than thirty-three: the modes in the picker's own grouping and
 * order, each shown as the render it produced, and each group read against the
 * strength dial that decides how hard its kind of map pulls.
 */
@Component({
  selector: 'app-docs-control-types',
  imports: [
    TranslocoPipe,
    RouterLink,
    IconComponent,
    GsAnchorLinkComponent,
    GsControlGalleryComponent,
    GsSweepScrubComponent,
  ],
  templateUrl: './control-types.component.html',
  host: {
    class: 'gs-ref-page',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsControlTypesComponent {
  public readonly indexLink = DOCS_IMAGE;
  public readonly studioLink = STUDIO_IMAGE;
  public readonly lessonLink = docsExampleLink('controlnet');
  public readonly identity = SECTION_IDENTITIES.source;

  public readonly worlds = GALLERY_WORLDS;
  public readonly noteKeys = CONTROL_TYPE_NOTES;

  /** The i18n key describing each mode, which is the picker's own line. */
  public readonly descriptionKeys: Readonly<Record<string, string>> =
    Object.fromEntries(
      ANNOTATION_DETECTOR_GROUPS.flatMap((group) =>
        group.types.map((type) => [
          type,
          annotationDetectorDescriptionKey(type),
        ]),
      ),
    );

  public readonly groups: readonly ControlGroup[] =
    ANNOTATION_DETECTOR_GROUPS.map((group) => ({
      id: group.id,
      sectionId: `gs-ref-sec-${group.id}`,
      labelKey: annotationGroupLabelKey(group.id),
      introKey: `generate.control_types.group_${group.id}`,
      types: group.types,
      strengthType: GROUP_STRENGTH_TYPE[group.id] ?? null,
    }));

  constructor() {
    setPageMeta({
      titleKey: 'generate.control_types.head',
      descriptionKey: 'generate.control_types.lead',
    });
  }
}
