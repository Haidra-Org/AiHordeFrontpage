import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { InlineSvgComponent } from '../inline-svg/inline-svg.component';

@Component({
  selector: 'app-mission-callout',
  imports: [TranslocoPipe, InlineSvgComponent, RouterLink],
  templateUrl: './mission-callout.component.html',
  styleUrl: './mission-callout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionCalloutComponent {}
