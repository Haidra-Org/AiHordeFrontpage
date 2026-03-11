import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { InlineSvgComponent } from '../../../../components/inline-svg/inline-svg.component';
import { InfoTooltipComponent } from '../../../../components/info-tooltip/info-tooltip.component';
import { KudosTermComponent } from '../../../../components/kudos-term/kudos-term.component';
import { ScrollRevealDirective } from '../../../../directives/scroll-reveal.directive';

@Component({
  selector: 'app-homepage-quickstart',
  imports: [
    RouterLink,
    TranslocoPipe,
    TranslocoModule,
    InlineSvgComponent,
    InfoTooltipComponent,
    KudosTermComponent,
    ScrollRevealDirective,
  ],
  templateUrl: './homepage-quickstart.component.html',
  styleUrl: './homepage-quickstart.component.css',
})
export class HomepageQuickstartComponent {}
