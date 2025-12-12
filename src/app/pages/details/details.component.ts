import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-details',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe],
  templateUrl: './details.component.html',
  styleUrl: './details.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsComponent {}
