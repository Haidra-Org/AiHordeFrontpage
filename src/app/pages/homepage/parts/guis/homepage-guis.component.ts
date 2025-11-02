import { Component } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { BeginnerHeaderComponent } from '../../../../components/beginner-header/beginner-header.component';

@Component({
  selector: 'app-homepage-guis',
  standalone: true,
  imports: [TranslocoModule, BeginnerHeaderComponent],
  templateUrl: './homepage-guis.component.html',
  styleUrl: './homepage-guis.component.css',
})
export class HomepageGuisComponent {}
