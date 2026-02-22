import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { InlineSvgComponent } from '../../../../components/inline-svg/inline-svg.component';
import { InfoTooltipComponent } from '../../../../components/info-tooltip/info-tooltip.component';

@Component({
  selector: 'app-homepage-quickstart',
  standalone: true,
  imports: [RouterLink, TranslocoPipe, TranslocoModule, InlineSvgComponent, InfoTooltipComponent],
  templateUrl: './homepage-quickstart.component.html',
  styleUrl: './homepage-quickstart.component.css',
})
export class HomepageQuickstartComponent {}
