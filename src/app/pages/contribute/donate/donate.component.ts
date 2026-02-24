import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MissionCalloutComponent } from '../../../components/mission-callout/mission-callout.component';

@Component({
  selector: 'app-donate',
  imports: [TranslocoPipe, RouterLink, MissionCalloutComponent],
  templateUrl: './donate.component.html',
  styleUrl: './donate.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonateComponent {}
