import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { InlineSvgComponent } from '../../../components/inline-svg/inline-svg.component';

@Component({
  selector: 'app-donate',
  imports: [TranslocoPipe, InlineSvgComponent, RouterLink],
  templateUrl: './donate.component.html',
  styleUrl: './donate.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonateComponent {}
