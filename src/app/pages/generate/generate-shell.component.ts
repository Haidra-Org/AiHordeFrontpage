import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../components/icon/icon.component';

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
export class GenerateShellComponent {}
