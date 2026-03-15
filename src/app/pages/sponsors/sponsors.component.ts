import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-sponsors',
  standalone: true,
  imports: [],
  templateUrl: './sponsors.component.html',
  styleUrl: './sponsors.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SponsorsComponent {}
