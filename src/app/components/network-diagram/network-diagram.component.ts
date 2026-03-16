import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-network-diagram',
  imports: [TranslocoPipe, IconComponent],
  templateUrl: './network-diagram.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NetworkDiagramComponent {}
