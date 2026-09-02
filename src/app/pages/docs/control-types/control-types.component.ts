import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { GsAnchorLinkComponent } from '../../../components/gs-anchor-link/gs-anchor-link.component';
import {
  GsIndexRailComponent,
  GsIndexRailEntry,
} from '../../../components/gs-index-rail/gs-index-rail.component';
import {
  ControlWorldStrips,
  GsControlGalleryComponent,
} from '../../../components/gs-control-gallery/gs-control-gallery.component';
import { SECTION_IDENTITIES } from '../../../content/sections';
import {
  ANNOTATION_DETECTOR_GROUPS,
  annotationDetectorDescriptionKey,
  annotationDetectorNameKey,
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
 * One mode read on three examples rather than on one, and each of those on a
 * character, a building and a flat-colour drawing: a detector that holds a
 * photographed face says nothing about what it does to a shrine gate or to a
 * machine, and a reader choosing between thirty-three of them is choosing for
 * their own picture rather than for the library's.
 */
const GALLERY_WORLDS: readonly ControlWorldStrips[] = [
  {
    anchor: 'controlnet-gallery/deliberate/courier-ink',
    building: 'controlnet-gallery/deliberate/skyharbor-tower-ink',
    flat: 'controlnet-gallery/deliberate/skyharbor-poster-ink',
  },
  {
    anchor: 'controlnet-gallery/anything-diffusion/fox-shrine-ink',
    building: 'controlnet-gallery/anything-diffusion/shrine-gate-ink',
    flat: 'controlnet-gallery/anything-diffusion/shrine-gate-flat-ink',
  },
  {
    anchor: 'controlnet-gallery/deliberate/robot-gardener-ink',
    building: 'controlnet-gallery/deliberate/glasshouse-ink',
    flat: 'controlnet-gallery/deliberate/robot-gardener-flat-ink',
  },
];

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
}

/**
 * Every way a render can be held to a picture, and what each one keeps.
 *
 * The studio's control type picker offers thirty-three names in seven groups
 * and says one line about each. That is enough to choose between neighbours and
 * not enough to choose a group, because the difference between holding an
 * outline and holding a distance is something a reader has to see. So this is
 * one page rather than thirty-three: the modes in the picker's own grouping and
 * order, each shown as the render it produced.
 */
@Component({
  selector: 'app-docs-control-types',
  imports: [
    TranslocoPipe,
    RouterLink,
    IconComponent,
    GsAnchorLinkComponent,
    GsIndexRailComponent,
    GsControlGalleryComponent,
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

  /** The i18n key naming each mode aloud, which the layer heads itself with. */
  public readonly nameKeys: Readonly<Record<string, string>> =
    Object.fromEntries(
      ANNOTATION_DETECTOR_GROUPS.flatMap((group) =>
        group.types.map((type) => [type, annotationDetectorNameKey(type)]),
      ),
    );

  public readonly groups: readonly ControlGroup[] =
    ANNOTATION_DETECTOR_GROUPS.map((group) => ({
      id: group.id,
      sectionId: `gs-ref-sec-${group.id}`,
      labelKey: annotationGroupLabelKey(group.id),
      introKey: `generate.control_types.group_${group.id}`,
      types: group.types,
    }));

  /**
   * The groups as the contents rail names them. No glyph per line: every group
   * on this page belongs to the same part of the panel, so seven copies of one
   * mark would say nothing seven times.
   */
  public readonly railEntries: readonly GsIndexRailEntry[] = this.groups.map(
    (group) => ({
      id: group.id,
      labelKey: group.labelKey,
      hueClass: this.identity.className,
      targetId: group.sectionId,
    }),
  );

  /** Whether the rest of the introduction is open. Shut on arrival. */
  public readonly howOpen = signal(false);

  public toggleHow(): void {
    this.howOpen.update((open) => !open);
  }

  constructor() {
    setPageMeta({
      titleKey: 'generate.control_types.head',
      descriptionKey: 'generate.control_types.lead',
    });
  }
}
