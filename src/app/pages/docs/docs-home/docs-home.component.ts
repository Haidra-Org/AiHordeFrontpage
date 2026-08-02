import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../../components/icon/icon.component';
import { setPageMeta } from '../../../helper/page-meta';
import { DOCS_AREAS } from '../docs-shell/docs-shell.component';

/**
 * The documentation's front door: what there is to read, by the part of the
 * studio it is about.
 *
 * It lists areas rather than pages. A reader arriving here has come to find out
 * where something is written down, and the areas are the answer; each area's own
 * landing page is where the pages of it are offered.
 */
@Component({
  selector: 'app-docs-home',
  imports: [TranslocoPipe, RouterLink, IconComponent],
  templateUrl: './docs-home.component.html',
  host: {
    class: 'gs-docs-home',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsHomeComponent {
  public readonly areas = DOCS_AREAS;

  constructor() {
    setPageMeta({ titleKey: 'docs.title', descriptionKey: 'docs.lead' });
  }

  /** The one line under an area's name, which says what reading it answers. */
  public hintKey(areaId: string): string {
    return `docs.area_${areaId}_hint`;
  }
}
