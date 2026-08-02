import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../components/icon/icon.component';
import { GlossaryService } from '../../services/glossary.service';
import { DOCS_IMAGE } from '../../content/docs-links';

/**
 * The shared `/generate` workspace shell. Hosts the two studio tools — image
 * generation (`/generate/image`) and Alchemy (`/generate/alchemy`) — as subtabs
 * of one full-height page, with a slim tab bar above a router outlet. The tools
 * keep their own nav entries (they deep-link straight to each subtab); this
 * shell is what makes them feel like one page rather than two.
 */
@Component({
  selector: 'app-generate-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslocoPipe,
    IconComponent,
  ],
  templateUrl: './generate-shell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenerateShellComponent {
  /* The site's floating glossary controls are hidden on /generate (they overlap
     the studio's own on-canvas controls), so the shell carries the studio's
     only way into the glossary and its this-page map. */
  public readonly glossary = inject(GlossaryService);

  /* The studio's door into the documentation. It leaves the studio, so it is a
     link out rather than a third tool: the tab bar names what you can make. */
  public readonly docsLink = DOCS_IMAGE;
}
