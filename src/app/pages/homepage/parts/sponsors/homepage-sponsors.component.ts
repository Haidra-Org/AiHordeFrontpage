import { Component } from '@angular/core';
import { InlineSvgComponent } from '../../../../components/inline-svg/inline-svg.component';

@Component({
  selector: 'app-homepage-sponsors',
  standalone: true,
  imports: [InlineSvgComponent],
  templateUrl: './homepage-sponsors.component.html',
  styleUrl: './homepage-sponsors.component.css',
})
export class HomepageSponsorsComponent {}
