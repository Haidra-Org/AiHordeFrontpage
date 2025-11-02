import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { InlineSvgComponent } from '../../../../components/inline-svg/inline-svg.component';

@Component({
  selector: 'app-homepage-quickstart',
  standalone: true,
  imports: [RouterLink, TranslocoPipe, TranslocoModule, InlineSvgComponent],
  templateUrl: './homepage-quickstart.component.html',
  styleUrl: './homepage-quickstart.component.css',
})
export class HomepageQuickstartComponent {}
