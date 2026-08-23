import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';
import { GlossaryService } from '../../services/glossary.service';
import {
  DOCS_IMAGE,
  STUDIO_ALCHEMY,
  STUDIO_IMAGE,
} from '../../content/docs-links';

/**
 * The row of creation tools: the two studios and the documentation.
 *
 * These are page links rather than tabs: each one navigates, and one of the
 * three always leaves the shell it is drawn in. `aria-current` says which page
 * is on screen, which is the same thing the mark draws, so the state is stated
 * once and rendered once.
 *
 * One row, two shapes. Wide, it is an underline row above the page. Below
 * 1024px it is the bottom bar a phone reader already knows: three equal slots
 * under the thumb, icon over a short word. Each link carries the long name as
 * its accessible name, so the short word costs nothing to a reader who cannot
 * see the icon above it.
 *
 * The bar belongs to the reader rather than to one shell. Both the studio and
 * the documentation draw it, so the way between them stays under the thumb
 * wherever the reader is.
 */
@Component({
  selector: 'app-gs-tool-tabs',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe, IconComponent],
  template: `
    <nav
      class="gs-subtabs"
      [class.gs-subtabs--phone-only]="!wideRow()"
      [attr.aria-label]="'generate.shell.tabs_label' | transloco"
    >
      <!-- The pages scroll on their own so the glossary button beside them keeps
           its place and its whole width at any viewport: with the button inside
           the scrolling row, a narrow screen puts it past the right edge and it
           arrives half drawn. The bottom bar shares the width three ways
           instead, so nothing scrolls there and nothing is clipped. -->
      <div class="gs-subtabs-scroll">
        <a
          class="gs-subtab gs-subtab--image"
          [routerLink]="imageLink"
          routerLinkActive="gs-subtab--active"
          ariaCurrentWhenActive="page"
          [attr.aria-label]="'generate.shell.tab_image' | transloco"
        >
          <app-icon name="photo" class="gs-ico-sm" />
          <span class="gs-subtab-long" aria-hidden="true">
            {{ 'generate.shell.tab_image' | transloco }}
            <span class="gs-beta-chip">{{
              'generate.beta_badge' | transloco
            }}</span>
          </span>
          <span class="gs-subtab-short" aria-hidden="true">
            {{ 'generate.shell.tab_image_short' | transloco }}
          </span>
        </a>
        <a
          class="gs-subtab gs-subtab--alchemy"
          [routerLink]="alchemyLink"
          routerLinkActive="gs-subtab--active"
          ariaCurrentWhenActive="page"
          [attr.aria-label]="'generate.shell.tab_alchemy' | transloco"
        >
          <app-icon name="beaker" class="gs-ico-sm" />
          <span class="gs-subtab-long" aria-hidden="true">
            {{ 'generate.shell.tab_alchemy' | transloco }}
          </span>
          <span class="gs-subtab-short" aria-hidden="true">
            {{ 'generate.shell.tab_alchemy_short' | transloco }}
          </span>
        </a>
        <!-- The documentation. It stands for a whole area rather than the one
             page this link opens, so whether the reader is in it is answered by
             the shell that draws the row instead of by matching this URL. -->
        <a
          class="gs-subtab gs-subtab--docs"
          [class.gs-subtab--active]="docsCurrent()"
          [routerLink]="docsLink"
          [attr.aria-current]="docsCurrent() ? 'page' : null"
          [attr.aria-label]="'generate.shell.tab_docs' | transloco"
        >
          <app-icon name="document-text" class="gs-ico-sm" />
          <span class="gs-subtab-long" aria-hidden="true">
            {{ 'generate.shell.tab_docs' | transloco }}
          </span>
          <span class="gs-subtab-short" aria-hidden="true">
            {{ 'generate.shell.tab_docs_short' | transloco }}
          </span>
        </a>
      </div>
      <!-- The wide row's door into the glossary, which only the studio needs:
           the site's floating "?" is hidden there. A bottom bar holds the tools
           and nothing else, so below 1024px this stands down and each tool's own
           header row carries the "?" instead. -->
      @if (wideRow()) {
        <button
          type="button"
          class="gs-subtab-glossary"
          (click)="glossary.open()"
          [attr.aria-label]="'help.open_glossary' | transloco"
        >
          <app-icon name="question-mark-circle" class="gs-ico-sm" />
        </button>
      }
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GsToolTabsComponent {
  public readonly glossary = inject(GlossaryService);

  public readonly imageLink = STUDIO_IMAGE;
  public readonly alchemyLink = STUDIO_ALCHEMY;

  /* The door into the documentation opens on the image area, which is the
     larger of the two and the one a reader arriving without an area in mind is
     looking for. */
  public readonly docsLink = DOCS_IMAGE;

  /**
   * Whether the row is also drawn above the page on wide screens. False leaves
   * only the phone bottom bar, for a shell that carries chrome of its own up
   * there.
   */
  public readonly wideRow = input(true);

  /** Whether the documentation is the page the reader is on. */
  public readonly docsCurrent = input(false);
}
