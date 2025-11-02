import { Component } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'app-homepage-guis',
  standalone: true,
  imports: [TranslocoModule],
  templateUrl: './homepage-guis.component.html',
  styleUrl: './homepage-guis.component.css',
})
export class HomepageGuisComponent {}
