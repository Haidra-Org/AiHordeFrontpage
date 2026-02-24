import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { InlineSvgComponent } from '../../../../components/inline-svg/inline-svg.component';

@Component({
  selector: 'app-homepage-sponsors',
  standalone: true,
  imports: [InlineSvgComponent, RouterLink, TranslocoPipe],
  templateUrl: './homepage-sponsors.component.html',
  styleUrl: './homepage-sponsors.component.css',
})
export class HomepageSponsorsComponent {}
