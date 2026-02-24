import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-network-diagram',
  imports: [TranslocoPipe],
  templateUrl: './network-diagram.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NetworkDiagramComponent {}
