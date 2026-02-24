import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MissionCalloutComponent } from '../../../components/mission-callout/mission-callout.component';

@Component({
  selector: 'app-joining',
  imports: [TranslocoPipe, RouterLink, MissionCalloutComponent],
  templateUrl: './joining.component.html',
  styleUrl: './joining.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JoiningComponent {}
