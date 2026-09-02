import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GsAnchorLinkComponent } from '../../../components/gs-anchor-link/gs-anchor-link.component';
import { GsDoorComponent } from '../../../components/gs-door/gs-door.component';
import { IconComponent } from '../../../components/icon/icon.component';
import { SECTION_IDENTITIES } from '../../../content/sections';
import {
  ALCHEMY_USE_CASES,
  alchemyUseCaseLeadKey,
  alchemyUseCaseTitleKey,
} from '../../../content/alchemy-usecases';
import {
  STUDIO_ALCHEMY,
  docsAlchemyUseCaseLink,
} from '../../../content/docs-links';
import { AlchemyEvidenceService } from '../../../services/alchemy-evidence.service';
import { setPageMeta } from '../../../helper/page-meta';

/** The use case a reader with no history here is pointed at first. */
const START_USE_CASE = 'enlarge';

/** One card of the landing: a thing the studio is used for. */
interface UseCaseCard {
  id: string;
  titleKey: string;
  leadKey: string;
  link: string;
  icon: string;
  formCount: number;
  /** A frame from what was published for it, or null while nothing has been. */
  thumb: string | null;
}

/**
 * The alchemy area's front door: the four things the studio is used for, and
 * how many of its twenty-four forms do each.
 *
 * The cards are the use cases rather than the forms, for the same reason the
 * panel groups them: nobody arrives wanting `4xNomos2_hq_dat2`, they arrive
 * wanting a bigger picture. Which form does it is the second question, and it
 * is answered on the page that card leads to.
 */
@Component({
  selector: 'app-docs-alchemy-home',
  imports: [
    TranslocoPipe,
    RouterLink,
    GsAnchorLinkComponent,
    GsDoorComponent,
    IconComponent,
  ],
  templateUrl: './alchemy-home.component.html',
  host: {
    class: 'gs-ref-index',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsAlchemyHomeComponent {
  private readonly evidence = inject(AlchemyEvidenceService);
  private readonly router = inject(Router);

  public readonly identity = SECTION_IDENTITIES.alchemy;

  /**
   * The page the landing sends a reader to first. Enlarging is what most people
   * arrive for, and the other four are read the same way once one of them has
   * been.
   */
  public readonly startLink = docsAlchemyUseCaseLink(START_USE_CASE);

  public readonly cards = computed<readonly UseCaseCard[]>(() =>
    ALCHEMY_USE_CASES.map((useCase) => ({
      id: useCase.id,
      titleKey: alchemyUseCaseTitleKey(useCase.id),
      leadKey: alchemyUseCaseLeadKey(useCase.id),
      link: docsAlchemyUseCaseLink(useCase.id),
      icon: useCase.icon,
      formCount: useCase.forms.length,
      thumb: this.thumbFor(useCase.id),
    })),
  );

  constructor() {
    setPageMeta({
      titleKey: 'alchemy.usecases.head',
      descriptionKey: 'alchemy.usecases.lead',
    });
    void this.evidence.ensureLoaded();
  }

  /** The studio itself, which is the only place any of this is actually done. */
  public openStudio(): void {
    void this.router.navigateByUrl(STUDIO_ALCHEMY);
  }

  /**
   * The picture a card leads with: what the first published run of that use case
   * produced, or the source it started from where it produced words rather than
   * a picture. Null until the library has published something, which every card
   * has to look finished without.
   */
  private thumbFor(useCase: string): string | null {
    const entry = this.evidence.entriesFor(useCase)[0];
    if (!entry) {
      return null;
    }
    return this.evidence.assetUrl(entry.files.result ?? entry.files.source);
  }
}
