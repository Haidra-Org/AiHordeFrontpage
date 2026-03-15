import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { InlineSvgComponent } from '../../../../components/inline-svg/inline-svg.component';
import { ScrollRevealDirective } from '../../../../directives/scroll-reveal.directive';

@Component({
  selector: 'app-homepage-sponsors',
  standalone: true,
  imports: [
    InlineSvgComponent,
    RouterLink,
    TranslocoPipe,
    ScrollRevealDirective,
  ],
  templateUrl: './homepage-sponsors.component.html',
  styleUrl: './homepage-sponsors.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomepageSponsorsComponent {}
