import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { InlineSvgComponent } from '../../../components/inline-svg/inline-svg.component';

@Component({
  selector: 'app-joining',
  imports: [TranslocoPipe, InlineSvgComponent, RouterLink],
  templateUrl: './joining.component.html',
  styleUrl: './joining.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JoiningComponent {}
